import express, { NextFunction, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { createLogger } from '../../factories/logger-factory'
import { dashboardAuth } from '../middleware/auth'
import { getStorageStats } from '../../btp-nips/storage/storage-stats'

/**
 * Dashboard Storage Metrics Route
 *
 * Provides real-time storage statistics and query performance metrics
 * for the BTP-NIPs storage layer.
 *
 * @module dashboard/routes/storage
 */

const router: express.Router = express.Router()
const logger = createLogger('dashboard:storage')

/**
 * Storage metrics response type
 */
interface StorageMetrics {
  timestamp: string
  totalEvents: number
  eventsByKind: Record<number, number>
  storageSize: number
  storageSizeMB: number
  cacheHitRate: number
  queryPerformance: {
    p50: number
    p95: number
    p99: number
  }
  deletedEvents: number
  expiredEvents: number
}

/**
 * Metrics cache to reduce database load
 */
let metricsCache: { data: StorageMetrics; timestamp: number } | null = null
const CACHE_TTL_MS = 5000 // 5 seconds

/**
 * Aggregate storage metrics
 */
async function aggregateStorageMetrics(): Promise<StorageMetrics> {
  const stats = getStorageStats()

  // Execute all queries in parallel for efficiency
  const [
    totalEvents,
    eventsByKind,
    storageSize,
    cacheHitRate,
    queryPerformance,
    deletedEvents,
  ] = await Promise.all([
    stats.getTotalEventCount(),
    stats.getEventCountByKind(),
    stats.getStorageSizeEstimate(),
    stats.getCacheHitRate(),
    stats.getQueryPerformanceMetrics(),
    stats.getDeletedEventCount(),
  ])

  return {
    timestamp: new Date().toISOString(),
    totalEvents,
    eventsByKind,
    storageSize,
    storageSizeMB: storageSize / (1024 * 1024), // Convert bytes to MB
    cacheHitRate,
    queryPerformance,
    deletedEvents,
    expiredEvents: 0, // Will be > 0 after Story 5.6 cleanup runs
  }
}

/**
 * Get storage metrics with caching
 */
async function getCachedStorageMetrics(): Promise<StorageMetrics> {
  const now = Date.now()

  // Return cached data if within TTL
  if (metricsCache && now - metricsCache.timestamp < CACHE_TTL_MS) {
    logger('Returning cached storage metrics')
    return metricsCache.data
  }

  // Fetch fresh metrics
  logger('Fetching fresh storage metrics')
  const metrics = await aggregateStorageMetrics()
  metricsCache = { data: metrics, timestamp: now }

  return metrics
}

/**
 * Rate limiter for storage metrics endpoint
 */
const storageRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * GET /dashboard/storage
 *
 * Returns storage statistics and query performance metrics:
 * - Total event count
 * - Event count by kind
 * - Storage size (bytes and MB)
 * - Cache hit rate
 * - Query performance percentiles (p50, p95, p99)
 * - Deleted event count
 * - Expired event count (future)
 *
 * Requires HTTP Basic Auth.
 * Rate limited to 100 requests/minute.
 * Cached for 5 seconds to reduce load.
 *
 * @example
 * Response:
 * ```json
 * {
 *   "timestamp": "2025-12-07T12:00:00.000Z",
 *   "totalEvents": 15000,
 *   "eventsByKind": { "1": 5000, "30023": 150, "7": 12000 },
 *   "storageSize": 52428800,
 *   "storageSizeMB": 50.0,
 *   "cacheHitRate": 0.87,
 *   "queryPerformance": { "p50": 12.5, "p95": 87.3, "p99": 145.2 },
 *   "deletedEvents": 100,
 *   "expiredEvents": 0
 * }
 * ```
 */
router.get(
  '/storage',
  storageRateLimiter,
  dashboardAuth,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const metrics = await getCachedStorageMetrics()

      logger('Storage metrics retrieved successfully')

      res
        .status(200)
        .setHeader('content-type', 'application/json; charset=utf8')
        .json(metrics)

      next()
    } catch (error) {
      logger('Storage metrics aggregation failed: %O', error)

      res
        .status(500)
        .setHeader('content-type', 'application/json; charset=utf8')
        .json({
          error: 'Failed to aggregate storage metrics',
          message: error instanceof Error ? error.message : 'Unknown error',
        })

      next(error)
    }
  }
)

export default router
