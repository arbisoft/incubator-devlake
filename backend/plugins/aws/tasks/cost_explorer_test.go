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
	"net/http"
	"testing"
	"time"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/plugins/aws/models"
	"github.com/stretchr/testify/require"
)

func TestAwsCostPeriods(t *testing.T) {
	tests := []struct {
		name     string
		now      time.Time
		actual   AwsCostTimePeriod
		forecast AwsCostTimePeriod
	}{
		{
			"mid month", time.Date(2026, 11, 24, 2, 30, 0, 0, time.UTC),
			AwsCostTimePeriod{Start: "2026-10-01", End: "2026-11-24"}, AwsCostTimePeriod{Start: "2026-11-24", End: "2026-12-01"},
		},
		{
			"first of the month", time.Date(2026, 11, 1, 0, 5, 0, 0, time.UTC),
			AwsCostTimePeriod{Start: "2026-10-01", End: "2026-11-01"}, AwsCostTimePeriod{Start: "2026-11-01", End: "2026-12-01"},
		},
		{
			"last day of the year", time.Date(2026, 12, 31, 23, 59, 0, 0, time.UTC),
			AwsCostTimePeriod{Start: "2026-11-01", End: "2026-12-31"}, AwsCostTimePeriod{Start: "2026-12-31", End: "2027-01-01"},
		},
		{
			"january", time.Date(2027, 1, 15, 0, 0, 0, 0, time.UTC),
			AwsCostTimePeriod{Start: "2026-12-01", End: "2027-01-15"}, AwsCostTimePeriod{Start: "2027-01-15", End: "2027-02-01"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actual, forecast := awsCostPeriods(tt.now)
			require.Equal(t, tt.actual, actual)
			require.Equal(t, tt.forecast, forecast)
		})
	}
}

func TestAwsCostFetchedToday(t *testing.T) {
	now := time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name    string
		fetched *time.Time
		want    bool
	}{
		{"never fetched", nil, false},
		{"this morning", timePtr(time.Date(2026, 11, 24, 2, 0, 0, 0, time.UTC)), true},
		{"at midnight", timePtr(time.Date(2026, 11, 24, 0, 0, 0, 0, time.UTC)), true},
		{"just before midnight", timePtr(time.Date(2026, 11, 23, 23, 59, 59, 0, time.UTC)), false},
		{"last week", timePtr(time.Date(2026, 11, 17, 2, 0, 0, 0, time.UTC)), false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			require.Equal(t, tt.want, awsCostFetchedToday(tt.fetched, now))
		})
	}
}

func TestAwsAccountFromArn(t *testing.T) {
	account, err := awsAccountFromArn("arn:aws:codepipeline:us-east-2:111122223333:acme-prod-backend-pipeline")
	require.Nil(t, err)
	require.Equal(t, "111122223333", account)
	for _, arn := range []string{"", "acme", "arn:aws:codepipeline:us-east-2::acme", "arn:aws:codepipeline"} {
		_, err = awsAccountFromArn(arn)
		require.NotNil(t, err, arn)
	}
}

func costResult(start string, estimated bool, groups ...AwsCostGroup) AwsCostResultByTime {
	return AwsCostResultByTime{TimePeriod: AwsCostTimePeriod{Start: start}, Estimated: estimated, Groups: groups}
}

func costGroup(service, amount string) AwsCostGroup {
	group := AwsCostGroup{Keys: []string{service}}
	group.Metrics.UnblendedCost = AwsCostAmount{Amount: amount, Unit: "USD"}
	return group
}

func TestAwsActualCostRows(t *testing.T) {
	base := models.AwsCostDaily{ConnectionId: 1, AccountId: "111122223333", FetchedAt: testLogTime}
	rows, err := awsActualCostRows(base, []AwsCostResultByTime{
		costResult("2026-11-22", false, costGroup("Amazon Simple Storage Service", "1.2345678901"), costGroup("AWS CodeBuild", "0.5")),
		costResult("2026-11-23", true, costGroup("AWS CodeBuild", "12")),
	})
	require.Nil(t, err)
	require.Len(t, rows, 3)
	require.Equal(t, models.AwsCostDaily{
		ConnectionId: 1, AccountId: "111122223333", Date: time.Date(2026, 11, 22, 0, 0, 0, 0, time.UTC),
		Service: "Amazon Simple Storage Service", Metric: "UnblendedCost", Amount: "1.2345678901", Unit: "USD", FetchedAt: testLogTime,
	}, *rows[0])
	require.Equal(t, "0.5000000000", rows[1].Amount)
	require.False(t, rows[1].Estimated)
	require.True(t, rows[2].Estimated)
	require.Equal(t, "12.0000000000", rows[2].Amount)
}

func TestAwsActualCostRowsRejectBadInput(t *testing.T) {
	base := models.AwsCostDaily{}
	_, err := awsActualCostRows(base, []AwsCostResultByTime{costResult("2026-11-22", false, costGroup("AWS CodeBuild", "n/a"))})
	require.NotNil(t, err)
	_, err = awsActualCostRows(base, []AwsCostResultByTime{costResult("22 Nov", false, costGroup("AWS CodeBuild", "1"))})
	require.NotNil(t, err)
	_, err = awsActualCostRows(base, []AwsCostResultByTime{costResult("2026-11-22", false, AwsCostGroup{})})
	require.NotNil(t, err)
}

