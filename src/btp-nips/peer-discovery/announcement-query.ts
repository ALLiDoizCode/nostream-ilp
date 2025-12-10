import {
import { EventCache } from '../storage/event-cache.js'
import { EventRepository } from '../storage/event-repository.js'

import type {
import type { NostrEvent } from '../types/index.js'

/**
 * ILP Node Announcement Query Module
 * Queries and caches ILP node announcements (Kind 32001)
 *
 * Epic 6: Peer Networking & Social Graph Integration
 * Story 6.1: ILP Node Announcement
 *
 * Reference: docs/stories/6.1.story.md
 */

  ILPNodeAnnouncement,
} from '../types/ilp-node-announcement.js'
  ILP_NODE_D_TAG,
  ILP_NODE_KIND,
} from '../types/ilp-node-announcement.js'

/**
 * Cache configuration for announcements
 */
const ANNOUNCEMENT_CACHE_TTL = 3600 // 1 hour in seconds
const ANNOUNCEMENT_CACHE_KEY_PREFIX = 'ilp:node:'

/**
 * Announcement Query Module
 *
 * Provides efficient querying and caching of ILP node announcements.
 * Implements cache-aside pattern with 1-hour TTL.
 *
 * @example
 * ```typescript
 * const query = new AnnouncementQuery(eventRepository, eventCache);
 *
 * // Query single announcement
 * const announcement = await query.queryNodeAnnouncement(peerPubkey);
 * if (announcement) {
 *   console.log('ILP address:', announcement.tags.find(t => t[0] === 'ilp-address')[1]);
 * }
 *
 * // Batch query multiple peers
 * const announcements = await query.batchQueryAnnouncements([pubkey1, pubkey2, pubkey3]);
 * ```
 */
export class AnnouncementQuery {
  private eventRepository: EventRepository
  private eventCache: EventCache
  private cacheHits = 0
  private cacheMisses = 0

  constructor(eventRepository: EventRepository, eventCache: EventCache) {
    this.eventRepository = eventRepository
    this.eventCache = eventCache
  }

  /**
   * Query node announcement for a specific public key
   *
   * Implements cache-aside pattern:
   * 1. Check cache first
   * 2. If miss, query database
   * 3. Cache result with 1-hour TTL
   * 4. Return announcement or null
   *
   * @param pubkey - Nostr public key (64-char hex)
   * @returns ILP node announcement or null if not found
   *
   * @example
   * ```typescript
   * const announcement = await query.queryNodeAnnouncement(
   *   'abc123def456...'
   * );
   *
   * if (!announcement) {
   *   console.log('No announcement found for peer');
   *   return;
   * }
   *
   * const ilpAddress = announcement.tags.find(
   *   t => t[0] === 'ilp-address'
   * )?.[1];
   * ```
   */
  async queryNodeAnnouncement(
    pubkey: string,
  ): Promise<ILPNodeAnnouncement | null> {
    // Step 1: Check cache
    const cacheKey = this.getAnnouncementCacheKey(pubkey)
    const cached = await this.getCachedAnnouncement(cacheKey)

    if (cached) {
      this.cacheHits++
      return cached
    }

    // Step 2: Query database
    this.cacheMisses++
    const events = await this.eventRepository.queryEventsByFilters([
      {
        kinds: [ILP_NODE_KIND],
        authors: [pubkey],
        '#d': [ILP_NODE_D_TAG],
        limit: 1,
      },
    ])

    // Step 3: Handle result
    if (events.length === 0) {
      // No announcement found - cache negative result with shorter TTL
      await this.cacheNegativeResult(cacheKey)
      return null
    }

    const announcement = events[0] as ILPNodeAnnouncement

    // Step 4: Cache result
    await this.cacheAnnouncement(cacheKey, announcement)

    return announcement
  }

