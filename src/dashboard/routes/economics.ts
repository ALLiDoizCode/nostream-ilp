import express, { NextFunction, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { EconomicSnapshotRepository } from '../../repositories/economic-snapshot.repository'
import { createLogger } from '../../factories/logger-factory'
import { dashboardAuth } from '../middleware/auth'
import { getEscrowDepositor } from '../../factories/economic-monitor-factory'
import { getMasterDbClient } from '../../database/client'

/**
 * Dashboard Economics Routes
 *
 * REST API endpoints for profitability dashboard:
 * - GET /economics - Get current economics metrics
 * - GET /economics/snapshots - Get historical snapshots for charting
 * - GET /economics/export.csv - Export economic data as CSV
 *
 * Story 7.5: Profitability Dashboard
 *
 * Security:
 * - HTTP Basic Auth required (dashboardAuth middleware)
 * - Rate limiting: 60 requests/minute for all endpoints
 * - Response caching: 5-second TTL
 */



const router: express.Router = express.Router()
const logger = createLogger('dashboard:economics')

/**
 * Economics metrics response type
 */
export interface EconomicsMetrics {
  timestamp: string
  status: 'profitable' | 'break-even' | 'losing-money'
  today: {
    revenue_usd: number
    expenses_usd: number
    profit_usd: number
  }
  this_month: {
    revenue_usd: number
    expenses_usd: number
    profit_usd: number
    profitability_percentage: number
  }
  all_time: {
    total_revenue_usd: number
    total_expenses_usd: number
    net_profit_usd: number
  }
  revenue_breakdown: {
    subscriptions_usd: number
    routing_usd: number
    content_usd: number
  }
  expense_breakdown: {
    akash_cost_usd: number
    gas_fees_usd: number
    other_usd: number
  }
  balances: {
    eth_balance: string
    usdc_balance: string
    akt_wallet_balance: string
    akt_escrow_balance: string
    days_hosting_remaining: number
  }
}

/**
 * Rate limiter for economics endpoints
 * Allows 60 requests per minute
 */
const economicsRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Too many requests to economics endpoints. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Simple in-memory cache for economics metrics
 * TTL: 5 seconds (prevents hammering database on dashboard refresh)
 */
let metricsCache: { data: EconomicsMetrics; timestamp: number } | null = null
const CACHE_TTL_MS = 5000 // 5 seconds

/**
 * GET /economics
 *
 * Returns current economics metrics including:
 * - Status (profitable/break-even/losing-money)
 * - Today's revenue/expenses/profit
 * - This month's revenue/expenses/profit/profitability
 * - All-time totals
 * - Revenue breakdown by source
 * - Expense breakdown by category
 * - Current balances (ETH, USDC, AKT)
 * - Days hosting remaining
 *
 * Requires authentication. Rate limited to 60 req/min. Cached for 5 seconds.
 */
router.get(
  '/economics',
  economicsRateLimiter,
  dashboardAuth,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      // Check cache
      if (metricsCache && Date.now() - metricsCache.timestamp < CACHE_TTL_MS) {
        logger('Returning cached economics metrics (age: %d ms)', Date.now() - metricsCache.timestamp)
        res.status(200).json(metricsCache.data)
        return
      }

      const db = getMasterDbClient()
      const repository = new EconomicSnapshotRepository(db.client.pool)

      // Query economic snapshots
      const latest = await repository.getLatestSnapshot()
      const todaySnapshots = await repository.getDailySnapshots(1) // Last 24 hours
      const monthSnapshots = await repository.getDailySnapshots(30) // Last 30 days

      // Calculate all-time aggregates
      const allTimeStart = new Date(0) // Beginning of time
      const allTimeEnd = new Date() // Now
      const allTimeSnapshots = await repository.getSnapshotsByDateRange(allTimeStart, allTimeEnd)

      // Calculate today metrics
      const todayRevenue = todaySnapshots.reduce((sum, s) => sum + s.revenueUsd, 0)
      const todayExpenses = todaySnapshots.reduce((sum, s) => sum + s.expensesUsd, 0)
      const todayProfit = todayRevenue - todayExpenses

      // Calculate this month metrics
      const monthRevenue = monthSnapshots.reduce((sum, s) => sum + s.revenueUsd, 0)
      const monthExpenses = monthSnapshots.reduce((sum, s) => sum + s.expensesUsd, 0)
      const monthProfit = monthRevenue - monthExpenses
      const monthProfitability = monthRevenue > 0 ? (monthProfit / monthRevenue) * 100 : 0

      // Calculate all-time totals
      const allTimeRevenue = allTimeSnapshots.reduce((sum, s) => sum + s.revenueUsd, 0)
      const allTimeExpenses = allTimeSnapshots.reduce((sum, s) => sum + s.expensesUsd, 0)
      const allTimeProfit = allTimeRevenue - allTimeExpenses

      // Calculate revenue breakdown (from this month's snapshots)
      const subscriptionRevenue = monthSnapshots.reduce((sum, s) => sum + s.subscriptionRevenueUsd, 0)
      const routingRevenue = monthSnapshots.reduce((sum, s) => sum + s.routingRevenueUsd, 0)
      const contentRevenue = monthSnapshots.reduce((sum, s) => sum + s.contentRevenueUsd, 0)

      // Calculate expense breakdown (from this month's snapshots)
      const akashCost = monthSnapshots.reduce((sum, s) => sum + s.akashCostUsd, 0)
      const gasFees = monthSnapshots.reduce((sum, s) => sum + s.gasFeeUsd, 0)
      const otherExpenses = monthExpenses - akashCost - gasFees

      // Calculate profitability status
      const status = calculateStatus(allTimeProfit)

      // Get escrow status for days remaining
      const depositor = getEscrowDepositor()
      let daysRemaining = 0
      let escrowBalance = '0'

      if (depositor) {
        try {
          const escrowStatus = await depositor.getEscrowStatus()
          daysRemaining = escrowStatus.daysRemaining
          escrowBalance = (escrowStatus.escrowBalanceAkt * 1_000_000).toString() // Convert AKT to uakt
        } catch (error) {
          logger('Failed to get escrow status: %O', error)
        }
      }

      // Build metrics response
      const metrics: EconomicsMetrics = {
        timestamp: new Date().toISOString(),
        status,
        today: {
          revenue_usd: todayRevenue,
          expenses_usd: todayExpenses,
          profit_usd: todayProfit,
        },
        this_month: {
          revenue_usd: monthRevenue,
          expenses_usd: monthExpenses,
          profit_usd: monthProfit,
          profitability_percentage: monthProfitability,
        },
        all_time: {
          total_revenue_usd: allTimeRevenue,
          total_expenses_usd: allTimeExpenses,
          net_profit_usd: allTimeProfit,
        },
        revenue_breakdown: {
          subscriptions_usd: subscriptionRevenue,
          routing_usd: routingRevenue,
          content_usd: contentRevenue,
        },
        expense_breakdown: {
          akash_cost_usd: akashCost,
          gas_fees_usd: gasFees,
          other_usd: otherExpenses,
        },
        balances: {
          eth_balance: latest?.ethBalance.toString() ?? '0',
          usdc_balance: latest?.usdcBalance.toString() ?? '0',
          akt_wallet_balance: latest?.aktBalance.toString() ?? '0',
          akt_escrow_balance: escrowBalance,
          days_hosting_remaining: daysRemaining,
        },
      }

      // Update cache
      metricsCache = {
        data: metrics,
        timestamp: Date.now(),
      }

      res.status(200).json(metrics)
      next()
    } catch (error) {
      logger('Failed to get economics metrics: %O', error)
      res.status(500).json({
        error: 'Failed to retrieve economics metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      next(error)
    }
  }
)

/**
 * GET /economics/snapshots
 *
 * Returns historical economic snapshots for charting
 *
 * Query params:
 * - startDate: ISO 8601 date string (default: 30 days ago)
 * - endDate: ISO 8601 date string (default: now)
 * - limit: Max number of snapshots (default: 30, max: 1000)
 *
 * Requires authentication. Rate limited to 60 req/min.
 */
router.get(
  '/economics/snapshots',
  economicsRateLimiter,
  dashboardAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getMasterDbClient()
      const repository = new EconomicSnapshotRepository(db.client.pool)

      // Parse query params
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : new Date()

      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago

      const limit = Math.min(
        parseInt((req.query.limit as string) || '30', 10),
        1000
      )

      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({
          error: 'Invalid date range',
          message: 'startDate and endDate must be valid ISO 8601 date strings',
        })
        return
      }

      if (startDate > endDate) {
        res.status(400).json({
          error: 'Invalid date range',
          message: 'startDate must be before endDate',
        })
        return
      }

      // Query snapshots
      let snapshots = await repository.getSnapshotsByDateRange(startDate, endDate)

      // Apply limit
      if (snapshots.length > limit) {
        snapshots = snapshots.slice(0, limit)
      }

      // Return snapshots with serialized BigInt values
      res.status(200).json(
        snapshots.map((s) => ({
          timestamp: s.timestamp.toISOString(),
          revenue_usd: s.revenueUsd,
          subscription_revenue_usd: s.subscriptionRevenueUsd,
          routing_revenue_usd: s.routingRevenueUsd,
          content_revenue_usd: s.contentRevenueUsd,
          expenses_usd: s.expensesUsd,
          akash_cost_usd: s.akashCostUsd,
          gas_fees_usd: s.gasFeeUsd,
          net_profit_usd: s.netProfitUsd,
          eth_balance: s.ethBalance.toString(),
          usdc_balance: s.usdcBalance.toString(),
          akt_balance: s.aktBalance.toString(),
        }))
      )

      next()
    } catch (error) {
      logger('Failed to get snapshots: %O', error)
      res.status(500).json({
        error: 'Failed to retrieve snapshots',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      next(error)
    }
  }
)

