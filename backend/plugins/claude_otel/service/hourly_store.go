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
	"math/big"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	metricsv1 "go.opentelemetry.io/proto/otlp/metrics/v1"
)

const seriesTemporalityCumulative = "cumulative"

var hourlyIdentityColumns = []string{
	"connection_id", "team_slug", "organization_id", "user_key", "user_account_id", "user_account_uuid", "user_email", "hour_start",
}

// applyHourlyUpdates writes one batch's prepared facts inside the conversion transaction.
func (c *rawConverter) applyHourlyUpdates(tx dal.Transaction, updates []factUpdate) error {
	expected := make(map[uint64]string)
	for _, update := range updates {
		if err := expectOrganization(expected, update.connection.ID, update.organizationID); err != nil {
			return err
		}
	}
	if err := bindConnectionOrganizations(tx, expected); err != nil {
		return err
	}
	for _, update := range updates {
		value, err := c.counterDelta(tx, update)
		if err != nil {
			return err
		}
		if err := upsertHourlyFact(tx, update, value, update.observedAt); err != nil {
			return classifyStorageError(fmt.Errorf("write hourly Claude Code OTel facts: %w", err))
		}
	}
	return nil
}

// expectOrganization records the organization a connection must have in this commit and rejects a second, different one.
func expectOrganization(expected map[uint64]string, connectionID uint64, organizationID string) error {
	if previous, seen := expected[connectionID]; seen && previous != organizationID {
		return &conversionError{code: errorOrganizationMismatch, err: fmt.Errorf("telemetry gives OTel connection %d two organizations", connectionID)}
	}
	expected[connectionID] = organizationID
	return nil
}

// bindConnectionOrganizations locks the commit's connections in id order, binds unbound ones and
// rejects any rebound since preparation, so a concurrent rebind cannot interleave.
func bindConnectionOrganizations(tx dal.Transaction, expected map[uint64]string) error {
	if len(expected) == 0 {
		return nil
	}
	ids := make([]uint64, 0, len(expected))
	for id := range expected {
		ids = append(ids, id)
	}
	connections, err := lockOtelConnections(tx, ids)
	if err != nil {
		return classifyStorageError(err)
	}
	if len(connections) != len(ids) {
		return &conversionError{code: errorConnectionNotFound, err: fmt.Errorf("an OTel connection of this commit no longer exists")}
	}
	for _, connection := range connections {
		organizationID := expected[connection.ID]
		if connection.OrganizationId == nil {
			if err := tx.UpdateColumns(
				&models.OtelConnection{},
				[]dal.DalSet{{ColumnName: "organization_id", Value: organizationID}},
				dal.Where("id = ? AND organization_id IS NULL", connection.ID),
			); err != nil {
				return classifyStorageError(fmt.Errorf("bind OTel connection organization: %w", err))
			}
			continue
		}
		bound, valid := normalizeOrganizationID(*connection.OrganizationId)
		if !valid {
			return permanentConversionError(errorInvalidOrganization, "OTel connection %d has an invalid stored organization", connection.ID)
		}
		if bound != organizationID {
			return &conversionError{code: errorOrganizationMismatch, err: fmt.Errorf("OTel connection %d was rebound to another organization concurrently", connection.ID)}
		}
	}
	return nil
}

// seriesSample is the last applied sample of one cumulative counter.
type seriesSample struct {
	timeNanos uint64
	value     *big.Rat
}

