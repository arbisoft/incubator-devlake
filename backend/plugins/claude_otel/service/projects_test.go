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
	"net/http"
	"reflect"
	"strings"
	"testing"

	coremodels "github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

func TestNormalizeOtelProjectNames(t *testing.T) {
	overLimitProjectNames := make([]string, maxOtelProjectsPerConnection+1)
	for index := range overLimitProjectNames {
		overLimitProjectNames[index] = strings.Repeat("p", index+1)
	}

	testCases := []struct {
		name    string
		input   []string
		expect  []string
		wantErr bool
	}{
		{
			name:   "trims deduplicates and sorts project names",
			input:  []string{" Mobile ", "Core", "Mobile"},
			expect: []string{"Core", "Mobile"},
		},
		{
			name:    "requires a project",
			input:   []string{},
			wantErr: true,
		},
		{
			name:    "rejects blank project names",
			input:   []string{"Core", " "},
			wantErr: true,
		},
		{
			name:    "rejects more than the project limit",
			input:   overLimitProjectNames,
			wantErr: true,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			actual, err := normalizeOtelProjectNames(testCase.input)
			if testCase.wantErr {
				if err == nil {
					t.Fatal("normalizeOtelProjectNames() error = nil, want an error")
				}
				return
			}
			if err != nil {
				t.Fatalf("normalizeOtelProjectNames() error = %v", err)
			}
			if !reflect.DeepEqual(actual, testCase.expect) {
				t.Fatalf("normalizeOtelProjectNames() = %v, want %v", actual, testCase.expect)
			}
		})
	}
}

func TestValidateOtelProjectNamesExist(t *testing.T) {
	testCases := []struct {
		name     string
		names    []string
		projects []*coremodels.Project
		wantErr  bool
	}{
		{
			name:  "accepts all selected projects",
			names: []string{"Core", "Mobile"},
			projects: []*coremodels.Project{
				{BaseProject: coremodels.BaseProject{Name: "Core"}},
				{BaseProject: coremodels.BaseProject{Name: "Mobile"}},
			},
		},
		{
			name:  "rejects a selected project that no longer exists",
			names: []string{"Core", "Mobile"},
			projects: []*coremodels.Project{
				{BaseProject: coremodels.BaseProject{Name: "Core"}},
			},
			wantErr: true,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := validateOtelProjectNamesExist(testCase.names, testCase.projects)
			if testCase.wantErr {
				if err == nil {
					t.Fatal("validateOtelProjectNamesExist() error = nil, want an error")
				}
				if status := err.GetType().GetHttpCode(); status != http.StatusBadRequest {
					t.Fatalf("validateOtelProjectNamesExist() status = %d, want %d", status, http.StatusBadRequest)
				}
				return
			}
			if err != nil {
				t.Fatalf("validateOtelProjectNamesExist() error = %v, want nil", err)
			}
		})
	}
}

func TestValidateOtelProjectPlacementRemovalState(t *testing.T) {
	testCases := []struct {
		name            string
		connectionState string
		placementCount  int
		wantErr         bool
	}{
		{
			name:            "rejects the final placement of an active connection",
			connectionState: models.OtelConnectionStatusActive,
			placementCount:  1,
			wantErr:         true,
		},
		{
			name:            "allows removal from a shared active connection",
			connectionState: models.OtelConnectionStatusActive,
			placementCount:  2,
		},
		{
			name:            "allows removal from a revoked connection",
			connectionState: models.OtelConnectionStatusRevoked,
			placementCount:  1,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := validateOtelProjectPlacementRemovalState(testCase.connectionState, testCase.placementCount)
			if testCase.wantErr {
				if err == nil {
					t.Fatal("validateOtelProjectPlacementRemovalState() error = nil, want an error")
				}
				if status := err.GetType().GetHttpCode(); status != http.StatusBadRequest {
					t.Fatalf("validateOtelProjectPlacementRemovalState() status = %d, want %d", status, http.StatusBadRequest)
				}
				return
			}
			if err != nil {
				t.Fatalf("validateOtelProjectPlacementRemovalState() error = %v, want nil", err)
			}
		})
	}
}
