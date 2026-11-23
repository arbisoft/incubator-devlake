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

// AwsLogPatternName names a build log pattern and the kind of signal it yields.
type AwsLogPatternName string

const (
	AwsLogPatternTrivy     AwsLogPatternName = "TRIVY"
	AwsLogPatternSmokeTest AwsLogPatternName = "SMOKE_TEST"
	AwsLogPatternRollback  AwsLogPatternName = "ROLLBACK"
)

// AwsBuildLogSignal is one parsed finding of a build log; the log text itself is never stored.
type AwsBuildLogSignal struct {
	ConnectionId uint64 `gorm:"primaryKey;type:BIGINT"`
	BuildId      string `gorm:"primaryKey;type:varchar(255)"`
	SignalType   string `gorm:"primaryKey;type:varchar(32)"`
	Seq          int    `gorm:"primaryKey"`
	PipelineArn  string `gorm:"type:varchar(255);index"`
	Target       string `gorm:"type:varchar(255)"`
	Total        *int
	Critical     *int
	High         *int
	Medium       *int
	Low          *int
	Unknown      *int
	Result       string `gorm:"type:varchar(16)"`
	LoggedAt     *time.Time
	common.NoPKModel
}

func (AwsBuildLogSignal) TableName() string {
	return "_tool_aws_build_log_signals"
}

// AwsBuildLogPatternMatch is how often a pattern matched in one build log; a NULL count means the log was not available.
type AwsBuildLogPatternMatch struct {
	ConnectionId uint64 `gorm:"primaryKey;type:BIGINT"`
	BuildId      string `gorm:"primaryKey;type:varchar(255)"`
	PatternName  string `gorm:"primaryKey;type:varchar(32)"`
	PipelineArn  string `gorm:"type:varchar(255);index"`
	Pattern      string `gorm:"type:varchar(255)"`
	MatchCount   *int
	common.NoPKModel
}

func (AwsBuildLogPatternMatch) TableName() string {
	return "_tool_aws_build_log_pattern_matches"
}
