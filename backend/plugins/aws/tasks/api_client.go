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
	gocontext "context"
	"net/http"
	"net/url"
	"time"

	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/aws/models"
	"github.com/aws/aws-sdk-go-v2/aws"
)

type AwsService string

const (
	AwsServiceCodePipeline AwsService = "codepipeline"
	AwsServiceCodeBuild    AwsService = "codebuild"
	AwsServiceLogs         AwsService = "logs"
	AwsServiceCostExplorer AwsService = "ce"
	AwsServiceSts          AwsService = "sts"
)

const (
	awsTargetCodePipeline = "CodePipeline_20150709."
	awsTargetCodeBuild    = "CodeBuild_20161006."
	awsTargetLogs         = "Logs_20140328."
	awsTargetCostExplorer = "AWSInsightsIndexService."
)

const (
	AwsCostExplorerRegion = "us-east-1"
	awsJsonContentType    = "application/x-amz-json-1.1"
	awsStsVersion         = "2011-06-15"
	awsTargetHeader       = "X-Amz-Target"
	awsRequestPath        = "/"
)

var awsTargetPrefixes = map[AwsService]string{
	AwsServiceCodePipeline: awsTargetCodePipeline,
	AwsServiceCodeBuild:    awsTargetCodeBuild,
	AwsServiceLogs:         awsTargetLogs,
	AwsServiceCostExplorer: awsTargetCostExplorer,
}

// AwsCallerIdentity is the account and principal behind the credentials.
type AwsCallerIdentity struct {
	Account string
	Arn     string
	UserId  string
}

type awsCallerIdentityResponse struct {
	GetCallerIdentityResponse struct {
		GetCallerIdentityResult AwsCallerIdentity
	}
}

// AwsTarget builds the X-Amz-Target header value of a JSON service action.
func AwsTarget(service AwsService, action string) string {
	return awsTargetPrefixes[service] + action
}

// NewAwsApiClient creates a signing client for one service; Cost Explorer is always served from one region.
func NewAwsApiClient(
	ctx gocontext.Context,
	basicRes context.BasicRes,
	provider aws.CredentialsProvider,
	service AwsService,
	region string,
) (*api.ApiClient, errors.Error) {
	if service == AwsServiceCostExplorer {
		region = AwsCostExplorerRegion
	}
	client, err := api.NewApiClient(
		ctx,
		api.AwsServiceEndpoint(string(service), region)+awsRequestPath,
		map[string]string{"Content-Type": awsJsonContentType},
		0,
		"",
		basicRes,
	)
	if err != nil {
		return nil, err
	}
	client.SetAuthFunction(api.NewAwsSigner(provider, string(service), region).Sign)
	client.SetAfterFunction(api.NewAwsAfterResponse(time.Sleep))
	return client, nil
}

// PostAwsJson calls an action of a JSON 1.1 service and decodes the response into out.
func PostAwsJson(client *api.ApiClient, service AwsService, action string, body, out interface{}) errors.Error {
	res, err := client.Post(awsRequestPath, nil, body, http.Header{awsTargetHeader: []string{AwsTarget(service, action)}})
	if err != nil {
		return err
	}
	return api.UnmarshalResponse(res, out)
}

// GetAwsCallerIdentity asks STS who the credentials belong to; it needs no permission.
func GetAwsCallerIdentity(ctx gocontext.Context, basicRes context.BasicRes, provider aws.CredentialsProvider, region string) (*AwsCallerIdentity, errors.Error) {
	client, err := NewAwsApiClient(ctx, basicRes, provider, AwsServiceSts, region)
	if err != nil {
		return nil, err
	}
	return readAwsCallerIdentity(client)
}

func readAwsCallerIdentity(client *api.ApiClient) (*AwsCallerIdentity, errors.Error) {
	_, action := models.SplitAwsAction(models.AwsActionGetCallerIdentity)
	query := url.Values{"Action": []string{action}, "Version": []string{awsStsVersion}}
	res, err := client.Get(awsRequestPath, query, http.Header{"Accept": []string{"application/json"}})
	if err != nil {
		return nil, err
	}
	var body awsCallerIdentityResponse
	if err = api.UnmarshalResponse(res, &body); err != nil {
		return nil, errors.Default.Wrap(err, "read AWS STS caller identity")
	}
	identity := body.GetCallerIdentityResponse.GetCallerIdentityResult
	return &identity, nil
}
