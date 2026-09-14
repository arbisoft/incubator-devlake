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
	"fmt"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/google/uuid"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	metricsv1 "go.opentelemetry.io/proto/otlp/metrics/v1"
	"google.golang.org/protobuf/proto"
)

const (
	converterLeaseDuration = 30 * time.Second
	converterPollInterval  = 2 * time.Second
	converterRetryLimit    = 8

	metricSessionCount     = "claude_code.session.count"
	metricActiveTime       = "claude_code.active_time.total"
	metricActiveTimeLegacy = "claude_code.active_time.seconds"
	metricLinesOfCode      = "claude_code.lines_of_code.count"
	metricCommitCount      = "claude_code.commit.count"
	metricPullRequestCount = "claude_code.pull_request.count"
	metricTokenUsage       = "claude_code.token.usage"
	metricTokenUsageLegacy = "claude_code.token.usage.tokens"
	metricCostUsage        = "claude_code.cost.usage"
	metricCostUsageLegacy  = "claude_code.cost.usage_USD"
	metricToolDecision     = "claude_code.code_edit_tool.decision"
)

type conversionError struct {
	code      string
	permanent bool
	err       error
}

func (e *conversionError) Error() string { return e.err.Error() }

type rawMetricConverter struct {
	db  dal.Dal
	now func() time.Time
}

var converterStartOnce sync.Once

func newRawMetricConverter(db dal.Dal) *rawMetricConverter {
	return &rawMetricConverter{db: db, now: time.Now}
}

// startRawMetricConverter starts a single logical converter per process. Database claims
// provide the cross-replica election and preserve raw receipt order.
func startRawMetricConverter(database dal.Dal) {
	if database == nil {
		return
	}
	converterStartOnce.Do(func() {
		converter := newRawMetricConverter(database)
		go func() {
			ticker := time.NewTicker(converterPollInterval)
			defer ticker.Stop()
			for range ticker.C {
				for converter.processNext() {
				}
			}
		}()
	})
}

// processNext claims the oldest eligible batch. It returns true when work was claimed,
// including a batch that was quarantined or scheduled for retry.
func (c *rawMetricConverter) processNext() bool {
	batch, leaseOwner, err := c.claimNext()
	if err != nil || batch == nil {
		return false
	}
	if err := c.convert(batch, leaseOwner); err != nil {
		c.recordFailure(batch, leaseOwner, err)
	}
	return true
}

func (c *rawMetricConverter) claimNext() (*models.OtelMetricBatch, string, errors.Error) {
	now := c.now().UTC()
	tx := c.db.Begin()
	batches := make([]*models.OtelMetricBatch, 0, 1)
	if err := tx.All(&batches,
		dal.Where("(status IN (?, ?) AND (next_attempt_at IS NULL OR next_attempt_at <= ?)) OR (status = ? AND lease_until < ?)",
			models.OtelMetricBatchStatusPending,
			models.OtelMetricBatchStatusRetryableError,
			now,
			models.OtelMetricBatchStatusProcessing,
			now),
		dal.Orderby("id ASC"),
		dal.Limit(1),
	); err != nil {
		_ = tx.Rollback()
		return nil, "", errors.Default.Wrap(err, "failed to find Claude Code OTel raw batches")
	}
	if len(batches) == 0 {
		_ = tx.Rollback()
		return nil, "", nil
	}
	batch := batches[0]
	leaseOwner := uuid.NewString()
	leaseUntil := now.Add(converterLeaseDuration)
	if err := tx.UpdateColumns(
		&models.OtelMetricBatch{},
		[]dal.DalSet{
			{ColumnName: "status", Value: models.OtelMetricBatchStatusProcessing},
			{ColumnName: "lease_owner", Value: leaseOwner},
			{ColumnName: "lease_until", Value: leaseUntil},
			{ColumnName: "next_attempt_at", Value: nil},
			{ColumnName: "attempt_count", Value: batch.AttemptCount + 1},
		},
		dal.Where("id = ? AND (status IN (?, ?) OR (status = ? AND lease_until < ?))",
			batch.ID,
			models.OtelMetricBatchStatusPending,
			models.OtelMetricBatchStatusRetryableError,
			models.OtelMetricBatchStatusProcessing,
			now),
	); err != nil {
		_ = tx.Rollback()
		return nil, "", errors.Default.Wrap(err, "failed to claim Claude Code OTel raw batch")
	}
	if err := tx.Commit(); err != nil {
		return nil, "", errors.Default.Wrap(err, "failed to commit Claude Code OTel raw batch claim")
	}
	return batch, leaseOwner, nil
}

