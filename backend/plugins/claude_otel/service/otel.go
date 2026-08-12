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
	"sync"
	"time"

	"github.com/apache/incubator-devlake/core/config"
	corecontext "github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/log"
	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

const (
	defaultOtelAuthHtpasswdPath = "/var/lib/devlake/otel-auth/.htpasswd"
	defaultOtelPublicEndpoint   = "https://otel.customer.example.com:4317"
	defaultOtelProtocol         = "grpc"
	defaultOtelConnectionName   = "Claude Code OTel"
	maxOtelTeamNameLength       = 255
	maxOtelTeamSlugLength       = 63
	collectorRestartHint        = "Telemetry endpoint is applying credential changes"
	defaultOtelRestartTimeout   = 45
	otelRestartHelperUrlKey     = "OTEL_RESTART_HELPER_URL"
	otelRestartHelperTokenKey   = "OTEL_RESTART_HELPER_TOKEN"
	otelRestartHelperTimeoutKey = "OTEL_RESTART_HELPER_TIMEOUT_SECONDS"
	otelRestartHelperApplyPath  = "/apply"
	otelAuthHeader              = "Authorization"
	otelContentTypeHeader       = "Content-Type"
	otelJsonContentType         = "application/json"
)

var (
	cfg    config.ConfigReader
	db     dal.Dal
	logger log.Logger
	// lifecycleMu serializes file and collector updates for a single backend instance.
	lifecycleMu sync.Mutex
)

func Init(basicRes corecontext.BasicRes) {
	cfg = basicRes.GetConfigReader()
	db = basicRes.GetDal()
	logger = basicRes.GetLogger()
}

type OtelConnectionInput struct {
	TeamName string `json:"teamName"`
}

func ListOtelConnections() ([]*models.OtelConnectionWithCredentials, errors.Error) {
	connections := make([]*models.OtelConnection, 0)
	err := db.All(&connections, dal.Orderby("created_at DESC"))
	if err != nil {
		return nil, errors.Default.Wrap(err, "error getting otel connections")
	}

	// Enrich each connection with its credential records and UI state: pending collector restarts,
	// the related activation hint, and whether an active or retiring credential lacks its htpasswd verifier.
	output := make([]*models.OtelConnectionWithCredentials, 0, len(connections))
	for _, connection := range connections {
		credentials, err := getOtelCredentials(connection.ID)
		if err != nil {
			return nil, err
		}
		recoveryRequired, err := missingHtpasswdHashes(credentials)
		if err != nil {
			return nil, err
		}
		output = append(output, &models.OtelConnectionWithCredentials{
			Connection:       connection,
			Credentials:      credentials,
			RestartRequired:  hasPendingCollectorRestart(credentials),
			RestartHint:      restartHint(credentials),
			RecoveryRequired: recoveryRequired,
		})
	}
	return output, nil
}

