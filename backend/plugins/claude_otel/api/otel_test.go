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
	"net/url"
	"testing"

	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/claude_otel/service"
)

func TestGetMetricBatchPayloadRequiresCustomerAdministrator(t *testing.T) {
	_, err := GetMetricBatchPayload(&plugin.ApiResourceInput{
		Params:          map[string]string{"batchId": "1"},
		IsCustomerAdmin: false,
	})
	if err == nil || err.GetType().GetHttpCode() != http.StatusForbidden {
		t.Fatalf("GetMetricBatchPayload() error = %v, want 403", err)
	}
}

func TestParsePositiveQuery(t *testing.T) {
	cases := []struct {
		name    string
		query   url.Values
		want    int
		wantErr bool
	}{
		{"absent uses fallback", url.Values{}, 7, false},
		{"valid", url.Values{"page": {"3"}}, 3, false},
		{"zero", url.Values{"page": {"0"}}, 0, true},
		{"negative", url.Values{"page": {"-1"}}, 0, true},
		{"not a number", url.Values{"page": {"abc"}}, 0, true},
		{"empty", url.Values{"page": {""}}, 0, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parsePositiveQuery(tc.query, "page", 7)
			if tc.wantErr {
				if err == nil || err.GetType().GetHttpCode() != http.StatusBadRequest {
					t.Fatalf("parsePositiveQuery() error = %v, want 400", err)
				}
				return
			}
			if err != nil || got != tc.want {
				t.Fatalf("parsePositiveQuery() = %d, %v; want %d", got, err, tc.want)
			}
		})
	}
}

func TestReplayBodyDecodesFlatDates(t *testing.T) {
	body := &service.OtelReplayInput{}
	if err := api.Decode(map[string]interface{}{"requestedForConnectionId": 8, "startDate": "2026-10-18", "endDate": "2026-10-19"}, body, nil); err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	if body.StartDate != "2026-10-18" || body.EndDate != "2026-10-19" || body.RequestedForConnectionId == nil || *body.RequestedForConnectionId != 8 {
		t.Fatalf("Decode() = %+v; want the flat dates and connection decoded", body)
	}
}
