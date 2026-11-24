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
)

// Email history statuses. A row is QUEUED until the worker sends it (SENT) or gives up (FAILED).
const (
	EmailStatusQueued = "QUEUED"
	EmailStatusSent   = "SENT"
	EmailStatusFailed = "FAILED"
)

// EmailSentBySystem is the sent_by value for emails that no signed-in user asked for.
const EmailSentBySystem = "system"

// EmailHistory is one email DevLake sent or tried to send. Rows are kept forever.
type EmailHistory struct {
	ID                uint64     `gorm:"primaryKey;autoIncrement"`
	Sender            string     `gorm:"type:varchar(255)"`
	Recipients        string     `gorm:"type:text"` // comma-separated, after filtering
	Subject           string     `gorm:"type:varchar(255)"`
	Content           string     `gorm:"type:text"` // rendered HTML; LONGTEXT on MySQL
	TextContent       string     `gorm:"type:text"` // rendered plain text, kept so a QUEUED row can be sent after a restart
	Status            string     `gorm:"type:varchar(50);index"`
	SentOn            *time.Time `gorm:"index"`
	SentBy            string     `gorm:"type:varchar(255)"`
	Template          string     `gorm:"type:varchar(50);index"`
	ProjectName       *string    `gorm:"type:varchar(255);index"`
	Source            *string    `gorm:"type:varchar(100)"`
	SourceId          *string    `gorm:"type:varchar(255)"`
	Provider          string     `gorm:"type:varchar(255)"`
	ProviderMessageId *string    `gorm:"type:varchar(255)"`
	ClaimToken        *string    `gorm:"type:varchar(64)"` // set by the worker that claimed the current attempt, so two workers never send one row
	ErrorMessage      *string    `gorm:"type:text"`
	Attempts          int
	NextAttemptAt     *time.Time
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// TableName returns the email history table name.
func (EmailHistory) TableName() string {
	return "_devlake_email_history"
}
