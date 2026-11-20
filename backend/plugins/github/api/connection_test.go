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
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	implcontext "github.com/apache/incubator-devlake/impls/context"
	"github.com/apache/incubator-devlake/impls/logruslog"
	"github.com/apache/incubator-devlake/plugins/github/models"
	"github.com/spf13/viper"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFindMissingPerms(t *testing.T) {
	// permission is larger than required
	userPerms := map[string]bool{
		"repo": true,
	}
	requiredPerms := []string{"repo:status"}
	missingPerms := findMissingPerms(userPerms, requiredPerms)
	assert.Empty(t, missingPerms)

	// permission equals to required
	userPerms = map[string]bool{
		"repo:status": true,
	}
	requiredPerms = []string{"repo:status"}
	missingPerms = findMissingPerms(userPerms, requiredPerms)
	assert.Empty(t, missingPerms)

	// permissions are missing
	userPerms = map[string]bool{
		"admin:org": true,
	}
	requiredPerms = []string{"repo:status", "read:user"}
	missingPerms = findMissingPerms(userPerms, requiredPerms)
	assert.Equal(t, []string{"repo:status", "read:user"}, missingPerms)
}

func initGithubConnectionTestDeps(t *testing.T) {
	t.Helper()
	previousBasicRes := basicRes
	basicRes = implcontext.NewDefaultBasicRes(viper.New(), logruslog.Global, nil)
	t.Cleanup(func() {
		basicRes = previousBasicRes
	})
}

func newGithubTokenTestConn(endpoint, token string) models.GithubConn {
	return models.GithubConn{
		RestConnection: helper.RestConnection{Endpoint: endpoint},
		MultiAuth:      helper.MultiAuth{AuthMethod: models.AccessToken},
		GithubAccessToken: models.GithubAccessToken{
			AccessToken: helper.AccessToken{Token: token},
		},
	}
}

func newGithubUserTestServer(t *testing.T, status int, scopes, body string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/user", r.URL.Path, "connection validation must not probe repository access")
		w.Header().Set("Content-Type", "application/json")
		if scopes != "" {
			w.Header().Set("X-OAuth-Scopes", scopes)
		}
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
}

func syntheticClassicToken() string {
	return "ghp_" + strings.Repeat("c", 36)
}

func syntheticFineGrainedToken() string {
	return "github_pat_" + strings.Repeat("f", 82)
}

func syntheticLegacyToken() string {
	return "gho_" + strings.Repeat("o", 36)
}

func syntheticUnknownToken() string {
	return "pat_unknown_" + strings.Repeat("u", 32)
}

func TestGithubConnAccessTokenAuth_FineGrainedPAT(t *testing.T) {
	initGithubConnectionTestDeps(t)
	server := newGithubUserTestServer(t, http.StatusOK, "", `{"login":"fine-grained-user"}`)
	defer server.Close()

	result, err := testGithubConnAccessTokenAuth(context.Background(), newGithubTokenTestConn(server.URL, syntheticFineGrainedToken()))
	require.NoError(t, err)
	require.NotNil(t, result)
	assert.True(t, result.Success)
	assert.False(t, result.Warning)
	assert.Equal(t, "fine-grained-user", result.Login)
	assert.Equal(t, "Connection valid. Repository permissions have not been verified. Ensure the selected repositories have Read access to Actions, Contents, Discussions, Issues, Metadata and Pull requests.", result.Message)
}

func TestGithubConnAccessTokenAuth_ClassicPATScopes(t *testing.T) {
	tests := []struct {
		name        string
		scopes      string
		wantSuccess bool
		wantWarning bool
		wantMessage string
	}{
		{
			name:        "full required and private repository scopes",
			scopes:      "repo:status, repo_deployment, read:user, read:org, repo",
			wantSuccess: true,
		},
		{
			name:        "full required public scopes without private repository scope",
			scopes:      "repo:status, repo_deployment, read:user, read:org",
			wantSuccess: true,
			wantWarning: true,
			wantMessage: "This token is able to collect public repositories. If you want to collect private repositories, please check the field(s) repo",
		},
		{
			name:        "parent scopes satisfy required permissions",
			scopes:      "repo, user, admin:org",
			wantSuccess: true,
		},
		{
			name:        "partial scopes remain a failure",
			scopes:      "repo:status, read:user",
			wantWarning: true,
			wantMessage: "Please check the field(s) repo_deployment, read:org;\nIf you want to collect private repositories, please check the field(s) repo",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			initGithubConnectionTestDeps(t)
			server := newGithubUserTestServer(t, http.StatusOK, tt.scopes, `{"login":"classic-user"}`)
			defer server.Close()

			result, err := testGithubConnAccessTokenAuth(context.Background(), newGithubTokenTestConn(server.URL, syntheticClassicToken()))
			require.NoError(t, err)
			require.NotNil(t, result)
			assert.Equal(t, tt.wantSuccess, result.Success)
			assert.Equal(t, tt.wantWarning, result.Warning)
			assert.Equal(t, tt.wantMessage, result.Message)
		})
	}
}

