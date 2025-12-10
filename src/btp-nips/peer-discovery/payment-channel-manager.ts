import { createLogger } from '../../factories/logger-factory.js'
import { getDassieClient } from '../../factories/dassie-client-factory.js'

import type { DassieClient } from '../../services/payment/dassie-client.js'
import type { ILPPeerInfo } from '../types/ilp-peer-info.js'

/**
 * Payment Channel Manager
 *
 * Manages ILP payment channels via Dassie RPC for peer subscriptions.
 * Provides methods to check channel existence, open/close channels,
 * and query channel balances.
 *
 * @module btp-nips/peer-discovery/payment-channel-manager
 */

const debug = createLogger('btp-nips:payment-channel-manager')

/**
 * Result of opening a payment channel
 */
export interface OpenChannelResult {
  /** Channel ID (unique identifier) */
  channelId: string
  /** On-chain transaction ID */
  onChainTxId: string
  /** Channel status */
  status: 'pending' | 'confirmed' | 'failed'
  /** Estimated confirmation time (Unix timestamp) */
  estimatedConfirmationTime?: number
}

/**
 * Result of closing a payment channel
 */
export interface CloseChannelResult {
  /** Whether the close succeeded */
  success: boolean
  /** On-chain transaction ID for settlement */
  onChainTxId?: string
  /** Amount refunded to sender */
  refundAmount?: string
  /** Amount claimed by relay */
  relayAmount?: string
}

/**
 * Channel state information
 */
export interface ChannelState {
  /** Channel ID */
  channelId: string
  /** Blockchain (e.g., 'BASE', 'BTC', 'AKT') */
  blockchain: string
  /** Sender's address */
  sender: string
  /** Recipient's address (relay) */
  recipient: string
  /** Total channel capacity */
  capacity: bigint
  /** Current balance available */
  balance: bigint
  /** Highest nonce used */
  highestNonce: number
  /** Expiration block/timestamp */
  expiration: number
  /** Channel status */
  status: 'open' | 'closed' | 'expired'
}

/**
 * Payment Channel Manager
 *
 * Interfaces with Dassie RPC to manage payment channels for peer subscriptions.
 * Uses Dassie's settlement and payment endpoints.
 *
 * Usage:
 * ```typescript
 * const manager = new PaymentChannelManager();
 *
 * // Check if channel exists
 * const exists = await manager.hasChannel('g.dassie.alice');
 *
 * // Open new channel
 * const result = await manager.openChannel(peerInfo, '1000000');
 *
 * // Query balance
 * const balance = await manager.getChannelBalance('channel_123');
 *
 * // Close channel
 * await manager.closeChannel('channel_123');
 * ```
 */
export class PaymentChannelManager {
  private dassieClient: DassieClient
  private channelCache: Map<string, ChannelState> = new Map()

  /**
   * Create a PaymentChannelManager instance
   *
   * @param dassieClient - Dassie RPC client (optional, defaults to getDassieClient())
   */
  constructor(dassieClient?: DassieClient) {
    this.dassieClient = dassieClient ?? getDassieClient()
  }

  /**
   * Check if a payment channel exists for a peer's ILP address
   *
   * Queries Dassie RPC for channels matching the peer's ILP address.
   * Results are cached to reduce RPC calls.
   *
   * @param peerIlpAddress - The peer's ILP address (e.g., 'g.dassie.alice')
   * @returns true if an open channel exists, false otherwise
   *
   * @example
   * ```typescript
   * if (await manager.hasChannel('g.dassie.alice')) {
   *   console.log('Channel exists, ready to subscribe');
   * }
   * ```
   */
  async hasChannel(peerIlpAddress: string): Promise<boolean> {
    try {
      // Check cache first
      const cached = Array.from(this.channelCache.values()).find(
        (state) => state.recipient === peerIlpAddress && state.status === 'open'
      )

      if (cached) {
        debug('Cache hit for peer channel: %s', peerIlpAddress)
        return true
      }

      // Query Dassie for all channels
      const channels = await this.queryAllChannels()

      // Find channel for this peer
      const peerChannel = channels.find(
        (ch) => ch.recipient === peerIlpAddress && ch.status === 'open'
      )

      if (peerChannel) {
        this.channelCache.set(peerChannel.channelId, peerChannel)
      }

      return !!peerChannel
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      debug('Failed to check channel existence for %s: %s', peerIlpAddress, errorMessage)
      return false // Assume no channel on error
    }
  }

