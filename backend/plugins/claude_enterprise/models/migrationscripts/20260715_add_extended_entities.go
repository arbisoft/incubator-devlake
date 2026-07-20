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

package migrationscripts

import (
	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/migrationscripts/archived"
	"github.com/apache/incubator-devlake/helpers/migrationhelper"
)

// addClaudeEnterpriseExtendedEntities adds the Phase 14 extended adoption
// entity tables (skills, connectors, chat projects, plugins, artifacts) as an
// additive migration. It does not modify or drop any existing table.
type addClaudeEnterpriseExtendedEntities struct{}

func (script *addClaudeEnterpriseExtendedEntities) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(
		basicRes,
		&claudeSkill20260715{},
		&claudeConnector20260715{},
		&claudeChatProject20260715{},
		&claudePluginAdoption20260715{},
		&claudeArtifact20260715{},
	)
}

func (script *addClaudeEnterpriseExtendedEntities) Version() uint64 {
	return 20260715000001
}

func (script *addClaudeEnterpriseExtendedEntities) Name() string {
	return "add Claude Enterprise extended adoption entity tables"
}

type claudeSkill20260715 struct {
	archived.NoPKModel
	ConnectionId   uint64 `gorm:"primaryKey" json:"connectionId"`
	ScopeId        string `gorm:"primaryKey;type:varchar(255)" json:"scopeId"`
	OrganizationId string `gorm:"primaryKey;type:varchar(255)" json:"organizationId"`
	Date           string `gorm:"primaryKey;type:varchar(32)" json:"date"`
	SkillId        string `gorm:"primaryKey;type:varchar(255)" json:"skillId"`
	SkillName      string `gorm:"type:varchar(255)" json:"skillName"`
	SkillType      string `gorm:"type:varchar(100)" json:"skillType"`
	CreatorUserId  string `gorm:"type:varchar(255)" json:"creatorUserId"`
	CreatorEmail   string `gorm:"type:varchar(255)" json:"creatorEmail"`
	ActiveUsers    int    `json:"activeUsers"`
	UsageCount     int64  `json:"usageCount"`
	RawJson        string `gorm:"type:longtext" json:"rawJson"`
}

func (claudeSkill20260715) TableName() string {
	return "_tool_claude_enterprise_skills"
}

type claudeConnector20260715 struct {
	archived.NoPKModel
	ConnectionId   uint64 `gorm:"primaryKey" json:"connectionId"`
	ScopeId        string `gorm:"primaryKey;type:varchar(255)" json:"scopeId"`
	OrganizationId string `gorm:"primaryKey;type:varchar(255)" json:"organizationId"`
	Date           string `gorm:"primaryKey;type:varchar(32)" json:"date"`
	ConnectorId    string `gorm:"primaryKey;type:varchar(255)" json:"connectorId"`
	ConnectorName  string `gorm:"type:varchar(255)" json:"connectorName"`
	ConnectorType  string `gorm:"type:varchar(100)" json:"connectorType"`
	Status         string `gorm:"type:varchar(50)" json:"status"`
	ActiveUsers    int    `json:"activeUsers"`
	UsageCount     int64  `json:"usageCount"`
	RawJson        string `gorm:"type:longtext" json:"rawJson"`
}

func (claudeConnector20260715) TableName() string {
	return "_tool_claude_enterprise_connectors"
}

type claudeChatProject20260715 struct {
	archived.NoPKModel
	ConnectionId       uint64 `gorm:"primaryKey" json:"connectionId"`
	ScopeId            string `gorm:"primaryKey;type:varchar(255)" json:"scopeId"`
	OrganizationId     string `gorm:"primaryKey;type:varchar(255)" json:"organizationId"`
	Date               string `gorm:"primaryKey;type:varchar(32)" json:"date"`
	ProjectId          string `gorm:"primaryKey;type:varchar(255)" json:"projectId"`
	ProjectName        string `gorm:"type:varchar(255)" json:"projectName"`
	CreatorUserId      string `gorm:"type:varchar(255)" json:"creatorUserId"`
	CreatorEmail       string `gorm:"type:varchar(255)" json:"creatorEmail"`
	MembersCount       int    `json:"membersCount"`
	ConversationsCount int64  `json:"conversationsCount"`
	RawJson            string `gorm:"type:longtext" json:"rawJson"`
}

func (claudeChatProject20260715) TableName() string {
	return "_tool_claude_enterprise_chat_projects"
}

type claudePluginAdoption20260715 struct {
	archived.NoPKModel
	ConnectionId   uint64 `gorm:"primaryKey" json:"connectionId"`
	ScopeId        string `gorm:"primaryKey;type:varchar(255)" json:"scopeId"`
	OrganizationId string `gorm:"primaryKey;type:varchar(255)" json:"organizationId"`
	Date           string `gorm:"primaryKey;type:varchar(32)" json:"date"`
	PluginId       string `gorm:"primaryKey;type:varchar(255)" json:"pluginId"`
	PluginName     string `gorm:"type:varchar(255)" json:"pluginName"`
	PluginType     string `gorm:"type:varchar(100)" json:"pluginType"`
	Publisher      string `gorm:"type:varchar(255)" json:"publisher"`
	ActiveUsers    int    `json:"activeUsers"`
	InstallCount   int64  `json:"installCount"`
	RawJson        string `gorm:"type:longtext" json:"rawJson"`
}

func (claudePluginAdoption20260715) TableName() string {
	return "_tool_claude_enterprise_plugins"
}

type claudeArtifact20260715 struct {
	archived.NoPKModel
	ConnectionId   uint64 `gorm:"primaryKey" json:"connectionId"`
	ScopeId        string `gorm:"primaryKey;type:varchar(255)" json:"scopeId"`
	OrganizationId string `gorm:"primaryKey;type:varchar(255)" json:"organizationId"`
	Date           string `gorm:"primaryKey;type:varchar(32)" json:"date"`
	ArtifactId     string `gorm:"primaryKey;type:varchar(255)" json:"artifactId"`
	ArtifactTitle  string `gorm:"type:varchar(255)" json:"artifactTitle"`
	ArtifactType   string `gorm:"type:varchar(100)" json:"artifactType"`
	CreatorUserId  string `gorm:"type:varchar(255)" json:"creatorUserId"`
	CreatorEmail   string `gorm:"type:varchar(255)" json:"creatorEmail"`
	ViewCount      int64  `json:"viewCount"`
	ShareCount     int64  `json:"shareCount"`
	RawJson        string `gorm:"type:longtext" json:"rawJson"`
}

func (claudeArtifact20260715) TableName() string {
	return "_tool_claude_enterprise_artifacts"
}
