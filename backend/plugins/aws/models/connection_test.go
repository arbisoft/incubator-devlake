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
	"encoding/json"
	"testing"

	"github.com/apache/incubator-devlake/core/utils"
	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/stretchr/testify/require"
)

func validConnection() *AwsConnection {
	return &AwsConnection{
		BaseConnection: helper.BaseConnection{Name: "prod"},
		AwsConn: AwsConn{
			AuthType:        AwsAuthTypeAssumeRole,
			AccessKeyId:     "AKIDEXAMPLE",
			SecretAccessKey: "example-secret",
			ExternalId:      "external-1",
			RoleArn:         "arn:aws:iam::123456789012:role/DevLakeReadOnly",
			Regions:         []string{"us-east-1", "eu-west-1"},
		},
	}
}

func TestAwsConnectionCustomValidate(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(c *AwsConnection)
		wantErr string
	}{
		{"valid assume-role", func(c *AwsConnection) {}, ""},
		{"role arn may be empty", func(c *AwsConnection) { c.RoleArn = "" }, ""},
		{"valid access key", func(c *AwsConnection) { c.AuthType, c.ExternalId = AwsAuthTypeAccessKey, "" }, ""},
		{"china role arn", func(c *AwsConnection) { c.RoleArn = "arn:aws-cn:iam::123456789012:role/path/Reader" }, ""},
		{"name required", func(c *AwsConnection) { c.Name = "" }, "name"},
		{"unknown auth type", func(c *AwsConnection) { c.AuthType = "OTHER" }, "authType"},
		{"no regions", func(c *AwsConnection) { c.Regions = nil }, "regions"},
		{"invalid region", func(c *AwsConnection) { c.Regions = []string{"nowhere"} }, "invalid region"},
		{"duplicate region", func(c *AwsConnection) { c.Regions = []string{"us-east-1", "us-east-1"} }, "duplicate"},
		{"key id required", func(c *AwsConnection) { c.AccessKeyId = "" }, "accessKeyId"},
		{"secret required", func(c *AwsConnection) { c.SecretAccessKey = "" }, "secretAccessKey"},
		{"external id required for assume-role", func(c *AwsConnection) { c.ExternalId = "" }, "missing External ID"},
		{"role arn with bad account", func(c *AwsConnection) { c.RoleArn = "arn:aws:iam::123:role/Reader" }, "roleArn"},
		{"role arn that is a user", func(c *AwsConnection) { c.RoleArn = "arn:aws:iam::123456789012:user/Reader" }, "roleArn"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := validConnection()
			tt.mutate(c)
			err := c.CustomValidate(c, nil)
			if tt.wantErr == "" {
				require.Nil(t, err)
				return
			}
			require.NotNil(t, err)
			require.Contains(t, err.Error(), tt.wantErr)
		})
	}
}

func TestAwsConnectionSanitize(t *testing.T) {
	c := validConnection()
	c.SessionToken = "example-token"
	sanitized := c.Sanitize()
	require.NotEqual(t, "AKIDEXAMPLE", sanitized.AccessKeyId)
	require.Empty(t, sanitized.SecretAccessKey)
	require.Empty(t, sanitized.SessionToken)
	require.Equal(t, "external-1", sanitized.ExternalId)
	require.Equal(t, c.RoleArn, sanitized.RoleArn)
	require.Equal(t, "example-secret", c.SecretAccessKey, "the stored connection is not modified")
}

func TestAwsConnectionMergeFromRequest(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		wantKeyId  string
		wantSecret string
		wantToken  string
		wantErr    bool
	}{
		{"empty body keeps everything", `{}`, "AKIDEXAMPLE", "example-secret", "stored-token", false},
		{"masked key id keeps stored", `{"accessKeyId":"` + utils.SanitizeString("AKIDEXAMPLE") + `"}`, "AKIDEXAMPLE", "example-secret", "stored-token", false},
		{"empty secrets keep stored", `{"accessKeyId":"","secretAccessKey":"","sessionToken":""}`, "AKIDEXAMPLE", "example-secret", "stored-token", false},
		{"new values replace", `{"accessKeyId":"AKIDOTHER","secretAccessKey":"other-secret","sessionToken":"other-token"}`, "AKIDOTHER", "other-secret", "other-token", false},
		{"new key without secret or token clears both", `{"accessKeyId":"AKIDOTHER"}`, "AKIDOTHER", "", "", false},
		{"new key with secret and no token clears the token", `{"accessKeyId":"AKIDOTHER","secretAccessKey":"other-secret"}`, "AKIDOTHER", "other-secret", "", false},
		{"same key in clear keeps secret and token", `{"accessKeyId":"AKIDEXAMPLE"}`, "AKIDEXAMPLE", "example-secret", "stored-token", false},
		{"same external id is accepted", `{"externalId":"external-1"}`, "AKIDEXAMPLE", "example-secret", "stored-token", false},
		{"changed external id is rejected", `{"externalId":"external-2"}`, "", "", "", true},
		{"role arn can be set", `{"roleArn":"arn:aws:iam::123456789012:role/Other"}`, "AKIDEXAMPLE", "example-secret", "stored-token", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stored := validConnection()
			stored.SessionToken = "stored-token"
			var body map[string]interface{}
			require.NoError(t, json.Unmarshal([]byte(tt.body), &body))
			err := stored.MergeFromRequest(stored, body)
			if tt.wantErr {
				require.Error(t, err)
				require.Contains(t, err.Error(), "External ID can't be changed")
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.wantKeyId, stored.AccessKeyId)
			require.Equal(t, tt.wantSecret, stored.SecretAccessKey)
			require.Equal(t, tt.wantToken, stored.SessionToken)
			require.Equal(t, "external-1", stored.ExternalId)
		})
	}
}

func TestAwsConnectionCredentialsConfig(t *testing.T) {
	t.Run("assume-role passes the role and External ID", func(t *testing.T) {
		c := validConnection()
		c.ID = 7
		c.SessionToken = "ignored-token"
		cfg := c.CredentialsConfig()
		require.Equal(t, c.RoleArn, cfg.RoleArn)
		require.Equal(t, "external-1", cfg.ExternalId)
		require.Equal(t, "devlake-7", cfg.RoleSessionName)
		require.Equal(t, "us-east-1", cfg.StsRegion)
		require.Empty(t, cfg.SessionToken)
	})
	t.Run("access key passes the session token only", func(t *testing.T) {
		c := validConnection()
		c.AuthType, c.SessionToken = AwsAuthTypeAccessKey, "example-token"
		cfg := c.CredentialsConfig()
		require.Empty(t, cfg.RoleArn)
		require.Empty(t, cfg.ExternalId)
		require.Equal(t, "example-token", cfg.SessionToken)
	})
}

func TestAwsConnectionApiConnection(t *testing.T) {
	c := validConnection()
	c.RateLimitPerHour = 500
	require.Equal(t, "https://codepipeline.us-east-1.amazonaws.com/", c.GetEndpoint())
	require.Empty(t, c.GetProxy())
	require.Equal(t, 500, c.GetRateLimitPerHour())
	require.False(t, c.MissingRoleArn())
	c.RoleArn = ""
	require.True(t, c.MissingRoleArn())
}
