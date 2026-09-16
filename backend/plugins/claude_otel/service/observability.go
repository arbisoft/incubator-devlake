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
	"net/http"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
)

const (
	ingestionStatusContractVersion  = 1
	ingestionStatusRecentBatchLimit = 20
	permanentErrorWindow            = 24 * time.Hour
	healthDegradedBacklogAge        = 5 * time.Minute
	healthUnhealthyBacklogAge       = 30 * time.Minute
	healthUnhealthyPermanentErrors  = 5
	maxDecodedPayloadBytes          = 16 << 20
)

const (
	ingestionHealthHealthy   = "healthy"
	ingestionHealthDegraded  = "degraded"
	ingestionHealthUnhealthy = "unhealthy"
)

type OtelIngestionStatus struct {
	ContractVersion       int                         `json:"contractVersion"`
	State                 string                      `json:"state"`
	Reasons               []string                    `json:"reasons"`
	BatchCounts           map[string]int64            `json:"batchCounts"`
	OldestNonterminal     *OtelOldestNonterminalBatch `json:"oldestNonterminal,omitempty"`
	ConverterLease        *OtelConverterLeaseStatus   `json:"converterLease,omitempty"`
	RecentPermanentErrors int64                       `json:"recentPermanentErrors"`
	PermanentErrorReasons []OtelPermanentErrorReason  `json:"permanentErrorReasons"`
	RecentBatches         []OtelMetricBatchSummary    `json:"recentBatches"`
}

type OtelOldestNonterminalBatch struct {
	ReceivedAt time.Time `json:"receivedAt"`
	AgeSeconds int64     `json:"ageSeconds"`
}

type OtelConverterLeaseStatus struct {
	LeaseUntil time.Time `json:"leaseUntil"`
	UpdatedAt  time.Time `json:"updatedAt"`
	AgeSeconds int64     `json:"ageSeconds"`
}

type OtelPermanentErrorReason struct {
	Code  string `json:"code"`
	Count int64  `json:"count"`
}

// OtelMetricBatchSummary intentionally excludes payload bytes and decoded telemetry.
type OtelMetricBatchSummary struct {
	ID                  uint64     `json:"id"`
	ReceivedAt          time.Time  `json:"receivedAt"`
	Status              string     `json:"status"`
	ResourceCount       int        `json:"resourceCount"`
	DatapointCount      int        `json:"datapointCount"`
	ProcessingErrorCode *string    `json:"processingErrorCode,omitempty"`
	ProcessedAt         *time.Time `json:"processedAt,omitempty"`
}

type ingestionStatusCount struct {
	Status string
	Count  int64
}

type oldestNonterminalBatch struct {
	ReceivedAt *time.Time
}

type permanentErrorReason struct {
	Code  *string
	Count int64
}

// GetOtelIngestionStatus exposes raw-queue health without requiring Prometheus or
// exposing accepted telemetry. Thresholds are versioned by ContractVersion.
func GetOtelIngestionStatus() (*OtelIngestionStatus, errors.Error) {
	now := time.Now().UTC()
	counts, err := otelBatchCounts()
	if err != nil {
		return nil, err
	}
	oldest, err := otelOldestNonterminal(now)
	if err != nil {
		return nil, err
	}
	lease, err := otelConverterLeaseStatus(now)
	if err != nil {
		return nil, err
	}
	permanentCount, reasons, err := otelRecentPermanentErrors(now)
	if err != nil {
		return nil, err
	}
	recentBatches, err := ListOtelMetricBatchSummaries(ingestionStatusRecentBatchLimit)
	if err != nil {
		return nil, err
	}
	state, healthReasons := classifyOtelIngestionHealth(oldest, permanentCount)
	return &OtelIngestionStatus{
		ContractVersion:       ingestionStatusContractVersion,
		State:                 state,
		Reasons:               healthReasons,
		BatchCounts:           counts,
		OldestNonterminal:     oldest,
		ConverterLease:        lease,
		RecentPermanentErrors: permanentCount,
		PermanentErrorReasons: reasons,
		RecentBatches:         recentBatches,
	}, nil
}

