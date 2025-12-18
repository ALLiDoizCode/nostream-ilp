# N-Peer Testing CI/CD Configuration Guide

**Document Version:** 1.0
**Last Updated:** 2025-12-17
**Maintainer:** DevOps Team
**Related Workflow:** `.github/workflows/n-peer-tests.yml`

---

## Overview

This guide documents the CI/CD configuration for automated N-peer network testing. The workflow runs BTP-NIPs integration tests and performance benchmarks on every pull request, ensuring network reliability and detecting performance regressions early.

## Three-Tier Test Strategy

Our CI/CD pipeline uses a **three-tier testing strategy** that balances speed, coverage, and resource usage:

| Tier | Name | Duration | Network Size | When It Runs | Runner |
|------|------|----------|--------------|--------------|--------|
| **1** | Smoke Tests | 5 min | 3-node | Every commit | ubuntu-latest |
| **2** | Comprehensive | 15 min | 5-10 node | Every PR | ubuntu-latest |
| **3** | Extended | 60 min | 25-50 node | Nightly / Manual | self-hosted |

### Tier 1: Smoke Tests (Fast Feedback)

**Purpose:** Catch obvious regressions quickly

**What runs:**
- 3-node mesh: Basic event propagation
- Payment validation test
- Deduplication test

**Resource requirements:**
- Memory: ~2GB
- CPU: 2-4 cores
- Docker: PostgreSQL + Redis

**Run on:**
- Every commit to PR branches
- Every push to `main`
- Manual trigger via workflow dispatch

**Example:**
```bash
# Locally
pnpm test:n-peer:tier1

# CI (automatic)
# Triggered on: pull_request, push (main)
```

### Tier 2: Comprehensive Tests (PR Gate)

**Purpose:** Full test coverage before merging

**What runs:**
- 5-node mesh: Full propagation suite
- 10-node mesh: Event propagation + deduplication + TTL
- Economic flow verification (5-hop payment routing)
- Performance benchmarks (latency, throughput, resource usage)
- Regression detection (compare against baseline)

**Resource requirements:**
- Memory: ~8GB
- CPU: 4 cores
- Docker: Full stack (PostgreSQL, Redis, Dassie mocks)

**Run on:**
- Every PR update (push to PR branch)
- Manual trigger via workflow dispatch

**PR Integration:**
- Test results posted as PR comment
- Performance regression triggers WARNING or FAILURE
- Failed tests block merge (required status check)

**Example:**
```bash
# Locally
pnpm test:n-peer:tier2
pnpm benchmark
pnpm benchmark:compare

# CI (automatic)
# Triggered on: pull_request
```

### Tier 3: Extended Tests (Nightly / On-Demand)

**Purpose:** Stress testing and long-term performance tracking

**What runs:**
- 25-node mesh: Scalability benchmarks
- 50-node mesh: Stress testing
- 100-node mesh: Extreme scale testing (skipped in CI by default)
- Performance regression analysis (30-day trends)
- Benchmark archival

**Resource requirements:**
- Memory: ~16GB
- CPU: 8+ cores
- Self-hosted runner required

**Run on:**
- Nightly (2 AM UTC via cron schedule)
- Manual trigger via workflow dispatch
- Release branches (before major releases)

**Example:**
```bash
# Locally (requires powerful hardware)
pnpm test:n-peer:tier3

# CI (automatic nightly)
# Triggered on: schedule (cron: '0 2 * * *')
```

---

## GitHub Actions Workflow Configuration

### Workflow File Location

`.github/workflows/n-peer-tests.yml`

### Trigger Configuration

```yaml
on:
  pull_request:
    branches: [main, epic-*]  # PR gate (Tier 1 + 2)
  push:
    branches: [main]           # Post-merge validation (Tier 1)
  schedule:
    - cron: '0 2 * * *'        # Nightly (Tier 3)
  workflow_dispatch:           # Manual trigger (any tier)
```

### Job Structure