  /**
   * Open a new payment channel for a peer
   *
   * Calls Dassie's settlement.openChannel RPC endpoint to create a payment channel
   * on the specified blockchain (BASE, BTC, AKT, or XRP).
   *
   * This operation:
   * 1. Submits on-chain transaction
   * 2. Waits for confirmation (may take minutes)
   * 3. Returns channel ID and status
   *
   * @param peerInfo - Information about the peer
   * @param depositAmount - Amount to deposit (in base units: wei, sats, uakt, or drops)
   * @param blockchain - Blockchain to use (default: 'BASE')
   * @returns OpenChannelResult with channel ID and confirmation details
   *
   * @example
   * ```typescript
   * const result = await manager.openChannel(
   *   peerInfo,
   *   '1000000000000000000' // 1 ETH in wei
   * );
   * console.log('Channel ID:', result.channelId);
   * ```
   */
  async openChannel(
    peerInfo: ILPPeerInfo,
    depositAmount: string,
    blockchain: 'BASE' | 'BTC' | 'AKT' | 'XRP' = 'BASE'
  ): Promise<OpenChannelResult> {
    try {
      debug(
        'Opening payment channel: peer=%s, blockchain=%s, amount=%s',
        peerInfo.ilpAddress,
        blockchain,
        depositAmount
      )

      // Call Dassie RPC: settlement.openChannel
      // NOTE: Using placeholder until Dassie RPC endpoints are implemented
      // Will be replaced with actual tRPC call: dassieClient.settlement.openChannel.mutate()
      const response = await this.mockOpenChannel(blockchain, peerInfo.baseAddress, depositAmount)

      debug(
        'Channel opened: id=%s, status=%s, txId=%s',
        response.channelId,
        response.status,
        response.onChainTxId
      )

      // Cache channel state (as pending until confirmed)
      this.channelCache.set(response.channelId, {
        channelId: response.channelId,
        blockchain,
        sender: peerInfo.baseAddress,
        recipient: peerInfo.ilpAddress,
        capacity: BigInt(depositAmount),
        balance: BigInt(depositAmount), // Full amount available initially
        highestNonce: 0,
        expiration: 0, // Unknown until confirmed
        status: 'open', // Optimistically set to open
      })

      return response
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      debug('Failed to open channel for %s: %s', peerInfo.ilpAddress, errorMessage)
      throw new Error(`Failed to open payment channel: ${errorMessage}`)
    }
  }

  /**
   * Close a payment channel
   *
   * Calls Dassie's settlement.closeChannel RPC endpoint to settle and close a channel.
   *
   * This operation:
   * 1. Submits settlement transaction on-chain
   * 2. Refunds remaining balance to sender
   * 3. Claims relay's earned amount
   *
   * @param channelId - The channel ID to close
   * @param finalAmount - Final amount to claim (optional)
   * @returns CloseChannelResult with settlement details
   *
   * @example
   * ```typescript
   * const result = await manager.closeChannel('channel_123');
   * console.log('Refund:', result.refundAmount);
   * console.log('Claimed:', result.relayAmount);
   * ```
   */
  async closeChannel(channelId: string, finalAmount?: string): Promise<CloseChannelResult> {
    try {
      debug('Closing payment channel: id=%s', channelId)

      // Call Dassie RPC: settlement.closeChannel
      // NOTE: Using placeholder until Dassie RPC endpoints are implemented
      const response = await this.mockCloseChannel(channelId, finalAmount)

      debug('Channel closed: id=%s, success=%s, txId=%s', channelId, response.success, response.onChainTxId)

      // Remove from cache
      this.channelCache.delete(channelId)

      return response
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      debug('Failed to close channel %s: %s', channelId, errorMessage)
      throw new Error(`Failed to close payment channel: ${errorMessage}`)
    }
  }

  /**
   * Get the current balance for a payment channel
   *
   * Queries Dassie's payment.getChannelState RPC endpoint for channel details.
   *
   * @param channelId - The channel ID
   * @returns Current balance available in the channel
   *
   * @example
   * ```typescript
   * const balance = await manager.getChannelBalance('channel_123');
   * console.log('Available:', balance.toString(), 'wei');
   * ```
   */
  async getChannelBalance(channelId: string): Promise<bigint> {
    try {
      // Check cache first
      const cached = this.channelCache.get(channelId)
      if (cached) {
        debug('Cache hit for channel balance: %s', channelId)
        return cached.balance
      }

      // Query Dassie RPC: payment.getChannelState
      // NOTE: Using placeholder until Dassie RPC endpoints are implemented
      const state = await this.mockGetChannelState(channelId)

      // Convert balance from string to BigInt if needed
      const balance = typeof state.balance === 'string' ? BigInt(state.balance) : state.balance

      // Update cache
      this.channelCache.set(channelId, {
        ...state,
        balance,
        capacity: typeof state.capacity === 'string' ? BigInt(state.capacity) : state.capacity,
      })

      debug('Channel balance for %s: %s', channelId, balance.toString())

      return balance
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      debug('Failed to get channel balance for %s: %s', channelId, errorMessage)
      throw new Error(`Failed to get channel balance: ${errorMessage}`)
    }
  }

