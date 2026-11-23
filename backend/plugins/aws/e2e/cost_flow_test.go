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

package e2e

import (
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/helpers/e2ehelper"
	"github.com/apache/incubator-devlake/plugins/aws/impl"
	"github.com/apache/incubator-devlake/plugins/aws/models"
	"github.com/apache/incubator-devlake/plugins/aws/tasks"
	"github.com/stretchr/testify/require"
)

const (
	buildOnPrice    = "acme-prod-build:00000002-1111-4111-8111-000000000000"
	buildNoPrice    = "acme-ci-tests:00000009-1111-4111-8111-000000000000"
	buildOtherPipe  = "acme-ci-tests:00000008-1111-4111-8111-000000000000"
	buildAfterRaise = "acme-prod-build:00000004-1111-4111-8111-000000000000"
	buildLateRaise  = "acme-prod-build:00000005-1111-4111-8111-000000000000"
	actionBuild     = "ac000001-0000-4000-8000-000000000013"
	actionDeploy    = "ac000001-0000-4000-8000-000000000014"
	actionInFlight  = "ac000006-0000-4000-8000-000000000061"
	actionChecks    = "bc000001-0000-4000-8000-000000000001"
)

// importCostFixtures loads the extracted builds and actions that already carry calculated costs, so a stale value would show.
func importCostFixtures(tester *e2ehelper.DataFlowTester) {
	for _, table := range []struct {
		tabler dal.Tabler
		csv    string
	}{
		{&models.AwsPipeline{}, "_tool_aws_pipelines"},
		{&models.AwsActionExecution{}, "_tool_aws_action_executions"},
		{&models.AwsCodebuildBuild{}, "_tool_aws_codebuild_builds"},
	} {
		tester.FlushTabler(table.tabler)
		tester.ImportCsvIntoTabler("./snapshot_tables/"+table.csv+".csv", table.tabler)
	}
	tester.FlushTabler(&models.AwsPrice{})
	tester.ImportCsvIntoTabler("./seed_tables/_tool_aws_prices.csv", &models.AwsPrice{})
}

// publishPrice stores one more published price of the scope region.
func publishPrice(t *testing.T, tester *e2ehelper.DataFlowTester, usageType, publishedAt, priceUsd string) {
	published, err := time.Parse(time.RFC3339, publishedAt)
	require.Nil(t, err)
	require.Nil(t, tester.Dal.Create(&models.AwsPrice{Region: "us-east-2", UsageType: usageType, PublicationDate: published, Unit: "minutes", PriceUsd: priceUsd, FetchedAt: published}))
}

func calculateAllCosts(t *testing.T, tester *e2ehelper.DataFlowTester) {
	for _, scopeId := range []string{deployPipelineArn, checksPipelineArn} {
		tester.Subtask(tasks.CalculateCostMeta, newTaskData(t, tester, scopeId))
	}
}

func readBuild(t *testing.T, tester *e2ehelper.DataFlowTester, buildId string) models.AwsCodebuildBuild {
	var build models.AwsCodebuildBuild
	require.Nil(t, tester.Dal.First(&build, dal.Where("connection_id = ? AND build_id = ?", 1, buildId)))
	return build
}

func readAction(t *testing.T, tester *e2ehelper.DataFlowTester, actionId string) models.AwsActionExecution {
	var action models.AwsActionExecution
	require.Nil(t, tester.Dal.First(&action, dal.Where("connection_id = ? AND action_execution_id = ?", 1, actionId)))
	return action
}

func requireNoCost(t *testing.T, build models.AwsCodebuildBuild) {
	require.Nil(t, build.UnitPriceUsd)
	require.Nil(t, build.EstimatedCostUsd)
}

func requireNoActionCost(t *testing.T, action models.AwsActionExecution) {
	require.Nil(t, action.BilledMinutes)
	require.Nil(t, action.UnitPriceUsd)
	require.Nil(t, action.EstimatedCostUsd)
}

