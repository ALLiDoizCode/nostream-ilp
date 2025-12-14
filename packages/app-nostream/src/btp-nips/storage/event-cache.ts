import { getCacheClient } from '../../cache/client'
import { createLogger } from '../../factories/logger-factory'
import { createHash } from 'crypto'

import type { CacheClient } from '../../@types/cache'
import type { NostrEvent, NostrFilter } from '../types/index.js'

/**
 * BTP-NIPs Event Cache
 *
 * Provides Redis caching for Nostr events with graceful degradation
 * when Redis is unavailable.
 *
 * @module btp-nips/storage/event-cache
 */

// eslint-disable-next-line sort-imports
const debug = createLogger('btp-nips:event-cache')

/**
 * Default TTL for cached events (24 hours in seconds)
 */
const DEFAULT_EVENT_TTL = 24 * 60 * 60

/**
 * Default maximum query cache size (events)
 */
const DEFAULT_MAX_QUERY_CACHE_SIZE = 1000

/**
 * Event Cache for BTP-NIPs events
 *
 * Provides Redis caching with:
 * - 24-hour TTL for hot events
 * - Query result caching with SHA-256 filter hashing
 * - Graceful degradation (falls back to database if Redis unavailable)
 * - Automatic connection handling
 * - Cache hit/miss statistics
 */
export class EventCache {
  private client: CacheClient | null = null
  private connected: boolean = false
  private readonly ttl: number
  private readonly maxQueryCacheSize: number
  private cacheHits = 0
  private cacheMisses = 0
  private initPromise: Promise<void> | null = null

  constructor(ttl: number = DEFAULT_EVENT_TTL, maxQueryCacheSize: number = DEFAULT_MAX_QUERY_CACHE_SIZE) {
    this.ttl = ttl
    this.maxQueryCacheSize = maxQueryCacheSize
    // Start initialization but don't await (lazy initialization pattern)
    this.initPromise = this.initializeClient()
  }

  /**
   * Initialize Redis client and handle connection.
   *
   * If Redis connection fails, the cache will operate in degraded mode
   * (all operations become no-ops, falling back to database).
   */
  private async initializeClient(): Promise<void> {
    try {
      this.client = getCacheClient()

      // Connect if not already connected
      if (!this.client.isOpen) {
        await this.client.connect()
      }

      this.connected = true
      debug('Redis client connected')
    } catch (error) {
      debug('Failed to connect to Redis, operating in degraded mode: %o', error)
      this.connected = false
      this.client = null
    }
  }

  /**
   * Ensure the cache client is initialized before use.
   *
   * This method is called internally by all cache operations to ensure
   * initialization completes before accessing the Redis client.
   *
   * @private
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise
      this.initPromise = null // Clear promise after first completion
    }
  }

  /**
   * Cache an event in Redis.
   *
   * The event is stored as JSON with a TTL (default: 24 hours).
   * If Redis is unavailable, this operation silently fails (graceful degradation).
   *
   * @param event - The Nostr event to cache
   * @returns Promise that resolves when cached (or if cache is unavailable)
   *
   * @example
   * ```typescript
   * const cache = new EventCache();
   * await cache.cacheEvent(event); // Best effort
   * ```
   */
  async cacheEvent(event: NostrEvent): Promise<void> {
    await this.ensureInitialized()

    if (!this.connected || !this.client) {
      // Graceful degradation: Redis unavailable, skip caching
      return
    }

    try {
      const key = this.getEventKey(event.id)
      const value = JSON.stringify(event)

      await this.client.setEx(key, this.ttl, value)

      debug('Cached event %s (TTL: %d seconds)', event.id, this.ttl)
    } catch (error) {
      // Don't throw on cache errors - graceful degradation
      debug('Failed to cache event %s: %o', event.id, error)

      // If connection failed, mark as disconnected
      if (error instanceof Error && error.message.includes('connection')) {
        this.connected = false
      }
    }
  }

