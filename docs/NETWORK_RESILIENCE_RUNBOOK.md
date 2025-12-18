# Network Resilience Operations Runbook

**Story 11.5: Network Resilience & Failure Tests**
**Purpose:** Operational guide for handling network failures and recovery

---

## Failure Mode Catalog

### 1. Node Crash

**Symptoms:**
- Node stops responding to heartbeat pings
- WebSocket connections drop
- Events not forwarded through crashed node
- Subscriptions to crashed node fail

**Root Causes:**
- Process crash (OOM, segfault, unhandled exception)
- Host failure (hardware, OS crash)
- Resource exhaustion (CPU, memory, disk)

**Impact:**
- Events not delivered to crashed node
- Routing paths recalculated
- Temporary increase in latency for affected paths

**Detection:**
- Heartbeat timeout (30 seconds default)
- Connection loss notifications
- Peer discovery marks node as unavailable

**Automated Recovery:**
- Alternative routes used automatically
- Events queued for crashed node (if configured)
- Network continues operating with remaining nodes

### 2. Network Partition

**Symptoms:**
- Nodes cannot reach subset of network
- Events only propagate within partitions
- Cross-partition communication fails
- Gossip protocol reports split

**Root Causes:**
- Network infrastructure failure
- Firewall misconfiguration
- BGP routing issues
- DNS failures

**Impact:**
- Network split into isolated groups
- Events only propagate within partitions
- Potential for inconsistent state
- Healing requires synchronization

**Detection:**
- Peer connectivity checks fail
- Gossip protocol detects split
- Event propagation stops at partition boundary

**Automated Recovery:**
- Gossip protocol synchronizes when partition heals
- Missed events replayed
- Deduplication prevents duplicates

### 3. Database Failure

**Symptoms:**
- PostgreSQL connection errors
- Query timeouts
- Event storage fails
- Degraded mode activated

**Root Causes:**
- PostgreSQL server crash
- Network connectivity to DB lost
- Disk full on DB server
- Connection pool exhaustion

**Impact:**
- Node enters degraded mode (cache-only)
- Events stored in Redis cache
- Limited query capability
- Recovery requires DB restoration

**Detection:**
- Database connection health checks fail
- Query errors logged
- Automatic fallback to degraded mode

**Automated Recovery:**
- Fall back to Redis cache
- Queue events for DB write
- Replay queued events when DB recovers
- Recovery time: < 60 seconds

### 4. Redis Cache Failure

**Symptoms:**
- Redis connection errors
- Cache miss rate increases
- Fallback to database-only mode
- Performance degradation

**Root Causes:**
- Redis server crash
- Network connectivity lost
- Memory exhaustion
- Configuration error

**Impact:**
- Performance degradation (slower, but functional)
- Deduplication falls back to DB
- Throughput reduced (~10x slower)
- Latency increases (~10x higher)

**Detection:**
- Redis connection health checks fail
- Cache operation errors
- Automatic fallback to DB-only mode

**Automated Recovery:**
- Fall back to database deduplication
- Resume cache usage when Redis recovers
- No data loss (DB remains authoritative)

### 5. Byzantine Faults (Malicious Nodes)

**Symptoms:**
- Signature verification failures
- Modified event content detected
- Event flooding from single node
- Forged signatures rejected

**Root Causes:**
- Compromised node
- Malicious actor
- Software bug causing invalid signatures
- Man-in-the-middle attack

**Impact:**
- Invalid events rejected
- Rate limiting applied to malicious node
- Reputation system bans node
- Network remains secure

**Detection:**
- Signature verification fails
- Rate limit thresholds exceeded
- Reputation score drops
- Automated banning triggered

**Automated Recovery:**
- Invalid events rejected at validation
- Rate limiter throttles flood attacks
- Reputation system auto-bans malicious nodes
- Network isolates compromised node

---

## Recovery Procedures

### Node Crash Recovery

**Step 1: Verify Crash**
```bash
# Check node status
systemctl status nostream-node-<id>

# Check logs
journalctl -u nostream-node-<id> -n 100
```

**Step 2: Restart Node**
```bash
# Restart service
systemctl restart nostream-node-<id>

# Verify startup
systemctl status nostream-node-<id>
```

**Step 3: Verify Recovery**
```bash
# Check heartbeat responses
curl http://localhost:8080/health

# Check peer connections
curl http://localhost:8080/admin/peers
```

**Step 4: Monitor**
- Watch logs for errors
- Verify event propagation resumes
- Check subscription renewal

**Expected Recovery Time:** < 30 seconds

---

### Network Partition Recovery

**Step 1: Detect Partition**
```bash
# Check peer connectivity
curl http://localhost:8080/admin/peers

# Check gossip protocol status
curl http://localhost:8080/admin/gossip/status
```

**Step 2: Diagnose Network Issue**
```bash
# Test connectivity to partitioned nodes
ping <node-ip>
telnet <node-ip> 8080

# Check firewall rules
iptables -L
```

**Step 3: Fix Network Issue**
- Restore network connectivity
- Fix firewall rules
- Fix DNS resolution

**Step 4: Verify Healing**
```bash
# Monitor gossip synchronization
curl http://localhost:8080/admin/gossip/sync-status

# Verify event propagation resumes
curl http://localhost:8080/admin/events/recent
```

**Expected Recovery Time:** < 30 seconds after network restored

---

### Database Failure Recovery