func CreateOtelConnection(user *common.User, input *OtelConnectionInput) (*models.OtelConnectionWithCredentials, errors.Error) {
	lifecycleMu.Lock()
	defer lifecycleMu.Unlock()

	if input == nil {
		input = &OtelConnectionInput{}
	}
	endpoint := firstNonEmpty(cfg.GetString("OTEL_PUBLIC_ENDPOINT"), defaultOtelPublicEndpoint)
	protocol := firstNonEmpty(cfg.GetString("OTEL_DEFAULT_PROTOCOL"), defaultOtelProtocol)
	if err := validateOtelSettings(endpoint, protocol); err != nil {
		return nil, err
	}
	teamName, teamSlug, err := normalizeOtelTeam(input.TeamName)
	if err != nil {
		return nil, err
	}
	connectionCount, err := db.Count(
		dal.From(&models.OtelConnection{}),
		dal.Where("team_slug = ? AND status != ?", teamSlug, models.OtelConnectionStatusRevoked),
	)
	if err != nil {
		return nil, errors.Default.Wrap(err, "error checking otel team connection")
	}
	if connectionCount > 0 {
		return nil, errors.BadInput.New("a Claude Code OTel connection already exists for this team")
	}
	connection := &models.OtelConnection{
		Name:              fmt.Sprintf("%s: %s", defaultOtelConnectionName, teamName),
		TeamName:          teamName,
		TeamSlug:          teamSlug,
		CollectorEndpoint: endpoint,
		Protocol:          protocol,
		Status:            models.OtelConnectionStatusActive,
	}
	setOtelActor(user, connection, true)

	err = db.Create(connection)
	if err != nil {
		return nil, errors.Default.Wrap(err, "error creating otel connection")
	}

	credential, password, err := createOtelCredential(connection.ID, connection.TeamSlug)
	if err != nil {
		deleteOtelConnectionAfterFailedCreate(connection)
		return nil, err
	}
	credentials := []*models.OtelCredential{credential}
	if err := db.Create(credential); err != nil {
		deleteOtelConnectionAfterFailedCreate(connection)
		return nil, errors.Default.Wrap(err, "error saving otel credential")
	}
	if err := writeHtpasswd(map[string]string{credential.Username: password}); err != nil {
		deleteOtelCredentialAfterFailedCreate(credential)
		deleteOtelConnectionAfterFailedCreate(connection)
		return nil, err
	}
	if applyErr, err := applyAndRecordOtelCredentialChanges(credentials); err != nil {
		rollbackErr := rollbackOtelCreate(connection, credential)
		return nil, combineOtelLifecycleErrors(
			errors.Default.Wrap(err, "error recording otel credential activation"),
			rollbackErr,
		)
	} else if applyErr != nil && logger != nil {
		// Keep the credential usable after the next successful apply, while recording the helper outage for operators.
		logger.Warn(applyErr, "OTel collector activation is pending for connection %d", connection.ID)
	}
	return responseWithSettings(connection, credentials, credential, password), nil
}

// deleteOtelConnectionAfterFailedCreate keeps failed-create cleanup best-effort without hiding the original error.
func deleteOtelConnectionAfterFailedCreate(connection *models.OtelConnection) {
	if err := db.Delete(connection); err != nil && logger != nil {
		logger.Warn(err, "failed to clean up OTel connection %d after create failure", connection.ID)
	}
}

// deleteOtelCredentialAfterFailedCreate keeps failed-create cleanup best-effort without logging credential material.
func deleteOtelCredentialAfterFailedCreate(credential *models.OtelCredential) {
	if err := db.Delete(credential); err != nil && logger != nil {
		logger.Warn(err, "failed to clean up OTel credential %d after create failure", credential.ID)
	}
}

// rollbackOtelCreate removes the undisclosed credential before returning a create failure.
func rollbackOtelCreate(connection *models.OtelConnection, credential *models.OtelCredential) errors.Error {
	credentialRemoved, cleanupErr := removeOtelCredentialForRollback(credential)
	if !credentialRemoved {
		return cleanupErr
	}
	if err := removeOtelConnectionForRollback(connection); err != nil {
		cleanupErr = combineOtelLifecycleErrors(cleanupErr, err)
	}
	if err := writeHtpasswd(nil); err != nil {
		cleanupErr = combineOtelLifecycleErrors(cleanupErr, err)
	} else if err := callOtelRestartHelper(); err != nil {
		cleanupErr = combineOtelLifecycleErrors(cleanupErr, err)
	}
	return cleanupErr
}

// rollbackOtelRotation restores the previous credential before returning a rotation failure.
func rollbackOtelRotation(activeCredentials []*models.OtelCredential, newCredential *models.OtelCredential) errors.Error {
	credentialRemoved, cleanupErr := removeOtelCredentialForRollback(newCredential)
	if err := restoreActiveCredentials(activeCredentials); err != nil {
		cleanupErr = combineOtelLifecycleErrors(cleanupErr, err)
	}
	if !credentialRemoved {
		return cleanupErr
	}
	if err := writeHtpasswd(nil); err != nil {
		return combineOtelLifecycleErrors(cleanupErr, err)
	}
	if err := callOtelRestartHelper(); err != nil {
		return combineOtelLifecycleErrors(cleanupErr, err)
	}
	return cleanupErr
}