func (c *rawMetricConverter) convert(batch *models.OtelMetricBatch, leaseOwner string) error {
	request := &collectormetrics.ExportMetricsServiceRequest{}
	if err := proto.Unmarshal(batch.PayloadProto, request); err != nil {
		return &conversionError{code: "invalid_payload", permanent: true, err: fmt.Errorf("decode raw OTLP payload: %w", err)}
	}
	updates, err := c.prepareUpdates(request)
	if err != nil {
		return err
	}

	tx := c.db.Begin()
	claimedBatch := &models.OtelMetricBatch{}
	if err := tx.First(claimedBatch,
		dal.Where("id = ? AND status = ? AND lease_owner = ?", batch.ID, models.OtelMetricBatchStatusProcessing, leaseOwner),
		dal.Lock(true, false),
	); err != nil {
		_ = tx.Rollback()
		return &conversionError{code: "lease_lost", err: fmt.Errorf("verify raw batch lease: %w", err)}
	}
	for _, update := range updates {
		if err := c.applyUpdate(tx, update); err != nil {
			_ = tx.Rollback()
			return &conversionError{code: "storage_failure", err: fmt.Errorf("write hourly Claude Code OTel facts: %w", err)}
		}
	}
	if err := reconcileOtelDaily(tx, dailyTargets(updates)); err != nil {
		_ = tx.Rollback()
		return &conversionError{code: "storage_failure", err: fmt.Errorf("write canonical daily Claude Code OTel facts: %w", err)}
	}
	now := c.now().UTC()
	if err := tx.UpdateColumns(
		&models.OtelMetricBatch{},
		[]dal.DalSet{
			{ColumnName: "status", Value: models.OtelMetricBatchStatusProcessed},
			{ColumnName: "lease_owner", Value: nil},
			{ColumnName: "lease_until", Value: nil},
			{ColumnName: "processing_error_code", Value: nil},
			{ColumnName: "processing_error_message", Value: nil},
			{ColumnName: "processed_at", Value: now},
		},
		dal.Where("id = ? AND status = ? AND lease_owner = ?", batch.ID, models.OtelMetricBatchStatusProcessing, leaseOwner),
	); err != nil {
		_ = tx.Rollback()
		return &conversionError{code: "lease_lost", err: fmt.Errorf("mark raw batch processed: %w", err)}
	}
	if err := tx.Commit(); err != nil {
		return &conversionError{code: "storage_failure", err: fmt.Errorf("commit hourly Claude Code OTel facts: %w", err)}
	}
	return nil
}

func (c *rawMetricConverter) recordFailure(batch *models.OtelMetricBatch, leaseOwner string, conversionErr error) {
	errCode, permanent, message := classifyConversionError(conversionErr)
	now := c.now().UTC()
	tx := c.db.Begin()
	sets := []dal.DalSet{
		{ColumnName: "lease_owner", Value: nil},
		{ColumnName: "lease_until", Value: nil},
		{ColumnName: "processing_error_code", Value: errCode},
		{ColumnName: "processing_error_message", Value: message},
	}
	if permanent {
		sets = append(sets, dal.DalSet{ColumnName: "status", Value: models.OtelMetricBatchStatusPermanentError})
	} else {
		sets = append(sets,
			dal.DalSet{ColumnName: "status", Value: models.OtelMetricBatchStatusRetryableError},
			dal.DalSet{ColumnName: "next_attempt_at", Value: now.Add(converterBackoff(batch.AttemptCount + 1))},
		)
	}
	if err := tx.UpdateColumns(&models.OtelMetricBatch{}, sets,
		dal.Where("id = ? AND status = ? AND lease_owner = ?", batch.ID, models.OtelMetricBatchStatusProcessing, leaseOwner)); err == nil {
		_ = tx.Commit()
		return
	}
	_ = tx.Rollback()
}

