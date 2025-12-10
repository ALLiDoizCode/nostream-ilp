import { z } from 'zod'

import type { AktPurchaseRepository } from '../../repositories/akt-purchase.repository'
import type { AktBalanceMonitor } from '../../services/economic-monitor/akt-balance-monitor'
import type { AktPurchaseRecommendation } from '../../services/economic-monitor/akt-purchase-recommendation'
import type { FastifyInstance } from 'fastify'

/**
 * AKT Purchase Dashboard API Routes
 *
 * REST API endpoints for AKT purchase management:
 * - GET /dashboard/akt/recommendation - Get purchase recommendation
 * - GET /dashboard/akt/balance - Get current AKT balance
 * - GET /dashboard/akt/purchases - Get recent purchases
 * - POST /dashboard/akt/record-purchase - Record manual purchase
 *
 * Story 7.3: Dashboard integration for manual AKT purchase flow.
 */


/**
 * Request body schema for recording purchases
 */
const RecordPurchaseSchema = z.object({
  usdAmount: z.number().positive('USD amount must be positive'),
  aktAmount: z.number().positive('AKT amount must be positive'),
  exchange: z.string().optional(),
  txHash: z.string().optional(),
  notes: z.string().optional(),
})

type RecordPurchaseBody = z.infer<typeof RecordPurchaseSchema>;

/**
 * Query parameters for purchases list
 */
const PurchasesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().default(10),
})

/**
 * Register AKT purchase routes on Fastify instance
 *
 * @param fastify - Fastify instance
 * @param recommendation - Purchase recommendation service
 * @param balanceMonitor - Balance monitor service
 * @param purchaseRepo - Purchase repository
 */
export async function registerAktPurchaseRoutes(
  fastify: FastifyInstance,
  recommendation: AktPurchaseRecommendation,
  balanceMonitor: AktBalanceMonitor,
  purchaseRepo: AktPurchaseRepository,
): Promise<void> {
  /**
   * GET /dashboard/akt/recommendation
   *
   * Get purchase recommendation based on current state
   *
   * Response:
   * {
   *   "revenueUsd": 125.00,
   *   "currentAktBalance": 5.0,
   *   "targetAktBalance": 45.0,
   *   "neededAkt": 40.0,
   *   "aktPriceUsd": 2.50,
   *   "neededUsd": 100.00,
   *   "sufficientFunds": true,
   *   "message": "You have sufficient revenue..."
   * }
   */
  fastify.get('/dashboard/akt/recommendation', async (request, reply) => {
    try {
      const rec = await recommendation.getRecommendation()
      return reply.send(rec)
    } catch (error) {
      request.log.error('Failed to get purchase recommendation', { error })
      return reply.status(500).send({
        error: 'Failed to get recommendation',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * GET /dashboard/akt/balance
   *
   * Get current AKT balance
   *
   * Response:
   * {
   *   "balance": 5000000,      // uakt
   *   "balanceAkt": 5.0,       // AKT
   *   "timestamp": 1234567890
   * }
   */
  fastify.get('/dashboard/akt/balance', async (request, reply) => {
    try {
      const balanceUakt = await balanceMonitor.getCurrentBalance()
      const balanceAkt = Number(balanceUakt) / 1_000_000

      return reply.send({
        balance: balanceUakt.toString(), // Send as string to avoid BigInt serialization issues
        balanceAkt,
        timestamp: Date.now(),
      })
    } catch (error) {
      request.log.error('Failed to get AKT balance', { error })
      return reply.status(500).send({
        error: 'Failed to get balance',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  /**
   * GET /dashboard/akt/purchases?limit=10
   *
   * Get recent purchases (ordered by purchased_at DESC)
   *
   * Query params:
   * - limit: number (default: 10, max: 100)
   *
   * Response:
   * [
   *   {
   *     "id": "uuid",
   *     "usdAmount": 100.00,
   *     "aktAmount": 40.0,
   *     "aktPriceUsd": 2.50,
   *     "exchange": "Kraken",
   *     "txHash": "ABC123",
   *     "purchasedAt": "2025-12-09T12:00:00Z",
   *     "notes": null
   *   }
   * ]
   */
  fastify.get<{ Querystring: z.infer<typeof PurchasesQuerySchema> }>(
    '/dashboard/akt/purchases',
    async (request, reply) => {
      try {
        const { limit } = PurchasesQuerySchema.parse(request.query)
        const maxLimit = Math.min(limit, 100) // Cap at 100

        const purchases = await purchaseRepo.getRecentPurchases(maxLimit)
        return reply.send(purchases)
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: 'Invalid query parameters',
            details: error.errors,
          })
        }

        request.log.error('Failed to get purchases', { error })
        return reply.status(500).send({
          error: 'Failed to get purchases',
          message: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    },
  )

  /**
   * POST /dashboard/akt/record-purchase
   *
   * Record a manual AKT purchase
   *
   * Request body:
   * {
   *   "usdAmount": 100.00,
   *   "aktAmount": 40.0,
   *   "exchange": "Kraken",      // optional
   *   "txHash": "ABC123",        // optional
   *   "notes": "Manual purchase" // optional
   * }
   *
   * Response: Created purchase object
   */
  fastify.post<{ Body: RecordPurchaseBody }>(
    '/dashboard/akt/record-purchase',
    async (request, reply) => {
      try {
        // Validate request body
        const validated = RecordPurchaseSchema.parse(request.body)

        // Calculate aktPriceUsd from amounts
        const aktPriceUsd = validated.usdAmount / validated.aktAmount

        // Record purchase
        const purchase = await purchaseRepo.recordPurchase({
          usdAmount: validated.usdAmount,
          aktAmount: validated.aktAmount,
          aktPriceUsd,
          exchange: validated.exchange,
          txHash: validated.txHash,
          notes: validated.notes,
        })

        request.log.info('Purchase recorded', {
          purchaseId: purchase.id,
          usdAmount: purchase.usdAmount,
          aktAmount: purchase.aktAmount,
        })

        return reply.status(201).send(purchase)
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: 'Invalid request body',
            details: error.errors,
          })
        }

        request.log.error('Failed to record purchase', { error })
        return reply.status(500).send({
          error: 'Failed to record purchase',
          message: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    },
  )
}
