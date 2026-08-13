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

package service

import (
	"fmt"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/core/utils"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

func getOtelConnection(id uint64) (*models.OtelConnection, errors.Error) {
	if id == 0 {
		return nil, errors.BadInput.New("otel connection id is missing")
	}
	connection := &models.OtelConnection{}
	err := db.First(connection, dal.Where("id = ?", id))
	if err != nil {
		if db.IsErrorNotFound(err) {
			return nil, errors.NotFound.New(fmt.Sprintf("otel connection %d not found", id))
		}
		return nil, errors.Default.Wrap(err, "error getting otel connection")
	}
	return connection, nil
}

func getOtelCredentials(connectionId uint64) ([]*models.OtelCredential, errors.Error) {
	credentials := make([]*models.OtelCredential, 0)
	err := db.All(
		&credentials,
		dal.Where("connection_id = ?", connectionId),
		dal.Orderby("created_at DESC"),
	)
	if err != nil {
		return nil, errors.Default.Wrap(err, "error getting otel credentials")
	}
	return credentials, nil
}

func getOtelCredentialsByStatuses(connectionId uint64, statuses ...string) ([]*models.OtelCredential, errors.Error) {
	credentials := make([]*models.OtelCredential, 0)
	err := db.All(
		&credentials,
		dal.Where("connection_id = ? AND status IN ?", connectionId, statuses),
		dal.Orderby("created_at DESC"),
	)
	if err != nil {
		return nil, errors.Default.Wrap(err, "error getting otel credentials by status")
	}
	return credentials, nil
}

// getAllActiveOtelCredentials rebuilds the shared verifier from every active team.
func getAllActiveOtelCredentials() ([]*models.OtelCredential, errors.Error) {
	credentials := make([]*models.OtelCredential, 0)
	err := db.All(
		&credentials,
		dal.Where("status IN ?", []string{models.OtelCredentialStatusActive, models.OtelCredentialStatusRetiring}),
		dal.Orderby("created_at ASC"),
	)
	if err != nil {
		return nil, errors.Default.Wrap(err, "error getting active otel credentials")
	}
	return credentials, nil
}

func createOtelCredential(connectionId uint64, teamSlug string) (*models.OtelCredential, string, errors.Error) {
	idPart, err := utils.RandLetterBytes(14)
	if err != nil {
		return nil, "", err
	}
	password, err := utils.RandLetterBytes(48)
	if err != nil {
		return nil, "", err
	}
	credential := &models.OtelCredential{
		ConnectionId:             connectionId,
		Username:                 fmt.Sprintf("otel_%s_%s", teamSlug, strings.ToLower(idPart)),
		Status:                   models.OtelCredentialStatusActive,
		PendingCollectorRestart:  true,
		LastCollectorRestartHint: collectorRestartHint,
	}
	return credential, password, nil
}

func markOtelCredentialRevoked(credential *models.OtelCredential, revokedAt time.Time) {
	credential.Status = models.OtelCredentialStatusRevoked
	credential.RevokedAt = &revokedAt
	credential.PendingCollectorRestart = true
	credential.LastCollectorRestartHint = collectorRestartHint
}

func updateOtelCredentials(credentials []*models.OtelCredential, message string) errors.Error {
	for _, credential := range credentials {
		if err := db.Update(credential); err != nil {
			return errors.Default.Wrap(err, message)
		}
	}
	return nil
}

func restoreActiveCredentials(credentials []*models.OtelCredential) errors.Error {
	restoreErrors := make([]error, 0)
	for _, credential := range credentials {
		credential.Status = models.OtelCredentialStatusActive
		credential.RotatedAt = nil
		credential.RevokedAt = nil
		credential.PendingCollectorRestart = false
		credential.LastCollectorRestartHint = ""
		if err := db.Update(credential); err != nil {
			if logger != nil {
				logger.Warn(err, "failed to restore OTel credential %d after rotation failure", credential.ID)
			}
			restoreErrors = append(restoreErrors, errors.Default.Wrap(err, fmt.Sprintf("error restoring otel credential %d", credential.ID)))
		}
	}
	if len(restoreErrors) > 0 {
		return errors.Default.Combine(restoreErrors)
	}
	return nil
}

func setOtelActor(user *common.User, connection *models.OtelConnection, created bool) {
	if user == nil {
		return
	}
	connection.UpdatedBy = user.Name
	connection.UpdatedByEmail = user.Email
	if created {
		connection.CreatedBy = user.Name
		connection.CreatedByEmail = user.Email
	}
}

func hasRetiringCredential(credentials []*models.OtelCredential) bool {
	for _, credential := range credentials {
		if credential.Status == models.OtelCredentialStatusRetiring {
			return true
		}
	}
	return false
}
