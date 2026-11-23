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
	"time"

	"github.com/apache/incubator-devlake/core/models/common"
)

type AwsCodebuildProject struct {
	ConnectionId           uint64 `gorm:"primaryKey;type:BIGINT"`
	Name                   string `gorm:"primaryKey;type:varchar(255)"`
	Arn                    string `gorm:"type:varchar(512)"`
	EnvironmentType        string `gorm:"type:varchar(64)"`
	ComputeType            string `gorm:"type:varchar(64)"`
	Image                  string `gorm:"type:varchar(255)"`
	TimeoutInMinutes       int
	QueuedTimeoutInMinutes int

	common.NoPKModel
}

func (AwsCodebuildProject) TableName() string {
	return "_tool_aws_codebuild_projects"
}

type AwsCodebuildBuild struct {
	ConnectionId          uint64 `gorm:"primaryKey;type:BIGINT"`
	BuildId               string `gorm:"primaryKey;type:varchar(255)"`
	ProjectName           string `gorm:"type:varchar(255)"`
	BuildNumber           int
	BuildStatus           string `gorm:"type:varchar(32)"`
	BuildComplete         bool
	CurrentPhase          string `gorm:"type:varchar(64)"`
	StartTime             *time.Time
	EndTime               *time.Time
	Initiator             string `gorm:"type:varchar(255)"`
	ResolvedSourceVersion string `gorm:"type:varchar(255)"`
	EnvironmentType       string `gorm:"type:varchar(64)"`
	ComputeType           string `gorm:"type:varchar(64)"`
	Image                 string `gorm:"type:varchar(255)"`
	TimeoutInMinutes      int
	LogGroup              string `gorm:"type:varchar(512)"`
	LogStream             string `gorm:"type:varchar(512)"`
	FailureMessage        string `gorm:"type:varchar(1024)"`
	BilledMinutes         *int
	PriceUsageType        string  `gorm:"type:varchar(128)"`
	UnitPriceUsd          *string `gorm:"type:decimal(20,10)"`
	EstimatedCostUsd      *string `gorm:"type:decimal(20,10)"`

	common.NoPKModel
}

func (AwsCodebuildBuild) TableName() string {
	return "_tool_aws_codebuild_builds"
}

type AwsCodebuildBuildPhase struct {
	ConnectionId   uint64 `gorm:"primaryKey;type:BIGINT"`
	BuildId        string `gorm:"primaryKey;type:varchar(255)"`
	PhaseType      string `gorm:"primaryKey;type:varchar(64)"`
	PhaseStatus    string `gorm:"type:varchar(32)"`
	StartTime      *time.Time
	EndTime        *time.Time
	DurationSec    int
	ContextMessage string `gorm:"type:varchar(1024)"`

	common.NoPKModel
}

func (AwsCodebuildBuildPhase) TableName() string {
	return "_tool_aws_codebuild_build_phases"
}
