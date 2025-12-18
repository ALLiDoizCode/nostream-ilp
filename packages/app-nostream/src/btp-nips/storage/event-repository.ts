import { getMasterDbClient, getReadReplicaDbClient } from '../../database/client'
import { EventCache, getEventCache } from './event-cache'
import { getQueryMonitor, QueryMonitor } from './query-monitor'
import { createLogger } from '../../factories/logger-factory'

import type { NostrEvent, NostrFilter } from '../types/index'
import type { Knex } from 'knex'

/**
 * BTP-NIPs Event Repository
 *
 * Provides database operations for storing and retrieving Nostr events
 * received via the BTP-NIPs protocol.
 *
 * @module btp-nips/storage/event-repository
 */

// eslint-disable-next-line sort-imports
/* eslint-disable sort-imports */
/* eslint-enable sort-imports */

const debug = createLogger('btp-nips:event-repository')

/**
 * Event Repository for BTP-NIPs events
 *
 * Handles all database operations for Nostr events received via BTP-NIPs.
 * Uses the `btp_nips_events` table with duplicate prevention via ON CONFLICT.
 * Integrates Redis cache for hot events (cache-aside pattern).
 */
export class EventRepository {
  private writeDb: Knex
  private readDb: Knex
  private cache: EventCache
  private queryMonitor: QueryMonitor

  constructor(cache?: EventCache, queryMonitor?: QueryMonitor) {
    this.writeDb = getMasterDbClient()
    this.readDb = getReadReplicaDbClient()
    this.cache = cache ?? getEventCache()
    this.queryMonitor = queryMonitor ?? getQueryMonitor()
  }

  /**
   * Save a Nostr event to the database.
   *
   * Uses INSERT ... ON CONFLICT DO NOTHING to handle duplicate events gracefully.
   * If the event ID already exists, the insert is silently ignored (idempotent).
   *
   * After successful database insert, the event is cached in Redis for fast retrieval.
   *
   * Supports NIP-40 expiration: extracts `expiration` tag and validates timestamp.
   * Events that are already expired (expiration < now) are rejected.
   *
   * @param event - The Nostr event to save
   * @returns Promise that resolves when the event is saved (or already exists)
   * @throws Error if event is already expired (NIP-40)
   * @throws Database connection errors (caller should retry)
   *
   * @example
   * ```typescript
   * const repository = new EventRepository();
   * await repository.saveEvent(event);
   * ```
   */
  async saveEvent(event: NostrEvent): Promise<void> {
    return this.queryMonitor.wrapQuery(async () => {
      try {
        // Extract expiration tag (NIP-40)
        const expirationTag = event.tags.find((tag) => tag[0] === 'expiration')
        let expiresAt: number | null = null

        if (expirationTag && expirationTag[1]) {
          // Parse expiration timestamp
          expiresAt = parseInt(expirationTag[1], 10)

          if (isNaN(expiresAt)) {
            debug('Invalid expiration tag value: %s', expirationTag[1])
            throw new Error('Invalid expiration timestamp (NIP-40)')
          }

          // Validate expiration is in the future
          const currentTime = Math.floor(Date.now() / 1000)
          if (expiresAt < currentTime) {
            debug(
              'Event %s is already expired (expiration: %d, current: %d)',
              event.id,
              expiresAt,
              currentTime
            )
            throw new Error('Event is already expired (NIP-40)')
          }

          debug('Event %s has expiration timestamp: %d', event.id, expiresAt)
        }

        await this.writeDb('btp_nips_events')
          .insert({
            id: event.id,
            pubkey: event.pubkey,
            created_at: event.created_at,
            kind: event.kind,
            tags: JSON.stringify(event.tags),
            content: event.content,
            sig: event.sig,
            expires_at: expiresAt,
          })
          .onConflict('id') // If event ID already exists
          .ignore()          // Do nothing (idempotent)

        debug('Saved event %s (kind %d) from pubkey %s', event.id, event.kind, event.pubkey.substring(0, 8))

        // Cache event after successful save (write-through cache)
        await this.cache.cacheEvent(event)
      } catch (error) {
        debug('Failed to save event %s: %o', event.id, error)
        throw error
      }
    }, 'saveEvent')
  }