func TestAwsForecastCostRows(t *testing.T) {
	base := models.AwsCostDaily{ConnectionId: 1, AccountId: "111122223333"}
	forecast := &AwsGetCostForecastOutput{
		Total: AwsCostAmount{Amount: "9.5", Unit: "USD"},
		ForecastResultsByTime: []AwsForecastResultByTime{
			{TimePeriod: AwsCostTimePeriod{Start: "2026-11-24", End: "2026-11-25"}, MeanValue: "3.1234567891"},
			{TimePeriod: AwsCostTimePeriod{Start: "2026-11-25", End: "2026-11-26"}, MeanValue: "2"},
		},
	}
	rows, err := awsForecastCostRows(base, forecast)
	require.Nil(t, err)
	require.Len(t, rows, 2)
	require.Equal(t, models.AwsCostDaily{
		ConnectionId: 1, AccountId: "111122223333", Date: time.Date(2026, 11, 24, 0, 0, 0, 0, time.UTC),
		Service: "", Metric: "UnblendedCostForecast", Amount: "3.1234567891", Unit: "USD", Estimated: true,
	}, *rows[0])
	require.Equal(t, "2.0000000000", rows[1].Amount)
}

// stubCostExplorer answers the Cost Explorer calls of a test and records them.
type stubCostExplorer struct {
	pages       []AwsGetCostAndUsageOutput
	forecast    AwsGetCostForecastOutput
	usageErr    errors.Error
	forecastErr errors.Error
	actions     []string
	tokens      []string
}

func (s *stubCostExplorer) call(action string, input, output interface{}) errors.Error {
	s.actions = append(s.actions, action)
	switch in := input.(type) {
	case AwsGetCostAndUsageInput:
		s.tokens = append(s.tokens, in.NextPageToken)
		if s.usageErr != nil {
			return s.usageErr
		}
		*output.(*AwsGetCostAndUsageOutput) = s.pages[len(s.tokens)-1]
	case AwsGetCostForecastInput:
		if s.forecastErr != nil {
			return s.forecastErr
		}
		*output.(*AwsGetCostForecastOutput) = s.forecast
	}
	return nil
}

func newStubCostExplorer() *stubCostExplorer {
	return &stubCostExplorer{
		pages: []AwsGetCostAndUsageOutput{
			{ResultsByTime: []AwsCostResultByTime{costResult("2026-11-22", false, costGroup("AWS CodeBuild", "1"))}, NextPageToken: "page-2"},
			{ResultsByTime: []AwsCostResultByTime{costResult("2026-11-23", true, costGroup("AWS CodeBuild", "2"))}},
		},
		forecast: AwsGetCostForecastOutput{
			Total:                 AwsCostAmount{Amount: "5", Unit: "USD"},
			ForecastResultsByTime: []AwsForecastResultByTime{{TimePeriod: AwsCostTimePeriod{Start: "2026-11-24"}, MeanValue: "5"}},
		},
	}
}

func TestCollectAwsCostRows(t *testing.T) {
	now := time.Date(2026, 11, 24, 2, 0, 0, 0, time.UTC)
	base := models.AwsCostDaily{ConnectionId: 1, AccountId: "111122223333"}

	t.Run("actual spend follows the page token", func(t *testing.T) {
		stub := newStubCostExplorer()
		rows, err := collectAwsActualRows(stub.call, base, now)
		require.Nil(t, err)
		require.Equal(t, []string{"GetCostAndUsage", "GetCostAndUsage"}, stub.actions)
		require.Equal(t, []string{"", "page-2"}, stub.tokens)
		require.Len(t, rows, 2)
	})

	t.Run("forecast rows", func(t *testing.T) {
		stub := newStubCostExplorer()
		rows, err := collectAwsForecastRows(stub.call, base, now)
		require.Nil(t, err)
		require.Equal(t, []string{"GetCostForecast"}, stub.actions)
		require.Len(t, rows, 1)
		require.Equal(t, "UnblendedCostForecast", rows[0].Metric)
	})

	t.Run("a failed usage call is returned and not retried", func(t *testing.T) {
		stub := newStubCostExplorer()
		stub.usageErr = errors.HttpStatus(http.StatusInternalServerError).New("boom")
		rows, err := collectAwsActualRows(stub.call, base, now)
		require.NotNil(t, err)
		require.Empty(t, rows)
		require.Equal(t, []string{"GetCostAndUsage"}, stub.actions)
	})

	t.Run("a malformed response is returned with no rows", func(t *testing.T) {
		stub := newStubCostExplorer()
		stub.pages[1].ResultsByTime = []AwsCostResultByTime{costResult("2026-11-23", false, costGroup("AWS CodeBuild", "n/a"))}
		rows, err := collectAwsActualRows(stub.call, base, now)
		require.NotNil(t, err)
		require.Empty(t, rows)
		stub = newStubCostExplorer()
		stub.forecast.ForecastResultsByTime[0].TimePeriod.Start = "soon"
		rows, err = collectAwsForecastRows(stub.call, base, now)
		require.NotNil(t, err)
		require.Empty(t, rows)
	})
}

func TestFetchAwsActualCostsRequest(t *testing.T) {
	var got AwsGetCostAndUsageInput
	_, err := fetchAwsActualCosts(func(_ string, input, _ interface{}) errors.Error {
		got = input.(AwsGetCostAndUsageInput)
		return nil
	}, AwsCostTimePeriod{Start: "2026-10-01", End: "2026-11-24"})
	require.Nil(t, err)
	require.Equal(t, AwsGetCostAndUsageInput{
		TimePeriod:  AwsCostTimePeriod{Start: "2026-10-01", End: "2026-11-24"},
		Granularity: "DAILY",
		Metrics:     []string{"UnblendedCost"},
		GroupBy:     []AwsCostGroupDefinition{{Type: "DIMENSION", Key: "SERVICE"}},
	}, got)
}
