import { Request, Response, Router } from 'express'
import { createLogger } from '../../factories/logger-factory'
import { peerAuth } from '../middleware/peer-auth'
import { btpNipsBridge } from '../services/btp-nips-bridge'
import { calculateSubscriptionCost, validateSubscriptionTTL } from '../../btp-nips/subscription-pricing'
import { sendReqPacket, sendClosedPacket } from '../../btp-nips/utils/packet-sender'
import { slidingWindowRateLimiterFactory } from '../../factories/rate-limiter-factory'
import { getRemoteAddress } from '../../utils/http'
import { SettingsStatic } from '../../utils/settings'
import { path } from 'ramda'
import type { NostrFilter } from '../../btp-nips/types/index'

/**
 * Subscription Manager API Routes
 * HTTP endpoints for managing BTP-NIPs subscriptions
 *
 * Endpoints:
 * - GET /peer/api/subscriptions - List all active subscriptions
 * - GET /peer/api/subscriptions/:id - Get single subscription details
 * - POST /peer/api/subscriptions - Create new subscription (send REQ)
 * - POST /peer/api/subscriptions/:id/renew - Renew subscription (send REQ with updated TTL)
 * - DELETE /peer/api/subscriptions/:id - Unsubscribe (send CLOSE)
 *
 * Reference: docs/stories/9.3.story.md#Task 2
 */

const debug = createLogger('peer-ui:subscription-manager')
const router: Router = Router()

/**
 * Check if the request should be rate limited for subscription endpoints
 *
 * Read endpoints (GET): 60 requests per minute
 * Mutation endpoints (POST, DELETE): 20 requests per minute
 */
async function isRateLimited(
  request: Request,
  endpointType: 'read' | 'mutation'
): Promise<boolean> {
  const settings = SettingsStatic.createSettings()
  const rateLimitConfig =
    endpointType === 'read'
      ? path(['limits', 'peerSubscriptionRead', 'rateLimits'], settings)
      : path(['limits', 'peerSubscriptionMutation', 'rateLimits'], settings)

  if (!rateLimitConfig || typeof rateLimitConfig !== 'object') {
    // Default rate limits if not configured
    const defaultLimits =
      endpointType === 'read'
        ? { rate: 60, period: 60000 } // 60 req/min
        : { rate: 20, period: 60000 } // 20 req/min

    const rateLimiter = slidingWindowRateLimiterFactory()
    const remoteAddress = getRemoteAddress(request, settings)
    const key = `${remoteAddress}:peer-subscription-${endpointType}:${defaultLimits.period}`

    if (await rateLimiter.hit(key, 1, defaultLimits)) {
      debug(
        'rate limited %s (%s): %d in %d milliseconds',
        remoteAddress,
        endpointType,
        defaultLimits.rate,
        defaultLimits.period
      )
      return true
    }

    return false
  }

  const ipWhitelist =
    endpointType === 'read'
      ? path(['limits', 'peerSubscriptionRead', 'ipWhitelist'], settings)
      : path(['limits', 'peerSubscriptionMutation', 'ipWhitelist'], settings)
  const remoteAddress = getRemoteAddress(request, settings)

  let limited = false
  if (!Array.isArray(ipWhitelist) || !ipWhitelist.includes(remoteAddress)) {
    const rateLimiter = slidingWindowRateLimiterFactory()
    const { rate, period } = rateLimitConfig as { rate: number; period: number }
    const key = `${remoteAddress}:peer-subscription-${endpointType}:${period}`

    if (await rateLimiter.hit(key, 1, { period, rate })) {
      debug(
        'rate limited %s (%s): %d in %d milliseconds',
        remoteAddress,
        endpointType,
        rate,
        period
      )
      limited = true
    }
  }

  return limited
}

/**
 * Validate Nostr filter structure
 * Checks that filter has at least one valid criterion
 */
function validateFilter(filter: any): filter is NostrFilter {
  if (typeof filter !== 'object' || filter === null) {
    return false
  }

  // Filter must have at least one criterion
  const hasAuthors = Array.isArray(filter.authors) && filter.authors.length > 0
  const hasKinds = Array.isArray(filter.kinds) && filter.kinds.length > 0
  const hasIds = Array.isArray(filter.ids) && filter.ids.length > 0
  const hasSince = typeof filter.since === 'number'
  const hasUntil = typeof filter.until === 'number'
  const hasLimit = typeof filter.limit === 'number'

  // Accept filter if it has at least one criterion OR is empty (catch-all)
  return (
    hasAuthors || hasKinds || hasIds || hasSince || hasUntil || hasLimit || Object.keys(filter).length === 0
  )
}

