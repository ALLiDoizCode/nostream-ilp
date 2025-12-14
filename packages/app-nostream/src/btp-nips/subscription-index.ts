import { createLogger } from '../factories/logger-factory'

import type { NostrEvent, NostrFilter } from './types/index.js'

/**
 * Subscription Index Module
 * Provides O(1) indexed lookup for subscription matching
 *
 * Purpose: Optimize event propagation from O(n × m) to O(1 + k × m) where:
 * - n = total subscriptions
 * - m = filters per subscription
 * - k = candidate subscriptions (typically <10)
 *
 * Index Strategy:
 * - byAuthor: Maps author pubkey → subscription IDs
 * - byKind: Maps event kind → subscription IDs
 * - byTag: Maps tag key:value → subscription IDs
 *
 * Performance:
 * - Add subscription: O(f) where f = number of filter conditions
 * - Remove subscription: O(f)
 * - Find candidates: O(t) where t = number of tags in event
 *
 * Reference: docs/prd/epic-5-btp-nips-protocol.md#Story 5.5 AC 3
 */

const debug = createLogger('btp-nips:subscription-index')

/**
 * Subscription Index
 * Maintains three separate indexes for O(1) subscription candidate lookup
 *
 * @example
 * ```typescript
 * const index = new SubscriptionIndex();
 *
 * // Add subscription to index
 * index.addSubscription('sub-123', [
 *   { authors: ['alice'], kinds: [1] }
 * ]);
 *
 * // Find candidate subscriptions for event
 * const _event = { pubkey: 'alice', kind: 1, ... };
 * const candidates = index.findCandidates(event);
 * // Returns: Set { 'sub-123' }
 * ```
 */
export class SubscriptionIndex {
  /** Maps author pubkey → Set of subscription IDs */
  private byAuthor: Map<string, Set<string>>

  /** Maps event kind → Set of subscription IDs */
  private byKind: Map<number, Set<string>>

  /** Maps tag key:value → Set of subscription IDs (e.g., "#e:event_id") */
  private byTag: Map<string, Set<string>>

  constructor() {
    this.byAuthor = new Map()
    this.byKind = new Map()
    this.byTag = new Map()
  }

  /**
   * Add subscription to index
   * Indexes subscription by all filter conditions (authors, kinds, tags)
   *
   * @param id - Subscription ID
   * @param filters - Array of Nostr filters for this subscription
   *
   * @example
   * ```typescript
   * index.addSubscription('sub-123', [
   *   { authors: ['alice', 'bob'], kinds: [1, 7] },
   *   { '#e': ['event_id_1'], kinds: [30023] }
   * ]);
   *
   * // Creates index entries:
   * // byAuthor: { 'alice' => {'sub-123'}, 'bob' => {'sub-123'} }
   * // byKind: { 1 => {'sub-123'}, 7 => {'sub-123'}, 30023 => {'sub-123'} }
   * // byTag: { '#e:event_id_1' => {'sub-123'} }
   * ```
   */
  addSubscription(id: string, filters: NostrFilter[]): void {
    for (const filter of filters) {
      // Index by authors
      if (filter.authors && filter.authors.length > 0) {
        for (const author of filter.authors) {
          if (!this.byAuthor.has(author)) {
            this.byAuthor.set(author, new Set())
          }
          this.byAuthor.get(author)!.add(id)
        }
      }

      // Index by kinds
      if (filter.kinds && filter.kinds.length > 0) {
        for (const kind of filter.kinds) {
          if (!this.byKind.has(kind)) {
            this.byKind.set(kind, new Set())
          }
          this.byKind.get(kind)!.add(id)
        }
      }

      // Index by tag filters (#e, #p, #a, etc.)
      for (const [key, values] of Object.entries(filter)) {
        if (key.startsWith('#') && values && Array.isArray(values)) {
          for (const value of values) {
            const indexKey = `${key}:${value}` // e.g., "#e:event_id_123"
            if (!this.byTag.has(indexKey)) {
              this.byTag.set(indexKey, new Set())
            }
            this.byTag.get(indexKey)!.add(id)
          }
        }
      }
    }

    debug(
      'Added subscription %s to index (authors: %d, kinds: %d, tags: %d)',
      id,
      this.byAuthor.size,
      this.byKind.size,
      this.byTag.size
    )
  }