#### Job 1: `tier1-smoke-tests`

**Runs on:** ubuntu-latest (4 cores, 8GB RAM)
**Timeout:** 10 minutes
**Triggers:** All events (pull_request, push, schedule, manual)

**Steps:**
1. Checkout code
2. Setup Node.js 20 with pnpm cache
3. Install dependencies (`pnpm install --frozen-lockfile`)
4. Start services (PostgreSQL, Redis via `docker-compose up -d`)
5. Run Tier 1 tests (`pnpm test:n-peer:tier1`)
6. Upload test results (artifacts)

**Status check:** Required (blocks PR merge if failed)

#### Job 2: `tier2-comprehensive-tests`

**Runs on:** ubuntu-latest (4 cores, 8GB RAM)
**Timeout:** 20 minutes
**Triggers:** pull_request only

**Steps:**
1. Checkout code
2. Setup Node.js 20 with pnpm cache
3. Install dependencies
4. Start full Docker stack (`docker-compose up -d`)
5. Run Tier 2 tests (`pnpm test:n-peer:tier2`)
6. Run benchmarks (`pnpm benchmark`)
7. Detect performance regressions (`pnpm benchmark:compare`)
8. Post PR comment with results (GitHub API via `actions/github-script`)
9. Upload benchmark results (JSON, graphs)

**Status check:** Required (blocks PR merge if failed)

**PR Comment Example:**
```
## N-Peer Benchmark Results

### 10-Node Mesh

**Latency Distribution:**
- p50: 155ms (baseline: 150ms, Δ +3.3%)
- p95: 420ms (baseline: 400ms, Δ +5.0%) ⚠️

**Verdict:** ⚠️ WARNING - p95 latency increased by 5%

**Throughput:** 118 events/sec (baseline: 120, Δ -1.7%) ✅

**Resources:**
- Memory: 390 MB (baseline: 384 MB, Δ +1.6%) ✅
- CPU: 36% (baseline: 35%, Δ +2.9%) ✅

---
**Overall:** PASS (no critical regressions)
```

#### Job 3: `tier3-extended-tests`

**Runs on:** self-hosted (8 cores, 16GB RAM)
**Timeout:** 90 minutes
**Triggers:** schedule (nightly), workflow_dispatch (manual)

**Steps:**
1. Checkout code
2. Setup Node.js 20
3. Install dependencies
4. Run Tier 3 extended tests (`pnpm test:n-peer:tier3`)
5. Run stress tests (`pnpm test:n-peer:stress`)
6. Generate performance trend report (`pnpm benchmark:trends`)
7. Archive benchmark history (`pnpm benchmark:archive`)

