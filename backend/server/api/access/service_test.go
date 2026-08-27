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

package access

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/apache/incubator-devlake/core/errors"
)

func TestOutputErrorUsesSafeBadInputMessage(t *testing.T) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	outputError(context, errors.BadInput.New("provide a valid email and role"))

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
	response := ApiErrorResponse{}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Message != "provide a valid email and role" {
		t.Fatalf("message = %q, want safe validation message", response.Message)
	}
}

func TestOutputErrorReturnsCode(t *testing.T) {
	testCases := []struct {
		name        string
		err         errors.Error
		wantStatus  int
		wantMessage string
		wantCode    string
	}{
		{
			name:        "duplicate user code",
			err:         errors.BadInput.New("this email already has a DevLake access entry", errors.WithData(ErrCodeDuplicateUser)),
			wantStatus:  http.StatusBadRequest,
			wantMessage: "this email already has a DevLake access entry",
			wantCode:    ErrCodeDuplicateUser,
		},
		{
			name:        "invalid domain code",
			err:         errors.BadInput.New("provide a valid domain and default role", errors.WithData(ErrCodeInvalidDomain)),
			wantStatus:  http.StatusBadRequest,
			wantMessage: "provide a valid domain and default role",
			wantCode:    ErrCodeInvalidDomain,
		},
		{
			name:        "internal error returns safe message and no code",
			err:         errors.Default.New("database connection failed", errors.WithData("INTERNAL_SECRET")),
			wantStatus:  http.StatusInternalServerError,
			wantMessage: "unable to process access request",
			wantCode:    "",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			outputError(context, tc.err)

			if recorder.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d", recorder.Code, tc.wantStatus)
			}
			response := ApiErrorResponse{}
			if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if response.Message != tc.wantMessage {
				t.Fatalf("message = %q, want %q", response.Message, tc.wantMessage)
			}
			if response.Code != tc.wantCode {
				t.Fatalf("code = %q, want %q", response.Code, tc.wantCode)
			}
		})
	}
}

func TestEmailDomain(t *testing.T) {
	testCases := []struct {
		email  string
		domain string
		valid  bool
	}{
		{email: "person@example.com", domain: "example.com", valid: true},
		{email: "PERSON@EXAMPLE.COM", domain: "example.com", valid: true},
		{email: "person", valid: false},
		{email: "person@example", domain: "example", valid: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.email, func(t *testing.T) {
			domain, valid := emailDomain(normalizeEmail(testCase.email))
			if valid != testCase.valid || domain != testCase.domain {
				t.Fatalf("emailDomain(%q) = (%q, %t), want (%q, %t)", testCase.email, domain, valid, testCase.domain, testCase.valid)
			}
		})
	}
}

func TestAccessConstants(t *testing.T) {
	if !validRole(RoleCustomerAdmin) || !validRole(RoleMember) || validRole("admin") {
		t.Fatal("role validation does not match the supported access roles")
	}
	if !validStatus(StatusActive) || !validStatus(StatusDisabled) || validStatus("pending") {
		t.Fatal("status validation does not match the supported access statuses")
	}
}

func TestPageQueryNormalize(t *testing.T) {
	testCases := []struct {
		name     string
		query    PageQuery
		want     PageQuery
		isValid  bool
		wantSkip int
	}{
		{name: "defaults", want: PageQuery{Page: 1, PageSize: DefaultPageSize}, isValid: true, wantSkip: 0},
		{name: "first page", query: PageQuery{Page: 1, PageSize: MediumPageSize}, want: PageQuery{Page: 1, PageSize: MediumPageSize}, isValid: true, wantSkip: 0},
		{name: "later page", query: PageQuery{Page: 3, PageSize: LargePageSize}, want: PageQuery{Page: 3, PageSize: LargePageSize}, isValid: true, wantSkip: 100},
		{name: "invalid size", query: PageQuery{Page: 1, PageSize: 20}, isValid: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			actual, valid := testCase.query.Normalize()
			if valid != testCase.isValid {
				t.Fatalf("Normalize() validity = %t, want %t", valid, testCase.isValid)
			}
			if !valid {
				return
			}
			if actual != testCase.want {
				t.Fatalf("Normalize() = %+v, want %+v", actual, testCase.want)
			}
			if actual.Offset() != testCase.wantSkip {
				t.Fatalf("Offset() = %d, want %d", actual.Offset(), testCase.wantSkip)
			}
		})
	}
}

func TestValidDomain(t *testing.T) {
	testCases := []struct {
		domain string
		valid  bool
	}{
		{domain: "example.com", valid: true},
		{domain: "example", valid: true},
		{domain: "", valid: false},
		{domain: "@example.com", valid: false},
		{domain: "example.com.", valid: false},
		{domain: "example.com ", valid: false},
	}

	for _, testCase := range testCases {
		t.Run(testCase.domain, func(t *testing.T) {
			if actual := validDomain(testCase.domain); actual != testCase.valid {
				t.Fatalf("validDomain(%q) = %t, want %t", testCase.domain, actual, testCase.valid)
			}
		})
	}
}
