import { performance } from 'perf_hooks'
import { createLogger } from '../../factories/logger-factory'
import { getStorageStats, StorageStats } from './storage-stats.js'

/**
 * BTP-NIPs Query Performance Monitor
 *
 * Provides query performance monitoring with automatic slow query detection
 * and latency tracking.
 *
 * @module btp-nips/storage/query-monitor
 */

const debug = createLogger('btp-nips:query-monitor')

/**
 * Slow query threshold in milliseconds
 */
const SLOW_QUERY_THRESHOLD_MS = 100

/**
 * Query Monitor
 *
 * Wraps database queries with performance monitoring:
 * - Measures query duration
 * - Logs slow queries (> 100ms)
 * - Records duration in StorageStats ring buffer
 * - Emits metrics to Pino logger
 */
export class QueryMonitor {
  private stats: StorageStats

  constructor(stats?: StorageStats) {
    this.stats = stats ?? getStorageStats()
  }

  /**
   * Wrap a query function with performance monitoring.
   *
   * This method:
   * 1. Captures start time
   * 2. Executes the query
   * 3. Calculates duration
   * 4. Records duration in StorageStats
   * 5. Logs slow queries (> 100ms)
   * 6. Emits metrics
   * 7. Returns query result
   *
   * If the query throws an error, the error is logged and re-thrown.
   *
   * @param queryFn - Async function that executes the query
   * @param queryType - Query type identifier (e.g., 'queryEventsByFilters', 'getEvent')
   * @returns Promise that resolves to query result
   * @throws Re-throws any error from the query function
   *
   * @example
   * ```typescript
   * const monitor = new QueryMonitor();
   * const result = await monitor.wrapQuery(
   *   () => db.query('SELECT * FROM events WHERE kind = ?', [1]),
   *   'queryEventsByKind'
   * );
   * ```
   */
  async wrapQuery<T>(
    queryFn: () => Promise<T>,
    queryType: string
  ): Promise<T> {
    const start = performance.now()
    let error: Error | null = null
    let result: T

    try {
      result = await queryFn()
    } catch (err) {
      error = err as Error
      throw err // Re-throw to caller
    } finally {
      const duration = performance.now() - start

      // Record duration in stats (even if query failed)
      this.stats.recordQueryDuration(duration)

      // Check if slow query
      const isSlowQuery = duration > SLOW_QUERY_THRESHOLD_MS

      // Emit metrics to logger
      debug({
        queryDuration: duration,
        queryType,
        slowQuery: isSlowQuery,
        error: error ? error.message : undefined,
      })

      // Log slow queries with details
      if (isSlowQuery) {
        debug(
          'SLOW QUERY: %s took %.2fms (threshold: %dms)',
          queryType,
          duration,
          SLOW_QUERY_THRESHOLD_MS
        )

        // Optional: Add EXPLAIN query logging for PostgreSQL
        // This would require access to the query builder, which we don't have here
        // Could be added in a future enhancement
      }
    }

    return result!
  }

  /**
   * Wrap a query function with performance monitoring (synchronous version).
   *
   * This is useful for wrapping synchronous operations that need monitoring.
   *
   * @param queryFn - Synchronous function to execute
   * @param queryType - Query type identifier
   * @returns Query result
   */
  wrapQuerySync<T>(queryFn: () => T, queryType: string): T {
    const start = performance.now()
    let error: Error | null = null
    let result: T

    try {
      result = queryFn()
    } catch (err) {
      error = err as Error
      throw err
    } finally {
      const duration = performance.now() - start

      this.stats.recordQueryDuration(duration)

      const isSlowQuery = duration > SLOW_QUERY_THRESHOLD_MS

      debug({
        queryDuration: duration,
        queryType,
        slowQuery: isSlowQuery,
        error: error ? error.message : undefined,
      })

      if (isSlowQuery) {
        debug(
          'SLOW QUERY: %s took %.2fms (threshold: %dms)',
          queryType,
          duration,
          SLOW_QUERY_THRESHOLD_MS
        )
      }
    }

    return result!
  }
}

/**
 * Singleton instance of QueryMonitor
 */
let queryMonitorInstance: QueryMonitor | null = null

/**
 * Get the singleton instance of QueryMonitor.
 *
 * @returns Shared QueryMonitor instance
 */
export function getQueryMonitor(): QueryMonitor {
  if (!queryMonitorInstance) {
    queryMonitorInstance = new QueryMonitor()
  }
  return queryMonitorInstance
}
