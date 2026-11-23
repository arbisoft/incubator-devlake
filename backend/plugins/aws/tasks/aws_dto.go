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

type AwsGetPipelineOutput struct {
	Metadata struct {
		PipelineArn string `json:"pipelineArn"`
	} `json:"metadata"`
}

type AwsListTagsInput struct {
	ResourceArn string `json:"resourceArn"`
}

type AwsListPipelineExecutionsInput struct {
	PipelineName string `json:"pipelineName"`
	MaxResults   int    `json:"maxResults"`
}

type AwsListPipelineExecutionsOutput struct {
	PipelineExecutionSummaries []struct {
		PipelineExecutionId string `json:"pipelineExecutionId"`
	} `json:"pipelineExecutionSummaries"`
}

type AwsActionExecutionFilter struct {
	PipelineExecutionId string `json:"pipelineExecutionId"`
}

type AwsListActionExecutionsInput struct {
	PipelineName string                   `json:"pipelineName"`
	Filter       AwsActionExecutionFilter `json:"filter"`
}

type AwsActionExecutionDetail struct {
	Input struct {
		Configuration struct {
			ProjectName string `json:"ProjectName"`
		} `json:"configuration"`
	} `json:"input"`
	Output struct {
		ExecutionResult struct {
			ExternalExecutionId string `json:"externalExecutionId"`
		} `json:"executionResult"`
	} `json:"output"`
}

type AwsListActionExecutionsOutput struct {
	ActionExecutionDetails []AwsActionExecutionDetail `json:"actionExecutionDetails"`
}

type AwsBatchGetProjectsInput struct {
	Names []string `json:"names"`
}

type AwsListBuildsForProjectInput struct {
	ProjectName string `json:"projectName"`
}

type AwsBatchGetBuildsInput struct {
	Ids []string `json:"ids"`
}

type AwsBatchGetBuildsOutput struct {
	Builds []struct {
		Logs struct {
			GroupName  string `json:"groupName"`
			StreamName string `json:"streamName"`
		} `json:"logs"`
	} `json:"builds"`
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
