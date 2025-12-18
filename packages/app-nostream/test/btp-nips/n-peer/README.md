# N-Peer Test Framework

Reusable test framework for spinning up N independent BTP-NIPs nodes and verifying protocol behavior in realistic multi-node mesh networks.

## Overview

This framework provides utilities for:
- Creating N-node test networks with full BTP-NIPs stack
- Forming different network topologies (mesh, star, ring)
- Broadcasting events and verifying propagation
- Measuring performance metrics (latency, throughput, resources)
- Simulating network conditions (latency, jitter, packet loss)
- Simulating node failures and network partitions
- Detecting resource leaks

## Quick Start

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestNetwork,
  formMesh,
  waitForMeshStable,
} from './n-peer/framework';
import { cleanupNetwork } from './n-peer/cleanup';
import { broadcastEvent, waitForEventPropagation } from './n-peer/orchestration';

describe('My BTP-NIPs Test', () => {
  let nodes: TestNode[];

  beforeEach(async () => {
    // Create 5-node test network
    nodes = await createTestNetwork(5, {
      enablePeerDiscovery: true,
      networkTopology: 'mesh',
      networkSimulation: {
        latency: 50,        // 50ms network delay
        jitter: 10,         // ±10ms jitter
        packetLoss: 0.001   // 0.1% packet loss
      }
    });

    // Form full mesh network
    await formMesh(nodes);

    // Wait for network stability
    await waitForMeshStable(nodes, 30000);
  });

  afterEach(async () => {
    await cleanupNetwork(nodes);
  });

  it('should propagate event to all nodes', async () => {
    const alice = nodes[0];
    const event = {
      id: 'test_event_123',
      pubkey: alice.pubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: 'Hello world!',
      sig: '00'.repeat(64)
    };

    await broadcastEvent(alice, event);
    await waitForEventPropagation(event.id, nodes.slice(1), 5000);

    for (const node of nodes.slice(1)) {
      const received = node.getReceivedEvents(event.id);
      expect(received).toHaveLength(1);
    }
  });
});
```

## API Reference

### Framework Functions

#### `createTestNetwork(nodeCount, config?)`

Create an N-node test network with full BTP-NIPs stack.

**Parameters:**
- `nodeCount` (number): Number of nodes to create
- `config` (TestNetworkConfig, optional): Network configuration

**Returns:** `Promise<TestNode[]>` - Array of initialized test nodes

**Example:**
```typescript
const nodes = await createTestNetwork(10, {
  networkTopology: 'mesh',
  networkSimulation: {
    latency: 50,
    packetLoss: 0.01
  }
});
```

#### `formMesh(nodes, topology?)`

Establish peer connections between nodes based on topology.

**Parameters:**
- `nodes` (TestNode[]): Array of test nodes
- `topology` ('mesh' | 'star' | 'ring', default: 'mesh'): Network topology

**Topologies:**
- **mesh**: Full mesh (all-to-all connections)
- **star**: Hub-and-spoke (node0 is hub, all others connect to it)
- **ring**: Circular connections (node0 <-> node1 <-> ... <-> node0)

**Example:**
```typescript
await formMesh(nodes, 'star');
```

#### `waitForMeshStable(nodes, timeout?)`

Wait for mesh network to stabilize (all peers connected).

**Parameters:**
- `nodes` (TestNode[]): Array of test nodes
- `timeout` (number, default: 30000): Maximum wait time in milliseconds

**Throws:** Error if network doesn't stabilize within timeout

**Example:**
```typescript
await waitForMeshStable(nodes, 10000);
```

### Orchestration Functions

#### `broadcastEvent(node, event)`

Broadcast a Nostr event from a specific node.

**Parameters:**
- `node` (TestNode): Node to publish from
- `event` (NostrEvent): Nostr event to broadcast

**Example:**
```typescript
await broadcastEvent(alice, event);
```

#### `waitForEventPropagation(eventId, nodes, timeout?)`

Wait for event to propagate to all specified nodes.

**Parameters:**
- `eventId` (string): Event ID to wait for
- `nodes` (TestNode[]): Nodes that should receive the event
- `timeout` (number, default: 5000): Maximum wait time in milliseconds

**Throws:** Error with diagnostic info if event doesn't propagate

**Example:**
```typescript
await waitForEventPropagation(event.id, [bob, carol], 5000);
```

#### `getNetworkStats(nodes)`

Get aggregated network statistics across all nodes.

**Returns:** `NetworkStats` - Network-wide statistics

**Example:**
```typescript
const stats = getNetworkStats(nodes);
console.log(`Total events: ${stats.totalEvents}`);
console.log(`Avg latency: ${stats.avgLatency}ms`);
console.log(`Peak latency: ${stats.peakLatency}ms`);
```

#### `simulateNodeFailure(node)`

Gracefully disconnect a node from the network.

**Parameters:**
- `node` (TestNode): Node to fail

**Example:**
```typescript
await simulateNodeFailure(alice);
expect(alice._running).toBe(false);
```

#### `partitionNetwork(group1, group2)`

Create a network partition (group1 cannot communicate with group2).

**Parameters:**
- `group1` (TestNode[]): First partition group
- `group2` (TestNode[]): Second partition group

**Example:**
```typescript
await partitionNetwork([alice, bob], [carol, dave]);
```

### Cleanup Functions

#### `cleanupNode(node)`

Cleanup a single test node and release all resources.

**Parameters:**
- `node` (TestNode): Node to cleanup

**Example:**
```typescript
await cleanupNode(alice);
```

#### `cleanupNetwork(nodes, timeout?)`

Cleanup entire test network and release all resources.

**Parameters:**
- `nodes` (TestNode[]): Array of test nodes
- `timeout` (number, default: 30000): Maximum cleanup time

**Example:**
```typescript
await cleanupNetwork(nodes);
```

### Monitoring Classes

#### `LatencyMeasurement`

Track operation timing with detailed breakdown.

**Methods:**
- `mark(label)`: Mark a timestamp
- `measure(label, startLabel)`: Measure duration between labels
- `getBreakdown()`: Get latency breakdown

**Example:**
```typescript
const latency = new LatencyMeasurement();
latency.mark('start');

