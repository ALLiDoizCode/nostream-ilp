import { sendClosedPacket, sendReqPacket } from '../utils/packet-sender'
import { createLogger } from '../../factories/logger-factory'
import { getSubscriptionPreferencesManager } from './subscription-preferences'

import type { StreamConnection, Subscription, SubscriptionManager } from '../subscription-manager'
import type { ILPPeerInfo } from '../types/ilp-peer-info'
import type { AddressResolver } from './address-resolver'
import type { PaymentChannelManager } from './payment-channel-manager'

/**
 * Auto-Subscriber Module
 *
 * Automatically creates and manages subscriptions to followed peers.
 * Handles subscription lifecycle: create, renew, close.
 *
 * @module btp-nips/peer-discovery/auto-subscriber
 */

const debug = createLogger('btp-nips:auto-subscriber')

/**
 * Channel opening prompt for UI integration
 */
export interface ChannelOpeningPrompt {
  /** Peer's public key */
  peerPubkey: string
  /** Peer's ILP address */
  peerIlpAddress: string
  /** Required deposit amount (in base currency units) */
  requiredDeposit: string
  /** Estimated fees for opening channel */
  estimatedFees: string
  /** Peer's endpoint URL */
  peerEndpoint: string
  /** User action (approve or cancel) */
  action: 'approve' | 'cancel'
}

/**
 * Error thrown when a payment channel is required but not found
 */
export class ChannelRequiredError extends Error {
  constructor(
    message: string,
    public readonly peerInfo: ILPPeerInfo
  ) {
    super(message)
    this.name = 'ChannelRequiredError'
  }
}

/**
 * Auto-Subscriber
 *
 * Manages automatic subscriptions to followed peers.
 * Resolves ILP addresses, checks payment channels, and creates subscriptions.
 *
 * Usage:
 * ```typescript
 * const autoSubscriber = new AutoSubscriber(
 *   addressResolver,
 *   subscriptionManager,
 *   paymentChannelManager
 * );
 *
 * // Subscribe to a followed user
 * try {
 *   await autoSubscriber.subscribeToUser('bob_pubkey');
 * } catch (error) {
 *   if (error instanceof ChannelRequiredError) {
 *     // Prompt user to open channel
 *     const prompt = autoSubscriber.promptChannelOpening(error.peerInfo);
 *     // Show UI prompt...
 *   }
 * }
 *
 * // Unsubscribe from a peer
 * await autoSubscriber.unsubscribeFromPeer('bob_pubkey');
 * ```
 */
export class AutoSubscriber {
  private addressResolver: AddressResolver
  private subscriptionManager: SubscriptionManager
  private paymentChannelManager: PaymentChannelManager
  private localIlpAddress: string
  private activeSubscriptions: Map<string, string> = new Map() // pubkey -> subscriptionId

  /**
   * Create an AutoSubscriber instance
   *
   * @param addressResolver - Resolver for ILP addresses from pubkeys
   * @param subscriptionManager - Manager for active subscriptions
   * @param paymentChannelManager - Manager for payment channels
   * @param localIlpAddress - Local node's ILP address (default: 'g.dassie.local')
   */
  constructor(
    addressResolver: AddressResolver,
    subscriptionManager: SubscriptionManager,
    paymentChannelManager: PaymentChannelManager,
    localIlpAddress: string = 'g.dassie.local'
  ) {
    this.addressResolver = addressResolver
    this.subscriptionManager = subscriptionManager
    this.paymentChannelManager = paymentChannelManager
    this.localIlpAddress = localIlpAddress
  }

