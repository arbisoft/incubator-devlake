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
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/apache/incubator-devlake/core/config"
	corecontext "github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/log"
	"github.com/apache/incubator-devlake/core/models/common"
	"github.com/apache/incubator-devlake/core/utils"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"golang.org/x/crypto/bcrypt"
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
		return nil, errors.Default.Wrap(err, "error recording otel credential activation")
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
		restoreActiveCredentials(activeCredentials)
		return nil, errors.Default.Wrap(err, "error saving rotated otel credential")
	}
	if err := writeHtpasswd(map[string]string{newCredential.Username: password}); err != nil {
		_ = db.Delete(newCredential)
		restoreActiveCredentials(activeCredentials)
		return nil, err
	}
	if _, err := applyAndRecordOtelCredentialChanges(affectedCredentials); err != nil {
		return nil, errors.Default.Wrap(err, "error recording otel credential activation")
	}
	setOtelActor(user, connection, false)
	if err := db.Update(connection); err != nil {
		return nil, errors.Default.Wrap(err, "error updating otel connection")
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

func restoreActiveCredentials(credentials []*models.OtelCredential) {
	for _, credential := range credentials {
		credential.Status = models.OtelCredentialStatusActive
		credential.RotatedAt = nil
		credential.RevokedAt = nil
		credential.PendingCollectorRestart = false
		credential.LastCollectorRestartHint = ""
		_ = db.Update(credential)
	}
}

func validateOtelSettings(endpoint, protocol string) errors.Error {
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
		return errors.BadInput.New("OTEL_PUBLIC_ENDPOINT must be an https URL")
	}
	if protocol != defaultOtelProtocol {
		return errors.BadInput.New("OTEL_DEFAULT_PROTOCOL must be grpc")
	}
	return nil
}

func getOtelConnection(id uint64) (*models.OtelConnection, errors.Error) {
	if id == 0 {
		return nil, errors.BadInput.New("otel connection id is missing")
	}
	connection := &models.OtelConnection{}
	err := db.First(connection, dal.Where("id = ?", id))
	if err != nil {
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

func responseWithSettings(connection *models.OtelConnection, credentials []*models.OtelCredential, credential *models.OtelCredential, password string) *models.OtelConnectionWithCredentials {
	header := base64.StdEncoding.EncodeToString([]byte(fmt.Sprintf("%s:%s", credential.Username, password)))
	return &models.OtelConnectionWithCredentials{
		Connection:  connection,
		Credentials: credentials,
		ManagedSettings: &models.OtelManagedSettings{Env: map[string]string{
			"CLAUDE_CODE_ENABLE_TELEMETRY":      "1",
			"OTEL_METRICS_EXPORTER":             "otlp",
			"OTEL_LOGS_EXPORTER":                "none",
			"OTEL_EXPORTER_OTLP_PROTOCOL":       connection.Protocol,
			"OTEL_EXPORTER_OTLP_ENDPOINT":       connection.CollectorEndpoint,
			"OTEL_EXPORTER_OTLP_HEADERS":        fmt.Sprintf("Authorization=Basic %s", header),
			"OTEL_METRIC_EXPORT_INTERVAL":       "60000",
			"OTEL_METRICS_INCLUDE_SESSION_ID":   "false",
			"OTEL_METRICS_INCLUDE_ACCOUNT_UUID": "true",
		}},
		RestartRequired: hasPendingCollectorRestart(credentials),
		RestartHint:     restartHint(credentials),
	}
}

func applyOtelCredentialChanges(credentials []*models.OtelCredential) errors.Error {
	err := callOtelRestartHelper()
	if err != nil {
		for _, credential := range credentials {
			credential.PendingCollectorRestart = true
			credential.LastCollectorRestartHint = collectorRestartHint
		}
		return err
	}
	for _, credential := range credentials {
		credential.PendingCollectorRestart = false
		credential.LastCollectorRestartHint = ""
	}
	return nil
}

func applyAndRecordOtelCredentialChanges(credentials []*models.OtelCredential) (errors.Error, errors.Error) {
	applyErr := applyOtelCredentialChanges(credentials)
	if err := updateOtelCredentialRestartState(credentials); err != nil {
		return applyErr, err
	}
	return applyErr, nil
}

func updateOtelCredentialRestartState(credentials []*models.OtelCredential) errors.Error {
	if len(credentials) == 0 {
		return nil
	}
	ids := make([]uint64, 0, len(credentials))
	pending := credentials[0].PendingCollectorRestart
	hint := credentials[0].LastCollectorRestartHint
	for _, credential := range credentials {
		ids = append(ids, credential.ID)
	}
	return db.UpdateColumns(
		&models.OtelCredential{},
		[]dal.DalSet{
			{ColumnName: "pending_collector_restart", Value: pending},
			{ColumnName: "last_collector_restart_hint", Value: hint},
		},
		dal.Where("id IN ?", ids),
	)
}

func callOtelRestartHelper() errors.Error {
	helperUrl := strings.TrimRight(cfg.GetString("OTEL_RESTART_HELPER_URL"), "/")
	if helperUrl == "" {
		return errors.Default.New("otel restart helper is not configured")
	}
	token := strings.TrimSpace(cfg.GetString("OTEL_RESTART_HELPER_TOKEN"))
	if token == "" {
		return errors.Default.New("otel restart helper token is not configured")
	}
	timeout := cfg.GetInt("OTEL_RESTART_HELPER_TIMEOUT_SECONDS")
	if timeout <= 0 {
		timeout = defaultOtelRestartTimeout
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, helperUrl+"/apply", bytes.NewReader([]byte("{}")))
	if err != nil {
		return errors.Default.Wrap(err, "error creating otel restart helper request")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return errors.Default.Wrap(err, "error calling otel restart helper")
	}
	defer res.Body.Close()
	if res.StatusCode >= http.StatusOK && res.StatusCode < http.StatusMultipleChoices {
		return nil
	}
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1024))
	return errors.Default.New(fmt.Sprintf("otel restart helper failed with status %d: %s", res.StatusCode, strings.TrimSpace(string(body))))
}

