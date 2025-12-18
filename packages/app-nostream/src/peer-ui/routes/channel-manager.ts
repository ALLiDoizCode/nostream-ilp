import { Request, Response, Router } from 'express'
import { createLogger } from '../../factories/logger-factory'
import { peerAuth } from '../middleware/peer-auth'
import { paymentChannelBridge } from '../services/payment-channel-bridge'
import { getPaymentChannelManager } from '../../btp-nips/peer-discovery/payment-channel-manager'
import { slidingWindowRateLimiterFactory } from '../../factories/rate-limiter-factory'
import { getRemoteAddress } from '../../utils/http'
import { SettingsStatic } from '../../utils/settings'
import { path } from 'ramda'
import type { ILPPeerInfo } from '../../btp-nips/types/ilp-peer-info'

/**
 * Channel Manager API Routes
 * HTTP endpoints for managing payment channels
 *
 * Endpoints:
 * - GET /peer/api/channels - List all payment channels
 * - GET /peer/api/channels/:id - Get single channel details
 * - POST /peer/api/channels - Open new payment channel
 * - DELETE /peer/api/channels/:id - Close payment channel
 *
 * Reference: docs/stories/9.4.story.md#Task 2
 */

const debug = createLogger('peer-ui:channel-manager')
const router: Router = Router()

/**
 * Check if the request should be rate limited for channel endpoints
 *
 * Read endpoints (GET): 60 requests per minute
 * Mutation endpoints (POST, DELETE): 10 requests per minute
 */