  /**
   * Get full channel state
   *
   * @param channelId - The channel ID
   * @returns Complete channel state information
   */
  async getChannelState(channelId: string): Promise<ChannelState> {
    try {
      // NOTE: Using placeholder until Dassie RPC endpoints are implemented
      const state = await this.mockGetChannelState(channelId)

      // Convert BigInt fields
      const normalized: ChannelState = {
        ...state,
        balance: typeof state.balance === 'string' ? BigInt(state.balance) : state.balance,
        capacity: typeof state.capacity === 'string' ? BigInt(state.capacity) : state.capacity,
      }

      // Update cache
      this.channelCache.set(channelId, normalized)

      return normalized
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      debug('Failed to get channel state for %s: %s', channelId, errorMessage)
      throw new Error(`Failed to get channel state: ${errorMessage}`)
    }
  }

  /**
   * Query all channels (internal helper)
   *
   * @returns Array of all channel states
   */
  private async queryAllChannels(): Promise<ChannelState[]> {
    try {
      // This is a placeholder - actual Dassie RPC endpoint TBD
      // For now, return cached channels only
      return Array.from(this.channelCache.values())
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      debug('Failed to query all channels: %s', errorMessage)
      return []
    }
  }

  /**
   * Clear the channel cache
   *
   * Useful for testing or forcing refresh from Dassie.
   */
  clearCache(): void {
    this.channelCache.clear()
    debug('Cleared channel cache')
  }

  /**
   * Mock implementation of openChannel (placeholder until Dassie RPC ready)
   * @internal
   */
  private async mockOpenChannel(
    blockchain: string,
    sender: string,
    amount: string
  ): Promise<OpenChannelResult> {
    // TODO: Replace with actual Dassie tRPC call when available
    // await this.dassieClient.settlement.openChannel.mutate({ blockchain, sender, amount })
    const channelId = `mock_channel_${Date.now()}`
    debug('MOCK: Opening channel %s on %s for %s', channelId, blockchain, amount)

    return {
      channelId,
      onChainTxId: `mock_tx_${Date.now()}`,
      status: 'confirmed',
      estimatedConfirmationTime: Math.floor(Date.now() / 1000) + 600, // 10 minutes
    }
  }

  /**
   * Mock implementation of closeChannel (placeholder until Dassie RPC ready)
   * @internal
   */
  private async mockCloseChannel(
    channelId: string,
    _finalAmount?: string
  ): Promise<CloseChannelResult> {
    // TODO: Replace with actual Dassie tRPC call when available
    debug('MOCK: Closing channel %s', channelId)

    const cached = this.channelCache.get(channelId)
    if (!cached) {
      throw new Error(`Channel ${channelId} not found`)
    }

    return {
      success: true,
      onChainTxId: `mock_close_tx_${Date.now()}`,
      refundAmount: cached.balance.toString(),
      relayAmount: '0',
    }
  }

  /**
   * Mock implementation of getChannelState (placeholder until Dassie RPC ready)
   * @internal
   */
  private async mockGetChannelState(channelId: string): Promise<ChannelState> {
    // TODO: Replace with actual Dassie tRPC call when available
    debug('MOCK: Getting channel state for %s', channelId)

    const cached = this.channelCache.get(channelId)
    if (cached) {
      return cached
    }

    // Return mock state if not in cache
    throw new Error(`Channel ${channelId} not found`)
  }
}

/**
 * Singleton instance of PaymentChannelManager
 */
let managerInstance: PaymentChannelManager | null = null

/**
 * Get the singleton instance of PaymentChannelManager
 *
 * @returns Shared PaymentChannelManager instance
 */
export function getPaymentChannelManager(): PaymentChannelManager {
  if (!managerInstance) {
    managerInstance = new PaymentChannelManager()
  }
  return managerInstance
}
