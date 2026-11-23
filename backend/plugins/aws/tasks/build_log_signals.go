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
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

var _ plugin.SubTaskEntryPoint = CollectBuildLogSignals

var CollectBuildLogSignalsMeta = plugin.SubTaskMeta{
	Name:             "collectBuildLogSignals",
	EntryPoint:       CollectBuildLogSignals,
	EnabledByDefault: true,
	Description:      "read AWS CodeBuild logs and keep the parsed Trivy, smoke test and rollback signals",
	DomainTypes:      []string{plugin.DOMAIN_TYPE_CICD},
}

const (
	awsErrResourceNotFound = "ResourceNotFoundException"
	awsLogReadAttempts     = 3
	awsLogDeniedMessage    = "logs:GetLogEvents denied; build log signals are off"
)

// awsLogFetcher reads one page of log events.
type awsLogFetcher func(input AwsGetLogEventsInput) (*AwsGetLogEventsOutput, errors.Error)

// awsLogBuild is a build whose log may be read, with the names of the action that ran it.
type awsLogBuild struct {
	BuildId    string
	LogGroup   string
	LogStream  string
	StageName  string
	ActionName string
	HasMatches bool
}

func awsHttpCode(err errors.Error) int {
	return err.GetType().GetHttpCode()
}

// isRetryableAwsLogError reports a throttled request, which the client already waited on, or a failure with no AWS answer such as a network timeout.
func isRetryableAwsLogError(err errors.Error) bool {
	code, _ := api.ParseAwsError(err)
	return awsHttpCode(err) == http.StatusTooManyRequests || code == ""
}

// fetchAwsLogPage reads one page, retrying throttled requests and network failures.
func fetchAwsLogPage(fetch awsLogFetcher, input AwsGetLogEventsInput) (*AwsGetLogEventsOutput, errors.Error) {
	var err errors.Error
	for attempt := 0; attempt < awsLogReadAttempts; attempt++ {
		var out *AwsGetLogEventsOutput
		if out, err = fetch(input); err == nil {
			return out, nil
		}
		if !isRetryableAwsLogError(err) {
			break
		}
	}
	return nil, err
}

// readAwsLogEvents reads the whole log from its start; the end is reached when the forward token repeats.
func readAwsLogEvents(fetch awsLogFetcher, group, stream string) ([]AwsLogEvent, errors.Error) {
	var events []AwsLogEvent
	token := ""
	for {
		out, err := fetchAwsLogPage(fetch, AwsGetLogEventsInput{LogGroupName: group, LogStreamName: stream, StartFromHead: true, NextToken: token})
		if err != nil {
			return nil, err
		}
		events = append(events, out.Events...)
		if out.NextForwardToken == token {
			return events, nil
		}
		token = out.NextForwardToken
	}
}

// isAwsLogMissing reports whether AWS answered that the log group or stream does not exist.
func isAwsLogMissing(err errors.Error) bool {
	code, _ := api.ParseAwsError(err)
	return code == awsErrResourceNotFound
}

// loadAwsLogBuilds lists the completed builds of the scope that have a log and are inside the sync window.
func loadAwsLogBuilds(db dal.Dal, data *AwsTaskData, timeAfter *time.Time) ([]awsLogBuild, errors.Error) {
	clauses := []dal.Clause{
		dal.Select("b.build_id, b.log_group, b.log_stream, a.stage_name, a.action_name, " +
			"EXISTS(SELECT 1 FROM _tool_aws_build_log_pattern_matches m WHERE m.connection_id = b.connection_id AND m.build_id = b.build_id) AS has_matches"),
		dal.From("_tool_aws_codebuild_builds b"),
		dal.Join("JOIN _tool_aws_action_executions a ON a.connection_id = b.connection_id AND a.external_execution_id = b.build_id"),
		dal.Where(
			"a.connection_id = ? AND a.pipeline_arn = ? AND a.provider = ? AND b.build_complete = ? AND b.log_group <> '' AND b.log_stream <> ''",
			data.Options.ConnectionId, data.Options.ScopeId, models.AwsProviderCodeBuild, true,
		),
		dal.Orderby("b.end_time, b.build_id"),
	}
	if timeAfter != nil {
		clauses = append(clauses, dal.Where("b.end_time >= ?", *timeAfter))
	}
	var builds []awsLogBuild
	if err := db.All(&builds, clauses...); err != nil {
		return nil, errors.Default.Wrap(err, "load the builds with logs")
	}
	return builds, nil
}

func awsSignalRows(connectionId uint64, pipelineArn, buildId string, signals []awsLogSignal) []*models.AwsBuildLogSignal {
	seq := make(map[models.AwsLogPatternName]int)
	rows := make([]*models.AwsBuildLogSignal, 0, len(signals))
	for _, signal := range signals {
		seq[signal.Type]++
		loggedAt := signal.LoggedAt
		rows = append(rows, &models.AwsBuildLogSignal{
			ConnectionId: connectionId,
			BuildId:      buildId,
			SignalType:   string(signal.Type),
			Seq:          seq[signal.Type],
			PipelineArn:  pipelineArn,
			Target:       signal.Target,
			Total:        signal.Total,
			Critical:     signal.Critical,
			High:         signal.High,
			Medium:       signal.Medium,
			Low:          signal.Low,
			Unknown:      signal.Unknown,
			Result:       signal.Result,
			LoggedAt:     &loggedAt,
		})
	}
	return rows
}

