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
	"bytes"
	"crypto/sha256"
	"fmt"
	"math"
	"math/big"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	metricsv1 "go.opentelemetry.io/proto/otlp/metrics/v1"
	"google.golang.org/protobuf/proto"
)

const (
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

	// metricDecimalScale matches the series-state DECIMAL(38,9) column.
	metricDecimalScale = 9
	unknownDimension   = "unknown"
)

type hourlyFact int

const (
	hourlyActivityFact hourlyFact = iota
	hourlyModelUsageFact
	hourlyToolUsageFact
)

// metricMapping is the allowlisted destination of one Claude Code metric. A metric maps
// either to one column, or to the column selected by a datapoint dimension attribute.
type metricMapping struct {
	fact             hourlyFact
	column           string
	dimension        string
	dimensionColumns map[string]string
	decimal          bool
}

var (
	tokenUsageMapping = metricMapping{fact: hourlyModelUsageFact, dimension: "type", dimensionColumns: map[string]string{
		"input": "input_tokens", "output": "output_tokens", "cacheRead": "cache_read_tokens", "cacheCreation": "cache_creation_tokens",
	}}
	activeTimeMapping = metricMapping{fact: hourlyActivityFact, column: "active_time_seconds", decimal: true}
	costUsageMapping  = metricMapping{fact: hourlyModelUsageFact, column: "estimated_cost_usd", decimal: true}

	supportedMetrics = map[string]metricMapping{
		metricSessionCount:     {fact: hourlyActivityFact, column: "session_count"},
		metricActiveTime:       activeTimeMapping,
		metricActiveTimeLegacy: activeTimeMapping,
		metricLinesOfCode: {fact: hourlyActivityFact, dimension: "type", dimensionColumns: map[string]string{
			"added": "lines_added", "removed": "lines_removed",
		}},
		metricCommitCount:      {fact: hourlyActivityFact, column: "commits_created"},
		metricPullRequestCount: {fact: hourlyActivityFact, column: "prs_created"},
		metricTokenUsage:       tokenUsageMapping,
		metricTokenUsageLegacy: tokenUsageMapping,
		metricCostUsage:        costUsageMapping,
		metricCostUsageLegacy:  costUsageMapping,
		metricToolDecision: {fact: hourlyToolUsageFact, dimension: "decision", dimensionColumns: map[string]string{
			"accept": "accepted_count", "reject": "rejected_count",
		}},
	}
)

type factUpdate struct {
	connection     *models.OtelConnection
	organizationID string
	identity       developerIdentity
	hour           time.Time
	observedAt     time.Time
	metric         string
	fact           hourlyFact
	column         string
	model          string
	query          string
	tool           string
	language       string
	value          metricNumber
	temporality    metricsv1.AggregationTemporality
	startNanos     uint64
	timeNanos      uint64
	seriesHash     []byte
}

type developerIdentity struct {
	key         string
	accountID   *string
	accountUUID *string
	email       *string
}

// metricNumber is an exact non-negative value normalized to metricDecimalScale, so
// cumulative subtraction never inherits float64 rounding drift.
type metricNumber struct {
	value *big.Rat
}

func (n metricNumber) decimalString() string { return n.value.FloatString(metricDecimalScale) }

func (n metricNumber) isInteger() bool { return n.value.IsInt() }

// sqlString keeps integers in integer form so BIGINT columns accept them in strict mode.
func (n metricNumber) sqlString() string {
	if n.isInteger() {
		return n.value.Num().String()
	}
	return n.decimalString()
}

func (m metricMapping) columnFor(metricName string, attributes []*commonv1.KeyValue) (string, error) {
	if m.column != "" {
		return m.column, nil
	}
	column := m.dimensionColumns[attributeString(attributes, m.dimension)]
	if column == "" {
		return "", permanentMetricError(errorInvalidDimension, "metric %s has an invalid %s dimension", metricName, m.dimension)
	}
	return column, nil
}

func metricNumberFromPoint(point *metricsv1.NumberDataPoint) (metricNumber, error) {
	switch value := point.Value.(type) {
	case *metricsv1.NumberDataPoint_AsInt:
		if value.AsInt < 0 {
			return metricNumber{}, fmt.Errorf("negative number")
		}
		return metricNumber{value: new(big.Rat).SetInt64(value.AsInt)}, nil
	case *metricsv1.NumberDataPoint_AsDouble:
		if math.IsNaN(value.AsDouble) || math.IsInf(value.AsDouble, 0) || value.AsDouble < 0 {
			return metricNumber{}, fmt.Errorf("non-finite or negative number")
		}
		if value.AsDouble >= math.MaxInt64 {
			return metricNumber{}, fmt.Errorf("number exceeds supported range")
		}
		// Claude Code emits integral counters as doubles. Normalizing through the stored
		// scale keeps integral values exact and fractional values comparable with state.
		normalized, ok := new(big.Rat).SetString(strconv.FormatFloat(value.AsDouble, 'f', metricDecimalScale, 64))
		if !ok {
			return metricNumber{}, fmt.Errorf("invalid number")
		}
		return metricNumber{value: normalized}, nil
	default:
		return metricNumber{}, fmt.Errorf("missing number")
	}
}

func unixNanoTime(value uint64) (time.Time, error) {
	if value == 0 || value > math.MaxInt64 {
		return time.Time{}, fmt.Errorf("invalid timestamp")
	}
	return time.Unix(0, int64(value)).UTC(), nil
}

// metricSeriesHash identifies one SDK counter. Every resource and datapoint attribute is
// part of OTLP series identity: attributes such as effort or terminal.type distinguish
// separate counters. Managed settings omit session.id, so concurrent CLI sessions of one
// developer share attributes; the counter start time keeps their cumulative counters apart.
func metricSeriesHash(connectionID uint64, metric *metricsv1.Metric, resourceAttrs []*commonv1.KeyValue, point *metricsv1.NumberDataPoint) []byte {
	identity := []string{strconv.FormatUint(connectionID, 10), metric.GetName(), metric.GetUnit(), strconv.FormatUint(point.GetStartTimeUnixNano(), 10)}
	attributes := append(prefixedAttributes("resource", resourceAttrs), prefixedAttributes("point", point.GetAttributes())...)
	sort.Strings(attributes)
	hash := sha256.Sum256([]byte(strings.Join(append(identity, attributes...), "\x00")))
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

// lessSeriesSample orders samples of one series by time before series state is updated.
// Fact sums are order-independent.
func lessSeriesSample(left, right factUpdate) bool {
	if order := bytes.Compare(left.seriesHash, right.seriesHash); order != 0 {
		return order < 0
	}
	return left.timeNanos < right.timeNanos
}

func defaultDimension(value string) string {
	if value == "" {
		return unknownDimension
	}
	return value
}

func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
