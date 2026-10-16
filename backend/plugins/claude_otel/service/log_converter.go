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
	"encoding/hex"
	stderrors "errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/google/uuid"
	collectorlogs "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	logsv1 "go.opentelemetry.io/proto/otlp/logs/v1"
	"google.golang.org/protobuf/proto"
)

const (
	promptIDAttribute = "prompt.id"
	// maxPromptIDLength and maxSessionIDLength match the prompt_id and session_id columns;
	// a longer prompt id is skipped and a longer session id dropped, never truncated.
	maxPromptIDLength   = 64
	maxSessionIDLength  = 64
	maxEventFieldLength = 255
	replayLogPageSize   = 100
)

// claimableLogBatchConditions select log batches ready to convert. Events are converted
// independently of each other, so unlike metric batches a waiting retry does not hold
// back later batches.
// A condition with a second placeholder compares against the current time.
var claimableLogBatchConditions = []struct {
	where  string
	status string
}{
	{"status = ?", models.OtelMetricBatchStatusPending},
	{"status = ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?)", models.OtelMetricBatchStatusRetryableError},
	{"status = ? AND (lease_until IS NULL OR lease_until < ?)", models.OtelMetricBatchStatusProcessing},
}

// promptEventUpdate is one converted event plus the connection binding it depends on.
type promptEventUpdate struct {
	event          *models.OtelPromptEvent
	connection     *models.OtelConnection
	organizationID string
}

type preparedLogBatch struct {
	updates      []promptEventUpdate
	skippedCount int
	skipMessages []string
}

func (p *preparedLogBatch) diagnosticCode() *string {
	if p.skippedCount == 0 {
		return nil
	}
	code := string(diagnosticEventsSkipped)
	return &code
}

func (p *preparedLogBatch) diagnostic() *string {
	if p.skippedCount == 0 {
		return nil
	}
	message := fmt.Sprintf("skipped %d event(s): %s", p.skippedCount, strings.Join(p.skipMessages, "; "))
	return &message
}

// processNextLogBatch claims and converts one log batch. It returns true when a batch
// reached a new state, including retry scheduling or quarantine.
func (c *rawMetricConverter) processNextLogBatch() (bool, errors.Error) {
	batch, leaseOwner, err := c.claimNextLogBatch()
	if err != nil || batch == nil {
		return false, err
	}
	prepared, conversionErr := c.convertLogBatch(batch, leaseOwner)
	if conversionErr != nil {
		return true, c.recordBatchFailure(&models.OtelLogBatch{}, batch.ID, batch.AttemptCount, leaseOwner, conversionErr)
	}
	if prepared.skippedCount > 0 && c.logger != nil {
		c.logger.Warn(nil, "Claude Code OTel log batch %d skipped %d event(s)", batch.ID, prepared.skippedCount)
	}
	return true, nil
}

func (c *rawMetricConverter) claimNextLogBatch() (*models.OtelLogBatch, string, errors.Error) {
	now := c.now().UTC()
	var head *models.OtelLogBatch
	for _, condition := range claimableLogBatchConditions {
		params := []interface{}{condition.status}
		if strings.Count(condition.where, "?") > 1 {
			params = append(params, now)
		}
		candidate := &models.OtelLogBatch{}
		err := c.db.First(candidate,
			dal.Select("id, status, attempt_count"),
			dal.Where(condition.where, params...),
			dal.Orderby("id ASC"),
		)
		if err != nil {
			if c.db.IsErrorNotFound(err) {
				continue
			}
			return nil, "", errors.Default.Wrap(err, "failed to find the next Claude Code OTel log batch")
		}
		if head == nil || candidate.ID < head.ID {
			head = candidate
		}
	}
	if head == nil {
		return nil, "", nil
	}
	leaseOwner := uuid.NewString()
	if err := c.db.UpdateColumns(
		&models.OtelLogBatch{},
		[]dal.DalSet{
			{ColumnName: "status", Value: models.OtelMetricBatchStatusProcessing},
			{ColumnName: "lease_owner", Value: leaseOwner},
			{ColumnName: "lease_until", Value: now.Add(converterLeaseDuration)},
			{ColumnName: "next_attempt_at", Value: nil},
			{ColumnName: "attempt_count", Value: head.AttemptCount + 1},
		},
		dal.Where("id = ? AND status = ? AND attempt_count = ?", head.ID, head.Status, head.AttemptCount),
	); err != nil {
		return nil, "", errors.Default.Wrap(err, "failed to claim Claude Code OTel log batch")
	}
	batch := &models.OtelLogBatch{}
	if err := c.db.First(batch, dal.Where("id = ? AND lease_owner = ?", head.ID, leaseOwner)); err != nil {
		if c.db.IsErrorNotFound(err) {
			return nil, "", nil
		}
		return nil, "", errors.Default.Wrap(err, "failed to load claimed Claude Code OTel log batch")
	}
	return batch, leaseOwner, nil
}

