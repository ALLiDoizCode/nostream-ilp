import { SubscriptionManager } from '../subscription-manager.js'
import { createLogger } from '../../factories/logger-factory'
import { sendClosedPacket, sendNoticePacket } from '../utils/packet-sender.js'

import type { BTPNIPsPacket, NostrClose } from '../types/index.js'
import type { StreamConnection } from '../subscription-manager.js'

/**
 * CLOSE Handler
 * Handles Nostr CLOSE (unsubscribe) messages via BTP-NIPs protocol
 *
 * Flow:
 * 1. Receive CLOSE packet with subscription ID
 * 2. Check if subscription exists
 * 3. Remove subscription from manager
 * 4. Send CLOSED confirmation packet
 * 5. Fulfill ILP packet (no payment required for CLOSE)
 *
 * Reference: docs/architecture/btp-nips-subscription-flow.md#CLOSE Handler
 */

const debug = createLogger('btp-nips:close-handler')

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
 * Handle a CLOSE (unsubscribe) packet
 *
 * @param packet - Parsed BTP-NIPs packet with CLOSE message
 * @param ilpPacket - Raw ILP packet (for fulfillment)
 * @param subscriptionManager - Subscription manager instance
 * @returns Promise that resolves when CLOSE is handled
 * @throws Never throws - errors are handled internally
 */
export async function handleClosePacket(
  packet: BTPNIPsPacket,
  ilpPacket: ILPPacket,
  subscriptionManager: SubscriptionManager
): Promise<void> {
  const streamConnection = createStreamConnection(ilpPacket)

  try {
    // 1. Extract CLOSE data from packet
    const nostrClose = packet.payload.nostr as NostrClose
    const { subscriptionId } = nostrClose

    debug('Handling CLOSE: subscription=%s', subscriptionId)

    // 2. Validate subscription ID
    if (!subscriptionId || subscriptionId.length === 0) {
      await sendNoticePacket(
        streamConnection,
        'Invalid subscription ID: must be non-empty string'
      )
      await streamConnection.fulfillPacket() // Fulfill anyway (no payment required)
      return
    }

    // 3. Check if subscription exists
    const subscription = subscriptionManager.getSubscription(subscriptionId)

    if (!subscription) {
      debug('Subscription not found: %s', subscriptionId)

      // Send NOTICE about non-existent subscription
      await sendNoticePacket(
        streamConnection,
        `Subscription not found: ${subscriptionId}`
      )

      // Send CLOSED packet anyway (best-effort)
      await sendClosedPacket(streamConnection, subscriptionId, 'Not found')

      // Fulfill ILP packet (CLOSE is best-effort, no retries needed)
      await streamConnection.fulfillPacket()
      return
    }

    // 4. Remove subscription from manager
    const removed = subscriptionManager.removeSubscription(subscriptionId)

    if (removed) {
      debug('Subscription removed: %s', subscriptionId)
    } else {
      debug('Failed to remove subscription: %s', subscriptionId)
    }

    // 5. Send CLOSED confirmation packet
    await sendClosedPacket(
      streamConnection,
      subscriptionId,
      'Closed by client'
    )

    // 6. Fulfill ILP packet (no payment required for CLOSE)
    await streamConnection.fulfillPacket()

    debug('CLOSE handled successfully: subscription=%s', subscriptionId)
  } catch (error) {
    debug('CLOSE handler error: %o', error)

    // Send error notice to client
    const errorMsg =
      error instanceof Error ? error.message : 'Internal server error'
    await sendNoticePacket(streamConnection, `Error: ${errorMsg}`)

    // Fulfill anyway - CLOSE is best-effort, don't fail on errors
    await streamConnection.fulfillPacket()
  }
}

/**
 * Create CLOSE Handler Actor (for Dassie reactive integration)
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
 * export const CloseHandlerActor = (reactor: DassieReactor) => {
 *   return createActor(async (sig) => {
 *     const subscriptionManager = sig.inject(SubscriptionManager);
 *
 *     sig.on(BTPNIPsPacketTopic, async ({ packet, ilpPacket }) => {
 *       if (packet.header.messageType === NostrMessageType.CLOSE) {
 *         await handleClosePacket(packet, ilpPacket, subscriptionManager);
 *       }
 *     });
 *   });
 * };
 * ```
 */
export function CloseHandlerActor(_reactor?: unknown): () => void {
  debug('CloseHandlerActor: started (mock implementation)')

  // TODO: Replace with actual Dassie actor when integrating
  // const subscriptionManager = new SubscriptionManager();

  // sig.on(BTPNIPsPacketTopic, async ({ packet, ilpPacket }) => {
  //   if (packet.header.messageType === NostrMessageType.CLOSE) {
  //     await handleClosePacket(packet, ilpPacket, subscriptionManager);
  //   }
  // });

  // Return cleanup function
  return () => {
    debug('CloseHandlerActor: stopped')
  }
}
