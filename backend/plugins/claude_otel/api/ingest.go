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
	"google.golang.org/protobuf/proto"
)

const OtlpMetricsResourcePath = "otlp/v1/metrics"

func PostOtlpMetrics(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	if input == nil || input.Request == nil {
		return nil, errors.BadInput.New("OTLP metrics request is required")
	}
	if service.DefaultRawIngestService() == nil {
		return nil, errors.Unavailable.New("Claude Code OTel ingest service is unavailable")
	}
	if _, err := service.DefaultRawIngestService().Ingest(input.Request); err != nil {
		return nil, err
	}
	response, err := proto.Marshal(&collectormetrics.ExportMetricsServiceResponse{})
	if err != nil {
		return nil, errors.Default.Wrap(err, "failed to create OTLP metrics response")
	}
	return &plugin.ApiResourceOutput{
		Body:        response,
		Status:      http.StatusOK,
		ContentType: "application/x-protobuf",
	}, nil
}
