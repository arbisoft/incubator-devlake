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

package tasks

import (
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/domainlayer"
	"github.com/apache/incubator-devlake/core/models/domainlayer/crossdomain"
	"github.com/apache/incubator-devlake/core/plugin"
	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	mockdal "github.com/apache/incubator-devlake/mocks/core/dal"
	mockplugin "github.com/apache/incubator-devlake/mocks/core/plugin"
	"github.com/apache/incubator-devlake/plugins/claude_enterprise/models"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// TestSubTaskEntryPointsRejectWrongTaskDataType drives every
// Collect*/Extract*/ConvertUserActivities SubTaskEntryPoint in this package
// through their shared defensive type-assertion branch. Before this test,
// Phase 16 measured every one of these functions at 0% coverage because
// nothing in the package ever called them with a plugin.SubTaskContext.
func TestSubTaskEntryPointsRejectWrongTaskDataType(t *testing.T) {
	entryPoints := map[string]plugin.SubTaskEntryPoint{
		"CollectSummaries":       CollectSummaries,
		"ExtractSummaries":       ExtractSummaries,
		"CollectUserActivities":  CollectUserActivities,
		"ExtractUserActivities":  ExtractUserActivities,
		"CollectUserUsageReport": CollectUserUsageReport,
		"ExtractUserUsageReport": ExtractUserUsageReport,
		"CollectUserCostReport":  CollectUserCostReport,
		"ExtractUserCostReport":  ExtractUserCostReport,
		"CollectSkills":          CollectSkills,
		"ExtractSkills":          ExtractSkills,
		"CollectConnectors":      CollectConnectors,
		"ExtractConnectors":      ExtractConnectors,
		"CollectChatProjects":    CollectChatProjects,
		"ExtractChatProjects":    ExtractChatProjects,
		"CollectPlugins":         CollectPlugins,
		"ExtractPlugins":         ExtractPlugins,
		"CollectArtifacts":       CollectArtifacts,
		"ExtractArtifacts":       ExtractArtifacts,
		"ConvertUserActivities":  ConvertUserActivities,
	}

	for name, entryPoint := range entryPoints {
		t.Run(name, func(t *testing.T) {
			err := entryPoint(newBadTaskDataSubTaskContext())
			require.Error(t, err)
			require.Contains(t, err.Error(), "task data is not ClaudeEnterpriseTaskData")
		})
	}
}

// TestExtractEntryPointsAreNoOpWhenRawTableDoesNotExist exercises every
// Extract* entry point (MVP + the five Phase 14 extended entities) with
// valid task data against a Dal that reports the endpoint's raw table has
// never been created. That is a real, legitimate operational state (the
// collector subtask for this endpoint has not run yet in this environment),
// and helper.ApiExtractor already special-cases it by returning a clean nil
// instead of erroring -- so this is a genuine behavioral assertion, not a
// "doesn't panic" placeholder.
func TestExtractEntryPointsAreNoOpWhenRawTableDoesNotExist(t *testing.T) {
	data := validClaudeEnterpriseTaskData()
	extractPoints := map[string]plugin.SubTaskEntryPoint{
		"ExtractSummaries":       ExtractSummaries,
		"ExtractUserActivities":  ExtractUserActivities,
		"ExtractUserUsageReport": ExtractUserUsageReport,
		"ExtractUserCostReport":  ExtractUserCostReport,
		"ExtractSkills":          ExtractSkills,
		"ExtractConnectors":      ExtractConnectors,
		"ExtractChatProjects":    ExtractChatProjects,
		"ExtractPlugins":         ExtractPlugins,
		"ExtractArtifacts":       ExtractArtifacts,
	}

	for name, entryPoint := range extractPoints {
		t.Run(name, func(t *testing.T) {
			err := entryPoint(newNoRawTableSubTaskContext(data))
			require.NoError(t, err, "extractor must be a safe no-op when its raw table was never collected")
		})
	}
}

// TestConvertUserActivitiesIsNoOpWhenNoAnalyticsRecordsExist drives
// ConvertUserActivities's real helper.DataConverter to completion with an
// empty analytics-record cursor -- the legitimate "nothing collected/
// extracted yet" state -- asserting it finishes cleanly rather than merely
// not panicking.
func TestConvertUserActivitiesIsNoOpWhenNoAnalyticsRecordsExist(t *testing.T) {
	err := ConvertUserActivities(newNoRowsConvertSubTaskContext(validClaudeEnterpriseTaskData()))
	require.NoError(t, err)
}

// TestConvertUserActivitiesSurfacesCursorErrors asserts the converter entry
// point propagates a real Dal failure (e.g. the analytics-record table being
// unreachable) as an error rather than swallowing it.
func TestConvertUserActivitiesSurfacesCursorErrors(t *testing.T) {
	mockDal := new(mockdal.Dal)
	mockDal.On("Cursor", mock.Anything).Return(nil, errors.Default.New("connection lost"))

	mockTaskContext := new(mockplugin.TaskContext)
	mockTaskContext.On("GetData").Return(validClaudeEnterpriseTaskData())

	mockCtx := new(mockplugin.SubTaskContext)
	mockCtx.On("TaskContext").Return(mockTaskContext)
	mockCtx.On("GetDal").Return(mockDal)

	err := ConvertUserActivities(mockCtx)
	require.Error(t, err)
	require.Contains(t, err.Error(), "connection lost")
}

func TestResolveDateRangeDefaultsToSevenDayReconciliationWindow(t *testing.T) {
	starting, ending := resolveDateRange(nil)
	start, err := time.Parse("2006-01-02", starting)
	require.NoError(t, err)
	end, err := time.Parse("2006-01-02", ending)
	require.NoError(t, err)
	require.Equal(t, 6, int(end.Sub(start).Hours()/24))

	starting, ending = resolveDateRange(&ClaudeEnterpriseOptions{StartingDate: "2026-01-01", EndingDate: "2026-01-02"})
	require.Equal(t, "2026-01-01", starting)
	require.Equal(t, "2026-01-02", ending)
}

func TestEffectiveOrganizationIdPrefersConnectionOverOptions(t *testing.T) {
	require.Empty(t, effectiveOrganizationId(nil))
	require.Empty(t, effectiveOrganizationId(&ClaudeEnterpriseTaskData{}))

	fromOptions := &ClaudeEnterpriseTaskData{
		Options: &ClaudeEnterpriseOptions{OrganizationId: "org_from_options"},
	}
	require.Equal(t, "org_from_options", effectiveOrganizationId(fromOptions))

	fromConnection := &ClaudeEnterpriseTaskData{
		Options: &ClaudeEnterpriseOptions{OrganizationId: "org_from_options"},
		Connection: &models.ClaudeEnterpriseConnection{
			ClaudeEnterpriseConn: models.ClaudeEnterpriseConn{OrganizationId: "org_from_connection"},
		},
	}
	require.Equal(t, "org_from_connection", effectiveOrganizationId(fromConnection))
}

func TestGetAnalyticsNextPageFuncRespectsPaginatedFlag(t *testing.T) {
	require.Nil(t, getAnalyticsNextPageFunc(summariesEndpoint))
	require.NotNil(t, getAnalyticsNextPageFunc(userActivitiesEndpoint))
}

func TestAnalyticsRawParamsConstructorAndGetParams(t *testing.T) {
	params := NewAnalyticsRawParams(7, "scope_1", "org_1", "summaries")
	require.Equal(t, uint64(7), params.ConnectionId)
	require.Equal(t, "scope_1", params.ScopeId)
	require.Equal(t, "org_1", params.OrganizationId)
	require.Equal(t, "summaries", params.Endpoint)
	require.Equal(t, params, params.GetParams())
}

func TestAnalyticsDayIteratorCloseIsNoOp(t *testing.T) {
	it, err := newAnalyticsDayIterator("2026-01-01", "2026-01-01", false)
	require.NoError(t, err)
	require.NoError(t, it.Close())
}

func TestResolveClaudeEnterpriseAccountId(t *testing.T) {
	accountId, err := resolveClaudeEnterpriseAccountId(nil, "")
	require.NoError(t, err)
	require.Empty(t, accountId, "an empty email must short-circuit without touching the Dal")

	// Zero matches: db.All succeeds with an empty slice (the real DAL never
	// errors on "no rows" for All -- only First does), so this must resolve
	// to ("", nil), not an error.
	zeroMatchDal := new(mockdal.Dal)
	zeroMatchDal.On("All", mock.Anything, mock.Anything).Return(nil)
	accountId, err = resolveClaudeEnterpriseAccountId(zeroMatchDal, "unknown@example.invalid")
	require.NoError(t, err)
	require.Empty(t, accountId)

	// Exactly one match resolves normally.
	singleMatchDal := new(mockdal.Dal)
	singleMatchDal.On("All", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		dst := args.Get(0).(*[]crossdomain.Account)
		*dst = []crossdomain.Account{{DomainEntity: domainlayer.DomainEntity{Id: "account_synthetic_001"}}}
	}).Return(nil)
	accountId, err = resolveClaudeEnterpriseAccountId(singleMatchDal, "dev@example.invalid")
	require.NoError(t, err)
	require.Equal(t, "account_synthetic_001", accountId)

	// Duplicate-email match: db.All hands back more than one row sharing the
	// same email (a data integrity anomaly, not a "no rows" outcome -- this
	// exercises the ">1" branch specifically, not the "0" branch, so a bug
	// that only checked len(accounts) == 0 wouldn't accidentally pass here).
	duplicateMatchDal := new(mockdal.Dal)
	duplicateMatchDal.On("All", mock.Anything, mock.Anything).Run(func(args mock.Arguments) {
		dst := args.Get(0).(*[]crossdomain.Account)
		*dst = []crossdomain.Account{
			{DomainEntity: domainlayer.DomainEntity{Id: "account_synthetic_001"}},
			{DomainEntity: domainlayer.DomainEntity{Id: "account_synthetic_002"}},
		}
	}).Return(nil)
	accountId, err = resolveClaudeEnterpriseAccountId(duplicateMatchDal, "shared@example.invalid")
	require.NoError(t, err, "a duplicate-email match must not surface as an error")
	require.Empty(t, accountId, "a duplicate-email match must not guess -- it must stay unresolved")

	// A real query failure (not a "no rows" outcome) must propagate instead
	// of being swallowed identically to the legitimate zero-match case.
	failingDal := new(mockdal.Dal)
	failingDal.On("All", mock.Anything, mock.Anything).Return(errors.Default.New("connection lost"))
	accountId, err = resolveClaudeEnterpriseAccountId(failingDal, "dev@example.invalid")
	require.Error(t, err)
	require.Contains(t, err.Error(), "connection lost")
	require.Empty(t, accountId)
}

// TestCreateApiClientRejectsInvalidEndpoint drives the CreateApiClient entry
// point (0% in Phase 16) through its real error path: an endpoint without a
// URL scheme is rejected before any network call is attempted.
func TestCreateApiClientRejectsInvalidEndpoint(t *testing.T) {
	connection := &models.ClaudeEnterpriseConnection{
		ClaudeEnterpriseConn: models.ClaudeEnterpriseConn{
			RestConnection:  helper.RestConnection{Endpoint: "not-a-valid-url"},
			AnalyticsApiKey: "sk-ant-api01-synthetic",
		},
	}
	taskCtx := newFakeTaskContext(new(mockdal.Dal), validClaudeEnterpriseTaskData())

	client, err := CreateApiClient(taskCtx, connection)
	require.Error(t, err)
	require.Nil(t, client)
}
