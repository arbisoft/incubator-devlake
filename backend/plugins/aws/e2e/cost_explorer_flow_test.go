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
	"encoding/json"
	"net/http"
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
	costAccount    = "111122223333"
	costDateLayout = "2006-01-02"
	codeBuildName  = "AWS CodeBuild"
	storageName    = "Amazon Simple Storage Service"
)

// costExplorerStub answers the two Cost Explorer actions the connector uses and counts the requests.
type costExplorerStub struct {
	usage    tasks.AwsGetCostAndUsageOutput
	forecast tasks.AwsGetCostForecastOutput
	status   int
	errType  string
	// forecastFails makes only GetCostForecast fail with the status and error type.
	forecastFails bool
	requests      int
	lastWindow    tasks.AwsCostTimePeriod
}

func (s *costExplorerStub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.requests++
	w.Header().Set("Content-Type", "application/x-amz-json-1.1")
	if s.errType != "" && !s.forecastFails {
		w.WriteHeader(s.status)
		_ = json.NewEncoder(w).Encode(map[string]string{"__type": s.errType, "message": "stub"})
		return
	}
	switch r.Header.Get("X-Amz-Target") {
	case tasks.AwsTarget(tasks.AwsServiceCostExplorer, "GetCostAndUsage"):
		var input tasks.AwsGetCostAndUsageInput
		_ = json.NewDecoder(r.Body).Decode(&input)
		s.lastWindow = input.TimePeriod
		_ = json.NewEncoder(w).Encode(s.usage)
	case tasks.AwsTarget(tasks.AwsServiceCostExplorer, "GetCostForecast"):
		if s.forecastFails {
			w.WriteHeader(s.status)
			_ = json.NewEncoder(w).Encode(map[string]string{"__type": s.errType, "message": "stub"})
			return
		}
		_ = json.NewEncoder(w).Encode(s.forecast)
	default:
		w.WriteHeader(http.StatusBadRequest)
	}
}

func costGroupOf(service, amount string) tasks.AwsCostGroup {
	group := tasks.AwsCostGroup{Keys: []string{service}}
	group.Metrics.UnblendedCost = tasks.AwsCostAmount{Amount: amount, Unit: "USD"}
	return group
}

func costDay(day time.Time, estimated bool, groups ...tasks.AwsCostGroup) tasks.AwsCostResultByTime {
	return tasks.AwsCostResultByTime{
		TimePeriod: tasks.AwsCostTimePeriod{Start: day.Format(costDateLayout), End: day.AddDate(0, 0, 1).Format(costDateLayout)},
		Estimated:  estimated,
		Groups:     groups,
	}
}

func newCostExplorerData(t *testing.T, tester *e2ehelper.DataFlowTester, stub *costExplorerStub) *tasks.AwsTaskData {
	data := newTaskData(t, tester, deployPipelineArn)
	data.CostExplorerClient = newStubClient(t, tester, stub)
	return data
}

type costKey struct {
	date, service, metric string
}

func readCosts(t *testing.T, tester *e2ehelper.DataFlowTester) map[costKey]models.AwsCostDaily {
	var rows []models.AwsCostDaily
	require.Nil(t, tester.Dal.All(&rows, dal.Where("connection_id = ? AND account_id = ?", 1, costAccount)))
	costs := make(map[costKey]models.AwsCostDaily, len(rows))
	for _, row := range rows {
		costs[costKey{row.Date.Format(costDateLayout), row.Service, row.Metric}] = row
	}
	return costs
}

