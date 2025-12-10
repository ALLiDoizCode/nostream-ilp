import { createLogger } from '../../factories/logger-factory.js'
import { serializeBTPNIPsPacket } from '../parser.js'
import { type BTPNIPsPacket, NostrMessageType } from '../types/index.js'

import type { NostrEvent } from '../types/index.js'
import type { StreamConnection } from '../subscription-manager.js'

/**
 * Packet Sender Utility
 * Utilities for sending BTP-NIPs packets via ILP STREAM connections
 *
 * Supports:
 * - EVENT packets: Send Nostr events to subscribers
 * - EOSE packets: Signal end of stored events
 * - NOTICE/CLOSED packets: Send notifications to clients
 *
 * Reference: docs/architecture/btp-nips-subscription-flow.md
 */



const debug = createLogger('btp-nips:packet-sender')

/**
 * Send an EVENT packet to a subscriber via ILP STREAM
 *
 * Creates a BTP-NIPs EVENT packet with:
 * - messageType: EVENT (0x01)
 * - payment: { amount: '0' } (no payment required for server-to-client events)
 * - nostr: Full Nostr event
 *
 * @param stream - ILP STREAM connection to send packet through
 * @param event - Nostr event to send
 * @param subscriptionId - Subscription ID (for logging/debugging)
 * @returns Promise that resolves when packet is sent
 *
 * @example
 * ```typescript
 * await sendEventPacket(streamConnection, event, 'sub-123');
 * ```
 */
export async function sendEventPacket(
  stream: StreamConnection,
  event: NostrEvent,
  subscriptionId?: string
): Promise<void> {
  try {
    // Create BTP-NIPs packet with EVENT message
    const packet: BTPNIPsPacket = {
      header: {
        version: 1,
        messageType: NostrMessageType.EVENT,
        payloadLength: 0, // Will be calculated by serializer
      },
      payload: {
        payment: {
          amount: '0', // No payment required for server-to-client events
          currency: 'msat',
          purpose: 'event_delivery',
        },
        nostr: _event,
        metadata: {
          timestamp: Date.now(),
          sender: 'relay', // Relay is the sender
        },
      },
    }

    // Serialize packet
    const serialized = serializeBTPNIPsPacket(packet)

    // Send via ILP STREAM
    await stream.sendPacket(serialized)

    debug(
      'EVENT packet sent: event_id=%s, subscription=%s',
      event.id.slice(0, 8),
      subscriptionId
    )
  } catch (error) {
    // Log error but don't throw - best-effort delivery
    debug(
      'Failed to send EVENT packet (event: %s, subscription: %s): %o',
      event.id,
      subscriptionId,
      error
    )
    // Don't re-throw - subscription should continue even if one event fails
  }
}

/**
 * Send an EOSE (End of Stored Events) packet to a subscriber
 *
 * Signals that all stored events matching the subscription filters have been sent.
 * After EOSE, only new events will be forwarded to the subscriber.
 *
 * @param stream - ILP STREAM connection
 * @param subscriptionId - Subscription ID
 * @returns Promise that resolves when packet is sent
 *
 * @example
 * ```typescript
 * // After sending all stored events
 * await sendEosePacket(streamConnection, 'sub-123');
 * ```
 */
export async function sendEosePacket(
  stream: StreamConnection,
  subscriptionId: string
): Promise<void> {
  try {
    // Create BTP-NIPs packet with EOSE message
    const packet: BTPNIPsPacket = {
      header: {
        version: 1,
        messageType: NostrMessageType.EOSE,
        payloadLength: 0, // Will be calculated by serializer
      },
      payload: {
        payment: {
          amount: '0',
          currency: 'msat',
          purpose: 'eose_signal',
        },
        nostr: {
          subscriptionId,
        },
        metadata: {
          timestamp: Date.now(),
          sender: 'relay',
        },
      },
    }

    // Serialize and send
    const serialized = serializeBTPNIPsPacket(packet)
    await stream.sendPacket(serialized)

    debug('EOSE packet sent: subscription=%s', subscriptionId)
  } catch (error) {
    debug('Failed to send EOSE packet (subscription: %s): %o', subscriptionId, error)
    throw error // EOSE failure is more critical than individual EVENT failures
  }
}

/**
 * Send a CLOSED packet to notify client that subscription was closed
 *
 * Uses NOTICE message type with "CLOSED:" prefix to match Nostr convention.
 * BTP-NIPs doesn't have a dedicated CLOSED message type, so we use NOTICE.
 *
 * @param stream - ILP STREAM connection
 * @param subscriptionId - Subscription ID that was closed
 * @param reason - Optional reason for closure (e.g., "Subscription expired", "Payment stream ended")
 * @returns Promise that resolves when packet is sent
 *
 * @example
 * ```typescript
 * await sendClosedPacket(streamConnection, 'sub-123', 'Subscription expired');
 * ```
 */
