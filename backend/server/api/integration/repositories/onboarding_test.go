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
	"strings"
	"testing"

	"github.com/stretchr/testify/mock"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/core/models/domainlayer/crossdomain"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
)

func TestUserID(t *testing.T) {
	a, b := UserID("lead@arbisoft.com"), UserID("other@arbisoft.com")
	long := UserID(strings.Repeat("a", 250) + "@b.com")

	if a != UserID("lead@arbisoft.com") {
		t.Error("UserID is not the same for the same email")
	}
	if a == b {
		t.Error("UserID is the same for two emails")
	}
	if !strings.HasPrefix(a, userIDPrefix) || len(long) != len(a) || len(long) > 255 {
		t.Errorf("UserID = %q (%d characters), want %q and a fixed length within the id column", a, len(long), userIDPrefix)
	}
}

func TestVisibility(t *testing.T) {
	cases := []struct {
		column string
		want   Visibility
	}{
		{"✅ Jira, Plane", Visibility{Visible: true, Sources: "Jira, Plane"}},
		{"✅ GitHub", Visibility{Visible: true, Sources: "GitHub"}},
		{"❌ Not available", Visibility{}},
		{"", Visibility{}},
	}
	for _, tc := range cases {
		t.Run(tc.column, func(t *testing.T) {
			if got := visibility(tc.column); got != tc.want {
				t.Errorf("visibility(%q) = %+v, want %+v", tc.column, got, tc.want)
			}
		})
	}
}

func TestScore(t *testing.T) {
	cases := map[string]string{"🚨 00.0%": "00.0%", "🔶 33.3%": "33.3%", "⚠️ 66.6%": "66.6%", "✅ 100%": "100%", "": ""}
	for column, want := range cases {
		if got := score(column); got != want {
			t.Errorf("score(%q) = %q, want %q", column, got, want)
		}
	}
}

func TestNewOnboardingRejectsNil(t *testing.T) {
	if _, err := NewOnboarding(nil); err == nil {
		t.Error("NewOnboarding(nil) error = nil, want an error")
	}
}

// mapUserMocks returns a DAL whose transaction finds no user and no mapping, and fails the mapping insert with
// mappingErr when it is set.
func mapUserMocks(mappingErr errors.Error) (*dalmocks.Dal, *dalmocks.Transaction) {
	db, tx := &dalmocks.Dal{}, &dalmocks.Transaction{}
	db.On("Begin").Return(tx)
	tx.On("All", mock.AnythingOfType("*[]crossdomain.User"), mock.Anything, mock.Anything).Return(nil)
	tx.On("CreateIfNotExist", mock.AnythingOfType("*crossdomain.User")).Return(nil)
	tx.On("Count", mock.Anything, mock.Anything).Return(int64(0), nil)
	tx.On("CreateIfNotExist", mock.AnythingOfType("*models.UserProjectMapping")).Return(mappingErr)
	return db, tx
}

func TestMapUserCommitsTheUserAndTheAccessTogether(t *testing.T) {
	db, tx := mapUserMocks(nil)
	tx.On("Commit").Return(nil)
	repo, _ := NewOnboarding(db)

	got, err := repo.MapUser("lead@arbisoft.com", "Ali Khan", "Payments")

	if err != nil {
		t.Fatalf("MapUser() error = %v", err)
	}
	if got != (UserMapping{UserCreated: true, AccessCreated: true}) {
		t.Errorf("MapUser() = %+v, want a new user and new access", got)
	}
	tx.AssertCalled(t, "CreateIfNotExist", mock.MatchedBy(func(u *crossdomain.User) bool {
		return u.Id == UserID("lead@arbisoft.com") && u.Email == "lead@arbisoft.com" && u.Name == "Ali Khan"
	}))
	tx.AssertCalled(t, "CreateIfNotExist", &models.UserProjectMapping{UserLogin: "lead@arbisoft.com", ProjectName: "Payments"})
	tx.AssertNotCalled(t, "Rollback")
}

func TestMapUserRollsBackTheUserWhenTheAccessFails(t *testing.T) {
	db, tx := mapUserMocks(errors.Default.New("insert failed"))
	tx.On("Rollback").Return(nil)
	repo, _ := NewOnboarding(db)

	_, err := repo.MapUser("lead@arbisoft.com", "Ali Khan", "Payments")

	if err == nil || !strings.Contains(err.Error(), "create the project access") {
		t.Fatalf("MapUser() error = %v, want the access insert error", err)
	}
	tx.AssertCalled(t, "Rollback")
	tx.AssertNotCalled(t, "Commit")
}
