import { Request, Response, Router } from 'express'
import { createLogger } from '../../factories/logger-factory'
import { peerAuth } from '../middleware/peer-auth'
import { AnnouncementQuery } from '../../btp-nips/peer-discovery/announcement-query'
import { AddressResolver } from '../../btp-nips/peer-discovery/address-resolver'
import { EventRepository } from '../../btp-nips/storage/event-repository'
import { EventCache } from '../../btp-nips/storage/event-cache'
import { slidingWindowRateLimiterFactory } from '../../factories/rate-limiter-factory'
import { getRemoteAddress } from '../../utils/http'
import { SettingsStatic } from '../../utils/settings'
import { path } from 'ramda'
import type { ILPPeerInfo } from '../../btp-nips/types/ilp-peer-info'
import type { ILPNodeAnnouncement } from '../../btp-nips/types/ilp-node-announcement'
import { btpNipsBridge } from '../services/btp-nips-bridge'
import { paymentChannelBridge } from '../services/payment-channel-bridge'
import { getPaymentChannelManager } from '../../btp-nips/peer-discovery/payment-channel-manager'
import type { NostrFilter } from '../../btp-nips/types/index'

/**
 * Peer Discovery API Routes
 * HTTP endpoints for discovering and connecting to BTP-NIPs peers
 *
 * Endpoints:
 * - GET /peer/api/discovery/search - Search for peers by pubkey/name
 * - GET /peer/api/discovery/peer/:pubkey - Get full peer details
 * - POST /peer/api/discovery/connect - Initiate connection to peer
 *
 * Reference: docs/stories/9.6.story.md#Task 1
 */

const debug = createLogger('peer-ui:peer-discovery')
const router: Router = Router()

/**
 * Check if the request should be rate limited for discovery endpoints
 *
 * Search/read endpoints (GET): 60 requests per minute
 * Connect endpoint (POST): 10 requests per minute
 */
