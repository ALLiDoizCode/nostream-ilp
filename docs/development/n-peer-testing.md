# Developer Guide: N-Peer Testing

**Document Version:** 1.0
**Last Updated:** 2025-12-17
**Maintainer:** Dev Team

---

## Overview

This guide helps developers run, debug, and extend N-peer network tests locally. Whether you're adding a new feature, fixing a bug, or investigating a test failure, this doc has you covered.

## Prerequisites

### Required Software

- **Node.js:** v20+ (`node --version`)
- **pnpm:** v8+ (`pnpm --version`)
- **Docker:** v20+ (`docker --version`)
- **Docker Compose:** v2+ (`docker-compose --version`)

### Installation (macOS)

```bash
# Install Node.js via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Install pnpm
npm install -g pnpm

# Install Docker Desktop
# Download from: https://www.docker.com/products/docker-desktop
```

### Installation (Linux)

```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install pnpm
npm install -g pnpm

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt-get install docker-compose-plugin
```

---

## Quick Start

### 1. Clone and Setup

```bash
# Clone repository
git clone https://github.com/your-org/nostream-ilp.git
cd nostream-ilp

# Install dependencies (monorepo)
pnpm install

# Start background services
docker-compose up -d
```

### 2. Run Tests

```bash
# Run Tier 1 smoke tests (fast - 5 min)
pnpm test:n-peer:tier1

# Run Tier 2 comprehensive tests (moderate - 15 min)
pnpm test:n-peer:tier2

# Run all N-peer tests
pnpm test:n-peer

# Run benchmarks
pnpm benchmark
```

### 3. Verify Setup

```bash
# Check Docker services are running
docker ps

# Should see:
# - postgres:14
# - redis:7

# Test database connection
psql -h localhost -U postgres -d nostream_test -c "SELECT 1"

# Test Redis connection
redis-cli -h localhost ping  # Should return "PONG"
```

---

## Development Workflow

### Typical Development Loop

```bash
# 1. Start services
docker-compose up -d

# 2. Make code changes
# ... edit files in packages/app-nostream/src/ ...

# 3. Run tests (watch mode for fast feedback)
pnpm test:n-peer:watch

# 4. Debug if tests fail
DEBUG=* pnpm test:n-peer:debug

# 5. Commit when tests pass
git add .
git commit -m "feat: add new feature X"
git push
```

### Watch Mode (Recommended for TDD)

```bash
# Auto-rerun tests on file changes
pnpm test:n-peer:watch

# Press 'f' to run only failed tests
# Press 'a' to run all tests
# Press 'q' to quit
```

**Pro tip:** Keep watch mode running in a separate terminal while coding.

---

## Test Tiers Explained

### Tier 1: Smoke Tests (5 minutes)

**Purpose:** Catch obvious regressions fast

**What runs:**
- 3-node mesh: Basic event propagation
- Payment validation test
- Deduplication test

**When to run:**
- After every code change (via watch mode)
- Before committing
- Before creating a PR

**Command:**
```bash
pnpm test:n-peer:tier1
```

### Tier 2: Comprehensive Tests (15 minutes)

**Purpose:** Full test coverage before merging

**What runs:**
- 5-node mesh: Full propagation suite
- 10-node mesh: Event propagation + deduplication + TTL
- Economic flow verification (5-hop payment routing)

**When to run:**
- Before pushing to PR
- After major refactoring
- When debugging complex issues

**Command:**
```bash
pnpm test:n-peer:tier2
```

### Tier 3: Extended Tests (60 minutes)

**Purpose:** Stress testing and scalability validation

**What runs:**
- 25-node mesh: Scalability benchmarks
- 50-node mesh: Stress testing
- Performance regression analysis

**When to run:**
- Before major releases
- Monthly (to catch gradual performance drift)
- When optimizing performance

**Command:**
```bash
pnpm test:n-peer:tier3
```

**Note:** Tier 3 requires powerful hardware (16GB RAM, 8 cores). Use CI if your laptop can't handle it.

---

## Docker Environment

### Starting Services

```bash
# Start all services
docker-compose up -d

# Start specific services
docker-compose up -d postgres redis

# View logs
docker-compose logs -f postgres
docker-compose logs -f redis
```

### Stopping Services

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

### Resetting Database

