# Telemetry & Observability

This directory contains the OpenTelemetry Collector and Prometheus configuration used to
ingest Claude Code metrics. The Collector also durably forwards authenticated OTLP metric
batches to the DevLake Claude OTel ingest endpoint.

## Directory Structure

```text
telemetry/
└── otel-collector/
    ├── docker-compose.yml                # Local development stack
    ├── docker-compose-production.yml     # Single-host production-shaped stack
    ├── collector-config.yaml             # Local Collector pipeline
    ├── collector-config-production.yaml  # Production Collector pipeline
    ├── prometheus.yml                    # Prometheus scrape configuration
    ├── restart-helper/                   # Narrow Collector restart service
    └── README-PRODUCTION.md              # Production Compose operations
```

## Architecture

```text
Claude Code
  -- OTLP/gRPC or OTLP/HTTP with Basic Auth --> OTel Collector
                                                   |
                                                   +--> persistent file-storage queue --> DevLake raw ingestion
                                                   |
                                                   +--> Prometheus exporter :8889
                                                                |
Prometheus <---------- scrape every 15 seconds -----------------+
```

The Collector uses the `basicauth/server` extension with an `htpasswd` file. DevLake generates a high-entropy username and password, stores only the password hash in the shared auth volume, and shows the complete Claude Code settings once. The plaintext password and the encoded `Authorization` header are not persisted by DevLake.

Each credential username embeds an immutable team slug. After Basic Auth succeeds, the
Collector derives and stamps the trusted `devlake_team` metric attribute from that
username. Client-supplied `devlake_team` and `devlake_project` attributes are removed
first, so they cannot spoof attribution.

The Collector version pinned here does not hot-reload server-side `htpasswd.file` updates. After DevLake creates, rotates, revokes, or finalizes a credential, it requests a restart from `otel-restart-helper`. The helper has Docker socket access; the DevLake backend does not. Its API accepts only an authenticated request to restart the configured Collector, never a caller-provided Docker command or container name.

## Local Development

Start the local stack:

```bash
cd telemetry/otel-collector
docker compose up -d --build
docker compose ps
```

Endpoints exposed on the local machine:

| Service | Address | Purpose |
| --- | --- | --- |
| OTLP/gRPC | `localhost:4317` | Claude Code telemetry ingestion |
| OTLP/HTTP | `localhost:4318` | Mock and HTTP telemetry ingestion |
| Collector metrics | `localhost:8889` | Prometheus scrape endpoint |
| Prometheus | `http://localhost:9090` | Metrics query UI and API |
| Restart helper | `http://127.0.0.1:9199` | Backend-only restart service |
| Collector health | `http://localhost:13133/healthz` | Collector health check |

`otel-auth-init` creates an empty `.htpasswd` file in the named `devlake-otel-auth`
volume before the Collector starts. DevLake mounts the same volume read-write; the
Collector mounts it read-only. `otel-queue-init` grants the Collector's non-root UID
access to `devlake-otel-queue`, which holds retryable outbound batches. Do not run
`docker compose down -v` unless deliberately resetting local credentials, Prometheus
data, and queued telemetry.

The local Compose default helper token is for local development only. Set an explicit high-entropy `OTEL_RESTART_HELPER_TOKEN` before starting the stack when validating backend-to-helper authentication.

## Claude Code Configuration

