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
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/apache/incubator-devlake/core/dal"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"github.com/stretchr/testify/mock"
	commonv1 "go.opentelemetry.io/proto/otlp/common/v1"
)

func TestNormalizeRepositoryURL(t *testing.T) {
	const want = "https://github.com/example-org/example-repo"
	tests := []struct {
		name  string
		raw   string
		want  string
		valid bool
	}{
		{"already normalized", want, want, true},
		{"mixed case", "https://GitHub.com/Example-Org/Example-Repo", want, true},
		{"credentials", "https://user:ghp_secret@github.com/example-org/example-repo", want, true},
		{"token only", "https://ghp_secret@github.com/example-org/example-repo", want, true},
		{"git suffix and slash", "https://github.com/example-org/example-repo.git/", want, true},
		{"query and fragment", "https://github.com/example-org/example-repo?token=secret#readme", want, true},
		{"scp-like remote", "git@github.com:Example-Org/example-repo.git", want, true},
		{"ssh remote with port", "ssh://git@github.com:22/example-org/example-repo.git", want, true},
		{"git+ssh remote", "git+ssh://git@github.com/example-org/example-repo", want, true},
		{"surrounding space", "  " + want + "  ", want, true},
		{"https port kept", "https://git.example.com:8443/team/repo", "https://git.example.com:8443/team/repo", true},
		{"http kept", "http://gitlab.internal/team/repo.git", "http://gitlab.internal/team/repo", true},
		{"short internal host", "git@gitlab:org/repo.git", "https://gitlab/org/repo", true},
		{"ip host", "git@10.0.0.5:org/repo.git", "https://10.0.0.5/org/repo", true},
		{"empty", "", "", false},
		{"no path", "https://github.com", "", false},
		{"local path", "/home/dev/repo", "", false},
		{"windows path", `C:\code\repo`, "", false},
		{"windows path with slashes", "C:/Users/dev/repos/origin.git", "", false},
		{"lowercase drive letter", "c:/users/dev/repos/origin", "", false},
		{"drive-relative path", "d:repo", "", false},
		{"localhost scp-like", "localhost:repo", "", false},
		{"localhost with user", "git@localhost:org/repo.git", "", false},
		{"loopback ip", "ssh://git@127.0.0.1/org/repo.git", "", false},
		{"loopback ipv6", "ssh://git@[::1]/org/repo.git", "", false},
		{"uppercase localhost", "https://LOCALHOST/org/repo", "", false},
		{"file scheme", "file:///home/dev/repo", "", false},
		{"not a url", "not a repository", "", false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, valid := normalizeRepositoryURL(test.raw)
			if got != test.want || valid != test.valid {
				t.Fatalf("normalizeRepositoryURL(%q) = %q, %t; want %q, %t", test.raw, got, valid, test.want, test.valid)
			}
		})
	}
}