func TestCostExplorerIsFetchedOncePerDayAndUpsertsByDay(t *testing.T) {
	var aws impl.Aws
	tester := e2ehelper.NewDataFlowTester(t, "aws", aws)
	importCostFixtures(tester)
	tester.FlushTabler(&models.AwsCostDaily{})

	today := time.Now().UTC().Truncate(24 * time.Hour)
	yesterday, dayBefore := today.AddDate(0, 0, -1), today.AddDate(0, 0, -2)
	earlier := today.Add(-20 * time.Hour)
	require.Nil(t, tester.Dal.Create(&models.AwsCostDaily{
		ConnectionId: 1, AccountId: costAccount, Date: dayBefore, Service: "", Metric: string(models.AwsCostMetricUnblendedCostForecast),
		Amount: "9.0000000000", Unit: "USD", Estimated: true, FetchedAt: earlier,
	}))
	stub := &costExplorerStub{
		usage: tasks.AwsGetCostAndUsageOutput{ResultsByTime: []tasks.AwsCostResultByTime{
			costDay(dayBefore, false, costGroupOf(codeBuildName, "1.5"), costGroupOf(storageName, "0.1234567891")),
			costDay(yesterday, true, costGroupOf(codeBuildName, "2.25")),
		}},
		forecast: tasks.AwsGetCostForecastOutput{
			Total: tasks.AwsCostAmount{Amount: "3.1", Unit: "USD"},
			ForecastResultsByTime: []tasks.AwsForecastResultByTime{
				{TimePeriod: tasks.AwsCostTimePeriod{Start: today.Format(costDateLayout), End: today.AddDate(0, 0, 1).Format(costDateLayout)}, MeanValue: "3.1"},
			},
		},
	}
	data := newCostExplorerData(t, tester, stub)
	dayKey := func(day time.Time, service string, metric models.AwsCostMetric) costKey {
		return costKey{day.Format(costDateLayout), service, string(metric)}
	}

	t.Run("stores spend by service and the forecast, and drops forecasts of past days", func(t *testing.T) {
		tester.Subtask(tasks.CollectCostExplorerMeta, data)
		require.Equal(t, 2, stub.requests)
		costs := readCosts(t, tester)
		require.Len(t, costs, 4)
		require.Equal(t, "1.5000000000", costs[dayKey(dayBefore, codeBuildName, models.AwsCostMetricUnblendedCost)].Amount)
		require.Equal(t, "0.1234567891", costs[dayKey(dayBefore, storageName, models.AwsCostMetricUnblendedCost)].Amount)
		yesterdayRow := costs[dayKey(yesterday, codeBuildName, models.AwsCostMetricUnblendedCost)]
		require.Equal(t, "2.2500000000", yesterdayRow.Amount)
		require.True(t, yesterdayRow.Estimated)
		require.Equal(t, "USD", yesterdayRow.Unit)
		forecastRow := costs[dayKey(today, "", models.AwsCostMetricUnblendedCostForecast)]
		require.Equal(t, "3.1000000000", forecastRow.Amount)
		require.True(t, forecastRow.Estimated)
		require.NotContains(t, costs, dayKey(dayBefore, "", models.AwsCostMetricUnblendedCostForecast))
		previousMonth := time.Date(today.Year(), today.Month()-1, 1, 0, 0, 0, 0, time.UTC)
		require.Equal(t, tasks.AwsCostTimePeriod{Start: previousMonth.Format(costDateLayout), End: today.Format(costDateLayout)}, stub.lastWindow)
	})

	t.Run("a second run on the same day makes no request", func(t *testing.T) {
		tester.Subtask(tasks.CollectCostExplorerMeta, data)
		require.Equal(t, 2, stub.requests)
	})

	t.Run("a later run makes an estimated day final", func(t *testing.T) {
		require.Nil(t, tester.Dal.UpdateColumn(&models.AwsCostDaily{}, "fetched_at", earlier, dal.Where("connection_id = ?", 1)))
		stub.usage = tasks.AwsGetCostAndUsageOutput{ResultsByTime: []tasks.AwsCostResultByTime{
			costDay(yesterday, false, costGroupOf(codeBuildName, "2.3")),
		}}
		tester.Subtask(tasks.CollectCostExplorerMeta, data)
		require.Equal(t, 4, stub.requests)
		yesterdayRow := readCosts(t, tester)[dayKey(yesterday, codeBuildName, models.AwsCostMetricUnblendedCost)]
		require.Equal(t, "2.3000000000", yesterdayRow.Amount)
		require.False(t, yesterdayRow.Estimated)
	})
}

func TestCostExplorerIsOffWithoutAClientAndStopsWhenDenied(t *testing.T) {
	var aws impl.Aws
	tester := e2ehelper.NewDataFlowTester(t, "aws", aws)
	importCostFixtures(tester)
	tester.FlushTabler(&models.AwsCostDaily{})

	tester.Subtask(tasks.CollectCostExplorerMeta, newTaskData(t, tester, deployPipelineArn))
	require.Empty(t, readCosts(t, tester))

	denied := &costExplorerStub{status: http.StatusForbidden, errType: "AccessDeniedException"}
	tester.Subtask(tasks.CollectCostExplorerMeta, newCostExplorerData(t, tester, denied))
	require.Equal(t, 1, denied.requests)
	require.Empty(t, readCosts(t, tester))

	broken := &costExplorerStub{status: http.StatusInternalServerError, errType: "InternalFailure"}
	require.Nil(t, tasks.CollectCostExplorer(tester.SubtaskContext(newCostExplorerData(t, tester, broken))))
	require.Equal(t, 1, broken.requests)
	require.Empty(t, readCosts(t, tester))

	malformed := &costExplorerStub{usage: tasks.AwsGetCostAndUsageOutput{ResultsByTime: []tasks.AwsCostResultByTime{
		costDay(time.Now().UTC().AddDate(0, 0, -1), false, costGroupOf(codeBuildName, "n/a")),
	}}}
	require.Nil(t, tasks.CollectCostExplorer(tester.SubtaskContext(newCostExplorerData(t, tester, malformed))))
	require.Empty(t, readCosts(t, tester))
}

func TestCostExplorerForecastFailureKeepsTheActualSpend(t *testing.T) {
	var aws impl.Aws
	tester := e2ehelper.NewDataFlowTester(t, "aws", aws)
	importCostFixtures(tester)
	tester.FlushTabler(&models.AwsCostDaily{})

	yesterday := time.Now().UTC().Truncate(24*time.Hour).AddDate(0, 0, -1)
	stub := &costExplorerStub{
		usage:         tasks.AwsGetCostAndUsageOutput{ResultsByTime: []tasks.AwsCostResultByTime{costDay(yesterday, false, costGroupOf(codeBuildName, "2"))}},
		status:        http.StatusInternalServerError,
		errType:       "InternalFailure",
		forecastFails: true,
	}
	data := newCostExplorerData(t, tester, stub)
	require.Nil(t, tasks.CollectCostExplorer(tester.SubtaskContext(data)))
	require.Equal(t, 2, stub.requests)
	utcToday := time.Now().UTC()
	firstOfMonth := time.Date(utcToday.Year(), utcToday.Month(), 1, 0, 0, 0, 0, time.UTC)
	require.Equal(t, tasks.AwsCostTimePeriod{Start: firstOfMonth.AddDate(0, -12, 0).Format(costDateLayout), End: utcToday.Format(costDateLayout)}, stub.lastWindow)
	costs := readCosts(t, tester)
	require.Len(t, costs, 1)
	require.Equal(t, "2.0000000000", costs[costKey{yesterday.Format(costDateLayout), codeBuildName, string(models.AwsCostMetricUnblendedCost)}].Amount)

	require.Nil(t, tasks.CollectCostExplorer(tester.SubtaskContext(data)))
	require.Equal(t, 2, stub.requests)
}