// convertLogBatch prepares events outside a transaction, then verifies the batch lease and
// commits new events, rebuilt prompts and the batch's completion atomically.
func (c *rawMetricConverter) convertLogBatch(batch *models.OtelLogBatch, leaseOwner string) (*preparedLogBatch, error) {
	request := &collectorlogs.ExportLogsServiceRequest{}
	if err := proto.Unmarshal(batch.PayloadProto, request); err != nil {
		return nil, &conversionError{code: errorInvalidPayload, permanent: true, err: fmt.Errorf("decode raw OTLP logs payload: %w", err)}
	}
	prepared, err := c.prepareLogEvents(batch.ID, request)
	if err != nil {
		return nil, err
	}

	tx := c.db.Begin()
	claimed := &models.OtelLogBatch{}
	if err := tx.First(claimed,
		dal.Select("id"),
		dal.Where("id = ? AND status = ? AND lease_owner = ? AND lease_until > ?", batch.ID, models.OtelMetricBatchStatusProcessing, leaseOwner, c.now().UTC()),
		dal.Lock(true, false),
	); err != nil {
		c.rollback(tx)
		return nil, &conversionError{code: errorLeaseLost, err: fmt.Errorf("verify log batch lease: %w", err)}
	}
	if err := applyPromptEvents(tx, prepared.updates); err != nil {
		c.rollback(tx)
		return nil, err
	}
	if err := tx.UpdateColumns(
		&models.OtelLogBatch{},
		[]dal.DalSet{
			{ColumnName: "status", Value: models.OtelMetricBatchStatusProcessed},
			{ColumnName: "lease_owner", Value: nil},
			{ColumnName: "lease_until", Value: nil},
			{ColumnName: "processing_error_code", Value: prepared.diagnosticCode()},
			{ColumnName: "processing_error_message", Value: prepared.diagnostic()},
			{ColumnName: "processed_at", Value: c.now().UTC()},
		},
		dal.Where("id = ? AND status = ? AND lease_owner = ?", batch.ID, models.OtelMetricBatchStatusProcessing, leaseOwner),
	); err != nil {
		c.rollback(tx)
		return nil, classifyStorageError(fmt.Errorf("mark log batch processed: %w", err))
	}
	if err := tx.Commit(); err != nil {
		return nil, &conversionError{code: errorStorageFailure, err: fmt.Errorf("commit Claude Code OTel log conversion: %w", err)}
	}
	return prepared, nil
}

// applyPromptEvents binds connections, stores events not seen before, and rebuilds every
// prompt the events belong to. Live conversion and replay share it.
func applyPromptEvents(tx dal.Transaction, updates []promptEventUpdate) error {
	for _, update := range updates {
		if err := bindConnectionOrganization(tx, update.connection, update.organizationID); err != nil {
			return err
		}
		if err := tx.CreateIfNotExist(update.event); err != nil {
			return classifyStorageError(fmt.Errorf("write Claude Code OTel prompt event: %w", err))
		}
	}
	if err := reconcileOtelPrompts(tx, promptTargets(updates)); err != nil {
		return classifyStorageError(fmt.Errorf("write canonical Claude Code OTel prompts: %w", err))
	}
	return nil
}

