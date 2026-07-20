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
	"testing"

	"github.com/apache/incubator-devlake/helpers/unithelper"
	contextimpl "github.com/apache/incubator-devlake/impls/context"
	mockdal "github.com/apache/incubator-devlake/mocks/core/dal"
	"github.com/spf13/viper"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

type fakePluginMeta struct{}

func (fakePluginMeta) Description() string { return "" }
func (fakePluginMeta) Name() string        { return "claude_enterprise" }
func (fakePluginMeta) RootPkgPath() string {
	return "github.com/apache/incubator-devlake/plugins/claude_enterprise"
}

// TestInitWiresPackageLevelHelpers drives Init (0% in Phase 16) with a real
// BasicRes (DevLake's own impls/context.DefaultBasicRes) backed by a mocked
// Dal, asserting every package-level helper it constructs is non-nil --
// helper.NewConnectionHelper/NewDataSourceHelper only wire configuration at
// construction time, they do not query the database.
func TestInitWiresPackageLevelHelpers(t *testing.T) {
	mockDal := new(mockdal.Dal)
	// srvhelper.NewModelSrvHelper reads each model's primary-key columns at
	// construction time (once per Connection/Scope/ScopeConfig type helper.
	// NewDataSourceHelper wires); an empty result is a valid, real answer for
	// a database that was never migrated in this test.
	mockDal.On("GetColumns", mock.Anything, mock.Anything).Return(nil, nil)
	basicRes := contextimpl.NewDefaultBasicRes(viper.New(), unithelper.DummyLogger(), mockDal)

	Init(basicRes, fakePluginMeta{})

	require.NotNil(t, connectionHelper)
	require.NotNil(t, dsHelper)
	require.NotNil(t, raProxy)
	require.NotNil(t, raScopeList)
	require.NotNil(t, raScopeSearch)
	require.NotNil(t, vld)
}
