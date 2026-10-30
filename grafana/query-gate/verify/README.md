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

# Query gate verification harness

Two throwaway Grafana + gate chains that copy the staging and prod topologies, next to the local dev stack (`mysql` from `docker-compose-dev.yml`). Test suites run against the real hostnames over TLS.

| Name | Layers | Root path | Datasource uids |
| --- | --- | --- | --- |
| staging (`aperture.arbisoft.com`) | edge TLS, nginx :80, gate, Grafana | `/grafana` | `devlake-mysql` |
| prod (`devlake-grafana.arbisoft.com`) | edge TLS passthrough, Envoy TLS, gate and Grafana sharing a network namespace (Grafana on `127.0.0.1:3000`) | `/` | `devlake-mysql`, `P430005175C4C7810` |

## Prerequisites

- Local stack up (`mysql` running) and the Grafana image rebuilt from this branch: `docker compose -f docker-compose-dev.yml build grafana`.
- `jq`, `openssl`, `curl`, Docker Compose.
- Port 443 free on 127.0.0.1.
- The viewer logins mapped in `user_project_mapping`.

## Usage

```
grafana/query-gate/verify/run.sh <up|down|mode MODE|provision|smoke|logs|suite [go test args]|outage|browser [options]|all>
```

- `up`: create certs and secrets, (re)create the `gv-*` services, wait for both gates, provision users.
- `provision`: create or converge the test users, roles and passwords on both Grafanas.
- `mode off|report|enforce`: recreate both gates in that mode.
- `smoke`: curl checks through the edge on both hostnames.
- `logs`: write both gates' JSON log lines to `$GV_WORK/logs/`.
- `down`: remove the `gv-*` services only.
- `suite [go test args...]`: run the Go suite in `verify/suite/` (build tag `verify`) against the live stack; output is tee'd to `$GV_WORK/results/go-<UTC timestamp>.txt`, the `--- FAIL` lines and the final `ok`/`FAIL` line are printed, and the exit status is go test's. Probes go to `$GV_WORK/results/probes.jsonl`. Env knobs: `GV_EXPECT_MODE` (`enforce` default, `report`, `off`), `GV_PHASE`, `GV_LOGS`.
- `outage`: log viewer A in, stop the staging Grafana, run `TestUpstreamDown`, start Grafana again, run `TestUpstreamRecovered`. Warns when Grafana comes back without the test users.
- `browser [options]`: open every shipped dashboard in headless Chromium through the edge on both hostnames as viewer A, viewer B, `gv-orgadmin` and `gv-editor` (time ranges, variable changes, refresh, plus the forge, breakout and edit-panel checks), compare staging queries with the direct Grafana, and fail on unexpected gate rejections, false positives or replay mismatches. Needs the Config UI install (`config-ui/node_modules`, Playwright's Chromium). Output is tee'd to `$GV_WORK/results/browser-<UTC timestamp>.txt` with full results in the matching `.json` and screenshots of failing pages in `$GV_WORK/results/shots/`. Options: `--topology staging|prod|both`, `--only uid,uid`, `--long` (6-minute session-rotation check as viewer A), `--dry` (print the plan only), `--concurrency N` (pages per user, default 3).
- `all`: `up`, `smoke`, `suite` (enforce), `outage`, then the report and off mode runs, back to `enforce`, and `TestGateLogsAreClean` over the logs collected on the way. Stops at the first failing step and names it.

Direct probes: gates on `127.0.0.1:3011` (staging) and `127.0.0.1:3012` (prod), staging Grafana on `127.0.0.1:3013`.

## Work directory

`GV_WORK` (default `${TMPDIR:-/tmp}/grafana-gate-verify`) holds the generated CA and leaf certificate, `secrets.env` (generated passwords, mode 600) and `users.env`. It lives outside the repo.

## Hostnames

Nothing here edits `/etc/hosts`. Clients map the hostnames to 127.0.0.1 themselves: `curl --resolve`, Chromium `--host-resolver-rules`, or a Go dialer, and trust `$GV_WORK/certs/ca.crt`. Every client must map the hostnames itself (Playwright's API request context does not honour Chromium's rules); both TLS fronts add an `X-Gv-Local: 1` response header, and the browser run aborts with exit 3 when any response from those hostnames lacks it.