```bash
# If tests are failing due to dirty database state

# Drop and recreate database
docker-compose down -v
docker-compose up -d postgres

# Wait for PostgreSQL to be ready
timeout 30 bash -c 'until pg_isready -h localhost; do sleep 1; done'

# Migrations run automatically in tests
pnpm test:n-peer
```

### Port Conflicts

If ports 5432 or 6379 are already in use:

```bash
# Find what's using the port
lsof -i :5432
lsof -i :6379

# Kill the process (if safe to do so)
kill -9 <PID>

# Or change port in docker-compose.yml
```

---

## Debugging Tests

### Enable Verbose Logging

```bash
# All debug output
DEBUG=* pnpm test:n-peer:debug

# Specific namespaces (less noisy)
DEBUG=btp-nips:*,network:* pnpm test:n-peer:debug

# Filter to one subsystem
DEBUG=btp-nips:propagation pnpm test:n-peer:debug
```

### Run Single Test File

```bash
# Run specific test file
pnpm vitest run test/btp-nips/integration/n-peer-propagation.spec.ts

# With debugging
DEBUG=* pnpm vitest run test/btp-nips/integration/n-peer-propagation.spec.ts
```

### Run Single Test Case

```typescript
// In test file, add .only to focus on one test
it.only('event propagates to all nodes', async () => {
  // ... this test will run alone ...
});
```

Then:
```bash
pnpm test:n-peer
```

**Remember to remove `.only` before committing!**

### Debugging with VS Code

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug N-Peer Tests",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["test:n-peer:debug"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "env": {
        "DEBUG": "*"
      }
    }
  ]
}
```

Then press F5 to start debugging with breakpoints.

### Debugging with Chrome DevTools

```bash
# Run with Node.js inspector
node --inspect-brk ./node_modules/.bin/vitest run test/btp-nips/integration/n-peer-propagation.spec.ts

# Open Chrome to: chrome://inspect
# Click "inspect" under Remote Target
# Use Chrome DevTools to step through code
```

---

## Understanding Test Structure

### Test Framework Utilities (Story 11.1)

All N-peer tests use these utilities from `test/btp-nips/n-peer/framework.ts`:

| Utility | Purpose | Example |
|---------|---------|---------|
| `createTestNetwork(n)` | Create N isolated test nodes | `const nodes = await createTestNetwork(10);` |
| `formMesh(nodes)` | Connect nodes in full mesh topology | `await formMesh(nodes);` |
| `cleanupNetwork(nodes)` | Tear down all nodes and resources | `await cleanupNetwork(nodes);` |
| `waitForEventPropagation(id, nodes)` | Wait for event to reach all nodes | `await waitForEventPropagation(event.id, nodes);` |
| `ResourceMonitor` | Monitor CPU/memory/network usage | `const monitor = new ResourceMonitor(nodes);` |
| `LatencyMeasurement` | Measure latency breakdown | `const latency = new LatencyMeasurement();` |

### Example Test Breakdown

```typescript
// packages/app-nostream/test/btp-nips/integration/n-peer-propagation.spec.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestNetwork, formMesh, cleanupNetwork } from '../n-peer/framework';
import { waitForEventPropagation } from '../n-peer/orchestration';

describe('Event Propagation', () => {
  let nodes = [];

  beforeEach(async () => {
    // Create 5-node network before each test
    nodes = await createTestNetwork(5);
    await formMesh(nodes); // Full mesh: each node connected to all others
  });

  afterEach(async () => {
    // Clean up after each test (prevent leaks)
    await cleanupNetwork(nodes);
    nodes = [];
  });

  it('should propagate event to all nodes', async () => {
    // Step 1: Publish event from node 0
    const event = await nodes[0].publishEvent({
      kind: 1,
      content: 'Hello, mesh!'
    });

    // Step 2: Wait for propagation (max 5 seconds)
    await waitForEventPropagation(event.id, nodes.slice(1), 5000);

    // Step 3: Verify all nodes received it
    for (const node of nodes.slice(1)) {
      expect(node.hasEvent(event.id)).toBe(true);
    }
  });
});
```

---

## Adding New Tests

### Step 1: Choose the Right File

- **Smoke tests:** `test/btp-nips/integration/n-peer-smoke.spec.ts` (Tier 1)
- **Comprehensive tests:** `test/btp-nips/integration/n-peer-comprehensive.spec.ts` (Tier 2)
- **Benchmarks:** `test/btp-nips/benchmarks/mesh-scalability.spec.ts` (Tier 3)

### Step 2: Write the Test

```typescript
// packages/app-nostream/test/btp-nips/integration/n-peer-smoke.spec.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestNetwork, formMesh, cleanupNetwork } from '../n-peer/framework';

