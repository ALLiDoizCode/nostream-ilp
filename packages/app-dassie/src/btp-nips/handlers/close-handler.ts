import type { BtpNipsHandler, IlpContext } from '../handler-registry'
import type {
  BtpNipsClosePayload,
  BtpNipsPacket,
  BtpNipsResponse,
} from '../types'
import type { SubscriptionManager } from '../subscription-manager'

/**
 * Handler for CLOSE packets
 * Unregisters subscriptions when clients close them
 */
export class CloseHandler implements BtpNipsHandler {
  type = 'CLOSE' as const

  constructor(private readonly subscriptionManager: SubscriptionManager) {}

  async handle(
    packet: BtpNipsPacket,
    ilpContext: IlpContext,
  ): Promise<BtpNipsResponse> {
    const payload = packet.payload as BtpNipsClosePayload

    // Validate payload structure
    if (
      !payload.nostr ||
      typeof payload.nostr !== 'object' ||
      typeof payload.nostr.subId !== 'string'
    ) {
      return {
        type: 'NOTICE',
        message: 'invalid: CLOSE requires subId',
      }
    }

    const { subId } = payload.nostr

    // Validate subId
    if (!subId || subId.length === 0) {
      return {
        type: 'NOTICE',
        message: 'invalid: subId cannot be empty',
      }
    }

    // Attempt to unregister subscription
    const _removed = this.subscriptionManager.unregister(
      subId,
      ilpContext.sender,
    )

    // Note: We return EOSE even if subscription wasn't found
    // This follows the Nostr protocol pattern where CLOSE is idempotent
    // and doesn't error on non-existent subscriptions

    return {
      type: 'EOSE',
      subId,
    }
  }
}
