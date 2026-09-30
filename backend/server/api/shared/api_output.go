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

package shared

import (
	goerrors "errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models"
	"github.com/apache/incubator-devlake/impls/logruslog"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
	"github.com/mitchellh/mapstructure"
)

const BadRequestBody = "bad request body format"

const genericErrorMessage = "an unexpected error occurred"

type TypedApiBody[T any] struct {
	Code    int      `json:"code"`
	Success bool     `json:"success"`
	Message string   `json:"message"`
	Causes  []string `json:"causes"`
	Data    T        `json:"data"`
}

type ApiBody TypedApiBody[interface{}]

type ResponsePipelines struct {
	Count     int64              `json:"count"`
	Pipelines []*models.Pipeline `json:"pipelines"`
}

// httpStatusSuffix matches the " (409)" the errors package appends to each
// message; clients already get the status from the response itself.
var httpStatusSuffix = regexp.MustCompile(` \([1-5][0-9]{2}\)(,|$)`)

// SafeErrorMessage returns the top-level message only, without the status
// suffix; Error() leaks the error library's internal debug formatting and the
// wrap chain, which must not reach clients. A 500 is always generic: its
// message is often a converted SQL, driver or runtime error. Other statuses
// (including 502/503/504 for remote failures) keep their text.
func SafeErrorMessage(e errors.Error) string {
	if e.GetType().GetHttpCode() == http.StatusInternalServerError {
		return genericErrorMessage
	}
	if message := httpStatusSuffix.ReplaceAllString(e.Messages().Get(), "$1"); message != "" {
		return message
	}
	return genericErrorMessage
}

// NormalizeError turns any error into an errors.Error and reclassifies
// client-caused failures that reached the API untyped (request validation and
// request decoding), so they answer 400 instead of 500.
func NormalizeError(err error) errors.Error {
	e, ok := err.(errors.Error)
	if !ok {
		// no message of our own: a native error's text (SQL, driver, network)
		// is not client-safe, so it falls back to the generic message
		e = errors.Internal.Wrap(err, "")
	}
	if e.GetType().GetHttpCode() != http.StatusInternalServerError {
		return e
	}
	var validationErrs validator.ValidationErrors
	if goerrors.As(err, &validationErrs) {
		return errors.BadInput.Wrap(err, validationMessage(validationErrs))
	}
	var decodeErr *mapstructure.Error
	if goerrors.As(err, &decodeErr) {
		return errors.BadInput.Wrap(err, strings.Join(decodeErr.Errors, "; "))
	}
	return e
}

func validationMessage(errs validator.ValidationErrors) string {
	messages := make([]string, 0, len(errs))
	for _, fieldErr := range errs {
		if fieldErr.Tag() == "required" {
			messages = append(messages, fieldErr.Field()+" is required")
		} else {
			messages = append(messages, fieldErr.Field()+" is invalid")
		}
	}
	return strings.Join(messages, "; ")
}

// ApiOutputErrorWithCustomCode writes a JSON error message to the HTTP response body
func ApiOutputErrorWithCustomCode(c *gin.Context, code int, err error) {
	e := NormalizeError(err)
	status := e.GetType().GetHttpCode()
	logruslog.Global.Error(err, "HTTP %d error", status)
	c.JSON(status, &ApiBody{
		Success: false,
		Message: SafeErrorMessage(e),
		Code:    code,
	})
	c.Writer.Header().Set("Content-Type", "application/json")
}

// ApiOutputAdvancedErrorWithCustomCode writes a JSON error message to the HTTP response body
func ApiOutputAdvancedErrorWithCustomCode(c *gin.Context, httpStatusCode, customBusinessCode int, err error) {
	e := NormalizeError(err)
	status := e.GetType().GetHttpCode()
	// an unclassified native error answers with the caller's chosen status
	if _, ok := err.(errors.Error); !ok && status == http.StatusInternalServerError {
		status = httpStatusCode
	}
	logruslog.Global.Error(err, "HTTP %d error", status)
	c.JSON(status, &ApiBody{
		Success: false,
		Code:    customBusinessCode,
		Message: SafeErrorMessage(e),
	})
	c.Writer.Header().Set("Content-Type", "application/json")
}

// ApiOutputError writes a JSON error message to the HTTP response body
func ApiOutputError(c *gin.Context, err error) {
	e := NormalizeError(err)
	status := e.GetType().GetHttpCode()
	logruslog.Global.Error(err, "HTTP %d error", status)
	c.JSON(status, &ApiBody{
		Success: false,
		Message: SafeErrorMessage(e),
	})
	c.Writer.Header().Set("Content-Type", "application/json")
}

// ApiOutputSuccess writes a JSON success message to the HTTP response body
func ApiOutputSuccess(c *gin.Context, body interface{}, status int) {
	if body == nil {
		body = &ApiBody{
			Success: true,
			Message: "success",
		}
	}
	c.JSON(status, body)
}

// ApiOutputAbort writes the HTTP response code header and saves the error internally, but doesn't push it to the response
func ApiOutputAbort(c *gin.Context, err error) {
	if e, ok := err.(errors.Error); ok {
		logruslog.Global.Error(err, "HTTP %d abort-error", e.GetType().GetHttpCode())
		_ = c.AbortWithError(e.GetType().GetHttpCode(), errors.Default.New(e.Messages().Format()))
	} else {
		logruslog.Global.Error(err, "HTTP %d abort-error (native)", http.StatusInternalServerError)
		_ = c.AbortWithError(http.StatusInternalServerError, err)
	}
}