// counterDelta returns the usage contributed by one sample and advances the persisted
// state of its cumulative counter. DELTA samples are already usage.
func (c *rawConverter) counterDelta(tx dal.Transaction, update factUpdate) (metricNumber, error) {
	if update.temporality == metricsv1.AggregationTemporality_AGGREGATION_TEMPORALITY_DELTA {
		return update.value, nil
	}
	state := &models.OtelMetricSeriesState{}
	var previous *seriesSample
	loadErr := tx.First(state, dal.Where("series_hash = ?", update.seriesHash), dal.Lock(true, false))
	if loadErr != nil && !tx.IsErrorNotFound(loadErr) {
		return metricNumber{}, classifyStorageError(fmt.Errorf("load OTel series state: %w", loadErr))
	}
	if loadErr == nil && state.LastNumberValue != nil {
		lastValue, ok := new(big.Rat).SetString(*state.LastNumberValue)
		if !ok {
			return metricNumber{}, permanentConversionError(errorInvalidSeriesState, "metric %s has invalid cumulative state", update.metric)
		}
		previous = &seriesSample{timeNanos: state.LastTimeUnixNano, value: lastValue}
	}
	delta, err := cumulativeIncrease(previous, update)
	if err != nil {
		return metricNumber{}, err
	}
	lastValue := update.value.decimalString()
	state = &models.OtelMetricSeriesState{
		SeriesHash:        update.seriesHash,
		ConnectionId:      update.connection.ID,
		MetricName:        update.metric,
		Temporality:       seriesTemporalityCumulative,
		StartTimeUnixNano: update.startNanos,
		LastTimeUnixNano:  update.timeNanos,
		LastNumberValue:   &lastValue,
		UpdatedAt:         c.now().UTC(),
	}
	if err := tx.CreateOrUpdate(state); err != nil {
		return metricNumber{}, classifyStorageError(fmt.Errorf("save OTel series state: %w", err))
	}
	return delta, nil
}

// cumulativeIncrease returns a cumulative sample's increase over the previous sample of the
// same counter. A first sample counts from the counter start, and a lower value is a reset.
func cumulativeIncrease(previous *seriesSample, update factUpdate) (metricNumber, error) {
	if previous == nil {
		return update.value, nil
	}
	if update.timeNanos <= previous.timeNanos {
		return metricNumber{}, permanentConversionError(errorOutOfOrderCumulative, "metric %s has an out-of-order cumulative sample", update.metric)
	}
	if update.value.value.Cmp(previous.value) < 0 {
		return update.value, nil
	}
	return metricNumber{value: new(big.Rat).Sub(update.value.value, previous.value)}, nil
}

// upsertHourlyFact adds one metric value observed from update.observedAt through
// lastObservedAt to its hourly fact row. Column names come only from the allowlisted
// metric mapping, never from telemetry.
func upsertHourlyFact(tx dal.Transaction, update factUpdate, value metricNumber, lastObservedAt time.Time) error {
	table, dimensionColumns, dimensionValues := hourlyFactTarget(update)
	columns := append(append(append([]string{}, hourlyIdentityColumns...), dimensionColumns...), update.column, "first_observed_at", "last_observed_at", "created_at", "updated_at")
	params := append([]interface{}{
		update.connection.ID, update.connection.TeamSlug, update.organizationID, update.identity.key,
		update.identity.accountID, update.identity.accountUUID, update.identity.email, update.hour,
	}, dimensionValues...)
	params = append(params, value.sqlString(), update.observedAt, lastObservedAt)
	placeholders := strings.TrimSuffix(strings.Repeat("?, ", len(params)), ", ")
	// MySQL 8.0.19+ row aliases are an explicit deployment dependency.
	query := fmt.Sprintf(
		"INSERT INTO %[1]s (%[2]s) VALUES (%[3]s, NOW(), NOW()) AS incoming "+
			"ON DUPLICATE KEY UPDATE %[4]s = %[1]s.%[4]s + incoming.%[4]s, "+
			"first_observed_at = LEAST(%[1]s.first_observed_at, incoming.first_observed_at), "+
			"last_observed_at = GREATEST(%[1]s.last_observed_at, incoming.last_observed_at), updated_at = NOW()",
		table, strings.Join(columns, ", "), placeholders, update.column,
	)
	return tx.Exec(query, params...)
}

func hourlyFactTarget(update factUpdate) (string, []string, []interface{}) {
	switch update.fact {
	case hourlyModelUsageFact:
		return models.OtelHourlyModelUsageTable, []string{"model", "query_source"}, []interface{}{update.model, update.query}
	case hourlyToolUsageFact:
		return models.OtelHourlyToolUsageTable, []string{"tool_name", "language"}, []interface{}{update.tool, update.language}
	default:
		return models.OtelHourlyActivityTable, nil, nil
	}
}
