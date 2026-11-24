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
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/apache/incubator-devlake/core/errors"
)

type fakeLogins struct {
	logins  []string
	err     errors.Error
	project string
}

func (f *fakeLogins) ProjectLogins(projectName string) ([]string, errors.Error) {
	f.project = projectName
	return f.logins, f.err
}

func TestFilterRecipients(t *testing.T) {
	cases := []struct {
		name        string
		in, domains []string
		want        recipientFilter
	}{
		{"empty", nil, nil, recipientFilter{Valid: []string{}}},
		{"lowercases and de-duplicates", []string{"A@Arbisoft.com", "a@arbisoft.com", "b@arbisoft.com"}, nil,
			recipientFilter{Valid: []string{"a@arbisoft.com", "b@arbisoft.com"}}},
		{"skips non-emails", []string{"legacy", "a@arbisoft.com", "Name <c@arbisoft.com>"}, nil,
			recipientFilter{Valid: []string{"a@arbisoft.com"}, Invalid: []string{"legacy", "Name <c@arbisoft.com>"}}},
		{"applies the allow-list", []string{"a@arbisoft.com", "b@gmail.com", "c@sub.arbisoft.com"}, []string{"arbisoft.com"},
			recipientFilter{Valid: []string{"a@arbisoft.com"}, OutsideDomains: 2}},
		{"empty allow-list allows all", []string{"b@gmail.com"}, []string{},
			recipientFilter{Valid: []string{"b@gmail.com"}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, filterRecipients(tc.in, tc.domains))
		})
	}
}

func TestRecipientsForProject(t *testing.T) {
	logins := &fakeLogins{logins: []string{"Ali@arbisoft.com", "legacy-user", "x@gmail.com", "ali@arbisoft.com"}}
	logger := &recordingLogger{}
	r, err := NewRecipientResolver(logins, []string{"arbisoft.com"}, logger)
	require.Nil(t, err)

	got, err := r.RecipientsForProject(" DevLake ")

	require.Nil(t, err)
	assert.Equal(t, []string{"ali@arbisoft.com"}, got)
	assert.Equal(t, "DevLake", logins.project)
	assert.Contains(t, logger.all(), `WARN mail recipients: skipped 1 logins that aren't email addresses project="DevLake" logins=["legacy-user"]`)
	assert.Contains(t, logger.all(), `INFO mail recipients: skipped 1 addresses outside the allowed domains project="DevLake"`)
	assert.NotContains(t, logger.all(), "x@gmail.com", "addresses outside the allow-list are counted, not logged")
}

func TestRecipientsForProjectErrors(t *testing.T) {
	r, err := NewRecipientResolver(&fakeLogins{err: errors.Default.New("db down")}, nil, &recordingLogger{})
	require.Nil(t, err)

	_, err = r.RecipientsForProject("  ")
	require.NotNil(t, err)
	assert.Equal(t, errors.BadInput, err.GetType())

	_, err = r.RecipientsForProject("DevLake")
	require.NotNil(t, err)
	assert.Contains(t, err.Error(), "db down")
}

func TestNewRecipientResolverRejectsNil(t *testing.T) {
	_, err := NewRecipientResolver(nil, nil, &recordingLogger{})
	assert.NotNil(t, err)
	_, err = NewRecipientResolver(&fakeLogins{}, nil, nil)
	assert.NotNil(t, err)
}
