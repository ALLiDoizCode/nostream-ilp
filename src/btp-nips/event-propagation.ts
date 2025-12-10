import { decrementTTL, shouldDrop } from './utils/ttl-manager.js'
import { createLogger } from '../factories/logger-factory.js'
import { EventDeduplicationCache } from './event-deduplication.js'
import { PeerEventTracker } from './peer-event-tracker.js'
import { RateLimiter } from './rate-limiter.js'
import { sendEventPacket } from './utils/packet-sender.js'

import type { SubscriptionManager } from './subscription-manager.js'
import type { NostrEvent } from './types/index.js'
import type { PacketMetadata } from './utils/ttl-manager.js'

/**
 * Event Propagation Service
 * Implements peer-to-peer event forwarding with loop prevention
 *
 * Features:
 * - Deduplication to prevent duplicate propagation
 * - TTL-based loop prevention (max 5 hops)
 * - Source peer filtering (don't send back to sender)
 * - Already-sent tracking (don't send to peer who has it)
 * - Rate limiting with payment-based capacity
 *
 * Reference: docs/prd/epic-6-peer-networking.md#Story 6.4
 */



const debug = createLogger('btp-nips:propagation')

/**
 * Event Propagation Service
 * Manages multi-hop event propagation through the BTP-NIPs network
 *
 * @example
 * ```typescript
 * const propagation = new EventPropagationService(
 *   subscriptionManager,
 *   new EventDeduplicationCache(),
 *   new PeerEventTracker(),
 *   new RateLimiter()
 * );
 *
 * // Propagate event to subscribers
 * await propagation.propagateEvent(event, metadata);
 * ```
 */
export class EventPropagationService {
  constructor(
    private subscriptionManager: SubscriptionManager,
    private deduplicationCache: EventDeduplicationCache,
    private peerTracker: PeerEventTracker,
    private rateLimiter: RateLimiter
  ) {}

  /**
   * Propagate event to matching subscriptions.
   *
   * Process:
   * 1. Check deduplication → Skip if already seen
   * 2. Decrement TTL → Drop if TTL=0
   * 3. Find matching subscriptions
   * 4. Filter source peer (don't send back)
   * 5. Filter already-sent peers
   * 6. Check rate limits
   * 7. Send event to each eligible subscriber
   *
   * @param event - Nostr event to propagate
   * @param metadata - Packet metadata with TTL and sender info
   * @param currentNodeAddress - ILP address of current node (for forwarding metadata)
   */
  async propagateEvent(
    event: NostrEvent,
    metadata: PacketMetadata,
    _currentNodeAddress?: string
  ): Promise<void> {
    // Step 1: Check deduplication
    if (this.deduplicationCache.hasSeenEvent(event.id)) {
      debug('Event %s already seen - skipping propagation', event.id.slice(0, 8))
      return
    }
    this.deduplicationCache.markAsSeen(event.id)

    // Step 2: Check TTL
    const newTTL = decrementTTL(metadata)
    if (shouldDrop(newTTL)) {
      debug('Event %s TTL expired (%d) - dropping', event.id.slice(0, 8), newTTL)
      return
    }

    // Step 3: Find matching subscriptions
    const subscriptions = this.subscriptionManager.findMatchingSubscriptions(event)

    if (subscriptions.length === 0) {
      debug('No matching subscriptions for event %s', event.id.slice(0, 8))
      return
    }

    debug('Found %d matching subscriptions for event %s (TTL: %d)', subscriptions.length, event.id.slice(0, 8), newTTL)

    // Step 4: Get source peer (don't send back)
    const sourcePeer = this.peerTracker.getSourcePeer(metadata)

    // Step 5: Send to each subscriber
    const results = {
      sent: 0,
      skipped: {
        source: 0,
        alreadySent: 0,
        rateLimited: 0,
      },
      failed: 0,
    }

    for (const sub of subscriptions) {
      // Skip source peer
      if (sourcePeer && sub.subscriber === sourcePeer) {
        debug('Skipping source peer %s for event %s', sourcePeer, event.id.slice(0, 8))
        results.skipped.source++
        continue
      }

      // Skip if already sent to this peer
      if (this.peerTracker.hasSent(sub.subscriber, event.id)) {
        debug('Event %s already sent to %s - skipping', event.id.slice(0, 8), sub.subscriber)
        results.skipped.alreadySent++
        continue
      }

      // Check rate limit
      if (!this.rateLimiter.tryConsume(sub.subscriber)) {
        debug('Rate limited for peer %s - queueing not yet implemented', sub.subscriber)
        results.skipped.rateLimited++
        // TODO: Queue event for later delivery
        continue
      }

      // Step 6: Send event
      try {
        await sendEventPacket(sub.streamConnection, event)

        // Mark as sent
        this.peerTracker.markEventSent(sub.subscriber, event.id)
        results.sent++

        debug('Event %s propagated to %s (TTL: %d)', event.id.slice(0, 8), sub.subscriber, newTTL)
      } catch (error) {
        debug('Failed to send event %s to peer %s: %o', event.id.slice(0, 8), sub.subscriber, error)
        results.failed++
      }
    }

    // Log summary
    debug(
      'Propagation complete for event %s: sent=%d, skipped=%d (source=%d, already=%d, limited=%d), failed=%d',
      event.id.slice(0, 8),
      results.sent,
      results.skipped.source + results.skipped.alreadySent + results.skipped.rateLimited,
      results.skipped.source,
      results.skipped.alreadySent,
      results.skipped.rateLimited,
      results.failed
    )
  }

  /**
   * Cleanup internal caches.
   * Should be called periodically (e.g., every hour).
   */
  cleanup(): void {
    this.deduplicationCache.cleanup()
    this.peerTracker.cleanup()
    debug('Cleanup complete')
  }

  /**
   * Get propagation statistics.
   * Useful for monitoring and debugging.
   */
  getStats() {
    return {
      dedupCacheSize: this.deduplicationCache.size(),
      peerCount: this.peerTracker.getPeerCount(),
      rateLimiterPeerCount: this.rateLimiter.getPeerCount(),
    }
  }
}
