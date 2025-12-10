import { createLogger } from '../../factories/logger-factory'
import { getMasterDbClient, getReadReplicaDbClient } from '../../database/client'
import { EventCache, getEventCache } from './event-cache.js'

import type { Knex } from 'knex'

/**
 * BTP-NIPs Storage Statistics Module
 *
 * Provides real-time storage statistics and query performance monitoring
 * for the BTP-NIPs storage layer.
 *
 * @module btp-nips/storage/storage-stats
 */

/* eslint-disable sort-imports */
/* eslint-enable sort-imports */

const debug = createLogger('btp-nips:storage-stats')

/**
 * Ring buffer for storing query durations
 *
 * Circular array that overwrites oldest entries when full.
 */
class RingBuffer {
  private buffer: number[]
  private position: number = 0
  private filled: boolean = false

  constructor(private readonly size: number) {
    this.buffer = new Array(size)
  }

  /**
   * Add a value to the ring buffer
   */
  push(value: number): void {
    this.buffer[this.position] = value
    this.position = (this.position + 1) % this.size

    if (this.position === 0 && !this.filled) {
      this.filled = true
    }
  }

  /**
   * Get all values in the buffer (excluding uninitialized slots)
   */
  getValues(): number[] {
    if (!this.filled) {
      // Return only filled values if buffer not yet full
      return this.buffer.slice(0, this.position)
    }
    return [...this.buffer]
  }

  /**
   * Get the number of values in the buffer
   */
  getSize(): number {
    return this.filled ? this.size : this.position
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = new Array(this.size)
    this.position = 0
    this.filled = false
  }
}

/**
 * Storage Statistics
 *
 * Collects and calculates storage statistics for the BTP-NIPs storage layer:
 * - Total event count
 * - Event count by kind
 * - Storage size estimate
 * - Cache hit rate
 * - Query performance percentiles (p50, p95, p99)
 */
export class StorageStats {
  private writeDb: Knex
  private readDb: Knex
  private cache: EventCache
  private queryDurations: RingBuffer

  constructor(cache?: EventCache) {
    this.writeDb = getMasterDbClient()
    this.readDb = getReadReplicaDbClient()
    this.cache = cache ?? getEventCache()
    this.queryDurations = new RingBuffer(1000) // Last 1000 queries
  }

  /**
   * Get total count of non-deleted events.
   *
   * @returns Total number of active events
   *
   * @example
   * ```typescript
   * const stats = new StorageStats();
   * const total = await stats.getTotalEventCount();
   * console.log(`Total events: ${total}`);
   * ```
   */
  async getTotalEventCount(): Promise<number> {
    try {
      const result = await this.readDb('btp_nips_events')
        .where('is_deleted', false)
        .count('id as count')
        .first()

      return result ? parseInt(result.count as string, 10) : 0
    } catch (error) {
      debug('Failed to get total event count: %o', error)
      throw error
    }
  }

  /**
   * Get event count grouped by kind.
   *
   * @returns Record mapping event kind to count
   *
   * @example
   * ```typescript
   * const eventsByKind = await stats.getEventCountByKind();
   * // { 1: 5000, 30023: 150, 7: 12000 }
   * ```
   */
  async getEventCountByKind(): Promise<Record<number, number>> {
    try {
      const rows = await this.readDb('btp_nips_events')
        .where('is_deleted', false)
        .select('kind')
        .count('id as count')
        .groupBy('kind')

      const result: Record<number, number> = {}
      for (const row of rows) {
        result[row.kind] = parseInt(row.count as string, 10)
      }

      return result
    } catch (error) {
      debug('Failed to get event count by kind: %o', error)
      throw error
    }
  }

  /**
   * Get estimated storage size in bytes.
   *
   * Calculates total size of content and tags fields for non-deleted events.
   *
   * Note: This is an estimate. Actual database storage includes indexes,
   * metadata, and internal overhead.
   *
   * @returns Estimated storage size in bytes
   *
   * @example
   * ```typescript
   * const sizeBytes = await stats.getStorageSizeEstimate();
   * const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
   * console.log(`Storage size: ${sizeMB} MB`);
   * ```
   */
  async getStorageSizeEstimate(): Promise<number> {
    try {
      // PostgreSQL LENGTH() returns number of characters, not bytes
      // For JSON/text, approximate bytes = characters (ASCII) or characters * 3 (UTF-8)
      // Using LENGTH for simplicity; production should use octet_length() for exact byte count
      const result = await this.readDb('btp_nips_events')
        .where('is_deleted', false)
        .select(
          this.readDb.raw(
            'SUM(octet_length(content) + octet_length(tags::text)) as total_size'
          )
        )
        .first()

      return result && result.total_size
        ? parseInt(result.total_size as string, 10)
        : 0
    } catch (error) {
      debug('Failed to get storage size estimate: %o', error)
      throw error
    }
  }

