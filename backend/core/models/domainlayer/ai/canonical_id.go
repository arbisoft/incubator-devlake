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

// CanonicalActivityID is source-independent so a future API candidate updates the
// same daily activity row currently written by the OTel candidate.
func CanonicalActivityID(provider, workspaceKey, userKey string, date time.Time, activityType, interfaceType string) string {
	return canonicalID("canonical_activity", provider, workspaceKey, userKey, date.UTC().Format("2006-01-02"), activityType, interfaceType)
}

func CanonicalModelUsageID(provider, workspaceKey, userKey string, date time.Time, model string) string {
	return canonicalID("model_usage", provider, workspaceKey, userKey, date.UTC().Format("2006-01-02"), model)
}

func CanonicalToolDecisionID(provider, workspaceKey, userKey string, date time.Time, toolName string) string {
	return canonicalID("tool_decision", provider, workspaceKey, userKey, date.UTC().Format("2006-01-02"), toolName)
}

func canonicalID(kind string, components ...string) string {
	encoded := make([]string, 0, len(components)+1)
	encoded = append(encoded, kind)
	for _, component := range components {
		encoded = append(encoded, strconv.Itoa(len(component))+":"+component)
	}
	digest := sha256.Sum256([]byte(strings.Join(encoded, "|")))
	return "ai:" + kind + ":" + hex.EncodeToString(digest[:])
}
