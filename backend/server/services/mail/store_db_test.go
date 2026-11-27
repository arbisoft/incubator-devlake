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

package mail

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/apache/incubator-devlake/core/config"
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/core/models/migrationscripts"
	"github.com/apache/incubator-devlake/core/runner"
	contextimpl "github.com/apache/incubator-devlake/impls/context"
	"github.com/apache/incubator-devlake/impls/dalgorm"
	"github.com/apache/incubator-devlake/impls/logruslog"
)

// These tests run the email history migration and the Store's SQL on a real database (MySQL or Postgres).
// They run only when E2E_DB_URL is set in the environment; .env is not read, so a URL left there can't point
// them at a real database by accident. The migration only creates the table when missing; every row is
// written inside a transaction that is always rolled back.

const emailHistoryMigrationVersion = 20261124120000

func testStoreTx(t *testing.T) (dal.Dal, dal.Transaction) {
	t.Helper()
	url := os.Getenv("E2E_DB_URL")
	if url == "" {
		t.Skip("E2E_DB_URL is not set in the environment")
	}
	cfg := config.GetConfig()
	cfg.Set("DB_URL", url)
	gormDB, err := runner.NewGormDb(cfg, logruslog.Global)
	require.Nil(t, err)
	db := dalgorm.NewDalgorm(gormDB)
	basicRes := contextimpl.NewDefaultBasicRes(cfg, logruslog.Global, db)
	if !db.HasTable(&models.EmailHistory{}) {
		for _, script := range migrationscripts.All() {
			if script.Version() == emailHistoryMigrationVersion {
				require.Nil(t, script.Up(basicRes))
			}
		}
	}
	if !db.HasTable(&models.UserProjectMapping{}) {
		require.Nil(t, db.AutoMigrate(&models.UserProjectMapping{}))
	}
	tx := db.Begin()
	t.Cleanup(func() {
		if err := tx.Rollback(); err != nil {
			t.Errorf("roll back: %v", err)
		}
	})
	return db, tx
}

func TestEmailHistoryMigrationWidensContentOnMySQL(t *testing.T) {
	db, _ := testStoreTx(t)
	if db.Dialect() != "mysql" {
		t.Skip("LONGTEXT only applies to MySQL")
	}
	rows, err := db.RawCursor(`SELECT column_name, data_type FROM information_schema.columns
		WHERE table_schema = DATABASE() AND table_name = '_devlake_email_history' AND column_name IN ('content', 'text_content')`)
	require.Nil(t, err)
	defer rows.Close()
	types := map[string]string{}
	for rows.Next() {
		var name, dataType string
		require.NoError(t, rows.Scan(&name, &dataType))
		types[strings.ToLower(name)] = strings.ToLower(dataType)
	}
	assert.Equal(t, map[string]string{"content": "longtext", "text_content": "longtext"}, types)
}

func TestStoreQueueLifecycle(t *testing.T) {
	_, tx := testStoreTx(t)
	store, err := NewStore(tx)
	require.Nil(t, err)
	now := time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)
	later := now.Add(time.Hour)
	bigHTML := "<p>" + strings.Repeat("x", 200*1024) + "</p>" // larger than MySQL TEXT
	due := &models.EmailHistory{Sender: "a@arbisoft.com", Recipients: "b@arbisoft.com", Subject: "due", Content: bigHTML,
		TextContent: "t", Status: models.EmailStatusQueued, SentBy: models.EmailSentBySystem, Template: TemplateAlert, Provider: "log",
		CreatedAt: now, UpdatedAt: now}
	notYet := &models.EmailHistory{Sender: "a@arbisoft.com", Recipients: "b@arbisoft.com", Subject: "later", Status: models.EmailStatusQueued,
		Template: TemplateAlert, Provider: "log", Attempts: 1, NextAttemptAt: &later, CreatedAt: now, UpdatedAt: now}
	require.Nil(t, store.Create(due))
	require.Nil(t, store.Create(notYet))
	assert.NotZero(t, due.ID)

	rows, err := store.DueQueued(now, 10)
	require.Nil(t, err)
	var subjects []string
	for _, r := range rows {
		if r.ID == due.ID || r.ID == notYet.ID {
			subjects = append(subjects, r.Subject)
		}
	}
	assert.Equal(t, []string{"due"}, subjects, "rows waiting for a retry are not due yet")
	for _, r := range rows {
		if r.ID == due.ID {
			assert.Equal(t, len(bigHTML), len(r.Content), "content is stored in full")
		}
	}

	sentOn := now.Add(time.Minute)
	due.Status, due.SentOn, due.Attempts = models.EmailStatusSent, &sentOn, 1
	require.Nil(t, store.Save(due))
	rows, err = store.DueQueued(later, 10)
	require.Nil(t, err)
	for _, r := range rows {
		assert.NotEqual(t, due.ID, r.ID, "a SENT row is never picked up again")
	}
}

func TestStoreClaimLetsOnlyOneWorkerWin(t *testing.T) {
	_, tx := testStoreTx(t)
	store, err := NewStore(tx)
	require.Nil(t, err)
	now := time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)
	lease := now.Add(5 * time.Minute)
	row := &models.EmailHistory{Sender: "a@arbisoft.com", Recipients: "b@arbisoft.com", Subject: "claim", Status: models.EmailStatusQueued,
		SentBy: models.EmailSentBySystem, Template: TemplateAlert, Provider: "log", CreatedAt: now, UpdatedAt: now}
	require.Nil(t, store.Create(row))

	// two workers read the same row
	first, second := *row, *row
	won, err := store.Claim(&first, "token-a", now, lease)
	require.Nil(t, err)
	assert.True(t, won)
	assert.Equal(t, 1, first.Attempts)
	assert.Equal(t, lease, first.NextAttemptAt.UTC())

	won, err = store.Claim(&second, "token-b", now, lease)
	require.Nil(t, err)
	assert.False(t, won, "the second worker read a stale row and loses")
	assert.Zero(t, second.Attempts, "a lost claim leaves the caller's row alone")

	rows, err := store.DueQueued(now, 10)
	require.Nil(t, err)
	for _, r := range rows {
		assert.NotEqual(t, row.ID, r.ID, "a claimed row is not due until its lease ends")
	}
	rows, err = store.DueQueued(lease, 10)
	require.Nil(t, err)
	var ids []uint64
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	assert.Contains(t, ids, row.ID, "a row whose claim ran out is due again")
}

func TestStoreProjectLogins(t *testing.T) {
	_, tx := testStoreTx(t)
	store, err := NewStore(tx)
	require.Nil(t, err)
	for _, m := range []*models.UserProjectMapping{
		{UserLogin: "zz-mail-test-b@example.invalid", ProjectName: "zz-mail-test-project"},
		{UserLogin: "zz-mail-test-a@example.invalid", ProjectName: "zz-mail-test-project"},
		{UserLogin: "zz-mail-test-c@example.invalid", ProjectName: "zz-mail-test-other"},
	} {
		require.Nil(t, tx.Create(m))
	}

	logins, err := store.ProjectLogins("zz-mail-test-project")

	require.Nil(t, err)
	assert.Equal(t, []string{"zz-mail-test-a@example.invalid", "zz-mail-test-b@example.invalid"}, logins)
}
