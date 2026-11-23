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
	"encoding/json"
	"net/http"
	"time"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/log"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
)

const awsErrPipelineNotFound = "PipelineNotFoundException"

// Keys of the item lists in the responses.
const (
	awsListKeyExecutions       = "pipelineExecutionSummaries"
	awsListKeyActionExecutions = "actionExecutionDetails"
	awsListKeyProjects         = "projects"
	awsListKeyBuilds           = "builds"
)

// awsCollectorSpec describes one JSON 1.1 POST collector.
type awsCollectorSpec struct {
	Client *api.ApiAsyncClient
	// Action is the permission-catalog name of the action, such as models.AwsActionGetPipeline.
	Action string
	// Input is the iterator of request inputs; nil sends one request.
	Input api.Iterator
	// Paged turns on nextToken paging with awsCollectorPageSize items per page.
	Paged bool
	// Request builds the request payload of one input; nextToken is empty on the first page.
	Request func(input interface{}, nextToken string) interface{}
	Parse   func(res *http.Response) ([]json.RawMessage, errors.Error)
}

type awsNextTokenOutput struct {
	NextToken string `json:"nextToken"`
}

// awsAfterResponse skips pipelines deleted in AWS and otherwise maps AWS errors as usual.
func awsAfterResponse(logger log.Logger) func(res *http.Response) errors.Error {
	mapError := api.NewAwsAfterResponse(time.Sleep)
	return func(res *http.Response) errors.Error {
		if apiErr := api.ParseAwsApiError(res); apiErr != nil && apiErr.Code == awsErrPipelineNotFound {
			logger.Warn(nil, "AWS answered %s, the pipeline was deleted and is skipped", apiErr.Code)
			return api.ErrIgnoreAndContinue
		}
		return mapError(res)
	}
}

// awsNextToken reads the paging token of a response; no token ends the collection.
func awsNextToken(_ *api.RequestData, res *http.Response) (interface{}, errors.Error) {
	var out awsNextTokenOutput
	if err := api.UnmarshalResponse(res, &out); err != nil {
		return nil, err
	}
	if out.NextToken == "" {
		return nil, api.ErrFinishCollect
	}
	return out.NextToken, nil
}

// awsRequestBody turns a request payload into the map the collector framework sends.
func awsRequestBody(payload interface{}) map[string]interface{} {
	raw, err := json.Marshal(payload)
	if err != nil {
		panic(errors.Default.Wrap(err, "marshal AWS request"))
	}
	var body map[string]interface{}
	if err = json.Unmarshal(raw, &body); err != nil {
		panic(errors.Default.Wrap(err, "decode AWS request"))
	}
	return body
}

// awsCollectorArgs builds the collector arguments of a JSON 1.1 POST action.
func awsCollectorArgs(logger log.Logger, spec awsCollectorSpec) api.ApiCollectorArgs {
	service, action := models.SplitAwsAction(spec.Action)
	target := AwsTarget(AwsService(service), action)
	args := api.ApiCollectorArgs{
		ApiClient:   spec.Client,
		Input:       spec.Input,
		Method:      http.MethodPost,
		UrlTemplate: awsRequestPath,
		Header: func(_ *api.RequestData) (http.Header, errors.Error) {
			return http.Header{awsTargetHeader: []string{target}}, nil
		},
		RequestBody: func(reqData *api.RequestData) map[string]interface{} {
			nextToken, _ := reqData.CustomData.(string)
			return awsRequestBody(spec.Request(reqData.Input, nextToken))
		},
		ResponseParser: spec.Parse,
		AfterResponse:  awsAfterResponse(logger),
	}
	if spec.Paged {
		args.PageSize = awsCollectorPageSize
		args.GetNextPageCustomData = awsNextToken
	}
	return args
}

// parseAwsItems returns the redacted original items found under the list key of a response; an empty key means the whole body is one item.
func parseAwsItems(res *http.Response, listKey string) ([]json.RawMessage, errors.Error) {
	var body json.RawMessage
	if err := api.UnmarshalResponse(res, &body); err != nil {
		return nil, err
	}
	items := []json.RawMessage{body}
	if listKey != "" {
		var fields map[string]json.RawMessage
		if err := errors.Convert(json.Unmarshal(body, &fields)); err != nil {
			return nil, err
		}
		items = nil
		if list, ok := fields[listKey]; ok {
			if err := errors.Convert(json.Unmarshal(list, &items)); err != nil {
				return nil, err
			}
		}
	}
	for i, item := range items {
		redacted, err := redactAwsPayload(item)
		if err != nil {
			return nil, err
		}
		items[i] = redacted
	}
	return items, nil
}

// executeAwsCollector runs a collector that does not keep sync state.
func executeAwsCollector(raw api.RawDataSubTaskArgs, args api.ApiCollectorArgs) errors.Error {
	args.RawDataSubTaskArgs = raw
	collector, err := api.NewApiCollector(args)
	if err != nil {
		return err
	}
	return collector.Execute()
}
