/**
 * Mock Event Cache for N-peer testing
 *
 * Provides in-memory caching for Nostr events without requiring Redis.
 * This allows tests to run without Redis dependencies.
 *
 * @module test/btp-nips/n-peer/mock-event-cache
 */

import type { NostrEvent } from '../../../src/@types/nostr'

/**
 * Cache entry with expiration tracking
 */
interface CacheEntry {
  event: NostrEvent
  expiresAt: number
}

/**
 * In-memory mock implementation of EventCache for testing
 *
 * Provides the same interface as the real EventCache but stores
 * events in a JavaScript Map instead of Redis. Features:
 * - TTL-based expiration (checked on access)
 * - LRU eviction when max size reached
 * - Cache statistics (hits/misses)
 * - No external dependencies
 */
export class MockEventCache {
  private cache: Map<string, CacheEntry> = new Map()
  private accessOrder: string[] = [] // For LRU eviction
  private readonly ttl: number
  private readonly maxSize: number
  private cacheHits = 0
  private cacheMisses = 0

  /**
   * @param ttl - Time-to-live in seconds (default: 24 hours)
   * @param maxSize - Maximum number of cached events (default: 10000)
   */
  constructor(ttl: number = 24 * 60 * 60, maxSize: number = 10000) {
    this.ttl = ttl
    this.maxSize = maxSize
  }

  /**
   * Cache an event in memory
   *
   * @param event - The Nostr event to cache
   */
  async cacheEvent(event: NostrEvent): Promise<void> {
    const now = Date.now()
    const expiresAt = now + this.ttl * 1000

    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(event.id)) {
      this.evictOldest()
    }

    // Store event with expiration
    this.cache.set(event.id, {
      event,
      expiresAt,
    })

    // Update access order (LRU)
    this.updateAccessOrder(event.id)
  }

  /**
   * Retrieve a cached event from memory
   *
   * @param id - The event ID (SHA-256 hash, hex string)
   * @returns The cached event if found and not expired, null otherwise
   */
  async getCachedEvent(id: string): Promise<NostrEvent | null> {
    const entry = this.cache.get(id)

    if (!entry) {
      this.cacheMisses++
      return null
    }

    // Check expiration
    const now = Date.now()
    if (entry.expiresAt < now) {
      // Expired - remove and return null
      this.cache.delete(id)
      this.removeFromAccessOrder(id)
      this.cacheMisses++
      return null
    }

    // Cache hit
    this.cacheHits++
    this.updateAccessOrder(id)
    return entry.event
  }

  /**
   * Remove an event from the cache
   *
   * @param id - The event ID to remove
   */
  async invalidateEvent(id: string): Promise<void> {
    this.cache.delete(id)
    this.removeFromAccessOrder(id)
  }

  /**
   * Clear all cached events
   */
  async clear(): Promise<void> {
    this.cache.clear()
    this.accessOrder = []
    this.cacheHits = 0
    this.cacheMisses = 0
  }

  /**
   * Get cache statistics
   */
  getStats(): { hits: number; misses: number; size: number; hitRate: number } {
    const total = this.cacheHits + this.cacheMisses
    const hitRate = total > 0 ? this.cacheHits / total : 0

    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      size: this.cache.size,
      hitRate,
    }
  }

  /**
   * Evict the least recently used entry
   * @private
   */
  private evictOldest(): void {
    if (this.accessOrder.length === 0) return

    const oldestId = this.accessOrder.shift()
    if (oldestId) {
      this.cache.delete(oldestId)
    }
  }

  /**
   * Update access order for LRU tracking
   * @private
   */
  private updateAccessOrder(id: string): void {
    // Remove from current position (if exists)
    this.removeFromAccessOrder(id)

    // Add to end (most recently used)
    this.accessOrder.push(id)
  }

  /**
   * Remove from access order tracking
   * @private
   */
  private removeFromAccessOrder(id: string): void {
    const index = this.accessOrder.indexOf(id)
    if (index !== -1) {
      this.accessOrder.splice(index, 1)
    }
  }

  /**
   * Clean up expired entries (can be called periodically)
   */
  async cleanExpired(): Promise<number> {
    const now = Date.now()
    let removed = 0

    for (const [id, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        this.cache.delete(id)
        this.removeFromAccessOrder(id)
        removed++
      }
    }

    return removed
  }
}
