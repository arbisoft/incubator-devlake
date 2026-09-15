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
	"crypto/subtle"
	"io"
	"mime"
	"net/http"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/config"
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/log"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
	metricsv1 "go.opentelemetry.io/proto/otlp/metrics/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

const (
	claudeOtelIngestTokenKey    = "CLAUDE_OTEL_INGEST_TOKEN"
	claudeOtelIngestTokenHeader = "X-Claude-Otel-Ingest-Token"
	maxOtelIngestBodyBytes      = 2 << 20
	otlpProtobufContentType     = "application/x-protobuf"
	otelPayloadSchemaVersion    = 1
	devlakeTeamAttribute        = "devlake_team"
	devlakeProjectAttribute     = "devlake_project"
	organizationIDAttribute     = "organization.id"
)

type RawIngestResult struct {
	BatchID   uint64
	Duplicate bool
}

// RawIngestService owns the authenticated OTLP request-to-raw-record transition.
// It deliberately does no metric aggregation; the raw metric converter derives facts.
type RawIngestService struct {
	db     dal.Dal
	cfg    config.ConfigReader
	logger log.Logger
	now    func() time.Time
}

func DefaultRawIngestService() *RawIngestService {
	return rawIngest
}

func NewRawIngestService(db dal.Dal, cfg config.ConfigReader, logger log.Logger) *RawIngestService {
	return &RawIngestService{db: db, cfg: cfg, logger: logger, now: time.Now}
}

func (s *RawIngestService) Ingest(request *http.Request) (*RawIngestResult, errors.Error) {
	if request == nil || request.Body == nil {
		return nil, errors.BadInput.New("OTLP protobuf request body is required")
	}
	if err := validateOtelIngestContentType(request.Header.Get("Content-Type")); err != nil {
		return nil, err
	}
	if err := s.authenticate(request.Header.Get(claudeOtelIngestTokenHeader)); err != nil {
		return nil, err
	}

	body, err := readOtelIngestBody(request.Body)
	if err != nil {
		return nil, err
	}
	metricsRequest := &collectormetrics.ExportMetricsServiceRequest{}
	if err := proto.Unmarshal(body, metricsRequest); err != nil {
		return nil, errors.BadInput.New("invalid OTLP metrics protobuf payload")
	}
	resourceCount, datapointCount, err := validateOtelMetricsRequest(metricsRequest)
	if err != nil {
		return nil, err
	}
	minObservedAt, maxObservedAt := observedTimeRange(metricsRequest.GetResourceMetrics())
	deterministicPayload, marshalErr := proto.MarshalOptions{Deterministic: true}.Marshal(metricsRequest)
	if marshalErr != nil {
		return nil, errors.Default.Wrap(marshalErr, "failed to canonicalize OTLP metrics payload")
	}
	payloadJSON, marshalErr := protojson.MarshalOptions{UseProtoNames: true}.Marshal(metricsRequest)
	if marshalErr != nil {
		return nil, errors.Default.Wrap(marshalErr, "failed to create OTLP metrics diagnostic projection")
	}

	now := s.now().UTC()
	payloadHash := sha256.Sum256(deterministicPayload)
	batch := &models.OtelMetricBatch{
		ReceivedAt:           now,
		PayloadSha256:        payloadHash[:],
		PayloadProto:         deterministicPayload,
		PayloadJSON:          pointerToString(string(payloadJSON)),
		PayloadSchemaVersion: otelPayloadSchemaVersion,
		ResourceCount:        resourceCount,
		DatapointCount:       datapointCount,
		MinObservedAt:        minObservedAt,
		MaxObservedAt:        maxObservedAt,
		Status:               models.OtelMetricBatchStatusPending,
	}

	tx := s.db.Begin()
	if err := tx.Create(batch); err != nil {
		if rollbackErr := tx.Rollback(); rollbackErr != nil && s.logger != nil {
			s.logger.Warn(rollbackErr, "failed to roll back Claude Code OTel raw batch insert")
		}
		if s.db.IsDuplicationError(err) {
			return &RawIngestResult{Duplicate: true}, nil
		}
		return nil, errors.Unavailable.Wrap(err, "Claude Code OTel raw storage is unavailable")
	}
	if err := tx.Commit(); err != nil {
		return nil, errors.Unavailable.Wrap(err, "failed to commit Claude Code OTel raw batch")
	}
	return &RawIngestResult{BatchID: batch.ID}, nil
}

func (s *RawIngestService) authenticate(providedToken string) errors.Error {
	if s.cfg == nil {
		return errors.Unavailable.New("Claude Code OTel ingest authentication is unavailable")
	}
	expectedToken := strings.TrimSpace(s.cfg.GetString(claudeOtelIngestTokenKey))
	if expectedToken == "" {
		return errors.Unavailable.New("Claude Code OTel ingest authentication is unavailable")
	}
	providedToken = strings.TrimSpace(providedToken)
	if providedToken == "" {
		return errors.HttpStatus(http.StatusUnauthorized).New("Claude Code OTel ingest token is required")
	}
	if subtle.ConstantTimeCompare([]byte(providedToken), []byte(expectedToken)) != 1 {
		return errors.HttpStatus(http.StatusForbidden).New("Claude Code OTel ingest token is invalid")
	}
	return nil
}