  /**
   * Get count of deleted events (soft deleted via NIP-09).
   *
   * @returns Number of deleted events
   */
  async getDeletedEventCount(): Promise<number> {
    try {
      const result = await this.readDb('btp_nips_events')
        .where('is_deleted', true)
        .count('id as count')
        .first()

      return result ? parseInt(result.count as string, 10) : 0
    } catch (error) {
      debug('Failed to get deleted event count: %o', error)
      throw error
    }
  }

  /**
   * Get cache hit rate from EventCache.
   *
   * @returns Cache hit rate as decimal (0.0 to 1.0)
   *
   * @example
   * ```typescript
   * const hitRate = await stats.getCacheHitRate();
   * console.log(`Cache hit rate: ${(hitRate * 100).toFixed(1)}%`);
   * ```
   */
  async getCacheHitRate(): Promise<number> {
    try {
      // Ensure cache is initialized before getting hit rate
      await this.cache.waitForInitialization()
      return this.cache.getCacheHitRate()
    } catch (error) {
      debug('Failed to get cache hit rate: %o', error)
      return 0
    }
  }

  /**
   * Get query performance metrics (percentiles).
   *
   * Calculates p50, p95, and p99 latencies from the ring buffer
   * of query durations.
   *
   * @returns Object with p50, p95, p99 in milliseconds
   *
   * @example
   * ```typescript
   * const metrics = await stats.getQueryPerformanceMetrics();
   * console.log(`p50: ${metrics.p50}ms, p95: ${metrics.p95}ms, p99: ${metrics.p99}ms`);
   * ```
   */
  async getQueryPerformanceMetrics(): Promise<{
    p50: number
    p95: number
    p99: number
  }> {
    const values = this.queryDurations.getValues()

    if (values.length === 0) {
      return { p50: 0, p95: 0, p99: 0 }
    }

    return {
      p50: this.calculatePercentile(values, 0.5),
      p95: this.calculatePercentile(values, 0.95),
      p99: this.calculatePercentile(values, 0.99),
    }
  }

  /**
   * Record a query duration in the ring buffer.
   *
   * This method is called by QueryMonitor after each query.
   *
   * @param duration - Query duration in milliseconds
   * @internal
   */
  recordQueryDuration(duration: number): void {
    this.queryDurations.push(duration)
  }

  /**
   * Calculate percentile from sorted values.
   *
   * Uses linear interpolation for more accurate percentile calculation.
   *
   * @param values - Array of numeric values
   * @param percentile - Percentile to calculate (0.0 to 1.0)
   * @returns Percentile value
   *
   * @example
   * ```typescript
   * const values = [10, 20, 30, 40, 50];
   * const p50 = calculatePercentile(values, 0.5); // 30
   * const p95 = calculatePercentile(values, 0.95); // 49
   * ```
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) {
      return 0
    }

    // Sort values in ascending order
    const sorted = [...values].sort((a, b) => a - b)

    // Calculate index using linear interpolation
    const index = percentile * (sorted.length - 1)
    const lower = Math.floor(index)
    const upper = Math.ceil(index)

    if (lower === upper) {
      return sorted[lower]
    }

    // Interpolate between lower and upper values
    const weight = index - lower
    return sorted[lower] * (1 - weight) + sorted[upper] * weight
  }

  /**
   * Reset query duration statistics.
   *
   * Clears the ring buffer. Useful for testing or resetting metrics.
   */
  resetQueryStats(): void {
    this.queryDurations.clear()
  }

  /**
   * Get query duration buffer size (for testing).
   *
   * @returns Number of recorded query durations
   * @internal
   */
  getQueryStatsCount(): number {
    return this.queryDurations.getSize()
  }
}

/**
 * Singleton instance of StorageStats
 */
let storageStatsInstance: StorageStats | null = null

/**
 * Get the singleton instance of StorageStats.
 *
 * @returns Shared StorageStats instance
 */
export function getStorageStats(): StorageStats {
  if (!storageStatsInstance) {
    storageStatsInstance = new StorageStats()
  }
  return storageStatsInstance
}
