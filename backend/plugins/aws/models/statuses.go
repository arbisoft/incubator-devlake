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

package models

type AwsExecutionStatus string

const (
	AwsExecutionInProgress AwsExecutionStatus = "InProgress"
	AwsExecutionStopping   AwsExecutionStatus = "Stopping"
	AwsExecutionStopped    AwsExecutionStatus = "Stopped"
	AwsExecutionSucceeded  AwsExecutionStatus = "Succeeded"
	AwsExecutionSuperseded AwsExecutionStatus = "Superseded"
	AwsExecutionFailed     AwsExecutionStatus = "Failed"
	AwsExecutionCancelled  AwsExecutionStatus = "Cancelled"
)

// AwsUnfinishedExecutionStatuses are the pipeline run statuses that can still change.
var AwsUnfinishedExecutionStatuses = []string{string(AwsExecutionInProgress), string(AwsExecutionStopping)}

type AwsExecutionType string

const (
	AwsExecutionTypeStandard AwsExecutionType = "STANDARD"
	AwsExecutionTypeRollback AwsExecutionType = "ROLLBACK"
)

type AwsActionStatus string

const (
	AwsActionInProgress AwsActionStatus = "InProgress"
	AwsActionAbandoned  AwsActionStatus = "Abandoned"
	AwsActionSucceeded  AwsActionStatus = "Succeeded"
	AwsActionFailed     AwsActionStatus = "Failed"
)

// AwsCategorySource is the category of source actions.
const AwsCategorySource = "Source"

// AwsProviderCodeBuild is the action provider of CodeBuild actions.
const AwsProviderCodeBuild = "CodeBuild"

type AwsBuildPhaseType string

const (
	AwsBuildPhaseSubmitted    AwsBuildPhaseType = "SUBMITTED"
	AwsBuildPhaseQueued       AwsBuildPhaseType = "QUEUED"
	AwsBuildPhaseProvisioning AwsBuildPhaseType = "PROVISIONING"
)

type AwsBuildPhaseStatus string

const (
	AwsBuildPhaseFailed   AwsBuildPhaseStatus = "FAILED"
	AwsBuildPhaseFault    AwsBuildPhaseStatus = "FAULT"
	AwsBuildPhaseTimedOut AwsBuildPhaseStatus = "TIMED_OUT"
)

// AwsFailedBuildPhaseStatuses are the build phase statuses that count as a failed phase.
var AwsFailedBuildPhaseStatuses = map[AwsBuildPhaseStatus]bool{
	AwsBuildPhaseFailed:   true,
	AwsBuildPhaseFault:    true,
	AwsBuildPhaseTimedOut: true,
}

type AwsSourceProviderType string

const (
	AwsSourceProviderGitHub    AwsSourceProviderType = "GitHub"
	AwsSourceProviderBitbucket AwsSourceProviderType = "Bitbucket"
	AwsSourceProviderGitLab    AwsSourceProviderType = "GitLab"
)
