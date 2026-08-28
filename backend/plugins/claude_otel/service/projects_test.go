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
	"reflect"
	"testing"
)

func TestNormalizeOtelProjectNames(t *testing.T) {
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
