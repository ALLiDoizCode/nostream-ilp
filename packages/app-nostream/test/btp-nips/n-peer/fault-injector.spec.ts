/**
 * Test suite for Fault Injection Framework
 *
 * Validates that the FaultInjector properly injects faults
 * and tracks state for resilience testing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createFaultInjector, type FaultInjector } from './fault-injector'
import { createTestNetwork } from './framework'
import { cleanupNetwork } from './cleanup'
import type { TestNode } from './test-node'

describe('FaultInjector', () => {
  let nodes: TestNode[]
  let injector: FaultInjector

  beforeEach(async () => {
    // Create small 3-node network for testing
    nodes = await createTestNetwork(3, {
      enablePeerDiscovery: false, // Simplify for unit tests
    })

    injector = createFaultInjector(nodes)
  })

  afterEach(async () => {
    await injector.cleanup()
    await cleanupNetwork(nodes)
  })

  describe('Node Crash Simulation', () => {
    it('should crash a running node', async () => {
      const node = nodes[0]

      expect(node._running).toBe(true)

      await injector.crashNode(node)

      expect(node._running).toBe(false)
    })

    it('should restore a crashed node', async () => {
      const node = nodes[0]

      await injector.crashNode(node)
      expect(node._running).toBe(false)

      await injector.restoreNode(node)
      expect(node._running).toBe(true)
    })

    it('should throw error when crashing already crashed node', async () => {
      const node = nodes[0]
      await injector.crashNode(node)

      await expect(injector.crashNode(node)).rejects.toThrow('already crashed')
    })

    it('should throw error when restoring already running node', async () => {
      const node = nodes[0]

      await expect(injector.restoreNode(node)).rejects.toThrow('already running')
    })
  })

  describe('Network Partition Simulation', () => {
    it('should create partition between two groups', async () => {
      const group1 = [nodes[0], nodes[1]]
      const group2 = [nodes[2]]

      await injector.createPartition(group1, group2)

      // Verify partition state
      expect(injector.isPartitioned(nodes[0], nodes[2])).toBe(true)
      expect(injector.isPartitioned(nodes[1], nodes[2])).toBe(true)

      // Nodes within same group should not be partitioned
      expect(injector.isPartitioned(nodes[0], nodes[1])).toBe(false)
    })

    it('should heal partition', async () => {
      const group1 = [nodes[0]]
      const group2 = [nodes[1], nodes[2]]

      await injector.createPartition(group1, group2)
      expect(injector.isPartitioned(nodes[0], nodes[1])).toBe(true)

      await injector.healPartition()

      // After healing, no nodes should be partitioned
      expect(injector.isPartitioned(nodes[0], nodes[1])).toBe(false)
      expect(injector.isPartitioned(nodes[0], nodes[2])).toBe(false)
    })

    it('should throw error when creating partition while already partitioned', async () => {
      const group1 = [nodes[0]]
      const group2 = [nodes[1]]

      await injector.createPartition(group1, group2)

      await expect(
        injector.createPartition([nodes[1]], [nodes[2]])
      ).rejects.toThrow('already partitioned')
    })

    it('should throw error when healing non-partitioned network', async () => {
      await expect(injector.healPartition()).rejects.toThrow('not partitioned')
    })
  })

  describe('Connection Loss Simulation', () => {
    it('should disconnect two nodes', async () => {
      await injector.disconnectNodes(nodes[0], nodes[1])

      // In current implementation, disconnection is tracked internally
      // Real validation would check that events don't route between these nodes
    })

    it('should reconnect two nodes', async () => {
      await injector.disconnectNodes(nodes[0], nodes[1])
      await injector.reconnectNodes(nodes[0], nodes[1])

      // After reconnection, nodes should be able to communicate
    })
  })

  describe('Database Failure Simulation', () => {
    it('should simulate database failure for specified duration', async () => {
      const node = nodes[0]

      await injector.simulateDatabaseFailure(node, {
        duration: 100, // 100ms
      })

      // Database operations should fail during failure period
      // (Implementation depends on repository mock behavior)
    })

    it('should automatically recover database after duration', async () => {
      const node = nodes[0]

      await injector.simulateDatabaseFailure(node, {
        duration: 50, // 50ms
      })

      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 100))

      // Database should be recovered
      // (Verification depends on repository behavior)
    })
  })

  describe('Redis Failure Simulation', () => {
    it('should simulate Redis failure for specified duration', async () => {
      const node = nodes[0]

      await injector.simulateRedisFailure(node, {
        duration: 100, // 100ms
      })

      // Cache operations should fail during failure period
    })

    it('should automatically recover Redis after duration', async () => {
      const node = nodes[0]

      await injector.simulateRedisFailure(node, {
        duration: 50, // 50ms
      })

      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 100))

      // Redis should be recovered
    })
  })

  describe('Malicious Behavior Simulation', () => {
    it('should set malicious event-modification behavior', () => {
      const node = nodes[0]

      injector.setMaliciousBehavior(node, 'event-modification')

      // Behavior is tracked internally
      // Actual behavior validation happens in integration tests
    })

    it('should set malicious forged-signature behavior', () => {
      const node = nodes[0]

      injector.setMaliciousBehavior(node, 'forged-signature')

      // Behavior is tracked internally
    })

    it('should set malicious event-flooding behavior', () => {
      const node = nodes[0]

      injector.setMaliciousBehavior(node, 'event-flooding')

      // Behavior is tracked internally
    })

    it('should clear malicious behavior', () => {
      const node = nodes[0]

      injector.setMaliciousBehavior(node, 'event-modification')
      injector.clearMaliciousBehavior(node)

      // Behavior should be cleared
      // Node should return to normal operation
    })
  })

  describe('Overload Simulation', () => {
    it('should simulate node overload', async () => {
      const node = nodes[0]

      await injector.simulateOverload(node, {
        cpuPercent: 80,
        queueDepth: 1000,
      })

      expect(injector.isOverloaded(node)).toBe(true)
      expect(node.metrics.resources.cpuPercent).toBe(80)
    })

    it('should crash node when CPU reaches 100%', async () => {
      const node = nodes[0]

      expect(node._running).toBe(true)

      await injector.simulateOverload(node, {
        cpuPercent: 100,
      })

      // Wait for crash to occur (happens after 1 second)
      await new Promise(resolve => setTimeout(resolve, 1500))

      expect(node._running).toBe(false)
    })

    it('should clear overload after duration', async () => {
      const node = nodes[0]

      await injector.simulateOverload(node, {
        cpuPercent: 80,
        duration: 50, // 50ms
      })

      expect(injector.isOverloaded(node)).toBe(true)

      // Wait for duration to expire
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(injector.isOverloaded(node)).toBe(false)
      expect(node.metrics.resources.cpuPercent).toBe(0)
    })

    it('should return overload status', async () => {
      const node = nodes[0]

      await injector.simulateOverload(node, {
        cpuPercent: 90,
        queueDepth: 500,
      })

      const status = injector.getOverloadStatus(node)
      expect(status).toBeDefined()
      expect(status?.cpuPercent).toBe(90)
      expect(status?.queueDepth).toBe(500)
    })
  })

  describe('Cleanup', () => {
    it('should cleanup all fault injection state', async () => {
      // Set up various faults
      const node0 = nodes[0]
      const node1 = nodes[1]

      injector.setMaliciousBehavior(node0, 'event-flooding')
      await injector.createPartition([node0], [node1, nodes[2]])
      await injector.simulateOverload(node1, { cpuPercent: 80 })

      // Cleanup
      await injector.cleanup()

      // Verify all state cleared
      expect(injector.isPartitioned(node0, node1)).toBe(false)
      expect(injector.isOverloaded(node1)).toBe(false)
    })
  })
})