**Step 1: Verify Degraded Mode**
```bash
# Check node status
curl http://localhost:8080/admin/status

# Should show: "mode": "degraded"
```

**Step 2: Restore Database**
```bash
# Restart PostgreSQL
systemctl restart postgresql

# Verify database is up
psql -h localhost -U nostream -c "SELECT 1"
```

**Step 3: Verify Recovery**
```bash
# Node should automatically detect DB recovery
# Check logs for recovery messages
journalctl -u nostream-node -n 50 | grep "database recovered"

# Verify normal mode
curl http://localhost:8080/admin/status
```

**Step 4: Verify Data Integrity**
```bash
# Check event count
psql -h localhost -U nostream -c "SELECT COUNT(*) FROM events"

# Verify no data loss
curl http://localhost:8080/admin/events/verify-integrity
```

**Expected Recovery Time:** < 60 seconds after DB restored

---

### Redis Cache Failure Recovery

**Step 1: Verify DB Fallback**
```bash
# Check node status
curl http://localhost:8080/admin/status

# Should show: "cache": "fallback-mode"
```

**Step 2: Restore Redis**
```bash
# Restart Redis
systemctl restart redis

# Verify Redis is up
redis-cli ping
```

**Step 3: Verify Recovery**
```bash
# Node should automatically resume cache usage
# Check logs
journalctl -u nostream-node -n 50 | grep "cache recovered"

# Verify normal performance
curl http://localhost:8080/admin/metrics
```

**Expected Recovery Time:** Immediate (automatic fallback)

---

### Byzantine Fault Recovery

**Step 1: Identify Malicious Node**
```bash
# Check reputation scores
curl http://localhost:8080/admin/reputation/scores

# Check signature verification errors
grep "signature verification failed" /var/log/nostream/error.log
```

**Step 2: Ban Malicious Node**
```bash
# Ban node (automatic, or manual override)
curl -X POST http://localhost:8080/admin/peers/ban \
  -d '{"nodeId": "<malicious-node-id>"}'
```

**Step 3: Verify Isolation**
```bash
# Verify node is disconnected
curl http://localhost:8080/admin/peers | grep <malicious-node-id>

# Should not appear in peer list
```

**Step 4: Report to Network Operators**
- Document malicious behavior
- Share ban information with other node operators
- Update reputation database

**Expected Recovery Time:** Immediate (automatic isolation)

---

## Troubleshooting Guide

### Issue: Events Not Propagating

**Symptoms:**
- Events stuck in queue
- Subscribers not receiving events
- High latency

**Checks:**
1. Verify node is running: `systemctl status nostream-node`
2. Check peer connections: `curl http://localhost:8080/admin/peers`
3. Check queue depth: `curl http://localhost:8080/admin/metrics`
4. Check network connectivity: `ping <peer-ip>`

**Solutions:**
- Restart node if crashed
- Check firewall rules
- Increase queue size if needed
- Check for network partition

---

### Issue: High CPU Usage

**Symptoms:**
- CPU at 100%
- Node unresponsive
- Events delayed

**Checks:**
1. Check top processes: `top -p $(pgrep nostream)`
2. Check event rate: `curl http://localhost:8080/admin/metrics`
3. Check for event flooding: Check signature verification failures

**Solutions:**
- Rate limit event ingestion
- Ban malicious nodes
- Scale horizontally (add more nodes)
- Investigate performance bottlenecks

---

### Issue: Memory Leak

**Symptoms:**
- Memory usage increasing over time
- OOM kills
- Swap usage increasing

**Checks:**
1. Check memory usage: `free -h`
2. Check node memory: `ps aux | grep nostream`
3. Check for unclosed connections: `lsof -p $(pgrep nostream)`

**Solutions:**
- Restart node (temporary)
- Investigate leak in code
- Increase memory limits
- Enable memory profiling

---

### Issue: Database Connection Pool Exhausted

**Symptoms:**
- "Too many connections" errors
- Query timeouts
- Degraded mode activation

**Checks:**
1. Check active connections: `psql -c "SELECT count(*) FROM pg_stat_activity"`
2. Check connection pool config: `cat config.yaml | grep pool`

**Solutions:**
- Increase connection pool size
- Close idle connections
- Restart database
- Scale database (read replicas)

---

## Monitoring and Alerts

### Key Metrics to Monitor

1. **Node Health:**
   - Uptime
   - CPU usage
   - Memory usage
   - Disk usage

2. **Network Health:**
   - Peer connection count
   - Heartbeat latency
   - Partition status

3. **Performance:**
   - Event throughput (events/sec)
   - Latency (p50, p95, p99)
   - Queue depth

4. **Errors:**
   - Signature verification failures
   - Database connection errors
   - Cache failures
   - Crash count

### Alerting Thresholds

- **Critical:**
  - Node crash
  - Network partition detected
  - Database failure
  - Byzantine fault detected

- **Warning:**
  - CPU > 80% for 5 minutes
  - Memory > 85% for 5 minutes
  - Queue depth > 1000
  - Cache failure

- **Info:**
  - New peer connected
  - Node restarted
  - Performance degradation

---

## References

- Story 11.5: Network Resilience & Failure Tests
- Test Framework: `test/btp-nips/n-peer/fault-injector.ts`
- Implementation Guide: `test/btp-nips/integration/RESILIENCE_TEST_IMPLEMENTATION_GUIDE.md`

---

**Last Updated:** 2025-12-16
**Author:** James (Dev Agent)
