# OTel Collector Production Compose Guide

This directory provides a production-shaped, single-host Docker Compose deployment for one DevLake telemetry stack. It is not a Kubernetes deployment manifest.

## Components

| Service | Purpose |
| --- | --- |
| `otel-auth-init` | Creates the shared `.htpasswd` file before the Collector starts. |
| `otel-collector` | Authenticates OTLP traffic, derives the trusted team label, and exposes Prometheus metrics. |
| `prometheus` | Scrapes the Collector every 15 seconds and retains data for 30 days. |
| `otel-restart-helper` | Accepts only an authenticated backend request and restarts the configured Collector. |

DevLake writes the `htpasswd` file through a shared volume. The Collector mounts that volume read-only. Because the pinned Basic Auth extension does not hot-reload server-side `htpasswd.file` updates, the helper restarts the Collector after a credential lifecycle change.

## Prerequisites

- Docker Engine and Docker Compose.
- A TLS-capable reverse proxy for the public OTLP/gRPC endpoint.
- A high-entropy `OTEL_RESTART_HELPER_TOKEN` injected into both the DevLake backend and `otel-restart-helper`. Do not inject it into Config UI.
- A public HTTPS collector URL configured for the DevLake backend as `OTEL_PUBLIC_ENDPOINT`, for example `https://otel.customer.example.com:4317`.

The restart helper has Docker socket access and must remain private to the host. It is bound to `127.0.0.1:9199` by default. The public proxy must expose only the required OTLP ports and must not expose Prometheus or the helper.

## Start

```bash
cd telemetry/otel-collector
export OTEL_RESTART_HELPER_TOKEN='<high-entropy-secret>'
docker compose -f docker-compose-production.yml up -d --build
docker compose -f docker-compose-production.yml ps
```

The Compose file requires the helper token and will fail early when it is unset. `OTEL_PUBLIC_ENDPOINT` is not read by this Compose file; configure it in the DevLake backend deployment.

## Network and TLS

The collector exposes:

| Port | Exposure | Purpose |
| --- | --- | --- |
| `4317` | Public through TLS proxy | OTLP/gRPC from Claude Code |
| `4318` | Public only if OTLP/HTTP is required | OTLP/HTTP ingestion |
| `8889` | Host loopback | Prometheus scrape endpoint |
| `9090` | Host loopback | Prometheus UI and API |
| `9199` | Host loopback | Restart helper API |

Terminate TLS before forwarding OTLP/gRPC traffic to `4317`. Basic Auth credentials are Base64 encoded, not encrypted. Apply request-size and rate limits at the proxy or ingress. Keep Prometheus internal; expose it only through authenticated operational access if needed.

## Verify

```bash
curl -i http://127.0.0.1:9199/health
curl -i http://127.0.0.1:9090/-/healthy
curl -i http://127.0.0.1:8889/metrics

docker compose -f docker-compose-production.yml logs -f otel-collector
docker compose -f docker-compose-production.yml logs -f otel-restart-helper
docker compose -f docker-compose-production.yml logs -f prometheus
```

Prometheus targets are available at `http://127.0.0.1:9090/targets` from the host. Confirm that `otel-collector` is up.

## Resource Settings

The Compose configuration sets the following resource limits:

| Component | CPU limit | Memory limit | CPU reservation | Memory reservation |
| --- | ---: | ---: | ---: | ---: |
| Collector | 2 | 1 GiB | 1 | 512 MiB |
| Prometheus | 2 | 2 GiB | 1 | 1 GiB |

The production Collector enables a memory limiter, delta-to-cumulative conversion, and a larger batch configuration. Prometheus retains data for 30 days. Adjust these only after observing metric volume, label cardinality, query patterns, and host capacity.

## Credential Operations

Create, rotate, finalize, revoke, and retry actions are initiated in DevLake Config UI. The backend updates the auth file and calls the private helper with its shared token. A rotation temporarily keeps old and new credentials valid so Claude Code managed settings can be updated without an avoidable ingest gap. Finalize removes the retiring credential after the new settings are in use.

If the helper cannot complete a restart, DevLake records that the change still needs applying. Restore Collector health, inspect the helper and Collector logs, then use Apply in Config UI. If the auth volume was lost, revoke the affected connection and create a new one.

The helper accepts one restart at a time. While a restart is underway it returns `409 Conflict`; after a successful restart it returns `429 Too Many Requests` for the configured `OTEL_RESTART_COOLDOWN_SECONDS` period (30 seconds by default). Failed restarts are not cooled down and can be retried immediately.

## Operations

```bash
# Service status and resource usage
docker compose -f docker-compose-production.yml ps
docker stats otel-collector-prod prometheus-prod

# Stop services without deleting data
docker compose -f docker-compose-production.yml down

# Destructive: remove auth and Prometheus volumes
docker compose -f docker-compose-production.yml down -v
```

Deleting volumes removes all credential verifiers and telemetry retained by this Compose deployment. Do so only when resetting the installation.

## Kubernetes Migration

Do not carry the Docker socket helper into Kubernetes. Use a deployment-owned controller, job, or internal service with narrowly scoped Kubernetes RBAC that can restart or roll out only the Collector workload. Inject the helper token and collector auth data through Kubernetes Secrets, mount the auth data read-only into the Collector, terminate TLS at ingress, and keep Prometheus private.
