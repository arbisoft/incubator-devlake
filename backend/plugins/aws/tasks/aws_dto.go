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

// AwsNoOutput decodes responses whose content is not needed.
type AwsNoOutput struct{}

// AwsEmptyInput is the request body of actions without parameters.
type AwsEmptyInput struct{}

type AwsListPipelinesInput struct {
	MaxResults int    `json:"maxResults,omitempty"`
	NextToken  string `json:"nextToken,omitempty"`
}

type AwsPipelineSummary struct {
	Name          string `json:"name"`
	PipelineType  string `json:"pipelineType"`
	ExecutionMode string `json:"executionMode"`
}

type AwsListPipelinesOutput struct {
	Pipelines []AwsPipelineSummary `json:"pipelines"`
	NextToken string               `json:"nextToken"`
}

type AwsGetPipelineInput struct {
	Name string `json:"name"`
}

type AwsActionTypeId struct {
	Category string `json:"category"`
	Provider string `json:"provider"`
}

// AwsActionConfiguration is the settings of an action; only the keys the connector reads are modelled.
type AwsActionConfiguration struct {
	ProjectName      string `json:"ProjectName,omitempty"`
	BranchName       string `json:"BranchName,omitempty"`
	FullRepositoryId string `json:"FullRepositoryId,omitempty"`
}

type AwsPipelineActionDeclaration struct {
	Name          string                 `json:"name"`
	ActionTypeId  AwsActionTypeId        `json:"actionTypeId"`
	Configuration AwsActionConfiguration `json:"configuration"`
}

type AwsPipelineStageDeclaration struct {
	Name    string                         `json:"name"`
	Actions []AwsPipelineActionDeclaration `json:"actions"`
}

type AwsPipelineDeclaration struct {
	PipelineType  string                        `json:"pipelineType"`
	ExecutionMode string                        `json:"executionMode"`
	Version       int                           `json:"version"`
	Stages        []AwsPipelineStageDeclaration `json:"stages"`
}

type AwsGetPipelineOutput struct {
	Metadata struct {
		PipelineArn string `json:"pipelineArn"`
	} `json:"metadata"`
	Pipeline AwsPipelineDeclaration `json:"pipeline"`
}

type AwsListTagsInput struct {
	ResourceArn string `json:"resourceArn"`
}

type AwsListPipelineExecutionsInput struct {
	PipelineName string `json:"pipelineName"`
	MaxResults   int    `json:"maxResults"`
	NextToken    string `json:"nextToken,omitempty"`
}

type AwsSourceRevision struct {
	ActionName      string `json:"actionName"`
	RevisionId      string `json:"revisionId"`
	RevisionSummary string `json:"revisionSummary"`
	RevisionUrl     string `json:"revisionUrl"`
}

type AwsExecutionTrigger struct {
	TriggerType   string `json:"triggerType"`
	TriggerDetail string `json:"triggerDetail"`
}

type AwsPipelineExecutionSummary struct {
	PipelineExecutionId string              `json:"pipelineExecutionId"`
	Status              string              `json:"status"`
	ExecutionMode       string              `json:"executionMode"`
	ExecutionType       string              `json:"executionType"`
	StartTime           *float64            `json:"startTime"`
	LastUpdateTime      *float64            `json:"lastUpdateTime"`
	SourceRevisions     []AwsSourceRevision `json:"sourceRevisions"`
	Trigger             AwsExecutionTrigger `json:"trigger"`
}

type AwsListPipelineExecutionsOutput struct {
	PipelineExecutionSummaries []AwsPipelineExecutionSummary `json:"pipelineExecutionSummaries"`
	NextToken                  string                        `json:"nextToken"`
}

type AwsActionExecutionFilter struct {
	PipelineExecutionId string `json:"pipelineExecutionId"`
}

type AwsListActionExecutionsInput struct {
	PipelineName string                   `json:"pipelineName"`
	Filter       AwsActionExecutionFilter `json:"filter"`
	MaxResults   int                      `json:"maxResults,omitempty"`
	NextToken    string                   `json:"nextToken,omitempty"`
}

type AwsActionExecutionInput struct {
	ActionTypeId  AwsActionTypeId        `json:"actionTypeId"`
	Configuration AwsActionConfiguration `json:"configuration"`
}

