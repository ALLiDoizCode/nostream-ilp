import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { RpcFailure, createRouter } from '@dassie/lib-rpc/server'

import { IlpAllocationSchemeSignal } from '../../config/computed/ilp-allocation-scheme'
import { Database } from '../../database/open-database'
import { payment as logger } from '../../logger/instances'
import { MakePayment } from '../../open-payments/functions/make-payment'
import { PeersSignal } from '../../peer-protocol/computed/peers'
import { NodeTableStore } from '../../peer-protocol/stores/node-table'
import { protectedRoute } from '../route-types/protected'

/**
 * Test Router - Endpoints for integration testing framework
 *
 * This router provides observability endpoints for the test framework to:
 * - Query peer connection status
 * - Send ILP payments
 * - Inspect internal ledger state
 *
 * All endpoints require authentication via DASSIE_RPC_AUTH_TOKEN environment variable.
 *
 * @see Story 5.9 - Dassie tRPC Endpoints for Test Integration
 */
export const testRouter = createRouter({
  peers: createRouter({
    /**
     * List all active peer connections
     *
     * @returns Array of peer information objects
     * @example
     * ```typescript
     * const peers = await trpc.test.peers.list.query()
     * // [{ ilpAddress: 'g.dassie.node1', status: 'active', ... }]
     * ```
     */
    list: protectedRoute.query(({ context: { sig } }) => {
      try {
        const nodeTable = sig.reactor.use(NodeTableStore)
        const ilpAllocationScheme = sig.read(IlpAllocationSchemeSignal)

        const peers = []

        for (const nodeEntry of nodeTable.read().values()) {
          const { peerState, nodeId } = nodeEntry

          // Only include nodes we're actively peered with
          if (peerState.id === 'peered') {
            const ilpAddress = `${ilpAllocationScheme}.das.${nodeId}`
            const now = Date.now()

            // Determine status based on lastSeen timestamp
            // Active if seen in last 30 seconds, otherwise established
            const timeSinceLastSeen = now - peerState.lastSeen
            const status = timeSinceLastSeen < 30_000 ? 'active' : 'established'

            peers.push({
              ilpAddress,
              status,
              lastHeartbeat: peerState.lastSeen,
              connectedAt: peerState.lastSeen, // Using lastSeen as proxy for connectedAt
            })
          }
        }

        return peers
      } catch (error) {
        logger.error('failed to list peers', { error })
        return new RpcFailure('Failed to retrieve peer list')
      }
    }),

    /**
     * Count active peer connections
     *
     * @returns Number of active/established peers
     * @example
     * ```typescript
     * const count = await trpc.test.peers.count.query()
     * // 2
     * ```
     */
    count: protectedRoute.query(({ context: { sig } }) => {
      try {
        const peersSignal = sig.reactor.use(PeersSignal)
        const activePeerIds = sig.read(peersSignal)
        return activePeerIds.size
      } catch (error) {
        logger.error('failed to count peers', { error })
        return new RpcFailure('Failed to count active peers')
      }
    }),
  }),

  ilp: createRouter({
    /**
     * Send an ILP payment to a destination address
     *
     * @param destination - ILP address or payment pointer
     * @param amount - Amount in msats
     * @param currency - Currency code (default: 'msat')
     * @param timeout - Payment timeout in milliseconds (default: 5000)
     * @returns Payment status object with ID
     * @example
     * ```typescript
     * const payment = await trpc.test.ilp.sendPayment.mutate({
     *   destination: 'g.dassie.node4',
     *   amount: 100,
     *   currency: 'msat',
     *   timeout: 5000
     * })
     * // { id: 'payment_abc123', status: 'pending', ... }
     * ```
     */
    sendPayment: protectedRoute
      .input(
        z.object({
          destination: z.string(),
          amount: z.number().positive(),
          currency: z.string().optional().default('msat'),
          timeout: z.number().optional().default(5000),
        }),
      )
      .mutation(async ({ input, context: { sig } }) => {
        try {
          const { destination, amount } = input
          const makePayment = sig.reactor.use(MakePayment)
          const paymentId = randomUUID()

          logger.debug?.('initiating test payment', { paymentId, destination, amount })

          // Initiate the payment asynchronously
          // Payment will update status in the database via STREAM protocol events
          makePayment({
            id: paymentId,
            destination,
            amount: BigInt(amount),
          }).catch((error) => {
            logger.error('payment initiation failed', { paymentId, error })
            // Errors are handled internally by makePayment
            // Status will be updated in the database
          })

          return {
            id: paymentId,
            status: 'pending' as const,
            hops: 0,
            amountDelivered: null,
            error: null,
          }
        } catch (error) {
          logger.error('failed to send payment', { error })
          return new RpcFailure('Failed to initiate payment')
        }
      }),

    /**
     * Get payment status by ID
     *
     * @param id - Payment ID returned from sendPayment
     * @returns Payment status object
     * @example
     * ```typescript
     * const status = await trpc.test.ilp.getPaymentStatus.query({ id: 'payment_abc123' })
     * // { id: 'payment_abc123', status: 'fulfilled', amountDelivered: '70', ... }
     * ```
     */
    getPaymentStatus: protectedRoute
      .input(
        z.object({
          id: z.string(),
        }),
      )
      .query(({ input: { id }, context: { sig } }) => {
        try {
          const database = sig.reactor.use(Database)
          const payment = database.tables.outgoingPayment.selectOne({ id })

          if (!payment) {
            logger.warn('payment not found', { id })
            return {
              id,
              status: 'failed' as const,
              hops: 0,
              amountDelivered: null,
              error: 'Payment not found',
            }
          }

          // Calculate hops (for now, default to 0 - this would need to be tracked separately)
          // In a full implementation, hops would be tracked during STREAM protocol execution
          const hops = 0

          return {
            id: payment.id,
            status: payment.status,
            hops,
            amountDelivered:
              payment.sent_amount > 0 ? String(payment.sent_amount) : null,
            error: payment.error ?? null,
          }
        } catch (error) {
          logger.error('failed to get payment status', { id, error })
          return new RpcFailure('Failed to retrieve payment status')
        }
      }),
  }),

  ledger: createRouter({
    /**
     * Get current internal ledger state
     *
     * @returns Ledger state with balances and account entries
     * @example
     * ```typescript
     * const state = await trpc.test.ledger.getState.query()
     * // { balance: 5000, pendingBalance: 150, routingRevenue: 230, ... }
     * ```
     */
    getState: protectedRoute.query(({ context: { sig } }) => {
      try {
        const database = sig.reactor.use(Database)

        // Query all accounts from the database
        const accounts = database.tables.accounts.selectAll()

        let totalBalance = 0n
        let routingRevenue = 0n
        let feesPaid = 0n

        const accountEntries = accounts.map((account) => {
          const balance = account.credits_posted - account.debits_posted

          // Accumulate total balance (all credits minus all debits)
          totalBalance += balance

          // Track revenue (revenue accounts have positive balance)
          if (account.path.includes('revenue')) {
            routingRevenue += balance
          }

          // Track fees (expense accounts have negative balance)
          if (account.path.includes('expense') || account.path.includes('fee')) {
            feesPaid += balance < 0n ? -balance : 0n
          }

          return {
            path: account.path,
            debit: Number(account.debits_posted),
            credit: Number(account.credits_posted),
          }
        })

        logger.debug?.('retrieved ledger state', {
          balance: totalBalance,
          accountCount: accounts.length,
        })

        return {
          balance: Number(totalBalance),
          pendingBalance: 0, // Pending transfers not tracked in database, only in-memory
          routingRevenue: Number(routingRevenue),
          feesPaid: Number(feesPaid),
          accounts: accountEntries,
        }
      } catch (error) {
        logger.error('failed to get ledger state', { error })
        return new RpcFailure('Failed to retrieve ledger state')
      }
    }),
  }),
})
