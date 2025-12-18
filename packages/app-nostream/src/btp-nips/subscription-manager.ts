import { createLogger } from '../factories/logger-factory'
import { SubscriptionIndex } from './subscription-index'
import { eventMatchesFilter } from './utils/filter-matcher'
import { sendClosedPacket } from './utils/packet-sender'

import type { NostrEvent, NostrFilter } from './types/index'

/**
 * Subscription Manager Module
 * Manages active subscriptions for BTP-NIPs protocol
 *
 * Features:
 * - In-memory storage with O(1) add/remove/get operations
 * - Filter-based event matching for subscriptions
 * - Automatic expiry checking and cleanup
 * - Thread-safe subscription lifecycle management
 *
 * Reference: docs/architecture/btp-nips-subscription-flow.md#Subscription Manager
 */

const debug = createLogger('btp-nips:subscription-manager')

/**
 * ILP STREAM connection interface for bidirectional communication
 */
export interface StreamConnection {
  /** Send packet data to the remote peer */
  sendPacket(data: Buffer): Promise<void>
  /** Fulfill the ILP packet (payment accepted) */
  fulfillPacket(): Promise<void>
  /** Reject the ILP packet with a reason */
  rejectPacket(reason: string): Promise<void>
  /** Close the stream connection */
  close(): Promise<void>
}

/**
 * Subscription data structure
 * Represents an active subscription from a peer
 */
export interface Subscription {
  /** Client-generated subscription ID (max 64 chars) */
  id: string
  /** ILP address of the subscriber (e.g., "g.dassie.alice") */
  subscriber: string
  /** ILP STREAM connection for sending events */
  streamConnection: StreamConnection
  /** Array of Nostr filters (OR logic between filters) */
  filters: NostrFilter[]
  /** Unix timestamp (milliseconds) when subscription expires */
  expiresAt: number
  /** Whether subscription is currently active */
  active: boolean
}

/**
 * Subscription Manager
 * Manages lifecycle of active subscriptions with in-memory storage
 *
 * @example
 * ```typescript
 * const manager = new SubscriptionManager();
 *
 * // Add subscription
 * manager.addSubscription({
 *   id: 'sub-123',
 *   subscriber: 'g.dassie.alice',
 *   streamConnection,
 *   filters: [{ authors: ['alice_pubkey'], kinds: [1] }],
 *   expiresAt: Date.now() + 3600000, // 1 hour
 *   active: true
 * });
 *
 * // Find matching subscriptions for an event
 * const matches = manager.findMatchingSubscriptions(event);
 *
 * // Clean up expired subscriptions
 * manager.cleanupExpiredSubscriptions();
 * ```
 */
export class SubscriptionManager {
  /** Internal storage: subscription ID → Subscription */
  private subscriptions: Map<string, Subscription>
  /** Index for O(1) candidate lookup */
  private index: SubscriptionIndex

  constructor() {
    this.subscriptions = new Map()
    this.index = new SubscriptionIndex()
  }

  /**
   * Add a new subscription
   *
   * @param sub - Subscription to add
   * @throws Error if subscription with same ID already exists
   */
  addSubscription(sub: Subscription): void {
    if (this.subscriptions.has(sub.id)) {
      throw new Error(`Subscription already exists: ${sub.id}`)
    }

    this.subscriptions.set(sub.id, sub)
    this.index.addSubscription(sub.id, sub.filters)
    debug('Subscription added: %s (filters: %d)', sub.id, sub.filters.length)
  }

  /**
   * Remove a subscription by ID
   *
   * @param id - Subscription ID to remove
   * @returns true if subscription was removed, false if not found
   */
  removeSubscription(id: string): boolean {
    const subscription = this.subscriptions.get(id)
    if (!subscription) {
      return false
    }

    // Remove from index first
    this.index.removeSubscription(id, subscription.filters)

    // Remove from Map
    const removed = this.subscriptions.delete(id)
    debug('Subscription removed: %s', id)

    return removed
  }

  /**
   * Get a subscription by ID
   *
   * @param id - Subscription ID
   * @returns Subscription if found, null otherwise
   */
  getSubscription(id: string): Subscription | null {
    return this.subscriptions.get(id) ?? null
  }

  /**
   * Get all active subscriptions (not expired)
   *
   * @returns Array of active subscriptions
   */
  getActiveSubscriptions(): Subscription[] {
    const now = Date.now()
    return Array.from(this.subscriptions.values()).filter(
      (sub) => sub.active && sub.expiresAt > now
    )
  }

  /**
   * Get all subscriptions (for internal use, e.g., expiry checking)
   *
   * @returns Map of all subscriptions
   */
  getSubscriptions(): Map<string, Subscription> {
    return this.subscriptions
  }

