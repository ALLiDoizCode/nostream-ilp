import { getMasterDbClient } from '../../database/client'
import { getDassieClient } from '../../factories/dassie-client-factory'
import { getHealthCheckService } from '../../factories/health-check-service-factory'
import { createLogger } from '../../factories/logger-factory'
import { dashboardAuth } from '../middleware/auth'
import express, { NextFunction, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'

import type { SystemHealth } from '../../services/health/health-check-service'
import type { CurrencyBalances } from '../../services/payment/dassie-client'

const router: express.Router = express.Router()
const logger = createLogger('dashboard:metrics')

/**
 * Dashboard metrics response types
 */
interface RelayStats {
  total_events: number
  events_24h: number
  active_subscriptions: number
  connected_clients: number
}

interface PaymentStats {
  balances: {
    btc_sats: string
    base_wei: string
    akt_uakt: string
    xrp_drops: string
  }
}

interface DashboardMetrics {
  timestamp: string
  relay_stats: RelayStats
  payment_stats: PaymentStats
  health_status: SystemHealth
}

/**
 * Metrics cache to reduce database/RPC load
 */
let metricsCache: { data: DashboardMetrics; timestamp: number } | null = null
const CACHE_TTL_MS = 5000 // 5 seconds

/**
 * Get relay statistics
 *
 * Queries database for event counts. Subscription and client counts remain
 * placeholders (0) due to architecture constraints - WebSocketServerAdapter
 * is per-worker and not accessible from dashboard routes without cross-worker
 * communication (deferred to future epic).
 */
async function getRelayStats(): Promise<RelayStats> {
  const db = getMasterDbClient()

  // Query total events count
  const totalEventsResult = await db('events').count('event_id as count').first()
  const total_events = totalEventsResult ? Number(totalEventsResult.count) : 0

  // Query events in last 24 hours
  const twentyFourHoursAgo = Math.floor(Date.now() / 1000) - 86400
  const events24hResult = await db('events')
    .count('event_id as count')
    .where('event_created_at', '>=', twentyFourHoursAgo)
    .first()
  const events_24h = events24hResult ? Number(events24hResult.count) : 0

  // Subscription and client counts require WebSocketServerAdapter access
  // which is per-worker. Cross-worker metrics aggregation deferred to Epic 2.
  const active_subscriptions = 0 // Placeholder - requires WebSocketAdapter access
  const connected_clients = 0 // Placeholder - requires WebSocketServerAdapter.getConnectedClients()

  return {
    total_events,
    events_24h,
    active_subscriptions,
    connected_clients,
  }
}

/**
 * Get payment statistics from Dassie
 */
async function getPaymentStats(): Promise<PaymentStats> {
  const dassieClient = getDassieClient()
  const balances: CurrencyBalances = await dassieClient.getBalances()

  return {
    balances: {
      btc_sats: balances.btc_sats.toString(),
      base_wei: balances.base_wei.toString(),
      akt_uakt: balances.akt_uakt.toString(),
      xrp_drops: balances.xrp_drops.toString(),
    },
  }
}

/**
 * Aggregate all dashboard metrics
 */
async function aggregateMetrics(): Promise<DashboardMetrics> {
  const [relayStats, paymentStats, healthStatus] = await Promise.all([
    getRelayStats(),
    getPaymentStats(),
    getHealthCheckService().getAllHealthChecks(),
  ])

  return {
    timestamp: new Date().toISOString(),
    relay_stats: relayStats,
    payment_stats: paymentStats,
    health_status: healthStatus,
  }
}

/**
 * Get metrics with caching
 */
async function getCachedMetrics(): Promise<DashboardMetrics> {
  const now = Date.now()

  // Return cached data if within TTL
  if (metricsCache && now - metricsCache.timestamp < CACHE_TTL_MS) {
    return metricsCache.data
  }

  // Fetch fresh metrics
  const metrics = await aggregateMetrics()
  metricsCache = { data: metrics, timestamp: now }

  return metrics
}

/**
 * Rate limiter for dashboard endpoints
 * Prevents abuse and brute-force auth attempts
 */
const dashboardRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * GET /dashboard/metrics
 *
 * Returns aggregated dashboard metrics:
 * - Relay stats (events, subscriptions, clients)
 * - Payment stats (balances from Dassie)
 * - Health status (from health check service)
 *
 * Requires HTTP Basic Auth.
 * Rate limited to 100 requests/minute.
 * Cached for 5 seconds to reduce load.
 */
router.get(
  '/metrics',
  dashboardRateLimiter,
  dashboardAuth,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const metrics = await getCachedMetrics()

      res.status(200).setHeader('content-type', 'application/json; charset=utf8').json(metrics)

      next()
    } catch (error) {
      logger('Dashboard metrics aggregation failed: %O', error)

      res.status(500).setHeader('content-type', 'application/json; charset=utf8').json({
        error: 'Failed to aggregate metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      })

      next(error)
    }
  }
)

export default router
