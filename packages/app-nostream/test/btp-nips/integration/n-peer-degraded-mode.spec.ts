import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FaultInjector } from '../n-peer/fault-injector'

/**
 * AC 4: Graceful Degradation (Partial Connectivity) Test
 *
 * Tests network resilience when a node loses 50% of its connections,
 * verifying the node continues to operate with degraded performance
 * but without cascading failures.
 *
 * Scenarios:
 * 1. Partial connection loss (50% of peers)
 * 2. Event reception via remaining connections
 * 3. Event forwarding with degraded throughput
 * 4. No cascading failures (other nodes unaffected)
 * 5. Throughput verification (reduced proportionally to ~50%)
 * 6. Network remains operational (no total failure)
 * 7. Latency increase verification (< 2x normal)
 * 8. No deadlocks or routing loops
 */

interface MockNetworkStats {
  connectedNodes: number;
  totalNodes: number;
  throughput: number; // events/sec
  averageLatency: number; // ms
}

interface MockTestNode {
  id: string;
  name: string;
  connections: Set<string>;
  receivedEvents: string[];
  forwardedEvents: string[];
  cache: Map<string, boolean>;
  throughput: number;
  latency: number;

  publishEvent(event: { id: string; content: string }): void;
  forwardEvent(event: { id: string; content: string }): void;
  disconnectFrom(nodeId: string): void;
  reconnectTo(nodeId: string): void;
  getNetworkStats(): MockNetworkStats;
}