/**
 * GET /economics/export.csv
 *
 * Exports economic snapshots as CSV file
 *
 * Query params:
 * - startDate: ISO 8601 date string (default: 30 days ago)
 * - endDate: ISO 8601 date string (default: now)
 *
 * Requires authentication. Rate limited to 60 req/min.
 */
router.get(
  '/economics/export.csv',
  economicsRateLimiter,
  dashboardAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getMasterDbClient()
      const repository = new EconomicSnapshotRepository(db.client.pool)

      // Parse query params
      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : new Date()

      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago

      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        res.status(400).json({
          error: 'Invalid date range',
          message: 'startDate and endDate must be valid ISO 8601 date strings',
        })
        return
      }

      // Query snapshots
      const snapshots = await repository.getSnapshotsByDateRange(startDate, endDate)

      // Generate CSV
      const headers = [
        'timestamp',
        'revenue_usd',
        'subscription_revenue_usd',
        'routing_revenue_usd',
        'content_revenue_usd',
        'expenses_usd',
        'akash_cost_usd',
        'gas_fees_usd',
        'net_profit_usd',
      ]

      const rows = snapshots.map((s) => [
        s.timestamp.toISOString(),
        s.revenueUsd.toFixed(2),
        s.subscriptionRevenueUsd.toFixed(2),
        s.routingRevenueUsd.toFixed(2),
        s.contentRevenueUsd.toFixed(2),
        s.expensesUsd.toFixed(2),
        s.akashCostUsd.toFixed(2),
        s.gasFeeUsd.toFixed(2),
        s.netProfitUsd.toFixed(2),
      ])

      const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')

      // Set headers for CSV download
      const filename = `economics-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.csv`
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

      res.status(200).send(csv)
      next()
    } catch (error) {
      logger('Failed to export CSV: %O', error)
      res.status(500).json({
        error: 'Failed to export CSV',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      next(error)
    }
  }
)

/**
 * Calculate profitability status based on net profit
 *
 * @param netProfitUsd - All-time net profit in USD
 * @returns Status indicator
 */
function calculateStatus(netProfitUsd: number): 'profitable' | 'break-even' | 'losing-money' {
  if (netProfitUsd >= 0) {
    return 'profitable'
  } else if (netProfitUsd >= -1.0) {
    return 'break-even' // Within $1 of breaking even
  } else {
    return 'losing-money'
  }
}

export default router
