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
	"net/http"
	"testing"

	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIgnoreHTTPStatus404(t *testing.T) {
	assert.Equal(t, helper.ErrIgnoreAndContinue, ignoreHTTPStatus404(&http.Response{StatusCode: http.StatusNotFound}))

	err := ignoreHTTPStatus404(&http.Response{StatusCode: http.StatusUnauthorized})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Plane API key")

	assert.NoError(t, ignoreHTTPStatus404(&http.Response{StatusCode: http.StatusOK}))
}
