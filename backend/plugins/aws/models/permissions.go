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

import "strings"

type AwsPermissionRequirement string

const (
	AwsRequirementRequired     AwsPermissionRequirement = "required"
	AwsRequirementOptional     AwsPermissionRequirement = "optional"
	AwsRequirementCostExplorer AwsPermissionRequirement = "cost_explorer"
	AwsRequirementAssumeRole   AwsPermissionRequirement = "assume_role"
)

const (
	AwsActionListPipelines          = "codepipeline:ListPipelines"
	AwsActionGetPipeline            = "codepipeline:GetPipeline"
	AwsActionListTagsForResource    = "codepipeline:ListTagsForResource"
	AwsActionListPipelineExecutions = "codepipeline:ListPipelineExecutions"
	AwsActionListActionExecutions   = "codepipeline:ListActionExecutions"
	AwsActionListProjects           = "codebuild:ListProjects"
	AwsActionBatchGetProjects       = "codebuild:BatchGetProjects"
	AwsActionListBuildsForProject   = "codebuild:ListBuildsForProject"
	AwsActionBatchGetBuilds         = "codebuild:BatchGetBuilds"
	AwsActionGetLogEvents           = "logs:GetLogEvents"
	AwsActionGetCostAndUsage        = "ce:GetCostAndUsage"
	AwsActionGetDimensionValues     = "ce:GetDimensionValues"
	AwsActionGetTags                = "ce:GetTags"
	AwsActionGetCostForecast        = "ce:GetCostForecast"
	AwsActionAssumeRole             = "sts:AssumeRole"
	AwsActionGetCallerIdentity      = "sts:GetCallerIdentity"
)

// AwsPermission is one IAM action the connector uses.
type AwsPermission struct {
	Action      string                   `json:"action"`
	Requirement AwsPermissionRequirement `json:"requirement"`
	UsedFor     string                   `json:"usedFor"` // one short sentence, shown in the UI
}

// AwsPermissions is the single source for Test connection and the policy snippets.
var AwsPermissions = []AwsPermission{
	{AwsActionListPipelines, AwsRequirementRequired, "Lists pipelines for the scope picker."},
	{AwsActionGetPipeline, AwsRequirementRequired, "Reads stages, actions, source repos and triggers."},
	{AwsActionListTagsForResource, AwsRequirementOptional, "Reads pipeline tags."},
	{AwsActionListPipelineExecutions, AwsRequirementRequired, "Reads pipeline runs."},
	{AwsActionListActionExecutions, AwsRequirementRequired, "Reads stage and action runs and their linked builds."},
	{AwsActionListProjects, AwsRequirementRequired, "Lists CodeBuild projects."},
	{AwsActionBatchGetProjects, AwsRequirementRequired, "Reads CodeBuild project configuration."},
	{AwsActionListBuildsForProject, AwsRequirementOptional, "Lists builds per project."},
	{AwsActionBatchGetBuilds, AwsRequirementRequired, "Reads builds, phases and failure reasons."},
	{AwsActionGetLogEvents, AwsRequirementOptional, "Reads build log signals such as Trivy, smoke tests and rollbacks."},
	{AwsActionGetCostAndUsage, AwsRequirementCostExplorer, "Reads real spend by service."},
	{AwsActionGetDimensionValues, AwsRequirementCostExplorer, "Lists the services and accounts that have spend."},
	{AwsActionGetTags, AwsRequirementCostExplorer, "Lists cost allocation tags."},
	{AwsActionGetCostForecast, AwsRequirementCostExplorer, "Reads the spend forecast."},
	{AwsActionAssumeRole, AwsRequirementAssumeRole, "Lets the broker user borrow the role; attached to the broker, not the role."},
}

// AwsOptionalFeatures names what turns off when an optional permission is denied.
var AwsOptionalFeatures = map[string]string{
	AwsActionListTagsForResource:  "Pipeline tags are off",
	AwsActionListBuildsForProject: "Listing builds per project is off",
	AwsActionGetLogEvents:         "Build log signals are off",
}

// SplitAwsAction splits an action like codepipeline:ListPipelines into its service and name.
func SplitAwsAction(action string) (service, name string) {
	service, name, _ = strings.Cut(action, ":")
	return service, name
}

// AwsPermissionsFor lists the catalog entries that apply to a connection.
func AwsPermissionsFor(authType AwsAuthType, useCostExplorer bool) []AwsPermission {
	var applicable []AwsPermission
	for _, p := range AwsPermissions {
		switch {
		case p.Requirement == AwsRequirementAssumeRole && authType != AwsAuthTypeAssumeRole:
		case p.Requirement == AwsRequirementCostExplorer && !useCostExplorer:
		default:
			applicable = append(applicable, p)
		}
	}
	return applicable
}
