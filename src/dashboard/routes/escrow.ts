import express, { NextFunction, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { EscrowDepositRepository } from '../../repositories/escrow-deposit.repository'
import { createLogger } from '../../factories/logger-factory'
import { dashboardAuth } from '../middleware/auth'
import { getEscrowDepositor } from '../../factories/economic-monitor-factory'
import { getMasterDbClient } from '../../database/client'

/**
 * Dashboard Escrow Management Routes
 *
 * REST API endpoints for Akash escrow deposit management:
 * - GET /escrow/status - Get current escrow status
 * - GET /escrow/deposits - Get recent deposit history
 * - POST /escrow/deposit - Manually trigger deposit
 * - GET /escrow/total - Get total deposited
 *
 * Story 7.4: Automatic Akash Escrow Deposit
 *
 * Security:
 * - HTTP Basic Auth required (dashboardAuth middleware)
 * - Rate limiting: 60 requests/minute for GET, 10/minute for POST
 * - CSRF protection via custom header validation
 */



const router: express.Router = express.Router()
const logger = createLogger('dashboard:escrow')

/**
 * Request body types
 */
interface _ManualDepositBody {
  amountAkt?: number
}

/**
 * Rate limiter for read endpoints (status, deposits, total)
 * Allows 60 requests per minute
 */
const escrowReadRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Too many requests to escrow endpoints. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * Rate limiter for write endpoint (POST /deposit)
 * Stricter limit to prevent deposit spam: 10 requests per minute
 */
const escrowDepositRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 deposit attempts per minute
  message: 'Too many deposit requests. Please wait before trying again.',
  standardHeaders: true,
  legacyHeaders: false,
})

/**
 * CSRF protection middleware
 *
 * Validates that POST requests include X-Requested-With header
 * to prevent CSRF attacks from malicious sites
 */
const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'POST') {
    const requestedWith = req.headers['x-requested-with']
    if (requestedWith !== 'XMLHttpRequest') {
      logger('CSRF protection: rejected POST request without X-Requested-With header from %s', req.ip)
      res.status(403).json({
        error: 'Forbidden',
        message: 'CSRF validation failed. Include X-Requested-With: XMLHttpRequest header.',
      })
      return
    }
  }
  next()
}

/**
 * GET /escrow/status
 *
 * Returns current escrow status including:
 * - Escrow balance (AKT)
 * - Days remaining (based on daily cost)
 * - Warning level (OK, WARNING, CRITICAL)
 * - Whether deposit is needed
 *
 * Requires authentication. Rate limited to 60 req/min.
 */
router.get(
  '/status',
  escrowReadRateLimiter,
  dashboardAuth,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const depositor = getEscrowDepositor()

      if (!depositor) {
        res.status(503).json({
          error: 'Escrow depositor not configured',
          message: 'Akash escrow automation is not enabled on this relay',
        })
        return
      }

      const status = await depositor.getEscrowStatus()
      res.status(200).json(status)
      next()
    } catch (error) {
      logger('Failed to get escrow status: %O', error)
      res.status(500).json({
        error: 'Failed to retrieve escrow status',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      next(error)
    }
  }
)

/**
 * GET /escrow/deposits
 *
 * Returns recent deposit history
 *
 * Query params:
 * - limit: Number of deposits (default: 10, max: 100)
 *
 * Requires authentication. Rate limited to 60 req/min.
 */
router.get(
  '/deposits',
  escrowReadRateLimiter,
  dashboardAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getMasterDbClient()
      const repository = new EscrowDepositRepository(db.client.pool)

      const limit = Math.min(
        parseInt((req.query.limit as string) || '10', 10),
        100
      )

      const deposits = await repository.getRecentDeposits(limit)

      res.status(200).json({
        deposits: deposits.map(d => ({
          id: d.id,
          amountAkt: d.amountAkt,
          escrowAddress: d.escrowAddress,
          txHash: d.txHash,
          depositedAt: d.depositedAt.toISOString(),
          newBalanceAkt: d.newBalanceAkt,
          leaseId: d.leaseId,
          notes: d.notes,
        })),
      })

      next()
    } catch (error) {
      logger('Failed to get deposit history: %O', error)
      res.status(500).json({
        error: 'Failed to retrieve deposit history',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      next(error)
    }
  }
)

/**
 * POST /escrow/deposit
 *
 * Manually trigger an escrow deposit
 *
 * Request body (JSON):
 * - amountAkt (optional): Custom amount (not yet supported, reserved for future)
 *
 * Security:
 * - Requires HTTP Basic Auth
 * - Requires CSRF header (X-Requested-With: XMLHttpRequest)
 * - Rate limited to 10 deposits per minute
 *
 * Response:
 * - 200: Deposit successful (includes amount and tx hash)
 * - 400: Deposit not needed or wallet insufficient
 * - 403: CSRF validation failed
 * - 429: Rate limit exceeded
 * - 500: Server error
 * - 503: Escrow depositor not configured
 */
router.post(
  '/deposit',
  escrowDepositRateLimiter,
  dashboardAuth,
  csrfProtection,
  express.json(), // Parse JSON body
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const depositor = getEscrowDepositor()

      if (!depositor) {
        res.status(503).json({
          error: 'Escrow depositor not configured',
          message: 'Akash escrow automation is not enabled on this relay',
        })
        return
      }

      // Future enhancement: support custom deposit amounts from req.body.amountAkt
      // Currently always deposits (target - current) amount
      const result = await depositor.checkAndDeposit()

      if (!result.deposited) {
        logger('Deposit not executed: %s', result.reason)
        res.status(400).json({
          success: false,
          reason: result.reason,
          message: getReasonMessage(result.reason),
        })
        return
      }

      logger('Manual deposit successful: %f AKT, tx: %s', result.amountAkt, result.txHash)
      res.status(200).json({
        success: true,
        amountAkt: result.amountAkt,
        txHash: result.txHash,
        message: `Successfully deposited ${result.amountAkt?.toFixed(2)} AKT to escrow`,
      })

      next()
    } catch (error) {
      logger('Deposit failed: %O', error)
      res.status(500).json({
        error: 'Deposit failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      next(error)
    }
  }
)

/**
 * GET /escrow/total
 *
 * Returns total amount deposited across all time
 *
 * Requires authentication. Rate limited to 60 req/min.
 */
router.get(
  '/total',
  escrowReadRateLimiter,
  dashboardAuth,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const db = getMasterDbClient()
      const repository = new EscrowDepositRepository(db.client.pool)

      const totalAkt = await repository.getTotalDeposited()

      res.status(200).json({
        totalDeposited: totalAkt,
        unit: 'AKT',
      })

      next()
    } catch (error) {
      logger('Failed to get total deposited: %O', error)
      res.status(500).json({
        error: 'Failed to retrieve total',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      next(error)
    }
  }
)

/**
 * Get user-friendly message for deposit failure reason
 *
 * @param reason - Failure reason code
 * @returns Human-readable error message
 */
function getReasonMessage(reason?: string): string {
  switch (reason) {
    case 'sufficient-balance':
      return 'Escrow balance is sufficient. No deposit needed.'
    case 'insufficient-wallet':
      return 'Wallet balance too low. Please purchase more AKT before depositing to escrow.'
    case 'escrow-query-failed':
      return 'Failed to query escrow balance. Check Akash RPC connection.'
    default:
      return 'Deposit not executed. Reason unknown.'
  }
}

export default router
