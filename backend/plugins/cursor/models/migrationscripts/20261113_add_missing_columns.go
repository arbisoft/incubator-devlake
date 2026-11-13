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
	"time"

	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/migrationscripts/archived"
	"github.com/apache/incubator-devlake/helpers/migrationhelper"
)

// cursorCommitAiShare20261113 is the snapshot of CursorCommitAiShare used by this migration.
type cursorCommitAiShare20261113 struct {
	ConnectionId       uint64    `gorm:"primaryKey"`
	ScopeId            string    `gorm:"primaryKey;type:varchar(255)"`
	RepoName           string    `gorm:"primaryKey;type:varchar(255)"`
	CommitSha          string    `gorm:"primaryKey;type:varchar(64)"`
	CommitDate         time.Time `gorm:"type:date"`
	TabLinesAdded      int
	ComposerLinesAdded int
	ManualLinesAdded   int

	archived.NoPKModel
}

func (cursorCommitAiShare20261113) TableName() string { return "_tool_cursor_commit_ai_share" }

// cursorScopeConfig20261113 is the snapshot of CursorScopeConfig used by this migration.
type cursorScopeConfig20261113 struct {
	archived.Model
	ConnectionId uint64   `gorm:"primaryKey"`
	Name         string   `gorm:"type:varchar(255)"`
	Entities     []string `gorm:"type:json;serializer:json"`
}

func (cursorScopeConfig20261113) TableName() string { return "_tool_cursor_scope_configs" }

type addMissingColumns struct{}

func (script *addMissingColumns) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(basicRes, &cursorCommitAiShare20261113{}, &cursorScopeConfig20261113{})
}

func (script *addMissingColumns) Version() uint64 { return 20261113000001 }
func (script *addMissingColumns) Name() string {
	return "add missing columns to cursor commit ai share and scope configs"
}
