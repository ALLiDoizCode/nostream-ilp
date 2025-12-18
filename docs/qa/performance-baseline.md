# Performance Baseline - BTP-NIPs N-Peer Network

**Document Version:** 1.0
**Last Updated:** 2025-12-17
**Maintainer:** QA Team
**Status:** Initial Baseline (Placeholder Values)

---

## Overview

This document establishes the performance baseline for the BTP-NIPs N-peer network implementation. These metrics serve as:

1. **SLA Targets** - Maximum acceptable latency/resource usage
2. **Regression Detection Thresholds** - Automated CI/CD alerts
3. **Optimization Goals** - Future performance improvement targets
4. **Capacity Planning** - Infrastructure sizing guidance

## Baseline Metrics

### 10-Node Mesh Network

**Latency Distribution:**
- **p50:** 150ms (target: < 200ms)
- **p95:** 400ms (target: < 500ms) ✅ **SLA**
- **p99:** 800ms (target: < 1000ms)
- **max:** 1200ms (target: < 2000ms)

**Throughput:**
- **Events/sec:** 120 (target: > 100) ✅ **SLA**
- **Bytes/sec:** 524,288 (~512 KB/s)
- **Burst capacity:** 500 events/sec for 30s

**Resource Utilization:**
- **Memory per node:** 384 MB (target: < 512 MB) ✅ **SLA**
- **CPU per node:** 35% (target: < 50%) ✅ **SLA**
- **Active connections:** 9 (full mesh)

### 25-Node Mesh Network

**Latency Distribution:**
- **p50:** 300ms (target: < 400ms)
- **p95:** 850ms (target: < 1000ms) ✅ **SLA**
- **p99:** 1500ms (target: < 2000ms)
- **max:** 2500ms (target: < 3000ms)

**Throughput:**
- **Events/sec:** 280 (target: > 250) ✅ **SLA**
- **Bytes/sec:** 1,310,720 (~1.25 MB/s)
- **Network diameter:** 4 hops (target: ≤ 5)

**Resource Utilization:**
- **Memory per node:** 640 MB (target: < 768 MB) ✅ **SLA**
- **CPU per node:** 45% (target: < 60%)
- **Active connections:** 24 (full mesh)

### 50-Node Mesh Network

**Latency Distribution:**
- **p50:** 500ms (target: < 800ms)
- **p95:** 1800ms (target: < 2000ms) ✅ **SLA**
- **p99:** 3000ms (target: < 4000ms)
- **max:** 5000ms (target: < 6000ms)

**Throughput:**
- **Events/sec:** 550 (target: > 500) ✅ **SLA**
- **Bytes/sec:** 2,621,440 (~2.5 MB/s)

**Resource Utilization:**
- **Memory per node:** 896 MB (target: < 1024 MB) ✅ **SLA**
- **CPU per node:** 60% (target: < 70%)
- **Active connections:** 49 (full mesh)

### 100-Node Mesh Network (Stress Test)

**Latency Distribution:**
- **p50:** 1200ms (target: < 2000ms)
- **p95:** 4500ms (target: < 5000ms) ✅ **SLA**
- **p99:** 7000ms (target: < 8000ms)
- **max:** 10000ms (target: < 12000ms)

**Throughput:**
- **Events/sec:** 800 (target: > 500) ✅ **SLA**
- **Bytes/sec:** 3,932,160 (~3.75 MB/s)

**Resource Utilization:**
- **Memory per node:** 1792 MB (target: < 2048 MB) ✅ **SLA**
- **CPU per node:** 75% (target: < 80%)
- **Active connections:** 99 (full mesh)

---

## Performance SLA Summary

| Network Size | p95 Latency SLA | Throughput SLA | Memory SLA | Status |
|--------------|-----------------|----------------|------------|--------|
| 10-node      | < 500ms         | > 100 evt/s    | < 512 MB   | ✅ PASS |
| 25-node      | < 1000ms        | > 250 evt/s    | < 768 MB   | ✅ PASS |
| 50-node      | < 2000ms        | > 500 evt/s    | < 1024 MB  | ✅ PASS |
| 100-node     | < 5000ms        | > 500 evt/s    | < 2048 MB  | ✅ PASS |

---

## Regression Detection Thresholds

The CI/CD pipeline automatically detects performance regressions using these thresholds:

### Warning Thresholds (⚠️)
- **Latency:** > 20% increase from baseline
- **Throughput:** > 20% decrease from baseline
- **Memory:** > 30% increase from baseline

### Failure Thresholds (❌)
- **Latency:** > 50% increase from baseline
- **Throughput:** > 50% decrease from baseline
- **Memory:** > 50% increase from baseline (critical)

### Example Calculation

Baseline: 10-node p95 latency = 400ms

| Current p95 | Delta | Status |
|-------------|-------|--------|
| 480ms       | +20%  | ⚠️ WARNING |
| 600ms       | +50%  | ❌ FAILURE |
| 800ms       | +100% | ❌ FAILURE (blocks PR merge) |

---

## Interpreting Benchmark Results

### Reading the Markdown Report

After running `pnpm benchmark`, you'll get a report like:

