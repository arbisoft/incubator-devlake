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
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/log"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

var _ plugin.SubTaskEntryPoint = CollectCostExplorer

var CollectCostExplorerMeta = plugin.SubTaskMeta{
	Name:             "collectCostExplorer",
	EntryPoint:       CollectCostExplorer,
	EnabledByDefault: true,
	Description:      "collect daily AWS spend by service and its forecast from Cost Explorer",
	DomainTypes:      []string{plugin.DOMAIN_TYPE_CICD},
}

const (
	awsCostDateLayout       = "2006-01-02"
	awsCostGranularityDaily = "DAILY"
	awsCostGroupDimension   = "DIMENSION"
	awsCostGroupService     = "SERVICE"
	awsCostForecastMetric   = "UNBLENDED_COST"
	awsCostDeniedMessage    = "Cost Explorer is on but access was denied; spend by service is off"
	awsArnAccountIndex      = 4
	awsArnParts             = 6
	awsCostBackfillMonths   = 12
)

// awsCostCaller sends one Cost Explorer request.
type awsCostCaller func(action string, input, output interface{}) errors.Error

// awsCostPeriods returns the periods of the actual spend and of the forecast, both ending exclusive; a backfill starts the actual spend 12 months back.
func awsCostPeriods(now time.Time, backfill bool) (actual, forecast AwsCostTimePeriod) {
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	thisMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	actualStart := thisMonth.AddDate(0, -1, 0)
	if backfill {
		actualStart = thisMonth.AddDate(0, -awsCostBackfillMonths, 0)
	}
	return AwsCostTimePeriod{Start: actualStart.Format(awsCostDateLayout), End: today.Format(awsCostDateLayout)},
		AwsCostTimePeriod{Start: today.Format(awsCostDateLayout), End: thisMonth.AddDate(0, 1, 0).Format(awsCostDateLayout)}
}

// awsCostFetchedToday reports whether the connection already fetched its costs since the start of the UTC day.
func awsCostFetchedToday(newestFetch *time.Time, now time.Time) bool {
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	return newestFetch != nil && !newestFetch.Before(startOfDay)
}

// awsAccountFromArn returns the account id of an ARN.
func awsAccountFromArn(arn string) (string, errors.Error) {
	parts := strings.SplitN(arn, ":", awsArnParts)
	if len(parts) < awsArnParts || parts[awsArnAccountIndex] == "" {
		return "", errors.BadInput.New("the pipeline ARN has no account id")
	}
	return parts[awsArnAccountIndex], nil
}

// awsCostRow builds one daily cost row from the strings of a Cost Explorer response.
func awsCostRow(base models.AwsCostDaily, date, service string, metric models.AwsCostMetric, amount AwsCostAmount, estimated bool) (*models.AwsCostDaily, errors.Error) {
	day, err := errors.Convert01(time.Parse(awsCostDateLayout, date))
	if err != nil {
		return nil, errors.BadInput.Wrap(err, "read a cost date")
	}
	normalized, decimalErr := normalizeAwsDecimal(amount.Amount)
	if decimalErr != nil {
		return nil, errors.Default.Wrap(decimalErr, "read a cost amount")
	}
	row := base
	row.Date, row.Service, row.Metric = day, service, string(metric)
	row.Amount, row.Unit, row.Estimated = normalized, amount.Unit, estimated
	return &row, nil
}

// awsActualCostRows turns the results of GetCostAndUsage into rows of spend by service.
func awsActualCostRows(base models.AwsCostDaily, results []AwsCostResultByTime) ([]*models.AwsCostDaily, errors.Error) {
	var rows []*models.AwsCostDaily
	for _, result := range results {
		for _, group := range result.Groups {
			if len(group.Keys) == 0 {
				return nil, errors.BadInput.New("a cost group has no service")
			}
			row, err := awsCostRow(base, result.TimePeriod.Start, group.Keys[0], models.AwsCostMetricUnblendedCost, group.Metrics.UnblendedCost, result.Estimated)
			if err != nil {
				return nil, err
			}
			rows = append(rows, row)
		}
	}
	return rows, nil
}

// awsForecastCostRows turns the result of GetCostForecast into rows of forecast spend of the whole account.
func awsForecastCostRows(base models.AwsCostDaily, forecast *AwsGetCostForecastOutput) ([]*models.AwsCostDaily, errors.Error) {
	rows := make([]*models.AwsCostDaily, 0, len(forecast.ForecastResultsByTime))
	for _, result := range forecast.ForecastResultsByTime {
		amount := AwsCostAmount{Amount: result.MeanValue, Unit: forecast.Total.Unit}
		row, err := awsCostRow(base, result.TimePeriod.Start, "", models.AwsCostMetricUnblendedCostForecast, amount, true)
		if err != nil {
			return nil, err
		}
		rows = append(rows, row)
	}
	return rows, nil
}

