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
	"time"

	"github.com/apache/incubator-devlake/core/models/migrationscripts/archived"
)

type AwsPipelineExecution struct {
	ConnectionId      uint64 `gorm:"primaryKey;type:BIGINT"`
	ExecutionId       string `gorm:"primaryKey;type:varchar(64)"`
	PipelineArn       string `gorm:"type:varchar(255);index"`
	Status            string `gorm:"type:varchar(32)"`
	ExecutionMode     string `gorm:"type:varchar(32)"`
	ExecutionType     string `gorm:"type:varchar(32)"`
	TriggerType       string `gorm:"type:varchar(64)"`
	TriggerTagName    string `gorm:"type:varchar(255)"`
	TriggerBranchName string `gorm:"type:varchar(255)"`
	StartTime         *time.Time
	LastUpdateTime    *time.Time

	archived.NoPKModel
}

func (AwsPipelineExecution) TableName() string {
	return "_tool_aws_pipeline_executions"
}

// AwsExecutionSourceRevision is the source revision one action fed into a pipeline run.
type AwsExecutionSourceRevision struct {
	ConnectionId     uint64 `gorm:"primaryKey;type:BIGINT"`
	ExecutionId      string `gorm:"primaryKey;type:varchar(64);index"`
	ActionName       string `gorm:"primaryKey;type:varchar(255)"`
	RevisionId       string `gorm:"type:varchar(255)"`
	RevisionUrl      string `gorm:"type:varchar(1024)"`
	ProviderType     string `gorm:"type:varchar(64)"`
	CommitMessage    string
	FullRepositoryId string `gorm:"type:varchar(255)"`

	archived.NoPKModel
}

func (AwsExecutionSourceRevision) TableName() string {
	return "_tool_aws_execution_source_revisions"
}
