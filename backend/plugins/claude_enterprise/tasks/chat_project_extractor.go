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

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/plugins/claude_enterprise/models"
)

// ExtractChatProjectsMeta extracts chat projects into both the
// raw-preserving _tool_claude_enterprise_analytics_records table and the
// typed _tool_claude_enterprise_chat_projects table. No ai_activities
// converter is added (Section 7): DevLake's domain model has no project
// concept.
var ExtractChatProjectsMeta = newExtractMeta(chatProjectsEndpoint, ExtractChatProjects)

func ExtractChatProjects(taskCtx plugin.SubTaskContext) errors.Error {
	return extractTypedAnalyticsEndpoint(taskCtx, chatProjectsEndpoint, func(raw []byte, params analyticsRawParams) (interface{}, errors.Error) {
		return BuildChatProjectRecord(raw, params)
	})
}

// BuildChatProjectRecord extracts a dashboard-ready daily chat project
// adoption row while keeping the full raw JSON available in the generic
// analytics record. See models.ClaudeEnterpriseChatProject for
// provisional-field documentation.
func BuildChatProjectRecord(raw []byte, params analyticsRawParams) (*models.ClaudeEnterpriseChatProject, errors.Error) {
	var item map[string]interface{}
	if err := json.Unmarshal(raw, &item); err != nil {
		return nil, errors.Default.Wrap(err, "failed to parse Claude Enterprise chat project item")
	}

	date := firstString(item, "date", "starting_date", "day")
	if date == "" {
		return nil, errors.BadInput.New("Claude Enterprise chat project item is missing date")
	}
	projectId := firstString(item, "project_id", "projectId", "id")
	if projectId == "" {
		return nil, errors.BadInput.New("Claude Enterprise chat project item is missing project id")
	}

	return &models.ClaudeEnterpriseChatProject{
		ConnectionId:       params.ConnectionId,
		ScopeId:            params.ScopeId,
		OrganizationId:     params.OrganizationId,
		Date:               date,
		ProjectId:          projectId,
		ProjectName:        firstString(item, "project_name", "projectName", "name"),
		CreatorUserId:      firstString(item, "creator_id", "creatorId", "creator.user_id", "creator.id"),
		CreatorEmail:       firstString(item, "creator_email", "creatorEmail", "creator.email"),
		MembersCount:       firstInt(item, "members_count", "membersCount"),
		ConversationsCount: firstInt64(item, "conversations_count", "conversationsCount"),
		RawJson:            string(raw),
	}, nil
}