```
## 10-Node Mesh Benchmark Results

**Latency Distribution:**
- p50: 155ms (baseline: 150ms, Δ +3.3%)
- p95: 420ms (baseline: 400ms, Δ +5.0%) ⚠️ Warning threshold
- p99: 810ms (baseline: 800ms, Δ +1.3%)

**Verdict:** ⚠️ WARNING - p95 latency increased by 5% (threshold: 20%)
```

**What to do:**
1. **Δ < 5%** - Normal variation, no action needed
2. **Δ 5-20%** - Investigate if change was intentional
3. **Δ > 20%** - Review code changes, profile bottlenecks
4. **Δ > 50%** - Critical regression, PR blocked

### Statistical Significance

The regression detection uses a **t-test** (p < 0.05) to filter out noise:

- **Statistically significant:** Real performance change
- **Not significant:** Random variation, ignore

If you see "Not statistically significant" in the report, the delta is likely noise.

---

## Updating the Baseline

When to update the baseline:

1. **After major optimization** - You've improved performance by 20%+
2. **After architectural change** - New routing algorithm, database schema
3. **After infrastructure upgrade** - Faster CI runners, new Node.js version

**How to update:**

```bash
# Run benchmarks on main branch
git checkout main
pnpm benchmark

# Archive current baseline
mv .benchmarks/baseline.json .benchmarks/history/baseline-$(date +%Y%m%d).json

# Promote current run to baseline
cp .benchmarks/last-run.json .benchmarks/baseline.json

# Commit new baseline
git add .benchmarks/baseline.json
git commit -m "chore: update performance baseline after optimization"
```

**⚠️ Important:** Always get PO/QA approval before updating baseline. Don't "fix" regressions by updating the baseline!

---

## Latency Breakdown Analysis

Understanding where time is spent in event propagation:

| Phase                  | Time (10-node) | % of Total |
|------------------------|----------------|------------|
| Serialization          | 5ms            | 3%         |
| Network transmission   | 80ms           | 53%        |
| Signature verification | 10ms           | 7%         |
| Database write         | 35ms           | 23%        |
| Subscription matching  | 20ms           | 13%        |
| **Total (p50)**        | **150ms**      | **100%**   |

**Optimization Targets:**
1. **Network transmission** - Consider HTTP/2, compression
2. **Database write** - Batch inserts, connection pooling
3. **Subscription matching** - Inverted index, Bloom filters

---

## Performance Trends

Track performance over time using:

```bash
pnpm benchmark:trends
```

This generates graphs showing:
- Latency trends (last 30 days)
- Throughput trends
- Resource usage trends
- Regression history

**Interpreting trends:**
- **Stable:** Good! No regressions.
- **Improving:** Optimizations working.
- **Degrading:** Investigate recent changes.

---

## Known Performance Limitations

### Current Bottlenecks

1. **Full mesh topology scales O(n²)** - 100-node mesh = 9900 connections
2. **PostgreSQL connection pool** - Limited to 20 connections per node
3. **Redis memory** - Event cache grows with subscription count
4. **Single-threaded Node.js** - CPU-bound signature verification

### Planned Optimizations (Future Work)

- **Story 12.1:** Implement hierarchical routing (reduce O(n²) connections)
- **Story 12.2:** WebAssembly signature verification (2x faster)
- **Story 12.3:** Redis sharding for horizontal scaling
- **Story 12.4:** Database connection pooling improvements

---

## CI/CD Performance Requirements

### Tier 1: Smoke Tests (5 min)
- **Target:** 3-node mesh propagation test
- **Timeout:** 5 minutes
- **Runs on:** ubuntu-latest (4 cores, 8GB RAM)

### Tier 2: Comprehensive Tests (15 min)
- **Target:** 10-node mesh full test suite
- **Timeout:** 15 minutes
- **Runs on:** ubuntu-latest (4 cores, 8GB RAM)

### Tier 3: Extended Tests (60 min)
- **Target:** 25-node mesh stress tests
- **Timeout:** 60 minutes
- **Runs on:** self-hosted (8 cores, 16GB RAM)

**Note:** 50-node and 100-node tests are manual-only (too resource-intensive for CI).

---

## Appendix: Baseline Data Schema

The baseline is stored in `.benchmarks/baseline.json`:

```json
{
  "version": "1.0.0",
  "generatedAt": "2025-12-17T10:00:00Z",
  "commitHash": "abc123",
  "baselines": {
    "10-node": {
      "latency": { "p50": 150, "p95": 400, "p99": 800, "max": 1200 },
      "throughput": { "eventsPerSec": 120, "bytesPerSec": 524288 },
      "resources": { "memoryMB": 384, "cpuPercent": 35, "connections": 9 }
    }
  }
}
```

**Fields:**
- `version` - Schema version (for future migrations)
- `generatedAt` - ISO 8601 timestamp
- `commitHash` - Git commit SHA for baseline run
- `baselines` - Per-network-size metrics

---

## References

- **Benchmark Code:** `packages/app-nostream/test/btp-nips/benchmarks/`
- **Regression Detection:** `scripts/detect-regression.ts`
- **CI/CD Workflow:** `.github/workflows/n-peer-tests.yml`
- **Troubleshooting:** `docs/qa/troubleshooting-n-peer-tests.md`
- **Developer Guide:** `docs/development/n-peer-testing.md`

---

**⚠️ Disclaimer:** Current baseline values are **placeholders from the story specification**. Actual performance must be verified by executing benchmarks on representative hardware. Update this document with real measured values before production use.
