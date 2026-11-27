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
	"strings"
)

const (
	awsPolicyVersion     = "2012-10-17"
	awsPolicyEffectAllow = "Allow"
	awsLogsActionPrefix  = "logs:"
	awsAnyResource       = "*"
	awsRolePlaceholder   = "role/DevLakeReadOnly"
)

// AwsPolicyDocument is an IAM policy document.
type AwsPolicyDocument struct {
	Version   string               `json:"Version"`
	Statement []AwsPolicyStatement `json:"Statement"`
}

type AwsPolicyStatement struct {
	Effect    string              `json:"Effect"`
	Action    []string            `json:"Action"`
	Resource  string              `json:"Resource,omitempty"`
	Principal *AwsPolicyPrincipal `json:"Principal,omitempty"`
	Condition *AwsPolicyCondition `json:"Condition,omitempty"`
}

type AwsPolicyPrincipal struct {
	AWS string `json:"AWS"`
}

type AwsPolicyCondition struct {
	StringEquals AwsPolicyExternalId `json:"StringEquals"`
}

type AwsPolicyExternalId struct {
	ExternalId string `json:"sts:ExternalId"`
}

// PermissionPolicy is the read-only policy attached to the role, or to the user in access-key mode.
func PermissionPolicy(partition string, useCostExplorer bool) AwsPolicyDocument {
	var actions, logActions []string
	for _, p := range AwsPermissionsFor(AwsAuthTypeAccessKey, useCostExplorer) {
		if strings.HasPrefix(p.Action, awsLogsActionPrefix) {
			logActions = append(logActions, p.Action)
		} else {
			actions = append(actions, p.Action)
		}
	}
	return AwsPolicyDocument{Version: awsPolicyVersion, Statement: []AwsPolicyStatement{
		{Effect: awsPolicyEffectAllow, Action: actions, Resource: awsAnyResource},
		{Effect: awsPolicyEffectAllow, Action: logActions, Resource: fmt.Sprintf("arn:%s:logs:*:*:log-group:/aws/codebuild/*", partition)},
	}}
}

// TrustPolicy lets the broker assume the role only with the External ID.
func TrustPolicy(brokerArn, externalId string) AwsPolicyDocument {
	return AwsPolicyDocument{Version: awsPolicyVersion, Statement: []AwsPolicyStatement{{
		Effect:    awsPolicyEffectAllow,
		Action:    []string{AwsActionAssumeRole},
		Principal: &AwsPolicyPrincipal{AWS: brokerArn},
		Condition: &AwsPolicyCondition{StringEquals: AwsPolicyExternalId{ExternalId: externalId}},
	}}}
}

// BrokerPolicy lets the broker user assume the role.
func BrokerPolicy(partition, roleArn string) AwsPolicyDocument {
	if roleArn == "" {
		roleArn = fmt.Sprintf("arn:%s:iam::<account-id>:%s", partition, awsRolePlaceholder)
	}
	return AwsPolicyDocument{Version: awsPolicyVersion, Statement: []AwsPolicyStatement{{
		Effect:   awsPolicyEffectAllow,
		Action:   []string{AwsActionAssumeRole},
		Resource: roleArn,
	}}}
}
