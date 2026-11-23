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
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"time"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
)

// AwsSigner signs requests with AWS Signature Version 4.
type AwsSigner struct {
	provider aws.CredentialsProvider
	service  string
	region   string
	now      func() time.Time
}

// NewAwsSigner creates a signer for one service in one region.
func NewAwsSigner(provider aws.CredentialsProvider, service, region string) *AwsSigner {
	return &AwsSigner{provider: provider, service: service, region: region, now: time.Now}
}

// Sign signs the request in place and can be used as an ApiClient auth function.
func (s *AwsSigner) Sign(req *http.Request) errors.Error {
	payloadHash, err := hashAwsRequestBody(req)
	if err != nil {
		return err
	}
	ctx := req.Context()
	creds, e := s.provider.Retrieve(ctx)
	if e != nil {
		return errors.Unauthorized.Wrap(e, "load AWS credentials")
	}
	if e = v4.NewSigner().SignHTTP(ctx, creds, req, payloadHash, s.service, s.region, s.now()); e != nil {
		return errors.Default.Wrap(e, "sign AWS request")
	}
	return nil
}

func hashAwsRequestBody(req *http.Request) (string, errors.Error) {
	hash := sha256.New()
	if req.GetBody != nil {
		body, e := req.GetBody()
		if e != nil {
			return "", errors.Default.Wrap(e, "read AWS request body")
		}
		defer body.Close()
		if _, e = io.Copy(hash, body); e != nil {
			return "", errors.Default.Wrap(e, "hash AWS request body")
		}
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}
