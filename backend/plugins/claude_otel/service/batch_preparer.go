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
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/google/uuid"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	metricsv1 "go.opentelemetry.io/proto/otlp/metrics/v1"
)

const (
	maxResourceSkipDiagnostics = 5
	maxUnknownMetricNames      = 10
	maxDiagnosticNameLength    = 128
)

// preparedBatch holds a batch's fact updates plus bounded, operator-safe diagnostics.
type preparedBatch struct {
	updates        []factUpdate
	skippedCount   int
	skipMessages   []string
	unknownMetrics []string
}

func (p *preparedBatch) diagnosticCode() *string {
	if p.skippedCount == 0 {
		return nil
	}
	code := string(diagnosticResourcesSkipped)
	return &code
}

func (p *preparedBatch) diagnostic() *string {
	if p.skippedCount == 0 {
		return nil
	}
	message := fmt.Sprintf("skipped %d resource group(s): %s", p.skippedCount, strings.Join(p.skipMessages, "; "))
	return &message
}

// batchPreparer resolves connections once per team for one batch conversion attempt and
// tracks organization bindings that will be applied in the conversion transaction.
type batchPreparer struct {
	converter        *rawMetricConverter
	connections      map[string][]*models.OtelConnection
	pendingBindings  map[uint64]string
	unknownMetricSet map[string]struct{}
	result           preparedBatch
}

func (c *rawMetricConverter) prepareUpdates(request *collectormetrics.ExportMetricsServiceRequest) (*preparedBatch, error) {
	preparer := &batchPreparer{
		converter:        c,
		connections:      make(map[string][]*models.OtelConnection),
		pendingBindings:  make(map[uint64]string),
		unknownMetricSet: make(map[string]struct{}),
	}
	for _, resourceMetrics := range request.GetResourceMetrics() {
		resourceBindings := make(map[uint64]string)
		updates, err := preparer.prepareResource(resourceMetrics, resourceBindings)
		if err == nil {
			preparer.result.updates = append(preparer.result.updates, updates...)
			for connectionID, organizationID := range resourceBindings {
				preparer.pendingBindings[connectionID] = organizationID
			}
			continue
		}
		conversionErr, ok := err.(*conversionError)
		if !ok {
			return nil, err
		}
		if _, attribution := attributionErrorCodes[conversionErr.code]; !attribution {
			return nil, err
		}
		preparer.recordSkip(conversionErr)
	}
	sort.SliceStable(preparer.result.updates, func(i, j int) bool {
		return lessSeriesSample(preparer.result.updates[i], preparer.result.updates[j])
	})
	return &preparer.result, nil
}

func (p *batchPreparer) recordSkip(err *conversionError) {
	p.result.skippedCount++
	if len(p.result.skipMessages) < maxResourceSkipDiagnostics {
		p.result.skipMessages = append(p.result.skipMessages, fmt.Sprintf("%s: %s", err.code, err.Error()))
	}
}

// prepareResource converts one resource group. Any attribution failure discards the whole
// group rather than converting part of one client's export.
func (p *batchPreparer) prepareResource(resourceMetrics *metricsv1.ResourceMetrics, resourceBindings map[uint64]string) ([]factUpdate, error) {
	updates := make([]factUpdate, 0)
	resourceAttrs := resourceMetrics.GetResource().GetAttributes()
	for _, scopeMetrics := range resourceMetrics.GetScopeMetrics() {
		for _, metric := range scopeMetrics.GetMetrics() {
			mapping, supported := supportedMetrics[metric.GetName()]
			if !supported {
				p.recordUnknownMetric(metric.GetName())
				continue
			}
			sum := metric.GetSum()
			if sum == nil {
				return nil, permanentMetricError(errorUnsupportedMetricKind, "supported metric %s is not an OTLP sum", metric.GetName())
			}
			for _, point := range sum.GetDataPoints() {
				update, err := p.prepareDatapoint(metric, mapping, sum.GetAggregationTemporality(), resourceAttrs, point, resourceBindings)
				if err != nil {
					return nil, err
				}
				updates = append(updates, update)
			}
		}
	}
	return updates, nil
}