async function isRateLimited(
  request: Request,
  endpointType: 'read' | 'mutation'
): Promise<boolean> {
  const settings = SettingsStatic.createSettings()
  const rateLimitConfig =
    endpointType === 'read'
      ? path(['limits', 'peerChannelRead', 'rateLimits'], settings)
      : path(['limits', 'peerChannelMutation', 'rateLimits'], settings)

  if (!rateLimitConfig || typeof rateLimitConfig !== 'object') {
    // Default rate limits if not configured
    const defaultLimits =
      endpointType === 'read'
        ? { rate: 60, period: 60000 } // 60 req/min
        : { rate: 10, period: 60000 } // 10 req/min (more restrictive for on-chain operations)

    const rateLimiter = slidingWindowRateLimiterFactory()
    const remoteAddress = getRemoteAddress(request, settings)
    const key = `${remoteAddress}:peer-channel-${endpointType}:${defaultLimits.period}`

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
      ? path(['limits', 'peerChannelRead', 'ipWhitelist'], settings)
      : path(['limits', 'peerChannelMutation', 'ipWhitelist'], settings)
  const remoteAddress = getRemoteAddress(request, settings)

  let limited = false
  if (!Array.isArray(ipWhitelist) || !ipWhitelist.includes(remoteAddress)) {
    const rateLimiter = slidingWindowRateLimiterFactory()
    const { rate, period } = rateLimitConfig as { rate: number; period: number }
    const key = `${remoteAddress}:peer-channel-${endpointType}:${period}`

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
 * Validate ILP address format
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
 * Validate blockchain address format
 * Checks format based on blockchain type
 */
function validateBlockchainAddress(address: string, blockchain: string): boolean {
  const normalizedBlockchain = blockchain.toUpperCase()

  switch (normalizedBlockchain) {
    case 'BASE':
      // Ethereum-compatible address (0x followed by 40 hex chars)
      return /^0x[a-fA-F0-9]{40}$/.test(address)
    case 'BTC':
      // Bitcoin address (P2PKH, P2SH, or Bech32)
      return /^(1|3|bc1)[a-zA-Z0-9]{25,62}$/.test(address)
    case 'AKT':
      // Akash address (bech32 format starting with akash)
      return /^akash1[a-z0-9]{38,}$/.test(address)
    case 'XRP':
      // XRP address (base58 starting with r)
      return /^r[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address)
    default:
      // Unknown blockchain, accept any non-empty string
      return typeof address === 'string' && address.length > 0
  }
}

/**
 * Validate deposit amount
 * Must be positive bigint-parseable string
 */
function validateDepositAmount(amount: string): boolean {
  if (typeof amount !== 'string' || amount.length === 0) {
    return false
  }

  try {
    const amountBigInt = BigInt(amount)
    return amountBigInt > 0n
  } catch {
    return false
  }
}

/**
 * Validate blockchain type
 */
function validateBlockchain(blockchain: string): blockchain is 'BASE' | 'BTC' | 'AKT' | 'XRP' {
  const validBlockchains = ['BASE', 'BTC', 'AKT', 'XRP']
  return typeof blockchain === 'string' && validBlockchains.includes(blockchain.toUpperCase())
}

/**
 * GET /peer/api/channels
 *
 * Query parameters:
 * - blockchain: (optional) Filter by blockchain type (BASE, BTC, AKT, XRP)
 * - status: (optional) Filter by status (open, closed, expired)
 *
 * Response:
 * {
 *   channels: Array<ChannelWithStatus>,
 *   count: number
 * }
 */
router.get('/channels', peerAuth, async (request: Request, response: Response) => {
  try {
    // Rate limiting
    if (await isRateLimited(request, 'read')) {
      return response.status(429).json({ error: 'Too many requests' })
    }

    const { blockchain, status } = request.query

    // Get channels
    let channels = await paymentChannelBridge.getAllChannels()

    // Apply filters
    if (blockchain && typeof blockchain === 'string') {
      channels = channels.filter(
        (ch) => ch.blockchain.toUpperCase() === blockchain.toUpperCase()
      )
    }

    if (status && typeof status === 'string') {
      const validStatus = ['open', 'closed', 'expired']
      if (validStatus.includes(status.toLowerCase())) {
        channels = channels.filter((ch) => ch.status === status.toLowerCase())
      }
    }

    debug('Retrieved %d channels (filtered)', channels.length)

    return response.json({
      channels,
      count: channels.length,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    debug('Error getting channels: %s', errorMessage)
    return response.status(500).json({ error: 'Failed to get channels' })
  }
})

/**
 * GET /peer/api/channels/:id
 *
 * Response:
 * ChannelWithStatus object or 404 if not found
 */
router.get('/channels/:id', peerAuth, async (request: Request, response: Response) => {
  try {
    // Rate limiting
    if (await isRateLimited(request, 'read')) {
      return response.status(429).json({ error: 'Too many requests' })
    }

    const { id } = request.params

    if (!id) {
      return response.status(400).json({ error: 'Channel ID required' })
    }

    const channel = await paymentChannelBridge.getChannelState(id)

    if (!channel) {
      return response.status(404).json({ error: 'Channel not found' })
    }

    debug('Retrieved channel: %s', id)

    return response.json(channel)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    debug('Error getting channel %s: %s', request.params.id, errorMessage)
    return response.status(500).json({ error: 'Failed to get channel' })
  }
})

/**
 * POST /peer/api/channels
 *
 * Request body:
 * {
 *   peerIlpAddress: string,
 *   peerBaseAddress: string,
 *   blockchain: 'BASE' | 'BTC' | 'AKT' | 'XRP',
 *   depositAmount: string (in base units)
 * }
 *
 * Response:
 * {
 *   channelId: string,
 *   onChainTxId: string,
 *   status: 'pending' | 'confirmed' | 'failed',
 *   estimatedConfirmation: number
 * }
 */
router.post('/channels', peerAuth, async (request: Request, response: Response) => {
  try {
    // Rate limiting
    if (await isRateLimited(request, 'mutation')) {
      return response.status(429).json({ error: 'Too many requests' })
    }

    const { peerIlpAddress, peerBaseAddress, blockchain, depositAmount } = request.body

    // Validate inputs
    if (!peerIlpAddress || !validateILPAddress(peerIlpAddress)) {
      return response.status(400).json({ error: 'Invalid ILP address' })
    }

    if (!blockchain || !validateBlockchain(blockchain)) {
      return response.status(400).json({ error: 'Invalid blockchain (must be BASE, BTC, AKT, or XRP)' })
    }

    if (!peerBaseAddress || !validateBlockchainAddress(peerBaseAddress, blockchain)) {
      return response.status(400).json({ error: 'Invalid blockchain address' })
    }

    if (!depositAmount || !validateDepositAmount(depositAmount)) {
      return response.status(400).json({ error: 'Invalid deposit amount (must be positive)' })
    }

    // Create peer info object with minimal required fields
    // Note: For channel opening, only ILP address and blockchain address are required
    // The full ILPPeerInfo type requires more fields (pubkey, endpoint, etc.) which
    // are typically obtained from node announcements but aren't needed for basic channel ops
    const peerInfo: ILPPeerInfo = {
      pubkey: '', // Not required for channel ops
      ilpAddress: peerIlpAddress,
      endpoint: '', // Not required for channel ops
      baseAddress: peerBaseAddress,
      supportedTokens: [], // Not required for channel ops
      version: '1.0.0',
      features: [],
    }

    // Open channel
    const manager = getPaymentChannelManager()
    const result = await manager.openChannel(peerInfo, depositAmount, blockchain as any)

    debug(
      'Opened channel: %s (blockchain: %s, amount: %s)',
      result.channelId,
      blockchain,
      depositAmount
    )

    return response.status(201).json({
      channelId: result.channelId,
      onChainTxId: result.onChainTxId,
      status: result.status,
      estimatedConfirmation: result.estimatedConfirmationTime,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    debug('Error opening channel: %s', errorMessage)
    return response.status(500).json({ error: 'Failed to open channel' })
  }
})

/**
 * DELETE /peer/api/channels/:id
 *
 * Query parameters:
 * - finalAmount: (optional) Final amount to claim
 *
 * Response:
 * {
 *   success: boolean,
 *   onChainTxId: string,
 *   refundAmount: string,
 *   relayAmount: string
 * }
 */
router.delete('/channels/:id', peerAuth, async (request: Request, response: Response) => {
  try {
    // Rate limiting
    if (await isRateLimited(request, 'mutation')) {
      return response.status(429).json({ error: 'Too many requests' })
    }

    const { id } = request.params
    const { finalAmount } = request.query

    if (!id) {
      return response.status(400).json({ error: 'Channel ID required' })
    }

    // Validate finalAmount if provided
    if (finalAmount && typeof finalAmount === 'string' && !validateDepositAmount(finalAmount)) {
      return response.status(400).json({ error: 'Invalid finalAmount' })
    }

    // Close channel
    const manager = getPaymentChannelManager()
    const result = await manager.closeChannel(id, finalAmount as string | undefined)

    if (!result.success) {
      return response.status(500).json({ error: 'Failed to close channel' })
    }

    debug('Closed channel: %s (txId: %s)', id, result.onChainTxId)

    return response.json({
      success: result.success,
      onChainTxId: result.onChainTxId,
      refundAmount: result.refundAmount,
      relayAmount: result.relayAmount,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    debug('Error closing channel %s: %s', request.params.id, errorMessage)

    // Check if channel not found
    if (errorMessage.includes('not found')) {
      return response.status(404).json({ error: 'Channel not found' })
    }

    return response.status(500).json({ error: 'Failed to close channel' })
  }
})

export default router
