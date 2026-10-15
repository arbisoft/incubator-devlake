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

package api

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"

	mockplugin "github.com/apache/incubator-devlake/mocks/core/plugin"
	"github.com/apache/incubator-devlake/plugins/github/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func jsonResponse(body string) *http.Response {
	return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(bytes.NewBufferString(body))}
}

func reposJSON(owners ...string) string {
	var items []string
	for i, owner := range owners {
		items = append(items, fmt.Sprintf(`{"id":%d,"name":"r%d","owner":{"login":%q}}`, i+1, i+1, owner))
	}
	return "[" + strings.Join(items, ",") + "]"
}

func mockTopLevel(t *testing.T, orgs string, repos string) (*mockplugin.ApiClient, *url.Values) {
	client := mockplugin.NewApiClient(t)
	client.On("Get", "user", mock.Anything, mock.Anything).Return(jsonResponse(`{"login":"me"}`), nil).Once()
	client.On("Get", "user/orgs", mock.Anything, mock.Anything).Return(jsonResponse(orgs), nil).Once()
	repoQuery := &url.Values{}
	client.On("Get", "user/repos", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		*repoQuery = args.Get(1).(url.Values)
	}).Return(jsonResponse(repos), nil).Once()
	return client, repoQuery
}

func groupIds(t *testing.T, connection *models.GithubConnection, client *mockplugin.ApiClient) []string {
	children, nextPage, err := listGithubUserOrgs(connection, client, GithubRemotePagination{Page: 1, PerPage: 100})
	require.NoError(t, err)
	assert.Nil(t, nextPage)
	var ids []string
	for _, c := range children {
		ids = append(ids, c.Id)
	}
	return ids
}

func TestListGithubUserOrgsAddsRepoOwnersForFineGrainedToken(t *testing.T) {
	client, repoQuery := mockTopLevel(t, `[]`, reposJSON("me", "Finasaan", "finasaan", "arbisoft"))
	connection := &models.GithubConnection{}
	connection.Token = "github_pat_example"

	assert.Equal(t, []string{"me", "Finasaan", "arbisoft"}, groupIds(t, connection, client))
	assert.Equal(t, "owner,collaborator,organization_member", repoQuery.Get("affiliation"))
	assert.Equal(t, "pushed", repoQuery.Get("sort"))
	assert.Equal(t, "100", repoQuery.Get("per_page"))
}

func TestListGithubUserOrgsAddsCollaboratorOwnersForClassicToken(t *testing.T) {
	client, repoQuery := mockTopLevel(t, `[{"login":"arbisoft"}]`, reposJSON("Arbisoft", "friend"))
	connection := &models.GithubConnection{}
	connection.Token = "ghp_example"

	assert.Equal(t, []string{"me", "arbisoft", "friend"}, groupIds(t, connection, client))
	assert.Equal(t, "collaborator", repoQuery.Get("affiliation"))
}

func TestListGithubUserOrgsSkipsRepoOwnersUntilLastOrgPage(t *testing.T) {
	client := mockplugin.NewApiClient(t)
	client.On("Get", "user/orgs", mock.Anything, mock.Anything).Return(jsonResponse(`[{"login":"a"},{"login":"b"}]`), nil).Once()

	children, nextPage, err := listGithubUserOrgs(&models.GithubConnection{}, client, GithubRemotePagination{Page: 2, PerPage: 2})
	require.NoError(t, err)
	assert.Len(t, children, 2)
	assert.Equal(t, &GithubRemotePagination{Page: 3, PerPage: 2}, nextPage)
}

func mockOwnerLookup(client *mockplugin.ApiClient, owner string, ownerType string, ownerID int) {
	client.On("Get", "users/"+owner, mock.Anything, mock.Anything).
		Return(jsonResponse(fmt.Sprintf(`{"id":%d,"type":%q}`, ownerID, ownerType)), nil).Once()
}

func TestListGithubOwnerReposListsOnlyReposSharedByAnotherUser(t *testing.T) {
	client := mockplugin.NewApiClient(t)
	mockOwnerLookup(client, "friend", "User", 2)
	client.On("Get", "user", mock.Anything, mock.Anything).Return(jsonResponse(`{"id":1}`), nil).Once()
	repoQuery := &url.Values{}
	client.On("Get", "user/repos", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		*repoQuery = args.Get(1).(url.Values)
	}).Return(jsonResponse(reposJSON("Friend", "other")), nil).Once()

	children, nextPage, err := listGithubOwnerRepos(client, "friend", GithubRemotePagination{Page: 1, PerPage: 2})
	require.NoError(t, err)
	require.Len(t, children, 1)
	assert.Equal(t, "r1", children[0].Name)
	assert.Equal(t, &GithubRemotePagination{Page: 2, PerPage: 2}, nextPage)
	assert.Equal(t, "collaborator", repoQuery.Get("affiliation"))
	assert.Empty(t, repoQuery.Get("type"))
}

func TestListGithubOwnerReposListsAllOrgRepos(t *testing.T) {
	client := mockplugin.NewApiClient(t)
	mockOwnerLookup(client, "acme", "Organization", 3)
	repoQuery := &url.Values{}
	client.On("Get", "orgs/acme/repos", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		*repoQuery = args.Get(1).(url.Values)
	}).Return(jsonResponse(reposJSON("acme", "acme")), nil).Once()

	children, _, err := listGithubOwnerRepos(client, "acme", GithubRemotePagination{Page: 1, PerPage: 100})
	require.NoError(t, err)
	assert.Len(t, children, 2)
	assert.Equal(t, "all", repoQuery.Get("type"))
}
