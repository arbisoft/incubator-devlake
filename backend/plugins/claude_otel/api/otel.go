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

func DeleteProjectPlacements(input *plugin.ApiResourceInput) (*plugin.ApiResourceOutput, errors.Error) {
	if err := service.RemoveOtelProjectPlacements(input.Params["projectName"]); err != nil {
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
