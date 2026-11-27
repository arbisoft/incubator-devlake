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
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseTriggerDetail(t *testing.T) {
	require.Equal(t, awsTriggerDetail{TagName: "vprod-v1.2.3"}, parseTriggerDetail(`{"repositoryId":"example-org/app","tagName":"vprod-v1.2.3","type":"PUSH_TAG"}`))
	require.Equal(t, awsTriggerDetail{BranchName: "main"}, parseTriggerDetail(`{"repositoryId":"example-org/app","branchName":"main","type":"PUSH_BRANCH"}`))
	require.Equal(t, awsTriggerDetail{}, parseTriggerDetail(`arn:aws:sts::111122223333:assumed-role/acme-role/session`))
	require.Equal(t, awsTriggerDetail{}, parseTriggerDetail(``))
}

func TestParseRevisionSummary(t *testing.T) {
	require.Equal(t, awsRevisionSummary{ProviderType: "GitHub", CommitMessage: "feat: change"}, parseRevisionSummary(`{"ProviderType":"GitHub","CommitMessage":"feat: change"}`))
	require.Equal(t, awsRevisionSummary{}, parseRevisionSummary(`plain text`))
	require.Equal(t, awsRevisionSummary{}, parseRevisionSummary(``))
}

func TestFullRepositoryIdFromUrl(t *testing.T) {
	require.Equal(t, "example-org/app", fullRepositoryIdFromUrl("https://us-east-2.console.aws.amazon.com/codesuite/settings/connections/redirect?connectionArn=arn:aws:codeconnections:us-east-1:111122223333:connection/abc&referenceType=COMMIT&FullRepositoryId=example-org/app&Commit=0123456789abcdef"))
	require.Equal(t, "", fullRepositoryIdFromUrl("https://us-east-2.console.aws.amazon.com/s3/object/bucket?key=a"))
	require.Equal(t, "", fullRepositoryIdFromUrl("://bad url"))
	require.Equal(t, "", fullRepositoryIdFromUrl(""))
}
