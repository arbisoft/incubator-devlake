# Telemetry & Observability

This directory contains observability configurations for DevLake, including telemetry collection and monitoring infrastructure.

## Directory Structure

```
telemetry/
└── otel-collector/       # OpenTelemetry collector with Prometheus
    ├── docker-compose.yml              # Debug setup (console output enabled)
    ├── docker-compose-production.yml   # Production setup (optimized)
    ├── collector-config.yaml           # Debug collector config
    ├── collector-config-production.yaml # Production collector config
    ├── prometheus.yml                  # Prometheus scrape configuration
    ├── .env.production                 # Production environment variables
    ├── README-PRODUCTION.md            # Detailed deployment guide
    └── README.md                       # This file
```

## Overview

### OTEL Collector

OpenTelemetry collector for ingesting Claude Code telemetry metrics and exporting to Prometheus.

**Key capabilities:**
- Receives metrics via gRPC (4317) and HTTP (4318)
- Batches data for efficient processing
- Exports to Prometheus for visualization
- Supports 80,000-240,000 concurrent Claude Code instances

**Debug vs. Production:**
- **Debug setup**: Logs every metric to console, useful for development
- **Production setup**: Optimized for throughput, memory-efficient

## Quick Start

### Local Development (Debug)

```bash
cd telemetry/otel-collector
docker-compose up -d

# Monitor logs
docker-compose logs -f otel-collector

# Access Prometheus dashboard
open http://localhost:9090
```

### Production Deployment

See [otel-collector/README-PRODUCTION.md](otel-collector/README-PRODUCTION.md) for detailed instructions including:
- VPS deployment steps
- Health checks and monitoring
- Resource configuration tuning
- Scaling beyond single instance

### Quick Production Deploy

```bash
cd telemetry/otel-collector
docker-compose -f docker-compose-production.yml up -d

# Verify services
docker-compose -f docker-compose-production.yml ps
```

## Configure Claude Code to Send Telemetry

Once the OTEL Collector stack is running, configure Claude Code to send metrics by setting environment variables.

### Quick Setup (Copy-Paste)

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_METRIC_EXPORT_INTERVAL=5000

# Then start Claude Code
claude-code
```

### Environment Variables Explained

| Variable | Value | Purpose |
|----------|-------|---------|
| `CLAUDE_CODE_ENABLE_TELEMETRY` | `1` | Master switch — enables OpenTelemetry export in Claude Code |
| `OTEL_METRICS_EXPORTER` | `otlp` | Sends metrics via OTLP protocol instead of logging locally |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `grpc` | Uses gRPC transport (efficient) on port 4317 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OTEL Collector's gRPC endpoint |
| `OTEL_METRIC_EXPORT_INTERVAL` | `5000` | Export every 5 seconds (vs 60s default) for short sessions |

### Apply Configuration Methods

#### Method 1: Terminal Session (Temporary)

```bash
# Set variables for current session only
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_METRIC_EXPORT_INTERVAL=5000

claude-code
```

#### Method 2: Persistent Shell Configuration

Add to your `.bashrc` or `.zshrc`:

```bash
# ~/.bashrc or ~/.zshrc
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_METRIC_EXPORT_INTERVAL=5000
```

Then reload:
```bash
source ~/.bashrc  # or ~/.zshrc
```

#### Method 3: Claude Code Hook (Auto-Apply)

Create an auto-start hook:

```bash
mkdir -p ~/.claude/hooks

cat > ~/.claude/hooks/pre:start << 'EOF'
#!/bin/bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_METRIC_EXPORT_INTERVAL=5000
EOF

chmod +x ~/.claude/hooks/pre:start
```

### Remote Configuration (VPS/Cloud)

If your collector is on a remote server:

```bash
# Create SSH tunnel to your VPS
ssh -L 4317:localhost:4317 <SSH_USER>@<VPS_HOST> -N &

# Then set environment variables pointing to localhost tunnel
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_METRIC_EXPORT_INTERVAL=5000

claude-code
```

Or direct connection (if firewall allows):

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://<VPS_IP>:4317
# Set other variables as above
```

### Verify Telemetry is Flowing

After starting Claude Code with telemetry enabled, verify data is reaching the collector:

#### 1. Check Collector Logs

```bash
cd telemetry/otel-collector
docker-compose logs -f otel-collector | grep -i "metric\|received"
```

Expected output:
```
otel-collector  | 2026-07-28T15:45:32.123Z	info	otlpreceiver	otlp/otlpreceiver.go:123	start receiving
```

#### 2. Query Prometheus

Visit http://localhost:9090 and run:

```promql
# Check if collector is healthy
up{job="otel-collector"}

# View incoming metric rate
rate(otelcol_receiver_accepted_metric_points_total[1m])

# Query Claude Code metrics
claude_code_session_count_total
claude_code_cost_usage_USD_total
claude_code_token_usage_tokens_total
```

#### 3. Check Metrics Endpoint Directly

