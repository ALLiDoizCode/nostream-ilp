# Docker Network Simulation Guide (Story 11.7)

This guide explains how to use Docker network simulation for testing BTP-NIPs and ILP behavior under realistic network conditions.

## Overview

The network simulation infrastructure uses Linux `tc` (traffic control) to simulate:
- **Latency**: Artificial delay added to all network packets
- **Jitter**: Variation in latency (±ms)
- **Packet Loss**: Random packet drops at configurable rate

## Quick Start

### Using Docker Compose Override

The simplest way to enable network simulation is using the Docker Compose override file:

```bash
# Start stack with network simulation
docker-compose -f dassie-stack.yml -f dassie-stack-network-constraints.yml up -d

# Check logs to verify simulation applied
docker logs dassie-node-0 | grep "network simulation"

# Run tests
pnpm test packages/app-nostream/test/btp-nips/integration/network-simulation.spec.ts

# Stop and cleanup
docker-compose -f dassie-stack.yml -f dassie-stack-network-constraints.yml down -v
```

### Using Test Framework

Programmatically configure network simulation in your tests:

```typescript
import { createTestNetwork } from '../n-peer/framework'

const nodes = await createTestNetwork(5, {
  executionMode: 'docker',
  dockerCompose: './test/docker/dassie-stack.yml',
  dassieNodes: true,
  networkSimulation: {
    latency: 50,      // 50ms base latency
    jitter: 10,       // ±10ms jitter
    packetLoss: 0.02  // 2% packet loss
  }
})

// Network conditions are automatically verified before tests run
// Run your tests here

await cleanupDockerNetwork(nodes, './test/docker/dassie-stack.yml')
```

## Configuration

### Environment Variables

Each Dassie container supports these environment variables:

| Variable | Format | Example | Description |
|----------|--------|---------|-------------|
| `NETWORK_LATENCY` | `{n}ms` | `50ms` | Base network latency |
| `NETWORK_JITTER` | `{n}ms` | `10ms` | Latency variation (stddev) |
| `NETWORK_PACKET_LOSS` | `{n}%` | `2%` | Packet loss percentage |

### Docker Compose Configuration

Add to `docker-compose.yml` or use override file:

```yaml
services:
  dassie-node-0:
    cap_add:
      - NET_ADMIN  # Required for tc command
    environment:
      NETWORK_LATENCY: "50ms"
      NETWORK_JITTER: "10ms"
      NETWORK_PACKET_LOSS: "2%"
```

### Network Topology

The Docker network uses:
- **Driver**: bridge
- **Bridge Name**: `br-dassie-test`
- **Subnet**: `172.20.0.0/24`
- **Gateway**: `172.20.0.1`

Static IP assignments:
- `dassie-node-0`: `172.20.0.10`
- `dassie-node-1`: `172.20.0.11`
- `dassie-node-2`: `172.20.0.12`
- `dassie-node-3`: `172.20.0.13`
- `dassie-node-4`: `172.20.0.14`

## How It Works

### 1. Container Startup

When a Dassie container starts:

1. **Entrypoint script** (`/usr/local/bin/entrypoint.sh`) runs as root
2. **Network simulation script** (`/usr/local/bin/apply-network-sim.sh`) reads environment variables
3. **tc qdisc** rules applied to `eth0` interface using `netem` module
4. Container drops to `node` user and starts Dassie

### 2. Traffic Control (tc)

The `tc` command configures packet queueing:

```bash
# Apply latency (50ms) + jitter (10ms) + packet loss (2%)
tc qdisc add dev eth0 root netem delay 50ms 10ms loss 2%

# View current configuration
tc qdisc show dev eth0

# Remove simulation
tc qdisc del dev eth0 root
```

### 3. Network Verification

Before running tests, the framework verifies network conditions:

1. **Ping test** between containers (100 packets)
2. **Parse statistics**: latency, jitter (stddev), packet loss
3. **Compare to expected** values with tolerances:
   - Latency: ±10%
   - Packet loss: ±2%
   - Jitter: ±3ms

If verification fails, tests abort with diagnostic info.

## Scripts

### apply-network-sim.sh

Located at: `packages/app-nostream/test/docker/scripts/apply-network-sim.sh`

Reads environment variables and applies tc rules:

```bash
#!/bin/bash
set -e

# Read configuration from environment
LATENCY=${NETWORK_LATENCY:-0ms}
JITTER=${NETWORK_JITTER:-0ms}
PACKET_LOSS=${NETWORK_PACKET_LOSS:-0%}

# Apply tc rules if any simulation enabled
if [ "$LATENCY" != "0ms" ] || [ "$PACKET_LOSS" != "0%" ]; then
  echo "Applying network simulation: latency=$LATENCY jitter=$JITTER loss=$PACKET_LOSS"

  if ! tc qdisc add dev eth0 root netem \
    delay $LATENCY $JITTER \
    loss $PACKET_LOSS; then
    echo "ERROR: Failed to apply network simulation (tc command failed)"
    echo "Ensure container has CAP_NET_ADMIN capability"
    exit 1
  fi

  echo "✓ Network simulation applied"
else
  echo "Network simulation disabled"
fi
```

