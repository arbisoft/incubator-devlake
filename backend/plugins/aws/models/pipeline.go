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

	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/core/plugin"
	helper "github.com/apache/incubator-devlake/helpers/pluginhelper/api"
)

type AwsPipeline struct {
	common.Scope  `mapstructure:",squash"`
	Arn           string `json:"arn" mapstructure:"arn" gorm:"primaryKey;type:varchar(255)"`
	Region        string `json:"region" mapstructure:"region" gorm:"type:varchar(32)"`
	Name          string `json:"name" mapstructure:"name" gorm:"type:varchar(255)"`
	PipelineType  string `json:"pipelineType" mapstructure:"pipelineType" gorm:"type:varchar(16)"`
	ExecutionMode string `json:"executionMode" mapstructure:"executionMode" gorm:"type:varchar(32)"`
	Url           string `json:"url" mapstructure:"url" gorm:"type:varchar(512)"`
}

func (AwsPipeline) TableName() string {
	return "_tool_aws_pipelines"
}

var _ plugin.ToolLayerScope = (*AwsPipeline)(nil)

type AwsApiParams struct {
	ConnectionId uint64
	ScopeId      string
}

// ScopeId implements plugin.ToolLayerScope.
func (p AwsPipeline) ScopeId() string {
	return p.Arn
}

// ScopeName implements plugin.ToolLayerScope.
func (p AwsPipeline) ScopeName() string {
	return p.Name
}

// ScopeFullName implements plugin.ToolLayerScope.
func (p AwsPipeline) ScopeFullName() string {
	return p.Region + "/" + p.Name
}

// ScopeParams implements plugin.ToolLayerScope.
func (p AwsPipeline) ScopeParams() interface{} {
	return &AwsApiParams{ConnectionId: p.ConnectionId, ScopeId: p.Arn}
}

// AwsPipelineConsoleUrl returns the console link of a pipeline, or "" outside the standard partition.
func AwsPipelineConsoleUrl(region, name string) string {
	if helper.AwsPartitionForRegion(region) != helper.AwsPartitionAws {
		return ""
	}
	return fmt.Sprintf("https://%s.console.aws.amazon.com/codesuite/codepipeline/pipelines/%s/view?region=%s", region, name, region)
}
