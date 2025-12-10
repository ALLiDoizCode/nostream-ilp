import { getMasterDbClient, getReadReplicaDbClient } from '../../database/client.js'
import { getCacheClient } from '../../cache/client.js'
import { createLogger } from '../../factories/logger-factory.js'

import type { CacheClient } from '../../@types/cache.js'
import type { Knex } from 'knex'

/**
 * Follow List Store Module
 *
 * Provides storage for Nostr Kind 3 (Contact List) data with PostgreSQL persistence
 * and Redis caching for performance.
 *
 * @module btp-nips/peer-discovery/follow-list-store
 */

const debug = createLogger('btp-nips:follow-list-store')

/**
 * Follow List Store
 *
 * Manages storage and retrieval of follow lists (extracted from Kind 3 events).
 * Uses PostgreSQL for persistence and Redis for caching.
 *
 * Cache Strategy:
 * - 24-hour TTL for follow lists (infrequently changed)
 * - Cache key format: `follow_list:{pubkey}`
 * - Write-through cache (update DB and cache together)
 *
 * Usage:
 * ```typescript
 * const store = new FollowListStore();
 *
 * // Get follow list
 * const follows = await store.getFollowList('alice_pubkey');
 *
 * // Update follow list
 * await store.setFollowList('alice_pubkey', ['bob', 'carol']);
 *
 * // Add single follow
 * await store.addFollow('alice_pubkey', 'dave');
 *
 * // Remove single follow
 * await store.removeFollow('alice_pubkey', 'bob');
 * ```
 */
export class FollowListStore {
  private writeDb: Knex
  private readDb: Knex
  private cache: CacheClient
  private readonly CACHE_TTL = 86400 // 24 hours in seconds

  /**
   * Create a FollowListStore instance
   *
   * @param writeDb - Master database client (optional, defaults to getMasterDbClient())
   * @param readDb - Read replica client (optional, defaults to getReadReplicaDbClient())
   * @param cache - Redis client (optional, defaults to getCacheClient())
   */
  constructor(writeDb?: Knex, readDb?: Knex, cache?: CacheClient) {
    this.writeDb = writeDb ?? getMasterDbClient()
    this.readDb = readDb ?? getReadReplicaDbClient()
    this.cache = cache ?? getCacheClient()
  }

