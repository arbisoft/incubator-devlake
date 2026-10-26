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

package ai

import (
	"testing"
	"time"
)

func TestCanonicalIDsAreSourceIndependentAndGrainSpecific(t *testing.T) {
	day := DayGrain(time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC))
	activity := CanonicalKey{Kind: IDKindActivity, Provider: "claude", WorkspaceKey: "org", Grain: []string{"acct:user_1", day, "CODE_EDIT", "cli"}}
	modelUsage := CanonicalKey{Kind: IDKindModelUsage, Provider: "claude", WorkspaceKey: "org", Grain: []string{"acct:user_1", day, "claude-sonnet"}}
	otherInterface := CanonicalKey{Kind: IDKindActivity, Provider: "claude", WorkspaceKey: "org", Grain: []string{"acct:user_1", day, "CODE_EDIT", "web_ui"}}
	if activity.ID() != activity.ID() {
		t.Fatal("canonical activity ID changed for the same source-independent identity")
	}
	if activity.ID() == modelUsage.ID() {
		t.Fatal("activity and model usage IDs must remain distinct fact identities")
	}
	if activity.ID() == otherInterface.ID() {
		t.Fatal("different canonical activity grains must not share an ID")
	}
}

// Stored rows are keyed by these IDs, so their encoding must not change.
func TestCanonicalIDsAreStable(t *testing.T) {
	day := DayGrain(time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC))
	changedAt := TimeGrain(time.Date(2026, 9, 14, 10, 5, 0, 123, time.UTC))
	tests := []struct {
		key  CanonicalKey
		want string
	}{
		{CanonicalKey{IDKindActivity, "claude", "org", []string{"acct:user_1", day, "CODE_EDIT", "cli"}}, "ai:canonical_activity:d8b111186fbd8b9998ebff9ffe719b7ebe6ec702a70472dc3d2aad18be5f82f8"},
		{CanonicalKey{IDKindModelUsage, "claude", "org", []string{"acct:user_1", day, "claude-sonnet"}}, "ai:model_usage:6fb407cd72c7377f8f5c4fe1763750bbd0205abfa32b6db7aec0b05bcabd3481"},
		{CanonicalKey{IDKindToolDecision, "claude", "org", []string{"acct:user_1", day, "Edit"}}, "ai:tool_decision:8e7b0334781fd9933ffcbf9d1c18eac50565d9a87a7a69994e8593e6b56f7446"},
		{CanonicalKey{IDKindPrompt, "claude", "org", []string{"p1"}}, "ai:prompt:68348a1d4f972e89b9616c34bcfa999d1e395e44c1740e7ac3439a35e189ec3a"},
		{CanonicalKey{IDKindPromptSkill, "claude", "org", []string{"p1", "code-review"}}, "ai:prompt_skill:5eeafb7dd9b45af2bf5dc4c6bcc7c45ddfb2615c2aba8f0addc211a79364bd99"},
		{CanonicalKey{IDKindPromptFailure, "claude", "org", []string{"p1", "0a1b2c"}}, "ai:prompt_failure:bb04f75f6bd4f65dedd7bafd1d6b2cd0669f86af58c114869cdd2d7058cc1e34"},
		{CanonicalKey{IDKindPermissionModeChange, "claude", "org", []string{"sess-1", changedAt, "default", "plan"}}, "ai:permission_mode_change:01e42eb011fa31c6ee416aadcf7b08277010ce76ea6656ab808f37b7454a61e5"},
	}
	for _, test := range tests {
		if got := test.key.ID(); got != test.want {
			t.Errorf("%s ID = %s, want %s", test.key.Kind, got, test.want)
		}
	}
}
