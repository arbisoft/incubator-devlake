#!/usr/bin/env bash
# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Usage: run.sh <up|down|mode MODE|provision|smoke|logs|suite [go test args]|outage|browser [options]|all>
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

GV_WORK="${GV_WORK:-${TMPDIR:-/tmp}/grafana-gate-verify}"
GV_WORK="${GV_WORK%/}"
export GV_WORK

GV_SERVICES=(gv-staging-grafana gv-staging-gate gv-staging-nginx gv-prod-grafana gv-prod-gate gv-prod-envoy gv-edge)
GV_VIEWER_A_LOGIN="${GV_VIEWER_A_LOGIN:-seed.viewer.a@example.test}"
GV_VIEWER_B_LOGIN="${GV_VIEWER_B_LOGIN:-seed.viewer.b@example.test}"
STAGING_HOST=aperture.arbisoft.com
PROD_HOST=devlake-grafana.arbisoft.com
PANEL_FILE="grafana/dashboards/AI Impact/AI Throughput Overview.json"

die() { echo "error: $*" >&2; exit 1; }

dc() { docker compose -f docker-compose-dev.yml -f grafana/query-gate/verify/compose.yml "$@"; }

need_tools() {
  local t
  for t in jq openssl curl docker; do
    command -v "$t" >/dev/null 2>&1 || die "$t is required but not installed"
  done
}

init_work() {
  mkdir -p "$GV_WORK"
  chmod 700 "$GV_WORK"
  mkdir -p "$GV_WORK/certs" "$GV_WORK/logs"
  gen_certs
  gen_secrets
  write_users
  set -a
  # shellcheck disable=SC1091
  . "$GV_WORK/secrets.env"
  set +a
}

