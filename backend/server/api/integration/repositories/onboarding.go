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
	"crypto/sha256"
	"encoding/hex"
	"strings"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/core/models/domainlayer"
	"github.com/apache/incubator-devlake/core/models/domainlayer/crossdomain"
	"github.com/apache/incubator-devlake/server/services"
)

// userIDPrefix starts the id of every users row the Integration Service creates. Other sources keep their own rows,
// which this repository never changes.
const userIDPrefix = "integration:User:"

// visibleMark starts a compliance scorecard column when the project has that kind of data; the sources follow it.
// It must match compliance_scorecard.sql.
const visibleMark = "✅ "

// onboardingDB is what Onboarding needs from the DAL. dal.Dal satisfies it.
type onboardingDB interface {
	All(dst interface{}, clauses ...dal.Clause) errors.Error
	Count(clauses ...dal.Clause) (int64, errors.Error)
	Begin() dal.Transaction
}

var _ onboardingDB = (dal.Dal)(nil)

// UserMapping says what MapUser changed.
type UserMapping struct {
	UserCreated   bool
	NameUpdated   bool
	AccessCreated bool
}

// Visibility is one compliance scorecard check of a project.
type Visibility struct {
	Visible bool
	Sources string // the tools with data, for example "Jira, Plane"; empty when not visible
}

// Compliance is a project's compliance scorecard row.
type Compliance struct {
	Issue Visibility // ticketing
	PR    Visibility // version control
	AI    Visibility // AI usage
}

// Onboarding reads and writes what the Integration Service needs to give a user a project: projects, the users rows
// it owns, user_project_mapping and the compliance scorecard. Emails must be lowercased by the caller. It is safe for
// concurrent use.
type Onboarding struct {
	db onboardingDB
}

// NewOnboarding returns a repository that works through db, which must not be nil.
func NewOnboarding(db onboardingDB) (*Onboarding, errors.Error) {
	if db == nil {
		return nil, errors.Default.New("onboarding repository: nil db")
	}
	return &Onboarding{db: db}, nil
}

// UserID is the id of the users row the Integration Service owns for email. It is a hash, so the same email always
// gives the same id and the id fits the 255-character column whatever the email's length.
func UserID(email string) string {
	sum := sha256.Sum256([]byte(email))
	return userIDPrefix + hex.EncodeToString(sum[:])
}

// ProjectName returns the stored name of the project called name, and false when there is none. The match follows
// the column's collation, so the stored name is the one to use from then on.
func (r *Onboarding) ProjectName(name string) (string, bool, errors.Error) {
	var names []string
	if err := r.db.All(&names, dal.Select("name"), dal.From(&models.Project{}), dal.Where("name = ?", name), dal.Limit(1)); err != nil {
		return "", false, errors.Default.Wrap(err, "look up the project")
	}
	if len(names) == 0 {
		return "", false, nil
	}
	return names[0], true, nil
}

// MapUser creates or renames the users row the Integration Service owns for email, and gives email access to
// projectName, in one transaction: either both are saved or neither is. projectName must be a stored name.
func (r *Onboarding) MapUser(email, name, projectName string) (result UserMapping, err errors.Error) {
	tx := r.db.Begin()
	defer func() {
		if err != nil {
			// The write error is the one to report; a failed rollback is dropped with the transaction.
			_ = tx.Rollback()
		}
	}()
	if result.UserCreated, result.NameUpdated, err = saveUser(tx, email, name); err != nil {
		return UserMapping{}, err
	}
	if result.AccessCreated, err = saveMapping(tx, email, projectName); err != nil {
		return UserMapping{}, err
	}
	if err = tx.Commit(); err != nil {
		return UserMapping{}, errors.Default.Wrap(err, "commit the user and project access")
	}
	return result, nil
}

// saveUser creates the user row, or updates its name when it differs.
func saveUser(tx dal.Transaction, email, name string) (created, renamed bool, err errors.Error) {
	id := UserID(email)
	var existing []crossdomain.User
	if err = tx.All(&existing, dal.Where("id = ?", id), dal.Limit(1)); err != nil {
		return false, false, errors.Default.Wrap(err, "look up the user")
	}
	if len(existing) == 0 {
		user := &crossdomain.User{DomainEntity: domainlayer.NewDomainEntity(id), Email: email, Name: name}
		// CreateIfNotExist, so a call racing this one on the same email can't fail on the duplicate id.
		if err = tx.CreateIfNotExist(user); err != nil {
			return false, false, errors.Default.Wrap(err, "create the user")
		}
		return true, false, nil
	}
	if existing[0].Name == name {
		return false, false, nil
	}
	if err = tx.UpdateColumn(&crossdomain.User{}, "name", name, dal.Where("id = ?", id)); err != nil {
		return false, false, errors.Default.Wrap(err, "update the user's name")
	}
	return false, true, nil
}

// saveMapping adds the user_project_mapping row when it is missing.
func saveMapping(tx dal.Transaction, email, projectName string) (bool, errors.Error) {
	count, err := tx.Count(dal.From(&models.UserProjectMapping{}), dal.Where("user_login = ? AND project_name = ?", email, projectName))
	if err != nil {
		return false, errors.Default.Wrap(err, "look up the project access")
	}
	if count > 0 {
		return false, nil
	}
	if err = tx.CreateIfNotExist(&models.UserProjectMapping{UserLogin: email, ProjectName: projectName}); err != nil {
		return false, errors.Default.Wrap(err, "create the project access")
	}
	return true, nil
}

// HasAccess reports whether email is mapped to projectName. Logins stored with capital letters by an admin match too.
func (r *Onboarding) HasAccess(email, projectName string) (bool, errors.Error) {
	count, err := r.db.Count(dal.From(&models.UserProjectMapping{}), dal.Where("LOWER(user_login) = ? AND project_name = ?", email, projectName))
	if err != nil {
		return false, errors.Default.Wrap(err, "look up the project access")
	}
	return count > 0, nil
}

// UserName returns the name on the users row the Integration Service owns for email, and false when there is none.
func (r *Onboarding) UserName(email string) (string, bool, errors.Error) {
	var names []string
	if err := r.db.All(&names, dal.Select("name"), dal.From(&crossdomain.User{}), dal.Where("id = ?", UserID(email)), dal.Limit(1)); err != nil {
		return "", false, errors.Default.Wrap(err, "look up the user")
	}
	if len(names) == 0 {
		return "", false, nil
	}
	return names[0], true, nil
}

// Compliance returns projectName's compliance scorecard row. It returns a NotFound error when there is none.
func (r *Onboarding) Compliance(projectName string) (*Compliance, errors.Error) {
	row, err := services.ProjectComplianceScorecard(r.db, projectName)
	if err != nil {
		return nil, err
	}
	return &Compliance{Issue: visibility(row.IssueVisibility), PR: visibility(row.PrVisibility), AI: visibility(row.AiVisibility)}, nil
}

// visibility reads one scorecard column, for example "✅ Jira, Plane" or "❌ Not available".
func visibility(column string) Visibility {
	sources, ok := strings.CutPrefix(column, visibleMark)
	if !ok {
		return Visibility{}
	}
	return Visibility{Visible: true, Sources: strings.TrimSpace(sources)}
}