func classifyConversionError(err error) (string, bool, string) {
	if conversionErr, ok := err.(*conversionError); ok {
		return conversionErr.code, conversionErr.permanent, conversionErr.Error()
	}
	return "conversion_failure", false, err.Error()
}

func converterBackoff(attempt int) time.Duration {
	if attempt > converterRetryLimit {
		attempt = converterRetryLimit
	}
	return time.Second * time.Duration(1<<uint(attempt))
}

type factUpdate struct {
	connection  *models.OtelConnection
	identity    developerIdentity
	hour        time.Time
	observedAt  time.Time
	metric      string
	model       string
	query       string
	tool        string
	language    string
	decision    string
	typeValue   string
	value       metricNumber
	temporality metricsv1.AggregationTemporality
	startNanos  uint64
	timeNanos   uint64
	seriesHash  []byte
}

type developerIdentity struct {
	key         string
	accountID   *string
	accountUUID *string
	email       *string
}

type metricNumber struct {
	integer bool
	int64   int64
	decimal string
}

func (c *rawMetricConverter) prepareUpdates(request *collectormetrics.ExportMetricsServiceRequest) ([]factUpdate, error) {
	updates := make([]factUpdate, 0)
	for _, resourceMetrics := range request.GetResourceMetrics() {
		resourceAttrs := resourceMetrics.GetResource().GetAttributes()
		teamSlug := attributeString(resourceAttrs, devlakeTeamAttribute)
		for _, scopeMetrics := range resourceMetrics.GetScopeMetrics() {
			for _, metric := range scopeMetrics.GetMetrics() {
				if !isSupportedMetric(metric.GetName()) {
					continue
				}
				sum := metric.GetSum()
				if sum == nil {
					return nil, permanentMetricError("unsupported_metric_kind", "supported metric %s is not an OTLP sum", metric.GetName())
				}
				for _, point := range sum.GetDataPoints() {
					observedAt, err := unixNanoTime(point.GetTimeUnixNano())
					if err != nil {
						return nil, permanentMetricError("invalid_timestamp", "supported metric %s has an invalid timestamp", metric.GetName())
					}
					connection, err := c.resolveConnection(teamSlug, observedAt)
					if err != nil {
						return nil, err
					}
					identity, err := identityFromAttributes(point.GetAttributes())
					if err != nil {
						return nil, err
					}
					if err := validateOrganization(resourceAttrs, point.GetAttributes(), connection); err != nil {
						return nil, err
					}
					value, err := metricNumberFromPoint(point)
					if err != nil {
						return nil, permanentMetricError("invalid_value", "supported metric %s has an invalid numeric value", metric.GetName())
					}
					update := factUpdate{
						connection: connection, identity: identity, hour: observedAt.Truncate(time.Hour), observedAt: observedAt,
						metric: metric.GetName(), model: attributeString(point.GetAttributes(), "model"),
						query:       defaultDimension(attributeString(point.GetAttributes(), "query_source")),
						tool:        defaultDimension(attributeString(point.GetAttributes(), "tool_name")),
						language:    defaultDimension(attributeString(point.GetAttributes(), "language")),
						decision:    attributeString(point.GetAttributes(), "decision"),
						typeValue:   attributeString(point.GetAttributes(), "type"),
						value:       value,
						temporality: sum.GetAggregationTemporality(), startNanos: point.GetStartTimeUnixNano(), timeNanos: point.GetTimeUnixNano(),
					}
					if err := validateMetricDimensions(update); err != nil {
						return nil, err
					}
					update.seriesHash = metricSeriesHash(update, resourceAttrs, point.GetAttributes(), metric.GetUnit())
					updates = append(updates, update)
				}
			}
		}
	}
	return updates, nil
}

