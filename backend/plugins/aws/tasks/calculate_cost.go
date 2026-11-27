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
	"database/sql"
	"sort"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

var _ plugin.SubTaskEntryPoint = CalculateCost

var CalculateCostMeta = plugin.SubTaskMeta{
	Name:             "calculateCost",
	EntryPoint:       CalculateCost,
	EnabledByDefault: true,
	Description:      "calculate the estimated cost of AWS CodeBuild builds and pipeline actions from public prices",
	DomainTypes:      []string{plugin.DOMAIN_TYPE_CICD},
}

const (
	awsUsageTypeBuildPrefix     = "Build-Min:"
	awsUsageTypeBuildReserved   = ":Reserved:"
	awsUsageTypeBuildSeparator  = ":"
	awsUsageTypeBuildSizePrefix = "g1."
	awsComputeTypeGeneralPrefix = "BUILD_GENERAL1_"
	// awsUsageTypeActionExecution is the usage type of V2 pipeline action execution minutes.
	awsUsageTypeActionExecution = "actionExecutionMinute"
)

type awsEnvironmentType string

const (
	awsEnvLinux         awsEnvironmentType = "LINUX_CONTAINER"
	awsEnvArm           awsEnvironmentType = "ARM_CONTAINER"
	awsEnvLinuxGpu      awsEnvironmentType = "LINUX_GPU_CONTAINER"
	awsEnvWindowsServer awsEnvironmentType = "WINDOWS_SERVER_2019_CONTAINER"
	awsEnvWindows       awsEnvironmentType = "WINDOWS_CONTAINER"
)

// awsBuildOsLabels maps a build environment type to the OS label of the price usage type.
var awsBuildOsLabels = map[awsEnvironmentType]string{
	awsEnvLinux:         "Linux",
	awsEnvArm:           "ARM",
	awsEnvLinuxGpu:      "LinuxGPU",
	awsEnvWindowsServer: "Windows",
	awsEnvWindows:       "Windows",
}

// awsBuildPriceUsageType returns the price usage type of a build environment, or "" when its cost is not modelled.
func awsBuildPriceUsageType(environmentType, computeType string) string {
	os, ok := awsBuildOsLabels[awsEnvironmentType(environmentType)]
	size, isGeneral := strings.CutPrefix(computeType, awsComputeTypeGeneralPrefix)
	if !ok || !isGeneral || size == "" {
		return ""
	}
	return awsUsageTypeBuildPrefix + os + awsUsageTypeBuildSeparator + awsUsageTypeBuildSizePrefix + strings.ToLower(size)
}

// awsBilledMinutes rounds the time between two instants up to whole minutes; ok is false when the end is before the start.
func awsBilledMinutes(start, end time.Time) (minutes int, ok bool) {
	elapsed := end.Sub(start)
	if elapsed < 0 {
		return 0, false
	}
	return int((elapsed + time.Minute - 1) / time.Minute), true
}

// awsCostFields is the calculated cost of one row; invalid values are stored as NULL.
type awsCostFields struct {
	Minutes   sql.NullInt64
	UnitPrice sql.NullString
	Cost      sql.NullString
}

// awsEstimateCost prices billed minutes with the price in force at startedAt; a missing price leaves the unit price and the cost unknown.
func awsEstimateCost(minutes int, usageType string, startedAt time.Time, prices awsPriceBook) (awsCostFields, errors.Error) {
	fields := awsCostFields{Minutes: sql.NullInt64{Int64: int64(minutes), Valid: true}}
	unitPrice, found := prices.priceAt(usageType, startedAt)
	if usageType == "" || !found {
		return fields, nil
	}
	cost, err := multiplyAwsMoney(minutes, unitPrice)
	if err != nil {
		return fields, err
	}
	fields.UnitPrice = sql.NullString{String: unitPrice, Valid: true}
	fields.Cost = sql.NullString{String: cost, Valid: true}
	return fields, nil
}