  /**
   * Retrieve a cached event from Redis.
   *
   * @param id - The event ID (SHA-256 hash, hex string)
   * @returns The cached event if found, null if not found or Redis unavailable
   *
   * @example
   * ```typescript
   * const event = await cache.getCachedEvent('a1b2c3...');
   * if (!event) {
   *   // Cache miss - fetch from database
   *   event = await repository.getEvent(id);
   * }
   * ```
   */
  async getCachedEvent(id: string): Promise<NostrEvent | null> {
    await this.ensureInitialized()

    if (!this.connected || !this.client) {
      // Graceful degradation: Redis unavailable, return cache miss
      this.cacheMisses++
      return null
    }

    try {
      const key = this.getEventKey(id)
      const value = await this.client.get(key)

      if (!value) {
        this.cacheMisses++
        debug('Cache miss for event %s', id)
        return null
      }

      const event = JSON.parse(value) as NostrEvent
      this.cacheHits++
      debug('Cache hit for event %s', id)
      return event
    } catch (error) {
      // Don't throw on cache errors - graceful degradation
      this.cacheMisses++
      debug('Failed to get cached event %s: %o', id, error)

      // If connection failed, mark as disconnected
      if (error instanceof Error && error.message.includes('connection')) {
        this.connected = false
      }

      return null
    }
  }

  /**
   * Check if an event exists in the cache.
   *
   * This is faster than getCachedEvent() if you only need to check existence.
   *
   * @param id - The event ID to check
   * @returns true if the event is cached, false otherwise
   */
  async eventExistsInCache(id: string): Promise<boolean> {
    await this.ensureInitialized()

    if (!this.connected || !this.client) {
      return false
    }

    try {
      const key = this.getEventKey(id)
      const exists = await this.client.exists(key)
      return exists > 0
    } catch (error) {
      debug('Failed to check event existence in cache %s: %o', id, error)
      return false
    }
  }

  /**
   * Invalidate (delete) a cached event.
   *
   * Note: Events are immutable in Nostr, so this is rarely needed.
   * Mainly useful for testing or event deletion (NIP-09).
   *
   * @param id - The event ID to invalidate
   */
  async invalidateEvent(id: string): Promise<void> {
    await this.ensureInitialized()

    if (!this.connected || !this.client) {
      return
    }

    try {
      const key = this.getEventKey(id)
      await this.client.del(key)
      debug('Invalidated cached event %s', id)
    } catch (error) {
      debug('Failed to invalidate cached event %s: %o', id, error)
    }
  }

  /**
   * Cache query results with deterministic key based on filters.
   *
   * Uses SHA-256 hash of stringified filters to create consistent cache key.
   * Large result sets (> maxQueryCacheSize) are not cached.
   *
   * @param filters - Nostr filters used in query
   * @param events - Query result events
   * @returns Promise that resolves when cached (or if cache is unavailable)
   *
   * @example
   * ```typescript
   * const events = await db.query(filters);
   * await cache.cacheQueryResult(filters, events);
   * ```
   */
  async cacheQueryResult(filters: NostrFilter[], events: NostrEvent[]): Promise<void> {
    await this.ensureInitialized()

    if (!this.connected || !this.client) {
      return
    }

    // Don't cache large result sets
    if (events.length > this.maxQueryCacheSize) {
      debug('Query result too large to cache (%d events)', events.length)
      return
    }

    try {
      const key = this.getQueryKey(filters)
      const value = JSON.stringify(events)

      await this.client.setEx(key, this.ttl, value)

      debug('Cached query result: %s (%d events)', key, events.length)
    } catch (error) {
      debug('Failed to cache query result: %o', error)

      if (error instanceof Error && error.message.includes('connection')) {
        this.connected = false
      }
    }
  }

