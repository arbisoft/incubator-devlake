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

package repositories

import (
	"testing"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ai"
	"github.com/apache/incubator-devlake/core/models/domainlayer/code"
	"github.com/apache/incubator-devlake/core/models/domainlayer/crossdomain"
	"github.com/apache/incubator-devlake/core/models/domainlayer/ticket"
)

// scorecardDDL creates the tables the scorecard reads that can't come from a model here: the claude_otel table,
// because server/ must not import plugins/, and the blueprints table, whose model AutoMigrate can't build. Only the
// columns the scorecard reads are created.
var scorecardDDL = []string{
	`CREATE TABLE IF NOT EXISTS _tool_claude_code_otel_connection_projects (
		connection_id BIGINT UNSIGNED NOT NULL, project_name VARCHAR(255) NOT NULL, PRIMARY KEY (connection_id, project_name))`,
	`CREATE TABLE IF NOT EXISTS _devlake_blueprints (
		id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, project_name VARCHAR(255))`,
}

// onboardingTx returns a rolled-back test transaction on a database that has every table Onboarding and the
// compliance scorecard read. Tables are created before the transaction, because MySQL commits on DDL.
func onboardingTx(t *testing.T) dal.Transaction {
	t.Helper()
	db := testDB(t)
	for _, table := range []interface{}{
		&models.Project{}, &crossdomain.User{}, &models.UserProjectMapping{}, &crossdomain.ProjectMapping{},
		&ticket.BoardIssue{}, &code.PullRequest{}, &ai.AiActivity{}, &models.BlueprintScope{},
	} {
		if !db.HasTable(table) {
			if err := db.AutoMigrate(table); err != nil {
				t.Fatalf("create table for %T: %v", table, err)
			}
		}
	}
	for _, ddl := range scorecardDDL {
		if err := db.Exec(ddl); err != nil {
			t.Fatalf("create a scorecard table: %v", err)
		}
	}
	return testTx(t)
}

// inTestTx hands MapUser the test's transaction. Its commit and rollback are no-ops, so the test's own rollback
// still undoes everything MapUser wrote.
type inTestTx struct{ dal.Transaction }

func (d inTestTx) Begin() dal.Transaction { return uncommitted{d.Transaction} }

type uncommitted struct{ dal.Transaction }

func (uncommitted) Commit() errors.Error   { return nil }
func (uncommitted) Rollback() errors.Error { return nil }

const onboardingProject = "Onboarding Test Project"