func removeOtelCredentialForRollback(credential *models.OtelCredential) (bool, errors.Error) {
	if err := db.Delete(credential); err == nil {
		return true, nil
	} else {
		deleteErr := errors.Default.Wrap(err, fmt.Sprintf("error removing otel credential %d during rollback", credential.ID))
		markOtelCredentialRevoked(credential, time.Now())
		if updateErr := db.Update(credential); updateErr == nil {
			return true, nil
		} else {
			return false, errors.Default.Combine([]error{
				deleteErr,
				errors.Default.Wrap(updateErr, fmt.Sprintf("error revoking otel credential %d during rollback", credential.ID)),
			})
		}
	}
}

func removeOtelConnectionForRollback(connection *models.OtelConnection) errors.Error {
	if err := db.Delete(connection); err == nil {
		return nil
	} else {
		deleteErr := errors.Default.Wrap(err, fmt.Sprintf("error removing otel connection %d during rollback", connection.ID))
		connection.Status = models.OtelConnectionStatusRevoked
		if updateErr := db.Update(connection); updateErr == nil {
			return nil
		} else {
			return errors.Default.Combine([]error{
				deleteErr,
				errors.Default.Wrap(updateErr, fmt.Sprintf("error revoking otel connection %d during rollback", connection.ID)),
			})
		}
	}
}

func combineOtelLifecycleErrors(errs ...error) errors.Error {
	combined := make([]error, 0, len(errs))
	for _, err := range errs {
		if err != nil {
			combined = append(combined, err)
		}
	}
	if len(combined) == 0 {
		return nil
	}
	return errors.Default.Combine(combined)
}

func RotateOtelConnection(user *common.User, id uint64) (*models.OtelConnectionWithCredentials, errors.Error) {
	lifecycleMu.Lock()
	defer lifecycleMu.Unlock()

	connection, err := getOtelConnection(id)
	if err != nil {
		return nil, err
	}
	if connection.Status != models.OtelConnectionStatusActive {
		return nil, errors.BadInput.New("otel connection is not active")
	}
	if err := validateOtelSettings(connection.CollectorEndpoint, connection.Protocol); err != nil {
		return nil, err
	}

	now := time.Now()
	activeCredentials, err := getOtelCredentialsByStatuses(id, models.OtelCredentialStatusActive, models.OtelCredentialStatusRetiring)
	if err != nil {
		return nil, err
	}
	missingVerifier, err := missingHtpasswdHashes(activeCredentials)
	if err != nil {
		return nil, err
	}
	if missingVerifier {
		return nil, errors.BadInput.New("credential verifier is unavailable; revoke this connection and create a new one")
	}
	if hasRetiringCredential(activeCredentials) {
		return nil, errors.BadInput.New("finalize the current credential rotation before starting another")
	}
	for _, credential := range activeCredentials {
		credential.PendingCollectorRestart = true
		credential.LastCollectorRestartHint = collectorRestartHint
		credential.Status = models.OtelCredentialStatusRetiring
		credential.RotatedAt = &now
	}

	newCredential, password, err := createOtelCredential(id, connection.TeamSlug)
	if err != nil {
		return nil, err
	}
	affectedCredentials := append(activeCredentials, newCredential)
	for _, credential := range activeCredentials {
		if err := db.Update(credential); err != nil {
			return nil, errors.Default.Wrap(err, "error updating retiring otel credential")
		}
	}
	if err := db.Create(newCredential); err != nil {
		if restoreErr := restoreActiveCredentials(activeCredentials); restoreErr != nil {
			return nil, errors.Default.Combine([]error{
				errors.Default.Wrap(err, "error saving rotated otel credential"),
				restoreErr,
			})
		}
		return nil, errors.Default.Wrap(err, "error saving rotated otel credential")
	}
	if err := writeHtpasswd(map[string]string{newCredential.Username: password}); err != nil {
		_ = db.Delete(newCredential)
		if restoreErr := restoreActiveCredentials(activeCredentials); restoreErr != nil {
			return nil, errors.Default.Combine([]error{err, restoreErr})
		}
		return nil, err
	}
	if applyErr, err := applyAndRecordOtelCredentialChanges(affectedCredentials); err != nil {
		rollbackErr := rollbackOtelRotation(activeCredentials, newCredential)
		return nil, combineOtelLifecycleErrors(
			errors.Default.Wrap(err, "error recording otel credential activation"),
			rollbackErr,
		)
	} else if applyErr != nil && logger != nil {
		logger.Warn(applyErr, "OTel collector activation is pending for connection %d", connection.ID)
	}
	setOtelActor(user, connection, false)
	if err := db.Update(connection); err != nil {
		rollbackErr := rollbackOtelRotation(activeCredentials, newCredential)
		return nil, combineOtelLifecycleErrors(
			errors.Default.Wrap(err, "error updating otel connection"),
			rollbackErr,
		)
	}
	return responseWithSettings(connection, affectedCredentials, newCredential, password), nil
}

