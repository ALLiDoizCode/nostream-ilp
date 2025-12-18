import { Request, Response, Router } from 'express'
import { createLogger } from '../../factories/logger-factory'
import { getMasterDbClient, getReadReplicaDbClient } from '../../database/client'
import { EventRepository } from '../../repositories/event-repository'
import { SubscriptionMonitor } from '../services/subscription-monitor'
import { DBEvent, Event } from '../../@types/event'
import { peerAuth } from '../middleware/peer-auth'
import { SettingsStatic } from '../../utils/settings'
import { getRemoteAddress } from '../../utils/http'
import { slidingWindowRateLimiterFactory } from '../../factories/rate-limiter-factory'
import { path } from 'ramda'

const debug = createLogger('event-feed-route')
const router: Router = Router()

interface EventFeedQueryParams {
  limit?: string
  offset?: string
  authors?: string
  kinds?: string
  since?: string
  until?: string
}

/**
 * Convert DBEvent to Nostr Event
 */
function dbEventToNostrEvent(dbEvent: DBEvent): Event {
  return {
    id: dbEvent.event_id.toString('hex'),
    pubkey: dbEvent.event_pubkey.toString('hex'),
    created_at: dbEvent.event_created_at,
    kind: dbEvent.event_kind,
    tags: dbEvent.event_tags || [],
    content: dbEvent.event_content,
    sig: dbEvent.event_signature.toString('hex'),
  }
}

/**
 * Check if the request should be rate limited for event feed endpoint
 */
async function isRateLimited(request: Request): Promise<boolean> {
  const settings = SettingsStatic.createSettings()
  const rateLimits = path(['limits', 'peerEventFeed', 'rateLimits'], settings)

  if (!rateLimits || typeof rateLimits !== 'object') {
    return false
  }

  const ipWhitelist = path(['limits', 'peerEventFeed', 'ipWhitelist'], settings)
  const remoteAddress = getRemoteAddress(request, settings)

  let limited = false
  if (!Array.isArray(ipWhitelist) || !ipWhitelist.includes(remoteAddress)) {
    const rateLimiter = slidingWindowRateLimiterFactory()
    const { rate, period } = rateLimits as { rate: number; period: number }
    if (await rateLimiter.hit(`${remoteAddress}:peer-event-feed:${period}`, 1, { period, rate })) {
      debug('rate limited %s: %d in %d milliseconds', remoteAddress, rate, period)
      limited = true
    }
  }

  return limited
}

/**
 * GET /peer/api/events
 *
 * Query events with pagination and filters
 *
 * Query parameters:
 * - limit: Number of events to return (default: 50, max: 100)
 * - offset: Offset for pagination (default: 0)
 * - authors: Comma-separated list of author pubkeys (hex)
 * - kinds: Comma-separated list of event kinds
 * - since: Unix timestamp for start date
 * - until: Unix timestamp for end date
 *
 * Response:
 * {
 *   events: Event[],
 *   total: number,
 *   hasMore: boolean
 * }
 */
router.get('/api/events', peerAuth, async (req: Request, res: Response) => {
  // Rate limiting
  const limited = await isRateLimited(req)
  if (limited) {
    res.status(429).json({
      error: 'Rate limit exceeded. Please try again later.',
    })
    return
  }

  try {
    const {
      limit: limitStr = '50',
      offset: offsetStr = '0',
      authors,
      kinds,
      since: sinceStr,
      until: untilStr,
    } = req.query as EventFeedQueryParams

    // Parse query parameters
    const limit = parseInt(String(limitStr), 10) || 50
    const offset = parseInt(String(offsetStr), 10) || 0
    const since = sinceStr ? parseInt(String(sinceStr), 10) : undefined
    const until = untilStr ? parseInt(String(untilStr), 10) : undefined

    // Parse comma-separated values
    const authorsArray = authors && typeof authors === 'string'
      ? authors.split(',').map((a) => a.trim()).filter(Boolean)
      : undefined

    const kindsArray = kinds && typeof kinds === 'string'
      ? kinds.split(',').map((k) => parseInt(k.trim(), 10)).filter((n) => !isNaN(n))
      : undefined

    debug('querying events with params: limit=%d, offset=%d, authors=%o, kinds=%o', limit, offset, authorsArray, kindsArray)

    // Create event repository
    const masterDb = getMasterDbClient()
    const replicaDb = getReadReplicaDbClient()
    const eventRepository = new EventRepository(masterDb, replicaDb)

    // Create subscription monitor
    const subscriptionMonitor = new SubscriptionMonitor(eventRepository)

    // Query events
    const result = await subscriptionMonitor.queryEvents({
      limit,
      offset,
      authors: authorsArray,
      kinds: kindsArray,
      since,
      until,
    })

    // Convert DBEvent to NostrEvent format for API response
    const nostrEvents = result.events.map(dbEventToNostrEvent)

    res.json({
      events: nostrEvents,
      total: result.total,
      hasMore: result.hasMore,
    })
  } catch (error) {
    debug('error handling event feed request: %o', error)
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

/**
 * Peer list cache
 * Cache duration: 60 seconds
 */
interface PeerCache {
  data: { peers: Array<{ pubkey: string; name?: string; connected: boolean }> }
  timestamp: number
}

let peerListCache: PeerCache | null = null
const PEER_CACHE_TTL_MS = 60000 // 60 seconds

/**
 * GET /peer/api/peers
 *
 * Get list of connected peers (author pubkeys)
 *
 * Response:
 * {
 *   peers: [
 *     { pubkey: string, name?: string, connected: boolean }
 *   ]
 * }
 */
router.get('/api/peers', peerAuth, async (req: Request, res: Response) => {
  try {
    // Check cache
    const now = Date.now()
    if (peerListCache && (now - peerListCache.timestamp) < PEER_CACHE_TTL_MS) {
      debug('returning cached peer list')
      res.json(peerListCache.data)
      return
    }

    // Query connected peers from event repository
    // Get distinct pubkeys from recent events (last 24 hours)
    const masterDb = getMasterDbClient()
    const twentyFourHoursAgo = Math.floor(Date.now() / 1000) - 86400

    const peers = await masterDb('events')
      .distinct('event_pubkey')
      .where('event_created_at', '>=', twentyFourHoursAgo)
      .orderBy('event_pubkey')
      .limit(100)

    // Convert Buffer to hex string and format response
    const peerList = peers.map((row: any) => ({
      pubkey: row.event_pubkey.toString('hex'),
      connected: true, // All peers with recent events are considered connected
    }))

    debug('found %d connected peers', peerList.length)

    const responseData = { peers: peerList }

    // Update cache
    peerListCache = {
      data: responseData,
      timestamp: now,
    }

    res.json(responseData)
  } catch (error) {
    debug('error fetching peer list: %o', error)
    res.status(500).json({
      error: 'Internal server error',
      message: (error as Error).message,
    })
  }
})

debug('event feed routes registered')

export default router
