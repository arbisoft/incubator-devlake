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
	"fmt"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
)

// Store reads and writes _devlake_email_history and reads project logins from user_project_mapping.
type Store struct {
	db dal.Dal
}

var (
	_ historyWriter = (*Store)(nil)
	_ queueStore    = (*Store)(nil)
	_ loginLister   = (*Store)(nil)
)

// NewStore returns a store over db, which must not be nil.
func NewStore(db dal.Dal) (*Store, errors.Error) {
	if db == nil {
		return nil, errors.Default.New("mail store: nil dal")
	}
	return &Store{db: db}, nil
}

// Create inserts row and sets its ID.
func (s *Store) Create(row *models.EmailHistory) errors.Error {
	if err := s.db.Create(row); err != nil {
		return errors.Default.Wrap(err, "insert email history row")
	}
	return nil
}

// Save writes every column of row, which must already exist.
func (s *Store) Save(row *models.EmailHistory) errors.Error {
	if err := s.db.Update(row); err != nil {
		return errors.Default.Wrap(err, fmt.Sprintf("update email history row id=%d", row.ID))
	}
	return nil
}

// Claim takes row for one send attempt. In a single UPDATE it raises attempts by one, stores token and
// pushes next_attempt_at to leaseUntil, but only while the row is still QUEUED, due at now and at the
// attempts value this worker read. It then reads the row back: the claim is won when the stored token
// is this one. Another worker that read the same row finds its UPDATE matched nothing and a different
// token, so it skips the row. On a win, row holds the claimed values.
func (s *Store) Claim(row *models.EmailHistory, token string, now, leaseUntil time.Time) (bool, errors.Error) {
	err := s.db.UpdateColumns(&models.EmailHistory{}, []dal.DalSet{
		{ColumnName: "attempts", Value: row.Attempts + 1},
		{ColumnName: "next_attempt_at", Value: leaseUntil},
		{ColumnName: "claim_token", Value: token},
		{ColumnName: "updated_at", Value: now},
	}, dal.Where("id = ? AND status = ? AND attempts = ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?)",
		row.ID, models.EmailStatusQueued, row.Attempts, now))
	if err != nil {
		return false, errors.Default.Wrap(err, fmt.Sprintf("claim email history row id=%d", row.ID))
	}
	var stored models.EmailHistory
	if err := s.db.First(&stored, dal.Where("id = ?", row.ID)); err != nil {
		return false, errors.Default.Wrap(err, fmt.Sprintf("read claimed email history row id=%d", row.ID))
	}
	if stored.ClaimToken == nil || *stored.ClaimToken != token {
		return false, nil
	}
	row.Attempts, row.NextAttemptAt, row.ClaimToken, row.UpdatedAt = stored.Attempts, stored.NextAttemptAt, stored.ClaimToken, stored.UpdatedAt
	return true, nil
}

// DueQueued returns up to limit QUEUED rows whose next attempt is due at now, oldest first.
func (s *Store) DueQueued(now time.Time, limit int) ([]*models.EmailHistory, errors.Error) {
	rows := make([]*models.EmailHistory, 0, limit)
	err := s.db.All(&rows,
		dal.Where("status = ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?)", models.EmailStatusQueued, now),
		dal.Orderby("id ASC"),
		dal.Limit(limit),
	)
	if err != nil {
		return nil, errors.Default.Wrap(err, "list queued emails")
	}
	return rows, nil
}

// ProjectLogins returns the user_login values mapped to projectName, in login order. RecipientResolver
// is its only user, and nothing calls that yet.
func (s *Store) ProjectLogins(projectName string) ([]string, errors.Error) {
	var logins []string
	err := s.db.Pluck("user_login", &logins,
		dal.From(&models.UserProjectMapping{}),
		dal.Where("project_name = ?", projectName),
		dal.Orderby("user_login"),
	)
	if err != nil {
		return nil, errors.Default.Wrap(err, "list user project mappings for "+projectName)
	}
	return logins, nil
}
