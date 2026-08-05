# Telemetry & Observability

This directory contains the OpenTelemetry Collector and Prometheus configuration used to ingest Claude Code metrics. The Collector receives authenticated OTLP metrics and exposes them for Prometheus to scrape.

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
                                                   +--> Prometheus exporter :8889
                                                                |
Prometheus <---------- scrape every 15 seconds -----------------+
```

The Collector uses the `basicauth/server` extension with an `htpasswd` file. DevLake generates a high-entropy username and password, stores only the password hash in the shared auth volume, and shows the complete Claude Code settings once. The plaintext password and the encoded `Authorization` header are not persisted by DevLake.

Each credential username embeds an immutable team slug. After Basic Auth succeeds, the Collector derives and stamps the trusted `devlake_team` metric attribute from that username. A client-supplied `devlake_team` attribute is removed first, so it cannot spoof team attribution.

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

`otel-auth-init` creates an empty `.htpasswd` file in the named `devlake-otel-auth` volume before the Collector starts. DevLake mounts the same volume read-write; the Collector mounts it read-only. Do not run `docker compose down -v` unless deliberately resetting local OTel credentials and Prometheus data.

The local Compose default helper token is for local development only. Set an explicit high-entropy `OTEL_RESTART_HELPER_TOKEN` before starting the stack when validating backend-to-helper authentication.

## Claude Code Configuration

Create a Claude Code OTel connection through the DevLake Config UI. The one-time generated settings are the configuration an Enterprise or Team plan administrator pastes into Claude Code managed settings. They include values equivalent to:

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "none",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "grpc",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "https://otel.customer.example.com:4317",
    "OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Basic <base64(username:password)>",
    "OTEL_METRIC_EXPORT_INTERVAL": "60000",
    "OTEL_METRICS_INCLUDE_SESSION_ID": "false",
    "OTEL_METRICS_INCLUDE_ACCOUNT_UUID": "true"
  }
}
```

The generated endpoint must be HTTPS in a real deployment. Basic Auth only encodes credentials; TLS provides transport confidentiality. Do not send customer credentials to an `http://` endpoint.

For a local mock sender, use OTLP/HTTP against `http://localhost:4318/v1/metrics` and pass the generated Basic Auth header. This is a transport-level test and is separate from the managed Claude Code configuration above.

## Credential Lifecycle

- **Create:** generates one team-scoped credential, writes its verifier to `.htpasswd`, and restarts the Collector.
- **Rotate:** adds a second credential for the same team while the old one remains valid. Update managed settings with the new one, then finalize the rotation to remove the old credential.
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

### Reset local telemetry state

This removes local credentials and Prometheus data:

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
