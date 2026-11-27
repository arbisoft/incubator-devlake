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

package models

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestSonarqubeApiProjectAnalysisDate(t *testing.T) {
	want := time.Date(2026, 11, 25, 10, 39, 36, 0, time.UTC)
	cases := map[string]string{
		"analysisDate":     `{"key":"k","name":"infra-live","qualifier":"TRK","analysisDate":"2026-11-25T10:39:36+0000","visibility":"private"}`,
		"lastAnalysisDate": `{"key":"k","name":"infra-live","qualifier":"TRK","lastAnalysisDate":"2026-11-25T10:39:36+0000","visibility":"private"}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			var p SonarqubeApiProject
			assert.Nil(t, json.Unmarshal([]byte(body), &p))
			got := p.ConvertApiScope().LastAnalysisDate
			if assert.NotNil(t, got) {
				assert.True(t, want.Equal(got.ToTime()))
			}
		})
	}
}
