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

package e2e

import (
	"crypto/sha256"
	"strconv"
	"time"

	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/require"
	collectorlogs "go.opentelemetry.io/proto/otlp/collector/logs/v1"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	logsv1 "go.opentelemetry.io/proto/otlp/logs/v1"
	metricsv1 "go.opentelemetry.io/proto/otlp/metrics/v1"
	resourcev1 "go.opentelemetry.io/proto/otlp/resource/v1"
	"google.golang.org/protobuf/proto"
)

const (
	orgR = "11111111-1111-4111-8111-111111111111"
	orgW = "22222222-2222-4222-8222-222222222222"
	orgB = "33333333-3333-4333-8333-333333333333"
	orgC = "44444444-4444-4444-8444-444444444444"
)

var (
	fxModels   = []string{"claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5[1m]", "claude-sonnet-5"}
	fxQueries  = []string{"main", "auxiliary", "subagent"}
	fxEfforts  = []string{"low", "medium", "high", "xhigh", "max"}
	fxTools    = []string{"Edit", "Write"}
	fxLangs    = []string{"Markdown", "Python", "TypeScript"}
	fxSources  = []string{"config", "user_permanent", "user_temporary", "user_reject"}
	fxTerminal = []string{"non-interactive", "non-interactive", "non-interactive", "vscode", "tmux"}
)

// actor is one developer sending under one connection's team and organization.
type actor struct {
	name string
	team string
	org  string
	idx  int
}

func (a actor) email() string     { return a.name + "@example.com" }
func (a actor) accountID() string { return "acct-" + a.name }
func (a actor) userKey() string   { return "acct:" + a.accountID() }

// logUserKey is the key log events carry, since they send no user.account_id.
func (a actor) logUserKey() string { return "uuid:uuid-" + a.name }

// promptID is the prompt.id the actor's log resource for the seed carries.
func (a actor) promptID(seed int) string {
	return "p-" + a.team + "-" + a.name + "-" + strconv.Itoa(seed)
}

var (
	a1      = actor{"alpha1", "alpha", orgR, 1}
	a2      = actor{"alpha2", "alpha", orgR, 2}
	a3      = actor{"alpha3", "alpha", orgR, 3}
	a4      = actor{"alpha4", "alpha", orgR, 4}
	a5      = actor{"alpha5", "alpha", orgR, 5}
	stray   = actor{"stray", "alpha", orgW, 6}
	b1      = actor{"beta1", "beta", orgB, 7}
	b2      = actor{"beta2", "beta", orgB, 8}
	b3      = actor{"beta3", "beta", orgB, 9}
	g1      = actor{"gamma1", "gamma", orgC, 10}
	g2      = actor{"gamma2", "gamma", orgC, 11}
	sharedA = actor{"shared", "alpha", orgR, 12}
	sharedB = actor{"shared", "beta", orgB, 13}
	d1      = actor{"delta1", "delta", orgR, 14}
	d2      = actor{"delta2", "delta", orgR, 15}
	d3      = actor{"delta3", "delta", orgR, 16}
	d4      = actor{"delta4", "delta", orgR, 17}
)

// baseLayout lists the actors whose resources share each of the three batches of a day.
var baseLayout = [][]actor{
	{a1, a2, b1, g1, sharedA},
	{a3, a4, b2, g2, stray, sharedB},
	{a5, a1, b3, b1, sharedA},
}

func strAttr(key, value string) *commonv1.KeyValue {
	return &commonv1.KeyValue{Key: key, Value: &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: value}}}
}

func withAttrs(base []*commonv1.KeyValue, extra ...*commonv1.KeyValue) []*commonv1.KeyValue {
	out := make([]*commonv1.KeyValue, 0, len(base)+len(extra))
	return append(append(out, base...), extra...)
}

func dataPoint(attrs []*commonv1.KeyValue, at time.Time, value float64, asInt bool) *metricsv1.NumberDataPoint {
	point := &metricsv1.NumberDataPoint{
		Attributes:        attrs,
		StartTimeUnixNano: uint64(at.Add(-time.Minute).UnixNano()),
		TimeUnixNano:      uint64(at.UnixNano()),
	}
	if asInt {
		point.Value = &metricsv1.NumberDataPoint_AsInt{AsInt: int64(value)}
	} else {
		point.Value = &metricsv1.NumberDataPoint_AsDouble{AsDouble: value}
	}
	return point
}

func deltaSum(name string, points ...*metricsv1.NumberDataPoint) *metricsv1.Metric {
	return &metricsv1.Metric{Name: name, Data: &metricsv1.Metric_Sum{Sum: &metricsv1.Sum{
		AggregationTemporality: metricsv1.AggregationTemporality_AGGREGATION_TEMPORALITY_DELTA,
		IsMonotonic:            true,
		DataPoints:             points,
	}}}
}