Create a Claude Code OTel connection through the DevLake Config UI. The one-time generated settings are the configuration an Enterprise or Team plan administrator pastes into Claude Code managed settings. They include values equivalent to:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "grpc",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "https://otel.customer.example.com:4317",
    "OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Basic <base64(username:password)>",
    "OTEL_METRIC_EXPORT_INTERVAL": "60000",
    "OTEL_METRICS_INCLUDE_SESSION_ID": "true",
    "OTEL_METRICS_INCLUDE_ACCOUNT_UUID": "true",
    "OTEL_METRICS_INCLUDE_REPOSITORY": "true",
    "OTEL_LOG_TOOL_DETAILS": "1",
    "OTEL_LOG_USER_PROMPTS": "1",
    "OTEL_LOG_ASSISTANT_RESPONSES": "0",
    "OTEL_LOG_TOOL_CONTENT": "0",
    "OTEL_LOG_RAW_API_BODIES": "0"
  }
}
```

Claude Code sends metrics and log events. Events (prompts, API requests, tool results, skill activations, permission mode changes and others) are stored per event in `_tool_claude_code_otel_events` and rolled up into `ai_prompts`, `ai_prompt_skills`, `ai_prompt_failures` and `ai_permission_mode_changes`. `OTEL_LOG_TOOL_DETAILS=1` makes Claude Code send skill, MCP, plugin and command names and tool parameters. DevLake keeps only `skill_name`, `mcp_server_name` and `mcp_tool_name` from `tool_parameters` and drops the rest at ingest, including Bash command lines and file paths.

Prompt text is stored only in the raw log batches and in `_tool_claude_code_otel_events.prompt_text`, and is cleared from events after 90 days, when the raw batches are deleted. It is never written to `ai_*` tables. Responses, tool input and raw API bodies are never stored: managed settings keep those gates off, the Collector deletes the attributes, and DevLake deletes them again at ingest. Session ids are stored on events but removed from Prometheus labels.

Each prompt records the repository it ran in as `ai_prompts.repository_url`, from the `vcs.repository.url.full` attribute that `OTEL_METRICS_INCLUDE_REPOSITORY` adds (Claude Code v2.1.269+). It is the session's `origin` remote. DevLake normalizes it at ingest rather than relying on the client: it drops any credentials, query and fragment, removes a trailing `/` and `.git`, rewrites SSH and scp-like remotes (`git@github.com:org/repo.git`) as `https://github.com/org/repo`, and lowercases the result. A value that is not a remote URL, or that names a loopback host such as `localhost`, is blanked. It is NULL when the session has no `origin` remote, when the URL is longer than 255 characters, or for older clients. The Collector removes the `vcs.*` attributes before Prometheus. To find a prompt's DevLake project, join it to `repos` and `project_mapping`. Compare against `LOWER(repos.url)`, because DevLake keeps the URL's case and the tables use a case-sensitive collation. A repository can belong to more than one project:

```sql
SELECT p.prompt_id, p.repository_url, pm.project_name
FROM ai_prompts p
LEFT JOIN repos r ON LOWER(r.url) = p.repository_url
LEFT JOIN project_mapping pm ON pm.`table` = 'repos' AND pm.row_id = r.id;
```