func TestGithubConnAccessTokenAuth_RejectsInvalidResponses(t *testing.T) {
	responses := []struct {
		name       string
		status     int
		body       string
		wantErrMsg string
	}{
		{name: "unauthorized", status: http.StatusUnauthorized, body: `{}`, wantErrMsg: "GitHub rejected the token (401). Check that it is correct and not expired."},
		{name: "forbidden", status: http.StatusForbidden, body: `{}`},
		{name: "malformed user response", status: http.StatusOK, body: `{`},
		{name: "empty login", status: http.StatusOK, body: `{"login":""}`, wantErrMsg: "invalid token"},
	}
	tokenTypes := []struct {
		name  string
		token string
	}{
		{name: "classic PAT", token: syntheticClassicToken()},
		{name: "fine-grained PAT", token: syntheticFineGrainedToken()},
	}

	for _, tokenType := range tokenTypes {
		for _, response := range responses {
			t.Run(tokenType.name+"/"+response.name, func(t *testing.T) {
				initGithubConnectionTestDeps(t)
				server := newGithubUserTestServer(t, response.status, "", response.body)
				defer server.Close()

				result, err := testGithubConnAccessTokenAuth(context.Background(), newGithubTokenTestConn(server.URL, tokenType.token))
				require.Error(t, err)
				assert.Nil(t, result)
				if response.wantErrMsg != "" {
					assert.Contains(t, err.Error(), response.wantErrMsg)
				}
			})
		}
	}
}

func TestGithubConnAccessTokenAuth_RejectsUnsupportedTokenFormats(t *testing.T) {
	tests := []struct {
		name  string
		token string
	}{
		{name: "legacy OAuth token", token: syntheticLegacyToken()},
		{name: "unknown token prefix", token: syntheticUnknownToken()},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			initGithubConnectionTestDeps(t)
			server := newGithubUserTestServer(t, http.StatusOK, "", `{"login":"unsupported-user"}`)
			defer server.Close()

			result, err := testGithubConnAccessTokenAuth(context.Background(), newGithubTokenTestConn(server.URL, tt.token))
			require.NoError(t, err)
			require.NotNil(t, result)
			assert.False(t, result.Success)
			assert.Contains(t, result.Message, "Only classic personal access tokens (ghp_) and fine-grained personal access tokens (github_pat_)")
		})
	}
}

func TestExistingConnection_MixedPATResults(t *testing.T) {
	initGithubConnectionTestDeps(t)
	fineGrainedToken := syntheticFineGrainedToken()
	classicToken := syntheticClassicToken()
	legacyToken := syntheticLegacyToken()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/user", r.URL.Path, "connection validation must not probe repository access")
		switch r.Header.Get("Authorization") {
		case "Bearer " + fineGrainedToken:
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"login":"fine-grained-user"}`))
		case "Bearer " + classicToken:
			w.Header().Set("X-OAuth-Scopes", "repo:status")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"login":"classic-user"}`))
		case "Bearer " + legacyToken:
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"login":"legacy-user"}`))
		default:
			w.WriteHeader(http.StatusUnauthorized)
		}
	}))
	defer server.Close()

	conn := newGithubTokenTestConn(server.URL, strings.Join([]string{fineGrainedToken, classicToken, legacyToken}, ","))
	result, err := testExistingConnection(context.Background(), conn)
	require.Nil(t, err)
	require.NotNil(t, result)
	assert.False(t, result.Success)
	require.Len(t, result.Tokens, 3)
	assert.True(t, result.Tokens[0].Success)
	assert.Contains(t, result.Tokens[0].Message, "Repository permissions have not been verified")
	assert.False(t, result.Tokens[1].Success)
	assert.Contains(t, result.Tokens[1].Message, "Please check the field(s)")
	assert.False(t, result.Tokens[2].Success)
	assert.Contains(t, result.Tokens[2].Message, "Only classic personal access tokens")
	assert.Len(t, result.Causes, 2)
}

func TestExistingConnection_AllPATsValid(t *testing.T) {
	initGithubConnectionTestDeps(t)
	fineGrainedToken := syntheticFineGrainedToken()
	classicToken := syntheticClassicToken()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodGet, r.Method)
		assert.Equal(t, "/user", r.URL.Path, "connection validation must not probe repository access")
		w.Header().Set("Content-Type", "application/json")
		switch r.Header.Get("Authorization") {
		case "Bearer " + fineGrainedToken:
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"login":"fine-grained-user"}`))
		case "Bearer " + classicToken:
			w.Header().Set("X-OAuth-Scopes", "repo:status, repo_deployment, read:user, read:org, repo")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"login":"classic-user"}`))
		default:
			w.WriteHeader(http.StatusUnauthorized)
		}
	}))
	defer server.Close()

	conn := newGithubTokenTestConn(server.URL, strings.Join([]string{fineGrainedToken, classicToken}, ","))
	result, err := testExistingConnection(context.Background(), conn)
	require.Nil(t, err)
	require.NotNil(t, result)
	assert.True(t, result.Success)
	assert.Equal(t, "success", result.Message)
	require.Len(t, result.Tokens, 2)
	assert.True(t, result.Tokens[0].Success)
	assert.Contains(t, result.Tokens[0].Message, "Repository permissions have not been verified")
	assert.True(t, result.Tokens[1].Success)
	assert.Empty(t, result.Tokens[1].Message)
	assert.Empty(t, result.Causes)
}
