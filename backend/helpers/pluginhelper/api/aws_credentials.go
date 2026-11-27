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

package api

import (
	"net/http"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/credentials/stscreds"
	"github.com/aws/aws-sdk-go-v2/service/sts"
)

// AwsCredentialsConfig describes where request credentials come from.
type AwsCredentialsConfig struct {
	AccessKeyId     string
	SecretAccessKey string
	SessionToken    string // optional, static mode only
	RoleArn         string // empty means static mode
	ExternalId      string
	RoleSessionName string
	StsRegion       string
	HttpClient      *http.Client // optional; tests pass an httptest client
	StsEndpoint     string       // optional override, tests only
}

// NewAwsCredentialsProvider returns a caching provider for static keys, or for a role assumed with them.
func NewAwsCredentialsProvider(cfg AwsCredentialsConfig) (aws.CredentialsProvider, errors.Error) {
	if cfg.AccessKeyId == "" || cfg.SecretAccessKey == "" {
		return nil, errors.BadInput.New("the AWS access key ID and secret access key are required")
	}
	static := credentials.NewStaticCredentialsProvider(cfg.AccessKeyId, cfg.SecretAccessKey, cfg.SessionToken)
	if cfg.RoleArn == "" {
		return aws.NewCredentialsCache(static), nil
	}
	opts := sts.Options{Region: cfg.StsRegion, Credentials: static}
	if cfg.HttpClient != nil {
		opts.HTTPClient = cfg.HttpClient
	}
	if cfg.StsEndpoint != "" {
		opts.BaseEndpoint = aws.String(cfg.StsEndpoint)
	}
	assume := stscreds.NewAssumeRoleProvider(sts.New(opts), cfg.RoleArn, func(o *stscreds.AssumeRoleOptions) {
		o.ExternalID = &cfg.ExternalId
		o.RoleSessionName = cfg.RoleSessionName
	})
	return aws.NewCredentialsCache(assume), nil
}