  /**
   * Subscribe to a user's events
   *
   * Flow:
   * 1. Resolve ILP address from pubkey
   * 2. Check if payment channel exists
   * 3. Create REQ subscription with default filters
   * 4. Send REQ packet via ILP STREAM
   * 5. Store subscription in manager
   *
   * @param pubkey - The user's public key (64-char hex)
   * @throws ChannelRequiredError if no payment channel exists
   *
   * @example
   * ```typescript
   * try {
   *   await autoSubscriber.subscribeToUser('abcd1234...');
   * } catch (error) {
   *   if (error instanceof ChannelRequiredError) {
   *     console.log('Need to open channel first:', error.peerInfo);
   *   }
   * }
   * ```
   */
  async subscribeToUser(pubkey: string): Promise<void> {
    try {
      debug('Subscribing to user: %s', pubkey.substring(0, 8))

      // 1. Resolve ILP address
      const peerInfo = await this.addressResolver.resolveIlpAddress(pubkey)

      if (!peerInfo) {
        debug('Cannot subscribe: peer %s has no ILP announcement', pubkey.substring(0, 8))
        throw new Error(`Peer ${pubkey} has no ILP announcement (not on BTP-NIPs network)`)
      }

      // 2. Check if payment channel exists
      const hasChannel = await this.paymentChannelManager.hasChannel(peerInfo.ilpAddress)

      if (!hasChannel) {
        debug('Cannot subscribe: no payment channel for %s', peerInfo.ilpAddress)
        throw new ChannelRequiredError(
          `Payment channel required for ${peerInfo.ilpAddress}`,
          peerInfo
        )
      }

      // 3. Get subscription preferences
      const preferencesManager = getSubscriptionPreferencesManager()
      const prefs = await preferencesManager.getPreferences(this.localIlpAddress)

      // 4. Create default filters for this follow
      const filters = preferencesManager.getDefaultFiltersForFollow(pubkey)

      // 5. Generate subscription ID
      const subscriptionId = this.generateSubscriptionId(pubkey)

      // 6. Create REQ message
      const req = {
        subscriptionId,
        filters,
      }

      // 7. Establish ILP STREAM connection (mock for now)
      const streamConnection = await this.establishStream(peerInfo.ilpAddress)

      // 8. Send REQ packet with payment
      await sendReqPacket(
        streamConnection,
        req,
        prefs.paymentAmountMsats,
        prefs.subscriptionDurationMs
      )

      // 9. Add to subscription manager
      const subscription: Subscription = {
        id: subscriptionId,
        subscriber: peerInfo.ilpAddress,
        streamConnection,
        filters,
        expiresAt: Date.now() + prefs.subscriptionDurationMs,
        active: true,
      }

      this.subscriptionManager.addSubscription(subscription)
      this.activeSubscriptions.set(pubkey, subscriptionId)

      debug(
        'Subscribed to peer: pubkey=%s, ilpAddress=%s, subId=%s',
        pubkey.substring(0, 8),
        peerInfo.ilpAddress,
        subscriptionId
      )
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      debug('Failed to subscribe to user %s: %s', pubkey.substring(0, 8), errorMessage)
      throw error
    }
  }

  /**
   * Unsubscribe from a peer's events
   *
   * Flow:
   * 1. Find active subscription for peer
   * 2. Send CLOSE packet
   * 3. Remove from subscription manager
   * 4. Optionally close payment channel if no other subscriptions
   *
   * @param pubkey - The user's public key
   *
   * @example
   * ```typescript
   * await autoSubscriber.unsubscribeFromPeer('abcd1234...');
   * ```
   */
  async unsubscribeFromPeer(pubkey: string): Promise<void> {
    try {
      debug('Unsubscribing from peer: %s', pubkey.substring(0, 8))

      // 1. Find active subscription
      const subscriptionId = this.activeSubscriptions.get(pubkey)

      if (!subscriptionId) {
        debug('No active subscription for pubkey %s', pubkey.substring(0, 8))
        return
      }

      const subscription = this.subscriptionManager.getSubscription(subscriptionId)

      if (!subscription) {
        debug('Subscription %s not found in manager', subscriptionId)
        this.activeSubscriptions.delete(pubkey)
        return
      }

      // 2. Send CLOSE packet
      await sendClosedPacket(
        subscription.streamConnection,
        subscriptionId,
        'User unfollowed'
      )

      // 3. Remove from subscription manager
      this.subscriptionManager.removeSubscription(subscriptionId)
      this.activeSubscriptions.delete(pubkey)

      debug('Unsubscribed from peer: pubkey=%s, subId=%s', pubkey.substring(0, 8), subscriptionId)

      // 4. Optionally close payment channel
      // (For now, leave channel open - it may be reused later)
      // TODO: Implement channel closing logic when no active subscriptions remain
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      debug('Failed to unsubscribe from peer %s: %s', pubkey.substring(0, 8), errorMessage)
      throw error
    }
  }

