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

package identityhelper

import "testing"

// newTestResolver builds a resolver without a database so the selection rules
// can be exercised directly.
func newTestResolver() *AccountResolver {
	return &AccountResolver{
		byEmail:    map[string][]string{},
		byUserName: map[string][]string{},
		prCount:    map[string]int{},
		orgMapped:  map[string]bool{},
		orgByEmail: map[string][]string{},
	}
}

// The regression this package exists for: gitextractor and a source plugin each
// mint an account for the same human, sharing one email. Only the source
// plugin's account authors pull requests, so that is the one worth resolving to.
func TestByEmailPrefersTheAccountWithPullRequests(t *testing.T) {
	r := newTestResolver()
	r.byEmail["dev@corp.com"] = []string{
		"dev@corp.com",                    // gitextractor, no PRs
		"github:GithubAccount:1:14789854", // source plugin, has PRs
	}
	r.prCount["github:GithubAccount:1:14789854"] = 4

	if got := r.ByEmail("dev@corp.com"); got != "github:GithubAccount:1:14789854" {
		t.Errorf("expected the account with PRs, got %q", got)
	}
}

// Candidate order must not decide the outcome; the old First(...) behaviour was
// sensitive to it.
func TestByEmailIsIndependentOfCandidateOrder(t *testing.T) {
	want := "github:GithubAccount:1:99"
	for _, candidates := range [][]string{
		{"dev@corp.com", want},
		{want, "dev@corp.com"},
	} {
		r := newTestResolver()
		r.byEmail["dev@corp.com"] = candidates
		r.prCount[want] = 2
		if got := r.ByEmail("dev@corp.com"); got != want {
			t.Errorf("candidates %v: expected %q, got %q", candidates, want, got)
		}
	}
}

// A human-curated org mapping outranks anything inferred from string matching,
// even when the inferred account has more pull requests.
func TestByEmailPrefersOrgMappingOverPrCount(t *testing.T) {
	r := newTestResolver()
	r.byEmail["dev@corp.com"] = []string{"inferred-account"}
	r.prCount["inferred-account"] = 10
	r.orgByEmail["dev@corp.com"] = []string{"curated-account"}
	r.orgMapped["curated-account"] = true

	if got := r.ByEmail("dev@corp.com"); got != "curated-account" {
		t.Errorf("expected the org-mapped account, got %q", got)
	}
}

// The org tier is the only one that works when a source plugin leaves
// accounts.email empty, which GitHub does for private profiles.
func TestByEmailResolvesViaOrgMappingWhenNoAccountCarriesTheEmail(t *testing.T) {
	r := newTestResolver()
	r.orgByEmail["dev@corp.com"] = []string{"github:GithubAccount:1:88112781"}
	r.orgMapped["github:GithubAccount:1:88112781"] = true

	if got := r.ByEmail("dev@corp.com"); got != "github:GithubAccount:1:88112781" {
		t.Errorf("expected resolution via org mapping, got %q", got)
	}
}

func TestByEmailIsCaseAndSpaceInsensitive(t *testing.T) {
	r := newTestResolver()
	r.byEmail["dev@corp.com"] = []string{"acct-1"}

	for _, input := range []string{"DEV@corp.com", "  dev@CORP.com  "} {
		if got := r.ByEmail(input); got != "acct-1" {
			t.Errorf("input %q: expected acct-1, got %q", input, got)
		}
	}
}

// Ties must break deterministically rather than by map iteration order,
// otherwise consecutive syncs can disagree about the same person.
func TestByEmailBreaksTiesDeterministically(t *testing.T) {
	for i := 0; i < 20; i++ {
		r := newTestResolver()
		r.byEmail["dev@corp.com"] = []string{"zzz-account", "aaa-account"}
		if got := r.ByEmail("dev@corp.com"); got != "aaa-account" {
			t.Fatalf("run %d: expected aaa-account, got %q", i, got)
		}
	}
}

// gh-copilot reports a platform login rather than an email.
func TestByUserNameResolvesLogins(t *testing.T) {
	r := newTestResolver()
	r.byUserName["octocat"] = []string{"github:GithubAccount:1:583231"}

	if got := r.ByUserName("Octocat"); got != "github:GithubAccount:1:583231" {
		t.Errorf("expected login resolution, got %q", got)
	}
}

func TestUnresolvableIdentitiesReturnEmpty(t *testing.T) {
	r := newTestResolver()
	r.byEmail["known@corp.com"] = []string{"acct-1"}

	cases := map[string]string{
		"empty email":   "",
		"unknown email": "nobody@vendor.test",
		"whitespace":    "   ",
		"unknown login": "ghost",
	}
	for name, input := range cases {
		if got := r.ByEmail(input); got != "" {
			t.Errorf("%s: expected empty, got %q", name, got)
		}
	}
	if got := r.ByUserName(""); got != "" {
		t.Errorf("empty login: expected empty, got %q", got)
	}
}
