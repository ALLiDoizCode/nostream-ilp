/**
 * Network orchestration utilities for N-peer testing
 */

import type { TestNode } from './test-node'
import type { NostrEvent } from '../../../src/@types/nostr'
import type { NetworkStats, NodeStats } from './config'

/**
 * Broadcast a Nostr event from a specific node
 *
 * @param node - Node to publish from
 * @param event - Nostr event to broadcast
 */
export async function broadcastEvent(
  node: TestNode,
  event: NostrEvent
): Promise<void> {
  if (!node._running) {
    throw new Error(`Node ${node.id} is not running`)
  }

  await node.publishEvent(event)
}

/**
 * Wait for event to propagate to all specified nodes
 *
 * @param eventId - Event ID to wait for
 * @param nodes - Nodes that should receive the event
 * @param timeout - Maximum wait time in milliseconds (default: 5000)
 */
export async function waitForEventPropagation(
  eventId: string,
  nodes: TestNode[],
  timeout = 5000
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    const allReceived = nodes.every((node) => {
      const events = node.getReceivedEvents(eventId)
      return events.length > 0
    })

    if (allReceived) {
      return
    }

    // Wait before next check
    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  // Timeout - provide diagnostic info
  const missing = nodes.filter((node) => {
    const events = node.getReceivedEvents(eventId)
    return events.length === 0
  })

  throw new Error(
    `Event ${eventId} not propagated to all nodes within ${timeout}ms. ` +
      `Missing nodes: ${missing.map((n) => n.id).join(', ')}`
  )
}

/**
 * Get aggregated network statistics
 *
 * @param nodes - Array of test nodes
 * @returns Network-wide statistics
 */
export function getNetworkStats(nodes: TestNode[]): NetworkStats {
  const perNodeStats = new Map<string, NodeStats>()
  let totalEvents = 0
  const totalMessages = 0
  const totalBytes = 0
  let totalLatency = 0
  let peakLatency = 0

  for (const node of nodes) {
    const nodeStats: NodeStats = {
      nodeId: node.id,
      eventsPublished: 0, // TODO: Track in node
      eventsReceived: node._receivedEvents.length,
      messagesSent: 0, // TODO: Track in node
      messagesReceived: 0, // TODO: Track in node
      peerCount: 0, // TODO: Get from peer discovery
      metrics: node.metrics,
    }

    perNodeStats.set(node.id, nodeStats)

    totalEvents += nodeStats.eventsReceived
    totalLatency += node.metrics.latency.total

    if (node.metrics.latency.total > peakLatency) {
      peakLatency = node.metrics.latency.total
    }
  }

  const avgLatency = nodes.length > 0 ? totalLatency / nodes.length : 0
  const avgThroughput =
    nodes.length > 0
      ? nodes.reduce((sum, n) => sum + n.metrics.throughput.eventsPerSec, 0) /
        nodes.length
      : 0

  return {
    totalEvents,
    totalMessages,
    totalBytes,
    avgLatency,
    peakLatency,
    avgThroughput,
    perNodeStats,
  }
}

/**
 * Simulate node failure
 *
 * Gracefully disconnects a node from the network while keeping it
 * available for inspection/debugging.
 *
 * @param node - Node to fail
 */
export async function simulateNodeFailure(node: TestNode): Promise<void> {
  node._running = false
  await node.streamConnection.close()

  // Clear peer connections without full cleanup
  // This allows us to inspect the failed node's state
}

/**
 * Restore a failed node
 *
 * @param node - Node to restore
 */
export async function restoreNode(node: TestNode): Promise<void> {
  node._running = true

  // Recreate stream connection
  // (In real implementation, would reconnect to peers)
}

/**
 * Partition network into two groups
 *
 * Creates a network partition where group1 cannot communicate with group2
 * but nodes within each group can still communicate with each other.
 *
 * @param group1 - First partition group
 * @param group2 - Second partition group
 */
export async function partitionNetwork(
  _group1: TestNode[],
  _group2: TestNode[]
): Promise<void> {
  // TODO: Implement network partition simulation
  // For now, this is a placeholder
  // Will need to intercept packets between groups
}

/**
 * Heal network partition
 *
 * Removes partition and allows all nodes to communicate again.
 *
 * @param allNodes - All nodes in the network
 */
export async function healPartition(_allNodes: TestNode[]): Promise<void> {
  // TODO: Implement partition healing
  // For now, this is a placeholder
}

/**
 * Wait for specific condition across all nodes
 *
 * @param nodes - Nodes to check
 * @param condition - Condition function to evaluate
 * @param timeout - Maximum wait time in milliseconds
 */
export async function waitForCondition(
  nodes: TestNode[],
  condition: (nodes: TestNode[]) => boolean,
  timeout = 10000
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    if (condition(nodes)) {
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error('Condition not met within timeout')
}

/**
 * Inject event into specific node's received events
 * (Helper for testing event propagation)
 *
 * @param node - Target node
 * @param event - Event to inject
 */
export async function injectEvent(node: TestNode, event: NostrEvent): Promise<void> {
  node._receivedEvents.push(event)

  // Also save to repository and cache (simulates full event reception)
  await node.repository.saveEvent(event)
  await node.cache.cacheEvent(event)
}

/**
 * Clear all received events from a node
 * (Helper for test setup)
 *
 * @param node - Node to clear
 */
export function clearReceivedEvents(node: TestNode): void {
  node._receivedEvents = []
}

/**
 * Get network diameter (longest shortest path between any two nodes)
 *
 * @param nodes - All nodes in the network
 * @returns Network diameter (number of hops)
 */
export function getNetworkDiameter(nodes: TestNode[]): number {
  // TODO: Implement actual topology analysis
  // For now, return based on node count (assumes mesh)
  return nodes.length > 1 ? 1 : 0
}