func RevokeOtelConnection(user *common.User, id uint64) (*models.OtelConnectionWithCredentials, errors.Error) {
	lifecycleMu.Lock()
	defer lifecycleMu.Unlock()

	connection, err := getOtelConnection(id)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	credentials, err := getOtelCredentialsByStatuses(id, models.OtelCredentialStatusActive, models.OtelCredentialStatusRetiring)
	if err != nil {
		return nil, err
	}
	for _, credential := range credentials {
		markOtelCredentialRevoked(credential, now)
	}
	if err := updateOtelCredentials(credentials, "error revoking otel credential"); err != nil {
		return nil, err
	}
	connection.Status = models.OtelConnectionStatusRevoked
	setOtelActor(user, connection, false)
	if err := db.Update(connection); err != nil {
		return nil, errors.Default.Wrap(err, "error revoking otel connection")
	}
	return applyOtelLifecycleUpdate(connection, credentials, "error recording otel credential revocation")
}

func FinalizeOtelRotation(user *common.User, id uint64) (*models.OtelConnectionWithCredentials, errors.Error) {
	lifecycleMu.Lock()
	defer lifecycleMu.Unlock()

	connection, err := getOtelConnection(id)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	credentials, err := getOtelCredentialsByStatuses(id, models.OtelCredentialStatusActive, models.OtelCredentialStatusRetiring)
	if err != nil {
		return nil, err
	}
	for _, credential := range credentials {
		if credential.Status == models.OtelCredentialStatusRetiring {
			markOtelCredentialRevoked(credential, now)
		}
	}
	if err := updateOtelCredentials(credentials, "error finalizing otel rotation"); err != nil {
		return nil, err
	}
	setOtelActor(user, connection, false)
	if err := db.Update(connection); err != nil {
		return nil, errors.Default.Wrap(err, "error updating otel connection")
	}
	return applyOtelLifecycleUpdate(connection, credentials, "error recording finalized otel credential activation")
}

func applyOtelLifecycleUpdate(connection *models.OtelConnection, credentials []*models.OtelCredential, message string) (*models.OtelConnectionWithCredentials, errors.Error) {
	if err := writeHtpasswd(nil); err != nil {
		return nil, err
	}
	applyErr, err := applyAndRecordOtelCredentialChanges(credentials)
	if err != nil {
		return nil, errors.Default.Wrap(err, message)
	}
	allCredentials, err := getOtelCredentials(connection.ID)
	if err != nil {
		return nil, err
	}
	return &models.OtelConnectionWithCredentials{
		Connection:      connection,
		Credentials:     allCredentials,
		RestartRequired: applyErr != nil,
		RestartHint:     restartHint(allCredentials),
	}, nil
}

// ApplyOtelConnection retries a pending file reload without generating another credential.
func ApplyOtelConnection(user *common.User, id uint64) (*models.OtelConnectionWithCredentials, errors.Error) {
	lifecycleMu.Lock()
	defer lifecycleMu.Unlock()

	connection, err := getOtelConnection(id)
	if err != nil {
		return nil, err
	}
	if err := writeHtpasswd(nil); err != nil {
		return nil, err
	}
	allCredentials, err := getOtelCredentials(id)
	if err != nil {
		return nil, err
	}
	applyErr, err := applyAndRecordOtelCredentialChanges(allCredentials)
	if err != nil {
		return nil, errors.Default.Wrap(err, "error recording otel credential activation")
	}
	setOtelActor(user, connection, false)
	if err := db.Update(connection); err != nil {
		return nil, errors.Default.Wrap(err, "error updating otel connection")
	}
	return &models.OtelConnectionWithCredentials{
		Connection:      connection,
		Credentials:     allCredentials,
		RestartRequired: applyErr != nil || hasPendingCollectorRestart(allCredentials),
		RestartHint:     restartHint(allCredentials),
	}, nil
}