func writeHtpasswd(newPasswords map[string]string) errors.Error {
	path := firstNonEmpty(cfg.GetString("OTEL_AUTH_HTPASSWD_PATH"), defaultOtelAuthHtpasswdPath)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return errors.Default.Wrap(err, "error creating otel auth directory")
	}

	existing, err := readHtpasswd(path)
	if err != nil {
		return err
	}
	credentials, err := getAllActiveOtelCredentials()
	if err != nil {
		return err
	}
	lines := make([]string, 0, len(credentials))
	for _, credential := range credentials {
		if credential.Status != models.OtelCredentialStatusActive && credential.Status != models.OtelCredentialStatusRetiring {
			continue
		}
		hash, ok := existing[credential.Username]
		if !ok {
			password, ok := newPasswords[credential.Username]
			if !ok {
				return errors.Default.New(fmt.Sprintf("htpasswd hash missing for %s", credential.Username))
			}
			var err errors.Error
			hash, err = createHtpasswdHash(password)
			if err != nil {
				return err
			}
		}
		lines = append(lines, fmt.Sprintf("%s:%s", credential.Username, hash))
	}
	content := ""
	if len(lines) > 0 {
		content = strings.Join(lines, "\n") + "\n"
	}
	return writeFileAtomic(path, content)
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

func normalizeOtelTeam(raw string) (string, string, errors.Error) {
	teamName := strings.TrimSpace(raw)
	if teamName == "" {
		return "", "", errors.BadInput.New("team name is required")
	}
	if len(teamName) > maxOtelTeamNameLength {
		return "", "", errors.BadInput.New("team name must be 255 characters or fewer")
	}

	var slug strings.Builder
	needsDash := false
	for _, char := range strings.ToLower(teamName) {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') {
			if needsDash && slug.Len() > 0 {
				slug.WriteByte('-')
			}
			slug.WriteRune(char)
			needsDash = false
			continue
		}
		needsDash = slug.Len() > 0
	}
	teamSlug := slug.String()
	if teamSlug == "" {
		return "", "", errors.BadInput.New("team name must contain letters or numbers")
	}
	if len(teamSlug) > maxOtelTeamSlugLength {
		return "", "", errors.BadInput.New("team name produces a slug longer than 63 characters")
	}
	return teamName, teamSlug, nil
}

func missingHtpasswdHashes(credentials []*models.OtelCredential) (bool, errors.Error) {
	path := firstNonEmpty(cfg.GetString("OTEL_AUTH_HTPASSWD_PATH"), defaultOtelAuthHtpasswdPath)
	existing, err := readHtpasswd(path)
	if err != nil {
		return false, err
	}
	for _, credential := range credentials {
		if credential.Status != models.OtelCredentialStatusActive && credential.Status != models.OtelCredentialStatusRetiring {
			continue
		}
		if _, ok := existing[credential.Username]; !ok {
			return true, nil
		}
	}
	return false, nil
}

func readHtpasswd(path string) (map[string]string, errors.Error) {
	records := make(map[string]string)
	file, err := os.Open(path)
	if os.IsNotExist(err) {
		return records, nil
	}
	if err != nil {
		return nil, errors.Default.Wrap(err, "error reading htpasswd file")
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		records[parts[0]] = parts[1]
	}
	if err := scanner.Err(); err != nil {
		return nil, errors.Default.Wrap(err, "error scanning htpasswd file")
	}
	return records, nil
}

func writeFileAtomic(path string, content string) errors.Error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".htpasswd-*")
	if err != nil {
		return errors.Default.Wrap(err, "error creating temporary htpasswd file")
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)

	if _, err := tmp.WriteString(content); err != nil {
		_ = tmp.Close()
		return errors.Default.Wrap(err, "error writing temporary htpasswd file")
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return errors.Default.Wrap(err, "error syncing temporary htpasswd file")
	}
	if err := tmp.Close(); err != nil {
		return errors.Default.Wrap(err, "error closing temporary htpasswd file")
	}
	if err := os.Chmod(tmpName, 0644); err != nil {
		return errors.Default.Wrap(err, "error securing temporary htpasswd file")
	}
	if err := os.Rename(tmpName, path); err != nil {
		return errors.Default.Wrap(err, "error replacing htpasswd file")
	}
	return nil
}

func createHtpasswdHash(password string) (string, errors.Error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", errors.Default.Wrap(err, "error creating htpasswd hash")
	}
	return string(hash), nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
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

func hasPendingCollectorRestart(credentials []*models.OtelCredential) bool {
	for _, credential := range credentials {
		if credential.PendingCollectorRestart {
			return true
		}
	}
	return false
}

func hasRetiringCredential(credentials []*models.OtelCredential) bool {
	for _, credential := range credentials {
		if credential.Status == models.OtelCredentialStatusRetiring {
			return true
		}
	}
	return false
}

func restartHint(credentials []*models.OtelCredential) string {
	for _, credential := range credentials {
		if credential.PendingCollectorRestart && credential.LastCollectorRestartHint != "" {
			return credential.LastCollectorRestartHint
		}
	}
	return ""
}
