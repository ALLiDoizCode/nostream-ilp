import { createLogger } from '../factories/logger-factory'
import { parseBTPNIPsPacket } from './parser'

import type { BTPNIPsPacket } from './types'
import type { ILPPacket } from './handlers/event-handler'

/**
 * BTP-NIPs ILP Integration Layer
 *
 * Integrates BTP-NIPs packet processing with Dassie's ILP infrastructure.
 * Provides reactive topics and actors for processing incoming ILP packets
 * that contain BTP-NIPs protocol data.
 *
 * @module btp-nips/ilp-integration
 * @see Story 5.2 - AC2, Task 7
 */

const debug = createLogger('btp-nips:ilp-integration')

/**
 * Topic for BTP-NIPs packets that have been parsed from ILP packets.
 *
 * Actors can subscribe to this topic to handle specific message types.
 * Each emission contains the parsed BTP-NIPs packet and the raw ILP packet.
 *
 * @example
 * ```typescript
 * // Subscribe to BTP-NIPs packets
 * sig.on(BTPNIPsPacketTopic, async ({ packet, ilpPacket }) => {
 *   if (packet.header.messageType === NostrMessageType.EVENT) {
 *     await handleEventPacket(packet, ilpPacket);
 *   }
 * });
 * ```
 */
export interface BTPNIPsPacketTopicData {
  /** Parsed BTP-NIPs packet */
  packet: BTPNIPsPacket
  /** Raw ILP packet (for fulfillment/rejection) */
  ilpPacket: ILPPacket
}

/**
 * Reactive topic for BTP-NIPs packets.
 *
 * In a real Dassie integration, this would be created with:
 * `export const BTPNIPsPacketTopic = createTopic<BTPNIPsPacketTopicData>()`
 *
 * For now, we provide a minimal implementation that can be replaced
 * when integrating with Dassie's reactive system.
 */
export const BTPNIPsPacketTopic = {
  /**
   * Emit a BTP-NIPs packet to all subscribers
   */
  emit(data: BTPNIPsPacketTopicData): void {
    debug(
      'BTPNIPsPacketTopic.emit: messageType=%s, eventId=%s',
      data.packet.header.messageType,
      'nostr' in data.packet.payload && 'id' in data.packet.payload.nostr
        ? data.packet.payload.nostr.id
        : 'N/A',
    )

    // In real Dassie integration, this would notify all subscribers
    // For now, we just log it
    // TODO: Replace with Dassie's createTopic when integrating
  },

  /**
   * Subscribe to BTP-NIPs packets
   *
   * @param handler - Callback invoked for each packet
   * @returns Unsubscribe function
   */
  subscribe(_handler: (data: BTPNIPsPacketTopicData) => void | Promise<void>): () => void {
    debug('BTPNIPsPacketTopic.subscribe: handler registered')

    // In real Dassie integration, this would register the handler
    // For now, we return a no-op unsubscribe function
    // TODO: Replace with Dassie's createTopic when integrating
    return () => {
      debug('BTPNIPsPacketTopic: handler unsubscribed')
    }
  },
}

/**
 * Checks if an ILP packet contains BTP-NIPs data.
 *
 * BTP-NIPs packets must:
 * - Have data field with at least 4 bytes
 * - Start with version byte 0x01
 *
 * @param ilpPacket - ILP packet to check
 * @returns true if packet contains BTP-NIPs data
 */
export function isBTPNIPsPacket(ilpPacket: ILPPacket): boolean {
  if (!ilpPacket.data || ilpPacket.data.length < 4) {
    return false
  }

  // Check version byte (first byte must be 0x01)
  return ilpPacket.data[0] === 1
}

/**
 * Process incoming ILP packets and extract BTP-NIPs data.
 *
 * This function:
 * 1. Checks if ILP packet contains BTP-NIPs data
 * 2. Parses BTP-NIPs packet
 * 3. Emits to BTPNIPsPacketTopic
 * 4. Returns parsing result
 *
 * @param ilpPacket - Raw ILP packet
 * @returns Parsed BTP-NIPs packet, or null if not a BTP-NIPs packet
 *
 * @example
 * ```typescript
 * const ilpPacket = await receiveILPPacket();
 * const _btpPacket = await processBTPNIPsPacket(ilpPacket);
 *
 * if (btpPacket) {
 *   debug('Received BTP-NIPs packet: %s', btpPacket.header.messageType);
 * }
 * ```
 */