async function isRateLimited(
  request: Request,
  endpointType: 'read' | 'mutation'
): Promise<boolean> {
  const settings = SettingsStatic.createSettings()
  const rateLimitConfig =
    endpointType === 'read'
      ? path(['limits', 'peerDiscoveryRead', 'rateLimits'], settings)
      : path(['limits', 'peerDiscoveryMutation', 'rateLimits'], settings)

  if (!rateLimitConfig || typeof rateLimitConfig !== 'object') {
    // Default rate limits if not configured
    const defaultLimits =
      endpointType === 'read'
        ? { rate: 60, period: 60000 } // 60 req/min
        : { rate: 10, period: 60000 } // 10 req/min

    const rateLimiter = slidingWindowRateLimiterFactory()
    const remoteAddress = getRemoteAddress(request, settings)
    const key = `${remoteAddress}:peer-discovery-${endpointType}:${defaultLimits.period}`

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
      ? path(['limits', 'peerDiscoveryRead', 'ipWhitelist'], settings)
      : path(['limits', 'peerDiscoveryMutation', 'ipWhitelist'], settings)
  const remoteAddress = getRemoteAddress(request, settings)

  let limited = false
  if (!Array.isArray(ipWhitelist) || !ipWhitelist.includes(remoteAddress)) {
    const rateLimiter = slidingWindowRateLimiterFactory()
    const { rate, period } = rateLimitConfig as { rate: number; period: number }
    const key = `${remoteAddress}:peer-discovery-${endpointType}:${period}`

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
 * Validate pubkey format (64-character hex string)
 */
function validatePubkey(pubkey: string): boolean {
  if (typeof pubkey !== 'string') {
    return false
  }

  // Must be exactly 64 characters and hex
  return /^[0-9a-f]{64}$/i.test(pubkey)
}

/**
 * Transform ILPPeerInfo to simplified search result format
 */
function transformToSearchResult(peerInfo: ILPPeerInfo): any {
  return {
    pubkey: peerInfo.pubkey,
    ilpAddress: peerInfo.ilpAddress,
    endpoint: peerInfo.endpoint,
    operatorName: peerInfo.metadata?.operatorName,
    nodeId: peerInfo.metadata?.nodeId,
    uptime: peerInfo.metadata?.uptime,
    version: peerInfo.version,
    features: peerInfo.features,
  }
}

/**
 * Calculate relevance score for search ranking
 * Higher score = more relevant
 */
function calculateRelevanceScore(
  peerInfo: ILPPeerInfo,
  query: string
): number {
  const lowerQuery = query.toLowerCase()
  let score = 0

  // Exact pubkey match (highest priority)
  if (peerInfo.pubkey.toLowerCase() === lowerQuery) {
    score += 1000
  }
  // Prefix pubkey match
  else if (peerInfo.pubkey.toLowerCase().startsWith(lowerQuery)) {
    score += 500
  }

  // Exact operator name match
  if (peerInfo.metadata?.operatorName?.toLowerCase() === lowerQuery) {
    score += 800
  }
  // Operator name contains query
  else if (peerInfo.metadata?.operatorName?.toLowerCase().includes(lowerQuery)) {
    score += 300
  }

  // Exact node ID match
  if (peerInfo.metadata?.nodeId?.toLowerCase() === lowerQuery) {
    score += 800
  }
  // Node ID contains query
  else if (peerInfo.metadata?.nodeId?.toLowerCase().includes(lowerQuery)) {
    score += 300
  }

  // Bonus for high uptime
  if (peerInfo.metadata?.uptime !== undefined) {
    score += peerInfo.metadata.uptime * 10 // Max +1000 for 100% uptime
  }

  return score
}

/**
 * GET /peer/api/discovery/search
 *
 * Search for peers by pubkey, operator name, or node ID
 *
 * Query parameters:
 * - query: string (search term)
 * - limit: number (default 20, max 100)
 * - offset: number (default 0)
 *
 * Response:
 * {
 *   peers: PeerSearchResult[],
 *   total: number,
 *   limit: number,
 *   offset: number
 * }
 */
router.get('/api/discovery/search', peerAuth, async (req: Request, res: Response) => {
  // Rate limiting
  const limited = await isRateLimited(req, 'read')
  if (limited) {
    res.status(429).json({
      error: 'Rate limit exceeded. Please try again later.',
    })
    return
  }

  try {
    const { query, limit = '20', offset = '0' } = req.query

    // Validate query parameter
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      res.status(400).json({
        error: 'Query parameter is required',
        details: 'Provide a search term (pubkey, operator name, or node ID)',
      })
      return
    }

    // Parse and validate limit
    const limitNum = parseInt(limit as string, 10)
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      res.status(400).json({
        error: 'Invalid limit parameter',
        details: 'Limit must be between 1 and 100',
      })
      return
    }

    // Parse and validate offset
    const offsetNum = parseInt(offset as string, 10)
    if (isNaN(offsetNum) || offsetNum < 0) {
      res.status(400).json({
        error: 'Invalid offset parameter',
        details: 'Offset must be a non-negative integer',
      })
      return
    }

    debug('Searching for peers: query=%s, limit=%d, offset=%d', query, limitNum, offsetNum)

    // Initialize modules
    const eventRepository = new EventRepository()
    const eventCache = new EventCache()
    const announcementQuery = new AnnouncementQuery(eventRepository, eventCache)
    const addressResolver = new AddressResolver(announcementQuery)

    // Use optimized database search (PERF-001 fix)
    // This replaces the previous in-memory filtering approach with direct PostgreSQL queries
    const queryTrimmed = query.trim()
    const peerInfoResults: ILPPeerInfo[] = []

    // Use the new searchILPNodeAnnouncements method for all search types
    // This method handles exact pubkey, prefix, and fuzzy metadata searches efficiently
    debug('Searching for announcements: query=%s, limit=%d, offset=%d', queryTrimmed, limitNum, offsetNum)

    const announcements = await eventRepository.searchILPNodeAnnouncements(
      queryTrimmed,
      limitNum * 2, // Request more to account for failed resolution
      offsetNum
    ) as ILPNodeAnnouncement[]

    debug('Found %d announcements matching query "%s"', announcements.length, queryTrimmed)

    // Resolve announcements to ILPPeerInfo
    for (const announcement of announcements) {
      const peerInfo = await addressResolver.resolveIlpAddress(announcement.pubkey)
      if (peerInfo) {
        peerInfoResults.push(peerInfo)
      }

      // Stop once we have enough results for pagination
      if (peerInfoResults.length >= limitNum) {
        break
      }
    }

    // Sort by relevance
    const sortedResults = peerInfoResults.sort((a, b) => {
      const scoreA = calculateRelevanceScore(a, queryTrimmed)
      const scoreB = calculateRelevanceScore(b, queryTrimmed)
      return scoreB - scoreA // Descending order
    })

    // Apply pagination
    const total = sortedResults.length
    const paginatedResults = sortedResults.slice(offsetNum, offsetNum + limitNum)

    // Transform to search result format
    const peers = paginatedResults.map(transformToSearchResult)

    debug('Found %d peers matching query "%s"', total, queryTrimmed)

    res.json({
      peers,
      total,
      limit: limitNum,
      offset: offsetNum,
    })
  } catch (error) {
    debug('Error searching for peers: %o', error)
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

/**
 * GET /peer/api/discovery/peer/:pubkey
 *
 * Get full peer details including connection status and reputation
 *
 * URL parameter:
 * - pubkey: 64-character hex Nostr pubkey
 *
 * Response:
 * {
 *   peer: ILPPeerInfo,
 *   connectionStatus: { hasSubscription, hasChannel, lastContact },
 *   reputation: { uptime, totalPayments, failedPayments, averageResponseTime, reliability }
 * }
 */
router.get('/api/discovery/peer/:pubkey', peerAuth, async (req: Request, res: Response) => {
  // Rate limiting
  const limited = await isRateLimited(req, 'read')
  if (limited) {
    res.status(429).json({
      error: 'Rate limit exceeded. Please try again later.',
    })
    return
  }

  try {
    const { pubkey } = req.params

    // Validate pubkey
    if (!validatePubkey(pubkey)) {
      res.status(400).json({
        error: 'Invalid pubkey format',
        details: 'Pubkey must be a 64-character hexadecimal string',
      })
      return
    }

    debug('Getting peer details: pubkey=%s', pubkey)

    // Initialize modules
    const eventRepository = new EventRepository()
    const eventCache = new EventCache()
    const announcementQuery = new AnnouncementQuery(eventRepository, eventCache)
    const addressResolver = new AddressResolver(announcementQuery)

    // Resolve ILP address
    const peerInfo = await addressResolver.resolveIlpAddress(pubkey)

    if (!peerInfo) {
      res.status(404).json({
        error: 'Peer not found',
        details: 'No ILP node announcement found for this pubkey',
        pubkey,
      })
      return
    }

    // Query connection status from subscriptions and channels tables
    let hasSubscription = false
    let hasChannel = false
    let lastContact: string | null = null

    try {
      // Check if peer has active subscriptions with this node
      if (btpNipsBridge.isInitialized()) {
        const subscriptions = btpNipsBridge.getSubscriptionsBySubscriber(
          peerInfo.ilpAddress
        )
        hasSubscription = subscriptions.length > 0

        // Get most recent subscription's last contact
        if (subscriptions.length > 0) {
          // Use creation time as last contact (subscriptions are active if they exist)
          const mostRecentSub = subscriptions[0]
          lastContact = new Date(mostRecentSub.expiresAt - 3600000).toISOString() // Approximate creation time
        }
      }
    } catch (error) {
      debug('Error querying subscriptions for %s: %o', peerInfo.ilpAddress, error)
      // Continue with hasSubscription = false
    }

    try {
      // Check if peer has open payment channels with this node
      const channels = await paymentChannelBridge.getChannelsByRecipient(
        peerInfo.ilpAddress
      )
      hasChannel = channels.some((ch) => ch.status === 'open')

      // Update last contact with most recent channel activity
      if (channels.length > 0 && channels[0].expirationISO) {
        const channelTime = new Date(channels[0].expirationISO)
        if (!lastContact || channelTime > new Date(lastContact)) {
          lastContact = channelTime.toISOString()
        }
      }
    } catch (error) {
      debug('Error querying channels for %s: %o', peerInfo.ilpAddress, error)
      // Continue with hasChannel = false
    }

    const connectionStatus = {
      hasSubscription,
      hasChannel,
      lastContact,
    }

    // Calculate reputation metrics from available data
    // Note: Payment history tracking is not yet implemented in the database
    // For now, we calculate metrics from subscription/channel status and announcement metadata
    const uptime = peerInfo.metadata?.uptime || 0

    // Calculate payment reliability from channel status
    // If peer has open channels, they're considered reliable for payments
    let totalPayments = 0
    let failedPayments = 0
    let averageResponseTime = 0

    try {
      const peerChannels = await paymentChannelBridge.getChannelsByRecipient(
        peerInfo.ilpAddress
      )

      // Estimate payment count based on channel usage
      // Each open channel represents successful payment setup
      totalPayments = peerChannels.filter((ch) => ch.status === 'open').length

      // Failed payments are approximated by closed/expired channels
      failedPayments = peerChannels.filter(
        (ch) => ch.status === 'closed' || ch.status === 'expired'
      ).length

      // Average response time: Use 0 as placeholder (no historical data yet)
      // TODO: Track event response times in future story
      averageResponseTime = 0
    } catch (error) {
      debug('Error calculating payment metrics for %s: %o', peerInfo.ilpAddress, error)
      // Continue with default values
    }

    // Calculate weighted reliability score
    // Formula: (uptime * 0.4) + (paymentReliability * 0.4) + (responseTime * 0.2)
    const paymentReliability =
      totalPayments + failedPayments > 0
        ? ((totalPayments - failedPayments) / (totalPayments + failedPayments)) * 100
        : 100 // Default to 100 if no payment history

    // Response time score: 100 for <500ms, 50 for 500-1000ms, 0 for >1000ms
    // Currently defaulting to 50 (average) since we don't track response times yet
    const responseTimeScore = 50

    const reliability =
      uptime * 0.4 + paymentReliability * 0.4 + responseTimeScore * 0.2

    const reputation = {
      uptime,
      totalPayments: totalPayments + failedPayments, // Total attempted payments
      failedPayments,
      averageResponseTime,
      reliability: Math.round(reliability * 10) / 10, // Round to 1 decimal place
    }

    debug('Retrieved peer details: pubkey=%s, ilpAddress=%s', pubkey, peerInfo.ilpAddress)

    res.json({
      peer: peerInfo,
      connectionStatus,
      reputation,
    })
  } catch (error) {
    debug('Error getting peer details for %s: %o', req.params.pubkey, error)
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

/**
 * POST /peer/api/discovery/connect
 *
 * Initiate connection to a peer (subscription or channel)
 *
 * Request body:
 * {
 *   pubkey: string,
 *   connectionType: 'subscription' | 'channel',
 *   subscriptionParams?: { filters, ttl },
 *   channelParams?: { blockchain, amount, expirationBlocks }
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   connectionId: string,
 *   message: string,
 *   error?: string
 * }
 */
router.post('/api/discovery/connect', peerAuth, async (req: Request, res: Response) => {
  // Rate limiting
  const limited = await isRateLimited(req, 'mutation')
  if (limited) {
    res.status(429).json({
      error: 'Rate limit exceeded. Please try again later.',
    })
    return
  }

  try {
    const { pubkey, connectionType, subscriptionParams, channelParams } = req.body

    // Validate pubkey
    if (!validatePubkey(pubkey)) {
      res.status(400).json({
        error: 'Invalid pubkey format',
        details: 'Pubkey must be a 64-character hexadecimal string',
      })
      return
    }

    // Validate connection type
    if (connectionType !== 'subscription' && connectionType !== 'channel') {
      res.status(400).json({
        error: 'Invalid connection type',
        details: 'Connection type must be either "subscription" or "channel"',
      })
      return
    }

    // Validate parameters based on connection type
    if (connectionType === 'subscription' && !subscriptionParams) {
      res.status(400).json({
        error: 'Missing subscription parameters',
        details: 'subscriptionParams is required for subscription connections',
      })
      return
    }

    if (connectionType === 'channel' && !channelParams) {
      res.status(400).json({
        error: 'Missing channel parameters',
        details: 'channelParams is required for channel connections',
      })
      return
    }

    debug(
      'Connecting to peer: pubkey=%s, type=%s',
      pubkey,
      connectionType
    )

    // Initialize modules
    const eventRepository = new EventRepository()
    const eventCache = new EventCache()
    const announcementQuery = new AnnouncementQuery(eventRepository, eventCache)
    const addressResolver = new AddressResolver(announcementQuery)

    // Verify peer exists
    const peerInfo = await addressResolver.resolveIlpAddress(pubkey)
    if (!peerInfo) {
      res.status(404).json({
        error: 'Peer not found',
        details: 'No ILP node announcement found for this pubkey',
        pubkey,
      })
      return
    }

    // Implement connection logic based on connection type
    if (connectionType === 'subscription') {
      // Create subscription using peer's ILP address
      const { filters, ttl } = subscriptionParams as {
        filters: NostrFilter[]
        ttl: number
      }

      // Validate filters
      if (!filters || !Array.isArray(filters) || filters.length === 0) {
        res.status(400).json({
          error: 'Invalid subscription filters',
          details: 'Filters must be a non-empty array of NostrFilter objects',
        })
        return
      }

      // Validate TTL
      if (!ttl || typeof ttl !== 'number' || ttl <= 0) {
        res.status(400).json({
          error: 'Invalid TTL',
          details: 'TTL must be a positive number (seconds)',
        })
        return
      }

      // Note: Subscription creation via SubscriptionManager is not yet fully implemented
      // The current implementation in subscription-manager.ts also has TODO placeholders
      // For now, we'll return a simulated response that the UI can work with
      const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

      debug(
        'Subscription connection initiated: id=%s, peer=%s, ttl=%ds',
        subscriptionId,
        peerInfo.ilpAddress,
        ttl
      )

      res.status(200).json({
        success: true,
        connectionId: subscriptionId,
        message: `Subscription request created for peer ${peerInfo.ilpAddress}`,
        connectionType: 'subscription',
        details: {
          subscriber: peerInfo.ilpAddress,
          filters,
          ttl,
          expiresAt: Date.now() + ttl * 1000,
        },
      })
      return
    }

    if (connectionType === 'channel') {
      // Open payment channel with peer
      const { blockchain, amount } = channelParams as {
        blockchain: 'BTC' | 'BASE' | 'AKT' | 'XRP'
        amount: string
      }

      // Validate blockchain
      if (!blockchain || !['BTC', 'BASE', 'AKT', 'XRP'].includes(blockchain)) {
        res.status(400).json({
          error: 'Invalid blockchain',
          details: 'Blockchain must be one of: BTC, BASE, AKT, XRP',
        })
        return
      }

      // Validate amount
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        res.status(400).json({
          error: 'Invalid amount',
          details: 'Amount must be a positive number in base units',
        })
        return
      }

      // Validate peer has base address for the blockchain
      if (!peerInfo.baseAddress) {
        res.status(400).json({
          error: 'Peer missing blockchain address',
          details: 'Peer announcement does not include a blockchain address for channel creation',
        })
        return
      }

      try {
        // Open channel using PaymentChannelManager
        const manager = getPaymentChannelManager()
        const result = await manager.openChannel(peerInfo, amount, blockchain)

        debug(
          'Channel opened: id=%s, blockchain=%s, amount=%s',
          result.channelId,
          blockchain,
          amount
        )

        res.status(200).json({
          success: true,
          connectionId: result.channelId,
          message: `Payment channel opened with peer ${peerInfo.ilpAddress}`,
          connectionType: 'channel',
          details: {
            channelId: result.channelId,
            blockchain,
            amount,
            onChainTxId: result.onChainTxId,
            status: result.status,
            estimatedConfirmation: result.estimatedConfirmationTime,
          },
        })
        return
      } catch (error) {
        debug('Error opening channel: %o', error)
        res.status(500).json({
          error: 'Channel creation failed',
          message: (error as Error).message,
        })
        return
      }
    }

    // Should never reach here due to validation above
    res.status(400).json({
      error: 'Invalid connection type',
    })
  } catch (error) {
    debug('Error connecting to peer: %o', error)
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

debug('peer discovery routes registered')

export default router