  /**
   * Get all subscriptions as an array (for renewal checking, etc.)
   *
   * @returns Array of all subscriptions (active and inactive)
   */
  getAllSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values())
  }

  /**
   * Find subscriptions matching a Nostr event
   * Uses indexed lookup for O(1) candidate identification, then filter matching
   *
   * Performance: O(1 + k × m) where:
   * - O(1): Index lookup for candidate subscriptions
   * - k: Number of candidate subscriptions (typically <10)
   * - m: Filters per subscription
   *
   * Optimized in Story 5.5 with SubscriptionIndex
   *
   * @param event - Nostr event to match
   * @returns Array of subscriptions that match the event
   */
  findMatchingSubscriptions(event: NostrEvent): Subscription[] {
    // Step 1: Get candidate subscription IDs from index (O(1) lookup)
    const candidateIds = this.index.findCandidates(event)

    // Step 2: Filter candidates by active status and expiry
    const now = Date.now()
    const matching: Subscription[] = []

    for (const id of candidateIds) {
      const sub = this.subscriptions.get(id)

      // Skip if subscription not found, inactive, or expired
      if (!sub || !sub.active || sub.expiresAt <= now) {
        continue
      }

      // Step 3: Check if event matches ANY of the subscription's filters (OR logic)
      for (const filter of sub.filters) {
        if (eventMatchesFilter(event, filter)) {
          matching.push(sub)
          break // No need to check other filters for this subscription
        }
      }
    }

    debug(
      'Found %d matching subscriptions for event %s (candidates: %d)',
      matching.length,
      event.id.slice(0, 8),
      candidateIds.size
    )

    return matching
  }

  /**
   * Clean up expired subscriptions
   * Marks expired subscriptions as inactive and returns them
   *
   * Note: Does NOT send CLOSED packets - caller is responsible for that
   *
   * @returns Array of expired subscriptions
   */
  cleanupExpiredSubscriptions(): Subscription[] {
    const now = Date.now()
    const expired: Subscription[] = []

    for (const sub of this.subscriptions.values()) {
      if (sub.active && sub.expiresAt <= now) {
        sub.active = false
        expired.push(sub)
      }
    }

    return expired
  }

  /**
   * Get subscription count (for monitoring/debugging)
   *
   * @returns Total number of subscriptions
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size
  }

  /**
   * Get active subscription count (for monitoring/debugging)
   *
   * @returns Number of active subscriptions
   */
  getActiveSubscriptionCount(): number {
    return this.getActiveSubscriptions().length
  }
}

/**
 * Subscription Expiry Actor
 * Background task that checks for expired subscriptions every 60 seconds
 *
 * Flow:
 * 1. Check all subscriptions for expiry (expiresAt < now)
 * 2. Mark expired subscriptions as inactive
 * 3. Send CLOSED packet to subscriber
 * 4. Remove subscription from manager
 *
 * This is a placeholder for Dassie reactor integration.
 * In production, this would use createActor() from Dassie's reactive library.
 *
 * @param reactor - Dassie reactor context (optional for testing)
 * @returns Cleanup function to stop the expiry task
 *
 * @example
 * ```typescript
 * // Start expiry task
 * const cleanup = SubscriptionExpiryActor();
 *
 * // Stop expiry task
 * cleanup();
 * ```
 */
export function SubscriptionExpiryActor(
  subscriptionManager?: SubscriptionManager,
  _reactor?: unknown
): () => void {
  debug('SubscriptionExpiryActor: started')

  // Use provided manager or create a singleton (for testing)
  const manager = subscriptionManager || new SubscriptionManager()

  // Run expiry check every 60 seconds
  const intervalId = setInterval(async () => {
    try {
      const now = Date.now()
      const allSubs = manager.getSubscriptions()

      debug('Checking %d subscriptions for expiry', allSubs.size)

      for (const [id, sub] of allSubs.entries()) {
        if (sub.active && sub.expiresAt <= now) {
          debug(
            'Subscription expired: %s (subscriber: %s, expired: %s)',
            id,
            sub.subscriber,
            new Date(sub.expiresAt).toISOString()
          )

          // Mark as inactive
          sub.active = false

          // Send CLOSED packet to subscriber (best-effort)
          try {
            await sendClosedPacket(
              sub.streamConnection,
              id,
              'Subscription expired'
            )
          } catch (error) {
            debug(
              'Failed to send CLOSED packet for expired subscription %s: %o',
              id,
              error
            )
            // Continue with cleanup even if CLOSED packet fails
          }

          // Remove from manager
          manager.removeSubscription(id)

          debug('Expired subscription removed: %s', id)
        }
      }
    } catch (error) {
      debug('Subscription expiry task error: %o', error)
      // Don't crash the expiry task on errors - log and continue
    }
  }, 60000) // 60 seconds

  // Return cleanup function
  return () => {
    debug('SubscriptionExpiryActor: stopping')
    clearInterval(intervalId)
  }
}