  /**
   * Remove subscription from index
   * Removes subscription ID from all indexes and cleans up empty sets
   *
   * @param id - Subscription ID
   * @param filters - Array of Nostr filters for this subscription
   *
   * @example
   * ```typescript
   * index.removeSubscription('sub-123', [
   *   { authors: ['alice'], kinds: [1] }
   * ]);
   *
   * // Removes 'sub-123' from:
   * // - byAuthor['alice']
   * // - byKind[1]
   * // Cleans up empty sets from Maps
   * ```
   */
  removeSubscription(id: string, filters: NostrFilter[]): void {
    for (const filter of filters) {
      // Remove from author index
      if (filter.authors && filter.authors.length > 0) {
        for (const author of filter.authors) {
          const subs = this.byAuthor.get(author)
          if (subs) {
            subs.delete(id)
            // Clean up empty sets
            if (subs.size === 0) {
              this.byAuthor.delete(author)
            }
          }
        }
      }

      // Remove from kind index
      if (filter.kinds && filter.kinds.length > 0) {
        for (const kind of filter.kinds) {
          const subs = this.byKind.get(kind)
          if (subs) {
            subs.delete(id)
            // Clean up empty sets
            if (subs.size === 0) {
              this.byKind.delete(kind)
            }
          }
        }
      }

      // Remove from tag index
      for (const [key, values] of Object.entries(filter)) {
        if (key.startsWith('#') && values && Array.isArray(values)) {
          for (const value of values) {
            const indexKey = `${key}:${value}`
            const subs = this.byTag.get(indexKey)
            if (subs) {
              subs.delete(id)
              // Clean up empty sets
              if (subs.size === 0) {
                this.byTag.delete(indexKey)
              }
            }
          }
        }
      }
    }

    debug(
      'Removed subscription %s from index (authors: %d, kinds: %d, tags: %d)',
      id,
      this.byAuthor.size,
      this.byKind.size,
      this.byTag.size
    )
  }

  /**
   * Find candidate subscription IDs for an event
   * Uses O(1) index lookups to find subscriptions that might match
   *
   * Returns union of:
   * - Subscriptions with filter.authors containing event.pubkey
   * - Subscriptions with filter.kinds containing event.kind
   * - Subscriptions with filter.tags matching event.tags
   *
   * Complexity: O(1 + 1 + t) = O(t) where t = number of tags in event
   * Typical case: t < 10, so effectively O(1)
   *
   * @param event - Nostr event to find candidates for
   * @returns Set of subscription IDs that might match this event
   *
   * @example
   * ```typescript
   * const _event = {
   *   id: 'abc123',
   *   pubkey: 'alice',
   *   kind: 1,
   *   tags: [['e', 'event_id_1'], ['p', 'bob']],
   *   ...
   * };
   *
   * const candidates = index.findCandidates(event);
   * // Returns: Set { 'sub-1', 'sub-5', 'sub-12' }
   * // (All subscriptions that filter by alice OR kind 1 OR tag e:event_id_1 OR tag p:bob)
   * ```
   */
  findCandidates(event: NostrEvent): Set<string> {
    const candidates = new Set<string>()

    // Lookup by author (O(1))
    const authorSubs = this.byAuthor.get(event.pubkey)
    if (authorSubs) {
      authorSubs.forEach((id) => candidates.add(id))
    }

    // Lookup by kind (O(1))
    const kindSubs = this.byKind.get(event.kind)
    if (kindSubs) {
      kindSubs.forEach((id) => candidates.add(id))
    }

    // Lookup by tags (O(t) where t = number of tags in event)
    for (const [tagName, tagValue] of event.tags) {
      if (tagName && tagValue) {
        const indexKey = `#${tagName}:${tagValue}` // e.g., "#e:event_id_123"
        const tagSubs = this.byTag.get(indexKey)
        if (tagSubs) {
          tagSubs.forEach((id) => candidates.add(id))
        }
      }
    }

    debug(
      'Found %d candidate subscriptions for event %s (author: %s, kind: %d, tags: %d)',
      candidates.size,
      event.id.slice(0, 8),
      event.pubkey.slice(0, 8),
      event.kind,
      event.tags.length
    )

    return candidates
  }

  /**
   * Get index statistics (for monitoring/debugging)
   *
   * @returns Object with index sizes
   */
  getStats(): {
    authorIndexSize: number
    kindIndexSize: number
    tagIndexSize: number
    totalSubscriptionReferences: number
  } {
    // Count total subscription references across all indexes
    let totalRefs = 0

    for (const subs of this.byAuthor.values()) {
      totalRefs += subs.size
    }

    for (const subs of this.byKind.values()) {
      totalRefs += subs.size
    }

    for (const subs of this.byTag.values()) {
      totalRefs += subs.size
    }

    return {
      authorIndexSize: this.byAuthor.size,
      kindIndexSize: this.byKind.size,
      tagIndexSize: this.byTag.size,
      totalSubscriptionReferences: totalRefs,
    }
  }

  /**
   * Clear all indexes (for testing)
   */
  clear(): void {
    this.byAuthor.clear()
    this.byKind.clear()
    this.byTag.clear()
    debug('Index cleared')
  }
}
