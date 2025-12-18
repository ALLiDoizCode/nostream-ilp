/**
 * Performance monitoring and latency measurement utilities
 */

import type { TestNode } from './test-node'
import type { LatencyBreakdown, ResourceMetrics } from './config'

/**
 * LatencyMeasurement tracks operation timing with breakdown
 */
export class LatencyMeasurement {
  private timestamps: Map<string, number> = new Map()

  /**
   * Mark a timestamp with a label
   */
  mark(label: string): void {
    this.timestamps.set(label, performance.now())
  }

  /**
   * Measure duration between two labels
   */
  measure(label: string, startLabel: string): number {
    const start = this.timestamps.get(startLabel)
    if (!start) {
      throw new Error(`Start label "${startLabel}" not found`)
    }

    const end = performance.now()
    const duration = end - start
    this.timestamps.set(label, end)
    return duration
  }

  /**
   * Get latency breakdown
   */
  getBreakdown(): LatencyBreakdown {
    return {
      serialization: this.measure('serialized', 'start'),
      network: this.measure('received', 'serialized'),
      deserialization: this.measure('parsed', 'received'),
      crypto: this.measure('verified', 'parsed'),
      database: this.measure('stored', 'verified'),
      subscription: this.measure('matched', 'stored'),
      total: this.measure('end', 'start'),
    }
  }

  /**
   * Reset all timestamps
   */
  reset(): void {
    this.timestamps.clear()
  }
}

/**
 * ResourceMonitor tracks resource usage across nodes
 */
export class ResourceMonitor {
  private nodes: TestNode[]
  private interval: NodeJS.Timeout | null = null
  private samples: ResourceMetrics[] = []
  private initialCpu: NodeJS.CpuUsage
  private startTime: number

  constructor(nodes: TestNode[]) {
    this.nodes = nodes
    this.initialCpu = process.cpuUsage()
    this.startTime = Date.now()
  }

  /**
   * Start monitoring resources
   */
  start(intervalMs = 1000): void {
    if (this.interval) {
      return // Already running
    }

    this.interval = setInterval(async () => {
      for (const node of this.nodes) {
        const memUsage = process.memoryUsage()
        const cpuUsage = process.cpuUsage(this.initialCpu)

        // Calculate CPU percentage (user + system time)
        const totalCpuMs = (cpuUsage.user + cpuUsage.system) / 1000
        const elapsedMs = Date.now() - this.startTime
        const cpuPercent = (totalCpuMs / elapsedMs) * 100

        // Handle both sync (mock) and async (real) connection count
        let connections = 0
        if (node.streamConnection.type === 'mock') {
          connections = node.streamConnection.getActiveConnectionCount()
        } else if (node.streamConnection.type === 'real') {
          connections = await node.streamConnection.getActiveConnectionCount()
        }

        this.samples.push({
          nodeId: node.id,
          timestamp: Date.now(),
          memoryMB: memUsage.heapUsed / 1024 / 1024,
          cpuPercent: cpuPercent,
          connections,
        })
      }
    }, intervalMs)
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  /**
   * Get average metrics across all samples
   */
  getAverageMetrics(): ResourceMetrics {
    if (this.samples.length === 0) {
      return { memoryMB: 0, cpuPercent: 0, connections: 0 }
    }

    const avg = this.samples.reduce(
      (acc, sample) => ({
        memoryMB: acc.memoryMB + sample.memoryMB,
        cpuPercent: acc.cpuPercent + sample.cpuPercent,
        connections: acc.connections + sample.connections,
      }),
      { memoryMB: 0, cpuPercent: 0, connections: 0 }
    )

    const count = this.samples.length
    return {
      memoryMB: avg.memoryMB / count,
      cpuPercent: avg.cpuPercent / count,
      connections: avg.connections / count,
    }
  }

  /**
   * Get metrics for a specific node
   */
  getNodeMetrics(nodeId: string): ResourceMetrics {
    const nodeSamples = this.samples.filter((s) => s.nodeId === nodeId)

    if (nodeSamples.length === 0) {
      return { memoryMB: 0, cpuPercent: 0, connections: 0 }
    }

    const avg = nodeSamples.reduce(
      (acc, sample) => ({
        memoryMB: acc.memoryMB + sample.memoryMB,
        cpuPercent: acc.cpuPercent + sample.cpuPercent,
        connections: acc.connections + sample.connections,
      }),
      { memoryMB: 0, cpuPercent: 0, connections: 0 }
    )

    const count = nodeSamples.length
    return {
      memoryMB: avg.memoryMB / count,
      cpuPercent: avg.cpuPercent / count,
      connections: avg.connections / count,
    }
  }

  /**
   * Get peak metrics
   */
  getPeakMetrics(): ResourceMetrics {
    if (this.samples.length === 0) {
      return { memoryMB: 0, cpuPercent: 0, connections: 0 }
    }

    return {
      memoryMB: Math.max(...this.samples.map((s) => s.memoryMB)),
      cpuPercent: Math.max(...this.samples.map((s) => s.cpuPercent)),
      connections: Math.max(...this.samples.map((s) => s.connections)),
    }
  }

  /**
   * Clear all samples
   */
  reset(): void {
    this.samples = []
    this.initialCpu = process.cpuUsage()
    this.startTime = Date.now()
  }
}

/**
 * Measure latency of an async operation
 */
export async function measureLatency(
  operation: () => Promise<void>
): Promise<number> {
  const start = performance.now()
  await operation()
  const end = performance.now()
  return end - start
}

/**
 * Measure throughput over a time period
 */
export class ThroughputMeasurement {
  private eventCount = 0
  private byteCount = 0
  private startTime: number

  constructor() {
    this.startTime = performance.now()
  }

  /**
   * Record an event
   */
  recordEvent(sizeBytes: number): void {
    this.eventCount++
    this.byteCount += sizeBytes
  }

  /**
   * Get current throughput
   */
  getThroughput(): { eventsPerSec: number; bytesPerSec: number } {
    const elapsedSec = (performance.now() - this.startTime) / 1000

    if (elapsedSec === 0) {
      return { eventsPerSec: 0, bytesPerSec: 0 }
    }

    return {
      eventsPerSec: this.eventCount / elapsedSec,
      bytesPerSec: this.byteCount / elapsedSec,
    }
  }

  /**
   * Reset measurements
   */
  reset(): void {
    this.eventCount = 0
    this.byteCount = 0
    this.startTime = performance.now()
  }
}