  /**
   * Get cached query results.
   *
   * @param filters - Nostr filters
   * @returns Cached events or null if not found
   *
   * @example
   * ```typescript
   * const cached = await cache.getQueryResult(filters);
   * if (cached) return cached;
   * // Otherwise query database
   * ```
   */
  async getQueryResult(filters: NostrFilter[]): Promise<NostrEvent[] | null> {
    await this.ensureInitialized()

    if (!this.connected || !this.client) {
      this.cacheMisses++
      return null
    }

    try {
      const key = this.getQueryKey(filters)
      const value = await this.client.get(key)

      if (!value) {
        this.cacheMisses++
        debug('Cache miss for query: %s', key)
        return null
      }

      const events = JSON.parse(value) as NostrEvent[]
      this.cacheHits++
      debug('Cache hit for query: %s (%d events)', key, events.length)
      return events
    } catch (error) {
      this.cacheMisses++
      debug('Failed to get cached query result: %o', error)

      if (error instanceof Error && error.message.includes('connection')) {
        this.connected = false
      }

      return null
    }
  }

  /**
   * Invalidate cache entries matching pattern.
   *
   * Used when events are deleted or modified to ensure cache consistency.
   *
   * @param pattern - Redis key pattern (e.g., "btp_nips:event:*", "btp_nips:query:*")
   * @returns Promise that resolves when invalidation completes
   *
   * @example
   * ```typescript
   * // Clear all query caches after event deletion
   * await cache.invalidateCache('btp_nips:query:*');
   * ```
   */
  async invalidateCache(pattern: string): Promise<void> {
    await this.ensureInitialized()

    if (!this.connected || !this.client) {
      return
    }

    try {
      const keys: string[] = []

      for await (const key of this.client.scanIterator({ MATCH: pattern })) {
        keys.push(key)
      }

      if (keys.length > 0) {
        await this.client.del(keys)
        debug('Invalidated %d cache entries matching pattern: %s', keys.length, pattern)
      }
    } catch (error) {
      debug('Cache invalidation failed (non-critical): %o', error)
    }
  }

  /**
   * Delete all cached events (for testing only).
   *
   * WARNING: This deletes ALL BTP-NIPs event cache keys. Only use in tests.
   *
   * @internal
   */
  async flushAll(): Promise<void> {
    await this.ensureInitialized()

    if (!this.connected || !this.client) {
      return
    }

    try {
      // Use SCAN to find all event keys and delete them
      const keys: string[] = []
      const pattern = 'btp_nips:event:*'

      for await (const key of this.client.scanIterator({ MATCH: pattern })) {
        keys.push(key)
      }

      if (keys.length > 0) {
        await this.client.del(keys)
        debug('Flushed %d cached events', keys.length)
      }
    } catch (error) {
      debug('Failed to flush cached events: %o', error)
    }
  }

  /**
   * Get cache hit rate (0.0 to 1.0).
   *
   * @returns Cache hit rate as decimal
   *
   * @example
   * ```typescript
   * const hitRate = cache.getCacheHitRate();
   * console.log(`Cache hit rate: ${(hitRate * 100).toFixed(1)}%`);
   * ```
   */
  getCacheHitRate(): number {
    const total = this.cacheHits + this.cacheMisses
    if (total === 0) return 0
    return this.cacheHits / total
  }

  /**
   * Reset cache statistics.
   */
  resetStats(): void {
    this.cacheHits = 0
    this.cacheMisses = 0
  }

  /**
   * Get the Redis key for an event.
   *
   * Key format: btp_nips:event:{event_id}
   *
   * @param id - Event ID
   * @returns Redis key
   */
  private getEventKey(id: string): string {
    return `btp_nips:event:${id}`
  }

  /**
   * Generate deterministic cache key for query filters.
   *
   * Uses SHA-256 hash of stringified filters to create consistent key.
   *
   * @param filters - Nostr filters
   * @returns Redis key with hash
   */
  private getQueryKey(filters: NostrFilter[]): string {
    const filterString = JSON.stringify(filters)
    const hash = createHash('sha256')
      .update(filterString)
      .digest('hex')
    return `btp_nips:query:${hash}`
  }