func otelBatchCounts() (map[string]int64, errors.Error) {
	counts := make(map[string]int64, 5)
	for _, status := range []string{
		models.OtelMetricBatchStatusPending,
		models.OtelMetricBatchStatusProcessing,
		models.OtelMetricBatchStatusProcessed,
		models.OtelMetricBatchStatusRetryableError,
		models.OtelMetricBatchStatusPermanentError,
	} {
		counts[status] = 0
	}
	rows := make([]ingestionStatusCount, 0)
	if err := db.All(&rows,
		dal.From(&models.OtelMetricBatch{}),
		dal.Select("status, COUNT(*) AS count"),
		dal.Groupby("status"),
	); err != nil {
		return nil, errors.Default.Wrap(err, "failed to count Claude Code OTel raw batches")
	}
	for _, row := range rows {
		counts[row.Status] = row.Count
	}
	return counts, nil
}

func otelOldestNonterminal(now time.Time) (*OtelOldestNonterminalBatch, errors.Error) {
	rows := make([]oldestNonterminalBatch, 0, 1)
	if err := db.All(&rows,
		dal.From(&models.OtelMetricBatch{}),
		dal.Select("MIN(received_at) AS received_at"),
		dal.Where("status IN ?", nonterminalBatchStatuses),
	); err != nil {
		return nil, errors.Default.Wrap(err, "failed to find oldest Claude Code OTel raw batch")
	}
	if len(rows) == 0 || rows[0].ReceivedAt == nil {
		return nil, nil
	}
	row := rows[0]
	return &OtelOldestNonterminalBatch{
		ReceivedAt: *row.ReceivedAt,
		AgeSeconds: int64(maxDuration(now.Sub(*row.ReceivedAt), 0).Seconds()),
	}, nil
}

func otelConverterLeaseStatus(now time.Time) (*OtelConverterLeaseStatus, errors.Error) {
	lease := &models.OtelConverterLease{}
	if err := db.First(lease, dal.Where("name = ?", converterLeaseName)); err != nil {
		if db.IsErrorNotFound(err) {
			return nil, nil
		}
		return nil, errors.Default.Wrap(err, "failed to read Claude Code OTel converter lease")
	}
	return &OtelConverterLeaseStatus{
		LeaseUntil: lease.LeaseUntil,
		UpdatedAt:  lease.UpdatedAt,
		AgeSeconds: int64(maxDuration(now.Sub(lease.UpdatedAt), 0).Seconds()),
	}, nil
}

func otelRecentPermanentErrors(now time.Time) (int64, []OtelPermanentErrorReason, errors.Error) {
	where := dal.Where("status = ? AND received_at >= ?", models.OtelMetricBatchStatusPermanentError, now.Add(-permanentErrorWindow))
	count, err := db.Count(dal.From(&models.OtelMetricBatch{}), where)
	if err != nil {
		return 0, nil, errors.Default.Wrap(err, "failed to count recent Claude Code OTel permanent errors")
	}
	rows := make([]permanentErrorReason, 0)
	if err := db.All(&rows,
		dal.From(&models.OtelMetricBatch{}),
		dal.Select("processing_error_code AS code, COUNT(*) AS count"),
		where,
		dal.Groupby("processing_error_code"),
		dal.Orderby("count DESC, processing_error_code ASC"),
	); err != nil {
		return 0, nil, errors.Default.Wrap(err, "failed to group Claude Code OTel permanent errors")
	}
	reasons := make([]OtelPermanentErrorReason, 0, len(rows))
	for _, row := range rows {
		code := "unknown"
		if row.Code != nil && *row.Code != "" {
			code = *row.Code
		}
		reasons = append(reasons, OtelPermanentErrorReason{Code: code, Count: row.Count})
	}
	return count, reasons, nil
}