func TestCalculateCostIsRecomputedEveryRun(t *testing.T) {
	var aws impl.Aws
	tester := e2ehelper.NewDataFlowTester(t, "aws", aws)

	t.Run("each row is priced with the price in force when it started and a newer price does not rewrite it", func(t *testing.T) {
		importCostFixtures(tester)
		require.Nil(t, tester.Dal.UpdateColumn(&models.AwsCodebuildBuild{}, "estimated_cost_usd", "9.9900000000", dal.Where("build_id = ?", buildOnPrice)))
		publishPrice(t, tester, "Build-Min:Linux:g1.medium", "2026-11-20T13:50:00Z", "0.0300000000")
		publishPrice(t, tester, "actionExecutionMinute", "2026-11-20T13:44:00Z", "0.0040000000")
		calculateAllCosts(t, tester)

		before := readBuild(t, tester, buildOnPrice)
		require.Equal(t, "0.0100000000", *before.UnitPriceUsd)
		require.Equal(t, "0.0400000000", *before.EstimatedCostUsd)
		require.Equal(t, 4, *before.BilledMinutes)
		after := readBuild(t, tester, buildAfterRaise)
		require.Equal(t, "0.0300000000", *after.UnitPriceUsd)
		require.Equal(t, "0.1500000000", *after.EstimatedCostUsd)
		require.Equal(t, "0.0300000000", *readBuild(t, tester, buildLateRaise).UnitPriceUsd)

		require.Equal(t, "0.0080000000", *readAction(t, tester, actionBuild).EstimatedCostUsd)
		raised := readAction(t, tester, actionDeploy)
		require.Equal(t, "0.0040000000", *raised.UnitPriceUsd)
		require.Equal(t, "0.0200000000", *raised.EstimatedCostUsd)
	})

	t.Run("a build without a price keeps its minutes and has no cost", func(t *testing.T) {
		importCostFixtures(tester)
		calculateAllCosts(t, tester)
		build := readBuild(t, tester, buildNoPrice)
		require.Equal(t, "Build-Min:Linux:g1.large", build.PriceUsageType)
		require.Equal(t, 3, *build.BilledMinutes)
		requireNoCost(t, build)
	})

	t.Run("a V1 pipeline bills no actions but its builds are still priced", func(t *testing.T) {
		importCostFixtures(tester)
		require.Nil(t, tester.Dal.UpdateColumn(&models.AwsPipeline{}, "pipeline_type", "V1", dal.Where("arn = ?", checksPipelineArn)))
		calculateAllCosts(t, tester)
		requireNoActionCost(t, readAction(t, tester, actionChecks))
		require.Equal(t, "0.0500000000", *readBuild(t, tester, buildOtherPipe).EstimatedCostUsd)
		require.Equal(t, "0.0100000000", *readAction(t, tester, actionDeploy).EstimatedCostUsd)
	})

	t.Run("approval, custom and unfinished actions are left empty", func(t *testing.T) {
		importCostFixtures(tester)
		require.Nil(t, tester.Dal.UpdateColumn(&models.AwsActionExecution{}, "category", models.AwsCategoryApproval, dal.Where("action_execution_id = ?", actionBuild)))
		require.Nil(t, tester.Dal.UpdateColumn(&models.AwsActionExecution{}, "owner", models.AwsOwnerCustom, dal.Where("action_execution_id = ?", actionChecks)))
		require.Nil(t, tester.Dal.UpdateColumn(&models.AwsActionExecution{}, "billed_minutes", 7, dal.Where("action_execution_id = ?", actionInFlight)))
		calculateAllCosts(t, tester)
		requireNoActionCost(t, readAction(t, tester, actionBuild))
		requireNoActionCost(t, readAction(t, tester, actionChecks))
		requireNoActionCost(t, readAction(t, tester, actionInFlight))
		require.Equal(t, "0.0100000000", *readAction(t, tester, actionDeploy).EstimatedCostUsd)
	})

	t.Run("without any price every cost is empty but the minutes stay", func(t *testing.T) {
		importCostFixtures(tester)
		tester.FlushTabler(&models.AwsPrice{})
		calculateAllCosts(t, tester)
		build := readBuild(t, tester, buildOnPrice)
		require.Equal(t, 4, *build.BilledMinutes)
		requireNoCost(t, build)
		action := readAction(t, tester, actionDeploy)
		require.Equal(t, 5, *action.BilledMinutes)
		require.Nil(t, action.UnitPriceUsd)
		require.Nil(t, action.EstimatedCostUsd)
	})
}