type AwsActionExecutionResult struct {
	ExternalExecutionId      string `json:"externalExecutionId"`
	ExternalExecutionSummary string `json:"externalExecutionSummary"`
	ErrorDetails             struct {
		Code string `json:"code"`
	} `json:"errorDetails"`
}

type AwsActionExecutionDetail struct {
	ActionExecutionId   string                  `json:"actionExecutionId"`
	PipelineExecutionId string                  `json:"pipelineExecutionId"`
	PipelineVersion     int                     `json:"pipelineVersion"`
	StageName           string                  `json:"stageName"`
	ActionName          string                  `json:"actionName"`
	Status              string                  `json:"status"`
	StartTime           *float64                `json:"startTime"`
	LastUpdateTime      *float64                `json:"lastUpdateTime"`
	Input               AwsActionExecutionInput `json:"input"`
	Output              struct {
		ExecutionResult AwsActionExecutionResult `json:"executionResult"`
	} `json:"output"`
}

type AwsListActionExecutionsOutput struct {
	ActionExecutionDetails []AwsActionExecutionDetail `json:"actionExecutionDetails"`
	NextToken              string                     `json:"nextToken"`
}

type AwsEnvironment struct {
	Type        string `json:"type"`
	ComputeType string `json:"computeType"`
	Image       string `json:"image"`
}

type AwsBatchGetProjectsInput struct {
	Names []string `json:"names"`
}

type AwsCodebuildProjectDetail struct {
	Name                   string         `json:"name"`
	Arn                    string         `json:"arn"`
	Environment            AwsEnvironment `json:"environment"`
	TimeoutInMinutes       int            `json:"timeoutInMinutes"`
	QueuedTimeoutInMinutes int            `json:"queuedTimeoutInMinutes"`
}

type AwsBatchGetProjectsOutput struct {
	Projects []AwsCodebuildProjectDetail `json:"projects"`
}

type AwsListBuildsForProjectInput struct {
	ProjectName string `json:"projectName"`
}

type AwsBatchGetBuildsInput struct {
	Ids []string `json:"ids"`
}

type AwsBuildPhaseContext struct {
	Message string `json:"message"`
}

type AwsBuildPhase struct {
	PhaseType         string                 `json:"phaseType"`
	PhaseStatus       string                 `json:"phaseStatus"`
	StartTime         *float64               `json:"startTime"`
	EndTime           *float64               `json:"endTime"`
	DurationInSeconds int                    `json:"durationInSeconds"`
	Contexts          []AwsBuildPhaseContext `json:"contexts"`
}

type AwsBuildDetail struct {
	Id                    string         `json:"id"`
	ProjectName           string         `json:"projectName"`
	BuildNumber           int            `json:"buildNumber"`
	BuildStatus           string         `json:"buildStatus"`
	BuildComplete         bool           `json:"buildComplete"`
	CurrentPhase          string         `json:"currentPhase"`
	StartTime             *float64       `json:"startTime"`
	EndTime               *float64       `json:"endTime"`
	Initiator             string         `json:"initiator"`
	ResolvedSourceVersion string         `json:"resolvedSourceVersion"`
	TimeoutInMinutes      int            `json:"timeoutInMinutes"`
	Environment           AwsEnvironment `json:"environment"`
	Logs                  struct {
		GroupName  string `json:"groupName"`
		StreamName string `json:"streamName"`
	} `json:"logs"`
	Phases []AwsBuildPhase `json:"phases"`
}

type AwsBatchGetBuildsOutput struct {
	Builds []AwsBuildDetail `json:"builds"`
}

type AwsGetLogEventsInput struct {
	LogGroupName  string `json:"logGroupName"`
	LogStreamName string `json:"logStreamName"`
	Limit         int    `json:"limit"`
	StartFromHead bool   `json:"startFromHead"`
}

type AwsCostTimePeriod struct {
	Start string `json:"Start"`
	End   string `json:"End"`
}

type AwsGetCostAndUsageInput struct {
	TimePeriod  AwsCostTimePeriod `json:"TimePeriod"`
	Granularity string            `json:"Granularity"`
	Metrics     []string          `json:"Metrics"`
}