// prepareLogEvents converts each record on its own. A record with bad attribution or no
// prompt id is skipped with a diagnostic rather than failing the batch, because events
// are independent; storage failures still fail it.
func (c *rawMetricConverter) prepareLogEvents(batchID uint64, request *collectorlogs.ExportLogsServiceRequest) (*preparedLogBatch, error) {
	preparer := &batchPreparer{
		converter:       c,
		connections:     make(map[string][]*models.OtelConnection),
		pendingBindings: make(map[uint64]string),
	}
	result := &preparedLogBatch{}
	for _, resourceLogs := range request.GetResourceLogs() {
		resourceAttrs := resourceLogs.GetResource().GetAttributes()
		resourceErr := error(nil)
		if hasAttribute(resourceAttrs, devlakeTeamAttribute) || hasAttribute(resourceAttrs, devlakeProjectAttribute) {
			resourceErr = permanentMetricError(errorInvalidAttribution, "OTLP logs resource must not include DevLake attribution")
		}
		for _, scopeLogs := range resourceLogs.GetScopeLogs() {
			for _, record := range scopeLogs.GetLogRecords() {
				err := resourceErr
				var update promptEventUpdate
				if err == nil {
					update, err = preparer.preparePromptEvent(batchID, resourceAttrs, record.GetAttributes(), record)
				}
				if err == nil {
					preparer.pendingBindings[update.connection.ID] = update.organizationID
					result.updates = append(result.updates, update)
					continue
				}
				var conversionErr *conversionError
				if !stderrors.As(err, &conversionErr) || !conversionErr.permanent {
					return nil, err
				}
				result.skippedCount++
				if len(result.skipMessages) < maxResourceSkipDiagnostics {
					result.skipMessages = append(result.skipMessages, fmt.Sprintf("%s: %s", conversionErr.code, conversionErr.Error()))
				}
			}
		}
	}
	return result, nil
}

func (p *batchPreparer) preparePromptEvent(batchID uint64, resourceAttrs, attrs []*commonv1.KeyValue, record *logsv1.LogRecord) (promptEventUpdate, error) {
	eventName := strings.TrimPrefix(attributeString(attrs, eventNameAttribute), claudeCodeEventScope)
	if hasAttribute(attrs, devlakeProjectAttribute) {
		return promptEventUpdate{}, permanentMetricError(errorInvalidAttribution, "event %s must not include devlake_project attribution", eventName)
	}
	teamSlug := attributeString(attrs, devlakeTeamAttribute)
	if teamSlug == "" {
		return promptEventUpdate{}, permanentMetricError(errorMissingTeam, "event %s is missing trusted devlake_team attribution", eventName)
	}
	eventTime, err := logRecordTime(record)
	if err != nil {
		return promptEventUpdate{}, permanentMetricError(errorInvalidTimestamp, "event %s has an invalid timestamp", eventName)
	}
	connection, err := p.resolveConnection(teamSlug, eventTime)
	if err != nil {
		return promptEventUpdate{}, err
	}
	organizationID, err := organizationIDFromAttributes(resourceAttrs, attrs)
	if err != nil {
		return promptEventUpdate{}, err
	}
	if err := p.checkOrganizationBinding(connection, organizationID, map[uint64]string{}); err != nil {
		return promptEventUpdate{}, err
	}
	identity, err := identityFromAttributes(attrs)
	if err != nil {
		return promptEventUpdate{}, err
	}
	promptID := attributeString(attrs, promptIDAttribute)
	if promptID == "" || len([]rune(promptID)) > maxPromptIDLength {
		return promptEventUpdate{}, permanentMetricError(errorInvalidDimension, "event %s has no usable prompt.id", eventName)
	}
	event := &models.OtelPromptEvent{
		LogBatchId:     batchID,
		ConnectionId:   connection.ID,
		TeamSlug:       connection.TeamSlug,
		OrganizationId: organizationID,
		UserKey:        identity.key,
		UserAccountId:  identity.accountID,
		UserEmail:      identity.email,
		SessionId:      sessionIDFromAttributes(resourceAttrs, attrs),
		PromptId:       promptID,
		EventName:      eventName,
		EventTime:      eventTime,
		Sequence:       attributeInt64(attrs, "event.sequence"),
	}
	fillPromptEventFacts(event, attrs)
	event.Id = promptEventID(event, attrs)
	return promptEventUpdate{event: event, connection: connection, organizationID: organizationID}, nil
}

// sessionIDFromAttributes reads session.id from the record, else from its resource. An id
// that does not fit its column is dropped rather than truncated, because a truncated id
// could merge two sessions.
func sessionIDFromAttributes(resourceAttrs, attrs []*commonv1.KeyValue) string {
	sessionID := attributeString(attrs, sessionIDAttribute)
	if sessionID == "" {
		sessionID = attributeString(resourceAttrs, sessionIDAttribute)
	}
	if len([]rune(sessionID)) > maxSessionIDLength {
		return ""
	}
	return sessionID
}