// resource builds one Claude Code client export; the seed varies every value.
func (a actor) resource(at time.Time, seed int) *metricsv1.ResourceMetrics {
	resourceAttrs := []*commonv1.KeyValue{
		strAttr("service.name", "claude-code"),
		strAttr("service.version", "2.1."+string(rune('0'+seed%10))),
		strAttr("os.type", "darwin"),
		strAttr("os.version", "25.5.0"),
		strAttr("host.arch", "arm64"),
	}
	base := []*commonv1.KeyValue{
		strAttr("devlake_team", a.team),
		strAttr("devlake_auth_username", "otel-"+a.team),
		strAttr("organization.id", a.org),
		strAttr("user.account_id", a.accountID()),
		strAttr("user.account_uuid", "uuid-"+a.name),
		strAttr("user.email", a.email()),
		strAttr("user.id", "install-"+a.name),
		strAttr("terminal.type", fxTerminal[seed%len(fxTerminal)]),
	}
	if seed%5 == 0 {
		base = append(base, strAttr("os.type", "darwin"), strAttr("host.arch", "arm64"))
	}
	model, query, effort := fxModels[seed%len(fxModels)], fxQueries[seed%len(fxQueries)], fxEfforts[seed%len(fxEfforts)]
	tick := 0
	next := func() time.Time {
		tick++
		return at.Add(time.Duration(tick) * time.Second)
	}
	tokenAttrs := func(kind string) []*commonv1.KeyValue {
		return withAttrs(base, strAttr("type", kind), strAttr("model", model), strAttr("query_source", query), strAttr("effort", effort))
	}
	f := float64(seed)
	metrics := []*metricsv1.Metric{
		deltaSum("claude_code.token.usage",
			dataPoint(tokenAttrs("input"), next(), f*113, false),
			dataPoint(tokenAttrs("output"), next(), f*29+7, false),
			dataPoint(tokenAttrs("cacheRead"), next(), f*457, true),
			dataPoint(tokenAttrs("cacheCreation"), next(), f*61+3, false)),
		deltaSum("claude_code.cost.usage",
			dataPoint(withAttrs(base, strAttr("model", model), strAttr("query_source", query), strAttr("effort", effort)), next(), f*0.0125+0.0003, false)),
		deltaSum("claude_code.active_time.total",
			dataPoint(withAttrs(base, strAttr("type", "cli")), next(), f*3.25, false),
			dataPoint(withAttrs(base, strAttr("type", "user")), next(), f*1.5+0.25, false)),
		deltaSum("claude_code.lines_of_code.count",
			dataPoint(withAttrs(base, strAttr("type", "added"), strAttr("model", model)), next(), f*5+2, false),
			dataPoint(withAttrs(base, strAttr("type", "removed"), strAttr("model", model)), next(), f*2+1, false)),
		deltaSum("claude_code.code_edit_tool.decision",
			dataPoint(withAttrs(base, strAttr("tool_name", fxTools[seed%len(fxTools)]), strAttr("decision", "accept"), strAttr("source", fxSources[seed%len(fxSources)]), strAttr("language", fxLangs[seed%len(fxLangs)])), next(), float64(seed%4+1), false),
			dataPoint(withAttrs(base, strAttr("tool_name", fxTools[seed%len(fxTools)]), strAttr("decision", "reject"), strAttr("source", "user_reject"), strAttr("language", fxLangs[seed%len(fxLangs)])), next(), float64(seed%3+1), false)),
		deltaSum("claude_code.session.count",
			dataPoint(withAttrs(base, strAttr("start_type", []string{"fresh", "resume"}[seed%2])), next(), float64(seed%3+1), false)),
		deltaSum("claude_code.commit.count", dataPoint(base, next(), float64(seed%4+1), false)),
	}
	return &metricsv1.ResourceMetrics{
		Resource:     &resourcev1.Resource{Attributes: resourceAttrs},
		ScopeMetrics: []*metricsv1.ScopeMetrics{{Metrics: metrics}},
	}
}

// resourceSpec places one actor's export at a time with a value seed.
type resourceSpec struct {
	who  actor
	at   time.Time
	seed int
}