### dassie-entrypoint.sh

Located at: `docker/scripts/dassie-entrypoint.sh`

Orchestrates startup:

```bash
#!/bin/bash
set -e

# Apply network simulation if configured
if [ -f /usr/local/bin/apply-network-sim.sh ]; then
  /usr/local/bin/apply-network-sim.sh || {
    echo "Warning: Network simulation script failed, continuing anyway..."
  }
fi

# Switch to node user and execute the main command
exec su-exec node "$@"
```

## API Reference

### createTestNetwork()

```typescript
interface NetworkSimulationConfig {
  latency?: number      // Latency in milliseconds
  jitter?: number       // Jitter in milliseconds
  packetLoss?: number   // Packet loss rate (0.0 to 1.0)
}

await createTestNetwork(nodeCount: number, config?: {
  executionMode: 'docker',
  dockerCompose: string,
  dassieNodes: boolean,
  networkSimulation?: NetworkSimulationConfig
})
```

### verifyNetworkConditions()

```typescript
await verifyNetworkConditions(
  nodes: TestNode[],
  expectedLatency: number,
  expectedPacketLoss: number,
  expectedJitter?: number
): Promise<boolean>
```

Returns `true` if measured conditions match expected values within tolerances.

### cleanupNetworkSimulation()

```typescript
await cleanupNetworkSimulation(nodes: TestNode[]): Promise<void>
```

Removes tc qdisc rules from all containers, restoring normal network behavior.

## Troubleshooting

### "ERROR: Failed to apply network simulation (tc command failed)"

**Cause**: Container missing `CAP_NET_ADMIN` capability

**Solution**: Add to `docker-compose.yml`:

```yaml
services:
  dassie-node-0:
    cap_add:
      - NET_ADMIN
```

### "tc: command not found"

**Cause**: `iproute2` package not installed in Docker image

**Solution**: Already fixed in `docker/Dockerfile.dassie`:

```dockerfile
RUN apk add --no-cache iproute2
```

### "RTNETLINK answers: File exists"

**Cause**: tc qdisc rules already exist from previous run

**Solution**: Clean up before running tests:

```bash
# Remove existing rules
docker exec dassie-node-0 tc qdisc del dev eth0 root 2>/dev/null || true

# Or use cleanup function
await cleanupNetworkSimulation(nodes)
```

### Verification fails with "conditions do not match expected values"

**Debugging**:

```bash
# Check if tc rules applied
docker exec dassie-node-0 tc qdisc show dev eth0

# Run manual ping test
docker exec dassie-node-0 ping -c 100 172.20.0.11
```

**Common causes**:
- Network conditions too extreme (>200ms latency, >10% packet loss)
- Insufficient ping samples (increase count)
- Container networking issues

## Performance Impact

Expected performance characteristics:

| Condition | Event Propagation Latency | Throughput | Notes |
|-----------|--------------------------|------------|-------|
| **Baseline** (no simulation) | ~10ms | 1000+ events/sec | In-memory processing |
| **50ms latency** | ~60ms | ~500 events/sec | Limited by RTT |
| **5% packet loss** | ~10-50ms | ~950 events/sec | 5% need retry |
| **50ms + 10ms jitter + 2% loss** | ~40-70ms | ~450 events/sec | Combined impact |

## Examples

### Simulating Satellite Link (High Latency)

```typescript
const nodes = await createTestNetwork(3, {
  executionMode: 'docker',
  dockerCompose: './test/docker/dassie-stack.yml',
  networkSimulation: {
    latency: 250,    // 250ms (typical satellite RTT)
    jitter: 50,      // ±50ms
    packetLoss: 0.01 // 1% loss
  }
})
```

### Simulating Mobile Network (High Jitter)

```typescript
const nodes = await createTestNetwork(3, {
  executionMode: 'docker',
  dockerCompose: './test/docker/dassie-stack.yml',
  networkSimulation: {
    latency: 100,    // 100ms base
    jitter: 30,      // ±30ms (high variance)
    packetLoss: 0.03 // 3% loss
  }
})
```

### Simulating Congested Network (Packet Loss)

```typescript
const nodes = await createTestNetwork(3, {
  executionMode: 'docker',
  dockerCompose: './test/docker/dassie-stack.yml',
  networkSimulation: {
    latency: 50,     // 50ms
    jitter: 10,      // ±10ms
    packetLoss: 0.10 // 10% loss (severe congestion)
  }
})
```

## References

- **Linux tc manual**: https://man7.org/linux/man-pages/man8/tc.8.html
- **netem (Network Emulator)**: https://wiki.linuxfoundation.org/networking/netem
- **Docker Networking**: https://docs.docker.com/compose/networking/
- **Story 11.7**: `docs/stories/11.7.story.md`

---

*Last Updated: 2025-12-18*
*Story: 11.7 - Docker Network Simulation Infrastructure*
