import { createLogger } from '../../factories/logger-factory'
import { verifyNostrSignature } from '../crypto'
import {
  DuplicateEventError,
  InsufficientPaymentError,
  InvalidSignatureError,
} from '../errors'
import { EventDeduplicationCache } from '../event-deduplication.js'
import { EventPropagationService } from '../event-propagation.js'
import { PeerEventTracker } from '../peer-event-tracker.js'
import { getEventCost, validatePaymentAmount } from '../pricing'
import { RateLimiter } from '../rate-limiter.js'
import { getEventCache } from '../storage/event-cache'
import { getEventRepository } from '../storage/event-repository'
import { SubscriptionManager } from '../subscription-manager.js'
import { NostrMessageType } from '../types'
import { retryWithBackoff } from '../utils/retry'
import { sendEventPacket } from '../utils/packet-sender.js'

import type { BTPNIPsPacket, NostrEvent, PaymentMetadata } from '../types'

/**
 * BTP-NIPs EVENT Message Handler
 *
 * Handles incoming EVENT messages received via ILP packets.
 * Validates payment, verifies Nostr signatures, and stores events in PostgreSQL.
 *
 * @module btp-nips/handlers/event-handler
 * @see Story 5.2 - BTP-NIPs EVENT Message Handler
 */

const debug = createLogger('btp-nips:event-handler')

/**
 * Module-level SubscriptionManager singleton
 * Shared across all event handler invocations
 */
const subscriptionManager = new SubscriptionManager()

/**
 * Module-level EventPropagationService singleton
 * Handles multi-hop event propagation with deduplication and rate limiting
 */
const eventPropagation = new EventPropagationService(
  subscriptionManager,
  new EventDeduplicationCache(),
  new PeerEventTracker(),
  new RateLimiter()
)

/**
 * Get the shared SubscriptionManager instance
 * Used by REQ/CLOSE handlers to manage subscriptions
 *
 * @returns SubscriptionManager singleton
 */
export function getSubscriptionManager(): SubscriptionManager {
  return subscriptionManager
}

/**
 * Get the shared EventPropagationService instance
 * Used for triggering propagation from external modules
 *
 * @returns EventPropagationService singleton
 */
export function getEventPropagationService(): EventPropagationService {
  return eventPropagation
}

/**
 * ILP Packet interface (minimal, for type safety)
 *
 * This represents the ILP packet structure from Dassie.
 * For now, we use a minimal interface.
 * TODO: Import from Dassie types when available
 */
export interface ILPPacket {
  /** Packet data (contains BTP-NIPs packet) */
  data: Buffer
  /** Destination ILP address */
  destination: string
  /** Amount being transferred */
  amount: string
}

/**
 * Result of handling an EVENT packet
 */
export interface EventHandlerResult {
  /** Whether the event was successfully stored */
  success: boolean
  /** Event ID */
  eventId: string
  /** Whether this was a duplicate event */
  duplicate: boolean
  /** Error message if failed */
  error?: string
  /** Whether to fulfill the ILP packet */
  fulfillPacket: boolean
  /** Whether to reject the ILP packet */
  rejectPacket: boolean
  /** Rejection reason (if rejecting) */
  rejectionReason?: string
}

/**
 * Handle an incoming EVENT packet.
 *
 * Processing steps:
 * 1. Validate payment amount
 * 2. Check for duplicate events
 * 3. Verify Nostr signature
 * 4. Save event to database and cache
 * 5. Return result indicating whether to fulfill/reject ILP packet
 *
 * Decision matrix:
 * - Insufficient payment → Reject ILP packet
 * - Invalid signature → Fulfill ILP packet (accept payment), don't store event
 * - Duplicate event → Fulfill ILP packet, return early (idempotent)
 * - Valid event → Fulfill ILP packet, store event
 *
 * @param packet - Parsed BTP-NIPs packet
 * @param ilpPacket - Raw ILP packet (for fulfillment/rejection)
 * @returns Handler result with fulfillment decision
 *
 * @example
 * ```typescript
 * const result = await handleEventPacket(btpPacket, ilpPacket);
 * if (result.rejectPacket) {
 *   await rejectILPPacket(ilpPacket, result.rejectionReason);
 * } else if (result.fulfillPacket) {
 *   await fulfillILPPacket(ilpPacket);
 * }
 * ```
 */
