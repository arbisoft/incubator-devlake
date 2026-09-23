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
	"fmt"

	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/migrationscripts/archived"
	"github.com/apache/incubator-devlake/helpers/migrationhelper"
)

const teambitionScopeConfigTable20260727 = "_tool_teambition_scope_configs"

// teambitionScopeConfig20260727 mirrors models.TeambitionScopeConfig. The
// migration that created `_tool_teambition_scope_configs` did not include the
// columns of the embedded common.Model (`id`, `created_at`, `updated_at`),
// which the runtime model expects.
type teambitionScopeConfig20260727 struct {
	archived.Model
	Entities          []string          `gorm:"type:json;serializer:json" json:"entities"`
	ConnectionId      uint64            `json:"connectionId" gorm:"index"`
	Name              string            `json:"name" gorm:"type:varchar(255);uniqueIndex"`
	TypeMappings      map[string]string `json:"typeMappings" gorm:"serializer:json"`
	StatusMappings    map[string]string `json:"statusMappings" gorm:"serializer:json"`
	BugDueDateField   string            `json:"bugDueDateField" gorm:"column:bug_due_date_field"`
	TaskDueDateField  string            `json:"taskDueDateField" gorm:"column:task_due_date_field"`
	StoryDueDateField string            `json:"storyDueDateField" gorm:"column:story_due_date_field"`
}

func (teambitionScopeConfig20260727) TableName() string {
	return teambitionScopeConfigTable20260727
}

type addMissingScopeConfigColumns struct{}

// generatedPrimaryKeyColumn20260727 returns the name of a server-generated
// invisible AUTO_INCREMENT primary key on the table, or "" if there is none.
//
// MySQL and its forks add one of these to a table created without a primary
// key: MySQL 8.0.30+ calls it `my_row_id` (`sql_generate_invisible_primary_key`),
// and Percona / Group Replication deployments call it `_gr_pk`. The column is
// always INVISIBLE, which is what separates it from a column anyone meant to
// keep, so that — together with it being the primary key — is the test used
// here rather than matching either vendor's name.
func generatedPrimaryKeyColumn20260727(db dal.Dal, table string) (string, errors.Error) {
	rows, err := db.RawCursor(`
		SELECT COLUMN_NAME
		  FROM information_schema.COLUMNS
		 WHERE TABLE_SCHEMA = DATABASE()
		   AND TABLE_NAME = ?
		   AND COLUMN_KEY = 'PRI'
		   AND EXTRA LIKE '%auto_increment%'
		   AND EXTRA LIKE '%INVISIBLE%'`, table)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	if !rows.Next() {
		return "", nil
	}
	var column string
	if scanErr := rows.Scan(&column); scanErr != nil {
		return "", errors.Default.Wrap(scanErr, "failed to read generated primary key column")
	}
	return column, nil
}

// addIDColumnDDL20260727 builds the statement that installs `id` as the table's
// auto-increment primary key. generatedPK names a server-generated invisible
// primary key to replace, or is "" when the table has no primary key at all.
func addIDColumnDDL20260727(dialect, table, generatedPK string) string {
	if dialect != "mysql" {
		return fmt.Sprintf("ALTER TABLE %s ADD COLUMN id BIGSERIAL PRIMARY KEY", table)
	}
	if generatedPK == "" {
		return fmt.Sprintf(
			"ALTER TABLE %s ADD COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY",
			table,
		)
	}
	// Dropping the generated key and installing the real one must happen in a
	// single statement. MySQL permits only one auto-increment column, so the two
	// cannot coexist even briefly; and a table left momentarily without a primary
	// key is exactly what makes the server generate another one.
	return fmt.Sprintf(
		"ALTER TABLE %s DROP COLUMN `%s`, "+
			"ADD COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT FIRST, "+
			"ADD PRIMARY KEY (id)",
		table, generatedPK,
	)
}

// Up adds the columns of the embedded common.Model that the runtime model
// expects.
//
// `id` is an auto-increment primary key, which GORM's AutoMigrate cannot append
// to an existing table: it emits a plain `ADD COLUMN ... AUTO_INCREMENT`, which
// MySQL rejects with "Incorrect table definition; there can be only one auto
// column and it must be defined as a key". The column is therefore added with
// explicit DDL, letting the database backfill ids for existing rows and keep
// the sequence/counter in sync. The remaining columns (`created_at`,
// `updated_at`) and the indexes are then created by AutoMigrate as usual.
//
// The table may already carry a primary key even though no migration created
// one: servers that generate an invisible AUTO_INCREMENT key for primary-key-less
// tables (Percona's `_gr_pk`, MySQL 8.0.30+'s `my_row_id`) will have added one.
// That column occupies the single auto-increment slot, so it has to be dropped
// in the same statement that installs `id` — otherwise this migration fails with
// error 1075 on exactly the deployments that most need it.
func (script *addMissingScopeConfigColumns) Up(basicRes context.BasicRes) errors.Error {
	db := basicRes.GetDal()
	if !db.HasColumn(teambitionScopeConfigTable20260727, "id") {
		generatedPK := ""
		if db.Dialect() == "mysql" {
			var err errors.Error
			generatedPK, err = generatedPrimaryKeyColumn20260727(db, teambitionScopeConfigTable20260727)
			if err != nil {
				return err
			}
		}
		ddl := addIDColumnDDL20260727(db.Dialect(), teambitionScopeConfigTable20260727, generatedPK)
		if err := db.Exec(ddl); err != nil {
			return err
		}
	}
	return migrationhelper.AutoMigrateTables(basicRes, &teambitionScopeConfig20260727{})
}

func (*addMissingScopeConfigColumns) Version() uint64 {
	return 20260727000001
}

func (*addMissingScopeConfigColumns) Name() string {
	return "add missing id/created_at/updated_at columns to _tool_teambition_scope_configs"
}
