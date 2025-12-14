import { SubscriptionManager } from '../subscription-manager.js'
import {
  StreamConnection,
  Subscription,
} from '../subscription-manager.js'
import {
  calculateSubscriptionCost,
  getSubscriptionPricingConfig,
  validateSubscriptionTTL,
} from '../subscription-pricing.js'
import { createLogger } from '../../factories/logger-factory'
import { getEventRepository } from '../storage/event-repository.js'
import {
  sendEosePacket,
  sendEventPacket,
  sendNoticePacket,
} from '../utils/packet-sender.js'

import type { BTPNIPsPacket, NostrReq } from '../types/index.js'

/**
 * REQ Handler
 * Handles Nostr REQ (subscription request) messages via BTP-NIPs protocol
 *
 * Flow:
 * 1. Receive REQ packet with subscription ID and filters
 * 2. Validate payment (TTL-based pricing)
 * 3. Query database for stored events matching filters
 * 4. Send EVENT packets for each stored event
 * 5. Send EOSE packet (end of stored events)
 * 6. Register subscription for future events
 * 7. Fulfill ILP packet
 *
 * Reference: docs/architecture/btp-nips-subscription-flow.md#REQ Handler
 */
const debug = createLogger('btp-nips:req-handler')

/**
 * ILP Packet interface (minimal definition for this handler)
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
 * Mock StreamConnection for development
 * TODO: Replace with actual Dassie StreamConnection interface
 */
function createStreamConnection(_ilpPacket: ILPPacket): StreamConnection {
  return {
    async sendPacket(data: Buffer): Promise<void> {
      debug('StreamConnection.sendPacket: %d bytes', data.length)
      // TODO: Send via actual ILP STREAM
    },
    async fulfillPacket(): Promise<void> {
      debug('StreamConnection.fulfillPacket: packet fulfilled')
      // TODO: Fulfill ILP packet
    },
    async rejectPacket(reason: string): Promise<void> {
      debug('StreamConnection.rejectPacket: %s', reason)
      // TODO: Reject ILP packet
    },
    async close(): Promise<void> {
      debug('StreamConnection.close')
      // TODO: Close stream
    },
  }
}

/**
 * Handle a REQ (subscription request) packet
 *
 * @param packet - Parsed BTP-NIPs packet with REQ message
 * @param ilpPacket - Raw ILP packet (for payment validation and fulfillment)
 * @param subscriptionManager - Subscription manager instance
 * @returns Promise that resolves when REQ is handled
 * @throws Never throws - errors are handled internally
 */
export async function handleReqPacket(
  packet: BTPNIPsPacket,
  ilpPacket: ILPPacket,
  subscriptionManager: SubscriptionManager
): Promise<void> {
  const streamConnection = createStreamConnection(ilpPacket)

  try {
    // 1. Extract REQ data from packet
    const nostrReq = packet.payload.nostr as NostrReq
    const { subscriptionId, filters } = nostrReq

    // Get TTL from metadata (default to 1 hour)
    const config = getSubscriptionPricingConfig()
    const ttl = packet.payload.metadata.ttl ?? config.default_ttl

    debug(
      'Handling REQ: subscription=%s, filters=%d, ttl=%ds',
      subscriptionId,
      filters.length,
      ttl
    )

    // 2. Validate subscription ID
    if (!subscriptionId || subscriptionId.length === 0) {
      await sendNoticePacket(
        streamConnection,
        'Invalid subscription ID: must be non-empty string'
      )
      await streamConnection.rejectPacket('Invalid subscription ID')
      return
    }

    if (subscriptionId.length > 64) {
      await sendNoticePacket(
        streamConnection,
        `Invalid subscription ID: max 64 characters (got ${subscriptionId.length})`
      )
      await streamConnection.rejectPacket('Subscription ID too long')
      return
    }

    // 3. Validate TTL
    const ttlValidation = validateSubscriptionTTL(ttl)
    if (!ttlValidation.isValid) {
      await sendNoticePacket(streamConnection, ttlValidation.error!)
      await streamConnection.rejectPacket(ttlValidation.error!)
      return
    }

    // 4. Calculate required payment
    const requiredAmount = calculateSubscriptionCost(ttl)
    const paidAmount = parseInt(packet.payload.payment.amount, 10)

    debug(
      'Payment validation: required=%d msats, paid=%d msats',
      requiredAmount,
      paidAmount
    )

    // 5. Validate payment
    if (paidAmount < requiredAmount) {
      const errorMsg = `Insufficient payment: required ${requiredAmount} msats, got ${paidAmount} msats`
      await sendNoticePacket(streamConnection, errorMsg)
      await streamConnection.rejectPacket(errorMsg)
      return
    }

    // 6. Query database for stored events
    const eventRepository = getEventRepository()
    const storedEvents = await eventRepository.queryEventsByFilters(filters)

    debug(
      'Found %d stored events for subscription %s',
      storedEvents.length,
      subscriptionId
    )

    // 7. Send EVENT packets for stored events
    for (const event of storedEvents) {
      await sendEventPacket(streamConnection, event, subscriptionId)
    }

    // 8. Send EOSE packet (end of stored events)
    await sendEosePacket(streamConnection, subscriptionId)

    // 9. Register subscription for future events
    const subscription: Subscription = {
      id: subscriptionId,
      subscriber: packet.payload.metadata.sender,
      streamConnection,
      filters,
      expiresAt: Date.now() + ttl * 1000, // Convert TTL to milliseconds
      active: true,
    }

    subscriptionManager.addSubscription(subscription)

    debug(
      'Subscription registered: id=%s, expires=%s',
      subscriptionId,
      new Date(subscription.expiresAt).toISOString()
    )

    // 10. Fulfill ILP packet (payment accepted)
    await streamConnection.fulfillPacket()

    debug('REQ handled successfully: subscription=%s', subscriptionId)
  } catch (error) {
    debug('REQ handler error: %o', error)

    // Send error notice to client
    const errorMsg =
      error instanceof Error ? error.message : 'Internal server error'
    await sendNoticePacket(streamConnection, `Error: ${errorMsg}`)

    // Reject ILP packet
    await streamConnection.rejectPacket(errorMsg)
  }
}

/**
 * Create REQ Handler Actor (for Dassie reactive integration)
 *
 * This is a placeholder for the actual Dassie actor implementation.
 * When integrated with Dassie, this will use createActor() from Dassie's reactive library.
 *
 * @param reactor - Dassie reactor context
 * @returns Actor cleanup function
 *
 * @example
 * ```typescript
 * // In Dassie integration:
 * export const ReqHandlerActor = (reactor: DassieReactor) => {
 *   return createActor(async (sig) => {
 *     const subscriptionManager = sig.inject(SubscriptionManager);
 *
 *     sig.on(BTPNIPsPacketTopic, async ({ packet, ilpPacket }) => {
 *       if (packet.header.messageType === NostrMessageType.REQ) {
 *         await handleReqPacket(packet, ilpPacket, subscriptionManager);
 *       }
 *     });
 *   });
 * };
 * ```
 */
export function ReqHandlerActor(_reactor?: unknown): () => void {
  debug('ReqHandlerActor: started (mock implementation)')

  // TODO: Replace with actual Dassie actor when integrating
  // const subscriptionManager = new SubscriptionManager();

  // sig.on(BTPNIPsPacketTopic, async ({ packet, ilpPacket }) => {
  //   if (packet.header.messageType === NostrMessageType.REQ) {
  //     await handleReqPacket(packet, ilpPacket, subscriptionManager);
  //   }
  // });

  // Return cleanup function
  return () => {
    debug('ReqHandlerActor: stopped')
  }
}
