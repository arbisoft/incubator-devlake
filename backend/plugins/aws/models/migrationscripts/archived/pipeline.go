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

package archived

import (
	"github.com/apache/incubator-devlake/core/models/migrationscripts/archived"
)

type AwsPipeline struct {
	ConnectionId  uint64 `gorm:"primaryKey;type:BIGINT"`
	Arn           string `gorm:"primaryKey;type:varchar(255)"`
	ScopeConfigId uint64
	Region        string `gorm:"type:varchar(32);index"`
	Name          string `gorm:"type:varchar(255)"`
	PipelineType  string `gorm:"type:varchar(16)"`
	ExecutionMode string `gorm:"type:varchar(32)"`
	Version       int
	Url           string `gorm:"type:varchar(512)"`

	archived.NoPKModel
}

func (AwsPipeline) TableName() string {
	return "_tool_aws_pipelines"
}