export async function handleEventPacket(
  packet: BTPNIPsPacket,
  _ilpPacket: ILPPacket,
): Promise<EventHandlerResult> {
  // Extract event and payment from packet
  const _event = packet.payload.nostr as NostrEvent
  const payment = packet.payload.payment

  debug(
    'Handling EVENT packet: event_id=%s, kind=%d, pubkey=%s, payment=%s %s',
    event.id,
    event.kind,
    event.pubkey.substring(0, 8),
    payment.amount,
    payment.currency,
  )

  try {
    // Step 1: Validate payment amount
    const requiredAmount = getEventCost(event)
    const paidAmount = parseInt(payment.amount, 10)

    const paymentValidation = validatePaymentAmount(paidAmount, requiredAmount)
    if (!paymentValidation.valid) {
      debug(
        'Insufficient payment for event %s: required %d, paid %d',
        event.id,
        requiredAmount,
        paidAmount,
      )

      throw new InsufficientPaymentError(requiredAmount, paidAmount, event.id)
    }

    debug('Payment validation passed: %d msats', paidAmount)

    // Step 2: Check for duplicates (fast path)
    const repository = getEventRepository()
    const exists = await repository.eventExists(event.id)

    if (exists) {
      debug('Duplicate event %s, fulfilling packet and returning', event.id)

      return {
        success: true,
        eventId: event.id,
        duplicate: true,
        fulfillPacket: true,
        rejectPacket: false,
      }
    }

    // Step 3: Verify Nostr signature
    const signatureValid = await verifyNostrSignature(event)

    if (!signatureValid) {
      debug(
        'Invalid signature for event %s from pubkey %s',
        event.id,
        event.pubkey.substring(0, 8),
      )

      // Accept payment but don't store event (prevent free DoS attacks)
      throw new InvalidSignatureError(event.id, event.pubkey, 'Signature verification failed')
    }

    debug('Signature verification passed for event %s', event.id)

    // Step 4: Save event to database and cache (with retry)
    await retryWithBackoff(
      async () => {
        // Save to PostgreSQL
        await repository.saveEvent(event)

        // Cache in Redis (best effort - don't fail if Redis is down)
        const cache = getEventCache()
        await cache.cacheEvent(event).catch((_error) => {
          debug('Failed to cache event %s (non-fatal): %o', event.id, error)
        })
      },
      { maxAttempts: 3, initialDelayMs: 100 },
    )

    debug('Event %s stored successfully (kind %d)', event.id, event.kind)

    // Step 5: Propagate event to matching subscriptions (Story 6.4)
    try {
      await eventPropagation.propagateEvent(event, packet.payload.metadata)
    } catch (error) {
      // Best-effort propagation: log error but don't fail entire handler
      debug('Failed to propagate event %s: %o', event.id, error)
    }

    return {
      success: true,
      eventId: event.id,
      duplicate: false,
      fulfillPacket: true,
      rejectPacket: false,
    }
  } catch (error) {
    // Handle specific error types
    if (error instanceof InsufficientPaymentError) {
      // Reject ILP packet - sender should retry with higher payment
      return {
        success: false,
        eventId: event.id,
        duplicate: false,
        error: error.message,
        fulfillPacket: false,
        rejectPacket: true,
        rejectionReason: error.message,
      }
    }

    if (error instanceof InvalidSignatureError) {
      // Fulfill ILP packet (accept payment) but don't store event
      // This prevents free DoS attacks (invalid events consume payment)
      return {
        success: false,
        eventId: event.id,
        duplicate: false,
        error: error.message,
        fulfillPacket: true, // Accept payment
        rejectPacket: false,
      }
    }

    if (error instanceof DuplicateEventError) {
      // Fulfill ILP packet (idempotent)
      return {
        success: true,
        eventId: event.id,
        duplicate: true,
        fulfillPacket: true,
        rejectPacket: false,
      }
    }

    // Unknown error - reject packet for safety
    debug('Unexpected error handling event %s: %o', event.id, error)

    return {
      success: false,
      eventId: event.id,
      duplicate: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      fulfillPacket: false,
      rejectPacket: true,
      rejectionReason: 'Internal server error',
    }
  }
}