// fillPromptEventFacts copies the attributes each event kind carries.
func fillPromptEventFacts(event *models.OtelPromptEvent, attrs []*commonv1.KeyValue) {
	text := func(key string) string { return truncate(attributeString(attrs, key), maxEventFieldLength) }
	switch claudeCodeEventScope + event.EventName {
	case eventUserPrompt:
		event.PromptLength = attributeInt64(attrs, "prompt_length")
		event.CommandName = text("command_name")
	case eventAPIRequest:
		event.Model = text("model")
		event.DurationMs = attributeInt64(attrs, "duration_ms")
		event.InputTokens = attributeInt64(attrs, "input_tokens")
		event.OutputTokens = attributeInt64(attrs, "output_tokens")
		event.CacheReadTokens = attributeInt64(attrs, "cache_read_tokens")
		event.CacheCreationTokens = attributeInt64(attrs, "cache_creation_tokens")
		event.CostUsdMicros = costUsdMicros(attrs)
	case eventAPIError:
		event.Model = text("model")
		event.DurationMs = attributeInt64(attrs, "duration_ms")
	case eventAPIRefusal:
		event.Model = text("model")
	case eventToolResult:
		event.ToolName = text("tool_name")
		event.DurationMs = attributeInt64(attrs, "duration_ms")
		event.Success = attributeBool(attrs, "success")
	case eventToolDecision:
		event.ToolName = text("tool_name")
		event.Decision = truncate(attributeString(attrs, "decision"), 32)
		event.DecisionSource = truncate(attributeString(attrs, "source"), 64)
	}
}

// promptEventID identifies one event across Collector retries and replays: the client's
// own ordering and request ids plus the event's identity fields.
func promptEventID(event *models.OtelPromptEvent, attrs []*commonv1.KeyValue) string {
	parts := []string{
		strconv.FormatUint(event.ConnectionId, 10), event.SessionId, event.PromptId, event.EventName,
		strconv.FormatInt(event.Sequence, 10), attributeString(attrs, "event.timestamp"),
		strconv.FormatInt(event.EventTime.UnixNano(), 10),
		attributeString(attrs, "request_id"), attributeString(attrs, "tool_use_id"),
	}
	digest := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(digest[:])
}

// costUsdMicros prefers Claude Code's integer cost and falls back to the float cost.
func costUsdMicros(attrs []*commonv1.KeyValue) int64 {
	if micros, ok := attributeNumber(attrs, "cost_usd_micros"); ok {
		return int64(math.Round(micros))
	}
	if cost, ok := attributeNumber(attrs, "cost_usd"); ok {
		return int64(math.Round(cost * 1_000_000))
	}
	return 0
}

// attributeNumber reads a numeric attribute that Claude Code may send as an int, a double
// or a decimal string. Negative and non-finite values are treated as absent.
func attributeNumber(attrs []*commonv1.KeyValue, key string) (float64, bool) {
	for _, attribute := range attrs {
		if attribute.GetKey() != key || attribute.GetValue() == nil {
			continue
		}
		var value float64
		switch typed := attribute.GetValue().GetValue().(type) {
		case *commonv1.AnyValue_IntValue:
			value = float64(typed.IntValue)
		case *commonv1.AnyValue_DoubleValue:
			value = typed.DoubleValue
		case *commonv1.AnyValue_StringValue:
			parsed, err := strconv.ParseFloat(strings.TrimSpace(typed.StringValue), 64)
			if err != nil {
				return 0, false
			}
			value = parsed
		default:
			return 0, false
		}
		if value < 0 || math.IsNaN(value) || math.IsInf(value, 0) {
			return 0, false
		}
		return value, true
	}
	return 0, false
}

func attributeInt64(attrs []*commonv1.KeyValue, key string) int64 {
	value, ok := attributeNumber(attrs, key)
	if !ok || value > math.MaxInt64 {
		return 0
	}
	return int64(math.Round(value))
}

// attributeBool reads a boolean sent as a bool or as "true"/"false".
func attributeBool(attrs []*commonv1.KeyValue, key string) *bool {
	for _, attribute := range attrs {
		if attribute.GetKey() != key || attribute.GetValue() == nil {
			continue
		}
		switch typed := attribute.GetValue().GetValue().(type) {
		case *commonv1.AnyValue_BoolValue:
			value := typed.BoolValue
			return &value
		case *commonv1.AnyValue_StringValue:
			if value, err := strconv.ParseBool(strings.TrimSpace(typed.StringValue)); err == nil {
				return &value
			}
		}
		return nil
	}
	return nil
}

