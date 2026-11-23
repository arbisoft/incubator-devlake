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
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/stretchr/testify/require"
)

func TestAwsSignerSign(t *testing.T) {
	fixedNow := time.Date(2015, 8, 30, 12, 36, 0, 0, time.UTC)
	newSigner := func(provider aws.CredentialsProvider) *AwsSigner {
		signer := NewAwsSigner(provider, "service", "us-east-1")
		signer.now = func() time.Time { return fixedNow }
		return signer
	}
	staticProvider := credentials.NewStaticCredentialsProvider("AKIDEXAMPLE", "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY", "")

	t.Run("get-vanilla matches the published signature", func(t *testing.T) {
		req, err := http.NewRequest(http.MethodGet, "https://example.amazonaws.com/", nil)
		require.NoError(t, err)
		require.Nil(t, newSigner(staticProvider).Sign(req))
		auth := req.Header.Get("Authorization")
		require.Contains(t, auth, "Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request")
		require.Contains(t, auth, "SignedHeaders=host;x-amz-date")
		require.True(t, strings.HasSuffix(auth, "Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31"))
	})

	t.Run("body is hashed and still readable", func(t *testing.T) {
		req, err := http.NewRequest(http.MethodPost, "https://example.amazonaws.com/", strings.NewReader("{}"))
		require.NoError(t, err)
		require.Nil(t, newSigner(staticProvider).Sign(req))
		require.NotEmpty(t, req.Header.Get("Authorization"))
		body, err := req.GetBody()
		require.NoError(t, err)
		buf := make([]byte, 2)
		_, err = body.Read(buf)
		require.NoError(t, err)
		require.Equal(t, "{}", string(buf))
	})

	t.Run("credential failure is unauthorized and keeps the cause", func(t *testing.T) {
		req, err := http.NewRequest(http.MethodGet, "https://example.amazonaws.com/", nil)
		require.NoError(t, err)
		e := newSigner(credentials.NewStaticCredentialsProvider("", "", "")).Sign(req)
		require.NotNil(t, e)
		require.Equal(t, http.StatusUnauthorized, e.GetType().GetHttpCode())
		require.Contains(t, e.Error(), "load AWS credentials")
	})
}
