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
	stdctx "context"
	"strings"
	"testing"

	"github.com/spf13/viper"

	"github.com/apache/incubator-devlake/helpers/unithelper"
	contextimpl "github.com/apache/incubator-devlake/impls/context"
	dalmocks "github.com/apache/incubator-devlake/mocks/core/dal"
)

func TestNewServiceRejectsOIDCWithoutEnvironmentOrDatabaseProvider(t *testing.T) {
	config := viper.New()
	config.Set("AUTH_ENABLED", true)
	config.Set("OIDC_ENABLED", true)
	config.Set("SESSION_SECRET", "test-secret-with-at-least-32-bytes")

	db := dalmocks.NewDal(t)
	db.EXPECT().HasTable("auth_oidc_provider_configuration").Return(false)
	basicRes := contextimpl.NewDefaultBasicRes(config, unithelper.DummyLogger(), db)

	_, err := NewService(stdctx.Background(), basicRes)
	if err == nil || !strings.Contains(err.Error(), "neither OIDC_PROVIDERS nor an activated database provider") {
		t.Fatalf("NewService() error = %v, want missing provider source error", err)
	}
}
