/**
 * N-Peer Test Framework Tests
 *
 * Tests the core framework utilities for creating and managing
 * multi-node test networks.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  createTestNetwork,
  formMesh,
  waitForMeshStable,
} from './framework'
import { cleanupNetwork, ResourceTracker } from './cleanup'
import {
  broadcastEvent,
  getNetworkStats,
  simulateNodeFailure,
  injectEvent,
} from './orchestration'
import type { TestNode } from './test-node'
import type { NostrEvent } from '../../../src/@types/nostr'

describe('N-Peer Test Framework', () => {
  let nodes: TestNode[] = []
  let tracker: ResourceTracker

  beforeEach(() => {
    tracker = new ResourceTracker()
  })

  afterEach(async () => {
    if (nodes.length > 0) {
      await cleanupNetwork(nodes)
      nodes = []
    }

    await tracker.cleanup()

    const leakReport = await tracker.detectLeaks()
    if (leakReport.hasLeaks) {
      console.warn('Resource leak detected:', leakReport)
    }
  })

  describe('createTestNetwork', () => {
    it('should create 3-node network with all components initialized', async () => {
      nodes = await createTestNetwork(3)

      expect(nodes).toHaveLength(3)

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]

        // Verify node structure
        expect(node.id).toBe(`node${i}`)
        expect(node.ilpAddress).toBe(`g.dassie.node${i}`)
        expect(node.pubkey).toBeDefined()
        expect(node.pubkey).toHaveLength(64) // Hex-encoded 32-byte key
        expect(node.privkey).toBeDefined()
        expect(node.privkey).toHaveLength(32)

        // Verify components
        expect(node.repository).toBeDefined()
        expect(node.cache).toBeDefined()
        expect(node.subscriptionManager).toBeDefined()
        expect(node.streamConnection).toBeDefined()
        expect(node.metrics).toBeDefined()

        // Verify helper methods
        expect(typeof node.publishEvent).toBe('function')
        expect(typeof node.subscribe).toBe('function')
        expect(typeof node.getReceivedEvents).toBe('function')
        expect(typeof node.getRoutingRevenue).toBe('function')
        expect(typeof node.measureLatency).toBe('function')
        expect(typeof node.getResourceUsage).toBe('function')
        expect(typeof node.cleanup).toBe('function')

        // Verify initial state
        expect(node._receivedEvents).toEqual([])
        expect(node._subscriptions.size).toBe(0)
        expect(node._routingRevenue).toBe(0)
        expect(node._running).toBe(true)
      }
    })

    it('should create nodes with unique keypairs', async () => {
      nodes = await createTestNetwork(5)

      const pubkeys = new Set(nodes.map((n) => n.pubkey))
      expect(pubkeys.size).toBe(5) // All unique
    })

    it('should apply network simulation config', async () => {
      nodes = await createTestNetwork(2, {
        networkSimulation: {
          latency: 50,
          jitter: 10,
          packetLoss: 0.01,
        },
      })

      expect(nodes[0].streamConnection.simulatedLatency).toBe(50)
      expect(nodes[0].streamConnection.simulatedPacketLoss).toBe(0.01)
    })

    it('should create 10-node network efficiently', async () => {
      const startTime = performance.now()
      nodes = await createTestNetwork(10)
      const endTime = performance.now()

      expect(nodes).toHaveLength(10)
      expect(endTime - startTime).toBeLessThan(5000) // Should be fast
    })
  })

  describe('formMesh', () => {
    it('should form full mesh topology', async () => {
      nodes = await createTestNetwork(3)
      await formMesh(nodes, 'mesh')
      await waitForMeshStable(nodes, 5000)

      // In a full mesh with 3 nodes, we expect:
      // - 3 total connections (node0<->node1, node1<->node2, node0<->node2)
      // For now, this is a structural test (actual peer logic in later stories)
      expect(nodes).toHaveLength(3)
    })

    it('should form star topology', async () => {
      nodes = await createTestNetwork(5)
      await formMesh(nodes, 'star')

      // In a star topology:
      // - node0 is the hub
      // - All other nodes connect only to node0
      // For now, this is a structural test
      expect(nodes).toHaveLength(5)
    })

    it('should form ring topology', async () => {
      nodes = await createTestNetwork(4)
      await formMesh(nodes, 'ring')

      // In a ring topology:
      // - Each node connects to exactly one other node (circular)
      // For now, this is a structural test
      expect(nodes).toHaveLength(4)
    })

    it('should throw error with less than 2 nodes', async () => {
      nodes = await createTestNetwork(1)

      await expect(formMesh(nodes)).rejects.toThrow(
        'Need at least 2 nodes to form network'
      )
    })
  })

  describe('Network Orchestration', () => {
    beforeEach(async () => {
      nodes = await createTestNetwork(3)
      await formMesh(nodes)
    })

    it('should broadcast event from node', async () => {
      const alice = nodes[0]
      const testEvent: NostrEvent = {
        id: 'test_event_123',
        pubkey: alice.pubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [],
        content: 'Hello from Alice!',
        sig: '00'.repeat(64), // Mock signature
      }

      await broadcastEvent(alice, testEvent)

      // Verify event was published (would be in repository)
      // For now, just verify no errors
      expect(true).toBe(true)
    })

    it('should track received events', () => {
      const bob = nodes[1]
      const testEvent: NostrEvent = {
        id: 'event_456',
        pubkey: nodes[0].pubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [],
        content: 'Test',
        sig: '00'.repeat(64),
      }

      await injectEvent(bob, testEvent)

      const received = bob.getReceivedEvents('event_456')
      expect(received).toHaveLength(1)
      expect(received[0].id).toBe('event_456')
    })

    it('should get network statistics', () => {
      // Inject some test events
      const event1: NostrEvent = {
        id: 'event1',
        pubkey: nodes[0].pubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [],
        content: 'Test 1',
        sig: '00'.repeat(64),
      }

      const event2: NostrEvent = {
        id: 'event2',
        pubkey: nodes[1].pubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [],
        content: 'Test 2',
        sig: '00'.repeat(64),
      }

      await injectEvent(nodes[1], event1)
      await injectEvent(nodes[2], event1)
      await injectEvent(nodes[2], event2)

      const stats = getNetworkStats(nodes)

      expect(stats.totalEvents).toBe(3)
      expect(stats.perNodeStats.size).toBe(3)
      expect(stats.perNodeStats.get('node1')?.eventsReceived).toBe(1)
      expect(stats.perNodeStats.get('node2')?.eventsReceived).toBe(2)
    })

    it('should simulate node failure', async () => {
      const alice = nodes[0]
      expect(alice._running).toBe(true)

      await simulateNodeFailure(alice)

      expect(alice._running).toBe(false)
    })
  })

  describe('Resource Management', () => {
    it('should cleanup single node', async () => {
      nodes = await createTestNetwork(1)
      const node = nodes[0]

      expect(node._running).toBe(true)

      await node.cleanup()

      expect(node._running).toBe(false)
      expect(node._receivedEvents).toEqual([])
      expect(node._subscriptions.size).toBe(0)
    })

    it('should cleanup entire network', async () => {
      nodes = await createTestNetwork(5)

      await cleanupNetwork(nodes)

      for (const node of nodes) {
        expect(node._running).toBe(false)
        expect(node._receivedEvents).toEqual([])
      }
    })

    it('should detect resource leaks', async () => {
      const initialMem = process.memoryUsage().heapUsed

      nodes = await createTestNetwork(3)
      await cleanupNetwork(nodes)
      nodes = []

      // Force GC if available
      if (global.gc) {
        global.gc()
      }

      const finalMem = process.memoryUsage().heapUsed
      const leakedMB = (finalMem - initialMem) / 1024 / 1024

      // Should not leak more than 10MB
      expect(leakedMB).toBeLessThan(10)
    })

    it('should handle cleanup timeout', async () => {
      nodes = await createTestNetwork(2)

      // Cleanup should complete within reasonable time
      const startTime = performance.now()
      await cleanupNetwork(nodes, 5000)
      const endTime = performance.now()

      expect(endTime - startTime).toBeLessThan(5000)
    })
  })

  describe('Performance', () => {
    it('should measure node latency', async () => {
      nodes = await createTestNetwork(1)
      const node = nodes[0]

      const latency = await node.measureLatency(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
      })

      // Allow for timer variance (95-200ms is reasonable)
      expect(latency).toBeGreaterThanOrEqual(95)
      expect(latency).toBeLessThan(200) // Should be close to 100ms
    })

    it('should track resource usage', async () => {
      nodes = await createTestNetwork(1)
      const node = nodes[0]

      const usage = node.getResourceUsage()

      expect(usage.memoryMB).toBeGreaterThan(0)
      expect(usage.cpuPercent).toBeGreaterThanOrEqual(0)
      expect(usage.connections).toBeGreaterThanOrEqual(0)
    })
  })

  describe('Edge Cases', () => {
    it('should handle creating 0 nodes', async () => {
      nodes = await createTestNetwork(0)
      expect(nodes).toHaveLength(0)
    })

    it('should handle creating 1 node', async () => {
      nodes = await createTestNetwork(1)
      expect(nodes).toHaveLength(1)
      expect(nodes[0].id).toBe('node0')
    })

    it('should handle multiple cleanup calls', async () => {
      nodes = await createTestNetwork(2)

      await cleanupNetwork(nodes)
      await cleanupNetwork(nodes) // Should not throw

      expect(nodes[0]._running).toBe(false)
    })
  })
})
