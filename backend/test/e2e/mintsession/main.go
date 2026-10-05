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

// Command mintsession prints a signed session for an existing admin (env vars: see config-ui/e2e-tests/README.md).
package main

import (
	"database/sql"
	"fmt"
	"os"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/google/uuid"

	"github.com/apache/incubator-devlake/helpers/oidchelper"
)

const sessionTTL = 8 * time.Hour

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "mintsession:", err)
		os.Exit(1)
	}
}

func run() error {
	names := []string{"SESSION_SECRET", "E2E_DB_DSN", "E2E_ADMIN_PROVIDER", "E2E_ADMIN_SUB", "E2E_ADMIN_EMAIL", "E2E_ADMIN_NAME"}
	values := make(map[string]string, len(names))
	var missing []string
	for _, name := range names {
		values[name] = os.Getenv(name)
		if values[name] == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("missing required environment variables: %s", strings.Join(missing, ", "))
	}

	cfg := &oidchelper.Config{SessionSecret: []byte(values["SESSION_SECRET"]), SessionTTL: sessionTTL}
	jti := uuid.NewString()
	token, expiresAt, err := oidchelper.IssueSession(cfg, jti, values["E2E_ADMIN_PROVIDER"], values["E2E_ADMIN_SUB"], values["E2E_ADMIN_EMAIL"], values["E2E_ADMIN_NAME"])
	if err != nil {
		return fmt.Errorf("issue session: %w", err)
	}

	db, err := sql.Open("mysql", values["E2E_DB_DSN"])
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer db.Close()

	now := time.Now().UTC()
	_, err = db.Exec(
		`INSERT INTO auth_sessions (jti, sub, email, name, issued_at, expires_at, last_seen_at, provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		jti, values["E2E_ADMIN_SUB"], values["E2E_ADMIN_EMAIL"], values["E2E_ADMIN_NAME"], now, expiresAt.UTC(), now, values["E2E_ADMIN_PROVIDER"],
	)
	if err != nil {
		return fmt.Errorf("insert auth_sessions row: %w", err)
	}
	if _, err := fmt.Print(token); err != nil {
		return fmt.Errorf("write token: %w", err)
	}
	return nil
}