  /**
   * Retrieve an event by its ID.
   *
   * Implements cache-aside pattern:
   * 1. Check cache first
   * 2. If cache miss, query database
   * 3. Cache the result from database
   * 4. Return event
   *
   * @param id - The event ID (SHA-256 hash, hex string)
   * @returns The event if found, null otherwise
   *
   * @example
   * ```typescript
   * const event = await repository.getEvent('a1b2c3...');
   * if (event) {
   *   console.log('Event found:', event.content);
   * }
   * ```
   */
  async getEvent(id: string): Promise<NostrEvent | null> {
    return this.queryMonitor.wrapQuery(async () => {
      try {
        // Check cache first
        const cachedEvent = await this.cache.getCachedEvent(id)
        if (cachedEvent) {
          debug('Cache hit for event %s', id)
          return cachedEvent
        }

        // Cache miss - query database
        const row = await this.readDb('btp_nips_events')
          .where({ id })
          .first()

        if (!row) {
          return null
        }

        const event = this.rowToEvent(row)

        // Cache the event for future requests
        await this.cache.cacheEvent(event)

        return event
      } catch (error) {
        debug('Failed to get event %s: %o', id, error)
        throw error
      }
    }, 'getEvent')
  }

  /**
   * Check if an event exists in the database.
   *
   * This is faster than getEvent() for duplicate checking, as it only
   * checks for existence without fetching the full event.
   *
   * @param id - The event ID to check
   * @returns true if the event exists, false otherwise
   *
   * @example
   * ```typescript
   * if (await repository.eventExists(event.id)) {
   *   console.log('Duplicate event, ignoring');
   *   return;
   * }
   * ```
   */
  async eventExists(id: string): Promise<boolean> {
    try {
      const result = await this.readDb('btp_nips_events')
        .where({ id })
        .count('id as count')
        .first()

      return result ? parseInt(result.count as string) > 0 : false
    } catch (error) {
      debug('Failed to check event existence %s: %o', id, error)
      throw error
    }
  }

  /**
   * Query events by filter criteria.
   *
   * This method supports basic filtering for Story 5.3 (REQ handler).
   * Future enhancements will add more complex tag-based filtering.
   *
   * @param filter - Query filter
   * @param filter.pubkeys - Filter by author public keys
   * @param filter.kinds - Filter by event kinds
   * @param filter.since - Unix timestamp, events after this time
   * @param filter.until - Unix timestamp, events before this time
   * @param filter.limit - Maximum number of events to return (default: 100)
   * @returns Array of matching events
   *
   * @example
   * ```typescript
   * const events = await repository.queryEvents({
   *   pubkeys: ['alice_pubkey'],
   *   kinds: [1, 30023],
   *   since: 1234567890,
   *   limit: 50
   * });
   * ```
   */
  async queryEvents(filter: {
    pubkeys?: string[]
    kinds?: number[]
    since?: number
    until?: number
    limit?: number
  }): Promise<NostrEvent[]> {
    try {
      let query = this.readDb('btp_nips_events')

      if (filter.pubkeys && filter.pubkeys.length > 0) {
        query = query.whereIn('pubkey', filter.pubkeys)
      }

      if (filter.kinds && filter.kinds.length > 0) {
        query = query.whereIn('kind', filter.kinds)
      }

      if (filter.since) {
        query = query.where('created_at', '>=', filter.since)
      }

      if (filter.until) {
        query = query.where('created_at', '<=', filter.until)
      }

      query = query
        .orderBy('created_at', 'desc')
        .limit(filter.limit ?? 100)

      const rows = await query

      return rows.map(row => this.rowToEvent(row))
    } catch (error) {
      debug('Failed to query events: %o', error)
      throw error
    }
  }

