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
	date := time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC)
	activityID := CanonicalActivityID("claude", "org", "acct:user_1", date, "CODE_EDIT", "cli")
	if activityID != CanonicalActivityID("claude", "org", "acct:user_1", date, "CODE_EDIT", "cli") {
		t.Fatal("canonical activity ID changed for the same source-independent identity")
	}
	if activityID == CanonicalModelUsageID("claude", "org", "acct:user_1", date, "claude-sonnet") {
		t.Fatal("activity and model usage IDs must remain distinct fact identities")
	}
	if activityID == CanonicalActivityID("claude", "org", "acct:user_1", date, "CODE_EDIT", "web_ui") {
		t.Fatal("different canonical activity grains must not share an ID")
	}
}

func TestCanonicalSessionHourIDSeparatesSessionsAndHours(t *testing.T) {
	hour := time.Date(2026, 10, 12, 9, 0, 0, 0, time.UTC)
	id := CanonicalSessionHourID("claude", "org", "acct:user_1", "session-a", hour)
	if id != CanonicalSessionHourID("claude", "org", "acct:user_1", "session-a", hour.In(time.FixedZone("PKT", 5*3600))) {
		t.Fatal("session hour ID must not depend on the hour's time zone")
	}
	if id == CanonicalSessionHourID("claude", "org", "acct:user_1", "session-b", hour) {
		t.Fatal("different sessions must not share a session hour ID")
	}
	if id == CanonicalSessionHourID("claude", "org", "acct:user_1", "session-a", hour.Add(time.Hour)) {
		t.Fatal("different hours of one session must not share a session hour ID")
	}
	if id == CanonicalSessionHourID("cursor", "org", "acct:user_1", "session-a", hour) {
		t.Fatal("different providers must not share a session hour ID")
	}
}
