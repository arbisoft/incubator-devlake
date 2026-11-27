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

package api

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/apache/incubator-devlake/core/errors"
	logmocks "github.com/apache/incubator-devlake/mocks/core/log"
	mailsvc "github.com/apache/incubator-devlake/server/services/mail"
)

func TestLoadMailTemplates(t *testing.T) {
	t.Run("built-in only", func(t *testing.T) {
		r, err := loadMailTemplates("")
		require.Nil(t, err)
		assert.Equal(t, []string{mailsvc.TemplateAlert, mailsvc.TemplateProjectInvite, mailsvc.TemplateReport}, r.Names())
	})
	t.Run("override folder", func(t *testing.T) {
		dir := t.TempDir()
		require.NoError(t, os.WriteFile(filepath.Join(dir, "alert.txt"), []byte(`{{define "subject"}}Override {{.Title}}{{end}}body`), 0o600))
		r, err := loadMailTemplates(dir)
		require.Nil(t, err)
		out, err := r.Render(mailsvc.TemplateAlert, mailsvc.AlertData{Title: "T"})
		require.Nil(t, err)
		assert.Equal(t, "Override T", out.Subject)
	})
	t.Run("missing folder", func(t *testing.T) {
		_, err := loadMailTemplates(filepath.Join(t.TempDir(), "nope"))
		require.NotNil(t, err)
		assert.Equal(t, errors.BadInput, err.GetType())
		assert.Contains(t, err.Error(), "MAIL_TEMPLATE_DIR is not a readable directory")
	})
}

func TestMailTemplateDirIsIgnoredWhenMailIsOff(t *testing.T) {
	assert.Equal(t, "/templates", mailTemplateDir(mailsvc.Config{Enabled: true, TemplateDir: "/templates"}))
	assert.Empty(t, mailTemplateDir(mailsvc.Config{Enabled: false, TemplateDir: "/missing"}),
		"a stale MAIL_TEMPLATE_DIR doesn't turn into a warning while mail is off")
}

func TestDisableMailReason(t *testing.T) {
	logger := logmocks.NewLogger(t)
	logger.On("Error", mock.Anything, "mail is off: %s failed", mock.Anything).Return()

	enabled, reason := disableMail(logger, errors.BadInput.New("invalid mail config: SMTP_HOST is required"), "read mail config")
	assert.False(t, enabled)
	assert.Equal(t, "invalid mail config: SMTP_HOST is required", reason)

	_, reason = disableMail(logger, errors.Default.New("open /secret/path: permission denied"), "load mail templates")
	assert.Equal(t, "load mail templates failed; see the server log", reason, "internal errors stay in the log")
}
