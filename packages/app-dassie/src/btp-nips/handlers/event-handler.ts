import { verifyEventSignature } from '../parser'
import type { BtpNipsHandler, IlpContext } from '../handler-registry'
import type { BtpNipsPacket, BtpNipsResponse, NostrEvent } from '../types'
import type { EventRepository } from '../event-repository'

/**
 * Handler for EVENT packets
 * Verifies Nostr event signatures, stores events, and propagates to peers
 */
export class EventHandler implements BtpNipsHandler {
  type = 'EVENT' as const

  constructor(
    private readonly eventRepository: EventRepository,
    private readonly skipSignatureVerification = false,
  ) {}

  async handle(
    packet: BtpNipsPacket,
    ilpContext: IlpContext,
  ): Promise<BtpNipsResponse> {
    // Extract event from packet
    const event = packet.payload.nostr as NostrEvent

    // Verify event signature (skip in test mode)
    if (!this.skipSignatureVerification) {
      const isValidSignature = verifyEventSignature(event)
      if (!isValidSignature) {
        return {
          type: 'OK',
          eventId: event.id,
          accepted: false,
          message: 'invalid: signature verification failed',
        }
      }
    }

    // Check if event already exists
    const exists = this.eventRepository.exists(event.id)
    if (exists) {
      return {
        type: 'OK',
        eventId: event.id,
        accepted: false,
        message: 'duplicate: event already exists',
      }
    }

    // Store event
    try {
      const stored = this.eventRepository.store(event, ilpContext.sender)
      if (!stored) {
        return {
          type: 'OK',
          eventId: event.id,
          accepted: false,
          message: 'duplicate: event already exists',
        }
      }
    } catch (error) {
      return {
        type: 'OK',
        eventId: event.id,
        accepted: false,
        message: `error: ${error instanceof Error ? error.message : 'unknown error'}`,
      }
    }

    // TODO: Propagate event to subscribed peers (Epic 11)
    // This will be implemented when we add subscription management and peer propagation

    return {
      type: 'OK',
      eventId: event.id,
      accepted: true,
      message: '',
    }
  }
}