  /**
   * Apply tag filters to a query builder using JSONB containment.
   *
   * Tag filters are specified with '#' prefix (e.g., '#e', '#p', '#a').
   * Uses PostgreSQL's JSONB @> operator with GIN index for fast queries.
   *
   * Example filter: { '#e': ['event_id_1', 'event_id_2'] }
   * This matches events where tags contain ['e', 'event_id_1'] OR ['e', 'event_id_2']
   *
   * @param builder - Knex query builder
   * @param filter - Nostr filter with potential tag filters
   */
  private applyTagFilters(builder: Knex.QueryBuilder, filter: NostrFilter): void {
    // Extract tag filter keys (keys starting with '#')
    const tagFilterKeys = Object.keys(filter).filter(key => key.startsWith('#'))

    if (tagFilterKeys.length === 0) {
      return
    }

    // For each tag filter key (e.g., '#e', '#p', '#a')
    for (const tagKey of tagFilterKeys) {
      const tagName = tagKey.substring(1) // Remove '#' prefix
      const tagValues = filter[tagKey as keyof NostrFilter] as string[]

      if (!Array.isArray(tagValues) || tagValues.length === 0) {
        continue
      }

      // Apply OR logic for multiple tag values
      // events matching ANY of the tag values
      builder.where((tagBuilder) => {
        for (const tagValue of tagValues) {
          // Use JSONB containment operator (@>)
          // tags @> '[["e", "event_id"]]' matches if tags array contains ['e', 'event_id']
          tagBuilder.orWhereRaw(
            'tags @> ?',
            [JSON.stringify([[tagName, tagValue]])]
          )
        }
      })
    }
  }

  /**
   * Convert a database row to a NostrEvent object.
   *
   * @param row - Database row
   * @returns NostrEvent object
   */
  private rowToEvent(row: any): NostrEvent {
    return {
      id: row.id,
      pubkey: row.pubkey,
      created_at: row.created_at,
      kind: row.kind,
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
      content: row.content,
      sig: row.sig,
    }
  }

