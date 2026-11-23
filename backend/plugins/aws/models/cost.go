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

// AwsPrice is a public on-demand unit price of one region; usage types carry no region prefix.
type AwsPrice struct {
	Region          string    `gorm:"primaryKey;type:varchar(32)"`
	UsageType       string    `gorm:"primaryKey;type:varchar(128)"`
	PublicationDate time.Time `gorm:"primaryKey"`
	Unit            string    `gorm:"type:varchar(32)"`
	PriceUsd        string    `gorm:"type:decimal(20,10)"`
	FetchedAt       time.Time
	common.NoPKModel
}

func (AwsPrice) TableName() string {
	return "_tool_aws_prices"
}

// AwsCostMetric names a Cost Explorer series stored in the daily cost table.
type AwsCostMetric string

const (
	AwsCostMetricUnblendedCost         AwsCostMetric = "UnblendedCost"
	AwsCostMetricUnblendedCostForecast AwsCostMetric = "UnblendedCostForecast"
)

// AwsCostDaily is the spend of one account and service on one day; an empty service is the whole account.
type AwsCostDaily struct {
	ConnectionId uint64    `gorm:"primaryKey;type:BIGINT"`
	AccountId    string    `gorm:"primaryKey;type:varchar(16)"`
	Date         time.Time `gorm:"primaryKey;type:date"`
	Service      string    `gorm:"primaryKey;type:varchar(128)"`
	Metric       string    `gorm:"primaryKey;type:varchar(32)"`
	Amount       string    `gorm:"type:decimal(20,10)"`
	Unit         string    `gorm:"type:varchar(16)"`
	Estimated    bool
	FetchedAt    time.Time
	common.NoPKModel
}

func (AwsCostDaily) TableName() string {
	return "_tool_aws_cost_daily"
}