func (p *batchPreparer) prepareDatapoint(
	metric *metricsv1.Metric,
	mapping metricMapping,
	temporality metricsv1.AggregationTemporality,
	resourceAttrs []*commonv1.KeyValue,
	point *metricsv1.NumberDataPoint,
	resourceBindings map[uint64]string,
) (factUpdate, error) {
	pointAttrs := point.GetAttributes()
	teamSlug := attributeString(pointAttrs, devlakeTeamAttribute)
	if teamSlug == "" {
		return factUpdate{}, permanentMetricError(errorMissingTeam, "supported metric %s is missing trusted devlake_team attribution", metric.GetName())
	}
	observedAt, err := unixNanoTime(point.GetTimeUnixNano())
	if err != nil {
		return factUpdate{}, permanentMetricError(errorInvalidTimestamp, "supported metric %s has an invalid timestamp", metric.GetName())
	}
	connection, err := p.resolveConnection(teamSlug, observedAt)
	if err != nil {
		return factUpdate{}, err
	}
	organizationID, err := organizationIDFromAttributes(resourceAttrs, pointAttrs)
	if err != nil {
		return factUpdate{}, err
	}
	if err := p.checkOrganizationBinding(connection, organizationID, resourceBindings); err != nil {
		return factUpdate{}, err
	}
	identity, err := identityFromAttributes(pointAttrs)
	if err != nil {
		return factUpdate{}, err
	}
	if temporality != metricsv1.AggregationTemporality_AGGREGATION_TEMPORALITY_DELTA && temporality != metricsv1.AggregationTemporality_AGGREGATION_TEMPORALITY_CUMULATIVE {
		return factUpdate{}, permanentMetricError(errorUnsupportedTemporality, "metric %s has unsupported aggregation temporality", metric.GetName())
	}
	value, err := metricNumberFromPoint(point)
	if err != nil {
		return factUpdate{}, permanentMetricError(errorInvalidValue, "supported metric %s has an invalid numeric value", metric.GetName())
	}
	if !mapping.decimal && !value.isInteger() {
		return factUpdate{}, permanentMetricError(errorInvalidValue, "metric %s must have an integer value", metric.GetName())
	}
	column, err := mapping.columnFor(metric.GetName(), pointAttrs)
	if err != nil {
		return factUpdate{}, err
	}
	update := factUpdate{
		connection:     connection,
		organizationID: organizationID,
		identity:       identity,
		hour:           observedAt.Truncate(time.Hour),
		observedAt:     observedAt,
		metric:         metric.GetName(),
		fact:           mapping.fact,
		column:         column,
		model:          attributeString(pointAttrs, "model"),
		query:          defaultDimension(attributeString(pointAttrs, "query_source")),
		tool:           defaultDimension(attributeString(pointAttrs, "tool_name")),
		language:       defaultDimension(attributeString(pointAttrs, "language")),
		value:          value,
		temporality:    temporality,
		startNanos:     point.GetStartTimeUnixNano(),
		timeNanos:      point.GetTimeUnixNano(),
	}
	if mapping.fact == hourlyModelUsageFact && update.model == "" {
		return factUpdate{}, permanentMetricError(errorInvalidDimension, "metric %s is missing model", metric.GetName())
	}
	update.seriesHash = metricSeriesHash(connection.ID, metric, resourceAttrs, point)
	return update, nil
}

func (p *batchPreparer) recordUnknownMetric(name string) {
	if len(name) > maxDiagnosticNameLength {
		name = name[:maxDiagnosticNameLength]
	}
	if _, seen := p.unknownMetricSet[name]; seen || len(p.unknownMetricSet) >= maxUnknownMetricNames {
		return
	}
	p.unknownMetricSet[name] = struct{}{}
	p.result.unknownMetrics = append(p.result.unknownMetrics, name)
}