func validateOtelIngestContentType(value string) errors.Error {
	mediaType, _, err := mime.ParseMediaType(value)
	if err != nil || mediaType != otlpProtobufContentType {
		return errors.HttpStatus(http.StatusUnsupportedMediaType).New("OTLP metrics must use application/x-protobuf")
	}
	return nil
}

func readOtelIngestBody(body io.ReadCloser) ([]byte, errors.Error) {
	defer body.Close()
	payload, err := io.ReadAll(io.LimitReader(body, maxOtelIngestBodyBytes+1))
	if err != nil {
		return nil, errors.BadInput.New("failed to read OTLP metrics request body")
	}
	if len(payload) == 0 {
		return nil, errors.BadInput.New("OTLP metrics request body is required")
	}
	if len(payload) > maxOtelIngestBodyBytes {
		return nil, errors.HttpStatus(http.StatusRequestEntityTooLarge).New("OTLP metrics request body is too large")
	}
	return payload, nil
}

func validateOtelMetricsRequest(request *collectormetrics.ExportMetricsServiceRequest) (int, int, errors.Error) {
	resources := request.GetResourceMetrics()
	if len(resources) == 0 {
		return 0, 0, errors.BadInput.New("OTLP metrics request contains no resource metrics")
	}
	datapointCount := 0
	for _, resourceMetrics := range resources {
		if resourceMetrics.GetResource() == nil {
			return 0, 0, errors.BadInput.New("OTLP metrics resource is required")
		}
		datapoints := resourceDatapoints(resourceMetrics)
		// Attribution is evaluated per resource group by the asynchronous converter.
		// Persisting an authenticated batch first prevents one malformed group in a
		// Collector-merged request from dropping valid groups that share the export.
		if len(datapoints) == 0 {
			return 0, 0, errors.BadInput.New("OTLP metrics resource contains no datapoints")
		}
		datapointCount += len(datapoints)
	}
	return len(resources), datapointCount, nil
}

// otlpDatapoint is the attribute and timestamp contract shared by every OTLP metric
// datapoint kind.
type otlpDatapoint interface {
	GetAttributes() []*commonv1.KeyValue
	GetTimeUnixNano() uint64
}

func resourceDatapoints(resourceMetrics *metricsv1.ResourceMetrics) []otlpDatapoint {
	datapoints := make([]otlpDatapoint, 0)
	for _, scopeMetrics := range resourceMetrics.GetScopeMetrics() {
		for _, metric := range scopeMetrics.GetMetrics() {
			datapoints = appendMetricDatapoints(datapoints, metric)
		}
	}
	return datapoints
}

func appendMetricDatapoints(datapoints []otlpDatapoint, metric *metricsv1.Metric) []otlpDatapoint {
	switch data := metric.Data.(type) {
	case *metricsv1.Metric_Gauge:
		for _, datapoint := range data.Gauge.GetDataPoints() {
			datapoints = append(datapoints, datapoint)
		}
	case *metricsv1.Metric_Sum:
		for _, datapoint := range data.Sum.GetDataPoints() {
			datapoints = append(datapoints, datapoint)
		}
	case *metricsv1.Metric_Histogram:
		for _, datapoint := range data.Histogram.GetDataPoints() {
			datapoints = append(datapoints, datapoint)
		}
	case *metricsv1.Metric_ExponentialHistogram:
		for _, datapoint := range data.ExponentialHistogram.GetDataPoints() {
			datapoints = append(datapoints, datapoint)
		}
	case *metricsv1.Metric_Summary:
		for _, datapoint := range data.Summary.GetDataPoints() {
			datapoints = append(datapoints, datapoint)
		}
	}
	return datapoints
}

func observedTimeRange(resourceMetrics []*metricsv1.ResourceMetrics) (*time.Time, *time.Time) {
	var minObservedAt, maxObservedAt *time.Time
	for _, resourceMetric := range resourceMetrics {
		for _, datapoint := range resourceDatapoints(resourceMetric) {
			observedAt, err := unixNanoTime(datapoint.GetTimeUnixNano())
			if err != nil {
				continue
			}
			if minObservedAt == nil || observedAt.Before(*minObservedAt) {
				minObservedAt = &observedAt
			}
			if maxObservedAt == nil || observedAt.After(*maxObservedAt) {
				maxObservedAt = &observedAt
			}
		}
	}
	return minObservedAt, maxObservedAt
}

func attributeString(attributes []*commonv1.KeyValue, key string) string {
	for _, attribute := range attributes {
		if attribute.GetKey() != key || attribute.GetValue() == nil {
			continue
		}
		return strings.TrimSpace(attribute.GetValue().GetStringValue())
	}
	return ""
}

func pointerToString(value string) *string {
	return &value
}
