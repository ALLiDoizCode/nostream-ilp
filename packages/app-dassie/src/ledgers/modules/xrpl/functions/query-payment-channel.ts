import type { AccountChannelsResponse, Client } from "xrpl"

import { settlementXrpl as logger } from "../../../../logger/instances"
import type { XrplPaymentChannelState } from "../types/payment-channel-state"

/**
 * Query a single payment channel from XRPL
 *
 * @remarks
 *
 * This function uses the `account_channels` RPC method to fetch channel
 * details from the XRP Ledger. It queries channels where the specified
 * account is the destination (recipient).
 *
 * @param client - XRPL client instance
 * @param recipientAddress - Relay's XRP address (channel recipient)
 * @param channelId - Payment channel ID (64-character hex string)
 * @returns Channel state if found, undefined otherwise
 */
export async function queryPaymentChannel(
  client: Client,
  recipientAddress: string,
  channelId: string,
): Promise<XrplPaymentChannelState | undefined> {
  logger.debug?.("querying payment channel from XRPL", {
    recipientAddress,
    channelId,
  })

  try {
    // Query all channels for this account
    const response = (await client.request({
      command: "account_channels",
      account: recipientAddress,
      ledger_index: "validated",
    })) as AccountChannelsResponse

    if (!response.result.channels) {
      logger.debug?.("no channels found for account", { recipientAddress })
      return undefined
    }

    // Find the specific channel
    const channel = response.result.channels.find(
      (c) => c.channel_id === channelId,
    )

    if (!channel) {
      logger.debug?.("channel not found", { channelId })
      return undefined
    }

    // Convert XRPL channel to XrplPaymentChannelState
    const channelState: XrplPaymentChannelState = {
      channelId: channel.channel_id,
      sender: channel.account,
      recipient: channel.destination_account,
      amount: channel.amount,
      balance: channel.amount, // XRPL doesn't expose balance directly; use amount
      settleDelay: channel.settle_delay,
      expiration: channel.expiration,
      publicKey: channel.public_key ?? "",
      highestClaimAmount: "0", // Not available from XRPL; track locally
      highestNonce: 0, // Not available from XRPL; track locally
      status: determineChannelStatus(channel),
      lastClaimTime: Date.now(),
      totalClaims: 0, // Not available from XRPL; track locally
      createdAt: Date.now(), // Not available from XRPL; use current time
    }

    logger.debug?.("payment channel queried successfully", {
      channelId,
      sender: channelState.sender,
      amount: channelState.amount,
    })

    return channelState
  } catch (error) {
    logger.error("failed to query payment channel", {
      recipientAddress,
      channelId,
      error,
    })
    return undefined
  }
}

/**
 * Query all payment channels for an account
 *
 * @remarks
 *
 * This function retrieves all payment channels where the specified account
 * is the destination (recipient). Useful for discovering all active channels
 * with the relay.
 *
 * @param client - XRPL client instance
 * @param recipientAddress - Relay's XRP address (channel recipient)
 * @returns Array of channel states
 */
export async function queryAllPaymentChannels(
  client: Client,
  recipientAddress: string,
): Promise<XrplPaymentChannelState[]> {
  logger.debug?.("querying all payment channels from XRPL", {
    recipientAddress,
  })

  try {
    const response = (await client.request({
      command: "account_channels",
      account: recipientAddress,
      ledger_index: "validated",
    })) as AccountChannelsResponse

    if (!response.result.channels || response.result.channels.length === 0) {
      logger.debug?.("no channels found for account", { recipientAddress })
      return []
    }

    // Convert all channels to XrplPaymentChannelState
    const channelStates = response.result.channels.map((channel) => {
      const channelState: XrplPaymentChannelState = {
        channelId: channel.channel_id,
        sender: channel.account,
        recipient: channel.destination_account,
        amount: channel.amount,
        balance: channel.amount,
        settleDelay: channel.settle_delay,
        expiration: channel.expiration,
        publicKey: channel.public_key ?? "",
        highestClaimAmount: "0",
        highestNonce: 0,
        status: determineChannelStatus(channel),
        lastClaimTime: Date.now(),
        totalClaims: 0,
        createdAt: Date.now(),
      }

      return channelState
    })

    logger.info("payment channels queried successfully", {
      recipientAddress,
      channelCount: channelStates.length,
    })

    return channelStates
  } catch (error) {
    logger.error("failed to query payment channels", {
      recipientAddress,
      error,
    })
    return []
  }
}

/**
 * Determine channel status from XRPL channel data
 *
 * @remarks
 *
 * XRPL doesn't explicitly store channel status. We infer it from:
 * - Expiration time
 * - Existence in ledger (if found, it's OPEN)
 *
 * More detailed status tracking (CLOSING, CLOSED) requires local state.
 *
 * @param channel - XRPL channel data
 * @returns Channel status
 */
function determineChannelStatus(channel: {
  expiration?: number
}): XrplPaymentChannelState["status"] {
  // Check if expired
  if (channel.expiration !== undefined) {
    const RIPPLE_EPOCH_OFFSET = 946_684_800
    const nowRippleEpoch = Math.floor(Date.now() / 1000) - RIPPLE_EPOCH_OFFSET

    if (nowRippleEpoch >= channel.expiration) {
      return "EXPIRED"
    }
  }

  // If channel exists on ledger and not expired, it's OPEN
  // (CLOSING and CLOSED states require local tracking)
  return "OPEN"
}

/**
 * Payment channel cache entry
 */
interface CachedChannel {
  state: XrplPaymentChannelState
  cachedAt: number // Unix milliseconds
}

/**
 * Simple in-memory cache for payment channels
 *
 * @remarks
 *
 * Caches channel state to reduce XRPL queries. Cache entries expire after
 * a configurable duration (default: 60 seconds).
 */
export class PaymentChannelCache {
  private cache = new Map<string, CachedChannel>()
  private cacheDuration: number

  /**
   * Create a new payment channel cache
   *
   * @param cacheDurationMs - Cache entry lifetime in milliseconds (default: 60000 = 1 minute)
   */
  constructor(cacheDurationMs = 60_000) {
    this.cacheDuration = cacheDurationMs
  }

  /**
   * Get cached channel state
   *
   * @param channelId - Payment channel ID
   * @returns Cached state if valid, undefined if expired or not found
   */
  get(channelId: string): XrplPaymentChannelState | undefined {
    const cached = this.cache.get(channelId)
    if (!cached) return undefined

    const now = Date.now()
    const age = now - cached.cachedAt

    if (age > this.cacheDuration) {
      // Cache expired
      this.cache.delete(channelId)
      return undefined
    }

    return cached.state
  }

  /**
   * Store channel state in cache
   *
   * @param channelId - Payment channel ID
   * @param state - Channel state to cache
   */
  set(channelId: string, state: XrplPaymentChannelState): void {
    this.cache.set(channelId, {
      state,
      cachedAt: Date.now(),
    })
  }

  /**
   * Invalidate (remove) cached channel state
   *
   * @param channelId - Payment channel ID
   */
  invalidate(channelId: string): void {
    this.cache.delete(channelId)
  }

  /**
   * Clear all cached channel states
   */
  clear(): void {
    this.cache.clear()
  }
}
