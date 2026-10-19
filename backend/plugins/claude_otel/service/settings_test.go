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
	"testing"

	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

func TestManagedSettingsExportEventsWithPromptTextOnly(t *testing.T) {
	const (
		collectorEndpoint = "https://otel.example.com:4317"
		username          = "otel_platform_abc"
		password          = "secret"
	)
	connection := &models.OtelConnection{Protocol: defaultOtelProtocol, CollectorEndpoint: collectorEndpoint}
	credential := &models.OtelCredential{Username: username}
	env := responseWithSettings(connection, nil, credential, password).ManagedSettings.Env

	want := map[string]string{
		envLogsExporter:             otlpExporter,
		envLogToolDetails:           envFlagOn,
		envMetricsIncludeSessionID:  envBoolTrue,
		envMetricsIncludeRepository: envBoolTrue,
		envLogUserPrompts:           envFlagOn,
		envLogAssistantResponses:    envFlagOff,
		envLogToolContent:           envFlagOff,
		envLogRawAPIBodies:          envFlagOff,
	}
	for key, value := range want {
		if env[key] != value {
			t.Errorf("%s = %q, want %q", key, env[key], value)
		}
	}
}