func TestOnboardingOnMySQL(t *testing.T) {
	tx := onboardingTx(t)
	insert(t, tx,
		&models.Project{BaseProject: models.BaseProject{Name: onboardingProject}},
		&models.UserProjectMapping{UserLogin: "Admin.Made@Example.invalid", ProjectName: onboardingProject},
		&crossdomain.ProjectMapping{ProjectName: onboardingProject, Table: "boards", RowId: "jira:JiraBoard:1:7"},
		&ticket.BoardIssue{BoardId: "jira:JiraBoard:1:7", IssueId: "jira:JiraIssue:1:70"},
		&crossdomain.ProjectMapping{ProjectName: onboardingProject, Table: "repos", RowId: "github:GithubRepo:1:9"},
		&code.PullRequest{DomainEntity: entity("github:GithubPullRequest:1:90"), BaseRepoId: "github:GithubRepo:1:9", CreatedDate: day("2026-11-01")},
	)
	repo, err := NewOnboarding(inTestTx{tx})
	if err != nil {
		t.Fatalf("NewOnboarding() error = %v", err)
	}

	t.Run("ProjectName", func(t *testing.T) {
		if name, found, err := repo.ProjectName(onboardingProject); err != nil || !found || name != onboardingProject {
			t.Errorf("ProjectName(existing) = %q, %v, %v", name, found, err)
		}
		if _, found, err := repo.ProjectName("No Such Project"); err != nil || found {
			t.Errorf("ProjectName(missing) found = %v, error = %v", found, err)
		}
	})

	t.Run("MapUser creates, repeats and renames", func(t *testing.T) {
		steps := []struct {
			name string
			want UserMapping
		}{
			{"Ali Khan", UserMapping{UserCreated: true, AccessCreated: true}},
			{"Ali Khan", UserMapping{}},
			{"Ali Raza Khan", UserMapping{NameUpdated: true}},
		}
		for _, step := range steps {
			got, err := repo.MapUser(dbTestUser, step.name, onboardingProject)
			if err != nil || got != step.want {
				t.Fatalf("MapUser(%q) = %+v, %v, want %+v", step.name, got, err, step.want)
			}
		}
		if name, found, err := repo.UserName(dbTestUser); err != nil || !found || name != "Ali Raza Khan" {
			t.Errorf("UserName() = %q, %v, %v, want the new name", name, found, err)
		}
		count, err := tx.Count(dal.From(&crossdomain.User{}), dal.Where("email = ?", dbTestUser))
		if err != nil || count != 1 {
			t.Errorf("users rows for the email = %d, %v, want 1", count, err)
		}
	})

	t.Run("MapUser leaves other sources' rows alone", func(t *testing.T) {
		insert(t, tx, &crossdomain.User{DomainEntity: entity("opsgenie:User:1:x"), Email: dbTestOther, Name: "Old Name"})

		if _, err := repo.MapUser(dbTestOther, "ERP Name", onboardingProject); err != nil {
			t.Fatalf("MapUser() error = %v", err)
		}
		var other crossdomain.User
		if err := tx.First(&other, dal.Where("id = ?", "opsgenie:User:1:x")); err != nil || other.Name != "Old Name" {
			t.Errorf("other source's row = %+v, %v, want it unchanged", other, err)
		}
		if name, _, _ := repo.UserName(dbTestOther); name != "ERP Name" {
			t.Errorf("UserName() = %q, want the name from our own row", name)
		}
	})

	t.Run("MapUser keeps an admin's capitalized mapping instead of adding a second", func(t *testing.T) {
		got, err := repo.MapUser("admin.made@example.invalid", "Admin Made", onboardingProject)
		if err != nil || got.AccessCreated {
			t.Fatalf("MapUser() = %+v, %v, want no new access", got, err)
		}
		count, err := tx.Count(dal.From(&models.UserProjectMapping{}),
			dal.Where("LOWER(user_login) = ? AND project_name = ?", "admin.made@example.invalid", onboardingProject))
		if err != nil || count != 1 {
			t.Errorf("mapping rows for the person = %d, %v, want 1", count, err)
		}
	})

	t.Run("HasAccess", func(t *testing.T) {
		cases := []struct {
			email, project string
			want           bool
		}{
			{dbTestUser, onboardingProject, true},
			{"admin.made@example.invalid", onboardingProject, true},
			{dbTestUser, "Another Project", false},
			{"nobody@example.invalid", onboardingProject, false},
		}
		for _, tc := range cases {
			if got, err := repo.HasAccess(tc.email, tc.project); err != nil || got != tc.want {
				t.Errorf("HasAccess(%q, %q) = %v, %v, want %v", tc.email, tc.project, got, err, tc.want)
			}
		}
	})

	t.Run("UserName without a row", func(t *testing.T) {
		if _, found, err := repo.UserName("nobody@example.invalid"); err != nil || found {
			t.Errorf("UserName() found = %v, error = %v, want not found", found, err)
		}
	})

	t.Run("Compliance", func(t *testing.T) {
		got, err := repo.Compliance(onboardingProject)
		if err != nil {
			t.Fatalf("Compliance() error = %v", err)
		}
		want := Compliance{Issue: Visibility{Visible: true, Sources: "Jira"}, PR: Visibility{Visible: true, Sources: "GitHub"}, Score: "66.6%"}
		if *got != want {
			t.Errorf("Compliance() = %+v, want %+v", *got, want)
		}
		if _, err := repo.Compliance("No Such Project"); err == nil || err.GetType() != errors.NotFound {
			t.Errorf("Compliance(missing) error = %v, want NotFound", err)
		}
	})
}
