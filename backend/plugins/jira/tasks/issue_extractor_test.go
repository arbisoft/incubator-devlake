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

package tasks

import (
	"encoding/json"
	"fmt"
	"reflect"
	"testing"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/apache/incubator-devlake/plugins/jira/models"
	"github.com/apache/incubator-devlake/plugins/jira/tasks/apiv2models"
	"github.com/stretchr/testify/mock"
)

func TestExtractIssuesEpicKeyField(t *testing.T) {
	const customField = "customfield_10014"
	mappings := &typeMappings{
		TypeIdMappings:         map[string]string{},
		StdTypeMappings:        map[string]string{},
		StandardStatusMappings: map[string]models.StatusMappings{},
	}

	tests := []struct {
		name         string
		epicKeyField string
		fieldsJSON   string
		wantEpicKey  string
	}{
		{
			name:         "string custom field",
			epicKeyField: customField,
			fieldsJSON:   fmt.Sprintf(`"%s": "EPIC-1"`, customField),
			wantEpicKey:  "EPIC-1",
		},
		{
			name:         "object custom field",
			epicKeyField: customField,
			fieldsJSON:   fmt.Sprintf(`"%s": {"key":"EPIC-2","id":"123"}`, customField),
			wantEpicKey:  "EPIC-2",
		},
		{
			name:         "unset custom field keeps legacy epic",
			epicKeyField: customField,
			fieldsJSON:   `"epic": {"key": "LEGACY-1"}`,
			wantEpicKey:  "LEGACY-1",
		},
		{
			name:         "empty EpicKeyField does not apply custom field",
			epicKeyField: "",
			fieldsJSON:   fmt.Sprintf(`"%s": "EPIC-1"`, customField),
			wantEpicKey:  "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			raw := minimalIssueJSON(tt.fieldsJSON)
			var apiIssue apiv2models.Issue
			if err := json.Unmarshal(raw, &apiIssue); err != nil {
				t.Fatalf("unmarshal issue: %v", err)
			}

			data := &JiraTaskData{
				Options: &JiraOptions{
					ConnectionId: 1,
					BoardId:      1,
					ScopeConfig:  &models.JiraScopeConfig{EpicKeyField: tt.epicKeyField},
				},
			}
			results, err := extractIssues(data, mappings, &apiIssue, &api.RawData{Data: raw}, nil, nil)
			if err != nil {
				t.Fatalf("extractIssues() error = %v", err)
			}
			issue := jiraIssueFromResults(results)
			if issue == nil {
				t.Fatal("extractIssues() did not return a JiraIssue")
			}
			if issue.EpicKey != tt.wantEpicKey {
				t.Errorf("EpicKey = %q, want %q", issue.EpicKey, tt.wantEpicKey)
			}
		})
	}
}

func minimalIssueJSON(fieldsExtra string) []byte {
	if fieldsExtra != "" {
		fieldsExtra = "," + fieldsExtra
	}
	return []byte(fmt.Sprintf(`{
		"id": "10001",
		"key": "TEST-1",
		"self": "https://example.atlassian.net/rest/agile/1.0/issue/10001",
		"fields": {
			"created": "2024-01-01T00:00:00.000+0000",
			"updated": "2024-01-01T00:00:00.000+0000",
			"summary": "test",
			"issuetype": {"id": "1", "name": "Story", "subtask": false},
			"status": {"name": "To Do", "statusCategory": {"key": "new"}}
			%s
		}
	}`, fieldsExtra))
}

func jiraIssueFromResults(results []interface{}) *models.JiraIssue {
	for _, r := range results {
		if issue, ok := r.(*models.JiraIssue); ok {
			return issue
		}
	}
	return nil
}

func sprintIssueIdsFromResults(results []interface{}) []uint64 {
	ids := []uint64{}
	for _, r := range results {
		if si, ok := r.(*models.JiraSprintIssue); ok {
			ids = append(ids, si.SprintId)
		}
	}
	return ids
}

func extractTestIssue(t *testing.T, fieldsJSON string, scopeConfig *models.JiraScopeConfig, mappings *typeMappings, sprintFieldIds []string) ([]interface{}, *models.JiraIssue) {
	t.Helper()
	raw := minimalIssueJSON(fieldsJSON)
	var apiIssue apiv2models.Issue
	if err := json.Unmarshal(raw, &apiIssue); err != nil {
		t.Fatalf("unmarshal issue: %v", err)
	}
	data := &JiraTaskData{Options: &JiraOptions{ConnectionId: 1, BoardId: 1, ScopeConfig: scopeConfig}}
	results, err := extractIssues(data, mappings, &apiIssue, &api.RawData{Data: raw}, nil, sprintFieldIds)
	if err != nil {
		t.Fatalf("extractIssues() error = %v", err)
	}
	issue := jiraIssueFromResults(results)
	if issue == nil {
		t.Fatal("extractIssues() did not return a JiraIssue")
	}
	return results, issue
}

func emptyMappings() *typeMappings {
	return &typeMappings{
		TypeIdMappings:         map[string]string{},
		StdTypeMappings:        map[string]string{},
		StandardStatusMappings: map[string]models.StatusMappings{},
	}
}

