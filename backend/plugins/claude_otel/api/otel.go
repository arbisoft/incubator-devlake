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
	"net/url"
	"strconv"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/plugin"
	"github.com/apache/incubator-devlake/helpers/pluginhelper/api"
	"github.com/apache/incubator-devlake/plugins/claude_otel/service"
)

func ListConnections(_ *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	connections, err := service.ListOtelConnections()
	if err != nil {
		return nil, err
	}
	return &plugin.ApiResourceOutput{Body: connections, Status: http.StatusOK}, nil
}

func ListProjects(_ *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	projects, err := service.ListOtelProjects()
	if err != nil {
		return nil, err
	}
	return &plugin.ApiResourceOutput{Body: projects, Status: http.StatusOK}, nil
}

func ListProjectConnections(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	connections, err := service.ListOtelConnectionsForProject(input.Params["projectName"])
	if err != nil {
		return nil, err
	}
	return &plugin.ApiResourceOutput{Body: connections, Status: http.StatusOK}, nil
}

func ListSourcePreferences(_ *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	preferences, err := service.ListOtelSourcePreferences()
	if err != nil {
		return nil, err
	}
	return &plugin.ApiResourceOutput{Body: preferences, Status: http.StatusOK}, nil
}

func GetIngestionStatus(_ *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	status, err := service.GetOtelIngestionStatus()
	if err != nil {
		return nil, err
	}
	return &plugin.ApiResourceOutput{Body: status, Status: http.StatusOK}, nil
}

func GetMetricBatchPayload(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	// IsCustomerAdmin is false, and this stays forbidden, whenever access management is
	// disabled server-wide; see the fail-closed rationale at handlePluginCall in
	// server/api/router.go.
	if !input.IsCustomerAdmin {
		return nil, errors.Forbidden.New(plugin.CustomerAdminRequiredMessage)
	}
	id, err := parseId(input.Params["batchId"])
	if err != nil {
		return nil, err
	}
	payload, err := service.DecodeOtelMetricBatchPayload(id)
	if err != nil {
		return nil, err
	}
	return &plugin.ApiResourceOutput{
		Body:        payload,
		Status:      http.StatusOK,
		ContentType: "application/json",
		Header:      http.Header{"Cache-Control": []string{"no-store"}},
	}, nil
}

func PostConnection(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	body := &service.OtelConnectionInput{}
	if err := api.Decode(input.Body, body, nil); err != nil {
		return nil, err
	}
	connection, err := service.CreateOtelConnection(input.User, body)
	if err != nil {
		return nil, err
	}
	return &plugin.ApiResourceOutput{Body: connection, Status: http.StatusCreated}, nil
}

func RotateConnection(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	id, err := parseId(input.Params["connectionId"])
	if err != nil {
		return nil, err
	}
	connection, err := service.RotateOtelConnection(input.User, id)
	if err != nil {
		return nil, err
	}
	return &plugin.ApiResourceOutput{Body: connection, Status: http.StatusOK}, nil
}

func RevokeConnection(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	id, err := parseId(input.Params["connectionId"])
	if err != nil {
		return nil, err
	}
	connection, err := service.RevokeOtelConnection(input.User, id)
	if err != nil {
		return nil, err
	}
	return &plugin.ApiResourceOutput{Body: connection, Status: http.StatusOK}, nil
}

func HideConnection(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	id, err := parseId(input.Params["connectionId"])
	if err != nil {
		return nil, err
	}
	connection, err := service.HideOtelConnection(input.User, id)
	if err != nil {
		return nil, err
	}
	return &plugin.ApiResourceOutput{Body: connection, Status: http.StatusOK}, nil
}

func FinalizeRotation(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	id, err := parseId(input.Params["connectionId"])
	if err != nil {
		return nil, err
	}
	connection, err := service.FinalizeOtelRotation(input.User, id)
	if err != nil {
		return nil, err
	}
	return &plugin.ApiResourceOutput{Body: connection, Status: http.StatusOK}, nil
}

func ApplyConnection(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	id, err := parseId(input.Params["connectionId"])
	if err != nil {
		return nil, err
	}
	connection, err := service.ApplyOtelConnection(input.User, id)
	if err != nil {
		return nil, err
	}
	return &plugin.ApiResourceOutput{Body: connection, Status: http.StatusOK}, nil
}

func RebindConnectionOrganization(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	id, err := parseId(input.Params["connectionId"])
	if err != nil {
		return nil, err
	}
	body := &service.OtelRebindInput{}
	if err := api.Decode(input.Body, body, nil); err != nil {
		return nil, err
	}
	result, err := service.RebindOtelOrganization(input.User, id, body)
	if err != nil {
		return nil, err
	}
	return &plugin.ApiResourceOutput{Body: result, Status: http.StatusOK}, nil
}

func PostReplay(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	body := &service.OtelReplayInput{}
	if err := api.Decode(input.Body, body, nil); err != nil {
		return nil, err
	}
	queue, err := service.CreateOtelReplay(input.User, body)
	if err != nil {
		return nil, err
	}
	return &plugin.ApiResourceOutput{Body: queue, Status: http.StatusCreated}, nil
}

func ListReplays(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	page, err := parsePositiveQuery(input.Query, "page", 1)
	if err != nil {
		return nil, err
	}
	pageSize, err := parsePositiveQuery(input.Query, "pageSize", service.OtelReplayDefaultPageSize)
	if err != nil {
		return nil, err
	}
	replays, err := service.ListOtelReplays(page, pageSize)
	if err != nil {
		return nil, err
	}
	return &plugin.ApiResourceOutput{Body: replays, Status: http.StatusOK}, nil
}

func parsePositiveQuery(query url.Values, key string, fallback int) (int, errors.Error) {
	values, present := query[key]
	if !present {
		return fallback, nil
	}
	raw := ""
	if len(values) > 0 {
		raw = values[0]
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 {
		return 0, errors.BadInput.New("page and pageSize must be positive integers")
	}
	return value, nil
}

func PutConnectionProjects(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	id, err := parseId(input.Params["connectionId"])
	if err != nil {
		return nil, err
	}
	body := &service.OtelConnectionInput{}
	if err := api.Decode(input.Body, body, nil); err != nil {
		return nil, err
	}
	projects, err := service.ReplaceOtelConnectionProjects(id, body.ProjectNames)
	if err != nil {
		return nil, err
	}
	return &plugin.ApiResourceOutput{Body: projects, Status: http.StatusOK}, nil
}

func ValidateProjectRemoval(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	if err := service.ValidateOtelProjectRemoval(input.Params["projectName"]); err != nil {
		return nil, err
	}
	return &plugin.ApiResourceOutput{Status: http.StatusNoContent}, nil
}

func parseId(raw string) (uint64, errors.Error) {
	id, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0, errors.BadInput.Wrap(err, "bad otel connection id format supplied")
	}
	return id, nil
}
