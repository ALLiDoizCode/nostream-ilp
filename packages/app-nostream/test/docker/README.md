# Dassie Integration Testing with Docker

This directory contains Docker infrastructure for running integration tests with real Dassie ILP nodes.

## Overview

The test infrastructure spins up multiple Dassie nodes in Docker containers, creating a realistic multi-node ILP network for integration testing. This validates that BTP-NIPs works correctly with actual ILP routing, real network TCP connections, and production-like settlement.

## Directory Structure

```
test/docker/
├── README.md                              # This file
├── dassie-stack.yml                       # Main Docker Compose file
├── dassie-stack-network-constraints.yml   # Network simulation overlay
├── config/                                # Node configuration files
│   ├── node-0.json
│   ├── node-1.json
│   ├── node-2.json
│   ├── node-3.json
│   └── node-4.json
└── scripts/
    ├── init-postgres.sql                  # PostgreSQL initialization
    ├── wait-for-health.sh                 # Health check utility
    └── apply-network-constraints.sh       # Network simulation (tc)
```

## Quick Start

### Prerequisites

- Docker Desktop or Docker Engine installed and running
- Node.js 22.x
- pnpm 8.x

### Run Tests

```bash
# From monorepo root
pnpm install
pnpm --filter @nostream-ilp/app-nostream test:dassie-integration
```

The test framework will automatically:
1. Start Docker Compose stack (5 Dassie nodes + PostgreSQL + Redis)
2. Wait for all containers to be healthy
3. Run integration tests
4. Clean up containers after tests complete

## Docker Compose Files

### Main Stack: `dassie-stack.yml`

Defines the core infrastructure:
- **PostgreSQL 16**: Shared database for all nodes (separate databases per node)
- **Redis 7**: Shared cache for subscription management
- **Dassie Node 0-4**: 5 independent Dassie ILP nodes

**Network Configuration:**
- Custom bridge network: `172.20.0.0/16`
- Static IP addresses: `172.20.0.10` through `172.20.0.14`

**Resource Limits:**
- Memory: 512MB per node (configured in Dockerfile)
- CPU: 0.5 cores per node (configured in Dockerfile)

### Network Constraints: `dassie-stack-network-constraints.yml`

Optional overlay for simulating network conditions:
- Latency: 50ms per hop
- Packet loss: 0.1%
- Uses `tc` (traffic control) command inside containers

**Usage:**
```bash
docker-compose -f dassie-stack.yml -f dassie-stack-network-constraints.yml up
```

**Requirements:**
- Dassie image must include `iproute2` package
- Containers need `CAP_NET_ADMIN` capability

## Node Configuration

Each node has a JSON configuration file in `config/`:

```json
{
  "nodeId": "0",
  "ilpAddress": "g.dassie.node0",
  "rpc": {
    "port": 7768,
    "host": "0.0.0.0",
    "authToken": "test-token-node0"
  },
  "database": {
    "host": "postgres",
    "port": 5432,
    "database": "dassie_node0",
    "user": "test",
    "password": "test"
  },
  "settlement": {
    "scheme": "mock",
    "autoSettle": true,
    "threshold": 10000
  }
}
```

**Key Fields:**
- `nodeId`: Unique identifier (0-4)
- `ilpAddress`: Interledger address (g.dassie.node0, etc.)
- `rpc.port`: tRPC server port (7768-7772)
- `settlement.scheme`: "mock" for instant settlement without blockchain
- `settlement.threshold`: Auto-settle when balance exceeds 10,000 msats

## Test Framework Integration

The test framework (`test/btp-nips/n-peer/framework.ts`) provides a simple API:

```typescript
import { createTestNetwork } from '../n-peer/framework'

// Create 5-node network with real Dassie containers
const nodes = await createTestNetwork(5, {
  executionMode: 'docker',
  dockerCompose: './test/docker/dassie-stack.yml',
  dassieNodes: true,
})

// Each node has:
// - id, ilpAddress, pubkey
// - publishEvent(), subscribe(), getReceivedEvents()
// - getPeers(), sendILPPayment(), getInternalLedger()
```

## Running Tests Manually

### Start the Stack

