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

// codexScopeConfig20261113 is the snapshot of CodexScopeConfig used by this migration.
type codexScopeConfig20261113 struct {
	archived.Model
	ConnectionId uint64   `gorm:"primaryKey"`
	Name         string   `gorm:"type:varchar(255)"`
	Entities     []string `gorm:"type:json;serializer:json"`
}

func (codexScopeConfig20261113) TableName() string { return "_tool_codex_scope_configs" }

type addScopeConfigEntities struct{}

func (script *addScopeConfigEntities) Up(basicRes context.BasicRes) errors.Error {
	return migrationhelper.AutoMigrateTables(basicRes, &codexScopeConfig20261113{})
}

func (script *addScopeConfigEntities) Version() uint64 { return 20261113000001 }
func (script *addScopeConfigEntities) Name() string {
	return "add entities column to codex scope configs"
}