// resolveConnection selects the connection whose lifecycle contains the datapoint time,
// so delayed telemetry survives revocation and reuse of the same team slug.
func (p *batchPreparer) resolveConnection(teamSlug string, observedAt time.Time) (*models.OtelConnection, error) {
	connections, cached := p.connections[teamSlug]
	if !cached {
		if err := p.converter.db.All(&connections, dal.Where("team_slug = ?", teamSlug)); err != nil {
			return nil, &conversionError{code: errorConnectionLookup, err: fmt.Errorf("resolve OTel connection: %w", err)}
		}
		p.connections[teamSlug] = connections
	}
	var match *models.OtelConnection
	for _, connection := range connections {
		if connection.CreatedAt.After(observedAt) || (connection.RevokedAt != nil && !observedAt.Before(*connection.RevokedAt)) {
			continue
		}
		if match != nil {
			return nil, permanentMetricError(errorAmbiguousConnection, "telemetry for team %q has ambiguous connection history", teamSlug)
		}
		match = connection
	}
	if match == nil {
		return nil, permanentMetricError(errorConnectionNotFound, "telemetry for team %q has no connection at observed time", teamSlug)
	}
	return match, nil
}

// checkOrganizationBinding rejects telemetry for a connection that is bound, or will be
// bound by an accepted resource in this batch, to a different organization. Bindings from
// the current resource are recorded separately and kept only if the resource is accepted.
func (p *batchPreparer) checkOrganizationBinding(connection *models.OtelConnection, organizationID string, resourceBindings map[uint64]string) error {
	boundOrganizationID := p.pendingBindings[connection.ID]
	if boundOrganizationID == "" {
		boundOrganizationID = resourceBindings[connection.ID]
	}
	if connection.OrganizationId != nil {
		boundOrganizationID, _ = normalizeOrganizationID(*connection.OrganizationId)
	}
	if boundOrganizationID == "" {
		resourceBindings[connection.ID] = organizationID
		return nil
	}
	if boundOrganizationID != organizationID {
		return permanentMetricError(errorOrganizationMismatch, "telemetry for team %q does not match its connection organization", connection.TeamSlug)
	}
	return nil
}

// organizationIDFromAttributes returns the normalized organization UUID. Claude Code
// emits organization.id as a datapoint attribute; a resource value is accepted only
// when it agrees.
func organizationIDFromAttributes(resourceAttrs, pointAttrs []*commonv1.KeyValue) (string, error) {
	pointValue := attributeString(pointAttrs, organizationIDAttribute)
	resourceValue := attributeString(resourceAttrs, organizationIDAttribute)
	if pointValue == "" && resourceValue == "" {
		return "", permanentMetricError(errorMissingOrganization, "supported metric has no organization.id")
	}
	pointOrganizationID, pointValid := normalizeOrganizationID(pointValue)
	resourceOrganizationID, resourceValid := normalizeOrganizationID(resourceValue)
	if (pointValue != "" && !pointValid) || (resourceValue != "" && !resourceValid) {
		return "", permanentMetricError(errorInvalidOrganization, "supported metric has an invalid organization.id")
	}
	if pointValue != "" && resourceValue != "" && pointOrganizationID != resourceOrganizationID {
		return "", permanentMetricError(errorOrganizationMismatch, "resource and datapoint organization IDs differ")
	}
	if pointOrganizationID != "" {
		return pointOrganizationID, nil
	}
	return resourceOrganizationID, nil
}

// normalizeOrganizationID accepts only the bare hyphenated UUID form and returns it
// lowercased, so equal organizations compare equal regardless of client casing.
func normalizeOrganizationID(value string) (string, bool) {
	if len(value) != len(uuid.Nil.String()) {
		return "", false
	}
	organizationID, err := uuid.Parse(value)
	if err != nil {
		return "", false
	}
	return organizationID.String(), true
}

func identityFromAttributes(attributes []*commonv1.KeyValue) (developerIdentity, error) {
	accountID := attributeString(attributes, "user.account_id")
	accountUUID := attributeString(attributes, "user.account_uuid")
	email := strings.ToLower(attributeString(attributes, "user.email"))
	installID := attributeString(attributes, "user.id")
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
		return developerIdentity{}, permanentMetricError(errorMissingUserIdentity, "supported metric has no stable user identity")
	}
	return identity, nil
}
