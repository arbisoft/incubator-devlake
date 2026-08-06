<!--
Licensed to the Apache Software Foundation (ASF) under one or more
contributor license agreements. See the NOTICE file distributed with
this work for additional information regarding copyright ownership.
The ASF licenses this file to You under the Apache License, Version 2.0
(the "License"); you may not use this file except in compliance with
the License. You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

# DevLake staging deployment

Single-VM Docker Compose deployment for `https://aperture.arbisoft.com`, sized
for **4 vCPU / 8 GB**.

## Architecture

TLS terminates on an **upstream** nginx outside this stack, which forwards to
port 80 on this VM. Everything else is internal to the `backend` network.

```mermaid
flowchart LR
    browser[Browser] -->|https| upstream[Upstream nginx<br/>TLS termination]
    upstream -->|"http :80"| edge[nginx<br/>devlake-nginx]

    edge -->|"location /"| oauth[oauth2-proxy]
    oauth -->|upstream| ui[config-ui]

    edge -->|"location /api/<br/>auth_request"| api[devlake]
    edge -->|"location /grafana/<br/>auth_request"| graf[grafana]

    edge -.->|"auth_request<br/>/oauth2/auth"| oauth

    api --> db[(mysql)]
    graf -->|grafana_ro| db
```

Both `/api/` and `/grafana/` are gated by nginx's `auth_request` against
oauth2-proxy. This matters: DevLake's own API-key middleware only guards paths
under `/rest` and `AUTH_ENABLED` defaults to `false`, so that gate is the only
thing in front of the admin API. Grafana's login form is a second gate behind
the same check.

### The one deliberate exception: `/api/rest/`

`/api/rest/` **skips** the oauth2-proxy gate, because DevLake authenticates
those paths itself and their callers have no browser session. `RestAuthentication`
runs first in the middleware chain (`backend/server/api/api.go:111`) and
short-circuits every `/rest` path through `CheckAuthorizationHeader`, which
validates the Bearer API key, its expiry, and its allowed-path regex.

Gating it would silently break **incoming webhooks** and any CI automation that
uses an API key. If you tighten this, tighten it by issuing narrower API keys,
not by putting a browser-session gate in front of a machine endpoint.

## One-time host setup

Run these **before** the first `docker compose up`.

### 1. Verify the deployment directory

Images are built from this fork's source (`backend/`, `config-ui/`, `grafana/`),
so the host needs a **full clone**, not just `devops/staging/`. Expected layout:

```text
/opt/devlake/incubator-devlake/          # git clone of this fork
├── backend/
├── config-ui/
├── grafana/
└── devops/staging/                      # compose, nginx.conf, .env, …
```

Confirm it is there and yours:

```bash
ls -ld /opt/devlake/incubator-devlake/devops/staging
ls /opt/devlake/incubator-devlake/backend/Dockerfile \
   /opt/devlake/incubator-devlake/config-ui/Dockerfile \
   /opt/devlake/incubator-devlake/grafana/Dockerfile \
   /opt/devlake/incubator-devlake/devops/staging/Dockerfile.devlake
```

If the clone is missing:

```bash
sudo mkdir -p /opt/devlake && sudo chown "$USER": /opt/devlake
cd /opt/devlake
git clone <this-fork-url> incubator-devlake
cd incubator-devlake
git checkout <desired-branch-or-tag>
```

That `sudo mkdir` / `chown` is the only privileged command in this runbook —
everything below (checkout, `.env`, `docker compose`) runs unprivileged.
MySQL's scratch space needs no root either: it is a Docker named volume
(`devlake_staging_mysql_tmp`) mounted at `/tmp`, which Docker creates on the
first `up` with the image's own `1777` permissions.

> ⚠️ `/opt/devlake/` itself may still hold a separate live DevLake deployment
> owned by user `jawad`. Do not overwrite that tree. This stack lives only under
> `incubator-devlake/devops/staging/`.

### 2. Provision the environment file

```bash
cd /opt/devlake/incubator-devlake/devops/staging
cp env.staging.example .env
chmod 600 .env
$EDITOR .env    # fill in every REQUIRED value
# optional: bake the checkout into the lake binary
# GIT_SHA=$(git -C ../.. rev-parse --short HEAD)
```

Compose reads `.env` from the directory containing the compose file, so it must
sit beside `docker-compose-staging.yml` — moving the compose file without
moving `.env` silently breaks interpolation. Every required variable is guarded
with `${VAR:?}`, so a missing value aborts with a named error rather than a
half-started stack.

### 3. Register the OAuth redirect URI

Add exactly this to the Google OAuth web client's authorised redirect URIs:

```
https://aperture.arbisoft.com/oauth2/callback
```

It is pinned with `--redirect-url` rather than derived from forwarded headers,
because derivation silently produces an `http://` callback (which Google
rejects) whenever `X-Forwarded-Proto` is missing.

### 4. Confirm the upstream nginx behaviour

The upstream must:

- send `X-Forwarded-Proto: https` and a correct `Host`;
- **not** pass through client-supplied `X-Forwarded-User` / `X-Forwarded-Email`.
  DevLake trusts those headers verbatim for its audit identity. This stack
  blanks them at ingress, but the upstream should not be forwarding them either.

