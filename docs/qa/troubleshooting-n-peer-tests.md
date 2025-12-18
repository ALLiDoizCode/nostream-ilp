# Troubleshooting N-Peer Tests

**Document Version:** 1.0
**Last Updated:** 2025-12-17
**Maintainer:** QA Team

---

## Overview

This guide helps developers and QA engineers diagnose and fix common issues with N-peer network tests. It covers failures in both local development and CI/CD environments.

## Quick Diagnosis Checklist

Before diving deep, run through this checklist:

- [ ] Are Docker services (PostgreSQL, Redis) running?
- [ ] Did you run `pnpm install` after pulling latest code?
- [ ] Is your Node.js version 20+? (`node --version`)
- [ ] Is Docker version 20+? (`docker --version`)
- [ ] Are ports 5432 (PostgreSQL) and 6379 (Redis) available?
- [ ] Did a recent code change introduce the issue? (Try `git bisect`)

If all check out, proceed to specific error sections below.

---

## Common Test Failures

### 1. "Connection refused to PostgreSQL"

**Error Message:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete] (node:net:1555:16)
```

**Cause:** PostgreSQL is not running or not ready

**Fix (Local):**
```bash
# Start PostgreSQL
docker-compose up -d postgres

# Wait for it to be ready
timeout 30 bash -c 'until pg_isready -h localhost; do sleep 1; done'

# Verify connection
psql -h localhost -U postgres -d nostream_test -c "SELECT 1"

# Re-run tests
pnpm test:n-peer
```

**Fix (CI):**

Add a wait step in `.github/workflows/n-peer-tests.yml`:

```yaml
- name: Wait for PostgreSQL
  run: |
    timeout 30 bash -c 'until pg_isready -h localhost; do sleep 1; done'
```

---

### 2. "Redis connection timeout"

**Error Message:**
```
TimeoutError: Redis connection timed out after 5000ms
```

**Cause:** Redis is not running or slow to start

**Fix (Local):**
```bash
# Start Redis
docker-compose up -d redis

# Test connection
redis-cli -h localhost ping  # Should return "PONG"

# Check Redis logs if still failing
docker logs $(docker ps -qf "name=redis")

# Re-run tests
pnpm test:n-peer
```

**Fix (CI):**

Similar to PostgreSQL, add a wait step:

```yaml
- name: Wait for Redis
  run: |
    timeout 30 bash -c 'until redis-cli -h localhost ping; do sleep 1; done'
```

---

### 3. "Test timeout after 30000ms"

**Error Message:**
```
Error: Test timeout of 30000ms exceeded
```

**Cause:** Test is taking longer than expected (CI runners are slower than local)

**Fix (Increase timeout):**

In the test file:
```typescript
it('event propagation in 10-node mesh', async () => {
  // ... test code ...
}, 60000); // Increased from 30000ms to 60000ms
```

**Or increase global timeout in `vitest.config.ts`:**
```typescript
export default defineConfig({
  test: {
    testTimeout: 60000,  // 60 seconds
  },
});
```

**When to increase:**
- CI environment (2x local timeout is reasonable)
- Large network tests (25-node, 50-node)
- Benchmark tests (latency distribution requires many iterations)

**When NOT to increase:**
- If test hangs indefinitely (indicates a bug, not slow execution)
- If timeout masks a real performance regression

---

### 4. "Event not propagated to all nodes"

**Error Message:**
```
AssertionError: Expected event to reach 10 nodes, but only reached 7
```

**Cause:** Network partition, dropped messages, or race condition

**Debug Steps:**

1. **Enable verbose logging:**
```bash
DEBUG=* pnpm test:n-peer:debug
```

2. **Check which nodes didn't receive the event:**
```typescript
const missingNodes = nodes.filter(n => !n.hasEvent(eventId));
console.log('Missing nodes:', missingNodes.map(n => n.id));
```

3. **Verify mesh topology:**
```typescript
nodes.forEach(node => {
  console.log(`Node ${node.id} connected to:`, node.connectedPeers());
});
```

**Common Causes:**

- **Race condition:** Increase `waitForEventPropagation` timeout
- **Network partition:** Check `formMesh()` completed successfully
- **Deduplication bug:** Event already seen, check event IDs are unique
- **TTL expired:** Event TTL too short for network diameter

**Fix:**
```typescript
// Increase propagation timeout
await waitForEventPropagation(eventId, nodes, 10000); // was 5000

// Verify mesh formed correctly
expect(nodes[0].connectedPeers().length).toBe(9); // 10-node mesh
```

---

### 5. "Memory leak detected"

**Error Message:**
```
Warning: Memory usage increased by 15% over 10 minutes (threshold: 10%)
```

**Cause:** Resources not cleaned up properly (WebSocket connections, database connections, timers)

**Debug Steps:**

1. **Check ResourceTracker output:**
```typescript
const tracker = new ResourceTracker();
tracker.start();

// ... run test ...

tracker.stop();
const leaks = tracker.getLeaks();
console.log('Potential leaks:', leaks);
```

2. **Manually inspect heap snapshot:**
```bash
# Run test with heap profiling
node --expose-gc --heap-prof test.js

