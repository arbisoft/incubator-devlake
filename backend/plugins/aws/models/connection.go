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

import (
	"fmt"
	"regexp"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/utils"
	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/go-playground/validator/v10"
)

type AwsAuthType string

const (
	AwsAuthTypeAssumeRole AwsAuthType = "ASSUME_ROLE"
	AwsAuthTypeAccessKey  AwsAuthType = "ACCESS_KEY"
)

const awsEntryService = "codepipeline"

var awsRoleArnPattern = regexp.MustCompile(`^arn:(aws|aws-cn|aws-us-gov):iam::\d{12}:role/[\w+=,.@/-]+$`)

// AwsConn holds the AWS settings; in assume-role mode the key pair is the broker's, in access-key mode it is the one used for requests.
type AwsConn struct {
	AuthType         AwsAuthType `mapstructure:"authType" json:"authType"`
	AccessKeyId      string      `mapstructure:"accessKeyId" json:"accessKeyId" gorm:"serializer:encdec"`
	SecretAccessKey  string      `mapstructure:"secretAccessKey" json:"secretAccessKey" gorm:"serializer:encdec"`
	SessionToken     string      `mapstructure:"sessionToken" json:"sessionToken" gorm:"serializer:encdec"`
	RoleArn          string      `mapstructure:"roleArn" json:"roleArn"`
	ExternalId       string      `mapstructure:"externalId" json:"externalId" gorm:"serializer:encdec"`
	Regions          []string    `mapstructure:"regions" json:"regions" gorm:"type:json;serializer:json"`
	RateLimitPerHour int         `mapstructure:"rateLimitPerHour" json:"rateLimitPerHour"`
	UseCostExplorer  bool        `mapstructure:"useCostExplorer" json:"useCostExplorer"`
}

// AwsConnection holds AwsConn plus ID/Name for database storage.
type AwsConnection struct {
	helper.BaseConnection `mapstructure:",squash"`
	AwsConn               `mapstructure:",squash"`
}

func (AwsConnection) TableName() string {
	return "_tool_aws_connections"
}

// GetEndpoint returns the CodePipeline endpoint of the first region.
func (c AwsConn) GetEndpoint() string {
	return helper.AwsServiceEndpoint(awsEntryService, c.Regions[0]) + "/"
}

func (c AwsConn) GetProxy() string {
	return ""
}

func (c AwsConn) GetRateLimitPerHour() int {
	return c.RateLimitPerHour
}

func (connection AwsConnection) Sanitize() AwsConnection {
	connection.AccessKeyId = utils.SanitizeString(connection.AccessKeyId)
	connection.SecretAccessKey = ""
	connection.SessionToken = ""
	return connection
}

// MergeFromRequest keeps stored secrets that the request leaves empty or masked and never changes the External ID.
func (connection *AwsConnection) MergeFromRequest(target *AwsConnection, body map[string]interface{}) error {
	stored := target.AwsConn
	var sent struct {
		AccessKeyId     string `mapstructure:"accessKeyId"`
		SecretAccessKey string `mapstructure:"secretAccessKey"`
		SessionToken    string `mapstructure:"sessionToken"`
	}
	if err := helper.DecodeMapStruct(body, &sent, true); err != nil {
		return err
	}
	if err := helper.DecodeMapStruct(body, target, true); err != nil {
		return err
	}
	if _, ok := body["externalId"]; ok && target.ExternalId != stored.ExternalId {
		return errors.BadInput.New("the External ID can't be changed")
	}
	target.ExternalId = stored.ExternalId
	newKey := sent.AccessKeyId != "" && sent.AccessKeyId != utils.SanitizeString(stored.AccessKeyId) && sent.AccessKeyId != stored.AccessKeyId
	if !newKey {
		target.AccessKeyId = stored.AccessKeyId
		if sent.SecretAccessKey == "" {
			target.SecretAccessKey = stored.SecretAccessKey
		}
		if sent.SessionToken == "" {
			target.SessionToken = stored.SessionToken
		}
		return nil
	}
	target.SecretAccessKey, target.SessionToken = sent.SecretAccessKey, sent.SessionToken
	return nil
}

// CustomValidate implements srvhelper.CustomValidator.
func (connection *AwsConnection) CustomValidate(_ interface{}, _ *validator.Validate) errors.Error {
	if connection.Name == "" {
		return errors.BadInput.New("name is required")
	}
	return connection.Validate()
}

// Validate checks the AWS settings of the connection.
func (c AwsConn) Validate() errors.Error {
	if c.AuthType != AwsAuthTypeAssumeRole && c.AuthType != AwsAuthTypeAccessKey {
		return errors.BadInput.New(fmt.Sprintf("authType must be %s or %s", AwsAuthTypeAssumeRole, AwsAuthTypeAccessKey))
	}
	if len(c.Regions) == 0 {
		return errors.BadInput.New("regions must contain at least one region")
	}
	seen := make(map[string]bool, len(c.Regions))
	for _, region := range c.Regions {
		if !helper.IsAwsRegion(region) {
			return errors.BadInput.New(fmt.Sprintf("regions contains an invalid region: %s", region))
		}
		if seen[region] {
			return errors.BadInput.New(fmt.Sprintf("regions contains a duplicate region: %s", region))
		}
		seen[region] = true
	}
	if c.AccessKeyId == "" {
		return errors.BadInput.New("accessKeyId is required")
	}
	if c.SecretAccessKey == "" {
		return errors.BadInput.New("secretAccessKey is required")
	}
	if c.AuthType == AwsAuthTypeAssumeRole && c.ExternalId == "" {
		return errors.BadInput.New("missing External ID")
	}
	if c.RoleArn != "" && !awsRoleArnPattern.MatchString(c.RoleArn) {
		return errors.BadInput.New("roleArn must look like arn:aws:iam::<12-digit account id>:role/<role name>")
	}
	return nil
}

// MissingRoleArn reports an assume-role connection that has no role to assume yet.
func (c AwsConn) MissingRoleArn() bool {
	return c.AuthType == AwsAuthTypeAssumeRole && c.RoleArn == ""
}

// CredentialsConfig maps the connection to the settings of the credentials provider.
func (connection AwsConnection) CredentialsConfig() helper.AwsCredentialsConfig {
	cfg := helper.AwsCredentialsConfig{
		AccessKeyId:     connection.AccessKeyId,
		SecretAccessKey: connection.SecretAccessKey,
		StsRegion:       connection.Regions[0],
		RoleSessionName: fmt.Sprintf("devlake-%d", connection.ID),
	}
	if connection.AuthType == AwsAuthTypeAssumeRole {
		cfg.RoleArn = connection.RoleArn
		cfg.ExternalId = connection.ExternalId
	} else {
		cfg.SessionToken = connection.SessionToken
	}
	return cfg
}

// NewCredentialsProvider builds the provider every request of this connection signs with.
func (connection AwsConnection) NewCredentialsProvider() (aws.CredentialsProvider, errors.Error) {
	return helper.NewAwsCredentialsProvider(connection.CredentialsConfig())
}