  /**
   * Create a channel opening prompt for UI integration
   *
   * Returns prompt data that the UI can display to the user.
   * UI handles user approval/cancellation.
   *
   * @param peerInfo - Information about the peer
   * @returns ChannelOpeningPrompt with required deposit and fees
   *
   * @example
   * ```typescript
   * const prompt = autoSubscriber.promptChannelOpening(peerInfo);
   * // Display prompt to user
   * console.log(`Open channel to ${prompt.peerIlpAddress}?`);
   * console.log(`Deposit: ${prompt.requiredDeposit}`);
   * ```
   */
  promptChannelOpening(peerInfo: ILPPeerInfo): ChannelOpeningPrompt {
    // Calculate required deposit (10 subscriptions worth of payments)
    // TODO: Load actual payment amount from preferences
    const basePayment = BigInt(1000) // 1000 msats default
    const requiredDeposit = (basePayment * BigInt(10)).toString()

    // Estimate fees (placeholder - should query on-chain gas prices)
    const estimatedFees = '500' // 500 msats

    return {
      peerPubkey: peerInfo.pubkey,
      peerIlpAddress: peerInfo.ilpAddress,
      requiredDeposit,
      estimatedFees,
      peerEndpoint: peerInfo.endpoint || 'Unknown',
      action: 'approve', // Default to approve (UI will override)
    }
  }

  /**
   * Generate a subscription ID for a pubkey
   *
   * @param pubkey - The user's public key
   * @returns Subscription ID (format: auto-sub-<first 16 chars of pubkey>)
   */
  private generateSubscriptionId(pubkey: string): string {
    return `auto-sub-${pubkey.substring(0, 16)}`
  }

  /**
   * Establish ILP STREAM connection to a peer
   *
   * PLACEHOLDER: This is a mock implementation until ILP STREAM integration is complete.
   * Real implementation will use Dassie STREAM API.
   *
   * @param peerIlpAddress - Peer's ILP address
   * @returns Mock StreamConnection
   */
  private async establishStream(peerIlpAddress: string): Promise<StreamConnection> {
    // TODO: Replace with actual ILP STREAM establishment
    debug('MOCK: Establishing STREAM to %s', peerIlpAddress)

    return {
      sendPacket: async (data: Buffer) => {
        debug('MOCK: Sending packet (%d bytes) to %s', data.length, peerIlpAddress)
      },
      fulfillPacket: async () => {
        debug('MOCK: Fulfilling packet for %s', peerIlpAddress)
      },
      rejectPacket: async (reason: string) => {
        debug('MOCK: Rejecting packet for %s: %s', peerIlpAddress, reason)
      },
      close: async () => {
        debug('MOCK: Closing STREAM to %s', peerIlpAddress)
      },
    }
  }

  /**
   * Get active subscription ID for a pubkey
   *
   * @param pubkey - The user's public key
   * @returns Subscription ID if active, undefined otherwise
   */
  getActiveSubscription(pubkey: string): string | undefined {
    return this.activeSubscriptions.get(pubkey)
  }

  /**
   * Get all active subscriptions
   *
   * @returns Map of pubkey -> subscriptionId
   */
  getAllActiveSubscriptions(): Map<string, string> {
    return new Map(this.activeSubscriptions)
  }
}

/**
 * Singleton instance of AutoSubscriber
 */
let subscriberInstance: AutoSubscriber | null = null

/**
 * Get the singleton instance of AutoSubscriber
 *
 * @returns Shared AutoSubscriber instance
 */
export function getAutoSubscriber(): AutoSubscriber {
  if (!subscriberInstance) {
    // Dependencies will be injected during initialization
    throw new Error('AutoSubscriber not initialized - call setAutoSubscriber() first')
  }
  return subscriberInstance
}

/**
 * Set the singleton instance of AutoSubscriber
 *
 * @param instance - AutoSubscriber instance to use
 */
export function setAutoSubscriber(instance: AutoSubscriber): void {
  subscriberInstance = instance
}