func ListOtelMetricBatchSummaries(limit int) ([]OtelMetricBatchSummary, errors.Error) {
	if limit <= 0 || limit > ingestionStatusRecentBatchLimit {
		limit = ingestionStatusRecentBatchLimit
	}
	batches := make([]OtelMetricBatchSummary, 0, limit)
	if err := db.All(&batches,
		dal.From(&models.OtelMetricBatch{}),
		dal.Select("id, received_at, status, resource_count, datapoint_count, processing_error_code, processed_at"),
		dal.Orderby("received_at DESC, id DESC"),
		dal.Limit(limit),
	); err != nil {
		return nil, errors.Default.Wrap(err, "failed to list Claude Code OTel raw batches")
	}
	return batches, nil
}

// DecodeOtelMetricBatchPayload renders one explicitly requested stored protobuf. It is
// deliberately separate from status/list calls so normal operational polling cannot
// fetch telemetry content.
func DecodeOtelMetricBatchPayload(id uint64) ([]byte, errors.Error) {
	batch := &models.OtelMetricBatch{}
	if err := db.First(batch, dal.Select("id, payload_proto, payload_schema_version"), dal.Where("id = ?", id)); err != nil {
		if db.IsErrorNotFound(err) {
			return nil, errors.NotFound.New("Claude Code OTel raw batch not found")
		}
		return nil, errors.Default.Wrap(err, "failed to read Claude Code OTel raw batch")
	}
	return decodeOtelMetricBatchPayload(batch)
}

func decodeOtelMetricBatchPayload(batch *models.OtelMetricBatch) ([]byte, errors.Error) {
	if batch == nil {
		return nil, errors.BadInput.New("Claude Code OTel raw batch is required")
	}
	if batch.PayloadSchemaVersion != otelPayloadSchemaVersion {
		return nil, errors.BadInput.New(fmt.Sprintf("unsupported Claude Code OTel payload schema version %d", batch.PayloadSchemaVersion))
	}
	request := &collectormetrics.ExportMetricsServiceRequest{}
	if err := proto.Unmarshal(batch.PayloadProto, request); err != nil {
		return nil, errors.BadInput.New("stored Claude Code OTel payload is invalid")
	}
	payload, err := protojson.MarshalOptions{UseProtoNames: true}.Marshal(request)
	if err != nil {
		return nil, errors.Default.Wrap(err, "failed to decode Claude Code OTel payload")
	}
	if len(payload) > maxDecodedPayloadBytes {
		return nil, errors.HttpStatus(http.StatusRequestEntityTooLarge).New("decoded Claude Code OTel payload is too large")
	}
	return payload, nil
}

func classifyOtelIngestionHealth(oldest *OtelOldestNonterminalBatch, permanentErrors int64) (string, []string) {
	state := ingestionHealthHealthy
	reasons := make([]string, 0, 2)
	if oldest != nil {
		switch {
		case oldest.AgeSeconds >= int64(healthUnhealthyBacklogAge.Seconds()):
			state = ingestionHealthUnhealthy
			reasons = append(reasons, "raw backlog is older than 30 minutes")
		case oldest.AgeSeconds >= int64(healthDegradedBacklogAge.Seconds()):
			state = ingestionHealthDegraded
			reasons = append(reasons, "raw backlog is older than 5 minutes")
		}
	}
	if permanentErrors >= healthUnhealthyPermanentErrors {
		state = ingestionHealthUnhealthy
		reasons = append(reasons, "five or more permanent errors occurred in the last 24 hours")
	} else if permanentErrors > 0 {
		if state == ingestionHealthHealthy {
			state = ingestionHealthDegraded
		}
		reasons = append(reasons, "permanent errors occurred in the last 24 hours")
	}
	return state, reasons
}

func maxDuration(value, minimum time.Duration) time.Duration {
	if value < minimum {
		return minimum
	}
	return value
}
