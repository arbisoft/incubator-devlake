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
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/apache/incubator-devlake/core/dal"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/plugins/claude_otel/models"
)

const maxRestartHelperResponseBodySize = 1024

func applyOtelCredentialChanges(credentials []*models.OtelCredential) errors.Error {
	hint, err := callOtelRestartHelper()
	if err != nil {
		if hint == "" {
			hint = collectorRestartHint
		}
		for _, credential := range credentials {
			credential.PendingCollectorRestart = true
			credential.LastCollectorRestartHint = hint
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
	if applyErr == nil {
		if err := clearPendingOtelCredentialRestartState(); err != nil {
			return nil, err
		}
		return nil, nil
	}
	if err := updateOtelCredentialRestartState(credentials); err != nil {
		return applyErr, err
	}
	return applyErr, nil
}

// clearPendingOtelCredentialRestartState confirms the global auth file was loaded after a healthy Collector restart.
func clearPendingOtelCredentialRestartState() errors.Error {
	return db.UpdateColumns(
		&models.OtelCredential{},
		[]dal.DalSet{
			{ColumnName: "pending_collector_restart", Value: false},
			{ColumnName: "last_collector_restart_hint", Value: ""},
		},
		dal.Where("pending_collector_restart = ?", true),
	)
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

func callOtelRestartHelper() (string, errors.Error) {
	helperUrl := strings.TrimRight(cfg.GetString(otelRestartHelperUrlKey), "/")
	if helperUrl == "" {
		return "", errors.Default.New("otel restart helper is not configured")
	}
	token := strings.TrimSpace(cfg.GetString(otelRestartHelperTokenKey))
	if token == "" {
		return "", errors.Default.New("otel restart helper token is not configured")
	}
	timeout := cfg.GetInt(otelRestartHelperTimeoutKey)
	if timeout <= 0 {
		timeout = defaultOtelRestartTimeout
	}

	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeout)*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, helperUrl+otelRestartHelperApplyPath, bytes.NewReader([]byte("{}")))
	if err != nil {
		return "", errors.Default.Wrap(err, "error creating otel restart helper request")
	}
	req.Header.Set(otelContentTypeHeader, otelJsonContentType)
	req.Header.Set(otelAuthHeader, "Bearer "+token)

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", errors.Default.Wrap(err, "error calling otel restart helper")
	}
	defer drainAndCloseRestartHelperResponse(res.Body)
	if res.StatusCode >= http.StatusOK && res.StatusCode < http.StatusMultipleChoices {
		return "", nil
	}
	return restartHintForStatus(res), errors.Default.New(fmt.Sprintf("otel restart helper failed with status %d", res.StatusCode))
}

// Drain the helper's small response before closing so the default HTTP transport can reuse its connection.
func drainAndCloseRestartHelperResponse(body io.ReadCloser) {
	_, _ = io.Copy(io.Discard, io.LimitReader(body, maxRestartHelperResponseBodySize))
	_ = body.Close()
}

func restartHintForStatus(res *http.Response) string {
	switch res.StatusCode {
	case http.StatusConflict:
		return "Collector restart is already in progress. Retry Apply shortly."
	case http.StatusTooManyRequests:
		if retryAfter, err := strconv.Atoi(strings.TrimSpace(res.Header.Get("Retry-After"))); err == nil && retryAfter > 0 {
			return fmt.Sprintf("Collector is cooling down. Retry Apply in about %d seconds.", retryAfter)
		}
		return "Collector is cooling down. Retry Apply shortly."
	default:
		return ""
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