func TestExtractIssuesSprintCustomField(t *testing.T) {
	tests := []struct {
		name           string
		fieldsJSON     string
		sprintFieldIds []string
		wantSprintIds  []uint64
		wantSprintId   uint64
		wantName       string
	}{
		{
			name:           "single future sprint",
			fieldsJSON:     `"customfield_10020":[{"id":303,"name":"Grooming required","state":"future","boardId":1,"goal":""}]`,
			sprintFieldIds: []string{"customfield_10020"},
			wantSprintIds:  []uint64{303},
			wantSprintId:   303,
			wantName:       "Grooming required",
		},
		{
			name:           "active sprint wins",
			fieldsJSON:     `"customfield_10002":[{"id":184,"name":"S1","state":"closed"},{"id":203,"name":"S2","state":"closed"},{"id":210,"name":"S3","state":"active"}]`,
			sprintFieldIds: []string{"customfield_10002"},
			wantSprintIds:  []uint64{184, 203, 210},
			wantSprintId:   210,
			wantName:       "S3",
		},
		{
			name:           "no active takes last",
			fieldsJSON:     `"customfield_10002":[{"id":184,"name":"S1","state":"closed"},{"id":203,"name":"S2","state":"closed"}]`,
			sprintFieldIds: []string{"customfield_10002"},
			wantSprintIds:  []uint64{184, 203},
			wantSprintId:   203,
			wantName:       "S2",
		},
		{
			name:           "legacy sprint kept and deduped",
			fieldsJSON:     `"sprint":{"id":5,"name":"Legacy"},"customfield_10020":[{"id":5,"name":"Legacy","state":"active"},{"id":6,"name":"Next","state":"future"}]`,
			sprintFieldIds: []string{"customfield_10020"},
			wantSprintIds:  []uint64{5, 6},
			wantSprintId:   5,
			wantName:       "Legacy",
		},
		{
			name:           "empty array",
			fieldsJSON:     `"customfield_10020":[]`,
			sprintFieldIds: []string{"customfield_10020"},
			wantSprintIds:  []uint64{},
		},
		{
			name:           "null",
			fieldsJSON:     `"customfield_10020":null`,
			sprintFieldIds: []string{"customfield_10020"},
			wantSprintIds:  []uint64{},
		},
		{
			name:          "no sprint field ids",
			fieldsJSON:    `"customfield_10020":[{"id":303,"name":"X","state":"future"}]`,
			wantSprintIds: []uint64{},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			results, issue := extractTestIssue(t, tt.fieldsJSON, &models.JiraScopeConfig{}, emptyMappings(), tt.sprintFieldIds)
			if got := sprintIssueIdsFromResults(results); !reflect.DeepEqual(got, tt.wantSprintIds) {
				t.Errorf("sprint issue ids = %v, want %v", got, tt.wantSprintIds)
			}
			if issue.SprintId != tt.wantSprintId {
				t.Errorf("SprintId = %d, want %d", issue.SprintId, tt.wantSprintId)
			}
			if issue.SprintName != tt.wantName {
				t.Errorf("SprintName = %q, want %q", issue.SprintName, tt.wantName)
			}
		})
	}
}

func TestExtractIssuesEpicFromParent(t *testing.T) {
	const customField = "customfield_10014"
	parent := func(level, name string) string {
		hl := ""
		if level != "" {
			hl = `,"hierarchyLevel":` + level
		}
		return fmt.Sprintf(`"parent":{"id":"1","key":"PVT-1","fields":{"issuetype":{"id":"10000","name":"%s"%s}}}`, name, hl)
	}
	tests := []struct {
		name         string
		fieldsJSON   string
		epicKeyField string
		stdTypes     map[string]string
		want         string
	}{
		{name: "level 1 parent", fieldsJSON: parent("1", "Epic"), want: "PVT-1"},
		{name: "level 0 parent", fieldsJSON: parent("0", "Task"), want: ""},
		{name: "level 0 named Epic is not an epic", fieldsJSON: parent("0", "Epic"), want: ""},
		{name: "no level named Epic", fieldsJSON: parent("", "Epic"), want: "PVT-1"},
		{name: "no level mapped to EPIC", fieldsJSON: parent("", "Initiative"), stdTypes: map[string]string{"Initiative": "EPIC"}, want: "PVT-1"},
		{name: "no level unmapped", fieldsJSON: parent("", "Initiative"), want: ""},
		{
			name:         "EpicKeyField wins",
			fieldsJSON:   parent("1", "Epic") + `,"` + customField + `":"EPIC-9"`,
			epicKeyField: customField,
			want:         "EPIC-9",
		},
		{name: "legacy epic wins", fieldsJSON: `"epic":{"key":"LEGACY-1"},` + parent("1", "Epic"), want: "LEGACY-1"},
		{name: "no parent", fieldsJSON: "", want: ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mappings := emptyMappings()
			if tt.stdTypes != nil {
				mappings.StdTypeMappings = tt.stdTypes
			}
			_, issue := extractTestIssue(t, tt.fieldsJSON, &models.JiraScopeConfig{EpicKeyField: tt.epicKeyField}, mappings, nil)
			if issue.EpicKey != tt.want {
				t.Errorf("EpicKey = %q, want %q", issue.EpicKey, tt.want)
			}
		})
	}
}

func TestGetSprintFieldIds(t *testing.T) {
	db := dalmocks.NewDal(t)
	db.On("All", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		fields := args.Get(0).(*[]models.JiraIssueField)
		*fields = []models.JiraIssueField{{ID: "customfield_10020"}, {ID: "customfield_10002"}, {ID: "customfield_10020"}}
	}).Return((errors.Error)(nil))
	got, err := getSprintFieldIds(db, 1)
	if err != nil {
		t.Fatalf("getSprintFieldIds() error = %v", err)
	}
	want := []string{"customfield_10002", "customfield_10020"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("ids = %v, want %v", got, want)
	}
}