  /**
   * Get the follow list for a pubkey
   *
   * Implements cache-aside pattern:
   * 1. Check Redis cache
   * 2. If cache miss, query PostgreSQL
   * 3. Cache the result
   * 4. Return follow list
   *
   * @param pubkey - The user's public key
   * @returns Array of followed pubkeys (empty array if none)
   *
   * @example
   * ```typescript
   * const follows = await store.getFollowList('alice_pubkey');
   * // Returns: ['bob', 'carol', 'dave']
   * ```
   */
  async getFollowList(pubkey: string): Promise<string[]> {
    try {
      const cacheKey = this.getCacheKey(pubkey)

      // Check cache first
      const cachedList = await this.cache.get(cacheKey)
      if (cachedList) {
        debug('Cache hit for follow list: %s', pubkey.substring(0, 8))
        return JSON.parse(cachedList)
      }

      // Cache miss - query database
      debug('Cache miss for follow list: %s', pubkey.substring(0, 8))

      const row = await this.readDb('follow_lists')
        .where({ pubkey })
        .first()

      if (!row) {
        debug('No follow list found for pubkey: %s', pubkey.substring(0, 8))
        return []
      }

      const follows = row.follows as string[]

      // Cache the result
      await this.cache.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(follows))

      debug('Loaded follow list for %s: %d follows', pubkey.substring(0, 8), follows.length)

      return follows
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      debug('Failed to get follow list for %s: %s', pubkey.substring(0, 8), errorMessage)
      throw error
    }
  }

  /**
   * Set the follow list for a pubkey
   *
   * Updates both database and cache (write-through pattern).
   *
   * @param pubkey - The user's public key
   * @param follows - Array of followed pubkeys
   *
   * @example
   * ```typescript
   * await store.setFollowList('alice_pubkey', ['bob', 'carol', 'dave']);
   * ```
   */
  async setFollowList(pubkey: string, follows: string[]): Promise<void> {
    try {
      // Update database (upsert)
      await this.writeDb('follow_lists')
        .insert({
          pubkey,
          follows,
          updated_at: this.writeDb.fn.now(),
        })
        .onConflict('pubkey')
        .merge(['follows', 'updated_at'])

      // Update cache
      const cacheKey = this.getCacheKey(pubkey)
      await this.cache.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(follows))

      debug('Updated follow list for %s: %d follows', pubkey.substring(0, 8), follows.length)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      debug('Failed to set follow list for %s: %s', pubkey.substring(0, 8), errorMessage)
      throw error
    }
  }

  /**
   * Add a single follow to the list
   *
   * This is a convenience method that loads the current list, adds the pubkey,
   * and saves the updated list.
   *
   * @param pubkey - The user's public key
   * @param followedPubkey - The pubkey to add to the follow list
   *
   * @example
   * ```typescript
   * await store.addFollow('alice_pubkey', 'dave');
   * ```
   */
  async addFollow(pubkey: string, followedPubkey: string): Promise<void> {
    try {
      const currentFollows = await this.getFollowList(pubkey)

      // Prevent duplicates
      if (currentFollows.includes(followedPubkey)) {
        debug('Follow already exists: %s -> %s', pubkey.substring(0, 8), followedPubkey.substring(0, 8))
        return
      }

      const updatedFollows = [...currentFollows, followedPubkey]
      await this.setFollowList(pubkey, updatedFollows)

      debug('Added follow: %s -> %s', pubkey.substring(0, 8), followedPubkey.substring(0, 8))
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      debug('Failed to add follow: %s', errorMessage)
      throw error
    }
  }

  /**
   * Remove a single follow from the list
   *
   * This is a convenience method that loads the current list, removes the pubkey,
   * and saves the updated list.
   *
   * @param pubkey - The user's public key
   * @param followedPubkey - The pubkey to remove from the follow list
   *
   * @example
   * ```typescript
   * await store.removeFollow('alice_pubkey', 'bob');
   * ```
   */
  async removeFollow(pubkey: string, followedPubkey: string): Promise<void> {
    try {
      const currentFollows = await this.getFollowList(pubkey)

      const updatedFollows = currentFollows.filter((p) => p !== followedPubkey)

      // No change
      if (updatedFollows.length === currentFollows.length) {
        debug('Follow does not exist: %s -> %s', pubkey.substring(0, 8), followedPubkey.substring(0, 8))
        return
      }

      await this.setFollowList(pubkey, updatedFollows)

      debug('Removed follow: %s -> %s', pubkey.substring(0, 8), followedPubkey.substring(0, 8))
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      debug('Failed to remove follow: %s', errorMessage)
      throw error
    }
  }

  /**
   * Get the Redis cache key for a pubkey's follow list
   *
   * @param pubkey - The user's public key
   * @returns Cache key string
   */
  private getCacheKey(pubkey: string): string {
    return `follow_list:${pubkey}`
  }

  /**
   * Clear the cache for a specific pubkey
   *
   * Useful for testing or manual cache invalidation.
   *
   * @param pubkey - The user's public key
   */
  async clearCache(pubkey: string): Promise<void> {
    const cacheKey = this.getCacheKey(pubkey)
    await this.cache.del(cacheKey)
    debug('Cleared cache for follow list: %s', pubkey.substring(0, 8))
  }
}

/**
 * Singleton instance of FollowListStore
 */
let storeInstance: FollowListStore | null = null

/**
 * Get the singleton instance of FollowListStore
 *
 * @returns Shared FollowListStore instance
 */
export function getFollowListStore(): FollowListStore {
  if (!storeInstance) {
    storeInstance = new FollowListStore()
  }
  return storeInstance
}
