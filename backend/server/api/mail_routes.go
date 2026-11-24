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
	gocontext "context"
	"os"

	"github.com/gin-gonic/gin"

	"github.com/apache/incubator-devlake/core/context"
	"github.com/apache/incubator-devlake/core/errors"
	"github.com/apache/incubator-devlake/core/log"
	mailapi "github.com/apache/incubator-devlake/server/api/mail"
	"github.com/apache/incubator-devlake/server/api/shared"
	"github.com/apache/incubator-devlake/server/services"
	mailsvc "github.com/apache/incubator-devlake/server/services/mail"
)

// registerMailRoutes is the composition root for the mail service. A bad mail config never stops
// the server: it is logged once, mail is turned off, and GET /mail/status reports why.
func registerMailRoutes(r *gin.Engine, basicRes context.BasicRes, admin gin.HandlerFunc) {
	logger := basicRes.GetLogger().Nested("mail")
	cfg, disabledReason := loadMailConfig(basicRes.GetConfigReader(), logger)

	renderer, err := loadMailTemplates(mailTemplateDir(cfg))
	if err != nil {
		cfg.Enabled, disabledReason = disableMail(logger, err, "load mail templates")
		renderer = errors.Must1(mailsvc.LoadRenderer(mailsvc.BuiltinTemplates()))
	}
	store := errors.Must1(mailsvc.NewStore(basicRes.GetDal()))

	var queue interface{ Notify() } = mailsvc.NotifyFunc(func() {})
	if cfg.Enabled {
		worker, workerErr := newMailWorker(cfg, store, logger)
		if workerErr != nil {
			cfg.Enabled, disabledReason = disableMail(logger, workerErr, "create mail driver")
		} else {
			queue = worker
			// The server has no shutdown hook, so the worker lives as long as the process. A row being
			// sent when the process stops stays QUEUED and is sent again on the next start.
			go worker.Run(gocontext.Background())
		}
	}
	if cfg.Enabled {
		logger.Info("mail is on driver=%s provider=%s", cfg.Driver, cfg.Provider())
	}

	svc := errors.Must1(mailsvc.NewService(cfg, disabledReason, renderer, store, queue))
	history := errors.Must1(services.NewMailHistoryService(basicRes.GetDal()))
	handlers := errors.Must1(mailapi.NewHandlers(svc, history))

	r.GET("/mail/status", admin, handlers.GetStatus)
	r.POST("/mail/test", admin, handlers.PostTestEmail)
	r.GET("/mail/history", admin, handlers.GetHistory)
	r.GET("/mail/history/:"+mailapi.EmailIDParam, admin, handlers.GetHistoryEmail)
}

// loadMailConfig parses the mail settings. An invalid config is logged and turns mail off.
func loadMailConfig(src mailConfigSource, logger log.Logger) (mailsvc.Config, string) {
	cfg, err := mailsvc.ParseConfig(src)
	if err != nil {
		_, reason := disableMail(logger, err, "read mail config")
		return cfg, reason
	}
	return cfg, ""
}

// mailConfigSource is the part of the config reader ParseConfig uses.
type mailConfigSource interface {
	GetBool(key string) bool
	GetString(key string) string
}

// mailTemplateDir is the MAIL_TEMPLATE_DIR override to load. It is empty when mail is off, so a stale
// folder setting can't log an error or show a warning for mail that was never turned on.
func mailTemplateDir(cfg mailsvc.Config) string {
	if !cfg.Enabled {
		return ""
	}
	return cfg.TemplateDir
}

// loadMailTemplates reads the built-in templates, with files in dir replacing them by name when dir is set.
func loadMailTemplates(dir string) (*mailsvc.Renderer, errors.Error) {
	fsys := mailsvc.BuiltinTemplates()
	if dir != "" {
		info, err := os.Stat(dir)
		if err != nil || !info.IsDir() {
			return nil, errors.BadInput.New("MAIL_TEMPLATE_DIR is not a readable directory: " + dir)
		}
		fsys = mailsvc.OverlayTemplates(os.DirFS(dir), fsys)
	}
	return mailsvc.LoadRenderer(fsys)
}

func newMailWorker(cfg mailsvc.Config, store *mailsvc.Store, logger log.Logger) (*mailsvc.Worker, errors.Error) {
	mailer, err := mailsvc.NewMailer(cfg, logger)
	if err != nil {
		return nil, err
	}
	return mailsvc.NewWorker(store, mailer, cfg, logger, mailsvc.WithReadiness(func() bool {
		return services.CurrentStatus() == services.SERVICE_STATUS_READY
	}))
}

// disableMail logs why mail is off and returns the values to store: enabled false and a reason that is
// safe to show admins. Config errors keep their message; anything else points to the server log.
func disableMail(logger log.Logger, err errors.Error, step string) (bool, string) {
	logger.Error(err, "mail is off: %s failed", step)
	if err.GetType() == errors.BadInput {
		return false, shared.SafeErrorMessage(err)
	}
	return false, step + " failed; see the server log"
}
