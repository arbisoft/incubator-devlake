<!--
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
-->

# config-ui e2e tests

Playwright specs that drive a running DevLake stack (config-ui, devlake API, MySQL, and for the OTel specs Grafana, Prometheus and the OTel collector).

## Prerequisites

- A local stack (for example `docker compose -f docker-compose-dev.yml up`) with `AUTH_ENABLED`, `AUTH_ACCESS_ENABLED` and OIDC providers configured.
- `go` on `PATH` (sessions are minted by `backend/test/e2e/mintsession`) and Docker (SQL runs through `docker exec` in the MySQL container; remote Docker hosts are refused).
- An existing `customer_admin` in the access directory (the bootstrap admin); its identity is used for the minted session.
- Auth state: `auth/local-auth-e2e.spec.ts` and `auth/rebase-matrix.spec.ts` need local password auth enabled (`AUTH_LOCAL_ENABLED=true`, state B); `auth/local-auth-state-a.spec.ts` needs it disabled (state A). Specs for the other state skip themselves, detected via `GET /auth/methods`.
- The `/otel` specs need at least one DevLake project, and the Grafana, Prometheus and collector endpoints reachable.

## Environment

Missing variables are read from the repo-root `.env`.

| Variable                                                                   | Purpose                                                                                        |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`                                                           | Signing secret of the running backend (required)                                               |
| `E2E_ADMIN_PROVIDER`, `E2E_ADMIN_SUB`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_NAME` | Identity of the existing `customer_admin` (required)                                           |
| `DB_URL` or `E2E_DB_USER`, `E2E_DB_PASSWORD`, `E2E_DB_NAME`                | App database credentials (required; `DB_URL` is the backend one, not the Go test `E2E_DB_URL`) |
| `E2E_MYSQL_CONTAINER`                                                      | MySQL container name (default `incubator-devlake-mysql-1`)                                     |
| `E2E_DB_HOST`, `E2E_DB_PORT`, `E2E_DB_DSN`                                 | Host-side DB address used by the session minter (default `127.0.0.1:3306`; must be local)      |
| `E2E_BASE_URL`, `E2E_API_URL`                                              | config-ui and devlake API (default `http://localhost:4000`, `http://localhost:8080`)           |
| `E2E_GRAFANA_URL`, `E2E_PROMETHEUS_URL`, `E2E_COLLECTOR_URL`               | Defaults `http://localhost:3002`, `:9090`, `:8889`                                             |
| `E2E_GO_BIN`, `E2E_DOCKER_BIN`                                             | Override the `go` / `docker` executables                                                       |

## Running

```sh
cd config-ui
yarn install
npx playwright install chromium
yarn test:e2e          # or yarn test:e2e:ui
```

Specs run serially because they share one database and the login throttle buckets. Test users are named `e2e_*` and only those rows are cleaned up; the login throttle table is truncated between tests.