func (c *rawMetricConverter) resolveConnection(teamSlug string, observedAt time.Time) (*models.OtelConnection, error) {
	connections := make([]*models.OtelConnection, 0)
	if err := c.db.All(&connections, dal.Where("team_slug = ?", teamSlug)); err != nil {
		return nil, &conversionError{code: "connection_lookup_failed", err: fmt.Errorf("resolve OTel connection: %w", err)}
	}
	var match *models.OtelConnection
	for _, connection := range connections {
		if connection.CreatedAt.After(observedAt) || (connection.RevokedAt != nil && !observedAt.Before(*connection.RevokedAt)) {
			continue
		}
		if match != nil {
			return nil, permanentMetricError("ambiguous_connection", "telemetry for team %q has ambiguous connection history", teamSlug)
		}
		match = connection
	}
	if match == nil {
		return nil, permanentMetricError("connection_not_found", "telemetry for team %q has no connection at observed time", teamSlug)
	}
	return match, nil
}

func (c *rawMetricConverter) applyUpdate(tx dal.Transaction, update factUpdate) error {
	value, err := c.counterDelta(tx, update)
	if err != nil || value == nil {
		return err
	}
	switch update.metric {
	case metricSessionCount:
		return upsertActivity(tx, update, "session_count", value.integerString())
	case metricActiveTime, metricActiveTimeLegacy:
		return upsertActivity(tx, update, "active_time_seconds", value.decimal)
	case metricLinesOfCode:
		column := map[string]string{"added": "lines_added", "removed": "lines_removed"}[attributeType(update)]
		if column == "" {
			return permanentMetricError("invalid_dimension", "lines metric has invalid type")
		}
		return upsertActivity(tx, update, column, value.integerString())
	case metricCommitCount:
		return upsertActivity(tx, update, "commits_created", value.integerString())
	case metricPullRequestCount:
		return upsertActivity(tx, update, "prs_created", value.integerString())
	case metricTokenUsage, metricTokenUsageLegacy:
		column := map[string]string{"input": "input_tokens", "output": "output_tokens", "cacheRead": "cache_read_tokens", "cacheCreation": "cache_creation_tokens"}[attributeType(update)]
		if column == "" {
			return permanentMetricError("invalid_dimension", "token metric has invalid type")
		}
		return upsertModelUsage(tx, update, column, value.integerString())
	case metricCostUsage, metricCostUsageLegacy:
		return upsertModelUsage(tx, update, "estimated_cost_usd", value.decimal)
	case metricToolDecision:
		column := map[string]string{"accept": "accepted_count", "reject": "rejected_count"}[update.decision]
		if column == "" {
			return permanentMetricError("invalid_dimension", "tool decision metric has invalid decision")
		}
		return upsertToolUsage(tx, update, column, value.integerString())
	default:
		return nil
	}
}

func (c *rawMetricConverter) counterDelta(tx dal.Transaction, update factUpdate) (*metricNumber, error) {
	if update.temporality == metricsv1.AggregationTemporality_AGGREGATION_TEMPORALITY_DELTA {
		return &update.value, nil
	}
	if update.temporality != metricsv1.AggregationTemporality_AGGREGATION_TEMPORALITY_CUMULATIVE {
		return nil, permanentMetricError("unsupported_temporality", "metric %s has unsupported aggregation temporality", update.metric)
	}
	state := &models.OtelMetricSeriesState{}
	err := tx.First(state, dal.Where("series_hash = ?", update.seriesHash), dal.Lock(true, false))
	if err != nil && !tx.IsErrorNotFound(err) {
		return nil, err
	}
	if !tx.IsErrorNotFound(err) && update.timeNanos <= state.LastTimeUnixNano {
		return nil, permanentMetricError("out_of_order_cumulative", "metric %s has an out-of-order cumulative sample", update.metric)
	}
	delta := update.value
	if !tx.IsErrorNotFound(err) && state.LastNumberValue != nil && update.startNanos == state.StartTimeUnixNano {
		previous, parseErr := strconv.ParseFloat(*state.LastNumberValue, 64)
		current, currentErr := strconv.ParseFloat(update.value.decimal, 64)
		if parseErr != nil || currentErr != nil {
			return nil, permanentMetricError("invalid_series_state", "metric %s has invalid cumulative state", update.metric)
		}
		if current < previous {
			delta = update.value
		} else {
			delta = metricNumber{integer: update.value.integer, int64: int64(current - previous), decimal: strconv.FormatFloat(current-previous, 'f', 9, 64)}
		}
	}
	last := update.value.decimal
	state = &models.OtelMetricSeriesState{SeriesHash: update.seriesHash, ConnectionId: update.connection.ID, MetricName: update.metric, Temporality: "cumulative", StartTimeUnixNano: update.startNanos, LastTimeUnixNano: update.timeNanos, LastNumberValue: &last, UpdatedAt: c.now().UTC()}
	if err := tx.CreateOrUpdate(state); err != nil {
		return nil, err
	}
	return &delta, nil
}

