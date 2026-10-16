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
	"unicode/utf8"

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

// Typed event column widths in characters, from models.OtelEvent.
const (
	eventIDColumnLength      = 128 // session_id, prompt_id
	eventNameColumnLength    = 100
	eventVersionColumnLength = 64  // app_version
	eventLabelColumnLength   = 100 // terminal_type, query_source
	eventNamedColumnLength   = 255 // model, tool, skill, agent, plugin, MCP server and command names
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

func (c *rawConverter) prepareEvents(request *collectorlogs.ExportLogsServiceRequest, batchID uint64) (*preparedLogBatch, error) {
	preparer := c.newBatchPreparer()
	result := &preparedLogBatch{}
	resources := request.GetResourceLogs()
	err := preparer.prepareResources(len(resources), func(i int, bindings map[uint64]string) error {
		events, err := preparer.prepareLogResource(resources[i], bindings, batchID)
		if err != nil {
			return err
		}
		result.events = append(result.events, events...)
		return nil
	})
	if err != nil {
		return nil, err
	}
	result.preparedBatch = preparer.result
	return result, nil
}

// prepareLogResource converts one resource group. As for metrics, an attribution failure
// discards the whole group. A record with bad data, such as no user identity, event name
// or organization.id, is skipped on its own.
func (p *batchPreparer) prepareLogResource(resourceLogs *logsv1.ResourceLogs, resourceBindings map[uint64]string, batchID uint64) ([]preparedEvent, error) {
	resourceAttrs := resourceLogs.GetResource().GetAttributes()
	records := resourceLogRecords(resourceLogs)
	team, err := validateAttribution(logsSignal, resourceAttrs, records)
	if err != nil {
		return nil, err
	}
	events := make([]preparedEvent, 0)
	for _, record := range records {
		event, connection, err := p.prepareLogRecord(team, resourceAttrs, record, resourceBindings)
		if err != nil {
			if conversionErr, skip := conversionErrorIn(err, logRecordErrorCodes); skip {
				p.recordSkip(skippedLogRecord, conversionErr)
				continue
			}
			return nil, err
		}
		event.RawBatchId = batchID
		events = append(events, preparedEvent{event: event, connection: connection})
	}
	return events, nil
}

func (p *batchPreparer) prepareLogRecord(teamSlug string, resourceAttrs []*commonv1.KeyValue, record *logsv1.LogRecord, resourceBindings map[uint64]string) (*models.OtelEvent, *models.OtelConnection, error) {
	recordAttrs := record.GetAttributes()
	eventName := logEventName(record)
	if eventName == "" {
		return nil, nil, permanentConversionError(errorInvalidDimension, "OTLP log record has no event name")
	}
	observedAt, err := logRecordTime(record)
	if err != nil {
		return nil, nil, permanentConversionError(errorInvalidTimestamp, "OTLP log record has an invalid timestamp")
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
	if err := checkIdentityLengths(identity); err != nil {
		return nil, nil, err
	}
	attributes := mergedAttributeMap(resourceAttrs, recordAttrs)
	// Prompt text gets its own column so the attributes JSON stays small to query.
	promptText, _ := attributes[promptTextAttribute].(string)
	encoded, err := json.Marshal(storedAttributes(attributes))
	if err != nil {
		return nil, nil, permanentConversionError(errorInvalidValue, "OTLP log record attributes cannot be encoded")
	}
	event := eventFromRecord(resourceAttrs, recordAttrs, attributes)
	event.ConnectionId = connection.ID
	event.TeamSlug = connection.TeamSlug
	event.OrganizationId = organizationID
	event.UserKey = identity.key
	event.UserAccountId = identity.accountID
	event.UserAccountUUID = identity.accountUUID
	event.UserEmail = identity.email
	event.EventName = eventName
	event.EventTimestamp = observedAt
	event.Attributes = encoded
	if event.EventName == eventUserPrompt && promptText != "" {
		event.PromptText = &promptText
	}
	if err := checkEventKeyLengths(event); err != nil {
		return nil, nil, err
	}
	event.EventKey = otelEventKey(event, attributeString(recordAttrs, "tool_use_id"), attributeString(recordAttrs, "request_id"))
	return event, connection, nil
}

// checkEventKeyLengths rejects a record whose session, prompt or event name does not fit
// its column. Truncating them could merge different sessions or prompts, so the record is
// skipped on its own rather than letting MySQL reject, and quarantine, the whole batch.
// The user identity is checked by checkIdentityLengths.
func checkEventKeyLengths(event *models.OtelEvent) error {
	for _, field := range []struct {
		name  string
		value string
		width int
	}{
		{"session.id", event.SessionId, eventIDColumnLength},
		{"prompt.id", event.PromptId, eventIDColumnLength},
		{"event.name", event.EventName, eventNameColumnLength},
	} {
		if utf8.RuneCountInString(field.value) > field.width {
			return permanentConversionError(errorValueTooLong, "OTLP log record %s is longer than %d characters", field.name, field.width)
		}
	}
	return nil
}

// eventFromRecord maps a log record's attributes to the event's typed columns. attributes
// is the merged resource and record map, which carries the decoded tool parameters.
// Descriptive columns are truncated to their width; the full value stays in attributes.
func eventFromRecord(resourceAttrs, recordAttrs []*commonv1.KeyValue, attributes map[string]interface{}) *models.OtelEvent {
	return &models.OtelEvent{
		SessionId:           attributeString(recordAttrs, "session.id"),
		PromptId:            attributeString(recordAttrs, "prompt.id"),
		EventSequence:       attributeInt(recordAttrs, "event.sequence"),
		AppVersion:          truncate(firstNonEmpty(attributeString(recordAttrs, "app.version"), attributeString(resourceAttrs, "service.version")), eventVersionColumnLength),
		TerminalType:        truncate(attributeString(recordAttrs, "terminal.type"), eventLabelColumnLength),
		Model:               truncate(attributeString(recordAttrs, "model"), eventNamedColumnLength),
		ToolName:            truncate(attributeString(recordAttrs, "tool_name"), eventNamedColumnLength),
		SkillName:           truncate(firstNonEmpty(attributeString(recordAttrs, "skill.name"), toolParameter(attributes, "skill_name")), eventNamedColumnLength),
		AgentName:           truncate(attributeString(recordAttrs, "agent.name"), eventNamedColumnLength),
		PluginName:          truncate(attributeString(recordAttrs, "plugin.name"), eventNamedColumnLength),
		McpServerName:       truncate(firstNonEmpty(attributeString(recordAttrs, "mcp_server.name"), toolParameter(attributes, "mcp_server_name")), eventNamedColumnLength),
		QuerySource:         truncate(attributeString(recordAttrs, "query_source"), eventLabelColumnLength),
		CommandName:         truncate(attributeString(recordAttrs, "command_name"), eventNamedColumnLength),
		Success:             attributeBool(recordAttrs, "success"),
		DurationMs:          attributeInt(recordAttrs, "duration_ms"),
		CostUsd:             attributeDecimal(recordAttrs, "cost_usd", 8),
		InputTokens:         int64Value(attributeInt(recordAttrs, "input_tokens")),
		OutputTokens:        int64Value(attributeInt(recordAttrs, "output_tokens")),
		CacheReadTokens:     int64Value(attributeInt(recordAttrs, "cache_read_tokens")),
		CacheCreationTokens: int64Value(attributeInt(recordAttrs, "cache_creation_tokens")),
	}
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
	putAttributes(values, resourceAttrs)
	putAttributes(values, recordAttrs)
	if raw, ok := values["tool_parameters"].(string); ok {
		var parsed interface{}
		if json.Unmarshal([]byte(raw), &parsed) == nil {
			values["tool_parameters"] = parsed
		}
	}
	return values
}

// storedEventAttributes are the attributes kept in an event's attributes column: Claude
// Code's documented event and resource attributes that carry no content. The column is
// kept as long as the event, so it is an allowlist: an attribute a later Claude Code
// release adds, which might carry content, is dropped until it is reviewed and listed
// here. The raw batch keeps it until raw retention. prompt_text has its own column.
var storedEventAttributes = map[string]struct{}{
	// Resource and standard attributes.
	"service.name": {}, "service.version": {}, "os.type": {}, "os.version": {}, "host.arch": {},
	"session.id": {}, "app.version": {}, "organization.id": {}, "terminal.type": {},
	"user.id": {}, "user.account_id": {}, "user.account_uuid": {}, "user.email": {},
	"prompt.id": {}, "event.name": {}, "event.timestamp": {}, "event.sequence": {},
	devlakeTeamAttribute: {},
	// Repository identity under OTEL_METRICS_INCLUDE_REPOSITORY, from the origin remote with
	// credentials stripped.
	repositoryURLAttribute: {}, "vcs.owner.name": {}, "vcs.repository.name": {}, "vcs.provider.name": {},
	// user_prompt.
	"prompt_length": {}, "command_name": {}, "command_source": {},
	// api_request and api_error. On api_error, error is a service message; ingest drops
	// the tool_result error, which can echo file contents.
	"model": {}, "cost_usd": {}, "duration_ms": {}, "input_tokens": {}, "output_tokens": {},
	"cache_read_tokens": {}, "cache_creation_tokens": {}, "request_id": {}, "query_source": {},
	"speed": {}, "error": {}, "error_type": {}, "status_code": {}, "attempt": {}, "response_length": {},
	// tool_result and tool_decision. tool_parameters keeps only toolParameterKeys.
	"tool_name": {}, "tool_use_id": {}, "success": {}, "decision": {}, "source": {},
	"decision_type": {}, "decision_source": {}, "tool_result_size_bytes": {},
	toolParametersAttribute: {}, "mcp_server_scope": {},
	// skill_activated and other named components.
	"skill.name": {}, "skill.source": {}, "invocation_trigger": {}, "plugin.name": {},
	"agent.name": {}, "mcp_server.name": {},
	// permission_mode_changed.
	"from_mode": {}, "to_mode": {}, "trigger": {},
}

// storedAttributes returns the allowlisted subset of attributes.
func storedAttributes(attributes map[string]interface{}) map[string]interface{} {
	stored := make(map[string]interface{}, len(attributes))
	for key, value := range attributes {
		if _, keep := storedEventAttributes[key]; keep {
			stored[key] = value
		}
	}
	return stored
}

// putAttributes adds attributes to values as JSON-ready values, replacing existing keys.
func putAttributes(values map[string]interface{}, attributes []*commonv1.KeyValue) {
	for _, attribute := range attributes {
		values[attribute.GetKey()] = anyValue(attribute.GetValue())
	}
}

// anyValue converts one OTLP value to its JSON form. The switch covers each case of the
// AnyValue oneof.
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
		putAttributes(values, typed.KvlistValue.GetValues())
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

// attributeValue returns the value of the first attribute named key, or nil.
func attributeValue(attributes []*commonv1.KeyValue, key string) *commonv1.AnyValue {
	for _, attribute := range attributes {
		if attribute.GetKey() == key {
			return attribute.GetValue()
		}
	}
	return nil
}

// numberValue reads a finite number that Claude Code may send as an int, a double or a
// numeric string.
func numberValue(value *commonv1.AnyValue) (float64, bool) {
	var number float64
	switch typed := value.GetValue().(type) {
	case *commonv1.AnyValue_IntValue:
		number = float64(typed.IntValue)
	case *commonv1.AnyValue_DoubleValue:
		number = typed.DoubleValue
	case *commonv1.AnyValue_StringValue:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(typed.StringValue), 64)
		if err != nil {
			return 0, false
		}
		number = parsed
	default:
		return 0, false
	}
	return number, !math.IsNaN(number) && !math.IsInf(number, 0)
}

// attributeInt reads an integer attribute. An int is kept exact; any other number is
// truncated toward zero.
func attributeInt(attributes []*commonv1.KeyValue, key string) *int64 {
	value := attributeValue(attributes, key)
	if typed, isInt := value.GetValue().(*commonv1.AnyValue_IntValue); isInt {
		return &typed.IntValue
	}
	number, ok := numberValue(value)
	if !ok || math.Abs(number) >= math.MaxInt64 {
		return nil
	}
	result := int64(number)
	return &result
}

func attributeBool(attributes []*commonv1.KeyValue, key string) *bool {
	switch typed := attributeValue(attributes, key).GetValue().(type) {
	case *commonv1.AnyValue_BoolValue:
		return &typed.BoolValue
	case *commonv1.AnyValue_StringValue:
		if value, err := strconv.ParseBool(strings.TrimSpace(typed.StringValue)); err == nil {
			return &value
		}
	}
	return nil
}

// attributeDecimal reads a non-negative number as a fixed-scale decimal string.
func attributeDecimal(attributes []*commonv1.KeyValue, key string, scale int) *string {
	number, ok := numberValue(attributeValue(attributes, key))
	if !ok || number < 0 || number >= 1e12 {
		return nil
	}
	formatted := fmt.Sprintf("%.*f", scale, number)
	return &formatted
}

func int64Value(value *int64) int64 {
	if value == nil || *value < 0 {
		return 0
	}
	return *value
}