  /**
   * Check if the cache is connected and operational.
   *
   * @returns true if Redis is connected, false if operating in degraded mode
   *
   * Note: This returns the current connection status. If called before
   * initialization completes, it may return false even if connection
   * will succeed. Use `await cache.waitForInitialization()` to ensure init completes first.
   */
  isConnected(): boolean {
    return this.connected
  }

  /**
   * Wait for cache initialization to complete.
   *
   * This method can be called to explicitly wait for the cache to finish
   * initializing. Normally not needed as all cache methods call this internally.
   * Useful for tests or when you need to check connection status immediately.
   *
   * @returns Promise that resolves when initialization is complete
   */
  async waitForInitialization(): Promise<void> {
    await this.ensureInitialized()
  }

  /**
   * Disconnect from Redis (for cleanup).
   */
  async disconnect(): Promise<void> {
    await this.ensureInitialized()

    if (this.client && this.connected) {
      try {
        await this.client.disconnect()
        this.connected = false
        debug('Redis client disconnected')
      } catch (error) {
        debug('Error disconnecting Redis client: %o', error)
      }
    }
  }

  /**
   * Set custom cache key with value and TTL.
   *
   * Allows caching of non-event data (e.g., ILP announcements, peer metadata).
   *
   * @param key - Custom Redis key (should include prefix, e.g., "ilp:node:abc123")
   * @param value - Value to cache (will be JSON stringified)
   * @param ttl - Time to live in seconds (optional, defaults to event TTL)
   *
   * @example
   * ```typescript
   * await cache.setCustomKey('ilp:node:abc123', announcement, 3600);
   * ```
   */
  async setCustomKey(key: string, value: unknown, ttl?: number): Promise<void> {
    await this.ensureInitialized()

    if (!this.connected || !this.client) {
      return
    }

    try {
      const serialized = JSON.stringify(value)
      const effectiveTtl = ttl ?? this.ttl

      await this.client.setEx(key, effectiveTtl, serialized)

      debug('Cached custom key %s (TTL: %d seconds)', key, effectiveTtl)
    } catch (error) {
      debug('Failed to cache custom key %s: %o', key, error)

      if (error instanceof Error && error.message.includes('connection')) {
        this.connected = false
      }
    }
  }

  /**
   * Get custom cache key value.
   *
   * @param key - Custom Redis key
   * @returns Parsed value or null if not found
   *
   * @example
   * ```typescript
   * const announcement = await cache.getCustomKey<ILPNodeAnnouncement>('ilp:node:abc123');
   * ```
   */
  async getCustomKey<T>(key: string): Promise<T | null> {
    await this.ensureInitialized()

    if (!this.connected || !this.client) {
      return null
    }

    try {
      const value = await this.client.get(key)

      if (!value) {
        return null
      }

      return JSON.parse(value) as T
    } catch (error) {
      debug('Failed to get custom key %s: %o', key, error)

      if (error instanceof Error && error.message.includes('connection')) {
        this.connected = false
      }

      return null
    }
  }

  /**
   * Delete custom cache key.
   *
   * @param key - Custom Redis key to delete
   *
   * @example
   * ```typescript
   * await cache.deleteCustomKey('ilp:node:abc123');
   * ```
   */
  async deleteCustomKey(key: string): Promise<void> {
    await this.ensureInitialized()

    if (!this.connected || !this.client) {
      return
    }

    try {
      await this.client.del(key)
      debug('Deleted custom key %s', key)
    } catch (error) {
      debug('Failed to delete custom key %s: %o', key, error)

      if (error instanceof Error && error.message.includes('connection')) {
        this.connected = false
      }
    }
  }
}

/**
 * Singleton instance of EventCache
 */
let cacheInstance: EventCache | null = null

/**
 * Get the singleton instance of EventCache.
 *
 * @returns Shared EventCache instance
 */
export function getEventCache(): EventCache {
  if (!cacheInstance) {
    cacheInstance = new EventCache()
  }
  return cacheInstance
}