type promptTarget struct {
	workspaceKey  string
	userKey       string
	userAccountID *string
	sessionID     string
	promptID      string
}

func promptTargets(updates []promptEventUpdate) []promptTarget {
	seen := make(map[string]promptTarget)
	for _, update := range updates {
		event := update.event
		target := promptTarget{workspaceKey: event.OrganizationId, userKey: event.UserKey, userAccountID: event.UserAccountId, sessionID: event.SessionId, promptID: event.PromptId}
		seen[target.workspaceKey+"\x00"+target.userKey+"\x00"+target.sessionID+"\x00"+target.promptID] = target
	}
	targets := make([]promptTarget, 0, len(seen))
	for _, target := range seen {
		targets = append(targets, target)
	}
	sort.Slice(targets, func(i, j int) bool {
		if targets[i].sessionID != targets[j].sessionID {
			return targets[i].sessionID < targets[j].sessionID
		}
		return targets[i].promptID < targets[j].promptID
	})
	return targets
}

// replayLogBatches re-derives prompt events from the retained log batches observed in the
// replay range and rebuilds their prompts, one batch per transaction. Each re-derived event
// replaces its stored copy, so a fixed converter corrects stored values without double
// counting. A stored event the converter no longer extracts is left in place. A batch whose
// payload cannot be decoded is skipped and recorded in diagnostics. It returns the number
// of log batches replayed and skipped.
func (c *rawMetricConverter) replayLogBatches(request *models.OtelReplayRequest, leaseOwner string, lastRenewal *time.Time, diagnostics *replayDiagnostics) (int, int, error) {
	start, end := request.RangeStart.UTC(), request.RangeEnd.UTC()
	replayed, skipped := 0, 0
	afterID := uint64(0)
	for {
		batches := make([]*models.OtelLogBatch, 0, replayLogPageSize)
		if err := c.db.All(&batches,
			dal.Where("id > ? AND status IN ? AND max_observed_at >= ? AND min_observed_at < ?", afterID, replayableBatchStatuses, start, end),
			dal.Orderby("id ASC"),
			dal.Limit(replayLogPageSize),
		); err != nil {
			return replayed, skipped, fmt.Errorf("load Claude Code OTel log batches to replay: %w", err)
		}
		for _, batch := range batches {
			afterID = batch.ID
			if err := c.renewReplayLeaseIfDue(request.ID, leaseOwner, lastRenewal, false); err != nil {
				return replayed, skipped, err
			}
			payload := &collectorlogs.ExportLogsServiceRequest{}
			if err := proto.Unmarshal(batch.PayloadProto, payload); err != nil {
				diagnostics.add(batch.ID, permanentMetricError(errorInvalidPayload, "decode replay log batch %d: %v", batch.ID, err))
				skipped++
				continue
			}
			prepared, err := c.prepareLogEvents(batch.ID, payload)
			if err != nil {
				return replayed, skipped, err
			}
			tx := c.db.Begin()
			if err := c.verifyConverterLease(tx); err != nil {
				c.rollback(tx)
				return replayed, skipped, err
			}
			if err := deletePromptEvents(tx, prepared.updates); err != nil {
				c.rollback(tx)
				return replayed, skipped, err
			}
			if err := applyPromptEvents(tx, prepared.updates); err != nil {
				c.rollback(tx)
				return replayed, skipped, err
			}
			if err := tx.Commit(); err != nil {
				return replayed, skipped, fmt.Errorf("commit Claude Code OTel log batch %d replay: %w", batch.ID, err)
			}
			replayed++
		}
		if len(batches) < replayLogPageSize {
			return replayed, skipped, nil
		}
	}
}

// deletePromptEvents removes the stored copies of the given events so replay can write
// them again with the current converter's values.
func deletePromptEvents(tx dal.Transaction, updates []promptEventUpdate) error {
	if len(updates) == 0 {
		return nil
	}
	ids := make([]string, 0, len(updates))
	for _, update := range updates {
		ids = append(ids, update.event.Id)
	}
	if err := tx.Delete(&models.OtelPromptEvent{}, dal.Where("id IN ?", ids)); err != nil {
		return classifyStorageError(fmt.Errorf("delete replayed Claude Code OTel prompt events: %w", err))
	}
	return nil
}