# Analyze with Chrome DevTools
# Open chrome://inspect, load .heapprofile file
```

**Common Causes:**

- **WebSocket connections:** Not closed after test
- **Database connections:** Connection pool not drained
- **Event listeners:** Not removed (use `once()` or `removeListener()`)
- **Timers:** `setInterval()` not cleared (use `clearInterval()`)

**Fix:**

Ensure proper cleanup in `afterEach()`:
```typescript
afterEach(async () => {
  await cleanupNetwork(nodes); // Closes all connections
  nodes = [];
});
```

---

### 6. "Performance regression detected (false positive)"

**Error Message:**
```
❌ Regression detected: p95 latency increased by 55% (was 400ms, now 620ms)
```

**But you didn't change any performance-related code.**

**Cause:** CI runner had high load (other jobs running), skewed results

**Verify if Real Regression:**

1. **Check statistical significance:**
```
Statistical significance: p-value = 0.12 (not significant)
```
If p-value > 0.05, this is likely noise, not a real regression.

2. **Re-run workflow:**
Sometimes a single slow run is a fluke. Re-run the CI job.

3. **Compare multiple runs:**
If 3+ consecutive runs show regression, it's likely real.

**Fix (False Positive):**

- Re-run workflow
- If flaky, increase regression threshold (20% → 30%)
- Document known CI variability in baseline doc

**Fix (Real Regression):**

- Profile the code (`pnpm benchmark --prof`)
- Use flamegraphs to find bottleneck (`0x` package)
- Optimize or accept trade-off (document why)

---

### 7. "Flaky test: Passes locally, fails in CI"

**Symptoms:**
- Test passes 95% of the time
- Fails sporadically in CI
- No clear pattern

**Common Causes:**

| Cause | Fix |
|-------|-----|
| Race condition | Add `await` or increase timeout |
| Timing assumption | Don't assume exact millisecond timing |
| Resource contention | Reduce parallelism (`maxConcurrency: 1`) |
| Non-deterministic ordering | Sort results before assertion |
| External dependency | Mock or stub external calls |

**Debug Flaky Tests:**

1. **Run 100 times locally:**
```bash
for i in {1..100}; do
  pnpm test:n-peer || echo "FAIL on iteration $i"
done
```

2. **Enable retry in Vitest config:**
```typescript
export default defineConfig({
  test: {
    retry: 1,  // Retry once on failure
  },
});
```

3. **Use deterministic network simulation:**
Ensure `createTestNetwork()` uses fixed seeds for random number generation.

**When to Quarantine:**

If flake rate > 5%, move test to optional suite:
```typescript
it.skip('flaky test - quarantined until fixed', async () => {
  // ...
});
```

---

## CI-Specific Issues

### 8. "Docker service not found in CI"

**Error Message:**
```
Error: service "postgres" not found in docker-compose.yml
```

**Cause:** CI workflow didn't start Docker Compose, or wrong file path

**Fix:**

Ensure workflow has this step:
```yaml
- name: Start services
  run: docker-compose up -d postgres redis
```

Or specify explicit file:
```yaml
run: docker-compose -f docker-compose.test.yml up -d
```

---

### 9. "Out of memory (OOM) in CI"

**Error Message:**
```
Error: JavaScript heap out of memory
FATAL ERROR: Reached heap limit Allocation failed
```

**Cause:** Too many nodes for CI runner resources (8GB limit)

**Fix:**

**Option 1:** Reduce node count
```typescript
// Was: 25-node mesh
const nodes = await createTestNetwork(25);

// Now: 10-node mesh (fits in 8GB)
const nodes = await createTestNetwork(10);
```

**Option 2:** Increase Node.js heap size
```yaml
- name: Run tests
  run: NODE_OPTIONS="--max-old-space-size=4096" pnpm test:n-peer
```

**Option 3:** Move to Tier 3 (self-hosted runner with 16GB)
```yaml
runs-on: self-hosted  # Instead of ubuntu-latest
```

---

### 10. "GitHub Actions workflow not triggering"

**Symptoms:**
- Pushed to PR branch, but workflow didn't run
- No status check appears on PR

**Cause:** Workflow trigger configuration issue

**Debug:**

1. **Check branch name matches trigger:**
```yaml
on:
  pull_request:
    branches: [main, epic-*]  # Does your branch match?
```

If your branch is `feature/my-fix`, it won't trigger (not `epic-*`).

2. **Check workflow is on target branch:**
Workflow file must exist on the base branch (`main` or `epic-X`), not just your PR branch.

3. **Check GitHub Actions is enabled:**
Repo Settings → Actions → General → "Allow all actions"

**Fix:**

- Rename branch to match pattern (`git branch -m epic-11-my-fix`)
- Or update workflow trigger to include your branch pattern
- Merge workflow file to `main` first

---

## Performance Issues

### 11. "Benchmarks take too long (> 15 minutes)"

**Cause:** Too many iterations or too large network

**Fix:**

Reduce iteration count for CI:
```typescript
const iterations = process.env.CI ? 50 : 100; // Half iterations in CI

