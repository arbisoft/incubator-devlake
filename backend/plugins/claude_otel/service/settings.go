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
	"encoding/base64"
	"fmt"
	"net/url"
	"strings"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

func validateOtelSettings(endpoint, protocol string) errors.Error {
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return errors.BadInput.New("OTEL_PUBLIC_ENDPOINT must be an https URL")
	}
	if protocol != defaultOtelProtocol {
		return errors.BadInput.New("OTEL_DEFAULT_PROTOCOL must be grpc")
	}
	return nil
}

func responseWithSettings(connection *models.OtelConnection, credentials []*models.OtelCredential, credential *models.OtelCredential, password string) *models.OtelConnectionWithCredentials {
	header := base64.StdEncoding.EncodeToString(fmt.Appendf(nil, "%s:%s", credential.Username, password))
	return &models.OtelConnectionWithCredentials{
		Connection:  connection,
		Credentials: credentials,
		ManagedSettings: &models.OtelManagedSettings{Env: map[string]string{
			"CLAUDE_CODE_ENABLE_TELEMETRY":      "1",
			"OTEL_METRICS_EXPORTER":             "otlp",
			"OTEL_LOGS_EXPORTER":                "none",
			"OTEL_EXPORTER_OTLP_PROTOCOL":       connection.Protocol,
			"OTEL_EXPORTER_OTLP_ENDPOINT":       connection.CollectorEndpoint,
			"OTEL_EXPORTER_OTLP_HEADERS":        fmt.Sprintf("Authorization=Basic %s", header),
			"OTEL_METRIC_EXPORT_INTERVAL":       "60000",
			"OTEL_METRICS_INCLUDE_SESSION_ID":   "false",
			"OTEL_METRICS_INCLUDE_ACCOUNT_UUID": "true",
		}},
		RestartRequired: hasPendingCollectorRestart(credentials),
		RestartHint:     restartHint(credentials),
	}
}

func normalizeOtelTeam(raw string) (string, string, errors.Error) {
	teamName := strings.TrimSpace(raw)
	if teamName == "" {
		return "", "", errors.BadInput.New("team name is required")
	}
	if len(teamName) > maxOtelTeamNameLength {
		return "", "", errors.BadInput.New("team name must be 255 characters or fewer")
	}

	var slug strings.Builder
	needsDash := false
	for _, char := range strings.ToLower(teamName) {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') {
			if needsDash && slug.Len() > 0 {
				slug.WriteByte('-')
			}
			slug.WriteRune(char)
			needsDash = false
			continue
		}
		needsDash = slug.Len() > 0
	}
	teamSlug := slug.String()
	if teamSlug == "" {
		return "", "", errors.BadInput.New("team name must contain letters or numbers")
	}
	if len(teamSlug) > maxOtelTeamSlugLength {
		return "", "", errors.BadInput.New("team name produces a slug longer than 63 characters")
	}
	return teamName, teamSlug, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
