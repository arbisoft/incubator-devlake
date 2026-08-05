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

const (
	OtelConnectionStatusActive  = "active"
	OtelConnectionStatusRevoked = "revoked"

	OtelCredentialStatusActive   = "active"
	OtelCredentialStatusRetiring = "retiring"
	OtelCredentialStatusRevoked  = "revoked"
)

type OtelConnection struct {
	common.Model
	Name              string `json:"name" gorm:"type:varchar(255)"`
	TeamName          string `json:"teamName" gorm:"type:varchar(255)"`
	TeamSlug          string `json:"teamSlug" gorm:"type:varchar(63);uniqueIndex"`
	CollectorEndpoint string `json:"collectorEndpoint" gorm:"type:varchar(255)"`
	Protocol          string `json:"protocol" gorm:"type:varchar(32)"`
	Status            string `json:"status" gorm:"type:varchar(32);index"`
	CreatedBy         string `json:"createdBy" gorm:"type:varchar(255)"`
	CreatedByEmail    string `json:"createdByEmail" gorm:"type:varchar(255)"`
	UpdatedBy         string `json:"updatedBy" gorm:"type:varchar(255)"`
	UpdatedByEmail    string `json:"updatedByEmail" gorm:"type:varchar(255)"`
}

func (c OtelConnection) TableName() string {
	return "_tool_claude_code_otel_connections"
}

type OtelCredential struct {
	common.Model
	ConnectionId             uint64     `json:"connectionId" gorm:"index"`
	Username                 string     `json:"username" gorm:"type:varchar(255);uniqueIndex"`
	Status                   string     `json:"status" gorm:"type:varchar(32);index"`
	RotatedAt                *time.Time `json:"rotatedAt"`
	RevokedAt                *time.Time `json:"revokedAt"`
	PendingCollectorRestart  bool       `json:"pendingCollectorRestart"`
	LastCollectorRestartHint string     `json:"lastCollectorRestartHint" gorm:"type:varchar(255)"`
}

func (c OtelCredential) TableName() string {
	return "_tool_claude_code_otel_credentials"
}

type OtelManagedSettings struct {
	Env map[string]string `json:"env"`
}

type OtelConnectionWithCredentials struct {
	Connection       *OtelConnection      `json:"connection"`
	Credentials      []*OtelCredential    `json:"credentials"`
	ManagedSettings  *OtelManagedSettings `json:"managedSettings,omitempty"`
	RestartRequired  bool                 `json:"restartRequired"`
	RestartHint      string               `json:"restartHint,omitempty"`
	RecoveryRequired bool                 `json:"recoveryRequired"`
}
