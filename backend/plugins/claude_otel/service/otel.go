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
	collectorRestartHint        = "Telemetry endpoint is applying credential changes"
	defaultOtelRestartTimeout   = 45
)

var (
	cfg config.ConfigReader
	db  dal.Dal
	// lifecycleMu serializes file and collector updates for a single backend instance.
	lifecycleMu sync.Mutex
)

func Init(basicRes corecontext.BasicRes) {
	cfg = basicRes.GetConfigReader()
	db = basicRes.GetDal()
}

type OtelConnectionInput struct {
	Name string `json:"name"`
}

func ListOtelConnections() ([]*models.OtelConnectionWithCredentials, errors.Error) {
	connections := make([]*models.OtelConnection, 0)
	err := db.All(&connections, dal.Orderby("created_at DESC"))
	if err != nil {
		return nil, errors.Default.Wrap(err, "error getting otel connections")
	}

	output := make([]*models.OtelConnectionWithCredentials, 0, len(connections))
	for _, connection := range connections {
		credentials, err := getOtelCredentials(connection.ID)
		if err != nil {
			return nil, err
		}
		output = append(output, &models.OtelConnectionWithCredentials{
			Connection:      connection,
			Credentials:     credentials,
			RestartRequired: hasPendingCollectorRestart(credentials),
			RestartHint:     restartHint(credentials),
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
	activeCount, err := db.Count(
		dal.From(&models.OtelConnection{}),
		dal.Where("status = ?", models.OtelConnectionStatusActive),
	)
	if err != nil {
		return nil, errors.Default.Wrap(err, "error checking active otel connections")
	}
	if activeCount > 0 {
		return nil, errors.BadInput.New("an active Claude Code OTel connection already exists")
	}
	connection := &models.OtelConnection{
		Name:              firstNonEmpty(input.Name, defaultOtelConnectionName),
		CollectorEndpoint: endpoint,
		Protocol:          protocol,
		Status:            models.OtelConnectionStatusActive,
	}
	setOtelActor(user, connection, true)

	err = db.Create(connection)
	if err != nil {
		return nil, errors.Default.Wrap(err, "error creating otel connection")
	}

	credential, password, err := createOtelCredential(connection.ID)
	if err != nil {
		_ = db.Delete(connection)
		return nil, err
	}
	credentials := []*models.OtelCredential{credential}
	if err := db.Create(credential); err != nil {
		_ = db.Delete(connection)
		return nil, errors.Default.Wrap(err, "error saving otel credential")
	}
	if err := writeHtpasswd(credentials, map[string]string{credential.Username: password}); err != nil {
		_ = db.Delete(credential)
		_ = db.Delete(connection)
		return nil, err
	}
	_ = applyOtelCredentialChanges(credentials)
	if err := db.Update(credential); err != nil {
		return nil, errors.Default.Wrap(err, "error recording otel credential activation")
	}
	return responseWithSettings(connection, credentials, credential, password), nil
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
	for _, credential := range activeCredentials {
		if credential.Status == models.OtelCredentialStatusActive {
			credential.Status = models.OtelCredentialStatusRetiring
			credential.RotatedAt = &now
			credential.PendingCollectorRestart = true
			credential.LastCollectorRestartHint = collectorRestartHint
		}
	}

	newCredential, password, err := createOtelCredential(id)
	if err != nil {
		return nil, err
	}
	nextCredentials := append(activeCredentials, newCredential)
	for _, credential := range activeCredentials {
		if err := db.Update(credential); err != nil {
			return nil, errors.Default.Wrap(err, "error updating retiring otel credential")
		}
	}
	if err := db.Create(newCredential); err != nil {
		restoreActiveCredentials(activeCredentials)
		return nil, errors.Default.Wrap(err, "error saving rotated otel credential")
	}
	if err := writeHtpasswd(nextCredentials, map[string]string{newCredential.Username: password}); err != nil {
		_ = db.Delete(newCredential)
		restoreActiveCredentials(activeCredentials)
		return nil, err
	}
	_ = applyOtelCredentialChanges(nextCredentials)
	for _, credential := range nextCredentials {
		if err := db.Update(credential); err != nil {
			return nil, errors.Default.Wrap(err, "error recording otel credential activation")
		}
	}
	setOtelActor(user, connection, false)
	if err := db.Update(connection); err != nil {
		return nil, errors.Default.Wrap(err, "error updating otel connection")
	}
	return responseWithSettings(connection, nextCredentials, newCredential, password), nil
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
		credential.Status = models.OtelCredentialStatusRevoked
		credential.RevokedAt = &now
		credential.PendingCollectorRestart = true
		credential.LastCollectorRestartHint = collectorRestartHint
	}
	for _, credential := range credentials {
		if err := db.Update(credential); err != nil {
			return nil, errors.Default.Wrap(err, "error revoking otel credential")
		}
	}
	connection.Status = models.OtelConnectionStatusRevoked
	setOtelActor(user, connection, false)
	if err := db.Update(connection); err != nil {
		return nil, errors.Default.Wrap(err, "error revoking otel connection")
	}
	if err := writeHtpasswd([]*models.OtelCredential{}, nil); err != nil {
		return nil, err
	}
	applyErr := applyOtelCredentialChanges(credentials)
	for _, credential := range credentials {
		if err := db.Update(credential); err != nil {
			return nil, errors.Default.Wrap(err, "error recording otel credential revocation")
		}
	}
	allCredentials, err := getOtelCredentials(id)
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
	activeOnly := make([]*models.OtelCredential, 0)
	for _, credential := range credentials {
		if credential.Status == models.OtelCredentialStatusRetiring {
			credential.Status = models.OtelCredentialStatusRevoked
			credential.RevokedAt = &now
			credential.PendingCollectorRestart = true
			credential.LastCollectorRestartHint = collectorRestartHint
		} else {
			activeOnly = append(activeOnly, credential)
		}
	}
	for _, credential := range credentials {
		if err := db.Update(credential); err != nil {
			return nil, errors.Default.Wrap(err, "error finalizing otel rotation")
		}
	}
	setOtelActor(user, connection, false)
	if err := db.Update(connection); err != nil {
		return nil, errors.Default.Wrap(err, "error updating otel connection")
	}
	if err := writeHtpasswd(activeOnly, nil); err != nil {
		return nil, err
	}
	applyErr := applyOtelCredentialChanges(credentials)
	for _, credential := range credentials {
		if err := db.Update(credential); err != nil {
			return nil, errors.Default.Wrap(err, "error recording finalized otel credential activation")
		}
	}
	allCredentials, err := getOtelCredentials(id)
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
	credentials, err := getOtelCredentialsByStatuses(id, models.OtelCredentialStatusActive, models.OtelCredentialStatusRetiring)
	if err != nil {
		return nil, err
	}
	if err := writeHtpasswd(credentials, nil); err != nil {
		return nil, err
	}
	allCredentials, err := getOtelCredentials(id)
	if err != nil {
		return nil, err
	}
	applyErr := applyOtelCredentialChanges(allCredentials)
	for _, credential := range allCredentials {
		if err := db.Update(credential); err != nil {
			return nil, errors.Default.Wrap(err, "error recording otel credential activation")
		}
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

func createOtelCredential(connectionId uint64) (*models.OtelCredential, string, errors.Error) {
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
		Username:                 fmt.Sprintf("otel_%s", strings.ToLower(idPart)),
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

func callOtelRestartHelper() errors.Error {
	helperUrl := strings.TrimRight(cfg.GetString("OTEL_RESTART_HELPER_URL"), "/")
	if helperUrl == "" {
		return errors.Default.New("otel restart helper is not configured")
	}
	token := cfg.GetString("OTEL_RESTART_HELPER_TOKEN")
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
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

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

func writeHtpasswd(credentials []*models.OtelCredential, newPasswords map[string]string) errors.Error {
	path := firstNonEmpty(cfg.GetString("OTEL_AUTH_HTPASSWD_PATH"), defaultOtelAuthHtpasswdPath)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return errors.Default.Wrap(err, "error creating otel auth directory")
	}

	existing, err := readHtpasswd(path)
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

func restartHint(credentials []*models.OtelCredential) string {
	for _, credential := range credentials {
		if credential.PendingCollectorRestart && credential.LastCollectorRestartHint != "" {
			return credential.LastCollectorRestartHint
		}
	}
	return ""
}