for (let i = 0; i < iterations; i++) {
  // ... benchmark loop ...
}
```

Or reduce network size:
```typescript
const nodeCount = process.env.CI ? 5 : 10;
```

---

### 12. "CPU usage spikes to 100%"

**Cause:** CPU-bound operation (signature verification, serialization)

**Debug:**

Run with CPU profiling:
```bash
node --prof pnpm test:n-peer
node --prof-process isolate-*.log > profile.txt
cat profile.txt
```

Look for hotspots (functions with high `ticks`).

**Common Hotspots:**
- **Signature verification:** Use `--no-verify` flag for tests (if acceptable)
- **JSON serialization:** Use `JSON.stringify()` caching
- **Regex matching:** Precompile regexes

---

## Network Issues

### 13. "WebSocket connection refused"

**Error Message:**
```
Error: WebSocket connection to 'ws://localhost:8080' failed
```

**Cause:** BTP-NIPs server not started or wrong port

**Fix:**

1. **Verify server is running:**
```bash
curl http://localhost:8080/health  # Should return 200 OK
```

2. **Check port not already in use:**
```bash
lsof -i :8080  # Shows what's using port 8080
```

3. **Use dynamic port allocation for tests:**
```typescript
const port = await getAvailablePort(); // Instead of hardcoded 8080
const server = await startTestServer(port);
```

---

### 14. "Event propagation slower than expected"

**Symptoms:**
- p95 latency is 2x baseline
- No code changes related to performance

**Possible Causes:**

1. **Network latency simulation enabled:**
```typescript
// Disable for tests
createTestNetwork(10, { networkLatency: 0 }); // was 50ms
```

2. **Database query slowness:**
```sql
-- Check PostgreSQL slow queries
SELECT query, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

3. **Event cache miss rate high:**
```typescript
// Check Redis hit rate
const info = await redis.info('stats');
console.log('Cache hit rate:', info.keyspace_hits / info.keyspace_misses);
```

---

## Debugging Tools

### Enable Verbose Logging

```bash
# All debug output
DEBUG=* pnpm test:n-peer:debug

# Specific namespaces
DEBUG=btp-nips:*,network:* pnpm test:n-peer:debug
```

### Network Topology Visualization

```typescript
import { visualizeNetwork } from './test/btp-nips/n-peer/visualize';

const nodes = await createTestNetwork(10);
await formMesh(nodes);

// Generate graph (requires Graphviz)
await visualizeNetwork(nodes, 'network-topology.png');
```

### Event Flow Tracer

```typescript
import { EventFlowTracer } from './test/btp-nips/n-peer/tracer';

const tracer = new EventFlowTracer();
tracer.start();

// Publish event
const event = await nodes[0].publishEvent({ content: 'test' });

// Wait for propagation
await waitForEventPropagation(event.id, nodes);

// Print trace
tracer.stop();
tracer.print(); // Shows event path through network
```

---

## Getting Help

### Before Asking for Help

1. ✅ Searched this troubleshooting guide
2. ✅ Checked recent commits (did someone break it?)
3. ✅ Ran with verbose logging (`DEBUG=*`)
4. ✅ Isolated the issue (minimal reproduction)
5. ✅ Collected error messages, logs, screenshots

### Where to Ask

1. **Internal Slack:** `#btp-nips-testing` channel
2. **GitHub Issues:** For bugs in test framework
3. **Team Standup:** For urgent blockers

### What to Include

```
**Environment:**
- OS: macOS 14.0 / Ubuntu 22.04 / GitHub Actions
- Node.js version: 20.5.0
- pnpm version: 8.6.0
- Docker version: 24.0.5

**Test command:**
pnpm test:n-peer:tier2

**Error message:**
[paste full error with stack trace]

**Logs:**
[attach DEBUG=* output if relevant]

**Reproduction:**
1. Run `pnpm test:n-peer`
2. Test "event propagation" fails
3. Error: "Connection refused"
```

---

## References

- **Performance Baseline:** `docs/qa/performance-baseline.md`
- **CI/CD Guide:** `docs/ci-cd/n-peer-testing.md`
- **Developer Guide:** `docs/development/n-peer-testing.md`
- **Test Framework:** `packages/app-nostream/test/btp-nips/n-peer/framework.ts`

---

## Appendix: Common Error Codes

| Error Code | Meaning | Typical Fix |
|------------|---------|-------------|
| `ECONNREFUSED` | Service not running | Start Docker service |
| `ETIMEDOUT` | Network timeout | Increase timeout or check firewall |
| `EADDRINUSE` | Port already in use | Kill process or use different port |
| `ERR_OUT_OF_MEMORY` | JavaScript heap exhausted | Increase `--max-old-space-size` |
| `ERR_MODULE_NOT_FOUND` | Missing dependency | Run `pnpm install` |
| `TimeoutError` | Test exceeded timeout | Increase `testTimeout` in config |

---

**If you find a new issue not covered here, please update this document and submit a PR!**
