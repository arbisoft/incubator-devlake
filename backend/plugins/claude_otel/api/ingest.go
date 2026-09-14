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

package api

import (
	"net/http"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/plugins/claude_otel/service"
	collectormetrics "go.opentelemetry.io/proto/otlp/collector/metrics/v1"
	rpccode "google.golang.org/genproto/googleapis/rpc/code"
	rpcstatus "google.golang.org/genproto/googleapis/rpc/status"
	"google.golang.org/protobuf/proto"
)

const (
	OtlpMetricsResourcePath = "otlp/v1/metrics"
	otlpProtobufContentType = "application/x-protobuf"
)

// otlpStatusCodes maps classified HTTP failures to the google.rpc.Status code OTLP/HTTP
// clients expect. The Collector decides retry from the HTTP status.
var otlpStatusCodes = map[int]rpccode.Code{
	http.StatusBadRequest:            rpccode.Code_INVALID_ARGUMENT,
	http.StatusUnauthorized:          rpccode.Code_UNAUTHENTICATED,
	http.StatusForbidden:             rpccode.Code_PERMISSION_DENIED,
	http.StatusRequestEntityTooLarge: rpccode.Code_INVALID_ARGUMENT,
	http.StatusUnsupportedMediaType:  rpccode.Code_INVALID_ARGUMENT,
	http.StatusServiceUnavailable:    rpccode.Code_UNAVAILABLE,
}

func PostOtlpMetrics(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	ingestService := service.DefaultRawIngestService()
	if ingestService == nil {
		return otlpErrorOutput(errors.Unavailable.New("Claude Code OTel ingest service is unavailable"))
	}
	if input == nil || input.Request == nil {
		return otlpErrorOutput(errors.BadInput.New("OTLP metrics request is required"))
	}
	if _, err := ingestService.Ingest(input.Request); err != nil {
		return otlpErrorOutput(err)
	}
	return otlpProtobufOutput(http.StatusOK, &collectormetrics.ExportMetricsServiceResponse{})
}

// otlpErrorOutput returns the OTLP/HTTP protobuf error body. Only the classified top-level
// message is exposed; wrapped storage causes stay in server logs.
func otlpErrorOutput(ingestErr errors.Error) (*plugin.ApiResourceOutput, errors.Error) {
	httpStatus := ingestErr.GetType().GetHttpCode()
	code, known := otlpStatusCodes[httpStatus]
	if !known {
		httpStatus, code = http.StatusInternalServerError, rpccode.Code_INTERNAL
	}
	if logger != nil {
		logger.Warn(ingestErr, "Claude Code OTel ingest rejected a request with HTTP %d", httpStatus)
	}
	return otlpProtobufOutput(httpStatus, &rpcstatus.Status{Code: int32(code), Message: ingestErr.Messages().Get()})
}

func otlpProtobufOutput(status int, message proto.Message) (*plugin.ApiResourceOutput, errors.Error) {
	body, err := proto.Marshal(message)
	if err != nil {
		return nil, errors.Default.Wrap(err, "failed to create OTLP metrics response")
	}
	return &plugin.ApiResourceOutput{Body: body, Status: status, ContentType: otlpProtobufContentType}, nil
}
