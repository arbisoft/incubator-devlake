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

package oidchelper

import "testing"

func TestValidateIssuerURL(t *testing.T) {
	for _, testCase := range []struct {
		raw   string
		valid bool
	}{
		{"https://accounts.example.com", true}, {"http://accounts.example.com", false},
		{"https://127.0.0.1", false}, {"https://169.254.169.254", false},
		{"https://accounts.example.com?redirect=x", false}, {"https://user@accounts.example.com", false},
	} {
		_, err := ValidateIssuerURL(testCase.raw, false)
		if (err == nil) != testCase.valid {
			t.Errorf("ValidateIssuerURL(%q) error = %v", testCase.raw, err)
		}
	}
}
