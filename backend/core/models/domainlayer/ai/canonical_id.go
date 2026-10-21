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
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"
	"time"
)

const CanonicalActivityRecordKind = "canonical_activity"

// IDKind is the fact type a canonical ID names. It is hashed into the ID and kept as its
// readable prefix, so fact types never share an ID.
type IDKind string

const (
	IDKindActivity             IDKind = CanonicalActivityRecordKind
	IDKindModelUsage           IDKind = "model_usage"
	IDKindToolDecision         IDKind = "tool_decision"
	IDKindPrompt               IDKind = "prompt"
	IDKindPromptSkill          IDKind = "prompt_skill"
	IDKindPromptFailure        IDKind = "prompt_failure"
	IDKindPermissionModeChange IDKind = "permission_mode_change"
)

// CanonicalKey identifies one fact independently of the source that reported it, so a
// future API source updates the same row the OTel source writes.
type CanonicalKey struct {
	Kind         IDKind
	Provider     string
	WorkspaceKey string
	// Grain is the rest of the fact's identity in a fixed order per kind, such as the user
	// key, day and model of a model usage. Times go through DayGrain or TimeGrain.
	Grain []string
}

// ID returns the key's stable ID. Each component is length-prefixed before hashing, so
// components cannot run into each other.
func (k CanonicalKey) ID() string {
	components := append([]string{k.Provider, k.WorkspaceKey}, k.Grain...)
	encoded := make([]string, 0, len(components)+1)
	encoded = append(encoded, string(k.Kind))
	for _, component := range components {
		encoded = append(encoded, strconv.Itoa(len(component))+":"+component)
	}
	digest := sha256.Sum256([]byte(strings.Join(encoded, "|")))
	return "ai:" + string(k.Kind) + ":" + hex.EncodeToString(digest[:])
}

// DayGrain is the grain component of a daily fact's UTC day.
func DayGrain(day time.Time) string {
	return day.UTC().Format("2006-01-02")
}

// TimeGrain is the grain component of an instant, such as a mode change time.
func TimeGrain(at time.Time) string {
	return at.UTC().Format(time.RFC3339Nano)
}
