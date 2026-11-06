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

// Command grafana-query-gate checks Grafana dashboards against the query gate rules.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/apache/incubator-devlake/grafana/query-gate/internal/config"
	"github.com/apache/incubator-devlake/grafana/query-gate/internal/gate"
	"github.com/apache/incubator-devlake/grafana/query-gate/internal/identity"
	gatesync "github.com/apache/incubator-devlake/grafana/query-gate/internal/sync"
	"github.com/apache/incubator-devlake/grafana/query-gate/internal/templates"
)

func main() {
	os.Exit(run(os.Args[1:]))
}

func run(args []string) int {
	switch {
	case len(args) == 0 || (len(args) == 1 && args[0] == "serve"):
		return serve()
	case len(args) == 2 && args[0] == "lint":
		return lint(args[1])
	}
	fmt.Fprintln(os.Stderr, "usage: grafana-query-gate [serve | lint <dashboards-dir>]")
	return 2
}

func serve() int {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		return 1
	}
	shipped, errs, err := templates.LoadDir(cfg.DashboardsDir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		return 1
	}
	if len(errs) > 0 {
		for _, e := range errs {
			fmt.Fprintf(os.Stderr, "ERROR %s: %s\n", e.Location, e.Message)
		}
		return 1
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	syncer := gatesync.New(cfg.Upstream, cfg.RootPath, cfg.GrafanaUser, cfg.GrafanaPass, cfg.SyncInterval, shipped.Templates(), logger)
	go syncer.Run(ctx)
	srv := &http.Server{
		Addr:              cfg.Listen,
		Handler:           gate.New(cfg, cfg.Upstream, identity.New(cfg.Upstream, cfg.RootPath), syncer.Current, logger),
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	logger.Info("query gate starting", "mode", string(cfg.Mode), "listen", cfg.Listen, "templates", shipped.Len(), "sync_enabled", cfg.GrafanaUser != "")
	errc := make(chan error, 1)
	go func() { errc <- srv.ListenAndServe() }()
	select {
	case err := <-errc:
		fmt.Fprintln(os.Stderr, "error:", err)
		return 1
	case <-ctx.Done():
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintln(os.Stderr, "error:", err)
		return 1
	}
	return 0
}

func lint(dir string) int {
	set, errs, err := templates.LoadDir(dir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		return 1
	}
	for _, e := range errs {
		fmt.Printf("ERROR %s: %s\n", e.Location, e.Message)
	}
	noLogin := set.NoLogin()
	for _, loc := range noLogin {
		fmt.Printf("NO-LOGIN %s\n", loc)
	}
	fmt.Printf("%d templates compiled, %d errors, %d without login filter\n", set.Len(), len(errs), len(noLogin))
	if len(errs) > 0 || len(noLogin) > 0 {
		return 1
	}
	return 0
}
