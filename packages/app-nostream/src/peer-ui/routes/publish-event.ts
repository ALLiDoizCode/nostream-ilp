import { Request, Response, Router } from 'express'
import { peerAuth } from '../middleware/peer-auth'
import { NostrEvent, verifyEventSignature } from '../utils/event-signer'
import { createLogger } from '../../factories/logger-factory'
import { slidingWindowRateLimiterFactory } from '../../factories/rate-limiter-factory'
import { getRemoteAddress } from '../../utils/http'
import { SettingsStatic } from '../../utils/settings'
import { path } from 'ramda'

const logger = createLogger('peer-ui:publish')
const router: Router = Router()

/**
 * Check if the request should be rate limited for publish endpoint
 */
async function isRateLimited(request: Request): Promise<boolean> {
  const settings = SettingsStatic.createSettings()
  const rateLimits = path(['limits', 'peerPublish', 'rateLimits'], settings)

  if (!Array.isArray(rateLimits) || !rateLimits.length) {
    return false
  }

  const ipWhitelist = path(['limits', 'peerPublish', 'ipWhitelist'], settings)
  const remoteAddress = getRemoteAddress(request, settings)

  let limited = false
  if (Array.isArray(ipWhitelist) && !ipWhitelist.includes(remoteAddress)) {
    const rateLimiter = slidingWindowRateLimiterFactory()
    for (const { rate, period } of rateLimits) {
      if (await rateLimiter.hit(`${remoteAddress}:peer-publish:${period}`, 1, { period, rate })) {
        logger('rate limited %s: %d in %d milliseconds', remoteAddress, rate, period)
        limited = true
      }
    }
  }

  return limited
}

/**
 * POST /peer/api/publish
 * Publish a signed Nostr event via BTP-NIPs
 *
 * Request body: Signed NostrEvent
 * Response: { success: boolean, eventId?: string, error?: string }
 */
router.post('/api/publish', peerAuth, async (req: Request, res: Response) => {
  try {
    // Rate limit check
    const limited = await isRateLimited(req)
    if (limited) {
      res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
      })
      return
    }

    const event: NostrEvent = req.body

    // Validate event structure
    if (!event || typeof event !== 'object') {
      res.status(400).json({
        success: false,
        error: 'Invalid request body. Expected a Nostr event object.',
      })
      return
    }

    // Validate required fields
    const requiredFields = ['id', 'pubkey', 'created_at', 'kind', 'tags', 'content', 'sig']
    for (const field of requiredFields) {
      if (!(field in event)) {
        res.status(400).json({
          success: false,
          error: `Missing required field: ${field}`,
        })
        return
      }
    }

    // Verify event signature
    if (!verifyEventSignature(event)) {
      logger('Invalid signature for event %s from pubkey %s', event.id, event.pubkey)
      res.status(400).json({
        success: false,
        error: 'Invalid event signature',
      })
      return
    }

    // TODO: Integrate with BTP-NIPs handler
    // For now, we'll simulate publishing to connected peers
    // In a real implementation, this would:
    // 1. Create a BTPNIPsPacket with the event
    // 2. Calculate payment amount based on event kind/size
    // 3. Send via ILP STREAM to connected peers
    // 4. Wait for confirmation

    // Check if we have connected peers
    // This would normally query the Dassie node for peer status
    const hasConnectedPeers = await checkConnectedPeers()

    if (!hasConnectedPeers) {
      logger('Publish failed - no connected peers for event %s', event.id)
      res.status(503).json({
        success: false,
        error: 'No connected peers available. Cannot publish event.',
      })
      return
    }

    // Simulate publishing (placeholder for BTP-NIPs integration)
    logger('Publishing event %s (kind %d) from pubkey %s', event.id, event.kind, event.pubkey)

    // TODO: Actual BTP-NIPs integration
    // const btpPacket = createBTPNIPsPacket(event)
    // const result = await sendViaBTPNIPs(btpPacket)

    // For now, just return success
    res.json({
      success: true,
      eventId: event.id,
      message: 'Event published successfully (placeholder - BTP-NIPs integration pending)',
    })
  } catch (error: any) {
    logger('Publish error: %s', error.message)
    console.error('Publish error:', error)
    res.status(500).json({
      success: false,
      error: `Internal server error: ${error.message}`,
    })
  }
})

/**
 * Check if there are connected peers
 * TODO: Query actual Dassie node via RPC
 */
async function checkConnectedPeers(): Promise<boolean> {
  // Placeholder implementation
  // In real implementation, this would query Dassie via tRPC:
  // const dassieClient = getDassieClient()
  // const peers = await dassieClient.getPeers.query()
  // return peers.length > 0

  // For now, return true to allow testing
  return true
}

/**
 * Status endpoint - get peer connection status
 * GET /peer/api/status
 */
router.get('/api/status', peerAuth, async (req: Request, res: Response) => {
  try {
    // TODO: Query actual Dassie node status
    // For now, return placeholder data
    const status = {
      connectedPeers: 0,
      activeChannels: 0,
      canPublish: false,
    }

    // Placeholder: Check if we can publish
    // In real implementation, query Dassie for peer connections
    const hasConnectedPeers = await checkConnectedPeers()
    status.canPublish = hasConnectedPeers

    // Mock some peers for testing
    status.connectedPeers = hasConnectedPeers ? 3 : 0
    status.activeChannels = hasConnectedPeers ? 2 : 0

    res.json(status)
  } catch (error: any) {
    logger('Status check error: %s', error.message)
    console.error('Status check error:', error)
    res.status(500).json({
      error: `Internal server error: ${error.message}`,
    })
  }
})

export default router