**Status check:** Optional (informational, doesn't block PR)

---

## Self-Hosted Runner Setup (Tier 3)

### Hardware Requirements

- **CPU:** 8+ cores
- **Memory:** 16GB+ RAM
- **Storage:** 100GB SSD
- **Network:** Stable connection (minimal latency variance)

### Installation Steps

1. **Install GitHub Actions Runner**

```bash
# Create runner directory
mkdir -p ~/actions-runner && cd ~/actions-runner

# Download latest runner
curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz

# Extract
tar xzf actions-runner-linux-x64.tar.gz

# Configure (get token from GitHub repo settings)
./config.sh --url https://github.com/your-org/nostream-ilp \
  --token YOUR_RUNNER_TOKEN \
  --name n-peer-runner \
  --labels self-hosted,linux,x64,n-peer

# Install as service
sudo ./svc.sh install
sudo ./svc.sh start
```

2. **Install Dependencies**

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm
npm install -g pnpm

# Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Docker Compose
sudo apt-get install docker-compose-plugin
```

3. **Verify Setup**

```bash
# Check runner status
sudo ./svc.sh status

# Test workflow
# Manually trigger workflow_dispatch and select Tier 3
```

---

## Docker Compose Services

### Required Services

**For Tier 1 (Smoke):**
```yaml
services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_PASSWORD: password
      POSTGRES_DB: nostream_test
    ports:
      - "5432:5432"

  redis:
    image: redis:7
    ports:
      - "6379:6379"
```

**For Tier 2 (Comprehensive):**
```yaml
services:
  postgres:  # Same as Tier 1
  redis:     # Same as Tier 1

  # Additional services can be added here for full integration
```

### CI Environment Variables

Set these in GitHub repository secrets:

```yaml
env:
  DATABASE_URL: postgresql://postgres:password@localhost:5432/nostream_test
  REDIS_URL: redis://localhost:6379
  NODE_ENV: test
  CI: true
```

---

## Interpreting CI/CD Results

### Test Result Status Checks

GitHub shows status checks on every PR:

✅ **Tier 1 Smoke Tests: Passed**
- All basic tests passed
- Safe to proceed to Tier 2

⚠️ **Tier 2 Comprehensive Tests: Warning**
- Tests passed but performance regression detected
- Review benchmark report in PR comment
- Decide: acceptable trade-off or needs optimization?

❌ **Tier 2 Comprehensive Tests: Failed**
- Critical regression (>50% latency increase) OR test failure
- PR merge blocked
- Fix required before merge

### Performance Regression Severity

| Icon | Meaning | Action Required |
|------|---------|-----------------|
| ✅   | No regression | None - good to merge |
| ⚠️   | Warning (20-50%) | Review change, document if intentional |
| ❌   | Failure (>50%) | Fix regression before merge |

### Manual Override (Emergency Use Only)

If you're confident a regression is acceptable or tests are flaky:

1. **Get approval** from QA lead or team lead
2. **Add label** `override-performance-check` to PR
3. **Document reason** in PR description
4. **Merge** will be unblocked

**⚠️ Use sparingly** - overrides defeat the purpose of CI!

---

## Troubleshooting CI Failures

### Common Issues

#### 1. "Tests timed out after 5 minutes"

**Cause:** CI runner is slower than expected (resource contention)

**Fix:**
- Increase timeout in workflow file (e.g., `timeout-minutes: 10`)
- OR reduce test scope (fewer iterations)

#### 2. "Docker service not ready"

**Cause:** PostgreSQL or Redis not fully started before tests run

**Fix:**
```yaml
- name: Wait for services
  run: |
    timeout 30 bash -c 'until pg_isready -h localhost; do sleep 1; done'
    timeout 30 bash -c 'until redis-cli -h localhost ping; do sleep 1; done'
```

#### 3. "Performance regression detected (false positive)"

**Cause:** CI runner had high load, skewed results

**Fix:**
- Re-run workflow (transient issue)
- Check statistical significance in report (p-value)
- If consistently flaky, increase regression threshold (20% → 30%)

#### 4. "Out of memory (OOM)"

**Cause:** Too many nodes for CI runner resources

**Fix:**
- Reduce node count (e.g., 10-node → 5-node for Tier 2)
- OR upgrade to larger runner (8GB → 16GB)
- OR move test to Tier 3 (self-hosted)

See detailed troubleshooting guide: `docs/qa/troubleshooting-n-peer-tests.md`

---

## Maintenance Tasks

### Weekly

- [ ] Review flake rate (should be < 5%)
- [ ] Check for consistently slow tests (optimize if > 2x baseline)

### Monthly

- [ ] Review trend graphs (30-day performance history)
- [ ] Archive old benchmark data (> 90 days)
- [ ] Update baseline if major optimization landed

### After Major Changes

- [ ] Run full Tier 3 suite manually
- [ ] Verify no regressions in 25-node and 50-node tests
- [ ] Update baseline if performance improved significantly

---

## Performance Baseline Management

### When to Update Baseline

✅ **Do update:**
- After proven optimization (20%+ improvement)
- After major architectural change (new algorithm)
- After infrastructure upgrade (faster CI runners)

❌ **Don't update:**
- To "fix" a regression (hiding problems!)
- Without QA approval
- After flaky one-off improvement

### How to Update

```bash
# On main branch, run benchmarks
git checkout main
pnpm benchmark

# Archive old baseline
mv .benchmarks/baseline.json .benchmarks/history/baseline-$(date +%Y%m%d).json

# Promote current run
cp .benchmarks/last-run.json .benchmarks/baseline.json

# Commit with approval
git add .benchmarks/baseline.json
git commit -m "chore: update performance baseline after optimization X"
```

**Require:** PO or QA lead approval before merging.

---

## Local Testing vs. CI

### Differences to Expect

| Metric | Local (M1 Mac) | CI (ubuntu-latest) | Ratio |
|--------|----------------|-------------------|-------|
| p95 latency | 200ms | 400ms | 2x |
| Throughput | 200 evt/s | 100 evt/s | 0.5x |
| Memory | 300 MB | 384 MB | 1.3x |

**Why?**
- CI runners: Shared CPU, slower disk I/O
- Network: Localhost vs. Docker bridge
- Variability: Higher in CI (other jobs running)

**Recommendation:** Use CI baselines as source of truth, not local results.

---

## Adding New Tests to CI

### Step 1: Write Test

Add to appropriate file:
- Tier 1: `test/btp-nips/integration/n-peer-smoke.spec.ts`
- Tier 2: `test/btp-nips/integration/n-peer-comprehensive.spec.ts`
- Tier 3: `test/btp-nips/benchmarks/mesh-scalability.spec.ts`

### Step 2: Test Locally

```bash
# Run tier locally
pnpm test:n-peer:tier1  # or tier2, tier3
```

### Step 3: Verify CI Integration

```bash
# Push to PR branch
git push origin feature/my-new-test

# Watch CI run on GitHub
# Check: Test appears in logs, results posted
```

### Step 4: Adjust Timeouts (if needed)

If test is slow:
```typescript
it('my new slow test', async () => {
  // ...
}, 60000); // 60 second timeout
```

And increase workflow timeout:
```yaml
timeout-minutes: 20  # was 15
```

---

## References

- **Performance Baseline:** `docs/qa/performance-baseline.md`
- **Troubleshooting Guide:** `docs/qa/troubleshooting-n-peer-tests.md`
- **Developer Guide:** `docs/development/n-peer-testing.md`
- **Workflow File:** `.github/workflows/n-peer-tests.yml`
- **Benchmark Scripts:** `scripts/run-benchmarks.ts`, `scripts/detect-regression.ts`

---

## Appendix: Workflow YAML Reference

### Complete Workflow Structure

```yaml
name: N-Peer Integration Tests

on:
  pull_request:
    branches: [main, epic-*]
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:

jobs:
  tier1-smoke-tests:
    name: Tier 1 - Smoke Tests (5 min)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Start services
        run: docker-compose up -d postgres redis
      - name: Run tests
        run: pnpm test:n-peer:tier1
      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: tier1-results
          path: test-results/

  tier2-comprehensive-tests:
    name: Tier 2 - Comprehensive (15 min)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    if: github.event_name == 'pull_request'
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Start services
        run: docker-compose up -d
      - name: Run tests
        run: pnpm test:n-peer:tier2
      - name: Run benchmarks
        run: pnpm benchmark
      - name: Detect regression
        run: pnpm benchmark:compare
      - name: Post PR comment
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const report = fs.readFileSync('benchmark-report.md', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: report
            });
      - name: Upload artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: tier2-results
          path: |
            benchmark-results.json
            benchmark-graphs.png

  tier3-extended-tests:
    name: Tier 3 - Extended (60 min)
    runs-on: self-hosted
    timeout-minutes: 90
    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Run extended tests
        run: pnpm test:n-peer:tier3
      - name: Generate trends
        run: pnpm benchmark:trends
      - name: Archive benchmarks
        run: pnpm benchmark:archive
```

---

**For questions or issues, contact DevOps team or file an issue in the repository.**
