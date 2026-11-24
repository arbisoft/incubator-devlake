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

package mail

import (
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/models"
	mailsvc "github.com/apache/incubator-devlake/server/services/mail"
)

// MailStatus is the mail setup. It never carries the SMTP username or password.
type MailStatus struct {
	Enabled        bool   `json:"enabled"`
	Driver         string `json:"driver" example:"smtp"`
	Host           string `json:"host,omitempty" example:"smtp.gmail.com"` // smtp driver only
	Port           int    `json:"port,omitempty" example:"587"`            // smtp driver only
	Security       string `json:"security,omitempty" example:"starttls"`   // smtp driver only: starttls, tls or none
	Auth           string `json:"auth,omitempty" example:"plain"`          // smtp driver only: plain, login, cram-md5 or none
	FromAddress    string `json:"fromAddress" example:"devlake-alerts@arbisoft.com"`
	FromName       string `json:"fromName" example:"DevLake"`
	DisabledReason string `json:"disabledReason,omitempty"` // why mail is off when the config is invalid
}

// TestEmailResponse identifies the queued test email.
type TestEmailResponse struct {
	ID     uint64 `json:"id" example:"42"`
	Status string `json:"status" example:"QUEUED"`
}

// EmailHistoryItem is one email in the history list. Times are RFC 3339 in UTC; null when not set.
type EmailHistoryItem struct {
	ID                uint64     `json:"id"`
	Sender            string     `json:"sender"`
	Recipients        []string   `json:"recipients"`
	Subject           string     `json:"subject"`
	Status            string     `json:"status" enums:"QUEUED,SENT,FAILED"`
	SentOn            *time.Time `json:"sentOn"`
	SentBy            string     `json:"sentBy"`
	Template          string     `json:"template"`
	ProjectName       *string    `json:"projectName"`
	Source            *string    `json:"source"`
	SourceID          *string    `json:"sourceId"`
	Provider          string     `json:"provider" example:"smtp:smtp.gmail.com"`
	ProviderMessageID *string    `json:"providerMessageId"`
	ErrorMessage      *string    `json:"errorMessage"`
	Attempts          int        `json:"attempts"`
	NextAttemptAt     *time.Time `json:"nextAttemptAt"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
}

// EmailHistoryDetail is one email with its rendered content.
type EmailHistoryDetail struct {
	EmailHistoryItem
	Content     string `json:"content"`     // rendered HTML; show it only in a sandboxed iframe
	TextContent string `json:"textContent"` // rendered plain text
}

// EmailHistoryPage is one page of the history and the total count for the filter.
type EmailHistoryPage struct {
	Items []EmailHistoryItem `json:"items"`
	Count int64              `json:"count"`
}

func toMailStatus(s mailsvc.Status) MailStatus {
	return MailStatus{
		Enabled:        s.Enabled,
		Driver:         s.Driver,
		Host:           s.Host,
		Port:           s.Port,
		Security:       s.Security,
		Auth:           s.Auth,
		FromAddress:    s.FromAddress,
		FromName:       s.FromName,
		DisabledReason: s.DisabledReason,
	}
}

func toItem(row *models.EmailHistory) EmailHistoryItem {
	recipients := []string{}
	if row.Recipients != "" {
		recipients = strings.Split(row.Recipients, ",")
	}
	return EmailHistoryItem{
		ID:                row.ID,
		Sender:            row.Sender,
		Recipients:        recipients,
		Subject:           row.Subject,
		Status:            row.Status,
		SentOn:            utc(row.SentOn),
		SentBy:            row.SentBy,
		Template:          row.Template,
		ProjectName:       row.ProjectName,
		Source:            row.Source,
		SourceID:          row.SourceId,
		Provider:          row.Provider,
		ProviderMessageID: row.ProviderMessageId,
		ErrorMessage:      row.ErrorMessage,
		Attempts:          row.Attempts,
		NextAttemptAt:     utc(row.NextAttemptAt),
		CreatedAt:         row.CreatedAt.UTC(),
		UpdatedAt:         row.UpdatedAt.UTC(),
	}
}

func utc(t *time.Time) *time.Time {
	if t == nil {
		return nil
	}
	u := t.UTC()
	return &u
}
