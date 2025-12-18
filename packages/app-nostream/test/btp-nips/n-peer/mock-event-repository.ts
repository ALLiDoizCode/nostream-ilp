/**
 * Mock Event Repository for N-peer testing
 *
 * Provides in-memory storage for Nostr events without requiring PostgreSQL.
 * This allows tests to run without database dependencies.
 *
 * @module test/btp-nips/n-peer/mock-event-repository
 */

import type { NostrEvent, NostrFilter } from '../../../src/@types/nostr'

/**
 * In-memory mock implementation of EventRepository for testing
 *
 * Provides the same interface as the real EventRepository but stores
 * events in memory instead of PostgreSQL. Useful for:
 * - Unit tests that don't need persistence
 * - Integration tests without database setup
 * - Fast test execution
 */
export class MockEventRepository {
  private events: Map<string, NostrEvent> = new Map()
  private eventsByKind: Map<number, Set<string>> = new Map()
  private eventsByAuthor: Map<string, Set<string>> = new Map()

  /**
   * Save an event to in-memory storage
   */
  async saveEvent(event: NostrEvent): Promise<void> {
    // Check for expiration (NIP-40)
    const expirationTag = event.tags.find((tag) => tag[0] === 'expiration')
    if (expirationTag && expirationTag[1]) {
      const expiresAt = parseInt(expirationTag[1], 10)
      const currentTime = Math.floor(Date.now() / 1000)

      if (!isNaN(expiresAt) && expiresAt < currentTime) {
        throw new Error('Event is already expired (NIP-40)')
      }
    }

    // Store event (idempotent - overwrites if exists)
    this.events.set(event.id, event)

    // Index by kind
    if (!this.eventsByKind.has(event.kind)) {
      this.eventsByKind.set(event.kind, new Set())
    }
    this.eventsByKind.get(event.kind)!.add(event.id)

    // Index by author
    if (!this.eventsByAuthor.has(event.pubkey)) {
      this.eventsByAuthor.set(event.pubkey, new Set())
    }
    this.eventsByAuthor.get(event.pubkey)!.add(event.id)
  }

  /**
   * Retrieve an event by ID
   */
  async getEvent(id: string): Promise<NostrEvent | null> {
    return this.events.get(id) ?? null
  }

  /**
   * Query events by filter
   *
   * Simplified implementation - supports basic filtering:
   * - ids: exact ID match
   * - authors: exact pubkey match
   * - kinds: exact kind match
   * - since/until: timestamp filtering
   * - limit: result count limit
   */
  async queryEvents(filters: NostrFilter[]): Promise<NostrEvent[]> {
    const results: NostrEvent[] = []
    const seen = new Set<string>()

    for (const filter of filters) {
      let candidateIds: Set<string>

      // Start with all events or filter by available indexes
      if (filter.ids && filter.ids.length > 0) {
        // Filter by specific IDs
        candidateIds = new Set(filter.ids.filter((id) => this.events.has(id)))
      } else if (filter.authors && filter.authors.length > 0) {
        // Filter by authors
        candidateIds = new Set()
        for (const author of filter.authors) {
          const authorEvents = this.eventsByAuthor.get(author)
          if (authorEvents) {
            authorEvents.forEach((id) => candidateIds.add(id))
          }
        }
      } else if (filter.kinds && filter.kinds.length > 0) {
        // Filter by kinds
        candidateIds = new Set()
        for (const kind of filter.kinds) {
          const kindEvents = this.eventsByKind.get(kind)
          if (kindEvents) {
            kindEvents.forEach((id) => candidateIds.add(id))
          }
        }
      } else {
        // No specific filter - return all events
        candidateIds = new Set(this.events.keys())
      }

      // Apply additional filters
      for (const id of candidateIds) {
        const event = this.events.get(id)
        if (!event) continue

        // Skip if already seen (deduplication)
        if (seen.has(id)) continue

        // Apply kind filter
        if (filter.kinds && filter.kinds.length > 0 && !filter.kinds.includes(event.kind)) {
          continue
        }

        // Apply author filter
        if (filter.authors && filter.authors.length > 0 && !filter.authors.includes(event.pubkey)) {
          continue
        }

        // Apply timestamp filters
        if (filter.since && event.created_at < filter.since) {
          continue
        }

        if (filter.until && event.created_at > filter.until) {
          continue
        }

        // Event matches filter
        results.push(event)
        seen.add(id)
      }
    }

    // Sort by created_at descending (newest first)
    results.sort((a, b) => b.created_at - a.created_at)

    // Apply limit
    const limit = filters[0]?.limit ?? results.length
    return results.slice(0, limit)
  }

  /**
   * Delete an event by ID
   */
  async deleteEvent(id: string): Promise<void> {
    const event = this.events.get(id)
    if (!event) return

    // Remove from main storage
    this.events.delete(id)

    // Remove from indexes
    const kindSet = this.eventsByKind.get(event.kind)
    if (kindSet) {
      kindSet.delete(id)
      if (kindSet.size === 0) {
        this.eventsByKind.delete(event.kind)
      }
    }

    const authorSet = this.eventsByAuthor.get(event.pubkey)
    if (authorSet) {
      authorSet.delete(id)
      if (authorSet.size === 0) {
        this.eventsByAuthor.delete(event.pubkey)
      }
    }
  }

  /**
   * Get total event count
   */
  getEventCount(): number {
    return this.events.size
  }

  /**
   * Clear all events (useful for test cleanup)
   */
  clear(): void {
    this.events.clear()
    this.eventsByKind.clear()
    this.eventsByAuthor.clear()
  }
}