// insertBatch stores one raw batch the way the ingest path does.
func (w *world) insertBatch(specs []resourceSpec) *models.OtelMetricBatch {
	request := &collectormetrics.ExportMetricsServiceRequest{}
	for _, spec := range specs {
		request.ResourceMetrics = append(request.ResourceMetrics, spec.who.resource(spec.at, spec.seed))
	}
	payload, err := proto.MarshalOptions{Deterministic: true}.Marshal(request)
	require.NoError(w.t, err)
	hash := sha256.Sum256(payload)
	var minAt, maxAt time.Time
	datapoints := 0
	for _, resource := range request.ResourceMetrics {
		for _, metric := range resource.ScopeMetrics[0].Metrics {
			for _, point := range metric.GetSum().DataPoints {
				datapoints++
				observed := time.Unix(0, int64(point.TimeUnixNano)).UTC()
				if minAt.IsZero() || observed.Before(minAt) {
					minAt = observed
				}
				if observed.After(maxAt) {
					maxAt = observed
				}
			}
		}
	}
	batch := &models.OtelMetricBatch{
		ReceivedAt:           maxAt.Add(10 * time.Second),
		PayloadSha256:        hash[:],
		PayloadProto:         payload,
		PayloadSchemaVersion: 1,
		ResourceCount:        len(request.ResourceMetrics),
		DatapointCount:       datapoints,
		MinObservedAt:        &minAt,
		MaxObservedAt:        &maxAt,
		Status:               models.OtelBatchStatusPending,
	}
	require.NoError(w.t, w.tester.Dal.Create(batch))
	return batch
}

// slot returns the observation time of a batch inside a day.
func (w *world) slot(day time.Time, batchIdx int) time.Time {
	hours, minutes := [3]int{4, 11, 4}, [3]int{10, 25, 40}
	if day.Equal(w.today) {
		if w.now.Hour() >= 3 {
			hours = [3]int{1, 2, 1}
		} else {
			hours, minutes = [3]int{0, 0, 0}, [3]int{1, 2, 3}
		}
	}
	return day.Add(time.Duration(hours[batchIdx])*time.Hour + time.Duration(minutes[batchIdx])*time.Minute)
}

// seedBatches stores three mixed-team batches for each of the given days.
func (w *world) seedBatches(layout [][]actor, days ...time.Time) []*models.OtelMetricBatch {
	batches := make([]*models.OtelMetricBatch, 0, len(days)*len(layout))
	for dayIdx, day := range days {
		for batchIdx, actors := range layout {
			specs := make([]resourceSpec, 0, len(actors))
			for resIdx, who := range actors {
				at := w.slot(day, batchIdx).Add(time.Duration(resIdx) * 20 * time.Second)
				specs = append(specs, resourceSpec{who: who, at: at, seed: who.idx*37 + dayIdx*11 + batchIdx*3 + 1})
			}
			batches = append(batches, w.insertBatch(specs))
		}
	}
	return batches
}

func intAttr(key string, value int64) *commonv1.KeyValue {
	return &commonv1.KeyValue{Key: key, Value: &commonv1.AnyValue{Value: &commonv1.AnyValue_IntValue{IntValue: value}}}
}

func doubleAttr(key string, value float64) *commonv1.KeyValue {
	return &commonv1.KeyValue{Key: key, Value: &commonv1.AnyValue{Value: &commonv1.AnyValue_DoubleValue{DoubleValue: value}}}
}

// logResource builds one Claude Code client's log export for a session: a prompt, its API request, a tool decision and result, and the response.
func (a actor) logResource(at time.Time, seed int) *logsv1.ResourceLogs {
	session := "sess-" + a.team + "-" + a.name + "-" + strconv.Itoa(seed)
	prompt := a.promptID(seed)
	model, query, effort := fxModels[seed%len(fxModels)], fxQueries[seed%len(fxQueries)], fxEfforts[seed%len(fxEfforts)]
	tool := fxTools[seed%len(fxTools)]
	toolUse := "tu-" + strconv.Itoa(seed)
	sequence := int64(0)
	record := func(name string, extra ...*commonv1.KeyValue) *logsv1.LogRecord {
		sequence++
		base := []*commonv1.KeyValue{
			strAttr("devlake_team", a.team),
			strAttr("event.name", name),
			intAttr("event.sequence", sequence),
			strAttr("session.id", session),
			strAttr("organization.id", a.org),
			strAttr("user.account_uuid", "uuid-"+a.name),
			strAttr("user.email", a.email()),
			strAttr("user.id", "install-"+a.name),
			strAttr("terminal.type", fxTerminal[seed%len(fxTerminal)]),
			strAttr("prompt.id", prompt),
			strAttr("event.timestamp", at.Add(time.Duration(sequence)*time.Second).UTC().Format("2006-01-02T15:04:05.000Z")),
		}
		return &logsv1.LogRecord{Body: &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: "claude_code." + name}}, Attributes: withAttrs(base, extra...)}
	}
	f := int64(seed)
	records := []*logsv1.LogRecord{
		record("user_prompt", intAttr("prompt_length", 20+f%50), strAttr("prompt_text", "synthetic prompt "+strconv.Itoa(seed))),
		record("api_request", strAttr("model", model), intAttr("input_tokens", f*113), intAttr("output_tokens", f*29+7), intAttr("cache_read_tokens", f*457),
			intAttr("cache_creation_tokens", f*61+3), doubleAttr("cost_usd", float64(seed)*0.0125+0.0003), intAttr("duration_ms", 900+f*7), strAttr("query_source", query), strAttr("effort", effort), strAttr("request_id", "req-"+strconv.Itoa(seed))),
		record("tool_decision", strAttr("tool_name", tool), strAttr("tool_use_id", toolUse), strAttr("decision", []string{"accept", "reject"}[seed%2]), strAttr("source", fxSources[seed%len(fxSources)])),
		record("tool_result", strAttr("tool_name", tool), strAttr("tool_use_id", toolUse), strAttr("success", []string{"true", "false"}[seed%2]), intAttr("duration_ms", 10+f)),
		record("assistant_response", intAttr("response_length", 100+f*3), strAttr("model", model)),
	}
	return &logsv1.ResourceLogs{
		Resource: &resourcev1.Resource{Attributes: []*commonv1.KeyValue{
			strAttr("service.name", "claude-code"),
			strAttr("service.version", "2.1."+string(rune('0'+seed%10))),
		}},
		ScopeLogs: []*logsv1.ScopeLogs{{Scope: &commonv1.InstrumentationScope{Name: "com.anthropic.claude_code.events", Version: "2.1.300"}, LogRecords: records}},
	}
}