```bash
cd packages/app-nostream/test/docker
docker-compose -f dassie-stack.yml up -d
```

Wait for all containers to be healthy (~30-60 seconds):

```bash
docker ps --filter "name=dassie-node" --format "table {{.Names}}\t{{.Status}}"
```

### Check Container Health

```bash
# All containers
docker-compose -f dassie-stack.yml ps

# Specific node logs
docker logs dassie-node-0

# Health check
docker inspect --format='{{.State.Health.Status}}' dassie-node-0
```

### Access tRPC Endpoints

```bash
# Node 0 tRPC endpoint (example)
curl -H "Authorization: Bearer test-token-node0" \
  http://localhost:7768/trpc/peers.list
```

### Stop the Stack

```bash
docker-compose -f dassie-stack.yml down -v
```

The `-v` flag removes volumes (databases) to ensure clean state for next test run.

## Troubleshooting

### Containers Fail Health Check

**Symptom:** Containers stuck in "starting" state

**Solutions:**
1. Increase health check timeout:
   ```yaml
   healthcheck:
     start_period: 60s  # Default: 30s
   ```

2. Check PostgreSQL/Redis are healthy first:
   ```bash
   docker logs dassie-test-postgres
   docker logs dassie-test-redis
   ```

3. Verify Dassie config syntax:
   ```bash
   cat config/node-0.json | jq
   ```

### Connection Refused Errors

**Symptom:** "ECONNREFUSED" or "Connection reset" in test logs

**Solutions:**
1. Verify static IPs match node configs:
   ```bash
   docker inspect dassie-node-0 | grep IPAddress
   ```

2. Check Docker network:
   ```bash
   docker network inspect n-peer-test
   ```

3. Test connectivity between containers:
   ```bash
   docker exec dassie-node-0 ping -c 3 dassie-node-1
   ```

### Tests Flaky in CI

**Symptom:** Tests pass locally but fail in GitHub Actions

**Solutions:**
1. The test framework auto-detects CI and uses relaxed timeouts:
   - Local: 500ms p95 latency
   - CI: 2000ms p95 latency

2. Increase Docker startup timeout:
   ```typescript
   beforeAll(async () => {
     nodes = await createTestNetwork(5, { ... })
   }, 90000) // 90 seconds instead of default
   ```

### Out of Memory (OOMKilled)

**Symptom:** Docker container killed with "OOMKilled" status

**Solutions:**
1. Reduce node count (test with 3 nodes instead of 5)
2. Check memory limits in docker-compose.yml
3. Verify Dassie image is optimized (multi-stage build)
4. Profile memory usage:
   ```bash
   docker stats --no-stream
   ```

### Port Already in Use

**Symptom:** "port already allocated" error

**Solutions:**
1. Clean up existing containers:
   ```bash
   docker-compose -f dassie-stack.yml down -v --remove-orphans
   ```

2. Check for conflicting processes:
   ```bash
   lsof -i :7768  # Check if port 7768 is in use
   ```

## Performance Targets

Based on Docker local network characteristics:

| Metric | Target (Dev) | Target (CI) |
|--------|--------------|-------------|
| Container startup | < 30s | < 60s |
| Health check | < 5s | < 10s |
| ILP connection | < 2s | < 5s |
| 5-hop payment | < 500ms (p95) | < 2000ms (p95) |
| Failover/reconnect | < 15s | < 30s |

## CI/CD Integration

GitHub Actions workflow: `.github/workflows/dassie-integration.yml`

**Features:**
- Runs on every PR to `main` and `epic-11` branches
- 15-minute timeout for entire test suite
- Uploads Docker logs as artifacts on failure
- Automatic cleanup of Docker resources

**Environment Variables:**
- `CI=true`: Enables relaxed timeout/latency targets

## Related Documentation

- Story 11.4: `docs/stories/11.4.story.md` (this implementation)
- Test Framework: `test/btp-nips/n-peer/framework.ts`
- BTP-NIPs Protocol: `src/btp-nips/parser.ts`
- Dassie tRPC Endpoints: Story 5.9 (`docs/stories/5.9.story.md`)

## License

MIT
