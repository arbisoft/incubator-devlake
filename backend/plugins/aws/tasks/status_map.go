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
	"time"

	"github.com/apache/incubator-devlake/core/models/domainlayer/devops"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

type awsCicdStatus struct {
	Result string
	Status string
}

var (
	awsDone       = awsCicdStatus{Result: devops.RESULT_DEFAULT, Status: devops.STATUS_DONE}
	awsInProgress = awsCicdStatus{Result: devops.RESULT_DEFAULT, Status: devops.STATUS_IN_PROGRESS}
	awsUnknown    = awsCicdStatus{Result: devops.RESULT_DEFAULT, Status: devops.STATUS_OTHER}
)

var awsExecutionStatuses = map[models.AwsExecutionStatus]awsCicdStatus{
	models.AwsExecutionSucceeded:  {Result: devops.RESULT_SUCCESS, Status: devops.STATUS_DONE},
	models.AwsExecutionFailed:     {Result: devops.RESULT_FAILURE, Status: devops.STATUS_DONE},
	models.AwsExecutionStopped:    awsDone,
	models.AwsExecutionCancelled:  awsDone,
	models.AwsExecutionSuperseded: awsDone,
	models.AwsExecutionInProgress: awsInProgress,
	models.AwsExecutionStopping:   awsInProgress,
}

var awsActionStatuses = map[models.AwsActionStatus]awsCicdStatus{
	models.AwsActionSucceeded:  {Result: devops.RESULT_SUCCESS, Status: devops.STATUS_DONE},
	models.AwsActionFailed:     {Result: devops.RESULT_FAILURE, Status: devops.STATUS_DONE},
	models.AwsActionAbandoned:  awsDone,
	models.AwsActionInProgress: awsInProgress,
}

func cicdStatusOf[S ~string](statuses map[S]awsCicdStatus, status string) awsCicdStatus {
	if mapped, ok := statuses[S(status)]; ok {
		return mapped
	}
	return awsUnknown
}

// awsTaskDates derives the CI/CD dates and duration of a run; it finishes at the last update only once the status is done.
func awsTaskDates(start, lastUpdate *time.Time, status awsCicdStatus) (dates devops.TaskDatesInfo, durationSec float64) {
	if start != nil {
		dates.CreatedDate = *start
		dates.StartedDate = start
	}
	if status.Status == devops.STATUS_DONE && lastUpdate != nil {
		dates.FinishedDate = lastUpdate
		if start != nil {
			durationSec = lastUpdate.Sub(*start).Seconds()
		}
	}
	return dates, durationSec
}