  /**
   * Query events using Nostr filters (Story 5.3 + 5.4)
   *
   * Supports multiple filters with OR logic between them:
   * - event matches filter1 OR filter2 OR filter3
   * - Within each filter, conditions are AND
   *
   * Implements cache-aside pattern for query results:
   * 1. Check cache using SHA-256 hash of filters
   * 2. If cache miss, query database
   * 3. Cache the results
   * 4. Return events
   *
   * Supported filter properties:
   * - ids: Array of event IDs
   * - authors: Array of author pubkeys (replaces pubkeys)
   * - kinds: Array of event kinds
   * - since: Events after timestamp (inclusive)
   * - until: Events before timestamp (inclusive)
   * - limit: Maximum number of events (default 100, max 1000)
   * - #e, #p, #a, etc.: Tag filters using JSONB GIN index (Story 5.4)
   *
   * Tag filtering uses PostgreSQL JSONB @> operator with GIN index for performance.
   *
   * @param filters - Array of Nostr filters (OR logic)
   * @returns Array of matching events, ordered by created_at DESC
   *
   * @example
   * ```typescript
   * const events = await repository.queryEventsByFilters([
   *   { authors: ['alice'], kinds: [1] },  // Alice's short notes
   *   { authors: ['bob'], kinds: [30023] },  // Bob's long-form
   *   { '#e': ['event_id'], '#p': ['pubkey'] }  // Events with specific tags
   * ]);
   * // Returns events matching any filter
   * ```
   */
  async queryEventsByFilters(filters: NostrFilter[]): Promise<NostrEvent[]> {
    return this.queryMonitor.wrapQuery(async () => {
      try {
        // Handle empty filters
        if (filters.length === 0) {
          return []
        }

        // Check query cache first
        const cachedResult = await this.cache.getQueryResult(filters)
        if (cachedResult) {
          debug('Query cache hit for %d filters', filters.length)
          return cachedResult
        }

        let query = this.readDb('btp_nips_events')

        // Exclude deleted events (NIP-09 soft delete)
        query = query.where('is_deleted', false)

        // Exclude expired events (NIP-40)
        query = query.where((builder) => {
          builder.whereNull('expires_at')
            .orWhere('expires_at', '>', Math.floor(Date.now() / 1000))
        })

        // Apply filters with OR logic
        query = query.where((builder) => {
          for (const filter of filters) {
            builder.orWhere((subBuilder) => {
              // Filter by event IDs
              if (filter.ids && filter.ids.length > 0) {
                subBuilder.whereIn('id', filter.ids)
              }

              // Filter by authors (pubkeys)
              if (filter.authors && filter.authors.length > 0) {
                subBuilder.whereIn('pubkey', filter.authors)
              }

              // Filter by event kinds
              if (filter.kinds && filter.kinds.length > 0) {
                subBuilder.whereIn('kind', filter.kinds)
              }

              // Filter by timestamp range (since)
              if (filter.since !== undefined) {
                subBuilder.where('created_at', '>=', filter.since)
              }

              // Filter by timestamp range (until)
              if (filter.until !== undefined) {
                subBuilder.where('created_at', '<=', filter.until)
              }

              // Tag filters (#e, #p, #a, etc.) using JSONB containment
              // For each tag filter key (e.g., '#e', '#p')
              this.applyTagFilters(subBuilder, filter)
            })
          }
        })

        // Calculate max limit across all filters
        const maxLimit = Math.min(
          1000, // Hard cap at 1000 events
          Math.max(...filters.map((f) => f.limit ?? 100))
        )

        // Order by created_at DESC (newest first) and apply limit
        query = query.orderBy('created_at', 'desc').limit(maxLimit)

        const rows = await query

        debug(
          'Query returned %d events for %d filters',
          rows.length,
          filters.length
        )

        const events = rows.map((row) => this.rowToEvent(row))

        // Cache query results for future requests
        await this.cache.cacheQueryResult(filters, events)

        return events
      } catch (error) {
        debug('Failed to query events by filters: %o', error)
        throw error
      }
    }, 'queryEventsByFilters')
  }

