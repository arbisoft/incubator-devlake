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
	stderrors "errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
	"golang.org/x/crypto/bcrypt"
)

const (
	htpasswdCreateDirectoryOperation = "create credential storage directory"
	htpasswdReadOperation            = "read credential storage"
	htpasswdWriteOperation           = "write credential storage"
)

func writeHtpasswd(newPasswords map[string]string) errors.Error {
	path := firstNonEmpty(cfg.GetString("OTEL_AUTH_HTPASSWD_PATH"), defaultOtelAuthHtpasswdPath)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return otelCredentialStorageError(htpasswdCreateDirectoryOperation, err)
	}

	existing, err := readHtpasswd(path)
	if err != nil {
		return otelCredentialStorageError(htpasswdReadOperation, err)
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
	if err := writeFileAtomic(path, content); err != nil {
		return otelCredentialStorageError(htpasswdWriteOperation, err)
	}
	return nil
}

func missingHtpasswdHashes(credentials []*models.OtelCredential) (bool, errors.Error) {
	path := firstNonEmpty(cfg.GetString("OTEL_AUTH_HTPASSWD_PATH"), defaultOtelAuthHtpasswdPath)
	existing, err := readHtpasswd(path)
	if err != nil {
		return false, otelCredentialStorageError(htpasswdReadOperation, err)
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

// otelCredentialStorageError keeps filesystem details in backend logs, not API responses.
func otelCredentialStorageError(operation string, err error) errors.Error {
	if logger != nil {
		logger.Error(err, "failed to %s", operation)
	}
	if os.IsPermission(err) || stderrors.Is(err, syscall.EROFS) {
		return errors.Default.New("telemetry credential storage is misconfigured")
	}
	return errors.Unavailable.New(otelCredentialStorageHint)
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
