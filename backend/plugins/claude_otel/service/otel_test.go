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
	"errors"
	"net/http"
	"testing"

	lakeerrors "github.com/apache/incubator-devlake/core/errors"
)

func TestCombineOtelLifecycleErrorsPreservesPrimaryClassification(t *testing.T) {
	testCases := []struct {
		name      string
		primary   error
		secondary []error
		status    int
	}{
		{
			name:   "no errors",
			status: 0,
		},
		{
			name:    "primary unavailable",
			primary: lakeerrors.Unavailable.New("storage unavailable"),
			status:  http.StatusServiceUnavailable,
		},
		{
			name:    "primary unavailable with cleanup failure",
			primary: lakeerrors.Unavailable.New("storage unavailable"),
			secondary: []error{
				errors.New("cleanup failed"),
			},
			status: http.StatusServiceUnavailable,
		},
		{
			name: "secondary becomes primary",
			secondary: []error{
				lakeerrors.BadInput.New("invalid credential"),
			},
			status: http.StatusBadRequest,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			actual := combineOtelLifecycleErrors(testCase.primary, testCase.secondary...)
			if testCase.status == 0 {
				if actual != nil {
					t.Fatalf("combineOtelLifecycleErrors() = %v, want nil", actual)
				}
				return
			}
			if actual == nil {
				t.Fatal("combineOtelLifecycleErrors() = nil")
			}
			if status := actual.GetType().GetHttpCode(); status != testCase.status {
				t.Fatalf("combineOtelLifecycleErrors() status = %d, want %d", status, testCase.status)
			}
		})
	}
}
