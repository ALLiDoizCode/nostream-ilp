/**
 * Resource cleanup and leak detection utilities
 */

import type { TestNode } from './test-node'
import type { ResourceLeakReport } from './config'
import type { StartedTestContainer } from 'testcontainers'

/**
 * ResourceTracker tracks all resources for leak detection
 */
export class ResourceTracker {
  private containers: Set<StartedTestContainer> = new Set()
  private connections: Set<{ close: () => Promise<void> }> = new Set()

  /**
   * Track a Testcontainer for cleanup
   */
  trackContainer(container: StartedTestContainer): void {
    this.containers.add(container)
  }

  /**
   * Track a connection for cleanup
   */
  trackConnection(connection: { close: () => Promise<void> }): void {
    this.connections.add(connection)
  }

  /**
   * Cleanup all tracked resources
   */
  async cleanup(timeout = 10000): Promise<void> {
    const cleanupPromises = [
      // Close all connections
      ...Array.from(this.connections).map((conn) => conn.close()),
      // Stop all containers
      ...Array.from(this.containers).map((container) => container.stop()),
    ]

    await Promise.race([
      Promise.all(cleanupPromises),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Cleanup timeout')), timeout)
      ),
    ])

    this.containers.clear()
    this.connections.clear()
  }

  /**
   * Detect resource leaks
   */
  async detectLeaks(): Promise<ResourceLeakReport> {
    const memBefore = process.memoryUsage().heapUsed

    // Force garbage collection if available (run tests with --expose-gc)
    if (global.gc) {
      global.gc()
    }

    const memAfter = process.memoryUsage().heapUsed
    const leakedMB = (memAfter - memBefore) / 1024 / 1024

    return {
      leakedMemoryMB: leakedMB,
      unclosedContainers: this.containers.size,
      unclosedConnections: this.connections.size,
      hasLeaks:
        leakedMB > 10 || this.containers.size > 0 || this.connections.size > 0,
    }
  }
}

/**
 * Cleanup a single test node
 */
export async function cleanupNode(node: TestNode): Promise<void> {
  try {
    // Mark as not running
    node._running = false

    // Close STREAM connection
    await node.streamConnection.close()

    // Close subscription manager connections
    // (Assuming SubscriptionManager has a close method)
    if (node.subscriptionManager && 'close' in node.subscriptionManager) {
      await (node.subscriptionManager as any).close()
    }

    // Close peer discovery
    if (node.peerDiscovery && 'close' in node.peerDiscovery) {
      await (node.peerDiscovery as any).close()
    }

    // Flush cache
    if (node.cache && 'close' in node.cache) {
      await (node.cache as any).close()
    }

    // Close repository connection
    if (node.repository && 'close' in node.repository) {
      await (node.repository as any).close()
    }

    // Stop containers
    if (node._redisContainer) {
      await node._redisContainer.stop()
    }

    if (node._pgContainer) {
      await node._pgContainer.stop()
    }

    // Clear internal state
    node._receivedEvents = []
    node._subscriptions.clear()
  } catch (error) {
    console.error(`Failed to cleanup node ${node.id}:`, error)
    throw error
  }
}

/**
 * Cleanup entire test network
 */
export async function cleanupNetwork(
  nodes: TestNode[],
  timeout = 30000
): Promise<void> {
  const cleanupPromises = nodes.map((node) => cleanupNode(node))

  await Promise.race([
    Promise.all(cleanupPromises),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Network cleanup timeout')), timeout)
    ),
  ])
}

/**
 * Graceful shutdown with timeout
 */
export async function gracefulShutdown(
  node: TestNode,
  timeout = 5000
): Promise<void> {
  try {
    await Promise.race([
      cleanupNode(node),
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Graceful shutdown timeout for ${node.id}`)),
          timeout
        )
      ),
    ])
  } catch (error) {
    console.error(`Graceful shutdown failed for ${node.id}:`, error)
    // Force cleanup
    await cleanupNode(node)
  }
}