gen_certs() {
  local d="$GV_WORK/certs"
  [ -f "$d/leaf.crt" ] && [ -f "$d/leaf.key" ] && [ -f "$d/ca.crt" ] && return 0
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=grafana-gate-verify-ca" \
    -keyout "$d/ca.key" -out "$d/ca.crt" >/dev/null 2>&1
  openssl req -newkey rsa:2048 -nodes -subj "/CN=$STAGING_HOST" \
    -keyout "$d/leaf.key" -out "$d/leaf.csr" >/dev/null 2>&1
  printf 'subjectAltName=DNS:%s,DNS:%s\nbasicConstraints=CA:FALSE\n' "$STAGING_HOST" "$PROD_HOST" >"$d/leaf.ext"
  openssl x509 -req -in "$d/leaf.csr" -CA "$d/ca.crt" -CAkey "$d/ca.key" -CAcreateserial \
    -days 30 -extfile "$d/leaf.ext" -out "$d/leaf.crt" >/dev/null 2>&1
  rm -f "$d/leaf.csr" "$d/leaf.ext"
  chmod 644 "$d"/*.crt "$d"/*.key
}

gen_secrets() {
  local f="$GV_WORK/secrets.env" v
  [ -f "$f" ] && return 0
  (
    umask 077
    : >"$f"
    for v in GV_ADMIN_PASSWORD GV_SYSTEM_PASSWORD GV_SERVERADMIN_PASSWORD GV_ORGADMIN_PASSWORD \
      GV_EDITOR_PASSWORD GV_VIEWER_A_PASSWORD GV_VIEWER_B_PASSWORD; do
      printf '%s=%s\n' "$v" "Gv1!$(openssl rand -hex 12)" >>"$f"
    done
  )
  chmod 600 "$f"
}

write_users() {
  cat >"$GV_WORK/users.env" <<USERS
GV_VIEWER_A_LOGIN=$GV_VIEWER_A_LOGIN
GV_VIEWER_B_LOGIN=$GV_VIEWER_B_LOGIN
GV_SYSTEM_LOGIN=gv-system
GV_SERVERADMIN_LOGIN=gv-serveradmin
GV_ORGADMIN_LOGIN=gv-orgadmin
GV_EDITOR_LOGIN=gv-editor
USERS
}

wait_ready() {
  local deadline=$((SECONDS + 120)) p
  for p in 3011 3012; do
    until curl -fsS --max-time 2 -o /dev/null "http://127.0.0.1:$p/gate/readyz" 2>/dev/null; do
      [ "$SECONDS" -lt "$deadline" ] || die "gate on 127.0.0.1:$p not ready within 120s"
      sleep 2
    done
  done
}

# Read-only lookup against the local lake DB.
lake_q() { dc exec -T mysql mysql -uroot -padmin lake -N -B -e "$1" 2>/dev/null; }

sql_quote() { printf "'%s'" "${1//\'/\'\'}"; }

viewer_projects() {
  lake_q "SELECT project_name FROM user_project_mapping WHERE user_login = $(sql_quote "$1")" || true
}

# gapi METHOD URL [curl args...]; the admin password goes through a config file descriptor, not argv.
gapi() {
  local m=$1 u=$2
  shift 2
  curl -fsS -X "$m" -K <(printf 'user = "gv-admin:%s"\n' "$GV_ADMIN_PASSWORD") \
    -H 'Content-Type: application/json' "$@" "$u"
}

provision_topology() {
  local name=$1 base=$2 entry login role sa pw var id code body email
  echo "provision: $name ($base)"
  local entries=(
    "gv-system|Viewer|true|GV_SYSTEM_PASSWORD"
    "gv-serveradmin|Viewer|true|GV_SERVERADMIN_PASSWORD"
    "gv-orgadmin|Admin|false|GV_ORGADMIN_PASSWORD"
    "gv-editor|Editor|false|GV_EDITOR_PASSWORD"
    "$GV_VIEWER_A_LOGIN|Viewer|false|GV_VIEWER_A_PASSWORD"
    "$GV_VIEWER_B_LOGIN|Viewer|false|GV_VIEWER_B_PASSWORD"
  )
  for entry in "${entries[@]}"; do
    IFS='|' read -r login role sa var <<<"$entry"
    pw="${!var}"
    code=$(curl -sS -o /dev/null -w '%{http_code}' -K <(printf 'user = "gv-admin:%s"\n' "$GV_ADMIN_PASSWORD") \
      -G --data-urlencode "loginOrEmail=$login" "$base/api/users/lookup" || true)
    if [ "$code" = 404 ]; then
      case "$login" in *@*) email="$login" ;; *) email="$login@example.test" ;; esac
      jq -n --arg n "$login" --arg l "$login" --arg e "$email" --arg p "$pw" \
        '{name:$n,login:$l,email:$e,password:$p}' |
        gapi POST "$base/api/admin/users" --data-binary @- -o /dev/null
    elif [ "$code" != 200 ]; then
      die "lookup of $login on $name returned HTTP $code"
    fi
    id=$(gapi GET "$base/api/users/lookup" -G --data-urlencode "loginOrEmail=$login" | jq -r .id)
    jq -n --arg r "$role" '{role:$r}' | gapi PATCH "$base/api/org/users/$id" --data-binary @- -o /dev/null
    jq -n --argjson a "$sa" '{isGrafanaAdmin:$a}' | gapi PUT "$base/api/admin/users/$id/permissions" --data-binary @- -o /dev/null
    jq -n --arg p "$pw" '{password:$p}' | gapi PUT "$base/api/admin/users/$id/password" --data-binary @- -o /dev/null
  done
}

provision() {
  need_tools
  provision_topology staging "http://127.0.0.1:3013/grafana"
  provision_topology prod "http://127.0.0.1:3012"
  local v
  for v in "$GV_VIEWER_A_LOGIN" "$GV_VIEWER_B_LOGIN"; do
    if [ -z "$(viewer_projects "$v")" ]; then
      echo "warning: $v has no rows in user_project_mapping" >&2
    fi
  done
}

cmd_up() {
  cmd_down
  dc up -d --no-deps --force-recreate "${GV_SERVICES[@]}"
  wait_ready
  provision
  echo "staging  https://$STAGING_HOST/grafana  ready"
  echo "prod     https://$PROD_HOST  ready"
}

cmd_mode() {
  local mode=${1:-}
  case "$mode" in off | report | enforce) ;; *) die "mode must be off|report|enforce" ;; esac
  export GV_GATE_MODE="$mode"
  dc up -d --no-deps --force-recreate gv-staging-gate gv-prod-gate
  wait_ready
  local p got
  for p in 3011 3012; do
    got=$(curl -fsS "http://127.0.0.1:$p/gate/healthz" | jq -r .mode)
    [ "$got" = "$mode" ] || die "gate on 127.0.0.1:$p reports mode '$got', expected '$mode'"
  done
  echo "mode $mode on both gates"
}

cmd_down() {
  dc rm -sf "${GV_SERVICES[@]}"
  docker volume rm -f gv-staging-grafana-data gv-prod-grafana-data >/dev/null
}

cmd_logs() {
  local ts s f
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  for s in gv-staging-gate gv-prod-gate; do
    f="$GV_WORK/logs/$s-$ts.jsonl"
    dc logs --no-color --no-log-prefix "$s" 2>/dev/null >"$f" || true
    echo "$f"
  done
}

FAILS=0
check() {
  local label=$1 ok=$2
  if [ "$ok" = 1 ]; then echo "PASS $label"; else echo "FAIL $label"; FAILS=$((FAILS + 1)); fi
}

scurl() {
  curl -sS --max-time 40 \
    --resolve "$STAGING_HOST:443:127.0.0.1" --resolve "$PROD_HOST:443:127.0.0.1" \
    --cacert "$GV_WORK/certs/ca.crt" "$@"
}

ds_body() {
  local sql=$1 uid=$2
  jq -n --arg sql "$sql" --arg uid "$uid" \
    '{queries:[{refId:"A",datasource:{type:"mysql",uid:$uid},rawSql:$sql,format:"table"}],from:"now-3650d",to:"now"}'
}

panel_sql() {
  local login=$1 projects=$2
  jq -r --arg login "$(sql_quote "$login")" --arg projects "$projects" \
    '[.panels[] | select(.id == 4)][0].targets[0].rawSql
     | gsub("\\$\\{__user\\.login:sqlstring\\}"; $login)
     | gsub("\\$project\\b"; $projects)' "$PANEL_FILE"
}

smoke_topology() {
  local name=$1 base=$2 uids=$3 origin jar body code uid projects sql plist p
  origin=$(printf '%s' "$base" | sed -E 's#^(https?://[^/]+).*#\1#')
  jar="$GV_WORK/smoke-$name.jar"
  body="$GV_WORK/smoke-$name.body"
  : >"$jar"

  code=$(scurl -o /dev/null -w '%{http_code}' "$base/api/health" || true)
  check "$name health 200" "$([ "$code" = 200 ] && echo 1 || echo 0)"

  code=$(jq -n --arg u "$GV_VIEWER_A_LOGIN" --arg p "$GV_VIEWER_A_PASSWORD" '{user:$u,password:$p}' |
    scurl -o /dev/null -w '%{http_code}' -c "$jar" -H 'Content-Type: application/json' -H "Origin: $origin" \
      --data-binary @- "$base/login" || true)
  check "$name viewer login 200 + session cookie" "$([ "$code" = 200 ] && grep -q grafana_session "$jar" && echo 1 || echo 0)"

  code=$(scurl -o "$body" -w '%{http_code}' -b "$jar" "$base/api/user" || true)
  check "$name /api/user login matches" "$([ "$code" = 200 ] && [ "$(jq -r .login "$body" 2>/dev/null)" = "$GV_VIEWER_A_LOGIN" ] && echo 1 || echo 0)"

  plist=""
  while IFS= read -r p; do
    [ -n "$p" ] || continue
    plist="${plist:+$plist,}$(sql_quote "$p")"
  done < <(viewer_projects "$GV_VIEWER_A_LOGIN")
  projects="${plist:-''}"
  sql=$(panel_sql "$GV_VIEWER_A_LOGIN" "$projects")

  for uid in ${uids//,/ }; do
    code=$(ds_body "$sql" "$uid" |
      scurl -o "$body" -w '%{http_code}' -b "$jar" -X POST -H 'Content-Type: application/json' -H "Origin: $origin" \
        --data-binary @- "$base/api/ds/query" || true)
    check "$name panel query via $uid 200 + frames" "$([ "$code" = 200 ] && jq -e '.results.A.frames' "$body" >/dev/null 2>&1 && echo 1 || echo 0)"
  done

  uid=${uids%%,*}
  code=$(ds_body "SELECT 'gvsmoke' AS c" "$uid" |
    scurl -o "$body" -w '%{http_code}' -b "$jar" -X POST -H 'Content-Type: application/json' -H "Origin: $origin" \
      --data-binary @- "$base/api/ds/query" || true)
  check "$name foreign query blocked 403" "$([ "$code" = 403 ] && [ "$(jq -r .messageId "$body" 2>/dev/null)" = querygate.blocked ] && ! grep -q gvsmoke "$body" && echo 1 || echo 0)"

  rm -f "$jar" "$body"
}

cmd_smoke() {
  need_tools
  smoke_topology staging "https://$STAGING_HOST/grafana" devlake-mysql
  local hdr
  hdr=$(scurl -o /dev/null -D - "https://$STAGING_HOST/grafana" | tr -d '\r' || true)
  # staging's nginx listens on plain HTTP behind TLS, so its absolute redirect says http://, as on staging.
  check "staging /grafana redirects 301 to /grafana/" \
    "$(printf '%s\n' "$hdr" | head -1 | grep -q ' 301' && printf '%s\n' "$hdr" | grep -qiE '^location: (https?://[^/]+)?/grafana/$' && echo 1 || echo 0)"
  smoke_topology prod "https://$PROD_HOST" "devlake-mysql,P430005175C4C7810"
  [ "$FAILS" -eq 0 ] || exit 1
}

cmd_suite() {
  local ts out rc
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  mkdir -p "$GV_WORK/results"
  out="$GV_WORK/results/go-$ts.txt"
  set +e
  (cd "$ROOT/grafana/query-gate" && go test -tags verify -count=1 -v ./verify/suite/ "$@") 2>&1 | tee "$out"
  rc=${PIPESTATUS[0]}
  set -e
  grep -E '^[[:space:]]*--- FAIL' "$out" || true
  grep -E '^(ok|FAIL)[[:space:]]' "$out" | tail -1 || true
  return "$rc"
}

cmd_outage() {
  local rc=0
  GV_PHASE=prepare-outage cmd_suite -run TestPrepareOutage || die "outage: preparing the session failed"
  dc stop gv-staging-grafana
  GV_PHASE=outage cmd_suite -run TestUpstreamDown || rc=$?
  dc start gv-staging-grafana
  GV_PHASE=recovered cmd_suite -run TestUpstreamRecovered || rc=$?
  if ! gapi GET "http://127.0.0.1:3013/grafana/api/users/lookup" -G --data-urlencode "loginOrEmail=$GV_VIEWER_A_LOGIN" >/dev/null 2>&1; then
    echo "warning: staging Grafana came back without the test users (empty DB); run: run.sh provision" >&2
  fi
  [ "$rc" -eq 0 ] || die "outage: a step failed"
}

cmd_browser() {
  local ts rc
  command -v node >/dev/null 2>&1 || die "node is required for the browser run"
  ts=$(date -u +%Y%m%dT%H%M%SZ)
  mkdir -p "$GV_WORK/results"
  set +e
  GV_TS="$ts" NODE_PATH=config-ui/node_modules node grafana/query-gate/verify/browser/render.cjs "$@" 2>&1 | tee "$GV_WORK/results/browser-$ts.txt"
  rc=${PIPESTATUS[0]}
  set -e
  return "$rc"
}

all_step() {
  local name=$1
  shift
  echo "== all: $name"
  "$@" || die "all: step '$name' failed"
}

cmd_all() {
  local early late
  all_step up cmd_up
  all_step smoke cmd_smoke
  all_step "suite (enforce)" cmd_suite
  all_step outage cmd_outage
  # Switching modes recreates the gates, which drops their logs, so snapshot the enforce-run logs first.
  early=$(cmd_logs | paste -sd, -)
  all_step "mode report" cmd_mode report
  GV_EXPECT_MODE=report all_step "suite (report)" cmd_suite -run 'TestReportMode|TestHealthEndpoints'
  all_step "mode off" cmd_mode off
  GV_EXPECT_MODE=off all_step "suite (off)" cmd_suite -run 'TestOffMode|TestHealthEndpoints'
  all_step "mode enforce" cmd_mode enforce
  late=$(cmd_logs | paste -sd, -)
  GV_LOGS="$early,$late" all_step "suite (logs)" cmd_suite -run TestGateLogsAreClean
}

main() {
  local cmd=${1:-}
  case "$cmd" in
    up | down | mode | provision | smoke | logs | suite | outage | browser | all) ;;
    *) die "usage: run.sh <up|down|mode MODE|provision|smoke|logs|suite [go test args]|outage|browser [options]|all>" ;;
  esac
  need_tools
  init_work
  case "$cmd" in
    up) cmd_up ;;
    down) cmd_down ;;
    mode) cmd_mode "${2:-}" ;;
    provision) provision ;;
    smoke) cmd_smoke ;;
    logs) cmd_logs ;;
    suite) shift && cmd_suite "$@" ;;
    outage) cmd_outage ;;
    browser) shift && cmd_browser "$@" ;;
    all) cmd_all ;;
  esac
}

main "$@"