Each prompt records its reasoning effort level (such as `low`, `medium`, `high`, `xhigh` or `max`) as `ai_prompts.effort`, from the `effort` attribute Claude Code sends on `api_request` events; events keep it in `_tool_claude_code_otel_events.attributes`. The prompt takes the effort of its first main conversation request that reports one (`query_source` `repl_main_thread`); later main-thread requests do not change it. Until one arrives, it takes the first effort any request reported, such as a background session-title request. It is NULL when no request reported one, for example for local slash commands and older clients. Prompts converted before the column existed are filled by a [log replay](#rebuild-mysql-facts-after-remediation), because the raw batches keep the attribute: insert a request with `kind = 'logs'` for the days to fill. Each request covers at most 31 days, and raw batches are kept for 90 days, so older prompts keep a NULL effort.

`ai_prompts.api_error_count` and `tool_failure_count` count a prompt's failures, and `ai_prompt_failures` records why each one happened: one row per `api_error` event and per `tool_result` with `success=false`, joined to its prompt by `ai_prompt_failures.ai_prompt_id = ai_prompts.id`. `failure_kind` is `api_error` or `tool_error`. Both kinds record `occurred_at`, `error_type` and `duration_ms`. An API error row also keeps the service's `error_message` (up to 1,024 characters), `status_code`, `attempt`, `model` and `query_source`. A tool error row also keeps `tool_name`, but never an `error_message`: a tool's error message can echo file contents, so the Collector and ingest delete it and DevLake never sees it. Prompts converted before the table existed get their failure rows from the same [log replay](#rebuild-mysql-facts-after-remediation), within the same 31-day and 90-day limits; older prompts have none.

Claude Code reports only permission mode changes, not the mode a session starts in. A prompt before a session's first change takes that change's `from_mode`. Prompts in a session with no change are recorded as `default` with `permission_mode_inferred` set.

### Settings options

Before copying the settings, the admin chooses what this team sends. The defaults reproduce the block above. Each option that is turned off changes one value:

| Option | When off |
| --- | --- |
| Metrics | `OTEL_METRICS_EXPORTER=none`, and `OTEL_METRIC_EXPORT_INTERVAL` is left out |
| Events | `OTEL_LOGS_EXPORTER=none`, and its three options below are written off too |
| Prompt text (under Events) | `OTEL_LOG_USER_PROMPTS=0`. Prompts are still counted, without their text |
| Skill and MCP names (under Events) | `OTEL_LOG_TOOL_DETAILS=0` |
| Repository (under Events) | `OTEL_METRICS_INCLUDE_REPOSITORY=false`. `ai_prompts.repository_url` stays NULL |

At least one of Metrics and Events stays on. Session and account ids are always included, and the response, tool content and raw API body gates are always off. The choices are not stored: they apply only to the copied settings.

The generated endpoint must be HTTPS in a real deployment. Basic Auth only encodes credentials; TLS provides transport confidentiality. Do not send customer credentials to an `http://` endpoint.

For a local mock sender, use OTLP/HTTP against `http://localhost:4318/v1/metrics` and pass the generated Basic Auth header. This is a transport-level test and is separate from the managed Claude Code configuration above.

## Credential Lifecycle

- **Create:** generates one team-scoped credential, writes its verifier to `.htpasswd`, and restarts the Collector.
- **Rotate:** adds a second credential for the same team while the old one remains valid. Update managed settings with the new one, then finalize the rotation to remove the old credential. The settings options aren't remembered, so re-apply the team's previous choices before copying.
- **Revoke:** removes all active and retiring verifiers for that connection and restarts the Collector.
- **Apply:** retries the Collector restart when the desired auth file was written but the helper did not confirm the restart.

Multiple team connections can exist in one DevLake deployment. The auth file is rebuilt from every active and retiring credential, preventing changes to one team from removing another team's verifier.

## Verification

```bash
cd telemetry/otel-collector

# Services and logs
docker compose ps
docker compose logs -f otel-collector
docker compose logs -f otel-restart-helper
docker compose logs -f prometheus

# Health and exported metrics
curl -i http://localhost:13133/healthz
curl -i http://127.0.0.1:9199/health
curl http://localhost:8889/metrics | grep claude_code
```

Open `http://localhost:9090` and use PromQL to verify incoming data:

```promql
up{job="otel-collector"}
claude_code_session_count_total
sum by (devlake_team, user_email) (claude_code_session_count_total)
```

Prometheus scrapes the Collector every 15 seconds. A metric accepted immediately after a scrape may not appear in Prometheus until the next scrape.

## Durable Queue Storage

The file-storage extension persists retryable outbound batches in
`devlake-otel-queue`. It is transport durability, not the analytical source of truth:
DevLake returns success only after committing the accepted batch to MySQL raw storage.
The queue is bounded to 512 MiB with a 1 GiB file-storage ceiling, fsync enabled, one
consumer, and indefinite retry. The queue rejects new batches when full
(`block_on_overflow: false`) because blocking is exposed to a known persistent-queue
deadlock in the pinned Collector. Alert before capacity is reached; Prometheus scrapes
the Collector's internal metrics as job `otel-collector-internal`:

```promql
otelcol_exporter_queue_size{exporter="otlphttp/claude_raw"}
  / otelcol_exporter_queue_capacity{exporter="otlphttp/claude_raw"} > 0.5
increase(otelcol_exporter_enqueue_failed_metric_points{exporter="otlphttp/claude_raw"}[5m]) > 0
increase(otelcol_exporter_send_failed_metric_points{exporter="otlphttp/claude_raw"}[5m]) > 0
```

An enqueue failure is data loss for the raw branch; the Prometheus branch is unaffected.
The failure counters are created on their first failure, so `increase()` misses that
first failure; an alert should also fire on a new series (`series unless series offset 10m`).

```bash
docker run --rm -v devlake-otel-queue:/data:ro busybox:1.36 \
  sh -c 'du -sh /data && ls -lh /data'
```

The bbolt file can retain allocated disk after the queue drains; rebound compaction
reclaims space eventually. Keep the queue private to the Docker host. The retired
`devlake-otel-file-export` volume remains in Compose during the initial rollout and is
not used by the current Collector configuration.

## Troubleshooting

### The Collector rejects telemetry

1. Verify that the endpoint and protocol match the generated settings.
2. Confirm `OTEL_EXPORTER_OTLP_HEADERS` contains `Authorization=Basic <value>`.
3. Check the Collector logs: `docker compose logs otel-collector`.
4. Confirm the connection is active in Config UI. A revoked credential is rejected after the Collector restart.

### A credential action needs Apply

The auth file was updated, but the restart helper could not confirm a Collector restart. Check both services:

```bash
docker compose logs otel-restart-helper
docker compose logs otel-collector
```

After the Collector is healthy, use Apply in Config UI to retry the restart. If the auth volume is lost or inconsistent, revoke the affected connection and create a new one.

### Prometheus has no Claude Code metrics

1. Open `http://localhost:9090/targets`; the `otel-collector` target must be up.
2. Check the Collector export endpoint: `curl http://localhost:8889/metrics`.
3. Check whether the Collector accepted metrics in its logs.
4. Allow one scrape interval before querying Prometheus.

### MySQL raw backlog grows

1. Confirm the Collector and Lake are healthy, then inspect Collector exporter metrics
   for queue size, enqueue failures, and export failures.
2. Inspect `_raw_otel_claude_code_metric_batches` by `status`, `received_at`, and
   `processing_error_code`. Do not log or export `payload_proto` or `payload_json`.
3. A `permanent_error` is malformed or unsupported telemetry and requires remediation;
   a `retryable_error` indicates downstream recovery/retry work. Conversion is strictly
   ordered, so a retrying head batch delays later batches; it is quarantined as
   `retry_exhausted` after 12 attempts. A `processed` batch with
   `processing_error_code = 'resources_skipped'` converted every team except those listed
   in `processing_error_message`.

```sql
-- Backlog and age of the oldest unconverted batch
SELECT status, COUNT(*) AS batches, MIN(received_at) AS oldest_received_at
FROM _raw_otel_claude_code_metric_batches
WHERE status IN ('pending', 'processing', 'retryable_error')
GROUP BY status;

-- Recent quarantined or partially skipped batches
SELECT id, received_at, status, attempt_count, processing_error_code, processing_error_message
FROM _raw_otel_claude_code_metric_batches
WHERE status = 'permanent_error' OR processing_error_code = 'resources_skipped'
ORDER BY id DESC
LIMIT 20;
```

Terminal raw batches are retained for 90 days, then deleted in bounded batches.

### Rebuild MySQL facts after remediation

After fixing the cause of skipped or quarantined telemetry (for example a missing
connection), rebuild whole UTC days from retained raw batches. Replay is operator-only:
insert a request, and the elected converter rebuilds hourly facts and canonical daily
rows for that range in one transaction. A range may cover up to 31 days.

```sql
INSERT INTO _tool_claude_code_otel_replay_requests (range_start, range_end, status, created_at, updated_at)
VALUES ('2026-09-01 00:00:00', '2026-09-03 00:00:00', 'pending', UTC_TIMESTAMP(), UTC_TIMESTAMP());

SELECT id, status, replayed_batches, skipped_batches, error_message, completed_at
FROM _tool_claude_code_otel_replay_requests
ORDER BY id DESC;
```

Replay currently supports Claude Code's default DELTA exports and does not change live
series state. A range containing CUMULATIVE telemetry is rejected until a durable
predecessor-checkpoint design is added; rebuilding it from an arbitrary lookback can
misstate the first increase. Resetting a single batch to `pending` is not a replay:
cumulative samples older than live state are rejected as out of order.

To convert log events again, insert a request with `kind = 'logs'`. It requeues the
processed and quarantined log batches received in the range, which may include the
current UTC day, as `replay_pending`. The log queue converts them only while no live
batch is waiting, so a large replay does not delay new events. A replayed batch keeps
`replay_pending` while it is converted and while it waits to retry, so a replayed batch
that fails again never blocks live batches or counts as live backlog. It is quarantined
after the usual retry budget and then counts as a recent permanent error, even when it
converted before the replay. The ingestion status reports
replayed batches under `logs.batchCounts.replay_pending`.

```sql
INSERT INTO _tool_claude_code_otel_replay_requests (kind, range_start, range_end, status, created_at, updated_at)
VALUES ('logs', '2026-09-01 00:00:00', '2026-09-03 00:00:00', 'pending', UTC_TIMESTAMP(), UTC_TIMESTAMP());
```

### Reset local telemetry state

This removes local credentials, Prometheus data, and queued telemetry:

```bash
cd telemetry/otel-collector
docker compose down -v
docker compose up -d --build
```

## Production Deployment Boundary

`docker-compose-production.yml` is suitable for a single-host Compose deployment and is documented in [otel-collector/README-PRODUCTION.md](otel-collector/README-PRODUCTION.md).

The production Kubernetes deployment must not mount a Docker socket. Replace `otel-restart-helper` with a deployment-owned rollout mechanism or narrowly scoped Kubernetes service account that can restart only the Collector workload. TLS termination, public exposure of OTLP/gRPC, ingress rate limits, secret injection, and persistent storage are deployment responsibilities.

## Additional Resources

- [OpenTelemetry Collector documentation](https://opentelemetry.io/docs/collector/)
- [Prometheus documentation](https://prometheus.io/docs/)
- [DevLake documentation](https://devlake.apache.org/docs/)
