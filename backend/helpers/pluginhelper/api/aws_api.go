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
	"bytes"
	"encoding/json"
	goerrors "errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/core/utils"
	"github.com/aws/smithy-go"
)

const (
	AwsPartitionAws      = "aws"
	AwsPartitionChina    = "aws-cn"
	AwsPartitionGovCloud = "aws-us-gov"
)

const (
	AwsErrAccessDenied = "AccessDenied"
	awsThrottleBackoff = 2 * time.Second
)

var (
	awsRegionPattern    = regexp.MustCompile(`^[a-z]{2}(-gov|-iso[a-z]?)?-[a-z]+-\d+$`)
	awsThrottleCodes    = []string{"ThrottlingException", "Throttling", "TooManyRequestsException", "RequestLimitExceeded"}
	awsAccessCodes      = []string{"AccessDeniedException", AwsErrAccessDenied, "UnauthorizedOperation"}
	awsExpiredCodes     = []string{"ExpiredTokenException", "ExpiredToken"}
	awsCredentialsCodes = append([]string{"UnrecognizedClientException", "InvalidClientTokenId", "SignatureDoesNotMatch", "InvalidSignatureException"}, awsExpiredCodes...)
)

// AwsPartitionForRegion returns the partition a region belongs to.
func AwsPartitionForRegion(region string) string {
	switch {
	case strings.HasPrefix(region, "cn-"):
		return AwsPartitionChina
	case strings.HasPrefix(region, "us-gov-"):
		return AwsPartitionGovCloud
	default:
		return AwsPartitionAws
	}
}

// AwsPartitionFromArn returns the partition segment of an ARN.
func AwsPartitionFromArn(arn string) (string, errors.Error) {
	parts := strings.SplitN(arn, ":", 6)
	if len(parts) < 6 || parts[0] != "arn" || parts[1] == "" {
		return "", errors.BadInput.New("malformed ARN")
	}
	return parts[1], nil
}

// AwsServiceEndpoint returns the public endpoint of a service in a region.
func AwsServiceEndpoint(service, region string) string {
	suffix := "amazonaws.com"
	if AwsPartitionForRegion(region) == AwsPartitionChina {
		suffix += ".cn"
	}
	return fmt.Sprintf("https://%s.%s.%s", service, region, suffix)
}

// IsAwsRegion reports whether the value looks like an AWS region name.
func IsAwsRegion(region string) bool {
	return awsRegionPattern.MatchString(region)
}

// IsAwsCredentialsCode reports whether the error code means AWS rejected the credentials.
func IsAwsCredentialsCode(code string) bool {
	return utils.StringsContains(awsCredentialsCodes, code)
}

// IsAwsExpiredCode reports whether the error code means the session token has expired.
func IsAwsExpiredCode(code string) bool {
	return utils.StringsContains(awsExpiredCodes, code)
}

// AwsApiError is the error body of an AWS JSON 1.1 response, or of a Query API response served as JSON.
type AwsApiError struct {
	StatusCode int
	Code       string
	Message    string
}

func (e *AwsApiError) Error() string {
	code := e.Code
	if code == "" {
		code = "unknown error"
	}
	return fmt.Sprintf("AWS API error %s (HTTP %d): %s", code, e.StatusCode, e.Message)
}

type awsErrorBody struct {
	Type       string `json:"__type"`
	Message    string `json:"message"`
	MessageCap string `json:"Message"`
	Query      struct {
		Code    string
		Message string
	} `json:"Error"`
}

// ParseAwsApiError returns the API error of a failed response, or nil when the status is below 400.
func ParseAwsApiError(res *http.Response) *AwsApiError {
	if res.StatusCode < http.StatusBadRequest {
		return nil
	}
	apiErr := &AwsApiError{StatusCode: res.StatusCode}
	raw, err := io.ReadAll(res.Body)
	_ = res.Body.Close()
	res.Body = io.NopCloser(bytes.NewReader(raw))
	var body awsErrorBody
	if err != nil || json.Unmarshal(raw, &body) != nil {
		return apiErr
	}
	apiErr.Code = body.Type[strings.LastIndex(body.Type, "#")+1:]
	apiErr.Message = body.Message
	if apiErr.Message == "" {
		apiErr.Message = body.MessageCap
	}
	if apiErr.Code == "" {
		apiErr.Code, apiErr.Message = body.Query.Code, body.Query.Message
	}
	return apiErr
}

// ParseAwsError returns the AWS error code and message found in an error chain, if any.
func ParseAwsError(err error) (code, message string) {
	var apiErr *AwsApiError
	if goerrors.As(err, &apiErr) {
		return apiErr.Code, apiErr.Message
	}
	var smithyErr smithy.APIError
	if goerrors.As(err, &smithyErr) {
		return smithyErr.ErrorCode(), smithyErr.ErrorMessage()
	}
	return "", ""
}

// NewAwsAfterResponse maps AWS error responses to typed errors and backs off when throttled.
func NewAwsAfterResponse(sleep func(time.Duration)) plugin.ApiClientAfterResponse {
	return func(res *http.Response) errors.Error {
		apiErr := ParseAwsApiError(res)
		if apiErr == nil {
			return nil
		}
		switch {
		case utils.StringsContains(awsThrottleCodes, apiErr.Code):
			sleep(awsThrottleBackoff)
			return errors.HttpStatus(http.StatusTooManyRequests).Wrap(apiErr, "AWS throttled the request")
		case utils.StringsContains(awsAccessCodes, apiErr.Code):
			return errors.Forbidden.Wrap(apiErr, "AWS denied access")
		case IsAwsCredentialsCode(apiErr.Code):
			return errors.Unauthorized.Wrap(apiErr, "AWS rejected the credentials")
		default:
			return errors.HttpStatus(res.StatusCode).Wrap(apiErr, "AWS request failed")
		}
	}
}
