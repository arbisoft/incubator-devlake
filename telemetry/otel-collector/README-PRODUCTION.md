# OTel Collector Production Compose Guide

This directory provides a VM/Compose deployment shape for a single customer telemetry stack. It is not the Kubernetes/ArgoCD deployment manifest.

## Required Environment

Set a high-entropy restart-helper token before startup. The DevLake backend must receive the same value through its deployment environment; Config UI must never receive it.

```bash
export OTEL_RESTART_HELPER_TOKEN='<high-entropy-secret>'
export OTEL_PUBLIC_ENDPOINT='https://otel.customer.example.com:4317'
```

`OTEL_PUBLIC_ENDPOINT` is consumed by DevLake, not by this Compose file. It must be an HTTPS URL because the generated Claude settings include Basic credentials.

## Start and Verify

```bash
docker compose -f docker-compose-production.yml up -d
docker compose -f docker-compose-production.yml ps
docker compose -f docker-compose-production.yml logs -f otel-collector
curl -i http://127.0.0.1:9199/health
```

The stack includes:

- `otel-auth-init`, which creates the shared `.htpasswd` before collector startup;
- `otel-collector`, which reads that file with the Basic Auth server extension;
- `otel-restart-helper`, which authenticates DevLake backend requests and restarts only the collector; and
- Prometheus, which scrapes the collector exporter.

The helper is local-only and has Docker socket access. Use it only for this Compose deployment. Kubernetes must use a deployment-owned rollout helper with narrowly scoped RBAC instead.

## Network and TLS

Expose the collector only through a TLS-capable reverse proxy or ingress. The proxy must support OTLP/gRPC forwarding to `4317`. Keep Prometheus and the restart helper private. Apply connection and request-rate limits at the proxy.

## Operations

```bash
docker compose -f docker-compose-production.yml logs -f otel-restart-helper
docker compose -f docker-compose-production.yml logs -f prometheus
docker stats otel-collector-prod prometheus-prod
```

Credential create, rotation, revoke, and retry are initiated from DevLake Config UI. The helper reloads the Collector by restart because the pinned Basic Auth extension does not hot-reload server-side `htpasswd.file` updates.

See [../../devlake/docs/full-otel-connector-test.md](../../../devlake/docs/full-otel-connector-test.md) for the complete DevLake and GitOps plan.
