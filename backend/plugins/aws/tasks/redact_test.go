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
	"testing"

	"github.com/stretchr/testify/require"
)

func decodeForTest(t *testing.T, raw []byte) interface{} {
	var out interface{}
	require.NoError(t, decodeAwsJson(raw, &out))
	return out
}

// requireRedacted asserts the payload equals the expected one after decoding and holds no secret.
func requireRedacted(t *testing.T, in, want string) {
	got, err := redactAwsPayload(json.RawMessage(in))
	require.NoError(t, err)
	require.Equal(t, decodeForTest(t, []byte(want)), decodeForTest(t, got))
	require.NotContains(t, string(got), "s3cret")
}

func TestRedactGetPipelineShape(t *testing.T) {
	in := `{"metadata":{"pipelineArn":"arn:aws:codepipeline:us-east-2:111122223333:acme-pipeline"},"pipeline":{"name":"acme-pipeline","version":3,"stages":[{"name":"Build","actions":[{"name":"Build","configuration":{"ProjectName":"acme-build","EnvironmentVariables":"[{\"name\":\"TOKEN\",\"type\":\"PLAINTEXT\",\"value\":\"s3cret\"}]"}},{"name":"Test","configuration":{"ProjectName":"acme-test"}}]}]}}`
	want := `{"metadata":{"pipelineArn":"arn:aws:codepipeline:us-east-2:111122223333:acme-pipeline"},"pipeline":{"name":"acme-pipeline","version":3,"stages":[{"name":"Build","actions":[{"name":"Build","configuration":{"ProjectName":"acme-build","EnvironmentVariables":"[{\"name\":\"TOKEN\",\"type\":\"PLAINTEXT\"}]"}},{"name":"Test","configuration":{"ProjectName":"acme-test"}}]}]}}`
	requireRedacted(t, in, want)
}

func TestRedactActionExecutionBothConfigurations(t *testing.T) {
	in := `{"actionExecutionId":"a1","input":{"configuration":{"EnvironmentVariables":"[{\"name\":\"A\",\"type\":\"PLAINTEXT\",\"value\":\"s3cret\"}]"},"resolvedConfiguration":{"EnvironmentVariables":"[{\"name\":\"B\",\"type\":\"PLAINTEXT\",\"value\":\"s3cret\"}]"}}}`
	want := `{"actionExecutionId":"a1","input":{"configuration":{"EnvironmentVariables":"[{\"name\":\"A\",\"type\":\"PLAINTEXT\"}]"},"resolvedConfiguration":{"EnvironmentVariables":"[{\"name\":\"B\",\"type\":\"PLAINTEXT\"}]"}}}`
	requireRedacted(t, in, want)
}

func TestRedactBuildEnvironmentVariables(t *testing.T) {
	in := `{"id":"b1","buildNumber":12,"environment":{"type":"LINUX_CONTAINER","environmentVariables":[{"name":"A","type":"PLAINTEXT","value":"s3cret"},{"name":"B","type":"SECRETS_MANAGER","value":"s3cret"}]}}`
	want := `{"id":"b1","buildNumber":12,"environment":{"type":"LINUX_CONTAINER","environmentVariables":[{"name":"A","type":"PLAINTEXT"},{"name":"B","type":"SECRETS_MANAGER"}]}}`
	requireRedacted(t, in, want)
}

func TestRedactExportedEnvironmentVariablesKeepsTags(t *testing.T) {
	in := `{"id":"b1","exportedEnvironmentVariables":[{"name":"A","value":"s3cret"}],"tags":[{"key":"team","value":"kept"}]}`
	want := `{"id":"b1","exportedEnvironmentVariables":[{"name":"A"}],"tags":[{"key":"team","value":"kept"}]}`
	got, err := redactAwsPayload(json.RawMessage(in))
	require.NoError(t, err)
	require.Equal(t, decodeForTest(t, []byte(want)), decodeForTest(t, got))
}

func TestRedactProject(t *testing.T) {
	in := `{"name":"acme-build","arn":"arn:aws:codebuild:us-east-2:111122223333:project/acme-build","environment":{"image":"aws/codebuild/standard:7.0","environmentVariables":[{"name":"A","type":"PLAINTEXT","value":"s3cret"}]},"timeoutInMinutes":60}`
	want := `{"name":"acme-build","arn":"arn:aws:codebuild:us-east-2:111122223333:project/acme-build","environment":{"image":"aws/codebuild/standard:7.0","environmentVariables":[{"name":"A","type":"PLAINTEXT"}]},"timeoutInMinutes":60}`
	requireRedacted(t, in, want)
}

func TestRedactVariablesString(t *testing.T) {
	tests := []struct{ name, in, want string }{
		{"invalid json", `{not json`, `[]`},
		{"not a list", `{"name":"A","value":"s3cret"}`, `[]`},
		{"null", `null`, `[]`},
		{"empty list", `[]`, `[]`},
		{"empty string", ``, ``},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, redactVariablesString(tt.in))
		})
	}
}

func TestRedactKeepsUnrelatedFields(t *testing.T) {
	in := `{"unmodelled":{"deep":[1,2.50,{"x":"<tag>&"}]},"big":12345678901234567890,"time":1795182010.123,"value":"kept","note":"EnvironmentVariables"}`
	got, err := redactAwsPayload(json.RawMessage(in))
	require.NoError(t, err)
	require.Equal(t, decodeForTest(t, []byte(in)), decodeForTest(t, got))
	require.Contains(t, string(got), "12345678901234567890")
	require.Contains(t, string(got), "<tag>&")
}

func TestRedactRejectsInvalidPayload(t *testing.T) {
	_, err := redactAwsPayload(json.RawMessage(`{not json`))
	require.Error(t, err)
}