  /**
   * Batch query announcements for multiple public keys
   *
   * More efficient than calling queryNodeAnnouncement() multiple times.
   * Uses single database query for all pubkeys.
   *
   * @param pubkeys - Array of Nostr public keys
   * @returns Map of pubkey → announcement (only includes found announcements)
   *
   * @example
   * ```typescript
   * const pubkeys = ['alice_pubkey', 'bob_pubkey', 'carol_pubkey'];
   * const announcements = await query.batchQueryAnnouncements(pubkeys);
   *
   * for (const [pubkey, announcement] of announcements) {
   *   console.log(`${pubkey}: ${announcement.tags.find(t => t[0] === 'ilp-address')[1]}`);
   * }
   * ```
   */
  async batchQueryAnnouncements(
    pubkeys: string[],
  ): Promise<Map<string, ILPNodeAnnouncement>> {
    if (pubkeys.length === 0) {
      return new Map()
    }

    const results = new Map<string, ILPNodeAnnouncement>()
    const uncachedPubkeys: string[] = []

    // Step 1: Check cache for each pubkey
    for (const pubkey of pubkeys) {
      const cacheKey = this.getAnnouncementCacheKey(pubkey)
      const cached = await this.getCachedAnnouncement(cacheKey)

      if (cached) {
        this.cacheHits++
        results.set(pubkey, cached)
      } else {
        this.cacheMisses++
        uncachedPubkeys.push(pubkey)
      }
    }

    // Step 2: Query database for uncached pubkeys
    if (uncachedPubkeys.length > 0) {
      const events = await this.eventRepository.queryEventsByFilters([
        {
          kinds: [ILP_NODE_KIND],
          authors: uncachedPubkeys,
          '#d': [ILP_NODE_D_TAG],
        },
      ])

      // Step 3: Process results and cache
      for (const event of events) {
        const announcement = event as ILPNodeAnnouncement
        results.set(announcement.pubkey, announcement)

        // Cache this announcement
        const cacheKey = this.getAnnouncementCacheKey(announcement.pubkey)
        await this.cacheAnnouncement(cacheKey, announcement)
      }

      // Step 4: Cache negative results for pubkeys not found
      for (const pubkey of uncachedPubkeys) {
        if (!results.has(pubkey)) {
          const cacheKey = this.getAnnouncementCacheKey(pubkey)
          await this.cacheNegativeResult(cacheKey)
        }
      }
    }

    return results
  }

  /**
   * Invalidate cached announcement for a specific pubkey
   *
   * Call this when a new announcement is published to clear stale cache.
   *
   * @param pubkey - Nostr public key
   *
   * @example
   * ```typescript
   * // After publishing new announcement
   * await publisher.publishAnnouncement('alice', privateKey);
   * await query.invalidateCache(pubkey); // Clear old cache
   * ```
   */
  async invalidateCache(pubkey: string): Promise<void> {
    const cacheKey = this.getAnnouncementCacheKey(pubkey)
    await this.eventCache.deleteCustomKey(cacheKey)
  }

  /**
   * Get cache hit rate statistics
   *
   * @returns Object with cache hits, misses, and hit rate percentage
   *
   * @example
   * ```typescript
   * const stats = query.getCacheStats();
   * console.log(`Cache hit rate: ${stats.hitRate.toFixed(2)}%`);
   * ```
   */
  getCacheStats(): {
    hits: number
    misses: number
    hitRate: number
    total: number
  } {
    const total = this.cacheHits + this.cacheMisses
    const hitRate = total === 0 ? 0 : (this.cacheHits / total) * 100

    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate,
      total,
    }
  }

  /**
   * Reset cache statistics
   *
   * Useful for testing or periodic stats collection.
   */
  resetCacheStats(): void {
    this.cacheHits = 0
    this.cacheMisses = 0
  }

  /**
   * Get cache key for announcement
   *
   * Format: ilp:node:{pubkey}
   *
   * @private
   * @param pubkey - Nostr public key
   * @returns Redis cache key
   */
  private getAnnouncementCacheKey(pubkey: string): string {
    return `${ANNOUNCEMENT_CACHE_KEY_PREFIX}${pubkey}`
  }

  /**
   * Get cached announcement from Redis
   *
   * @private
   * @param cacheKey - Redis key
   * @returns Cached announcement or null
   */
  private async getCachedAnnouncement(
    cacheKey: string,
  ): Promise<ILPNodeAnnouncement | null> {
    try {
      return await this.eventCache.getCustomKey<ILPNodeAnnouncement>(cacheKey)
    } catch {
      return null
    }
  }

  /**
   * Cache announcement in Redis
   *
   * @private
   * @param cacheKey - Redis key
   * @param announcement - Announcement to cache
   */
  private async cacheAnnouncement(
    cacheKey: string,
    announcement: ILPNodeAnnouncement,
  ): Promise<void> {
    try {
      await this.eventCache.setCustomKey(
        cacheKey,
        announcement,
        ANNOUNCEMENT_CACHE_TTL,
      )
    } catch {
      // Graceful degradation - cache failures are non-fatal
    }
  }

  /**
   * Cache negative result (announcement not found)
   *
   * Prevents repeated database queries for non-existent announcements.
   * Uses shorter TTL than positive results.
   *
   * @private
   * @param cacheKey - Redis key
   * @param ttl - Time to live in seconds (default: 300 = 5 minutes)
   */
  private async cacheNegativeResult(
    cacheKey: string,
    ttl: number = 300,
  ): Promise<void> {
    try {
      // Cache a sentinel value to indicate "not found"
      await this.eventCache.setCustomKey(cacheKey, null, ttl)
    } catch {
      // Graceful degradation
    }
  }
}
