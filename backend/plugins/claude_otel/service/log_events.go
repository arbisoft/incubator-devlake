/*
Licensed to the Apache Software Foundation (ASF) under one or more
contributor license agreements.  See the NOTICE file distributed with
this work for additional information regarding copyright ownership.
The ASF licenses this file to You under the Apache License, Version 2.0
(the "License"); you may not use this file except in compliance with
the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package service

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	collectorlogs "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	logsv1 "go.opentelemetry.io/proto/otlp/logs/v1"
)

const (
	eventNamePrefix = "claude_code."

	eventUserPrompt            = "user_prompt"
	eventAPIRequest            = "api_request"
	eventAPIError              = "api_error"
	eventToolResult            = "tool_result"
	eventToolDecision          = "tool_decision"
	eventSkillActivated        = "skill_activated"
	eventPermissionModeChanged = "permission_mode_changed"
)

// preparedEvent is one converted log record plus the connection binding it requires.
type preparedEvent struct {
	event      *models.OtelEvent
	connection *models.OtelConnection
}

// preparedLogBatch holds a log batch's events plus the same bounded diagnostics as metrics.
type preparedLogBatch struct {
	preparedBatch
	events []preparedEvent
}

func (c *rawMetricConverter) prepareEvents(request *collectorlogs.ExportLogsServiceRequest, batchID uint64) (*preparedLogBatch, error) {
	preparer := &batchPreparer{
		converter:        c,
		connections:      make(map[string][]*models.OtelConnection),
		pendingBindings:  make(map[uint64]string),
		unknownMetricSet: make(map[string]struct{}),
	}
	result := &preparedLogBatch{}
	for _, resourceLogs := range request.GetResourceLogs() {
		resourceBindings := make(map[uint64]string)
		events, err := preparer.prepareLogResource(resourceLogs, resourceBindings, batchID)
		if err == nil {
			result.events = append(result.events, events...)
			for connectionID, organizationID := range resourceBindings {
				preparer.pendingBindings[connectionID] = organizationID
			}
			continue
		}
		conversionErr, attribution := attributionError(err)
		if !attribution {
			return nil, err
		}
		preparer.recordSkip(conversionErr)
	}
	result.preparedBatch = preparer.result
	return result, nil
}

// prepareLogResource converts one resource group. As for metrics, any attribution failure
// discards the whole group.
func (p *batchPreparer) prepareLogResource(resourceLogs *logsv1.ResourceLogs, resourceBindings map[uint64]string, batchID uint64) ([]preparedEvent, error) {
	resourceAttrs := resourceLogs.GetResource().GetAttributes()
	if hasAttribute(resourceAttrs, devlakeTeamAttribute) || hasAttribute(resourceAttrs, devlakeProjectAttribute) {
		return nil, permanentMetricError(errorInvalidAttribution, "OTLP logs resource must not include DevLake attribution")
	}
	events := make([]preparedEvent, 0)
	teamSlug := ""
	for _, record := range resourceLogRecords(resourceLogs) {
		recordAttrs := record.GetAttributes()
		if hasAttribute(recordAttrs, devlakeProjectAttribute) {
			return nil, permanentMetricError(errorInvalidAttribution, "OTLP log record must not include devlake_project attribution")
		}
		team := attributeString(recordAttrs, devlakeTeamAttribute)
		if team == "" {
			return nil, permanentMetricError(errorMissingTeam, "OTLP log record is missing trusted devlake_team attribution")
		}
		if teamSlug != "" && team != teamSlug {
			return nil, permanentMetricError(errorInvalidAttribution, "OTLP logs resource has inconsistent trusted devlake_team attribution")
		}
		teamSlug = team
		event, connection, err := p.prepareLogRecord(team, resourceAttrs, record, resourceBindings)
		if err != nil {
			return nil, err
		}
		event.RawBatchId = batchID
		events = append(events, preparedEvent{event: event, connection: connection})
	}
	return events, nil
}

func (p *batchPreparer) prepareLogRecord(teamSlug string, resourceAttrs []*commonv1.KeyValue, record *logsv1.LogRecord, resourceBindings map[uint64]string) (*models.OtelEvent, *models.OtelConnection, error) {
	recordAttrs := record.GetAttributes()
	observedAt, err := logRecordTime(record)
	if err != nil {
		return nil, nil, permanentMetricError(errorInvalidTimestamp, "OTLP log record has an invalid timestamp")
	}
	connection, err := p.resolveConnection(teamSlug, observedAt)
	if err != nil {
		return nil, nil, err
	}
	organizationID, err := organizationIDFromAttributes(resourceAttrs, recordAttrs)
	if err != nil {
		return nil, nil, err
	}
	if err := p.checkOrganizationBinding(connection, organizationID, resourceBindings); err != nil {
		return nil, nil, err
	}
	identity, err := identityFromAttributes(recordAttrs)
	if err != nil {
		return nil, nil, err
	}
	attributes := mergedAttributeMap(resourceAttrs, recordAttrs)
	// Prompt text gets its own column so the attributes JSON stays small to query.
	promptText, _ := attributes[promptTextAttribute].(string)
	delete(attributes, promptTextAttribute)
	encoded, err := json.Marshal(attributes)
	if err != nil {
		return nil, nil, permanentMetricError(errorInvalidValue, "OTLP log record attributes cannot be encoded")
	}
	event := &models.OtelEvent{
		ConnectionId:        connection.ID,
		TeamSlug:            connection.TeamSlug,
		OrganizationId:      organizationID,
		UserKey:             identity.key,
		UserAccountId:       identity.accountID,
		UserAccountUUID:     identity.accountUUID,
		UserEmail:           identity.email,
		SessionId:           attributeString(recordAttrs, "session.id"),
		PromptId:            attributeString(recordAttrs, "prompt.id"),
		EventName:           logEventName(record),
		EventSequence:       attributeInt(recordAttrs, "event.sequence"),
		EventTimestamp:      observedAt,
		AppVersion:          firstNonEmpty(attributeString(recordAttrs, "app.version"), attributeString(resourceAttrs, "service.version")),
		TerminalType:        attributeString(recordAttrs, "terminal.type"),
		Model:               attributeString(recordAttrs, "model"),
		ToolName:            attributeString(recordAttrs, "tool_name"),
		SkillName:           firstNonEmpty(attributeString(recordAttrs, "skill.name"), toolParameter(attributes, "skill_name")),
		AgentName:           attributeString(recordAttrs, "agent.name"),
		PluginName:          attributeString(recordAttrs, "plugin.name"),
		McpServerName:       firstNonEmpty(attributeString(recordAttrs, "mcp_server.name"), toolParameter(attributes, "mcp_server_name")),
		QuerySource:         attributeString(recordAttrs, "query_source"),
		Success:             attributeBool(recordAttrs, "success"),
		DurationMs:          attributeInt(recordAttrs, "duration_ms"),
		CostUsd:             attributeDecimal(recordAttrs, "cost_usd", 8),
		InputTokens:         int64Value(attributeInt(recordAttrs, "input_tokens")),
		OutputTokens:        int64Value(attributeInt(recordAttrs, "output_tokens")),
		CacheReadTokens:     int64Value(attributeInt(recordAttrs, "cache_read_tokens")),
		CacheCreationTokens: int64Value(attributeInt(recordAttrs, "cache_creation_tokens")),
		Attributes:          encoded,
	}
	if event.EventName == eventUserPrompt && promptText != "" {
		event.PromptText = &promptText
	}
	if event.EventName == "" {
		return nil, nil, permanentMetricError(errorInvalidDimension, "OTLP log record has no event name")
	}
	event.EventKey = otelEventKey(event, attributeString(recordAttrs, "tool_use_id"), attributeString(recordAttrs, "request_id"))
	return event, connection, nil
}

// otelEventKey identifies one emitted event, so a replayed or re-exported record updates
// the row it already produced.
func otelEventKey(event *models.OtelEvent, toolUseID, requestID string) []byte {
	sequence := ""
	if event.EventSequence != nil {
		sequence = strconv.FormatInt(*event.EventSequence, 10)
	}
	parts := []string{
		strconv.FormatUint(event.ConnectionId, 10), event.UserKey, event.SessionId, event.EventName, sequence,
		strconv.FormatInt(event.EventTimestamp.UnixNano(), 10), event.PromptId, toolUseID, requestID,
	}
	hash := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hash[:]
}

// logEventName returns the event name without the claude_code. prefix. Claude Code sends
// it as the event.name attribute and as the record body.
func logEventName(record *logsv1.LogRecord) string {
	name := attributeString(record.GetAttributes(), "event.name")
	if name == "" {
		name = strings.TrimSpace(record.GetBody().GetStringValue())
	}
	return strings.TrimPrefix(name, eventNamePrefix)
}

// logRecordTime prefers the client's event.timestamp, then the record and observed times.
func logRecordTime(record *logsv1.LogRecord) (time.Time, error) {
	if value := attributeString(record.GetAttributes(), "event.timestamp"); value != "" {
		if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
			return parsed.UTC(), nil
		}
	}
	if record.GetTimeUnixNano() != 0 {
		return unixNanoTime(record.GetTimeUnixNano())
	}
	return unixNanoTime(record.GetObservedTimeUnixNano())
}

// mergedAttributeMap returns every resource and record attribute as JSON-ready values.
// Record attributes win on a key collision. tool_parameters is a JSON string and is
// stored parsed so it can be queried.
func mergedAttributeMap(resourceAttrs, recordAttrs []*commonv1.KeyValue) map[string]interface{} {
	values := make(map[string]interface{}, len(resourceAttrs)+len(recordAttrs))
	for _, attribute := range resourceAttrs {
		values[attribute.GetKey()] = anyValue(attribute.GetValue())
	}
	for _, attribute := range recordAttrs {
		values[attribute.GetKey()] = anyValue(attribute.GetValue())
	}
	if raw, ok := values["tool_parameters"].(string); ok {
		var parsed interface{}
		if json.Unmarshal([]byte(raw), &parsed) == nil {
			values["tool_parameters"] = parsed
		}
	}
	return values
}

func anyValue(value *commonv1.AnyValue) interface{} {
	switch typed := value.GetValue().(type) {
	case *commonv1.AnyValue_StringValue:
		return typed.StringValue
	case *commonv1.AnyValue_BoolValue:
		return typed.BoolValue
	case *commonv1.AnyValue_IntValue:
		return typed.IntValue
	case *commonv1.AnyValue_DoubleValue:
		if math.IsNaN(typed.DoubleValue) || math.IsInf(typed.DoubleValue, 0) {
			return nil
		}
		return typed.DoubleValue
	case *commonv1.AnyValue_BytesValue:
		return base64.StdEncoding.EncodeToString(typed.BytesValue)
	case *commonv1.AnyValue_ArrayValue:
		items := make([]interface{}, 0, len(typed.ArrayValue.GetValues()))
		for _, item := range typed.ArrayValue.GetValues() {
			items = append(items, anyValue(item))
		}
		return items
	case *commonv1.AnyValue_KvlistValue:
		values := make(map[string]interface{}, len(typed.KvlistValue.GetValues()))
		for _, item := range typed.KvlistValue.GetValues() {
			values[item.GetKey()] = anyValue(item.GetValue())
		}
		return values
	default:
		return nil
	}
}

// toolParameter reads one field of the parsed tool_parameters attribute.
func toolParameter(attributes map[string]interface{}, key string) string {
	parameters, ok := attributes["tool_parameters"].(map[string]interface{})
	if !ok {
		return ""
	}
	value, _ := parameters[key].(string)
	return strings.TrimSpace(value)
}

// attributeInt reads an integer attribute that Claude Code may send as an int, a double
// or a numeric string.
func attributeInt(attributes []*commonv1.KeyValue, key string) *int64 {
	for _, attribute := range attributes {
		if attribute.GetKey() != key {
			continue
		}
		switch typed := attribute.GetValue().GetValue().(type) {
		case *commonv1.AnyValue_IntValue:
			return &typed.IntValue
		case *commonv1.AnyValue_DoubleValue:
			if math.IsNaN(typed.DoubleValue) || math.IsInf(typed.DoubleValue, 0) || math.Abs(typed.DoubleValue) >= math.MaxInt64 {
				return nil
			}
			value := int64(typed.DoubleValue)
			return &value
		case *commonv1.AnyValue_StringValue:
			if value, err := strconv.ParseFloat(strings.TrimSpace(typed.StringValue), 64); err == nil && !math.IsInf(value, 0) && math.Abs(value) < math.MaxInt64 {
				result := int64(value)
				return &result
			}
		}
		return nil
	}
	return nil
}

func attributeBool(attributes []*commonv1.KeyValue, key string) *bool {
	for _, attribute := range attributes {
		if attribute.GetKey() != key {
			continue
		}
		switch typed := attribute.GetValue().GetValue().(type) {
		case *commonv1.AnyValue_BoolValue:
			return &typed.BoolValue
		case *commonv1.AnyValue_StringValue:
			if value, err := strconv.ParseBool(strings.TrimSpace(typed.StringValue)); err == nil {
				return &value
			}
		}
		return nil
	}
	return nil
}

// attributeDecimal reads a non-negative number as a fixed-scale decimal string.
func attributeDecimal(attributes []*commonv1.KeyValue, key string, scale int) *string {
	for _, attribute := range attributes {
		if attribute.GetKey() != key {
			continue
		}
		var value float64
		switch typed := attribute.GetValue().GetValue().(type) {
		case *commonv1.AnyValue_DoubleValue:
			value = typed.DoubleValue
		case *commonv1.AnyValue_IntValue:
			value = float64(typed.IntValue)
		case *commonv1.AnyValue_StringValue:
			parsed, err := strconv.ParseFloat(strings.TrimSpace(typed.StringValue), 64)
			if err != nil {
				return nil
			}
			value = parsed
		default:
			return nil
		}
		if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 || value >= 1e12 {
			return nil
		}
		formatted := fmt.Sprintf("%.*f", scale, value)
		return &formatted
	}
	return nil
}

func int64Value(value *int64) int64 {
	if value == nil || *value < 0 {
		return 0
	}
	return *value
}