func upsertActivity(tx dal.Transaction, update factUpdate, column, value string) error {
	query := fmt.Sprintf("INSERT INTO %s (connection_id, team_slug, organization_id, user_key, user_account_id, user_account_uuid, user_email, hour_start, %s, first_observed_at, last_observed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE %s = %s + VALUES(%s), first_observed_at = LEAST(first_observed_at, VALUES(first_observed_at)), last_observed_at = GREATEST(last_observed_at, VALUES(last_observed_at)), updated_at = NOW()", models.OtelHourlyActivityTable, column, column, column, column)
	return tx.Exec(query, update.connection.ID, update.connection.TeamSlug, update.connection.OrganizationId, update.identity.key, update.identity.accountID, update.identity.accountUUID, update.identity.email, update.hour, value, update.observedAt, update.observedAt)
}

func upsertModelUsage(tx dal.Transaction, update factUpdate, column, value string) error {
	query := fmt.Sprintf("INSERT INTO %s (connection_id, team_slug, organization_id, user_key, user_account_id, user_account_uuid, user_email, hour_start, model, query_source, %s, first_observed_at, last_observed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE %s = %s + VALUES(%s), first_observed_at = LEAST(first_observed_at, VALUES(first_observed_at)), last_observed_at = GREATEST(last_observed_at, VALUES(last_observed_at)), updated_at = NOW()", models.OtelHourlyModelUsageTable, column, column, column, column)
	return tx.Exec(query, update.connection.ID, update.connection.TeamSlug, update.connection.OrganizationId, update.identity.key, update.identity.accountID, update.identity.accountUUID, update.identity.email, update.hour, update.model, update.query, value, update.observedAt, update.observedAt)
}

func upsertToolUsage(tx dal.Transaction, update factUpdate, column, value string) error {
	query := fmt.Sprintf("INSERT INTO %s (connection_id, team_slug, organization_id, user_key, user_account_id, user_account_uuid, user_email, hour_start, tool_name, language, %s, first_observed_at, last_observed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()) ON DUPLICATE KEY UPDATE %s = %s + VALUES(%s), first_observed_at = LEAST(first_observed_at, VALUES(first_observed_at)), last_observed_at = GREATEST(last_observed_at, VALUES(last_observed_at)), updated_at = NOW()", models.OtelHourlyToolUsageTable, column, column, column, column)
	return tx.Exec(query, update.connection.ID, update.connection.TeamSlug, update.connection.OrganizationId, update.identity.key, update.identity.accountID, update.identity.accountUUID, update.identity.email, update.hour, update.tool, update.language, value, update.observedAt, update.observedAt)
}