describe('My New Feature', () => {
  let nodes = [];

  beforeEach(async () => {
    nodes = await createTestNetwork(3); // Small network for smoke test
    await formMesh(nodes);
  });

  afterEach(async () => {
    await cleanupNetwork(nodes);
  });

  it('should do something amazing', async () => {
    // Arrange
    const event = await nodes[0].publishEvent({ content: 'test' });

    // Act
    const result = await nodes[1].queryFeature(event.id);

    // Assert
    expect(result).toBe('expected value');
  });
});
```

### Step 3: Test Locally

```bash
# Run your new test
pnpm test:n-peer:tier1

# Or with watch mode
pnpm test:n-peer:watch
```

### Step 4: Verify in CI

```bash
# Push to PR branch
git add test/btp-nips/integration/n-peer-smoke.spec.ts
git commit -m "test: add test for new feature"
git push origin feature/my-new-feature

# Check CI results on GitHub
# Your test should appear in "Tier 1 Smoke Tests" job
```

---

## Running Benchmarks

### Basic Benchmark Run

```bash
# Run all benchmarks
pnpm benchmark

# Output:
# - .benchmarks/last-run.json (detailed results)
# - benchmark-report.md (human-readable summary)
# - benchmark-graphs.png (visualizations)
```

### Compare Against Baseline

```bash
# Detect performance regressions
pnpm benchmark:compare

# Output:
# ✅ No regressions detected
# OR
# ⚠️ Warning: p95 latency increased by 22%
# OR
# ❌ Failure: Throughput decreased by 55%
```

### View Historical Trends

```bash
# Generate trend graphs (last 30 days)
pnpm benchmark:trends

# Opens: .benchmarks/trends.html
```

### Benchmark a Specific Network Size

```typescript
// In packages/app-nostream/test/btp-nips/benchmarks/mesh-scalability.spec.ts

// Comment out other tests, run only 10-node benchmark
it.only('10-node mesh benchmark', async () => {
  // ...
});
```

```bash
pnpm benchmark
```

---

## Performance Profiling

### CPU Profiling

```bash
# Run with CPU profiler
node --prof ./node_modules/.bin/vitest run test/btp-nips/benchmarks/mesh-scalability.spec.ts

# Process profile
node --prof-process isolate-*.log > cpu-profile.txt

# View profile (top CPU hotspots)
cat cpu-profile.txt | head -50
```

**Look for:**
- Functions with high `ticks` count (CPU time)
- Unexpected hot paths (optimization opportunities)

### Memory Profiling

```bash
# Run with heap profiler
node --heap-prof ./node_modules/.bin/vitest run test/btp-nips/benchmarks/mesh-scalability.spec.ts

# Load .heapprofile in Chrome DevTools
# 1. Open chrome://inspect
# 2. Click "Open dedicated DevTools for Node"
# 3. Go to "Memory" tab
# 4. Click "Load" and select .heapprofile file
```

**Look for:**
- Large objects (unexpected memory usage)
- Memory leaks (objects not released)

### Flamegraph Generation (Advanced)

```bash
# Install 0x
pnpm add -g 0x

# Run with flamegraph profiler
0x pnpm test:n-peer

