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

package auth

import (
	"context"
	"testing"

	"github.com/stretchr/testify/mock"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/helpers/oidchelper"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
	logmocks "github.com/apache/incubator-devlake/mocks/core/log"
)

func TestRefreshOIDCProviderRetainsLastKnownGoodStateOnDatabaseReadFailure(t *testing.T) {
	db := dalmocks.NewDal(t)
	logger := logmocks.NewLogger(t)
	readErr := errors.Default.New("database temporarily unavailable")
	db.EXPECT().HasTable(mock.Anything).Return(true)
	db.EXPECT().First(mock.Anything, mock.Anything).Return(readErr)
	db.EXPECT().IsErrorNotFound(readErr).Return(false)
	logger.EXPECT().Warn(mock.Anything, "auth: database OIDC provider refresh failed; retaining last-known-good provider state").Return()

	knownGood := &oidchelper.Config{
		AuthEnabled: true,
		OIDCEnabled: true,
		Providers: map[string]*oidchelper.ProviderConfig{
			"google": {Name: "google", DisplayName: "Google"},
		},
	}
	service := &Service{
		bootstrapCfg: knownGood,
		runtimeCfg:   knownGood,
		providers:    buildProviders(knownGood),
		db:           db,
		logger:       logger,
	}

	if err := service.RefreshOIDCProvider(context.Background()); err == nil {
		t.Fatal("expected database refresh failure")
	}
	actualCfg, actualProviders := service.providerState()
	if actualCfg != knownGood || actualProviders["google"] == nil {
		t.Fatal("database read failure replaced the last-known-good OIDC provider state")
	}
}
