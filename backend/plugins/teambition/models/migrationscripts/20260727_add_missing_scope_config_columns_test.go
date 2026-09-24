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
	"strings"
	"testing"
)

// The generated-key case is the one that took production down with MySQL error
// 1075: a server-generated invisible AUTO_INCREMENT primary key already held the
// table's single auto-increment slot.
func TestAddIDColumnDDL(t *testing.T) {
	const table = "_tool_teambition_scope_configs"

	t.Run("mysql without a primary key adds id directly", func(t *testing.T) {
		ddl := addIDColumnDDL20260727("mysql", table, "")
		want := "ALTER TABLE _tool_teambition_scope_configs ADD COLUMN id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY"
		if ddl != want {
			t.Fatalf("got %q, want %q", ddl, want)
		}
	})

	t.Run("mysql with a generated key drops it in the same statement", func(t *testing.T) {
		for _, generated := range []string{"_gr_pk", "my_row_id"} {
			ddl := addIDColumnDDL20260727("mysql", table, generated)
			if strings.Count(ddl, "ALTER TABLE") != 1 {
				t.Fatalf("%s: expected a single ALTER TABLE, got %q", generated, ddl)
			}
			if !strings.Contains(ddl, "DROP COLUMN `"+generated+"`") {
				t.Fatalf("%s: generated key not dropped: %q", generated, ddl)
			}
			if !strings.Contains(ddl, "ADD PRIMARY KEY (id)") {
				t.Fatalf("%s: id not made the primary key: %q", generated, ddl)
			}
			// Two auto-increment columns may never coexist, so the new one must not
			// be declared PRIMARY KEY inline alongside the dropped column's key.
			if strings.Contains(ddl, "AUTO_INCREMENT PRIMARY KEY") {
				t.Fatalf("%s: inline PRIMARY KEY would re-trigger error 1075: %q", generated, ddl)
			}
		}
	})

	t.Run("postgres is unaffected", func(t *testing.T) {
		ddl := addIDColumnDDL20260727("postgres", table, "")
		want := "ALTER TABLE _tool_teambition_scope_configs ADD COLUMN id BIGSERIAL PRIMARY KEY"
		if ddl != want {
			t.Fatalf("got %q, want %q", ddl, want)
		}
	})
}
