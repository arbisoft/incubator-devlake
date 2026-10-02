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

// Package identityhelper resolves an external identity (an email or a login
// reported by a third-party tool) to a DevLake domain-layer account id.
//
// It exists because one human routinely owns SEVERAL rows in `accounts`. The
// gitextractor plugin mints an account keyed by the git commit author email,
// while source plugins mint their own (`github:GithubAccount:1:123`, ...). Both
// can carry the same email. A naive `First(... WHERE email = ?)` therefore
// returns an arbitrary row, and when it returns the gitextractor twin — which
// never authors pull requests — the caller silently attributes activity to an
// account with no delivery history. That produces a wrong number rather than a
// missing one, which is far harder to notice downstream.
package identityhelper

import (
	"strings"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/domainlayer/crossdomain"
)

// AccountResolver maps external identities to domain account ids.
//
// Build one per subtask with NewAccountResolver and reuse it for every row: it
// loads the account tables once, so callers avoid a per-row query.
type AccountResolver struct {
	byEmail    map[string][]string
	byUserName map[string][]string
	// prCount is the number of pull requests authored by an account id. It is
	// the tie-breaker that distinguishes a real contributor account from a
	// duplicate that happens to share an email.
	prCount map[string]int
	// orgMapped holds account ids explicitly linked to a user via the org
	// plugin's user_accounts table. These are curated by a human and are
	// preferred over anything inferred from string matching.
	orgMapped map[string]bool
	// orgByEmail maps a users.email to the account ids mapped to that user.
	orgByEmail map[string][]string
}

// NewAccountResolver loads the account, pull request and org-mapping tables
// needed to resolve identities.
//
// Missing optional tables are tolerated: a deployment that has never run the
// org plugin simply resolves without that tier.
func NewAccountResolver(db dal.Dal) (*AccountResolver, errors.Error) {
	r := &AccountResolver{
		byEmail:    map[string][]string{},
		byUserName: map[string][]string{},
		prCount:    map[string]int{},
		orgMapped:  map[string]bool{},
		orgByEmail: map[string][]string{},
	}

	var accounts []crossdomain.Account
	if err := db.All(&accounts); err != nil {
		return nil, err
	}
	for _, a := range accounts {
		if a.Id == "" {
			continue
		}
		if a.Email != "" {
			k := normalize(a.Email)
			r.byEmail[k] = append(r.byEmail[k], a.Id)
		}
		if a.UserName != "" {
			k := normalize(a.UserName)
			r.byUserName[k] = append(r.byUserName[k], a.Id)
		}
	}

	// Author id -> pull request count, aggregated in SQL. Counting in Go would
	// mean materialising one string per pull request, which on a large install
	// is millions of rows to learn a few thousand counts.
	var prCounts []struct {
		AuthorId string
		Cnt      int
	}
	if err := db.All(&prCounts,
		dal.Select("author_id, COUNT(*) AS cnt"),
		dal.From("pull_requests"),
		dal.Where("author_id != ''"),
		dal.Groupby("author_id"),
	); err != nil {
		return nil, err
	}
	for _, c := range prCounts {
		r.prCount[c.AuthorId] = c.Cnt
	}

	// Org-plugin identity is optional; skip the tier when it was never set up.
	if db.HasTable("user_accounts") && db.HasTable("users") {
		var links []crossdomain.UserAccount
		if err := db.All(&links); err != nil {
			return nil, err
		}
		var users []crossdomain.User
		if err := db.All(&users); err != nil {
			return nil, err
		}
		emailByUserId := map[string]string{}
		for _, u := range users {
			if u.Email != "" {
				emailByUserId[u.Id] = normalize(u.Email)
			}
		}
		for _, l := range links {
			r.orgMapped[l.AccountId] = true
			if email, ok := emailByUserId[l.UserId]; ok {
				r.orgByEmail[email] = append(r.orgByEmail[email], l.AccountId)
			}
		}
	}

	return r, nil
}

// ByEmail resolves an email to an account id, returning "" when nothing matches.
func (r *AccountResolver) ByEmail(email string) string {
	if email == "" {
		return ""
	}
	key := normalize(email)

	// Candidates come from two places: accounts carrying this email, and
	// accounts a human explicitly mapped to a user with this email via the org
	// plugin. The latter is the only path that works when a source plugin
	// leaves accounts.email empty, which GitHub does for private profiles.
	candidates := append([]string{}, r.byEmail[key]...)
	candidates = append(candidates, r.orgByEmail[key]...)
	return r.pick(candidates)
}

// ByUserName resolves a login/username to an account id, returning "" when
// nothing matches. Use this for providers that report a platform login rather
// than an email, such as GitHub Copilot.
func (r *AccountResolver) ByUserName(userName string) string {
	if userName == "" {
		return ""
	}
	return r.pick(r.byUserName[normalize(userName)])
}

// pick chooses the best account among candidates.
//
// Preference order:
//  1. an account explicitly mapped by a human through the org plugin;
//  2. the account that has authored the most pull requests, since the point of
//     resolving an identity is to connect activity to delivery;
//  3. the lexicographically smallest id, purely so the result is stable across
//     runs rather than dependent on row order.
func (r *AccountResolver) pick(candidates []string) string {
	best := ""
	bestOrg := false
	bestPRs := -1
	for _, id := range candidates {
		if id == "" {
			continue
		}
		org := r.orgMapped[id]
		prs := r.prCount[id]
		if best == "" || better(org, prs, id, bestOrg, bestPRs, best) {
			best, bestOrg, bestPRs = id, org, prs
		}
	}
	return best
}

func better(org bool, prs int, id string, bestOrg bool, bestPRs int, bestId string) bool {
	if org != bestOrg {
		return org
	}
	if prs != bestPRs {
		return prs > bestPRs
	}
	return id < bestId
}

func normalize(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}