// insertLogBatch stores one raw log batch the way the ingest path does.
func (w *world) insertLogBatch(specs []resourceSpec) *models.OtelLogBatch {
	request := &collectorlogs.ExportLogsServiceRequest{}
	for _, spec := range specs {
		request.ResourceLogs = append(request.ResourceLogs, spec.who.logResource(spec.at, spec.seed))
	}
	payload, err := proto.MarshalOptions{Deterministic: true}.Marshal(request)
	require.NoError(w.t, err)
	hash := sha256.Sum256(payload)
	var minAt, maxAt time.Time
	records := 0
	for _, resource := range request.ResourceLogs {
		for _, record := range resource.ScopeLogs[0].LogRecords {
			records++
			timestamp := ""
			for _, attribute := range record.GetAttributes() {
				if attribute.GetKey() == "event.timestamp" {
					timestamp = attribute.GetValue().GetStringValue()
					break
				}
			}
			require.NotEmpty(w.t, timestamp)
			observed, err := time.Parse(time.RFC3339Nano, timestamp)
			require.NoError(w.t, err)
			if minAt.IsZero() || observed.Before(minAt) {
				minAt = observed
			}
			if observed.After(maxAt) {
				maxAt = observed
			}
		}
	}
	batch := &models.OtelLogBatch{
		ReceivedAt:           maxAt.Add(10 * time.Second),
		PayloadSha256:        hash[:],
		PayloadProto:         payload,
		PayloadSchemaVersion: 1,
		ResourceCount:        len(request.ResourceLogs),
		RecordCount:          records,
		MinObservedAt:        &minAt,
		MaxObservedAt:        &maxAt,
		Status:               models.OtelBatchStatusPending,
	}
	require.NoError(w.t, w.tester.Dal.Create(batch))
	return batch
}

// seedLogBatches stores one mixed-team log batch per layout entry for each of the given days.
func (w *world) seedLogBatches(layout [][]actor, days ...time.Time) []*models.OtelLogBatch {
	batches := make([]*models.OtelLogBatch, 0, len(days)*len(layout))
	for dayIdx, day := range days {
		for batchIdx, actors := range layout {
			specs := make([]resourceSpec, 0, len(actors))
			for resIdx, who := range actors {
				at := w.slot(day, batchIdx).Add(time.Duration(resIdx) * 20 * time.Second)
				specs = append(specs, resourceSpec{who: who, at: at, seed: who.idx*37 + dayIdx*11 + batchIdx*3 + 1})
			}
			batches = append(batches, w.insertLogBatch(specs))
		}
	}
	return batches
}

// connection inserts an active connection bound to the organization.
func (w *world) connection(team, org string, createdAt time.Time) *models.OtelConnection {
	connection := &models.OtelConnection{
		Model:          common.Model{CreatedAt: createdAt, UpdatedAt: createdAt},
		Name:           team,
		TeamName:       team,
		TeamSlug:       team,
		Status:         models.OtelConnectionStatusActive,
		OrganizationId: &org,
	}
	require.NoError(w.t, w.tester.Dal.Create(connection))
	return connection
}