// awsBuildCost returns the cost fields and the price usage type of a build.
func awsBuildCost(build *models.AwsCodebuildBuild, prices awsPriceBook) (awsCostFields, string, errors.Error) {
	if !build.BuildComplete || build.StartTime == nil || build.EndTime == nil {
		return awsCostFields{}, "", nil
	}
	minutes, ok := awsBilledMinutes(*build.StartTime, *build.EndTime)
	if !ok {
		return awsCostFields{}, "", nil
	}
	usageType := awsBuildPriceUsageType(build.EnvironmentType, build.ComputeType)
	fields, err := awsEstimateCost(minutes, usageType, *build.StartTime, prices)
	return fields, usageType, err
}

// awsActionBilled reports whether an action execution of a pipeline is billed by the minute.
func awsActionBilled(pipelineType string, action *models.AwsActionExecution) bool {
	return pipelineType == models.AwsPipelineTypeV2 &&
		action.Category != models.AwsCategoryApproval &&
		action.Owner != models.AwsOwnerCustom &&
		action.Status != string(models.AwsActionInProgress) &&
		action.StartTime != nil && action.LastUpdateTime != nil
}

// awsActionCost returns the cost fields of an action execution.
func awsActionCost(pipelineType string, action *models.AwsActionExecution, prices awsPriceBook) (awsCostFields, errors.Error) {
	if !awsActionBilled(pipelineType, action) {
		return awsCostFields{}, nil
	}
	minutes, ok := awsBilledMinutes(*action.StartTime, *action.LastUpdateTime)
	if !ok {
		return awsCostFields{}, nil
	}
	return awsEstimateCost(minutes, awsUsageTypeActionExecution, *action.StartTime, prices)
}

// awsPricePoint is the unit price published at one date.
type awsPricePoint struct {
	PublishedAt time.Time
	PriceUsd    string
}

// awsPriceBook keeps every published price of a region per usage type, oldest first.
type awsPriceBook map[string][]awsPricePoint

// priceAt returns the newest price published at or before the instant, or the oldest one when the instant precedes them all.
func (b awsPriceBook) priceAt(usageType string, at time.Time) (string, bool) {
	points := b[usageType]
	if len(points) == 0 {
		return "", false
	}
	i := sort.Search(len(points), func(i int) bool { return points[i].PublishedAt.After(at) })
	if i == 0 {
		return points[0].PriceUsd, true
	}
	return points[i-1].PriceUsd, true
}

// loadAwsPrices returns every published price of a region.
func loadAwsPrices(db dal.Dal, region string) (awsPriceBook, errors.Error) {
	var rows []models.AwsPrice
	err := db.All(&rows, dal.Where("region = ?", region), dal.Orderby("publication_date ASC"))
	if err != nil {
		return nil, errors.Default.Wrap(err, "load the prices")
	}
	book := make(awsPriceBook)
	for _, row := range rows {
		book[row.UsageType] = append(book[row.UsageType], awsPricePoint{PublishedAt: row.PublicationDate, PriceUsd: row.PriceUsd})
	}
	return book, nil
}

// awsMissingPrices tracks the usage types that have no price in one run.
type awsMissingPrices map[string]bool

func (m awsMissingPrices) note(usageType string, fields awsCostFields) {
	if usageType != "" && fields.Minutes.Valid && !fields.UnitPrice.Valid {
		m[usageType] = true
	}
}

func (m awsMissingPrices) sorted() []string {
	usageTypes := make([]string, 0, len(m))
	for usageType := range m {
		usageTypes = append(usageTypes, usageType)
	}
	sort.Strings(usageTypes)
	return usageTypes
}

// writeAwsCosts updates the cost columns of the rows, one statement per distinct value and batch of ids.
func writeAwsCosts(db dal.Dal, table dal.Tabler, idColumn string, connectionId uint64, groups map[awsCostGroup][]string) errors.Error {
	for group, ids := range groups {
		err := inBatches(ids, awsInsertBatchSize, func(batch []string) errors.Error {
			set := []dal.DalSet{
				{ColumnName: "billed_minutes", Value: group.Fields.Minutes},
				{ColumnName: "unit_price_usd", Value: group.Fields.UnitPrice},
				{ColumnName: "estimated_cost_usd", Value: group.Fields.Cost},
			}
			if group.WithUsageType {
				set = append(set, dal.DalSet{ColumnName: "price_usage_type", Value: group.UsageType})
			}
			return db.UpdateColumns(table, set, dal.Where("connection_id = ? AND "+idColumn+" IN ?", connectionId, batch))
		})
		if err != nil {
			return errors.Default.Wrap(err, "write the calculated costs")
		}
	}
	return nil
}

