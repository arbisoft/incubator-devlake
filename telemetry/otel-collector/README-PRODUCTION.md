# Production Deployment Guide

This guide covers deploying the optimized production-ready OTEL collector setup.

## Files

- `docker-compose-production.yml` - Production Docker Compose configuration
- `collector-config-production.yaml` - Optimized OTEL collector configuration

## Key Production Optimizations

### OTEL Collector (`collector-config-production.yaml`)

1. **Removed debug exporter** - No console output overhead
2. **Memory limiter** - Prevents out-of-memory crashes
   - Checks every 1 second
   - Hard limit at 80% of allocated memory
   - Spike protection at 25%
3. **Optimized batch processor**
   - Batch size: 16,384 (2x default)
   - Timeout: 500ms (2.5x default)
   - Max batch size: 32,768 for high throughput

### Docker Compose (`docker-compose-production.yml`)

1. **Resource limits**
   - OTEL Collector: 2 CPU, 1GB max / 1 CPU, 512MB reserved
   - Prometheus: 2 CPU, 2GB max / 1 CPU, 1GB reserved

2. **Health checks** - Both services validate availability every 30 seconds

3. **Automatic restart** - Services restart on failure

4. **Startup dependencies** - Prometheus waits for OTEL Collector to be healthy

5. **GOGC optimization** - Set to 80 for aggressive garbage collection (reduces memory bloat)

6. **Prometheus retention** - 30 days of data (adjust `--storage.tsdb.retention.time` as needed)

## Deployment

### Start the production stack

```bash
cd telemetry/otel-collector
docker-compose -f docker-compose-production.yml up -d
```

### Verify services are running

```bash
docker-compose -f docker-compose-production.yml ps
```

Expected output:
```
NAME                  STATUS
otel-collector-prod   Up (healthy)
prometheus-prod       Up (healthy)
```

### Check collector health

```bash
curl http://localhost:13133/healthz
```

### Monitor collector logs

```bash
docker-compose -f docker-compose-production.yml logs -f otel-collector
```

### Access Prometheus dashboard

Open: http://localhost:9090

## Configuration Adjustments

### Increase Memory Allocation

Edit `docker-compose-production.yml` and adjust:

```yaml
deploy:
  resources:
    limits:
      memory: 2048M  # Increase from 1024M
    reservations:
      memory: 1024M  # Increase from 512M
```

### Change Prometheus Retention

Edit `docker-compose-production.yml` and adjust:

```yaml
command:
  - '--storage.tsdb.retention.time=60d'  # Change from 30d
```

### Adjust Batch Processing

For ultra-high throughput (10,000+ metrics/sec), edit `collector-config-production.yaml`:

```yaml
batch:
  send_batch_size: 32768        # Increase
  timeout: 1000ms               # Increase wait time
  send_batch_max_size: 65536    # Double it
```

## Monitoring

### CPU/Memory Usage

```bash
docker stats otel-collector-prod prometheus-prod
```

### Prometheus Targets

Visit http://localhost:9090/targets to verify OTEL Collector is scraping metrics.

### Query Example

In Prometheus, test with:
```promql
up{job="otel-collector"}
```

## Stopping the Stack

```bash
docker-compose -f docker-compose-production.yml down
```

To also remove data volumes:

```bash
docker-compose -f docker-compose-production.yml down -v
```

## Scaling Beyond Single Instance

If you need to handle 5,000+ concurrent telemetry sources:

1. Deploy multiple collector instances behind a load balancer (nginx/HAProxy)
2. Each instance points to the same Prometheus backend
3. Use environment variables for dynamic configuration

Contact your DevOps team for multi-instance deployment patterns.