// fetchAwsActualCosts reads every page of the daily spend by service.
func fetchAwsActualCosts(call awsCostCaller, period AwsCostTimePeriod) ([]AwsCostResultByTime, errors.Error) {
	_, action := models.SplitAwsAction(models.AwsActionGetCostAndUsage)
	input := AwsGetCostAndUsageInput{
		TimePeriod:  period,
		Granularity: awsCostGranularityDaily,
		Metrics:     []string{string(models.AwsCostMetricUnblendedCost)},
		GroupBy:     []AwsCostGroupDefinition{{Type: awsCostGroupDimension, Key: awsCostGroupService}},
	}
	var results []AwsCostResultByTime
	for {
		var out AwsGetCostAndUsageOutput
		if err := call(action, input, &out); err != nil {
			return nil, err
		}
		results = append(results, out.ResultsByTime...)
		if out.NextPageToken == "" {
			return results, nil
		}
		input.NextPageToken = out.NextPageToken
	}
}

// fetchAwsForecast reads the daily forecast of the account spend.
func fetchAwsForecast(call awsCostCaller, period AwsCostTimePeriod) (*AwsGetCostForecastOutput, errors.Error) {
	_, action := models.SplitAwsAction(models.AwsActionGetCostForecast)
	var out AwsGetCostForecastOutput
	err := call(action, AwsGetCostForecastInput{TimePeriod: period, Metric: awsCostForecastMetric, Granularity: awsCostGranularityDaily}, &out)
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// collectAwsActualRows reads the daily spend by service and turns it into rows.
func collectAwsActualRows(call awsCostCaller, base models.AwsCostDaily, now time.Time, backfill bool) ([]*models.AwsCostDaily, errors.Error) {
	period, _ := awsCostPeriods(now, backfill)
	results, err := fetchAwsActualCosts(call, period)
	if err != nil {
		return nil, err
	}
	return awsActualCostRows(base, results)
}

// collectAwsForecastRows reads the forecast of the account spend and turns it into rows.
func collectAwsForecastRows(call awsCostCaller, base models.AwsCostDaily, now time.Time) ([]*models.AwsCostDaily, errors.Error) {
	_, period := awsCostPeriods(now, false)
	forecast, err := fetchAwsForecast(call, period)
	if err != nil {
		return nil, err
	}
	return awsForecastCostRows(base, forecast)
}

// warnAwsCostFailure logs a Cost Explorer failure as a warning; a denied request gets its own message.
func warnAwsCostFailure(logger log.Logger, err errors.Error, lost string) {
	if awsHttpCode(err) == http.StatusForbidden {
		logger.Warn(nil, awsCostDeniedMessage)
		return
	}
	logger.Warn(err, "%s", lost)
}

// newestAwsCostFetch returns when the connection last fetched its costs, or nil when it never did.
func newestAwsCostFetch(db dal.Dal, connectionId uint64) (*time.Time, errors.Error) {
	var rows []models.AwsCostDaily
	err := db.All(&rows, dal.Where("connection_id = ?", connectionId), dal.Orderby("fetched_at DESC"), dal.Limit(1))
	if err != nil {
		return nil, errors.Default.Wrap(err, "load the newest cost fetch")
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return &rows[0].FetchedAt, nil
}

// storeAwsCosts upserts the rows and drops the forecasts of days that have actuals by now.
func storeAwsCosts(db dal.Dal, base models.AwsCostDaily, rows []*models.AwsCostDaily, now time.Time) errors.Error {
	err := inBatches(rows, awsInsertBatchSize, func(batch []*models.AwsCostDaily) errors.Error {
		return db.CreateOrUpdate(&batch)
	})
	if err != nil {
		return errors.Default.Wrap(err, "store the costs")
	}
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	err = db.Delete(
		&models.AwsCostDaily{},
		dal.Where("connection_id = ? AND account_id = ? AND metric = ? AND date < ?", base.ConnectionId, base.AccountId, string(models.AwsCostMetricUnblendedCostForecast), today),
	)
	return errors.Default.Wrap(err, "drop the superseded forecasts")
}

// CollectCostExplorer stores the daily spend by service and the forecast of the scope account, once a day per connection.
func CollectCostExplorer(taskCtx plugin.SubTaskContext) errors.Error {
	data := taskCtx.GetData().(*AwsTaskData)
	if data.CostExplorerClient == nil || api.AwsPartitionForRegion(data.Scope.Region) != api.AwsPartitionAws {
		return nil
	}
	db := taskCtx.GetDal()
	now := time.Now().UTC()
	newest, err := newestAwsCostFetch(db, data.Options.ConnectionId)
	if err != nil {
		return err
	}
	if awsCostFetchedToday(newest, now) {
		return nil
	}
	accountId, err := awsAccountFromArn(data.Scope.Arn)
	if err != nil {
		return err
	}
	call := func(action string, input, output interface{}) errors.Error {
		return PostAwsJson(data.CostExplorerClient, AwsServiceCostExplorer, action, input, output)
	}
	base := models.AwsCostDaily{ConnectionId: data.Options.ConnectionId, AccountId: accountId, FetchedAt: now}
	logger := taskCtx.GetLogger()
	rows, err := collectAwsActualRows(call, base, now, newest == nil)
	if err != nil {
		warnAwsCostFailure(logger, err, "Cost Explorer could not be read; spend by service is not updated")
		return nil
	}
	if len(rows) > 0 {
		if err = storeAwsCosts(db, base, rows, now); err != nil {
			return err
		}
	}
	rows, err = collectAwsForecastRows(call, base, now)
	if err != nil {
		warnAwsCostFailure(logger, err, "Cost Explorer could not be read; the forecast is not updated")
		return nil
	}
	if len(rows) == 0 {
		return nil
	}
	return storeAwsCosts(db, base, rows, now)
}