### 5. Check disk capacity

The benchmark environment measured ~11 GB of DevLake data across ~510 tables.
With binary logging disabled, budget **at least 40 GB free** on the Docker
volume root. The first image build also needs several GB of BuildKit cache
(Go toolchain, yarn, Grafana plugins) — budget headroom for that as well.

## Deploy

```bash
cd /opt/devlake/incubator-devlake/devops/staging
# first build is slow; later rebuilds reuse local BuildKit layers
# devlake uses Dockerfile.devlake (amd64-only); config-ui/grafana use their stock Dockerfiles
DOCKER_BUILDKIT=1 docker compose -f docker-compose-staging.yml build
docker compose -f docker-compose-staging.yml up -d
docker compose -f docker-compose-staging.yml ps
```

After pulling new commits in the clone, rebuild before `up`:

```bash
cd /opt/devlake/incubator-devlake
git pull
cd devops/staging
# optional: refresh GIT_SHA in .env
DOCKER_BUILDKIT=1 docker compose -f docker-compose-staging.yml build
docker compose -f docker-compose-staging.yml up -d
```

`docker compose pull` is **not** used for `devlake` / `config-ui` / `grafana` —
those are local builds tagged `arbisoft/devlake*`. It would only affect the
third-party images (`mysql`, `nginx`, `oauth2-proxy`).

### Migrating from an earlier revision of this stack

> **Read this before the first `up` on a VM that already runs DevLake.** Both
> volumes are now explicitly named, so neither reuses whatever the previous
> revision created. Nothing is deleted — the old volumes are *orphaned* and the
> new stack starts empty. Copy them across first if you need the data.

**Check for the existing deployment first.** The staging host already has a
DevLake stack at `/opt/devlake` (owned by user `jawad`, compose file last
modified Aug 3) while this one deploys from
`/opt/devlake/incubator-devlake/devops/staging`. It publishes port 80, which
this stack's nginx also binds, so the new stack cannot start until the old one
is stopped. Confirm what is running and who owns it before touching anything —
whoever depends on that deployment should agree to the cutover:

```bash
docker compose ls
docker ps --format '{{.Names}}\t{{.Ports}}'
ls -la /opt/devlake
```

**`mysql_data` — this is the one that matters.** It previously had no `name:`,
so Compose derived a project-prefixed name from whichever directory the compose
file was invoked in (`incubator-devlake_mysql_data` when it lived at the repo
root). It is now `devlake_staging_mysql_data`. Starting the new stack against an
empty volume means MySQL initialises a fresh database and every collected
connection, blueprint and pipeline appears to be gone — the old data is still on
disk, just unreferenced.

Find the existing volume and copy it before the first `up`:

```bash
docker volume ls | grep -i mysql

# Stop the old stack first: copying a live MySQL data directory yields a
# corrupt one.
docker compose -f <old-compose-file> down

docker volume create devlake_staging_mysql_data
docker run --rm -v <old-volume-name>:/from -v devlake_staging_mysql_data:/to \
  alpine sh -c 'cd /from && cp -a . /to'
```

Note that `mysql/initdb/01-grafana-ro.sh` only runs on a *fresh* data
directory. If you copy an existing volume across, create the read-only Grafana
account by hand:

```sql
CREATE USER 'grafana_ro'@'%' IDENTIFIED BY '<GRAFANA_DB_PASSWORD>';
GRANT SELECT ON `devlake`.* TO 'grafana_ro'@'%';
```

**`grafana_data`** used to be declared `external: true` and is now a managed
volume named `devlake_staging_grafana_data`. Lower stakes: dashboards and
datasources are provisioned from the image and come back automatically, so only
manually created users, API keys, and starred dashboards are lost.

```bash
docker volume create devlake_staging_grafana_data
docker run --rm -v grafana_data:/from -v devlake_staging_grafana_data:/to \
  alpine sh -c 'cd /from && cp -a . /to'
```

## Verify

Pre-flight, before deploying:

```bash
docker compose -f docker-compose-staging.yml config --quiet
docker run --rm -v "$PWD/nginx.conf:/etc/nginx/nginx.conf:ro" nginx:stable nginx -t
```

After deploying, confirm the auth gates actually hold. `/grafana/` must return a
302 to `/oauth2/start` and `/api/connections` must return 401 — **a 200 from
either means the gate is open**:

```bash
curl -si https://aperture.arbisoft.com/grafana/          | head -n 1  # expect 302
curl -si https://aperture.arbisoft.com/api/connections   | head -n 1  # expect 401
```

Confirm the API-key path is still reachable but still authenticated. It must
return 401 from DevLake itself (body `{"success":false,"message":"token is
missing"}`), **not** a redirect to `/oauth2/start` — a redirect means the
carve-out above broke and webhooks are dead:

```bash
curl -si https://aperture.arbisoft.com/api/rest/plugins | head -n 1
```

Confirm the DevLake API is not reachable directly on the VM:

```bash
curl -s -m 3 http://<vm-ip>:8080/ping   # must fail to connect
```

