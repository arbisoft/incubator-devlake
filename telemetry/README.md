# Telemetry & Observability

`otel-collector/` receives Claude Code OTLP telemetry and exposes it to Prometheus. Both the local and production-shaped Compose files require Basic Auth on OTLP gRPC (`4317`) and HTTP (`4318`).

## Local Stack

```bash
cd telemetry/otel-collector
docker compose up -d --build
docker compose logs -f otel-collector
```

Services:

- Collector OTLP gRPC: `localhost:4317`
- Collector OTLP HTTP: `localhost:4318`
- Collector Prometheus exporter: `localhost:8889`
- Prometheus: `http://localhost:9090`
- Restart helper health: `http://127.0.0.1:9199/health`

`otel-auth-init` creates the shared `.htpasswd` file before the collector starts. DevLake writes it and the collector mounts it read-only. Do not delete the named `devlake-otel-auth` volume unless deliberately resetting all local OTel credentials.

## Claude Code Configuration

Create a connection through the DevLake Config UI. The one-time settings output includes the required static `Authorization: Basic ...` value. Use that generated JSON as the managed Claude Code configuration.

Production settings always use:

```text
OTEL_EXPORTER_OTLP_PROTOCOL=grpc
OTEL_EXPORTER_OTLP_ENDPOINT=https://<customer-telemetry-host>:4317
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64(username:password)>
```

Basic authentication is not encryption. The public collector endpoint must terminate TLS before it forwards OTLP/gRPC to the collector. Do not use an `http://` endpoint for a customer credential.

For local mock testing, send OTLP/HTTP directly to `http://localhost:4318` with the generated Basic Auth header. This direct mock call is separate from the production settings snippet.

## Verification

```bash
curl -i http://127.0.0.1:9199/health
curl http://localhost:8889/metrics | grep claude_code
```

Open `http://localhost:9090` and query:

```promql
claude_code_session_count_total
claude_code_cost_usage_USD_total
claude_code_token_usage_tokens_total
```

For full lifecycle, rotation, revoke, and GitOps instructions, see [../devlake/docs/full-otel-connector-test.md](../../devlake/docs/full-otel-connector-test.md).