func isSupportedMetric(name string) bool {
	switch name {
	case metricSessionCount, metricActiveTime, metricActiveTimeLegacy, metricLinesOfCode, metricCommitCount, metricPullRequestCount, metricTokenUsage, metricTokenUsageLegacy, metricCostUsage, metricCostUsageLegacy, metricToolDecision:
		return true
	}
	return false
}
func permanentMetricError(code, format string, args ...interface{}) error {
	return &conversionError{code: code, permanent: true, err: fmt.Errorf(format, args...)}
}
func defaultDimension(value string) string {
	if value == "" {
		return "unknown"
	}
	return value
}
func attributeType(update factUpdate) string { return update.typeValue }
func validateMetricDimensions(update factUpdate) error {
	if update.metric != metricActiveTime && update.metric != metricActiveTimeLegacy && update.metric != metricCostUsage && update.metric != metricCostUsageLegacy && !update.value.integer {
		return permanentMetricError("invalid_value", "metric %s must have an integer value", update.metric)
	}
	if (update.metric == metricTokenUsage || update.metric == metricTokenUsageLegacy || update.metric == metricCostUsage || update.metric == metricCostUsageLegacy) && update.model == "" {
		return permanentMetricError("invalid_dimension", "metric %s is missing model", update.metric)
	}
	return nil
}

func identityFromAttributes(attributes []*commonv1.KeyValue) (developerIdentity, error) {
	accountID, accountUUID, email, installID := attributeString(attributes, "user.account_id"), attributeString(attributes, "user.account_uuid"), normalizeEmail(attributeString(attributes, "user.email")), attributeString(attributes, "user.id")
	identity := developerIdentity{accountID: optionalString(accountID), accountUUID: optionalString(accountUUID), email: optionalString(email)}
	switch {
	case accountID != "":
		identity.key = "acct:" + accountID
	case accountUUID != "":
		identity.key = "uuid:" + accountUUID
	case email != "":
		identity.key = "email:" + email
	case installID != "":
		identity.key = "install:" + installID
	default:
		return developerIdentity{}, permanentMetricError("missing_user_identity", "supported metric has no stable user identity")
	}
	return identity, nil
}
func normalizeEmail(value string) string { return strings.ToLower(strings.TrimSpace(value)) }
func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
func unixNanoTime(value uint64) (time.Time, error) {
	if value == 0 || value > uint64(1<<63-1) {
		return time.Time{}, fmt.Errorf("invalid timestamp")
	}
	return time.Unix(0, int64(value)).UTC(), nil
}
func metricNumberFromPoint(point *metricsv1.NumberDataPoint) (metricNumber, error) {
	switch value := point.Value.(type) {
	case *metricsv1.NumberDataPoint_AsInt:
		return metricNumber{integer: true, int64: value.AsInt, decimal: strconv.FormatInt(value.AsInt, 10)}, nil
	case *metricsv1.NumberDataPoint_AsDouble:
		return metricNumber{decimal: strconv.FormatFloat(value.AsDouble, 'f', 9, 64)}, nil
	default:
		return metricNumber{}, fmt.Errorf("missing number")
	}
}
func (m metricNumber) integerString() string {
	if !m.integer {
		return "0"
	}
	return strconv.FormatInt(m.int64, 10)
}
func validateOrganization(resourceAttrs, pointAttrs []*commonv1.KeyValue, connection *models.OtelConnection) error {
	organization := attributeString(pointAttrs, organizationIDAttribute)
	if organization == "" {
		organization = attributeString(resourceAttrs, organizationIDAttribute)
	}
	if connection.OrganizationId != nil && organization != *connection.OrganizationId {
		return permanentMetricError("organization_mismatch", "telemetry organization does not match its OTel connection")
	}
	return nil
}
func metricSeriesHash(update factUpdate, resourceAttrs, pointAttrs []*commonv1.KeyValue, unit string) []byte {
	values := []string{strconv.FormatUint(update.connection.ID, 10), update.metric, unit}
	values = append(values, prefixedAttributes("resource", resourceAttrs)...)
	values = append(values, prefixedAttributes("point", pointAttrs)...)
	sort.Strings(values)
	hash := sha256.Sum256([]byte(strings.Join(values, "\x00")))
	return hash[:]
}
func prefixedAttributes(prefix string, attributes []*commonv1.KeyValue) []string {
	values := make([]string, 0, len(attributes))
	for _, attribute := range attributes {
		value, err := proto.MarshalOptions{Deterministic: true}.Marshal(attribute.GetValue())
		if err != nil {
			continue
		}
		values = append(values, prefix+":"+attribute.GetKey()+"="+string(value))
	}
	return values
}