// ... do work ...
latency.mark('serialized');

// ... do more work ...
latency.mark('end');

const breakdown = latency.getBreakdown();
console.log(`Total: ${breakdown.total}ms`);
```

#### `ResourceMonitor`

Track resource usage across nodes.

**Methods:**
- `start(intervalMs?)`: Start monitoring
- `stop()`: Stop monitoring
- `getAverageMetrics()`: Get average resource usage
- `getNodeMetrics(nodeId)`: Get metrics for specific node
- `getPeakMetrics()`: Get peak resource usage

**Example:**
```typescript
const monitor = new ResourceMonitor(nodes);
monitor.start(1000); // Sample every 1 second

// ... run tests ...

monitor.stop();
const avgMetrics = monitor.getAverageMetrics();
console.log(`Avg memory: ${avgMetrics.memoryMB}MB`);
```

#### `ResourceTracker`

Track resources for leak detection.

**Methods:**
- `trackContainer(container)`: Track a Testcontainer
- `trackConnection(connection)`: Track a connection
- `cleanup(timeout?)`: Cleanup all tracked resources
- `detectLeaks()`: Detect resource leaks

**Example:**
```typescript
const tracker = new ResourceTracker();
tracker.trackContainer(pgContainer);

// ... run tests ...

await tracker.cleanup();
const leakReport = await tracker.detectLeaks();
expect(leakReport.hasLeaks).toBe(false);
```

## Configuration

### TestNetworkConfig

```typescript
interface TestNetworkConfig {
  nodeCount: number;
  enablePeerDiscovery?: boolean;      // Default: true
  networkTopology?: 'mesh' | 'star' | 'ring';  // Default: 'mesh'
  networkSimulation?: {
    latency?: number;     // Simulated network delay (ms)
    jitter?: number;      // Network jitter (ms)
    packetLoss?: number;  // Packet loss rate (0.0-1.0)
  };
  faultInjection?: FaultConfig;
}
```

### TestNode Interface

```typescript
interface TestNode {
  id: string;                   // Unique node identifier
  ilpAddress: string;           // ILP address
  pubkey: string;               // Nostr public key (hex)
  privkey: Buffer;              // Nostr private key

  // Components
  repository: EventRepository;
  cache: EventCache;
  subscriptionManager: SubscriptionManager;
  peerDiscovery: PeerDiscoveryService;
  streamConnection: MockStreamConnection;

  // Metrics
  metrics: PerformanceMetrics;

  // Helper methods
  publishEvent(event: NostrEvent): Promise<void>;
  subscribe(filters: NostrFilter[]): Promise<string>;
  getReceivedEvents(eventId?: string): NostrEvent[];
  getRoutingRevenue(): number;
  measureLatency(operation: () => Promise<void>): Promise<number>;
  getResourceUsage(): ResourceMetrics;
  cleanup(): Promise<void>;
}
```

## Troubleshooting

### Tests timeout waiting for mesh stability

**Problem:** `waitForMeshStable()` times out

**Solutions:**
- Increase timeout: `await waitForMeshStable(nodes, 60000)`
- Check if peer discovery is enabled: `enablePeerDiscovery: true`
- Verify network topology is valid

### Resource leak detected

**Problem:** `ResourceTracker.detectLeaks()` reports leaks

**Solutions:**
- Ensure `cleanupNetwork()` is called in `afterEach()`
- Check for unclosed connections: `leakReport.unclosedConnections`
- Verify all Testcontainers are stopped: `leakReport.unclosedContainers`
- Run tests with `--expose-gc` to enable garbage collection

### Events not propagating

**Problem:** `waitForEventPropagation()` times out

**Solutions:**
- Verify mesh is stable before broadcasting: `await waitForMeshStable(nodes)`
- Check event is published: `await broadcastEvent(node, event)`
- Increase timeout: `await waitForEventPropagation(eventId, nodes, 10000)`
- Use `injectEvent()` for testing without actual propagation

### Tests are slow

**Problem:** 10-node test takes > 30 seconds

**Solutions:**
- Use in-process execution (current default)
- Reduce network simulation latency
- Use smaller node counts for unit tests
- Run tests in parallel: `vitest --pool=threads`

## Performance Benchmarks

Expected performance on standard hardware (M1 MacBook Pro):

| Operation | Time |
|-----------|------|
| Create 10-node network | < 5 seconds |
| Form full mesh (10 nodes) | < 1 second |
| Wait for mesh stable | < 2 seconds |
| Event propagation (10 nodes) | < 500ms |
| Network cleanup | < 3 seconds |

## Future Enhancements

**Story 11.4** will add:
- Real Dassie integration (replacing mocks)
- Docker container execution mode
- True ILP STREAM connections
- Multi-settlement ledger support

## See Also

- Story 11.2: N-Peer Event Propagation Tests
- Story 11.3: Economic Flow Verification Tests
- Story 11.4: Real Dassie Integration
- Story 11.5: Network Resilience Tests
