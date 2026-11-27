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
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/migrationhelper"
)

var _ plugin.MigrationScript = (*addEmailHistory)(nil)

// addEmailHistory adds the table that records every email DevLake sends. The schema is frozen here.
type addEmailHistory struct{}

type emailHistory20261124 struct {
	ID                uint64     `gorm:"primaryKey;autoIncrement"`
	Sender            string     `gorm:"type:varchar(255)"`
	Recipients        string     `gorm:"type:text"`
	Subject           string     `gorm:"type:varchar(255)"`
	Content           string     `gorm:"type:text"`
	TextContent       string     `gorm:"type:text"`
	Status            string     `gorm:"type:varchar(50);index"`
	SentOn            *time.Time `gorm:"index"`
	SentBy            string     `gorm:"type:varchar(255)"`
	Template          string     `gorm:"type:varchar(50);index"`
	ProjectName       *string    `gorm:"type:varchar(255);index"`
	Source            *string    `gorm:"type:varchar(100)"`
	SourceId          *string    `gorm:"type:varchar(255)"`
	Provider          string     `gorm:"type:varchar(255)"`
	ProviderMessageId *string    `gorm:"type:varchar(255)"`
	ClaimToken        *string    `gorm:"type:varchar(64)"`
	ErrorMessage      *string    `gorm:"type:text"`
	Attempts          int
	NextAttemptAt     *time.Time
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

func (emailHistory20261124) TableName() string { return "_devlake_email_history" }

// mysqlLongTextColumns hold rendered emails. MySQL TEXT stops at 64 KB, which a report can pass;
// Postgres text has no such limit, so only MySQL is widened.
var mysqlLongTextColumns = []string{"content", "text_content"}

func (*addEmailHistory) Up(basicRes context.BasicRes) errors.Error {
	if err := migrationhelper.AutoMigrateTables(basicRes, &emailHistory20261124{}); err != nil {
		return err
	}
	db := basicRes.GetDal()
	if db.Dialect() != "mysql" {
		return nil
	}
	for _, column := range mysqlLongTextColumns {
		if err := db.ModifyColumnType("_devlake_email_history", column, "longtext"); err != nil {
			return errors.Default.Wrap(err, "widen _devlake_email_history."+column+" to longtext")
		}
	}
	return nil
}

func (*addEmailHistory) Version() uint64 { return 20261124120000 }

func (*addEmailHistory) Name() string { return "add email history table" }
