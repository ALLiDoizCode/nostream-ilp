import type { BtpNipsHandler, IlpContext } from '../handler-registry'
import type {
  BtpNipsPacket,
  BtpNipsReqPayload,
  BtpNipsResponse,
  NostrFilter,
} from '../types'
import type { EventRepository } from '../event-repository'
import type { SubscriptionManager } from '../subscription-manager'

/**
 * Handler for REQ packets
 * Parses filters, registers subscriptions, queries events, and sends results
 */
export class ReqHandler implements BtpNipsHandler {
  type = 'REQ' as const

  constructor(
    private readonly eventRepository: EventRepository,
    private readonly subscriptionManager: SubscriptionManager,
    private readonly subIdGenerator: () => string = () =>
      `sub_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  ) {}

  async handle(
    packet: BtpNipsPacket,
    ilpContext: IlpContext,
  ): Promise<BtpNipsResponse> {
    const payload = packet.payload as BtpNipsReqPayload

    // Validate filters
    if (
      !Array.isArray(payload.nostr) ||
      payload.nostr.length === 0
    ) {
      return {
        type: 'NOTICE',
        message: 'invalid: REQ requires at least one filter',
      }
    }

    const filters = payload.nostr as NostrFilter[]

    // Validate each filter
    for (const filter of filters) {
      const validation = this.validateFilter(filter)
      if (!validation.valid) {
        return {
          type: 'NOTICE',
          message: `invalid: ${validation.error}`,
        }
      }
    }

    // Generate subscription ID
    const subId = this.subIdGenerator()

    // Register subscription
    this.subscriptionManager.register(subId, ilpContext.sender, filters)

    // Query matching events from repository
    const _matchingEvents = this.queryEventsForFilters(filters)

    // For now, we'll return EOSE immediately
    // In a real implementation, we would send matching events first, then EOSE
    // That would require async event sending via ILP which is deferred to Epic 11

    // Note: In production, matching events would be sent via separate ILP packets
    // before returning EOSE. For this story, we simplify by returning EOSE immediately.
    // Actual event propagation will be implemented in Epic 11 (N-Peer Event Propagation)

    return {
      type: 'EOSE',
      subId,
    }
  }

  /**
   * Validate a Nostr filter
   * @param filter - Filter to validate
   * @returns Validation result
   */
  private validateFilter(filter: NostrFilter): {
    valid: boolean
    error?: string
  } {
    // Check limit is reasonable
    if (filter.limit !== undefined) {
      if (typeof filter.limit !== 'number' || filter.limit < 0) {
        return { valid: false, error: 'limit must be a non-negative number' }
      }
      if (filter.limit > 5000) {
        return { valid: false, error: 'limit too large (max 5000)' }
      }
    }

    // Check since/until are valid timestamps
    if (filter.since !== undefined) {
      if (typeof filter.since !== 'number' || filter.since < 0) {
        return { valid: false, error: 'since must be a non-negative number' }
      }
    }

    if (filter.until !== undefined) {
      if (typeof filter.until !== 'number' || filter.until < 0) {
        return { valid: false, error: 'until must be a non-negative number' }
      }
    }

    // Check since <= until
    if (
      filter.since !== undefined &&
      filter.until !== undefined &&
      filter.since > filter.until
    ) {
      return { valid: false, error: 'since must be <= until' }
    }

    return { valid: true }
  }

  /**
   * Query events matching any of the filters
   * @param filters - Array of Nostr filters
   * @returns Array of matching events (deduplicated)
   */
  private queryEventsForFilters(filters: NostrFilter[]) {
    const eventMap = new Map<string, unknown>()

    for (const filter of filters) {
      const events = this.eventRepository.query(filter)
      for (const event of events) {
        eventMap.set(event.id, event)
      }
    }

    return Array.from(eventMap.values())
  }
}
