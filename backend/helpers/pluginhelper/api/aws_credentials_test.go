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
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/require"
)

const assumeRoleResponseTemplate = `<AssumeRoleResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
<AssumeRoleResult>
<Credentials>
<AccessKeyId>ASIAASSUMED</AccessKeyId>
<SecretAccessKey>assumed-secret</SecretAccessKey>
<SessionToken>assumed-token</SessionToken>
<Expiration>%s</Expiration>
</Credentials>
<AssumedRoleUser><AssumedRoleId>AROAEXAMPLE:session</AssumedRoleId><Arn>arn:aws:sts::123456789012:assumed-role/Reader/session</Arn></AssumedRoleUser>
</AssumeRoleResult>
<ResponseMetadata><RequestId>req-1</RequestId></ResponseMetadata>
</AssumeRoleResponse>`

func assumeRoleResponseXml(expiration string) string {
	return fmt.Sprintf(assumeRoleResponseTemplate, expiration)
}

func TestNewAwsCredentialsProvider(t *testing.T) {
	t.Run("static mode returns the given keys", func(t *testing.T) {
		provider, err := NewAwsCredentialsProvider(AwsCredentialsConfig{
			AccessKeyId: "AKIDEXAMPLE", SecretAccessKey: "example-secret", SessionToken: "example-token",
		})
		require.NoError(t, err)
		creds, e := provider.Retrieve(context.Background())
		require.NoError(t, e)
		require.Equal(t, "AKIDEXAMPLE", creds.AccessKeyID)
		require.Equal(t, "example-secret", creds.SecretAccessKey)
		require.Equal(t, "example-token", creds.SessionToken)
	})

	t.Run("missing keys are rejected", func(t *testing.T) {
		for name, cfg := range map[string]AwsCredentialsConfig{
			"no key id": {SecretAccessKey: "example-secret"},
			"no secret": {AccessKeyId: "AKIDEXAMPLE"},
		} {
			t.Run(name, func(t *testing.T) {
				_, err := NewAwsCredentialsProvider(cfg)
				require.Error(t, err)
			})
		}
	})

	t.Run("assume-role mode sends external id and session name", func(t *testing.T) {
		var form map[string][]string
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			require.NoError(t, r.ParseForm())
			form = r.PostForm
			w.Header().Set("Content-Type", "text/xml")
			_, _ = w.Write([]byte(assumeRoleResponseXml("2099-01-01T00:00:00Z")))
		}))
		defer server.Close()
		provider, err := NewAwsCredentialsProvider(AwsCredentialsConfig{
			AccessKeyId:     "AKIDEXAMPLE",
			SecretAccessKey: "example-secret",
			RoleArn:         "arn:aws:iam::123456789012:role/Reader",
			ExternalId:      "external-1",
			RoleSessionName: "session-1",
			StsRegion:       "us-east-1",
			HttpClient:      server.Client(),
			StsEndpoint:     server.URL,
		})
		require.NoError(t, err)
		creds, e := provider.Retrieve(context.Background())
		require.NoError(t, e)
		require.Equal(t, "ASIAASSUMED", creds.AccessKeyID)
		require.Equal(t, "assumed-secret", creds.SecretAccessKey)
		require.Equal(t, "assumed-token", creds.SessionToken)
		require.Equal(t, []string{"external-1"}, form["ExternalId"])
		require.Equal(t, []string{"session-1"}, form["RoleSessionName"])
		require.Equal(t, []string{"arn:aws:iam::123456789012:role/Reader"}, form["RoleArn"])
	})
}

func TestAwsAssumedCredentialsRefresh(t *testing.T) {
	tests := []struct {
		name         string
		expiration   string
		wantRequests int32
	}{
		{"expired credentials are fetched again", "2000-01-01T00:00:00Z", 2},
		{"valid credentials are cached", "2099-01-01T00:00:00Z", 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var requests int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				atomic.AddInt32(&requests, 1)
				w.Header().Set("Content-Type", "text/xml")
				_, _ = w.Write([]byte(assumeRoleResponseXml(tt.expiration)))
			}))
			defer server.Close()
			provider, err := NewAwsCredentialsProvider(AwsCredentialsConfig{
				AccessKeyId:     "AKIDEXAMPLE",
				SecretAccessKey: "example-secret",
				RoleArn:         "arn:aws:iam::123456789012:role/Reader",
				ExternalId:      "external-1",
				RoleSessionName: "session-1",
				StsRegion:       "us-east-1",
				HttpClient:      server.Client(),
				StsEndpoint:     server.URL,
			})
			require.NoError(t, err)
			for i := 0; i < 2; i++ {
				_, e := provider.Retrieve(context.Background())
				require.NoError(t, e)
			}
			require.Equal(t, tt.wantRequests, atomic.LoadInt32(&requests))
		})
	}
}