/**
 * Validate filters array
 */
function validateFilters(filters: any): filters is NostrFilter[] {
  if (!Array.isArray(filters) || filters.length === 0) {
    return false
  }

  return filters.every((f) => validateFilter(f))
}

/**
 * Validate subscriber ILP address format
 * Must start with "g." and contain only valid characters
 */
function validateILPAddress(address: string): boolean {
  if (typeof address !== 'string' || !address.startsWith('g.')) {
    return false
  }

  // ILP address format: g.{connector}.{account}
  // Valid characters: a-z, 0-9, ., -, _
  const validPattern = /^g\.[a-z0-9._-]+$/i
  return validPattern.test(address)
}

/**
 * GET /peer/api/subscriptions
 *
 * Query parameters:
 * - subscriber: Filter by ILP address (optional)
 *
 * Response:
 * {
 *   subscriptions: SubscriptionWithStatus[],
 *   count: number
 * }
 */
router.get('/api/subscriptions', peerAuth, async (req: Request, res: Response) => {
  // Rate limiting
  const limited = await isRateLimited(req, 'read')
  if (limited) {
    res.status(429).json({
      error: 'Rate limit exceeded. Please try again later.',
    })
    return
  }

  try {
    const { subscriber } = req.query

    let subscriptions

    if (subscriber && typeof subscriber === 'string') {
      // Filter by subscriber
      subscriptions = btpNipsBridge.getSubscriptionsBySubscriber(subscriber)
    } else {
      // Get all active subscriptions
      subscriptions = btpNipsBridge.getActiveSubscriptions()
    }

    debug('Retrieved %d subscriptions', subscriptions.length)

    res.json({
      subscriptions,
      count: subscriptions.length,
    })
  } catch (error) {
    debug('Error getting subscriptions: %o', error)
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

/**
 * GET /peer/api/subscriptions/:id
 *
 * Get single subscription details
 *
 * Response:
 * {
 *   subscription: SubscriptionWithStatus
 * }
 */
router.get('/api/subscriptions/:id', peerAuth, async (req: Request, res: Response) => {
  // Rate limiting
  const limited = await isRateLimited(req, 'read')
  if (limited) {
    res.status(429).json({
      error: 'Rate limit exceeded. Please try again later.',
    })
    return
  }

  try {
    const { id } = req.params

    if (!id) {
      res.status(400).json({
        error: 'Subscription ID is required',
      })
      return
    }

    const subscription = btpNipsBridge.getSubscription(id)

    if (!subscription) {
      res.status(404).json({
        error: 'Subscription not found',
        subscriptionId: id,
      })
      return
    }

    debug('Retrieved subscription: %s', id)

    res.json({
      subscription,
    })
  } catch (error) {
    debug('Error getting subscription %s: %o', req.params.id, error)
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

/**
 * POST /peer/api/subscriptions
 *
 * Create new subscription (send REQ packet)
 *
 * Request body:
 * {
 *   subscriber: string,       // ILP address
 *   filters: NostrFilter[],
 *   ttl: number               // Time-to-live in seconds
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   subscriptionId: string,
 *   cost: number,
 *   expiresAt: number
 * }
 */
router.post('/api/subscriptions', peerAuth, async (req: Request, res: Response) => {
  // Rate limiting
  const limited = await isRateLimited(req, 'mutation')
  if (limited) {
    res.status(429).json({
      error: 'Rate limit exceeded. Please try again later.',
    })
    return
  }

  try {
    const { subscriber, filters, ttl } = req.body

    // Validate subscriber
    if (!subscriber || !validateILPAddress(subscriber)) {
      res.status(400).json({
        error: 'Invalid or missing subscriber ILP address',
        details: 'ILP address must start with "g." and contain only valid characters',
      })
      return
    }

    // Validate filters
    if (!validateFilters(filters)) {
      res.status(400).json({
        error: 'Invalid or missing filters',
        details: 'Filters must be a non-empty array of valid NostrFilter objects',
      })
      return
    }

    // Validate TTL
    const ttlValidation = validateSubscriptionTTL(ttl)
    if (!ttlValidation.isValid) {
      res.status(400).json({
        error: 'Invalid TTL',
        details: ttlValidation.error,
      })
      return
    }

    // Calculate cost
    const cost = calculateSubscriptionCost(ttl)

    // Generate subscription ID
    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    // TODO: Get StreamConnection for subscriber
    // For now, this is a placeholder - actual implementation would:
    // 1. Look up StreamConnection from peer connection manager
    // 2. Send REQ packet via sendReqPacket()
    // 3. Add subscription to SubscriptionManager
    //
    // Placeholder response:
    debug(
      'Creating subscription: id=%s, subscriber=%s, ttl=%ds, cost=%d msats',
      subscriptionId,
      subscriber,
      ttl,
      cost
    )

    res.status(501).json({
      error: 'Not implemented',
      details:
        'Subscription creation requires StreamConnection integration (Story 9.6: Peer Discovery UI)',
      subscriptionId,
      cost,
      estimatedExpiresAt: Date.now() + ttl * 1000,
    })
  } catch (error) {
    debug('Error creating subscription: %o', error)
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

/**
 * POST /peer/api/subscriptions/:id/renew
 *
 * Renew subscription (send REQ with updated TTL)
 *
 * Request body:
 * {
 *   ttl: number  // New time-to-live in seconds
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   newExpiresAt: number,
 *   cost: number
 * }
 */
router.post('/api/subscriptions/:id/renew', peerAuth, async (req: Request, res: Response) => {
  // Rate limiting
  const limited = await isRateLimited(req, 'mutation')
  if (limited) {
    res.status(429).json({
      error: 'Rate limit exceeded. Please try again later.',
    })
    return
  }

  try {
    const { id } = req.params
    const { ttl } = req.body

    // Validate subscription exists
    const subscription = btpNipsBridge.getSubscription(id)
    if (!subscription) {
      res.status(404).json({
        error: 'Subscription not found',
        subscriptionId: id,
      })
      return
    }

    // Validate TTL
    const ttlValidation = validateSubscriptionTTL(ttl)
    if (!ttlValidation.isValid) {
      res.status(400).json({
        error: 'Invalid TTL',
        details: ttlValidation.error,
      })
      return
    }

    // Calculate renewal cost
    const cost = calculateSubscriptionCost(ttl)
    const newExpiresAt = Date.now() + ttl * 1000

    // TODO: Send REQ packet with renewal
    // For now, this is a placeholder - actual implementation would:
    // 1. Get StreamConnection from subscription
    // 2. Send REQ packet via sendReqPacket() with new TTL
    // 3. Update subscription expiresAt in SubscriptionManager
    //
    // Placeholder response:
    debug(
      'Renewing subscription: id=%s, ttl=%ds, cost=%d msats, newExpiresAt=%s',
      id,
      ttl,
      cost,
      new Date(newExpiresAt).toISOString()
    )

    res.status(501).json({
      error: 'Not implemented',
      details:
        'Subscription renewal requires StreamConnection integration (Story 9.6: Peer Discovery UI)',
      subscriptionId: id,
      cost,
      estimatedNewExpiresAt: newExpiresAt,
    })
  } catch (error) {
    debug('Error renewing subscription %s: %o', req.params.id, error)
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

/**
 * DELETE /peer/api/subscriptions/:id
 *
 * Unsubscribe (send CLOSE packet)
 *
 * Response:
 * {
 *   success: boolean
 * }
 */
router.delete('/api/subscriptions/:id', peerAuth, async (req: Request, res: Response) => {
  // Rate limiting
  const limited = await isRateLimited(req, 'mutation')
  if (limited) {
    res.status(429).json({
      error: 'Rate limit exceeded. Please try again later.',
    })
    return
  }

  try {
    const { id } = req.params

    // Validate subscription exists
    const subscription = btpNipsBridge.getSubscription(id)
    if (!subscription) {
      res.status(404).json({
        error: 'Subscription not found',
        subscriptionId: id,
      })
      return
    }

    // TODO: Send CLOSE packet and remove subscription
    // For now, this is a placeholder - actual implementation would:
    // 1. Get StreamConnection from subscription
    // 2. Send CLOSE packet via sendClosedPacket()
    // 3. Remove subscription from SubscriptionManager
    //
    // Placeholder response:
    debug('Unsubscribing: id=%s, subscriber=%s', id, subscription.subscriber)

    res.status(501).json({
      error: 'Not implemented',
      details:
        'Subscription deletion requires StreamConnection integration (Story 9.6: Peer Discovery UI)',
      subscriptionId: id,
    })
  } catch (error) {
    debug('Error unsubscribing %s: %o', req.params.id, error)
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

debug('subscription manager routes registered')

export default router