Confirm the Grafana datasource is using the read-only account, and that the
query governor is live once dashboards have been used:

```bash
docker compose -f docker-compose-staging.yml exec mysql \
  mysql -uroot -p -e "SHOW GRANTS FOR 'grafana_ro'@'%';"

docker compose -f docker-compose-staging.yml exec mysql \
  mysql -uroot -p -e "SHOW GLOBAL STATUS LIKE 'Max_execution_time_set';"
```

A `Max_execution_time_set` that stays at zero while Grafana is actively
querying means the governor is not matching the account name — see the coupled
literal warning in [mysql/devlake.cnf](mysql/devlake.cnf).

## Layout

| File | Purpose |
| --- | --- |
| `docker-compose-staging.yml` | Service definitions |
| `nginx.conf` | Edge routing and the `auth_request` gates |
| `allowed-emails.txt` | oauth2-proxy allowlist, one lowercase address per line |
| `mysql/devlake.cnf` | MySQL tuning, sized for a 3 GiB container |
| `mysql/initdb/01-grafana-ro.sh` | Creates the read-only Grafana account |
| `env.staging.example` | Template for `.env` |

## Memory budget

MySQL is capped at `mem_limit: 3g` because it shares the VM:

| Component | Budget |
| --- | --- |
| OS + Docker daemon | ~0.7 GB |
| devlake (ETL) | ~2.0 GB |
| grafana | ~0.5 GB |
| config-ui + oauth2-proxy + nginx | ~0.25 GB |
| **mysql** | **~3.0 GB** |

The 1.5 GiB InnoDB buffer pool is a literal, not a formula, and must stay a
multiple of 512M (`chunk_size 128M x instances 4`) or MySQL silently rounds it
up. Rationale for every value is in [mysql/devlake.cnf](mysql/devlake.cnf).

## Health check coverage

Only three services have healthchecks, and the omissions are deliberate: a probe
that can never pass is worse than no probe, because `depends_on:
condition: service_healthy` would block everything behind it forever.

| Service | Probe | Why |
| --- | --- | --- |
| `mysql` | `mysqladmin ping` | Shipped in the image |
| `devlake` | `curl /ping` | `curl` installed at `backend/Dockerfile:123` |
| `grafana` | `wget /api/health` | `grafana/grafana:11.6.2` is Alpine, so busybox `wget` exists |
| `config-ui` | none | Built on `nginxinc/nginx-unprivileged`, installs only `apache2-utils` and `iproute2` — no HTTP client |
| `oauth2-proxy` | none | v7 images are distroless: no shell, no HTTP client |
| `nginx` | none | No `curl`/`wget`, and no `service` command |

The three uncovered services are all reachable through nginx, so monitor them
from the upstream nginx or an external prober — which is also the only vantage
point that sees the whole request path. If you confirm a client binary exists in
one of those images, add the probe and tighten the corresponding `depends_on`
back to `service_healthy`.

## Known gaps

Deliberate, and tracked rather than fixed here:

- **First build is heavy.** Staging uses `Dockerfile.devlake` (amd64-only
  override of `backend/Dockerfile`) so the build does not need QEMU for the
  upstream arm64 stage. It still compiles libgit2 and the full Go plugin set;
  `config-ui` runs yarn; `grafana` installs plugins. Expect a long first
  `compose build` on a 4 vCPU / 8 GB VM. Subsequent builds reuse local
  BuildKit layers. The CI workflow in `build-and-push.yml` splits
  `builder` / `base` / `build` stages across ECR for ephemeral runners — that
  split is unnecessary on this long-lived host.
- **Docker bridge has no outbound HTTP.** On this host, containers on the
  default bridge time out reaching `deb.debian.org:80`, while `--network=host`
  works. Compose sets `build.network: host` for `devlake` / `config-ui` /
  `grafana` so apt/yarn succeed. Fixing `ip_forward` / iptables / UFW so the
  bridge can egress is still the proper host fix; until then, any other
  container that needs apt on the bridge will fail the same way.
- **No backups.** With `--skip-log-bin` there is no point-in-time recovery, so
  a nightly `mysqldump` plus a *tested* restore is the entire recovery story.
- **No resource limits on `devlake`.** A large collection run can consume
  several GB; with no cap the kernel picks the OOM victim, often MySQL.
- **`AUTH_ENABLED=false`.** nginx's `auth_request` is the sole control in front
  of the DevLake API. Enabling DevLake's own OIDC support would make it
  defence-in-depth and give real per-user identity.
- **MySQL spill is isolated, not bounded by a separate filesystem.** The
  `devlake_staging_mysql_tmp` volume keeps scratch writes out of the container
  writable layer and makes them measurable (`docker system df -v`), but it
  lives under `/var/lib/docker/volumes` — on a single-disk VM there is no hard
  disk-full guarantee. The real bounds are the settings in
  [mysql/devlake.cnf](mysql/devlake.cnf) (`temptable_max_mmap = 0`, the 4G cap
  on `innodb_temp_data_file_path`, and the 30s `init_connect` governor on the
  Grafana account). If those prove insufficient, point the volume at a
  dedicated disk with `driver_opts` — no service definition changes.