// A token in a remote URL must not reach raw storage, from which events, prompts and
// replays are all derived.
func TestIngestNormalizesRepositoryURLBeforeRawStorage(t *testing.T) {
	const (
		secret     = "ghp_secret"
		remote     = "https://user:" + secret + "@GitHub.com/Example-Org/example-repo.git"
		normalized = "https://github.com/example-org/example-repo"
	)

	t.Run("logs", func(t *testing.T) {
		service, database := newRawIngestService(t)
		transaction := dalmocks.NewTransaction(t)
		database.EXPECT().Begin().Return(transaction)
		var stored *models.OtelLogBatch
		transaction.EXPECT().Create(mock.AnythingOfType("*models.OtelLogBatch")).Run(func(batch interface{}, _ ...dal.Clause) {
			stored = batch.(*models.OtelLogBatch)
		}).Return(nil)
		transaction.EXPECT().Commit().Return(nil)
		logs := loadLogEventsFixture(t)
		logs.GetResourceLogs()[0].GetResource().Attributes = append(logs.GetResourceLogs()[0].GetResource().GetAttributes(), stringAttribute(repositoryURLAttribute, remote))
		record := resourceLogRecords(logs.GetResourceLogs()[0])[0]
		setStringAttribute(record, repositoryURLAttribute, remote)

		if _, err := service.IngestLogs(newOtelLogsHTTPRequest(t, logs, "collector-token")); err != nil {
			t.Fatalf("IngestLogs() error = %v", err)
		}
		decoded, err := decodeOtelLogBatchRequest(stored)
		if err != nil {
			t.Fatalf("decodeOtelLogBatchRequest() error = %v", err)
		}
		if bytes.Contains(stored.PayloadProto, []byte(secret)) {
			t.Fatal("raw log batch kept the credential from the repository url")
		}
		resourceLogs := decoded.GetResourceLogs()[0]
		if got := attributeString(resourceLogRecords(resourceLogs)[0].GetAttributes(), repositoryURLAttribute); got != normalized {
			t.Fatalf("record repository url = %q, want %q", got, normalized)
		}
		if got := attributeString(resourceLogs.GetResource().GetAttributes(), repositoryURLAttribute); got != normalized {
			t.Fatalf("resource repository url = %q, want %q", got, normalized)
		}
	})

	t.Run("metrics", func(t *testing.T) {
		service, database := newRawIngestService(t)
		transaction := dalmocks.NewTransaction(t)
		database.EXPECT().Begin().Return(transaction)
		var stored *models.OtelMetricBatch
		transaction.EXPECT().Create(mock.AnythingOfType("*models.OtelMetricBatch")).Run(func(batch interface{}, _ ...dal.Clause) {
			stored = batch.(*models.OtelMetricBatch)
		}).Return(nil)
		transaction.EXPECT().Commit().Return(nil)
		metrics := newOtelMetricsRequestWithDatapoint("platform", "", 1_726_272_000_000_000_000)
		datapoint := metrics.ResourceMetrics[0].ScopeMetrics[0].Metrics[0].GetGauge().DataPoints[0]
		datapoint.Attributes = append(datapoint.Attributes, stringAttribute(repositoryURLAttribute, remote))
		request := httptest.NewRequest(http.MethodPost, "/plugins/claude_otel/otlp/v1/metrics", bytes.NewReader(marshalOtelMetricsRequest(t, metrics)))
		request.Header.Set("Content-Type", otlpProtobufContentType)
		request.Header.Set(claudeOtelIngestTokenHeader, "collector-token")

		if _, err := service.Ingest(request); err != nil {
			t.Fatalf("Ingest() error = %v", err)
		}
		if bytes.Contains(stored.PayloadProto, []byte(secret)) || !bytes.Contains(stored.PayloadProto, []byte(normalized)) {
			t.Fatal("raw metric batch kept the credential, or lost the normalized repository url")
		}
	})
}

// An unrecognized value may still carry credentials, so it is blanked rather than kept.
func TestNormalizeRepositoryAttributesRewritesOnlyTheRepositoryURL(t *testing.T) {
	stringValue := func(value string) *commonv1.AnyValue {
		return &commonv1.AnyValue{Value: &commonv1.AnyValue_StringValue{StringValue: value}}
	}
	attributes := []*commonv1.KeyValue{
		{Key: repositoryURLAttribute, Value: stringValue("https://user:secret@GitHub.com/Org/Repo.git")},
		{Key: "vcs.repository.name", Value: stringValue("Repo")},
	}
	normalizeRepositoryAttributes(attributes)
	if got := attributeString(attributes, repositoryURLAttribute); got != "https://github.com/org/repo" {
		t.Fatalf("repository url = %q, want it normalized", got)
	}
	if got := attributeString(attributes, "vcs.repository.name"); got != "Repo" {
		t.Fatalf("vcs.repository.name = %q, want it untouched", got)
	}

	unknown := []*commonv1.KeyValue{{Key: repositoryURLAttribute, Value: stringValue("weird://user:secret@host")}}
	normalizeRepositoryAttributes(unknown)
	if got := unknown[0].GetValue().GetStringValue(); got != "" {
		t.Fatalf("unrecognized repository url = %q, want it blanked", got)
	}

	local := []*commonv1.KeyValue{{Key: repositoryURLAttribute, Value: stringValue("C:/Users/dev/repos/origin.git")}}
	normalizeRepositoryAttributes(local)
	if got := local[0].GetValue().GetStringValue(); got != "" {
		t.Fatalf("local repository path = %q, want it blanked", got)
	}
}
