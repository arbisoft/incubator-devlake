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

package services

import (
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/apache/incubator-devlake/core/config"
	"github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/core/models/migrationscripts"
	"github.com/apache/incubator-devlake/core/runner"
	contextimpl "github.com/apache/incubator-devlake/impls/context"
	"github.com/apache/incubator-devlake/impls/dalgorm"
	"github.com/apache/incubator-devlake/impls/logruslog"
)

// TestMailHistoryOnDatabase runs the history query on MySQL or Postgres. It runs only when E2E_DB_URL is set in
// the environment (.env is not read), creates the table with the real migration when missing, and writes its
// rows in a transaction that is always rolled back.
func TestMailHistoryOnDatabase(t *testing.T) {
	url := os.Getenv("E2E_DB_URL")
	if url == "" {
		t.Skip("E2E_DB_URL is not set in the environment")
	}
	cfg := config.GetConfig()
	cfg.Set("DB_URL", url)
	gormDB, err := runner.NewGormDb(cfg, logruslog.Global)
	require.Nil(t, err)
	db := dalgorm.NewDalgorm(gormDB)
	if !db.HasTable(&models.EmailHistory{}) {
		for _, script := range migrationscripts.All() {
			if script.Version() == 20261124120000 {
				require.Nil(t, script.Up(contextimpl.NewDefaultBasicRes(cfg, logruslog.Global, db)))
			}
		}
	}
	tx := db.Begin()
	t.Cleanup(func() {
		if err := tx.Rollback(); err != nil {
			t.Errorf("roll back: %v", err)
		}
	})
	base := time.Date(2031, 1, 1, 0, 0, 0, 0, time.UTC) // after any real row, so the date filter isolates these
	sent := base.Add(time.Hour)
	rows := []*models.EmailHistory{
		{Subject: "zz 100% done", Recipients: "zz-a@example.invalid", Status: models.EmailStatusSent, SentOn: &sent, Template: "alert", Content: "<p>big</p>", CreatedAt: base, UpdatedAt: base},
		{Subject: "zz 100 done", Recipients: "zz-b@example.invalid", Status: models.EmailStatusQueued, Template: "report", CreatedAt: base.Add(time.Minute), UpdatedAt: base},
		{Subject: "zz other", Recipients: "ZZ-C@Example.invalid", Status: models.EmailStatusFailed, Template: "alert", CreatedAt: base.Add(2 * time.Minute), UpdatedAt: base},
	}
	for _, r := range rows {
		require.Nil(t, tx.Create(r))
	}
	svc, err := NewMailHistoryService(tx)
	require.Nil(t, err)
	window := EmailHistoryQuery{From: base.Format(time.RFC3339), To: base.Add(time.Hour).Format(time.RFC3339)}

	t.Run("search treats % literally and is case-insensitive", func(t *testing.T) {
		q := window
		q.Search = "100%"
		got, count, err := svc.List(&q)
		require.Nil(t, err)
		assert.Equal(t, int64(1), count)
		require.Len(t, got, 1)
		assert.Equal(t, "zz 100% done", got[0].Subject)
		assert.Empty(t, got[0].Content, "the list never loads content")

		q.Search = "zz-c@EXAMPLE"
		_, count, err = svc.List(&q)
		require.Nil(t, err)
		assert.Equal(t, int64(1), count)
	})
	t.Run("sentOn ascending puts unsent rows last", func(t *testing.T) {
		q := window
		q.SortQuery = SortQuery{SortBy: "sentOn", SortOrder: "asc"}
		got, count, err := svc.List(&q)
		require.Nil(t, err)
		assert.Equal(t, int64(3), count)
		require.Len(t, got, 3)
		assert.Equal(t, rows[0].ID, got[0].ID)
	})
	t.Run("status filter and detail", func(t *testing.T) {
		q := window
		q.Status = "failed"
		got, _, err := svc.List(&q)
		require.Nil(t, err)
		require.Len(t, got, 1)
		assert.Equal(t, rows[2].ID, got[0].ID)

		detail, err := svc.Get(rows[0].ID)
		require.Nil(t, err)
		assert.Equal(t, "<p>big</p>", detail.Content)
	})
}
