# Health Monitoring Guide for Nostream-ILP Operators

This guide provides comprehensive instructions for monitoring the health of your Nostream-ILP relay, with a focus on the Dassie RPC connection and degraded mode behavior introduced in Story 1.7.

---

## Table of Contents

1. [Overview](#overview)
2. [Health Check System](#health-check-system)
3. [Degraded Mode](#degraded-mode)
4. [Health Endpoint](#health-endpoint)
5. [Prometheus Metrics](#prometheus-metrics)
6. [Monitoring Setup](#monitoring-setup)
7. [Alert Configuration](#alert-configuration)
8. [Troubleshooting](#troubleshooting)
9. [Recovery Procedures](#recovery-procedures)

---

## Overview

Nostream-ILP integrates with Dassie (ILP node) for payment verification. When the Dassie connection is lost, the relay enters **degraded mode** to maintain service availability while queueing payment verifications for later processing.

### Key Features

- **Real-time connection monitoring**: WebSocket state changes detected immediately
- **HTTP health checks**: Fallback polling of Dassie HTTP endpoint
- **Graceful degradation**: Events accepted without verification during outages
- **Automatic recovery**: Queued verifications processed when connection restored
- **Comprehensive observability**: Health endpoint, Prometheus metrics, structured logs

---

## Health Check System

### Monitored Services

The health check system monitors these critical services:

1. **Nostream**: Relay core functionality
2. **Dassie RPC**: WebSocket connection to ILP node
3. **PostgreSQL**: Event storage database
4. **Redis**: Caching layer
5. **Arweave**: Permanent storage (optional)

### Connection State Tracking

Dassie RPC connection can be in one of four states:

| State | Description | Health Status |
|-------|-------------|---------------|
| `CONNECTING` | Initial connection attempt | `degraded` |
| `CONNECTED` | Active and ready | `up` |
| `DISCONNECTED` | Connection lost | `down` |
| `RECONNECTING` | Attempting to reconnect | `degraded` |

The connection state is monitored in real-time via WebSocket events, with automatic exponential backoff reconnection attempts.

---

## Degraded Mode

### What is Degraded Mode?

Degraded mode is a failsafe mechanism that allows the relay to continue operating when Dassie is unavailable. During degraded mode:

- Events are **accepted without payment verification**
- Payment claims are **queued** for later verification
- Clients receive a **NOTICE** about temporary unavailability
- **Free tier limits still apply** (prevents abuse)

### Activation Triggers

Degraded mode activates when:

- Dassie WebSocket connection state changes to `DISCONNECTED` or `RECONNECTING`
- Connection monitoring detects the state change
- ERROR log emitted: `ALERT: Dassie RPC connection lost - entering degraded mode`

### Behavior During Degraded Mode

1. **Event Acceptance**
   - Events are accepted without payment verification
   - Payment claims extracted and queued
   - Warning logged for audit trail

2. **Queue Management**
   - Queue size limit: **10,000 events** (configurable via `DEGRADED_MODE_MAX_QUEUE_SIZE`)
   - When queue is full, oldest events are dropped
   - Queue size exposed via Prometheus metric

3. **Client Notification**
   - NOTICE broadcast: `"Payment verification temporarily unavailable - event queued"`
   - Clients informed that verification is deferred

### Recovery from Degraded Mode

When Dassie reconnects:

1. INFO log emitted: `Dassie RPC reconnected - processing X queued verifications`
2. Queued verifications processed in batches (100 at a time, 10 concurrent)
3. Invalid claims logged for audit (events already stored, not rejected retroactively)
4. Degraded mode disabled
5. Normal payment verification resumes

---

## Health Endpoint

### Endpoint: `GET /healthz`

The health endpoint provides a comprehensive system health report.

### Response Format

```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2025-11-25T12:00:00.000Z",
  "services": {
    "nostream": {
      "status": "up",
      "lastCheck": "2025-11-25T12:00:00.000Z"
    },
    "dassie_rpc": {
      "status": "up",
      "lastCheck": "2025-11-25T12:00:00.000Z",
      "responseTimeMs": 5
    },
    "postgresql": {
      "status": "up",
      "lastCheck": "2025-11-25T12:00:00.000Z",
      "responseTimeMs": 3
    },
    "redis": {
      "status": "up",
      "lastCheck": "2025-11-25T12:00:00.000Z",
      "responseTimeMs": 2
    },
    "arweave": {
      "status": "up",
      "lastCheck": "2025-11-25T12:00:00.000Z"
    }
  },
  "warnings": []
}
```

### HTTP Status Codes

- **200 OK**: System is `healthy` or `degraded` (still operational)
- **503 Service Unavailable**: System is `unhealthy` (critical service down)

### System Status Determination

| Condition | Status | HTTP Code |
|-----------|--------|-----------|
| All services `up` | `healthy` | 200 |
| Non-critical service down (Dassie, Redis, Arweave) | `degraded` | 200 |
| Critical service down (PostgreSQL, Nostream) | `unhealthy` | 503 |

### Health Check Caching

- Health checks are cached for **5 seconds** to reduce load
- Real-time WebSocket state changes bypass cache
- HTTP health endpoint queries always fresh

---

## Prometheus Metrics

### Available Metrics

#### Connection State

```prometheus
# Dassie connection state (0=down, 1=up, 2=reconnecting, 3=connecting)
nostream_dassie_connection_state 1
```

#### Degraded Mode

```prometheus
# Degraded mode active (0=no, 1=yes)
nostream_degraded_mode_active 0

# Queue size during degraded mode
nostream_degraded_mode_queue_size 0
```

#### Service Health

```prometheus
# Service health status (0=down, 1=up, 2=degraded)
# Labels: service=nostream|dassie_rpc|postgresql|redis|arweave
nostream_service_health_status{service="dassie_rpc"} 1
nostream_service_health_status{service="postgresql"} 1
nostream_service_health_status{service="redis"} 1
```

### Metrics Endpoint

Metrics are exposed at: `GET /metrics`

Example Prometheus scrape config:

```yaml
scrape_configs:
  - job_name: 'nostream-ilp'
    scrape_interval: 15s
    static_configs:
      - targets: ['relay.example.com:443']
    metrics_path: /metrics
    scheme: https
```

---

## Monitoring Setup

### 1. Uptime Monitoring (UptimeRobot, Pingdom)

Configure an HTTP monitor for the health endpoint:

- **URL**: `https://relay.example.com/healthz`
- **Interval**: 1-5 minutes
- **Expected HTTP code**: 200
- **Expected response**: `"status":"healthy"` or `"status":"degraded"`
- **Alert on**: HTTP 503 or `"status":"unhealthy"`

### 2. Prometheus + Grafana Setup

**Step 1: Configure Prometheus**

Add scrape target to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'nostream-ilp'
    scrape_interval: 15s
    static_configs:
      - targets: ['relay.example.com:443']
    metrics_path: /metrics
    scheme: https
```

**Step 2: Create Grafana Dashboard**

Import the following panels:

1. **Connection State Timeline**
   ```promql
   nostream_dassie_connection_state
   ```

2. **Degraded Mode Status**
   ```promql
   nostream_degraded_mode_active
   ```

3. **Queue Size**
   ```promql
   nostream_degraded_mode_queue_size
   ```

4. **Service Health Matrix**
   ```promql
   nostream_service_health_status
   ```

5. **Degraded Mode Duration**
   ```promql
   changes(nostream_degraded_mode_active[1h])
   ```

**Example Grafana Dashboard JSON** (simplified):

```json
{
  "dashboard": {
    "title": "Nostream-ILP Health",
    "panels": [
      {
        "title": "Dassie Connection State",
        "targets": [{
          "expr": "nostream_dassie_connection_state"
        }],
        "type": "stat"
      },
      {
        "title": "Degraded Mode Active",
        "targets": [{
          "expr": "nostream_degraded_mode_active"
        }],
        "type": "stat"
      },
      {
        "title": "Queue Size",
        "targets": [{
          "expr": "nostream_degraded_mode_queue_size"
        }],
        "type": "graph"
      }
    ]
  }
}
```

### 3. Log Aggregation (Loki, ELK Stack)

Configure structured log collection for these critical events:

**Connection Lost:**
```json
{
  "event": "alert_dassie_connection_lost",
  "severity": "critical",
  "state": "DISCONNECTED",
  "action_required": "Check Dassie node status and logs"
}
```

**Degraded Mode Enabled:**
```json
{
  "event": "degraded_mode_enabled",
  "reason": "dassie_connection_lost",
  "queue_size": 0
}
```

**Queue High:**
```json
{
  "event": "alert_degraded_queue_high",
  "severity": "warning",
  "queue_size": 8500,
  "max_queue_size": 10000
}
```

**Reconnected:**
```json
{
  "event": "alert_dassie_reconnected",
  "severity": "info",
  "queued_verifications": 1234
}
```

---

## Alert Configuration

### Recommended Alerts

#### 1. Dassie Connection Down (Critical)

**Condition**: Dassie connection state is `DISCONNECTED` for > 1 minute

**PromQL**:
```promql
nostream_dassie_connection_state == 0
```

**Alert**:
```yaml
- alert: DassieConnectionDown
  expr: nostream_dassie_connection_state == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Dassie RPC connection lost"
    description: "Relay has entered degraded mode. Check Dassie node status."
```

**Action**: Check Dassie logs, restart if necessary

#### 2. Degraded Mode Active (Warning)

**Condition**: Degraded mode active for > 5 minutes

**PromQL**:
```promql
nostream_degraded_mode_active == 1
```

**Alert**:
```yaml
- alert: DegradedModeActive
  expr: nostream_degraded_mode_active == 1
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Relay in degraded mode"
    description: "Payment verification unavailable for {{ $value }}s. Queue size: {{ query \"nostream_degraded_mode_queue_size\" | first | value }}"
```

**Action**: Investigate Dassie outage, consider manual intervention if prolonged

#### 3. Queue Size High (Warning)

**Condition**: Queue size > 80% of max (8,000 events)

**PromQL**:
```promql
nostream_degraded_mode_queue_size > 8000
```

**Alert**:
```yaml
- alert: DegradedQueueHigh
  expr: nostream_degraded_mode_queue_size > 8000
  for: 2m
  labels:
    severity: warning
  annotations:
    summary: "Degraded mode queue filling up"
    description: "Queue at {{ $value }} events (limit: 10000). Oldest events will be dropped."
```

**Action**: Urgently restore Dassie connection or increase queue size limit

#### 4. PostgreSQL Down (Critical)

**Condition**: PostgreSQL health status `down`

**PromQL**:
```promql
nostream_service_health_status{service="postgresql"} == 0
```

**Alert**:
```yaml
- alert: PostgreSQLDown
  expr: nostream_service_health_status{service="postgresql"} == 0
  for: 30s
  labels:
    severity: critical
  annotations:
    summary: "PostgreSQL database unavailable"
    description: "Relay cannot store events. Service will fail."
```

**Action**: Immediately investigate database connection, restart if necessary

---

## Troubleshooting

### Problem: Dassie Connection Frequently Drops

**Symptoms**:
- Connection state oscillates between `CONNECTED` and `DISCONNECTED`
- Degraded mode activates multiple times per hour

**Possible Causes**:
1. Network instability between Nostream and Dassie
2. Dassie node resource exhaustion (CPU, memory)
3. Firewall/security group blocking WebSocket keepalives

**Diagnosis Steps**:

1. **Check network latency**:
   ```bash
   ping dassie-host
   ```

2. **Check Dassie node resources**:
   ```bash
   docker stats dassie-container
   # or
   systemctl status dassie
   ```

3. **Check Dassie logs for errors**:
   ```bash
   docker logs dassie-container --tail 100
   # or
   journalctl -u dassie -n 100
   ```

4. **Verify WebSocket configuration**:
   - Check `DASSIE_RPC_URL` environment variable
   - Ensure WebSocket protocol (`ws://` or `wss://`) is correct
   - Verify port accessibility

**Solutions**:
- Increase Dassie node resources (CPU, memory)
- Move Nostream and Dassie to same network/host (reduce latency)
- Configure WebSocket keepalive timeout (increase if network is slow)
- Check firewall rules for WebSocket traffic

---

### Problem: Queue Filling Up During Outage

**Symptoms**:
- `nostream_degraded_mode_queue_size` approaching 10,000
- Logs show `alert_degraded_queue_high`

**Possible Causes**:
1. Prolonged Dassie outage (hours)
2. High event ingestion rate during outage
3. Queue size limit too small

**Diagnosis Steps**:

1. **Check queue size**:
   ```bash
   curl https://relay.example.com/healthz | jq '.services.dassie_rpc'
   ```

2. **Check Dassie status**:
   ```bash
   curl https://dassie-host:5000/health
   ```

3. **Check event ingestion rate**:
   ```bash
   # From Prometheus
   rate(nostream_events_accepted_total[5m])
   ```

**Solutions**:
- **Urgent**: Restore Dassie connection immediately
- **Short-term**: Increase `DEGRADED_MODE_MAX_QUEUE_SIZE` (e.g., 50,000)
  ```bash
  # In .env
  DEGRADED_MODE_MAX_QUEUE_SIZE=50000
  ```
- **Long-term**: Implement queue persistence to database (future enhancement)

---

### Problem: Health Endpoint Returns 503

**Symptoms**:
- GET /healthz returns HTTP 503
- System status is `unhealthy`

**Possible Causes**:
1. PostgreSQL database down
2. Nostream core service failed

**Diagnosis Steps**:

1. **Check health endpoint response**:
   ```bash
   curl -i https://relay.example.com/healthz | jq
   ```

2. **Identify failing service**:
   ```json
   {
     "status": "unhealthy",
     "services": {
       "postgresql": {
         "status": "down",
         "message": "Connection timeout"
       }
     }
   }
   ```

3. **Check PostgreSQL connection**:
   ```bash
   psql -h db-host -U nostream -d nostream -c "SELECT 1"
   ```

**Solutions**:
- **PostgreSQL down**: Restart database, check connection credentials
- **Nostream core failed**: Check application logs, restart service

---

## Recovery Procedures

### Scenario 1: Dassie Node Crashed

**Steps to Recover**:

1. **Verify Dassie status**:
   ```bash
   docker ps | grep dassie
   # or
   systemctl status dassie
   ```

2. **Check Dassie logs**:
   ```bash
   docker logs dassie-container --tail 100
   ```

3. **Restart Dassie**:
   ```bash
   docker restart dassie-container
   # or
   systemctl restart dassie
   ```

4. **Verify reconnection**:
   ```bash
   curl https://relay.example.com/healthz | jq '.services.dassie_rpc.status'
   # Should return "up"
   ```

5. **Check queue processing**:
   ```bash
   # From Nostream logs
   grep "queued_verifications_processed" /var/log/nostream/nostream.log
   ```

**Expected Timeline**:
- Dassie restart: 10-30 seconds
- WebSocket reconnection: Automatic within 1 minute
- Queue processing: Depends on queue size (1000 events ~ 5 seconds)
- Degraded mode exit: Automatic after queue processing

---

### Scenario 2: Network Partition

**Steps to Recover**:

1. **Verify network connectivity**:
   ```bash
   ping dassie-host
   nc -zv dassie-host 5000
   ```

2. **Check firewall rules**:
   ```bash
   # On Nostream host
   iptables -L -n | grep 5000
   # On Dassie host
   iptables -L -n | grep 5000
   ```

3. **Restore network**:
   - Fix routing/firewall issues
   - Connection will automatically resume when network restored

4. **Monitor reconnection**:
   ```bash
   # Watch Prometheus metric
   watch -n 5 'curl -s http://relay.example.com/metrics | grep nostream_dassie_connection_state'
   ```

**Expected Timeline**:
- Network restore: Depends on infrastructure
- Reconnection: Automatic within exponential backoff interval (up to 30 seconds)
- Queue processing: Automatic

---

### Scenario 3: Manual Queue Processing

If queue processing fails or Dassie is permanently unavailable, you may need to clear the queue manually.

**⚠️ Warning**: This will discard queued payment verifications. Only use if:
- Dassie is permanently lost (migrate to new instance)
- Queue contains invalid/spam events

**Steps**:

1. **Restart Nostream** (clears in-memory queue):
   ```bash
   docker restart nostream-container
   # or
   systemctl restart nostream
   ```

2. **Verify queue cleared**:
   ```bash
   curl https://relay.example.com/metrics | grep nostream_degraded_mode_queue_size
   # Should be 0
   ```

3. **Manually verify events** (optional):
   - Query PostgreSQL for events accepted during degraded mode
   - Use audit logs to identify potential unpaid events
   - Consider retroactive verification or deletion

---

## Environment Variables Reference

### Health Check Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `DASSIE_HTTP_URL` | `http://localhost:5000` | Dassie HTTP health endpoint (fallback check) |
| `HEALTH_CHECK_INTERVAL_MS` | `30000` | How often to poll HTTP health endpoint (WebSocket is real-time) |
| `DEGRADED_MODE_MAX_QUEUE_SIZE` | `10000` | Maximum queued payment verifications during degraded mode |

### Example Configuration

```bash
# .env file
DASSIE_HTTP_URL=https://dassie.internal.example.com
HEALTH_CHECK_INTERVAL_MS=60000
DEGRADED_MODE_MAX_QUEUE_SIZE=20000
```

---

## Best Practices

### 1. Monitoring

- **Always monitor Dassie connection state** (real-time metric)
- **Set up alerts** for degraded mode > 5 minutes
- **Review audit logs** for events accepted without verification
- **Dashboard visibility** for operators (Grafana recommended)

### 2. Capacity Planning

- **Queue size**: Default 10,000 events sufficient for most outages
- **Estimate event rate**: Monitor `nostream_events_accepted_total`
- **Calculate maximum downtime**: `queue_size / event_rate`
  - Example: 10,000 events / 100 events/minute = 100 minutes max downtime

### 3. High Availability

- **Run Dassie and Nostream in same data center** (reduce latency)
- **Use Docker restart policies** (`--restart unless-stopped`)
- **Monitor both Nostream and Dassie** (separate alerts)
- **Backup configuration** (environment variables, .env files)

### 4. Security

- **Free tier still applies** during degraded mode (prevents abuse)
- **Audit queued verifications** after reconnection
- **Review invalid claims** (logged in `queued_verifications_processed`)
- **Consider retroactive event deletion** for invalid payments (future enhancement)

---

## Support and Further Reading

- **Nostream-ILP GitHub**: [Repository Link]
- **Dassie Documentation**: See `docs/architecture/ilp-integration.md`
- **BMad Framework**: `.bmad-core/README.md`
- **Story 1.7 Technical Details**: `docs/stories/1.7.story.md`
- **Migration Guide**: `MIGRATION.md` (Section: Story 1.7)

For urgent issues, check:
1. Application logs (`/var/log/nostream/nostream.log`)
2. Dassie logs (`docker logs dassie-container`)
3. Prometheus metrics (`GET /metrics`)
4. Health endpoint (`GET /healthz`)

---

**Last Updated**: 2025-11-25
**Story**: 1.7 - Add Inter-Process Health Checks
**Author**: Claude Sonnet 4.5
