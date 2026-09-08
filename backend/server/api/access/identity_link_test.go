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

package access

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/mock"

	mockdal "github.com/apache/incubator-devlake/mocks/core/dal"
)

func TestLinkableOIDCProvidersUsesAuthenticatedPrincipalUser(t *testing.T) {
	db := &mockdal.Dal{}
	db.On("All", mock.AnythingOfType("*[]access.AccessIdentity"), mock.Anything).Run(func(args mock.Arguments) {
		identities := args.Get(0).(*[]AccessIdentity)
		*identities = []AccessIdentity{{AccessUserID: 42, Issuer: "https://accounts.google.com"}}
	}).Return(nil).Once()
	db.On("All", mock.AnythingOfType("*[]access.OIDCProvider"), mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		providers := args.Get(0).(*[]OIDCProvider)
		*providers = []OIDCProvider{
			{ProviderKey: "google", DisplayName: "Google", IssuerURL: "https://accounts.google.com", Enabled: true},
			{ProviderKey: "okta", DisplayName: "Okta", IssuerURL: "https://example.okta.com", Enabled: true},
		}
	}).Return(nil).Once()

	providers, err := (&Service{db: db}).LinkableOIDCProviders(42)
	if err != nil {
		t.Fatalf("LinkableOIDCProviders() error = %v", err)
	}
	if len(providers) != 1 || providers[0].ProviderKey != "okta" {
		t.Fatalf("LinkableOIDCProviders() = %+v, want only Okta", providers)
	}
}

func TestListLinkableOIDCProvidersAcceptsLocalSessionPrincipal(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := &mockdal.Dal{}
	db.On("All", mock.AnythingOfType("*[]access.AccessIdentity"), mock.Anything).Return(nil).Once()
	db.On("All", mock.AnythingOfType("*[]access.OIDCProvider"), mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		providers := args.Get(0).(*[]OIDCProvider)
		*providers = []OIDCProvider{{ProviderKey: "google", DisplayName: "Google", IssuerURL: "https://accounts.google.com", Enabled: true}}
	}).Return(nil).Once()

	previous := defaultService
	defaultService = &Service{cfg: Config{Enabled: true}, db: db}
	t.Cleanup(func() { defaultService = previous })

	router := gin.New()
	router.Use(func(c *gin.Context) {
		SetPrincipal(c, &Principal{UserID: 42, Role: RoleMember})
	})
	router.GET("/access/oidc-providers/linkable", ListLinkableOIDCProviders)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/access/oidc-providers/linkable", nil))

	if response.Code != http.StatusOK {
		t.Fatalf("local session linkable providers status = %d, want %d: %s", response.Code, http.StatusOK, response.Body.String())
	}
}