export async function sendClosedPacket(
  stream: StreamConnection,
  subscriptionId: string,
  reason?: string
): Promise<void> {
  try {
    // Format message: "CLOSED: <subscriptionId> <reason>"
    const message = reason
      ? `CLOSED: ${subscriptionId} ${reason}`
      : `CLOSED: ${subscriptionId}`

    // Create BTP-NIPs packet with NOTICE message
    const packet: BTPNIPsPacket = {
      header: {
        version: 1,
        messageType: NostrMessageType.NOTICE,
        payloadLength: 0, // Will be calculated by serializer
      },
      payload: {
        payment: {
          amount: '0',
          currency: 'msat',
          purpose: 'closed_notification',
        },
        nostr: {
          message,
        },
        metadata: {
          timestamp: Date.now(),
          sender: 'relay',
        },
      },
    }

    // Serialize and send
    const serialized = serializeBTPNIPsPacket(packet)
    await stream.sendPacket(serialized)

    debug('CLOSED packet sent: subscription=%s, reason=%s', subscriptionId, reason)
  } catch (error) {
    // Log but don't throw - CLOSED is best-effort notification
    debug('Failed to send CLOSED packet (subscription: %s): %o', subscriptionId, error)
  }
}

/**
 * Send a NOTICE packet to notify client of errors or warnings
 *
 * General-purpose notification mechanism for relay-to-client messages.
 *
 * @param stream - ILP STREAM connection
 * @param message - Human-readable message
 * @returns Promise that resolves when packet is sent
 *
 * @example
 * ```typescript
 * await sendNoticePacket(streamConnection, 'Subscription not found');
 * ```
 */
export async function sendNoticePacket(
  stream: StreamConnection,
  message: string
): Promise<void> {
  try {
    const packet: BTPNIPsPacket = {
      header: {
        version: 1,
        messageType: NostrMessageType.NOTICE,
        payloadLength: 0,
      },
      payload: {
        payment: {
          amount: '0',
          currency: 'msat',
          purpose: 'notice',
        },
        nostr: {
          message,
        },
        metadata: {
          timestamp: Date.now(),
          sender: 'relay',
        },
      },
    }

    const serialized = serializeBTPNIPsPacket(packet)
    await stream.sendPacket(serialized)

    debug('NOTICE packet sent: message=%s', message)
  } catch (error) {
    debug('Failed to send NOTICE packet: %o', error)
  }
}

/**
 * Send a REQ (subscription request) packet to a peer via ILP STREAM
 *
 * Creates a BTP-NIPs REQ packet with:
 * - messageType: REQ (0x02)
 * - payment: { amount, currency, purpose }
 * - nostr: { subscriptionId, filters }
 * - metadata: { ttl }
 *
 * Used by peers to subscribe to another peer's events via P2P network.
 *
 * @param stream - ILP STREAM connection to send packet through
 * @param req - Nostr REQ message with subscription ID and filters
 * @param paymentAmountMsats - Payment amount in millisatoshis
 * @param ttl - Subscription time-to-live in milliseconds (default: 1 day)
 * @returns Promise that resolves when packet is sent
 *
 * @example
 * ```typescript
 * const req = {
 *   subscriptionId: 'sub-abc123',
 *   filters: [{ kinds: [1, 30023], authors: ['pubkey...'] }]
 * };
 * await sendReqPacket(streamConnection, req, '1000', 86400000);
 * ```
 */
export async function sendReqPacket(
  stream: StreamConnection,
  req: { subscriptionId: string; filters: unknown[] },
  paymentAmountMsats: string,
  ttl: number = 86400000 // Default: 1 day in milliseconds
): Promise<void> {
  try {
    // Create BTP-NIPs packet with REQ message
    const packet: BTPNIPsPacket = {
      header: {
        version: 1,
        messageType: NostrMessageType.REQ,
        payloadLength: 0, // Will be calculated by serializer
      },
      payload: {
        payment: {
          amount: paymentAmountMsats,
          currency: 'msat',
          purpose: 'subscription_request',
        },
        nostr: req,
        metadata: {
          timestamp: Date.now(),
          sender: 'client', // Client is the sender of REQ
          ttl,
        },
      },
    }

    // Serialize packet
    const serialized = serializeBTPNIPsPacket(packet)

    // Send via ILP STREAM
    await stream.sendPacket(serialized)

    debug(
      'REQ packet sent: subscription=%s, payment=%s msats, ttl=%d ms',
      req.subscriptionId,
      paymentAmountMsats,
      ttl
    )
  } catch (error) {
    debug('Failed to send REQ packet (subscription: %s): %o', req.subscriptionId, error)
    throw error // REQ failure should propagate - subscription cannot be created
  }
}