```bash
curl http://localhost:8889/metrics | grep claude_code
```

Expected output:
```
# HELP claude_code_session_count_total Total number of Claude Code sessions
# TYPE claude_code_session_count_total counter
claude_code_session_count_total{model="claude-opus-4-8",organization_id="org-xxx",user_account_uuid="uuid-xxx"} 5
```

### Troubleshooting

**No metrics appearing in Prometheus?**

1. Verify environment variables are set:
   ```bash
   env | grep OTEL
   env | grep CLAUDE
   ```

2. Check collector is receiving data:
   ```bash
   docker-compose logs otel-collector | tail -30
   ```

3. Verify Claude Code is running with telemetry:
   ```bash
   # In Claude Code, telemetry should initialize on startup
   # Check console output for "telemetry" or "otlp" messages
   ```

4. Test collector health:
   ```bash
   curl http://localhost:13133/healthz
   curl http://localhost:8889/metrics | head -5
   ```

5. Verify Prometheus can reach collector (http://localhost:9090/targets)

## Configuration Files

### docker-compose.yml / docker-compose-production.yml

Defines OTEL Collector and Prometheus services with:
- Resource limits and reservations
- Health checks and automatic restarts
- Port mappings and volumes
- Service dependencies

**Key difference:** Production includes memory limiter and optimized resource allocation.

### collector-config.yaml / collector-config-production.yaml

OTEL Collector pipeline configuration:
- **Receivers**: gRPC and HTTP/JSON endpoints
- **Processors**: Memory limiting, delta-to-cumulative conversion, batching
- **Exporters**: Prometheus metrics exporter

**Production optimizations:**
- Debug exporter removed (no console logging overhead)
- Batch size: 16,384 (2x default)
- Batch timeout: 500ms (2.5x default)
- Memory limiter: 80% hard limit, 25% spike protection

### prometheus.yml

Prometheus scrape configuration for collecting metrics from OTEL Collector endpoint.

### .env.production

Environment variables for production deployment configuration.

## Ports

| Service | Port | Purpose |
|---------|------|---------|
| OTEL gRPC | 4317 | Receives telemetry via gRPC |
| OTEL HTTP | 4318 | Receives telemetry via HTTP/JSON |
| OTEL Metrics | 8889 | Prometheus scrape endpoint |
| Prometheus | 9090 | Metrics dashboard & API |

## Capacity Planning

**Single instance can handle:**
- **Conservative**: 80,000-100,000 concurrent Claude Code instances
- **Aggressive**: 160,000-240,000 concurrent Claude Code instances (peaks only)

**Per client metrics:**
- Average: 0.25 metrics/second (15 metrics/minute)
- Burst: Up to 1 metric/second during heavy operations

## Monitoring

### Health Checks

```bash
# OTEL Collector health
curl http://localhost:13133/healthz

# Prometheus health
curl http://localhost:9090/-/healthy

# OTEL metrics endpoint
curl http://localhost:8889/metrics | head -20
```

### Resource Usage

```bash
docker stats otel-collector-prod prometheus-prod
```

### Prometheus Queries

Visit http://localhost:9090/graph and try:
```promql
up{job="otel-collector"}
```

## Troubleshooting

### Collector not receiving metrics

1. Verify Claude Code is configured to send to correct endpoint:
   - gRPC: `localhost:4317` or `<host>:4317`
   - HTTP: `localhost:4318` or `<host>:4318`

2. Check collector is running:
   ```bash
   docker-compose ps
   docker-compose logs otel-collector
   ```

3. Verify firewall allows traffic to ports 4317/4318

### Prometheus not scraping metrics

1. Check Prometheus targets: http://localhost:9090/targets
2. Verify OTEL metrics endpoint is accessible: `curl http://localhost:8889/metrics`
3. Check prometheus.yml has correct scrape config

### High memory usage

1. Check batch processor timeout isn't too high
2. Verify memory limiter is enabled in production config
3. Monitor cardinality of metrics (too many unique labels)

## Integration with DevLake

This telemetry stack is **independent** of the main DevLake application and can:
- Run on separate infrastructure
- Use different resource allocation
- Be deployed/updated without affecting DevLake

To integrate Claude Code telemetry with DevLake:
1. Configure Claude Code to send metrics to OTEL Collector
2. Query Prometheus API from DevLake dashboards
3. Visualize in Grafana or DevLake UI

## Local testing
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_METRIC_EXPORT_INTERVAL=5000

# Start Claude Code
claude


## Next Steps

1. Test debug setup locally: `docker-compose up -d`
2. Verify metrics are flowing: Check Prometheus dashboard
3. Deploy to staging/production: Follow [README-PRODUCTION.md](otel-collector/README-PRODUCTION.md)
4. Configure Claude Code sessions to point to collector endpoint
5. Monitor dashboards and resource usage

## Additional Resources

- [OTEL Collector Documentation](https://opentelemetry.io/docs/collector/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [DevLake Documentation](https://devlake.apache.org/docs/)
