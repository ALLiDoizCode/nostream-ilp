import { DBEvent } from '../../@types/event'
import { IEventRepository } from '../../@types/repositories'
import { createLogger } from '../../factories/logger-factory'

const debug = createLogger('subscription-monitor')

export interface EventFeedFilters {
  authors?: string[]
  kinds?: number[]
  since?: number
  until?: number
  limit?: number
  offset?: number
}

export interface EventFeedResult {
  events: DBEvent[]
  total: number
  hasMore: boolean
}

/**
 * SubscriptionMonitor service for querying events from PostgreSQL
 * for the peer UI event feed.
 *
 * This service provides filtered and paginated access to events
 * received via BTP-NIPs subscriptions.
 */
export class SubscriptionMonitor {
  constructor(private readonly eventRepository: IEventRepository) {}

  /**
   * Query events with filters and pagination
   *
   * @param filters - Filter criteria (authors, kinds, date range)
   * @returns EventFeedResult with events, total count, and hasMore flag
   */
  async queryEvents(filters: EventFeedFilters): Promise<EventFeedResult> {
    const {
      authors,
      kinds,
      since,
      until,
      limit = 50,
      offset = 0,
    } = filters

    // Validate limit
    const validLimit = Math.min(Math.max(1, limit), 100)

    // Build subscription filter
    const subscriptionFilter: any = {}

    if (authors && authors.length > 0) {
      subscriptionFilter.authors = authors
    }

    if (kinds && kinds.length > 0) {
      subscriptionFilter.kinds = kinds
    }

    if (typeof since === 'number') {
      subscriptionFilter.since = since
    }

    if (typeof until === 'number') {
      subscriptionFilter.until = until
    }

    // Set limit + 1 to check if there are more results
    subscriptionFilter.limit = validLimit + 1

    debug('querying events with filters: %o', subscriptionFilter)

    try {
      // Query events from repository
      const query = this.eventRepository.findByFilters([subscriptionFilter])
      let events = await query

      // Apply offset manually (PostgreSQL OFFSET not used in findByFilters)
      if (offset > 0) {
        debug('applying offset: %d to %d events', offset, events.length)
        events = events.slice(offset)
      }

      // Log edge case: offset beyond available results
      if (offset > 0 && events.length === 0) {
        debug('WARNING: offset %d exceeds available results (no events returned)', offset)
      }

      // Check if there are more results
      const hasMore = events.length > validLimit

      // Trim to actual limit
      if (hasMore) {
        events = events.slice(0, validLimit)
      }

      // Calculate total (approximation, since we don't run COUNT query)
      // In production, consider caching this or running separate COUNT query
      const total = offset + events.length + (hasMore ? 1 : 0)

      debug('found %d events, hasMore: %s, total (approx): %d', events.length, hasMore, total)

      // Log when filters return zero results
      if (events.length === 0 && Object.keys(subscriptionFilter).length > 1) {
        debug('filters returned zero results: %o', subscriptionFilter)
      }

      return {
        events,
        total,
        hasMore,
      }
    } catch (error) {
      debug('error querying events: %o', error)
      throw new Error(`Failed to query events: ${(error as Error).message}`)
    }
  }

  /**
   * Query the most recent events for real-time updates
   *
   * @param since - Unix timestamp to query events after
   * @param limit - Maximum number of events to return
   * @returns Array of DBEvent
   */
  async queryRecentEvents(since: number, limit = 25): Promise<DBEvent[]> {
    const validLimit = Math.min(Math.max(1, limit), 100)

    const subscriptionFilter: any = {
      since,
      limit: validLimit,
    }

    debug('querying recent events since %d', since)

    try {
      const query = this.eventRepository.findByFilters([subscriptionFilter])
      const events = await query

      debug('found %d recent events', events.length)

      return events.slice(0, validLimit)
    } catch (error) {
      debug('error querying recent events: %o', error)
      throw new Error(`Failed to query recent events: ${(error as Error).message}`)
    }
  }
}
