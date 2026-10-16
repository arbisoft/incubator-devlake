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
	"fmt"
	"reflect"
	"regexp"
	"strconv"
	"testing"

	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

var varcharTag = regexp.MustCompile(`varchar\((\d+)\)`)

// varcharWidth returns the varchar width in the gorm tag of model's field.
func varcharWidth(model interface{}, field string) (int, error) {
	structField, found := reflect.TypeOf(model).FieldByName(field)
	if !found {
		return 0, fmt.Errorf("%T has no field %s", model, field)
	}
	match := varcharTag.FindStringSubmatch(structField.Tag.Get("gorm"))
	if match == nil {
		return 0, fmt.Errorf("%T.%s has no varchar gorm type", model, field)
	}
	return strconv.Atoi(match[1])
}

// The converter bounds values by these constants before writing them, so that an oversized
// value skips one record or is truncated rather than quarantining its batch. Each constant
// must match the column it guards, or a migration that narrows a column brings back the
// batch quarantine.
func TestColumnWidthConstantsMatchModels(t *testing.T) {
	columns := []struct {
		model interface{}
		field string
		width int
	}{
		{models.OtelEvent{}, "UserKey", identityColumnLength},
		{models.OtelEvent{}, "UserAccountId", identityColumnLength},
		{models.OtelEvent{}, "UserAccountUUID", identityColumnLength},
		{models.OtelEvent{}, "UserEmail", identityColumnLength},
		{models.OtelEvent{}, "SessionId", eventIDColumnLength},
		{models.OtelEvent{}, "PromptId", eventIDColumnLength},
		{models.OtelEvent{}, "EventName", eventNameColumnLength},
		{models.OtelEvent{}, "AppVersion", eventVersionColumnLength},
		{models.OtelEvent{}, "TerminalType", eventLabelColumnLength},
		{models.OtelEvent{}, "QuerySource", eventLabelColumnLength},
		{models.OtelEvent{}, "Model", eventNamedColumnLength},
		{models.OtelEvent{}, "ToolName", eventNamedColumnLength},
		{models.OtelEvent{}, "SkillName", eventNamedColumnLength},
		{models.OtelEvent{}, "AgentName", eventNamedColumnLength},
		{models.OtelEvent{}, "PluginName", eventNamedColumnLength},
		{models.OtelEvent{}, "McpServerName", eventNamedColumnLength},
		{models.OtelEvent{}, "CommandName", eventNamedColumnLength},
		{models.OtelHourlyActivity{}, "UserKey", identityColumnLength},
		{models.OtelHourlyActivity{}, "UserAccountId", identityColumnLength},
		{models.OtelHourlyActivity{}, "UserAccountUUID", identityColumnLength},
		{models.OtelHourlyActivity{}, "UserEmail", identityColumnLength},
		{models.OtelHourlyModelUsage{}, "UserKey", identityColumnLength},
		{models.OtelHourlyModelUsage{}, "Model", modelDimensionLength},
		{models.OtelHourlyModelUsage{}, "QuerySource", querySourceDimensionLength},
		{models.OtelHourlyToolUsage{}, "UserKey", identityColumnLength},
		{models.OtelHourlyToolUsage{}, "ToolName", toolDimensionLength},
		{models.OtelHourlyToolUsage{}, "Language", toolDimensionLength},
		{ai.AiModelUsage{}, "UserKey", identityColumnLength},
		{ai.AiModelUsage{}, "UserEmail", identityColumnLength},
		{ai.AiModelUsage{}, "Model", modelDimensionLength},
		{ai.AiToolDecision{}, "UserKey", identityColumnLength},
		{ai.AiToolDecision{}, "ToolName", toolDimensionLength},
		{ai.AiPrompt{}, "UserKey", identityColumnLength},
		{ai.AiPrompt{}, "UserEmail", identityColumnLength},
		{ai.AiPrompt{}, "SessionId", eventIDColumnLength},
		{ai.AiPrompt{}, "PromptId", eventIDColumnLength},
		{ai.AiPrompt{}, "CommandName", eventNamedColumnLength},
		{ai.AiPrompt{}, "CommandSource", maxCommandSourceLength},
		{ai.AiPrompt{}, "ModelsUsed", maxModelsUsedLength},
		{ai.AiPrompt{}, "RepositoryUrl", maxRepositoryURLLength},
		{ai.AiPromptSkill{}, "SkillName", eventNamedColumnLength},
		{ai.AiPromptSkill{}, "PluginName", eventNamedColumnLength},
		{ai.AiPromptSkill{}, "InvocationTrigger", maxAiLabelLength},
		{ai.AiPromptSkill{}, "SkillSource", maxAiLabelLength},
		{ai.AiPermissionModeChange{}, "FromMode", maxAiLabelLength},
		{ai.AiPermissionModeChange{}, "ToMode", maxAiLabelLength},
		{ai.AiPermissionModeChange{}, "Trigger", maxAiLabelLength},
	}
	var failures []string
	for _, column := range columns {
		width, err := varcharWidth(column.model, column.field)
		if err != nil {
			failures = append(failures, err.Error())
			continue
		}
		if width != column.width {
			failures = append(failures, fmt.Sprintf("%T.%s is varchar(%d), constant is %d", column.model, column.field, width, column.width))
		}
	}
	for _, failure := range failures {
		t.Error(failure)
	}
}