// awsPatternRows builds the pattern rows of a build; a nil result means the log was not available.
func awsPatternRows(connectionId uint64, pipelineArn, buildId string, applied []awsAppliedPattern, result *awsLogParseResult) []*models.AwsBuildLogPatternMatch {
	rows := make([]*models.AwsBuildLogPatternMatch, 0, len(applied))
	for _, pattern := range applied {
		row := &models.AwsBuildLogPatternMatch{
			ConnectionId: connectionId,
			BuildId:      buildId,
			PatternName:  string(pattern.Name),
			PipelineArn:  pipelineArn,
			Pattern:      pattern.Pattern.Text,
		}
		if result != nil {
			count := result.Counts[pattern.Name]
			row.MatchCount = &count
		}
		rows = append(rows, row)
	}
	return rows
}

func createInBatches[T any](db dal.Dal, rows []T) errors.Error {
	return inBatches(rows, awsInsertBatchSize, func(batch []T) errors.Error {
		return db.Create(&batch)
	})
}

// replaceAwsBuildLog replaces the stored signals and pattern rows of a build with a fresh parse.
func replaceAwsBuildLog(db dal.Dal, connectionId uint64, buildId string, signals []*models.AwsBuildLogSignal, patterns []*models.AwsBuildLogPatternMatch) (err errors.Error) {
	tx := db.Begin()
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()
	where := dal.Where("connection_id = ? AND build_id = ?", connectionId, buildId)
	if err = tx.Delete(&models.AwsBuildLogSignal{}, where); err != nil {
		return err
	}
	if err = tx.Delete(&models.AwsBuildLogPatternMatch{}, where); err != nil {
		return err
	}
	if err = createInBatches(tx, signals); err != nil {
		return err
	}
	if err = createInBatches(tx, patterns); err != nil {
		return err
	}
	return tx.Commit()
}

// markAwsBuildLogUnavailable records that a build log could not be read, unless the build already has stored results.
func markAwsBuildLogUnavailable(db dal.Dal, build awsLogBuild, patterns []*models.AwsBuildLogPatternMatch) errors.Error {
	if build.HasMatches {
		return nil
	}
	return createInBatches(db, patterns)
}

// awsLogOutcome counts what happened to the builds of one run.
type awsLogOutcome struct {
	Read, Unavailable, Skipped int
}

// CollectBuildLogSignals reads the logs of the builds of the scope and stores the parsed signals.
func CollectBuildLogSignals(taskCtx plugin.SubTaskContext) errors.Error {
	data := taskCtx.GetData().(*AwsTaskData)
	logger := taskCtx.GetLogger()
	patterns, err := compileAwsLogPatterns(data.Options.ScopeConfig)
	if err != nil {
		return err
	}
	if !patterns.anySet() {
		logger.Info("no build log patterns are configured; build log signals are skipped")
		return nil
	}
	syncPolicy := taskCtx.TaskContext().SyncPolicy()
	fullSync := syncPolicy != nil && syncPolicy.FullSync
	var timeAfter *time.Time
	if syncPolicy != nil {
		timeAfter = syncPolicy.TimeAfter
	}
	db := taskCtx.GetDal()
	builds, err := loadAwsLogBuilds(db, data, timeAfter)
	if err != nil {
		return err
	}
	_, action := models.SplitAwsAction(models.AwsActionGetLogEvents)
	fetch := func(input AwsGetLogEventsInput) (*AwsGetLogEventsOutput, errors.Error) {
		var out AwsGetLogEventsOutput
		if err := PostAwsJson(data.LogsClient, AwsServiceLogs, action, input, &out); err != nil {
			return nil, err
		}
		return &out, nil
	}
	var outcome awsLogOutcome
	for _, build := range builds {
		deployment := isDeploymentAction(data.RegexEnricher, build.StageName, build.ActionName)
		applied := patterns.applicable(deployment)
		if len(applied) == 0 || (build.HasMatches && !fullSync) {
			outcome.Skipped++
			continue
		}
		events, err := readAwsLogEvents(fetch, build.LogGroup, build.LogStream)
		switch {
		case err != nil && awsHttpCode(err) == http.StatusForbidden:
			logger.Warn(nil, awsLogDeniedMessage)
			return nil
		case err != nil && !isAwsLogMissing(err):
			return errors.Default.Wrap(err, "read the log of build "+build.BuildId)
		case err != nil || len(events) == 0:
			outcome.Unavailable++
			unavailable := awsPatternRows(data.Options.ConnectionId, data.Options.ScopeId, build.BuildId, applied, nil)
			if err = markAwsBuildLogUnavailable(db, build, unavailable); err != nil {
				return errors.Default.Wrap(err, "record the unavailable log of build "+build.BuildId)
			}
		default:
			outcome.Read++
			result := parseAwsBuildLog(awsLogLines(events), patterns, deployment)
			signals := awsSignalRows(data.Options.ConnectionId, data.Options.ScopeId, build.BuildId, result.Signals)
			matches := awsPatternRows(data.Options.ConnectionId, data.Options.ScopeId, build.BuildId, applied, &result)
			if err = replaceAwsBuildLog(db, data.Options.ConnectionId, build.BuildId, signals, matches); err != nil {
				return errors.Default.Wrap(err, "store the signals of build "+build.BuildId)
			}
		}
	}
	logger.Info("build logs: %d read, %d unavailable, %d skipped", outcome.Read, outcome.Unavailable, outcome.Skipped)
	return nil
}