# Opens browser with interactive flamegraph
# Wide bars = CPU hotspots
```

---

## Troubleshooting Common Issues

### "Tests fail locally but pass in CI"

**Possible causes:**
- Local database has stale data (run `docker-compose down -v`)
- Port conflict (another service using 5432 or 6379)
- Node.js version mismatch (use Node 20)

### "Tests pass locally but fail in CI"

**Possible causes:**
- CI runner is slower (increase timeouts)
- Race condition (add `await` or increase wait time)
- Missing environment variable (check `.github/workflows/`)

### "Tests are very slow"

**Possible causes:**
- Too many nodes (reduce to 3-5 for smoke tests)
- Too many iterations (reduce for local dev)
- Docker resource limits (increase Docker Desktop memory allocation)

**See full troubleshooting guide:** `docs/qa/troubleshooting-n-peer-tests.md`

---

## Best Practices

### ✅ Do

- **Run Tier 1 tests before committing** (5 min is acceptable)
- **Use watch mode for TDD** (instant feedback)
- **Clean up resources in `afterEach()`** (prevent leaks)
- **Use `.only` when debugging** (focus on failing test)
- **Enable verbose logging when stuck** (`DEBUG=*`)
- **Add tests for new features** (TDD is your friend)

### ❌ Don't

- **Commit `.only` or `.skip`** (CI will fail or skip tests)
- **Hardcode timeouts < 5 seconds** (CI is slower than local)
- **Ignore flaky tests** (fix or quarantine them)
- **Run Tier 3 before every commit** (too slow, use CI)
- **Skip cleanup** (memory leaks will fail later tests)

---

## Useful Commands Reference

```bash
# Test commands
pnpm test:n-peer                 # Run all N-peer tests
pnpm test:n-peer:tier1           # Smoke tests (5 min)
pnpm test:n-peer:tier2           # Comprehensive (15 min)
pnpm test:n-peer:tier3           # Extended (60 min)
pnpm test:n-peer:debug           # With verbose logging
pnpm test:n-peer:watch           # Watch mode (auto-rerun)

# Benchmark commands
pnpm benchmark                   # Run benchmarks
pnpm benchmark:compare           # Detect regressions
pnpm benchmark:trends            # Historical trends (30 days)
pnpm benchmark:archive           # Archive old benchmarks

# Docker commands
docker-compose up -d             # Start all services
docker-compose down              # Stop all services
docker-compose down -v           # Stop and remove volumes
docker-compose logs -f postgres  # View PostgreSQL logs
docker-compose logs -f redis     # View Redis logs

# Database commands
psql -h localhost -U postgres -d nostream_test  # Connect to database
redis-cli -h localhost ping                      # Test Redis connection

# Profiling commands
node --prof vitest run <test>           # CPU profiling
node --heap-prof vitest run <test>      # Memory profiling
0x pnpm test:n-peer                     # Flamegraph
```

---

## File Structure Reference

```
nostream-ilp/
├── packages/
│   └── app-nostream/
│       ├── src/
│       │   └── btp-nips/          # Implementation
│       └── test/
│           └── btp-nips/
│               ├── n-peer/        # Test framework utilities
│               │   ├── framework.ts
│               │   └── orchestration.ts
│               ├── integration/   # Integration tests
│               │   ├── n-peer-smoke.spec.ts          # Tier 1
│               │   ├── n-peer-comprehensive.spec.ts  # Tier 2
│               │   └── n-peer-propagation.spec.ts
│               ├── benchmarks/    # Performance benchmarks
│               │   ├── mesh-scalability.spec.ts      # Tier 3
│               │   └── latency-distribution.spec.ts
│               └── utils/
│                   └── statistics.ts
├── scripts/                       # Benchmark utilities
│   ├── run-benchmarks.ts
│   ├── detect-regression.ts
│   ├── generate-trends.ts
│   └── benchmark-utils.ts
├── .benchmarks/                   # Benchmark data (git-tracked)
│   ├── baseline.json              # Current baseline
│   ├── last-run.json              # Latest benchmark run
│   └── history/                   # Historical archives
├── .github/
│   └── workflows/
│       └── n-peer-tests.yml       # CI/CD configuration
└── docs/
    ├── qa/
    │   ├── performance-baseline.md
    │   └── troubleshooting-n-peer-tests.md
    ├── ci-cd/
    │   └── n-peer-testing.md      # CI/CD guide
    └── development/
        └── n-peer-testing.md      # THIS FILE
```

---

## Resources

- **Performance Baseline:** `docs/qa/performance-baseline.md`
- **CI/CD Guide:** `docs/ci-cd/n-peer-testing.md`
- **Troubleshooting:** `docs/qa/troubleshooting-n-peer-tests.md`
- **Test Framework Source:** `packages/app-nostream/test/btp-nips/n-peer/framework.ts`
- **Benchmark Scripts:** `scripts/run-benchmarks.ts`

---

## Getting Help

- **Slack:** `#btp-nips-testing` channel
- **GitHub Issues:** Report bugs or request features
- **Team Standup:** Ask during daily standup
- **This Doc:** Update this guide when you find solutions!

---

**Happy testing! 🚀**