export async function processBTPNIPsPacket(
  ilpPacket: ILPPacket,
): Promise<BTPNIPsPacket | null> {
  // Check if packet contains BTP-NIPs data
  if (!isBTPNIPsPacket(ilpPacket)) {
    return null
  }

  try {
    // Parse BTP-NIPs packet
    const packet = parseBTPNIPsPacket(ilpPacket.data)

    debug(
      'Parsed BTP-NIPs packet: version=%d, messageType=%d, payloadLength=%d',
      packet.header.version,
      packet.header.messageType,
      packet.header.payloadLength,
    )

    // Emit to topic for subscribers
    BTPNIPsPacketTopic.emit({ packet, ilpPacket })

    return packet
  } catch (error) {
    debug('Failed to parse BTP-NIPs packet: %o', error)

    // Don't emit invalid packets
    return null
  }
}

/**
 * ProcessBTPNIPsPackets actor
 *
 * This actor subscribes to the ILP packet stream and processes BTP-NIPs packets.
 * It filters ILP packets by checking for BTP-NIPs version header, parses them,
 * and emits to BTPNIPsPacketTopic.
 *
 * In a real Dassie integration, this would be:
 *
 * ```typescript
 * export const ProcessBTPNIPsPackets = (reactor: DassieReactor) => {
 *   return createActor(async (sig) => {
 *     // Subscribe to ILP packet stream from Dassie core
 *     const ilpPackets = await sig.run(ILPPacketStream);
 *
 *     for await (const ilpPacket of ilpPackets) {
 *       await processBTPNIPsPacket(ilpPacket);
 *     }
 *   });
 * };
 * ```
 *
 * For now, we export a factory function that can be called manually or
 * integrated with Dassie when available.
 *
 * @param onPacket - Callback for each BTP-NIPs packet (for testing)
 * @returns Processing function
 *
 * @example
 * ```typescript
 * // Start processing ILP packets
 * const processor = ProcessBTPNIPsPackets();
 *
 * // Process individual packet
 * const ilpPacket = await receiveILPPacket();
 * await processor(ilpPacket);
 * ```
 */
export function ProcessBTPNIPsPackets(
  onPacket?: (data: BTPNIPsPacketTopicData) => void | Promise<void>,
): (ilpPacket: ILPPacket) => Promise<BTPNIPsPacket | null> {
  debug('ProcessBTPNIPsPackets actor created')

  // Subscribe to topic if callback provided
  if (onPacket) {
    BTPNIPsPacketTopic.subscribe(onPacket)
  }

  // Return processing function
  return async (ilpPacket: ILPPacket) => {
    return await processBTPNIPsPacket(ilpPacket)
  }
}

/**
 * Fulfill an ILP packet.
 *
 * In a real Dassie integration, this would call Dassie's packet fulfillment API.
 * For now, this is a stub that logs the fulfillment.
 *
 * @param ilpPacket - ILP packet to fulfill
 * @returns Promise that resolves when packet is fulfilled
 *
 * @example
 * ```typescript
 * // After successfully processing event
 * await fulfillILPPacket(ilpPacket);
 * ```
 */
export async function fulfillILPPacket(ilpPacket: ILPPacket): Promise<void> {
  debug(
    'Fulfilling ILP packet: destination=%s, amount=%s',
    ilpPacket.destination,
    ilpPacket.amount,
  )

  // TODO: Implement actual ILP packet fulfillment when integrating with Dassie
  // For now, we just log it
}

/**
 * Reject an ILP packet.
 *
 * In a real Dassie integration, this would call Dassie's packet rejection API.
 * For now, this is a stub that logs the rejection.
 *
 * @param ilpPacket - ILP packet to reject
 * @param reason - Rejection reason
 * @returns Promise that resolves when packet is rejected
 *
 * @example
 * ```typescript
 * // If payment is insufficient
 * await rejectILPPacket(ilpPacket, 'Insufficient payment');
 * ```
 */
export async function rejectILPPacket(ilpPacket: ILPPacket, reason: string): Promise<void> {
  debug(
    'Rejecting ILP packet: destination=%s, amount=%s, reason=%s',
    ilpPacket.destination,
    ilpPacket.amount,
    reason,
  )

  // TODO: Implement actual ILP packet rejection when integrating with Dassie
  // For now, we just log it
}