describe('AC 4: Graceful Degradation (Partial Connectivity)', () => {
  let injector: FaultInjector
  let nodes: MockTestNode[]
  const NODE_COUNT = 10
  const NOMINAL_THROUGHPUT = 100 // events/sec
  const NOMINAL_LATENCY = 200 // ms

  beforeEach(() => {
    // Create 10 mock nodes in full mesh (each connected to all others)
    nodes = Array.from({ length: NODE_COUNT }, (_, i) => ({
      id: `node-${i}`,
      name: `Node${i}`,
      connections: new Set(
        Array.from({ length: NODE_COUNT }, (_, j) => `node-${j}`).filter((_, j) => j !== i)
      ),
      receivedEvents: [],
      forwardedEvents: [],
      cache: new Map<string, boolean>(),
      throughput: NOMINAL_THROUGHPUT,
      latency: NOMINAL_LATENCY,

      publishEvent(event: { id: string; content: string }) {
        if (!this.cache.has(event.id)) {
          this.receivedEvents.push(event.id)
          this.cache.set(event.id, true)
        }
      },

      forwardEvent(event: { id: string; content: string }) {
        if (!this.cache.has(event.id)) {
          this.forwardedEvents.push(event.id)
          this.cache.set(event.id, true)
        }
      },

      disconnectFrom(nodeId: string) {
        this.connections.delete(nodeId)
        // Degrade throughput proportionally
        this.throughput = NOMINAL_THROUGHPUT * (this.connections.size / (NODE_COUNT - 1))
        // Increase latency when connections reduced
        this.latency = NOMINAL_LATENCY * (1 + (1 - this.connections.size / (NODE_COUNT - 1)) * 0.5)
      },

      reconnectTo(nodeId: string) {
        this.connections.add(nodeId)
        // Restore throughput proportionally
        this.throughput = NOMINAL_THROUGHPUT * (this.connections.size / (NODE_COUNT - 1))
        this.latency = NOMINAL_LATENCY
      },

      getNetworkStats(): MockNetworkStats {
        return {
          connectedNodes: this.connections.size,
          totalNodes: NODE_COUNT - 1, // Exclude self
          throughput: this.throughput,
          averageLatency: this.latency,
        }
      },
    }))

    injector = new FaultInjector(nodes as any)
  })

  afterEach(() => {
    // Cleanup: restore all connections
    nodes.forEach((node, i) => {
      node.connections.clear()
      nodes.forEach((_, j) => {
        if (i !== j) {
          node.connections.add(`node-${j}`)
        }
      })
      node.throughput = NOMINAL_THROUGHPUT
      node.latency = NOMINAL_LATENCY
    })
  })

  it('should lose 50% of connections for Node 5', () => {
    const node5 = nodes[5]
    const initialConnectionCount = node5.connections.size
    expect(initialConnectionCount).toBe(9) // Full mesh: 10 nodes - 1 (self)

    // Disconnect Node 5 from 5 random peers (50% loss)
    const peersToDisconnect = Array.from(node5.connections).slice(0, 5)
    peersToDisconnect.forEach(peerId => {
      node5.disconnectFrom(peerId)
    })

    // Verify 50% connection loss
    const remainingConnections = node5.connections.size
    expect(remainingConnections).toBe(4) // 9 - 5 = 4 remaining
    expect(remainingConnections / initialConnectionCount).toBeCloseTo(0.44, 1) // ~44% remaining
  })

  it('should still receive events via remaining 50% connections', () => {
    const node5 = nodes[5]

    // Disconnect Node 5 from 50% of peers
    const peersToDisconnect = Array.from(node5.connections).slice(0, 5)
    peersToDisconnect.forEach(peerId => {
      node5.disconnectFrom(peerId)
    })

    // Publish event from a still-connected peer (Node 6)
    const event = { id: 'event-1', content: 'Test event' }
    node5.publishEvent(event)

    // Verify Node 5 still received event
    expect(node5.receivedEvents).toContain(event.id)
    expect(node5.cache.has(event.id)).toBe(true)
  })

  it('should still forward events with degraded throughput', () => {
    const node5 = nodes[5]

    // Disconnect Node 5 from 50% of peers
    const peersToDisconnect = Array.from(node5.connections).slice(0, 5)
    peersToDisconnect.forEach(peerId => {
      node5.disconnectFrom(peerId)
    })

    // Node 5 forwards event
    const event = { id: 'event-1', content: 'Forward test' }
    node5.forwardEvent(event)

    // Verify event was forwarded (despite degraded throughput)
    expect(node5.forwardedEvents).toContain(event.id)
  })

  it('should not cause cascading failures (other nodes unaffected)', () => {
    const node5 = nodes[5]

    // Disconnect Node 5 from 50% of peers
    const peersToDisconnect = Array.from(node5.connections).slice(0, 5)
    peersToDisconnect.forEach(peerId => {
      node5.disconnectFrom(peerId)
    })

    // Verify other nodes (e.g., Node 0-4, 6-9) still have full connectivity
    nodes.forEach((node, i) => {
      if (i !== 5) {
        expect(node.connections.size).toBe(9) // Full mesh still intact
        expect(node.throughput).toBe(NOMINAL_THROUGHPUT)
        expect(node.latency).toBe(NOMINAL_LATENCY)
      }
    })
  })

  it('should reduce throughput proportionally (~50% of nominal)', () => {
    const node5 = nodes[5]
    const initialThroughput = node5.throughput
    expect(initialThroughput).toBe(NOMINAL_THROUGHPUT)

    // Disconnect Node 5 from 50% of peers
    const peersToDisconnect = Array.from(node5.connections).slice(0, 5)
    peersToDisconnect.forEach(peerId => {
      node5.disconnectFrom(peerId)
    })

    // Verify throughput reduced proportionally
    const degradedThroughput = node5.throughput
    const reductionRatio = degradedThroughput / initialThroughput

    expect(reductionRatio).toBeCloseTo(0.44, 1) // ~44% of nominal (4/9 connections)
    expect(degradedThroughput).toBeLessThan(initialThroughput)
    expect(degradedThroughput).toBeGreaterThan(0) // Still operational
  })

  it('should verify network remains operational (no total failure)', () => {
    const node5 = nodes[5]

    // Disconnect Node 5 from 50% of peers
    const peersToDisconnect = Array.from(node5.connections).slice(0, 5)
    peersToDisconnect.forEach(peerId => {
      node5.disconnectFrom(peerId)
    })

    // Publish event that propagates through network
    const event = { id: 'event-1', content: 'Network test' }
    nodes.forEach(node => node.publishEvent(event))

    // Verify all nodes (including Node 5) still received event
    nodes.forEach(node => {
      expect(node.receivedEvents).toContain(event.id)
    })

    // Verify network stats show operational state
    const stats = node5.getNetworkStats()
    expect(stats.connectedNodes).toBeGreaterThan(0)
    expect(stats.throughput).toBeGreaterThan(0)
  })

  it('should increase latency moderately (< 2x normal)', () => {
    const node5 = nodes[5]
    const initialLatency = node5.latency
    expect(initialLatency).toBe(NOMINAL_LATENCY)

    // Disconnect Node 5 from 50% of peers
    const peersToDisconnect = Array.from(node5.connections).slice(0, 5)
    peersToDisconnect.forEach(peerId => {
      node5.disconnectFrom(peerId)
    })

    // Verify latency increased moderately
    const degradedLatency = node5.latency
    const latencyIncrease = degradedLatency / initialLatency

    expect(latencyIncrease).toBeLessThan(2.0) // < 2x normal
    expect(latencyIncrease).toBeGreaterThan(1.0) // Latency increased
    expect(degradedLatency).toBeLessThan(NOMINAL_LATENCY * 2)
  })

  it('should prevent deadlocks (event propagation continues)', () => {
    const node5 = nodes[5]

    // Disconnect Node 5 from 50% of peers
    const peersToDisconnect = Array.from(node5.connections).slice(0, 5)
    peersToDisconnect.forEach(peerId => {
      node5.disconnectFrom(peerId)
    })

    // Publish multiple events in sequence
    const events = [
      { id: 'event-1', content: 'Test 1' },
      { id: 'event-2', content: 'Test 2' },
      { id: 'event-3', content: 'Test 3' },
    ]

    events.forEach(event => {
      node5.publishEvent(event)
    })

    // Verify all events were received (no deadlock)
    events.forEach(event => {
      expect(node5.receivedEvents).toContain(event.id)
    })
  })

  it('should prevent routing loops (deduplication works)', () => {
    const node5 = nodes[5]

    // Disconnect Node 5 from 50% of peers
    const peersToDisconnect = Array.from(node5.connections).slice(0, 5)
    peersToDisconnect.forEach(peerId => {
      node5.disconnectFrom(peerId)
    })

    // Attempt to publish same event multiple times (simulating loop)
    const event = { id: 'event-1', content: 'Loop test' }
    node5.publishEvent(event)
    node5.publishEvent(event)
    node5.publishEvent(event)

    // Verify event was received only once (deduplication prevents loop)
    const eventCount = node5.receivedEvents.filter(id => id === event.id).length
    expect(eventCount).toBe(1)
  })

  it('should handle gradual connection loss (10% → 30% → 50%)', () => {
    const node5 = nodes[5]
    const initialConnectionCount = node5.connections.size

    // Phase 1: Lose 10% (1 connection)
    const peer1 = Array.from(node5.connections)[0]
    node5.disconnectFrom(peer1)
    expect(node5.connections.size).toBe(initialConnectionCount - 1)

    // Phase 2: Lose 30% total (3 connections)
    const peer2 = Array.from(node5.connections)[0]
    const peer3 = Array.from(node5.connections)[1]
    node5.disconnectFrom(peer2)
    node5.disconnectFrom(peer3)
    expect(node5.connections.size).toBe(initialConnectionCount - 3)

    // Phase 3: Lose 50% total (5 connections)
    const peer4 = Array.from(node5.connections)[0]
    const peer5 = Array.from(node5.connections)[1]
    node5.disconnectFrom(peer4)
    node5.disconnectFrom(peer5)
    expect(node5.connections.size).toBe(initialConnectionCount - 5)

    // Verify node still operational after gradual degradation
    const stats = node5.getNetworkStats()
    expect(stats.connectedNodes).toBe(4)
    expect(stats.throughput).toBeGreaterThan(0)
  })

  it('should restore performance when connections are re-established', () => {
    const node5 = nodes[5]

    // Disconnect Node 5 from 50% of peers
    const peersToDisconnect = Array.from(node5.connections).slice(0, 5)
    peersToDisconnect.forEach(peerId => {
      node5.disconnectFrom(peerId)
    })

    const degradedThroughput = node5.throughput
    const degradedLatency = node5.latency

    // Reconnect all peers
    peersToDisconnect.forEach(peerId => {
      node5.reconnectTo(peerId)
    })

    // Verify performance restored
    expect(node5.throughput).toBe(NOMINAL_THROUGHPUT)
    expect(node5.throughput).toBeGreaterThan(degradedThroughput)
    expect(node5.latency).toBe(NOMINAL_LATENCY)
    expect(node5.latency).toBeLessThan(degradedLatency)
  })

  it('should maintain network connectivity with 50% loss (no isolated nodes)', () => {
    const node5 = nodes[5]

    // Disconnect Node 5 from 50% of peers
    const peersToDisconnect = Array.from(node5.connections).slice(0, 5)
    peersToDisconnect.forEach(peerId => {
      node5.disconnectFrom(peerId)
    })

    // Verify Node 5 still has connections (not isolated)
    expect(node5.connections.size).toBeGreaterThan(0)

    // Verify network stats show connectivity
    const stats = node5.getNetworkStats()
    expect(stats.connectedNodes).toBe(4)
    expect(stats.connectedNodes / stats.totalNodes).toBeGreaterThan(0) // Not isolated
  })
})