/**
 * Extract payment metadata from BTP-NIPs packet.
 *
 * @param packet - BTP-NIPs packet
 * @returns Payment metadata
 */
export function extractPaymentMetadata(packet: BTPNIPsPacket): PaymentMetadata {
  return packet.payload.payment
}

/**
 * Validate that a packet contains an EVENT message.
 *
 * @param packet - BTP-NIPs packet
 * @returns true if packet is an EVENT message
 */
export function isEventMessage(packet: BTPNIPsPacket): boolean {
  return packet.header.messageType === NostrMessageType.EVENT
}

/**
 * Get event statistics (for monitoring/debugging).
 *
 * @returns Promise resolving to event statistics
 */
export async function getEventStats(): Promise<{
  totalEvents: number
  cacheHitRate: number
}> {
  // const repository = getEventRepository()
  const cache = getEventCache()

  // For now, return placeholder stats
  // TODO: Implement proper stats tracking (use repository for count)
  return {
    totalEvents: 0,
    cacheHitRate: cache.isConnected() ? 0.75 : 0,
  }
}

/**
 * EventHandlerActor - Reactive actor for processing EVENT messages.
 *
 * This actor subscribes to the BTPNIPsPacketTopic and handles EVENT messages.
 * It filters for EVENT message types and delegates to handleEventPacket.
 *
 * In a real Dassie integration, this would be:
 *
 * ```typescript
 * export const EventHandlerActor = (reactor: DassieReactor) => {
 *   return createActor(async (sig) => {
 *     sig.on(BTPNIPsPacketTopic, async ({ packet, ilpPacket }) => {
 *       if (packet.header.messageType !== NostrMessageType.EVENT) {
 *         return;
 *       }
 *
 *       try {
 *         const result = await handleEventPacket(packet, ilpPacket);
 *
 *         if (result.rejectPacket) {
 *           await rejectILPPacket(ilpPacket, result.rejectionReason);
 *         } else if (result.fulfillPacket) {
 *           await fulfillILPPacket(ilpPacket);
 *         }
 *       } catch (error) {
 *         logger.error({ error, eventId: packet.payload.nostr.id }, 'Failed to handle EVENT packet');
 *       }
 *     });
 *   });
 * };
 * ```
 *
 * For now, we export a factory function that can be called manually or
 * integrated with Dassie when available.
 *
 * @returns Promise that resolves when actor is initialized
 *
 * @example
 * ```typescript
 * // Start the EVENT handler actor
 * await EventHandlerActor();
 *
 * // Actor will now process all EVENT messages from BTPNIPsPacketTopic
 * ```
 */
export async function EventHandlerActor(): Promise<void> {
  debug('EventHandlerActor initialized')

  // Import ILP integration functions
  const { BTPNIPsPacketTopic, fulfillILPPacket, rejectILPPacket } = await import(
    '../ilp-integration'
  )

  // Subscribe to BTP-NIPs packet topic
  BTPNIPsPacketTopic.subscribe(async ({ packet, ilpPacket }) => {
    // Filter for EVENT message type
    if (packet.header.messageType !== NostrMessageType.EVENT) {
      return
    }

    debug('EventHandlerActor received EVENT packet: %s', packet.payload.nostr)

    try {
      // Handle EVENT packet
      const result = await handleEventPacket(packet, ilpPacket)

      // Fulfill or reject ILP packet based on result
      if (result.rejectPacket && result.rejectionReason) {
        debug('Rejecting ILP packet: %s', result.rejectionReason)
        await rejectILPPacket(ilpPacket, result.rejectionReason)
      } else if (result.fulfillPacket) {
        debug('Fulfilling ILP packet for event: %s', result.eventId)
        await fulfillILPPacket(ilpPacket)
      }
    } catch (error) {
      debug('Unexpected error in EventHandlerActor: %o', error)

      // Reject packet on unexpected errors
      await rejectILPPacket(ilpPacket, 'Internal server error')
    }
  })

  debug('EventHandlerActor subscribed to BTPNIPsPacketTopic')
}