  /**
   * Search for ILP Node Announcements (Kind 32001) by pubkey prefix or metadata.
   *
   * Optimized for PERF-001: Uses PostgreSQL database queries instead of loading all
   * announcements into memory.
   *
   * Supports three search modes:
   * 1. Exact pubkey match: WHERE pubkey = 'exact_pubkey'
   * 2. Prefix pubkey match: WHERE pubkey LIKE 'prefix%'
   * 3. Fuzzy metadata search: WHERE content ILIKE '%search_term%'
   *
   * @param searchTerm - Search term (pubkey, prefix, or operator name/node ID)
   * @param limit - Maximum number of results (default 100, max 1000)
   * @param offset - Pagination offset (default 0)
   * @returns Array of matching ILP Node Announcements
   *
   * @example
   * ```typescript
   * // Exact pubkey search
   * const exact = await repository.searchILPNodeAnnouncements('abc123...def456', 20, 0);
   *
   * // Prefix search
   * const prefix = await repository.searchILPNodeAnnouncements('abc123', 20, 0);
   *
   * // Fuzzy operator name search
   * const fuzzy = await repository.searchILPNodeAnnouncements('Alice', 20, 0);
   * ```
   */
  async searchILPNodeAnnouncements(
    searchTerm: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<NostrEvent[]> {
    return this.queryMonitor.wrapQuery(async () => {
      try {
        const trimmedTerm = searchTerm.trim()
        const maxLimit = Math.min(1000, limit)

        // Validate pubkey format (64-char hex)
        const isFullPubkey = /^[0-9a-f]{64}$/i.test(trimmedTerm)
        const isHexPrefix = /^[0-9a-f]+$/i.test(trimmedTerm)

        let query = this.readDb('btp_nips_events')
          .where('kind', 32001) // ILP Node Announcement kind
          .where('is_deleted', false) // Exclude soft-deleted events

        if (isFullPubkey) {
          // Exact pubkey match
          debug('Exact pubkey search: %s', trimmedTerm)
          query = query.where('pubkey', trimmedTerm)
        } else if (isHexPrefix) {
          // Prefix pubkey match
          debug('Prefix pubkey search: %s', trimmedTerm)
          query = query.where('pubkey', 'like', `${trimmedTerm}%`)
        } else {
          // Fuzzy search on operator name or node ID in content field
          // Uses PostgreSQL ILIKE for case-insensitive matching
          debug('Fuzzy metadata search: %s', trimmedTerm)
          query = query.whereRaw(
            "content ILIKE ? OR content::jsonb->>'operatorName' ILIKE ? OR content::jsonb->>'nodeId' ILIKE ?",
            [`%${trimmedTerm}%`, `%${trimmedTerm}%`, `%${trimmedTerm}%`]
          )
        }

        // Apply pagination and ordering
        query = query
          .orderBy('created_at', 'desc')
          .limit(maxLimit)
          .offset(offset)

        const rows = await query

        debug(
          'ILP announcement search returned %d results for term "%s"',
          rows.length,
          trimmedTerm
        )

        return rows.map((row) => this.rowToEvent(row))
      } catch (error) {
        debug('Failed to search ILP node announcements: %o', error)
        throw error
      }
    }, 'searchILPNodeAnnouncements')
  }

  /**
   * Subscribe to Kind 3 (Contact List) events for a specific pubkey
   *
   * Polls the database every 5 seconds for new Kind 3 events from the specified author.
   * When a new event is detected, the callback is invoked.
   *
   * This is a simplified polling implementation. In production, consider using:
   * - PostgreSQL LISTEN/NOTIFY for real-time updates
   * - Redis pub/sub for event notifications
   * - Event emitter pattern integrated with saveEvent()
   *
   * @param pubkey - The author's public key to monitor
   * @param callback - Function called when a new Kind 3 event is received
   *
   * @example
   * ```typescript
   * repository.subscribeToKind3Events('alice_pubkey', (_event) => {
   *   console.log('New contact list:', event.tags);
   * });
   * ```
   */
  subscribeToKind3Events(pubkey: string, callback: (event: NostrEvent) => void): void {
    let lastEventId: string | null = null

    // Poll for new Kind 3 events every 5 seconds
    // TODO: Add cleanup mechanism (store interval ID for later clearInterval)
    setInterval(async () => {
      try {
        const rows = await this.readDb('btp_nips_events')
          .where({ pubkey, kind: 3 })
          .orderBy('created_at', 'desc')
          .limit(1)

        if (rows.length === 0) {
          return
        }

        const latestEvent = this.rowToEvent(rows[0])

        // Check if this is a new event
        if (latestEvent.id !== lastEventId) {
          lastEventId = latestEvent.id
          debug('New Kind 3 event detected: %s', latestEvent.id)
          callback(latestEvent)
        }
      } catch (error) {
        debug('Error polling Kind 3 events: %o', error)
      }
    }, 5000) // Poll every 5 seconds

    debug('Started polling Kind 3 events for pubkey %s', pubkey.substring(0, 8))

    // Note: In production, this interval should be cleaned up
    // when the subscription is no longer needed. Consider adding
    // an unsubscribe mechanism.
  }

  /**
   * Delete all events from the database (for testing only).
   *
   * WARNING: This deletes ALL BTP-NIPs events. Only use in tests.
   *
   * @internal
   */
  async deleteAll(): Promise<void> {
    await this.writeDb('btp_nips_events').delete()
  }
}

/**
 * Singleton instance of EventRepository
 */
let repositoryInstance: EventRepository | null = null

/**
 * Get the singleton instance of EventRepository.
 *
 * @returns Shared EventRepository instance
 */
export function getEventRepository(): EventRepository {
  if (!repositoryInstance) {
    repositoryInstance = new EventRepository()
  }
  return repositoryInstance
}