// awsCostGroup is one distinct set of cost values shared by many rows.
type awsCostGroup struct {
	Fields        awsCostFields
	UsageType     string
	WithUsageType bool
}

func calculateBuildCosts(db dal.Dal, data *AwsTaskData, prices awsPriceBook, missing awsMissingPrices) errors.Error {
	var builds []models.AwsCodebuildBuild
	err := db.All(
		&builds,
		dal.Where(
			"connection_id = ? AND build_id IN (SELECT external_execution_id FROM _tool_aws_action_executions WHERE connection_id = ? AND pipeline_arn = ? AND provider = ? AND external_execution_id <> '')",
			data.Options.ConnectionId, data.Options.ConnectionId, data.Options.ScopeId, models.AwsProviderCodeBuild,
		),
	)
	if err != nil {
		return errors.Default.Wrap(err, "load the builds")
	}
	groups := make(map[awsCostGroup][]string)
	for i := range builds {
		fields, usageType, err := awsBuildCost(&builds[i], prices)
		if err != nil {
			return errors.Default.Wrap(err, "calculate the cost of a build")
		}
		missing.note(usageType, fields)
		group := awsCostGroup{Fields: fields, UsageType: usageType, WithUsageType: true}
		groups[group] = append(groups[group], builds[i].BuildId)
	}
	return writeAwsCosts(db, &models.AwsCodebuildBuild{}, "build_id", data.Options.ConnectionId, groups)
}

func calculateActionCosts(db dal.Dal, data *AwsTaskData, prices awsPriceBook, missing awsMissingPrices) errors.Error {
	var scope models.AwsPipeline
	if err := db.First(&scope, dal.Where("connection_id = ? AND arn = ?", data.Options.ConnectionId, data.Options.ScopeId)); err != nil {
		return errors.Default.Wrap(err, "load the pipeline scope")
	}
	var actions []models.AwsActionExecution
	err := db.All(&actions, dal.Where("connection_id = ? AND pipeline_arn = ?", data.Options.ConnectionId, data.Options.ScopeId))
	if err != nil {
		return errors.Default.Wrap(err, "load the action executions")
	}
	groups := make(map[awsCostGroup][]string)
	for i := range actions {
		fields, err := awsActionCost(scope.PipelineType, &actions[i], prices)
		if err != nil {
			return errors.Default.Wrap(err, "calculate the cost of an action execution")
		}
		if fields.Minutes.Valid {
			missing.note(awsUsageTypeActionExecution, fields)
		}
		group := awsCostGroup{Fields: fields}
		groups[group] = append(groups[group], actions[i].ActionExecutionId)
	}
	return writeAwsCosts(db, &models.AwsActionExecution{}, "action_execution_id", data.Options.ConnectionId, groups)
}

// CalculateCost recomputes the estimated cost of the builds and actions of the scope from the stored prices.
func CalculateCost(taskCtx plugin.SubTaskContext) errors.Error {
	data := taskCtx.GetData().(*AwsTaskData)
	db := taskCtx.GetDal()
	prices, err := loadAwsPrices(db, data.Scope.Region)
	if err != nil {
		return err
	}
	missing := awsMissingPrices{}
	if err = calculateBuildCosts(db, data, prices, missing); err != nil {
		return err
	}
	if err = calculateActionCosts(db, data, prices, missing); err != nil {
		return err
	}
	for _, usageType := range missing.sorted() {
		taskCtx.GetLogger().Warn(nil, "no price for %s in %s; its cost is left empty", usageType, data.Scope.Region)
	}
	return nil
}
