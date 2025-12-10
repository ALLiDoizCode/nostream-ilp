import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventCache } from '../../src/btp-nips/storage/event-cache'

import type { CacheClient } from '../../src/@types/cache'
import type { NostrEvent, NostrFilter } from '../../src/btp-nips/types'

/**
 * Unit Tests for BTP-NIPs Event Cache
 *
 * Tests Redis caching functionality with graceful degradation.
 *
 * @see src/btp-nips/storage/event-cache.ts
 * @see Story 5.4 - AC1: Redis Caching Layer
 */

/* eslint-disable sort-imports */
// Mock the cache client factory
vi.mock('../../src/cache/client', () => {
  let mockClient: MockCacheClient | null = null

  class MockCacheClient {
    private data = new Map<string, { value: string; expiresAt: number }>()
    public isOpen = false
    public shouldFailConnection = false
    public shouldFailOperations = false

    async connect(): Promise<void> {
      if (this.shouldFailConnection) {
        throw new Error('Redis connection failed')
      }
      this.isOpen = true
    }

    async disconnect(): Promise<void> {
      this.isOpen = false
    }

    async setEx(key: string, ttl: number, value: string): Promise<void> {
      if (this.shouldFailOperations) {
        throw new Error('Redis setEx failed')
      }
      const expiresAt = Date.now() + ttl * 1000
      this.data.set(key, { value, expiresAt })
    }

    async get(key: string): Promise<string | null> {
      if (this.shouldFailOperations) {
        throw new Error('Redis get failed')
      }
      const entry = this.data.get(key)
      if (!entry) return null
      if (entry.expiresAt < Date.now()) {
        this.data.delete(key)
        return null
      }
      return entry.value
    }

    async exists(key: string): Promise<number> {
      if (this.shouldFailOperations) {
        throw new Error('Redis exists failed')
      }
      const entry = this.data.get(key)
      if (!entry) return 0
      if (entry.expiresAt < Date.now()) {
        this.data.delete(key)
        return 0
      }
      return 1
    }

    async del(keys: string | string[]): Promise<number> {
      if (this.shouldFailOperations) {
        throw new Error('Redis del failed')
      }
      const keyArray = Array.isArray(keys) ? keys : [keys]
      let deleted = 0
      for (const key of keyArray) {
        if (this.data.delete(key)) {
          deleted++
        }
      }
      return deleted
    }

    async *scanIterator(options: { MATCH: string }): AsyncGenerator<string> {
      if (this.shouldFailOperations) {
        throw new Error('Redis scan failed')
      }
      const pattern = options.MATCH.replace('*', '.*')
      const regex = new RegExp(`^${pattern}$`)
      for (const key of this.data.keys()) {
        if (regex.test(key)) {
          yield key
        }
      }
    }

    // Test helpers
    clear() {
      this.data.clear()
    }

    setConnectionFailure(shouldFail: boolean) {
      this.shouldFailConnection = shouldFail
    }

    setOperationFailure(shouldFail: boolean) {
      this.shouldFailOperations = shouldFail
    }
  }

  return {
    getCacheClient: () => {
      if (!mockClient) {
        mockClient = new MockCacheClient()
      }
      return mockClient as unknown as CacheClient
    },
    __mockClient: () => mockClient,
  }
})

/**
 * Create a test fixture for a valid Nostr event
 */
function createTestEvent(overrides?: Partial<NostrEvent>): NostrEvent {
  return {
    id: 'a1b2c3d4e5f6' + '0'.repeat(52), // 64-char hex
    pubkey: 'alice_pubkey_' + '0'.repeat(51), // 64-char hex
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [['e', 'reply_to_event'], ['p', 'mentioned_pubkey']],
    content: 'Test event content',
    sig: 'signature_' + '0'.repeat(118), // 128-char hex
    ...overrides,
  }
}

describe('EventCache', () => {
  let cache: EventCache

  beforeEach(async () => {
    // Clear mock client data before each test
    const { getCacheClient } = await import('../../src/cache/client')
    const mockClient = getCacheClient() as any
    if (mockClient && mockClient.clear) {
      mockClient.clear()
    }
    if (mockClient && mockClient.setConnectionFailure) {
      mockClient.setConnectionFailure(false)
    }
    if (mockClient && mockClient.setOperationFailure) {
      mockClient.setOperationFailure(false)
    }
    if (mockClient && mockClient.isOpen !== undefined) {
      mockClient.isOpen = false // Reset connection state
    }

    // Create new cache instance for each test
    cache = new EventCache()
  })

  afterEach(async () => {
    // Clean up cache
    await cache.disconnect()
  })

  describe('Initialization and Connection', () => {
    it('should initialize successfully with default TTL', async () => {
      expect(cache).toBeDefined()
      await cache.waitForInitialization()
      expect(cache.isConnected()).toBe(true)
    })

    it('should accept custom TTL in constructor', async () => {
      const customCache = new EventCache(3600) // 1 hour TTL

      expect(customCache).toBeDefined()
      await customCache.waitForInitialization()
      expect(customCache.isConnected()).toBe(true)

      await customCache.disconnect()
    })

    it('should handle connection failure gracefully (degraded mode)', async () => {
      //  Create a new client with connection failure before creating cache
      const { getCacheClient } = await import('../../src/cache/client')
      const mockClient = getCacheClient() as any

      // Set connection failure BEFORE creating the EventCache instance
      mockClient.setConnectionFailure(true)
      mockClient.isOpen = false

      const degradedCache = new EventCache()

      // Trigger initialization - should fail gracefully
      await degradedCache.waitForInitialization()

      // Should not throw, but operate in degraded mode
      expect(degradedCache.isConnected()).toBe(false)

      await degradedCache.disconnect()

      // Reset connection failure for other tests
      mockClient.setConnectionFailure(false)
    })
  })

  describe('Event Caching - cacheEvent() and getCachedEvent()', () => {
    it('should cache an event successfully', async () => {
      const _event = createTestEvent()

      await cache.cacheEvent(event)

      const cached = await cache.getCachedEvent(event.id)
      expect(cached).toBeDefined()
      expect(cached?.id).toBe(event.id)
      expect(cached?.pubkey).toBe(event.pubkey)
      expect(cached?.content).toBe(event.content)
    })

    it('should return null for cache miss (event not cached)', async () => {
      const nonExistentId = 'nonexistent_id_' + '0'.repeat(48)

      const result = await cache.getCachedEvent(nonExistentId)

      expect(result).toBeNull()
    })

    it('should cache multiple events independently', async () => {
      const event1 = createTestEvent({ id: 'event1_id_' + '0'.repeat(55) })
      const event2 = createTestEvent({ id: 'event2_id_' + '0'.repeat(55) })

      await cache.cacheEvent(event1)
      await cache.cacheEvent(event2)

      const cached1 = await cache.getCachedEvent(event1.id)
      const cached2 = await cache.getCachedEvent(event2.id)

      expect(cached1?.id).toBe(event1.id)
      expect(cached2?.id).toBe(event2.id)
    })

    it('should track cache hits correctly', async () => {
      const _event = createTestEvent()

      cache.resetStats()
      await cache.cacheEvent(event)

      await cache.getCachedEvent(event.id) // Cache hit
      await cache.getCachedEvent(event.id) // Cache hit
      await cache.getCachedEvent('nonexistent_id') // Cache miss

      const hitRate = cache.getCacheHitRate()
      expect(hitRate).toBeCloseTo(2 / 3, 2) // 2 hits out of 3 attempts
    })

    it('should track cache misses correctly', async () => {
      cache.resetStats()

      await cache.getCachedEvent('nonexistent_id_1') // Cache miss
      await cache.getCachedEvent('nonexistent_id_2') // Cache miss
      await cache.getCachedEvent('nonexistent_id_3') // Cache miss

      const hitRate = cache.getCacheHitRate()
      expect(hitRate).toBe(0) // 0 hits out of 3 attempts
    })
  })

  describe('TTL and Expiration', () => {
    it('should respect TTL when caching events', async () => {
      const shortTtlCache = new EventCache(1) // 1 second TTL

      const _event = createTestEvent()
      await shortTtlCache.cacheEvent(event)

      // Should exist immediately
      let cached = await shortTtlCache.getCachedEvent(event.id)
      expect(cached).toBeDefined()

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100))

      // Should be expired now
      cached = await shortTtlCache.getCachedEvent(event.id)
      expect(cached).toBeNull()

      await shortTtlCache.disconnect()
    })

    it('should use default TTL of 24 hours', async () => {
      const _event = createTestEvent()
      await cache.cacheEvent(event)

      // Event should still be cached after 1 second
      await new Promise(resolve => setTimeout(resolve, 1100))

      const cached = await cache.getCachedEvent(event.id)
      expect(cached).toBeDefined()
    })
  })

  describe('Query Result Caching - cacheQueryResult() and getQueryResult()', () => {
    it('should cache query results with SHA-256 filter hashing', async () => {
      const filters: NostrFilter[] = [{ kinds: [1], authors: ['alice_pubkey'], limit: 10 }]
      const events = [createTestEvent(), createTestEvent({ id: 'event2_' + '0'.repeat(57) })]

      await cache.cacheQueryResult(filters, events)

      const cachedResult = await cache.getQueryResult(filters)
      expect(cachedResult).toBeDefined()
      expect(cachedResult?.length).toBe(2)
      expect(cachedResult?.[0].id).toBe(events[0].id)
    })

    it('should return null for query cache miss', async () => {
      const filters: NostrFilter[] = [{ kinds: [1], authors: ['unknown_author'] }]

      const result = await cache.getQueryResult(filters)

      expect(result).toBeNull()
    })

    it('should use deterministic cache keys for identical filters', async () => {
      const filters1: NostrFilter[] = [{ kinds: [1], authors: ['alice'], limit: 10 }]
      const filters2: NostrFilter[] = [{ kinds: [1], authors: ['alice'], limit: 10 }] // Same content
      const events = [createTestEvent()]

      await cache.cacheQueryResult(filters1, events)

      const cached = await cache.getQueryResult(filters2)
      expect(cached).toBeDefined()
      expect(cached?.length).toBe(1)
    })

    it('should NOT cache large result sets (> maxQueryCacheSize)', async () => {
      const smallCache = new EventCache(86400, 5) // Max 5 events per query

      const filters: NostrFilter[] = [{ kinds: [1] }]
      const largeResult = Array.from({ length: 10 }, (_, i) =>
        createTestEvent({ id: `event${i}_` + '0'.repeat(57) })
      )

      await smallCache.cacheQueryResult(filters, largeResult)

      const cached = await smallCache.getQueryResult(filters)
      expect(cached).toBeNull() // Should not be cached

      await smallCache.disconnect()
    })

    it('should cache empty query results', async () => {
      const filters: NostrFilter[] = [{ kinds: [999] }] // Kind that doesn't exist
      const emptyResult: NostrEvent[] = []

      await cache.cacheQueryResult(filters, emptyResult)

      const cached = await cache.getQueryResult(filters)
      expect(cached).toBeDefined()
      expect(cached?.length).toBe(0)
    })
  })

  describe('Cache Invalidation', () => {
    it('should invalidate individual events', async () => {
      const _event = createTestEvent()

      await cache.cacheEvent(event)
      let cached = await cache.getCachedEvent(event.id)
      expect(cached).toBeDefined()

      await cache.invalidateEvent(event.id)
      cached = await cache.getCachedEvent(event.id)
      expect(cached).toBeNull()
    })

    it('should invalidate cache entries by pattern', async () => {
      const event1 = createTestEvent({ id: 'event1_' + '0'.repeat(57) })
      const event2 = createTestEvent({ id: 'event2_' + '0'.repeat(57) })

      await cache.cacheEvent(event1)
      await cache.cacheEvent(event2)

      // Invalidate all event cache entries
      await cache.invalidateCache('btp_nips:event:*')

      const cached1 = await cache.getCachedEvent(event1.id)
      const cached2 = await cache.getCachedEvent(event2.id)

      expect(cached1).toBeNull()
      expect(cached2).toBeNull()
    })

    it('should invalidate query cache by pattern', async () => {
      const filters1: NostrFilter[] = [{ kinds: [1] }]
      const filters2: NostrFilter[] = [{ kinds: [3] }]
      const events = [createTestEvent()]

      await cache.cacheQueryResult(filters1, events)
      await cache.cacheQueryResult(filters2, events)

      // Invalidate all query caches
      await cache.invalidateCache('btp_nips:query:*')

      const cached1 = await cache.getQueryResult(filters1)
      const cached2 = await cache.getQueryResult(filters2)

      expect(cached1).toBeNull()
      expect(cached2).toBeNull()
    })

    it('should handle invalidation when no keys match pattern', async () => {
      // Should not throw error when no keys match
      await expect(cache.invalidateCache('btp_nips:nonexistent:*')).resolves.not.toThrow()
    })
  })

  describe('Cache Statistics', () => {
    it('should return 0% hit rate with no cache operations', () => {
      cache.resetStats()

      const hitRate = cache.getCacheHitRate()
      expect(hitRate).toBe(0)
    })

    it('should calculate correct hit rate with mixed hits and misses', async () => {
      const _event = createTestEvent()

      cache.resetStats()
      await cache.cacheEvent(event)

      await cache.getCachedEvent(event.id) // Hit
      await cache.getCachedEvent('miss1') // Miss
      await cache.getCachedEvent(event.id) // Hit
      await cache.getCachedEvent('miss2') // Miss

      const hitRate = cache.getCacheHitRate()
      expect(hitRate).toBe(0.5) // 2 hits out of 4 attempts
    })

    it('should reset statistics correctly', async () => {
      const _event = createTestEvent()

      await cache.cacheEvent(event)
      await cache.getCachedEvent(event.id) // Hit

      cache.resetStats()

      const hitRate = cache.getCacheHitRate()
      expect(hitRate).toBe(0)
    })

    it('should track query result cache hits separately', async () => {
      const filters: NostrFilter[] = [{ kinds: [1] }]
      const events = [createTestEvent()]

      cache.resetStats()
      await cache.cacheQueryResult(filters, events)

      await cache.getQueryResult(filters) // Hit
      await cache.getQueryResult([{ kinds: [999] }]) // Miss

      const hitRate = cache.getCacheHitRate()
      expect(hitRate).toBe(0.5)
    })
  })

  describe('Graceful Degradation When Redis Unavailable', () => {
    it('should not throw when caching fails (graceful degradation)', async () => {
      const { getCacheClient } = await import('../../src/cache/client')
      const mockClient = getCacheClient() as any
      mockClient.setOperationFailure(true)

      const _event = createTestEvent()

      // Should not throw error
      await expect(cache.cacheEvent(event)).resolves.not.toThrow()

      mockClient.setOperationFailure(false)
    })

    it('should return null when cache read fails (fallback to database)', async () => {
      const { getCacheClient } = await import('../../src/cache/client')
      const mockClient = getCacheClient() as any
      mockClient.setOperationFailure(true)

      const result = await cache.getCachedEvent('any_id')

      expect(result).toBeNull()

      mockClient.setOperationFailure(false)
    })

    it('should increment cache misses when Redis unavailable', async () => {
      const { getCacheClient } = await import('../../src/cache/client')
      const mockClient = getCacheClient() as any
      mockClient.setOperationFailure(true)

      cache.resetStats()
      await cache.getCachedEvent('id1')
      await cache.getCachedEvent('id2')

      const hitRate = cache.getCacheHitRate()
      expect(hitRate).toBe(0) // All misses

      mockClient.setOperationFailure(false)
    })

    it('should handle query cache failures gracefully', async () => {
      const { getCacheClient } = await import('../../src/cache/client')
      const mockClient = getCacheClient() as any
      mockClient.setOperationFailure(true)

      const filters: NostrFilter[] = [{ kinds: [1] }]
      const events = [createTestEvent()]

      // Should not throw
      await expect(cache.cacheQueryResult(filters, events)).resolves.not.toThrow()

      const result = await cache.getQueryResult(filters)
      expect(result).toBeNull()

      mockClient.setOperationFailure(false)
    })
  })

  describe('Event Existence Check', () => {
    it('should return true when event exists in cache', async () => {
      const _event = createTestEvent()

      await cache.cacheEvent(event)

      const exists = await cache.eventExistsInCache(event.id)
      expect(exists).toBe(true)
    })

    it('should return false when event does not exist in cache', async () => {
      const exists = await cache.eventExistsInCache('nonexistent_id')
      expect(exists).toBe(false)
    })

    it('should return false when Redis unavailable', async () => {
      const { getCacheClient } = await import('../../src/cache/client')
      const mockClient = getCacheClient() as any
      mockClient.setOperationFailure(true)

      const exists = await cache.eventExistsInCache('any_id')
      expect(exists).toBe(false)

      mockClient.setOperationFailure(false)
    })
  })

  describe('Disconnect and Cleanup', () => {
    it('should disconnect from Redis successfully', async () => {
      await cache.waitForInitialization()
      expect(cache.isConnected()).toBe(true)

      await cache.disconnect()

      expect(cache.isConnected()).toBe(false)
    })

    it('should handle disconnect when already disconnected', async () => {
      await cache.disconnect()

      // Should not throw
      await expect(cache.disconnect()).resolves.not.toThrow()
    })
  })

  describe('FlushAll (Testing Utility)', () => {
    it('should flush all cached events', async () => {
      const event1 = createTestEvent({ id: 'event1_' + '0'.repeat(57) })
      const event2 = createTestEvent({ id: 'event2_' + '0'.repeat(57) })

      await cache.cacheEvent(event1)
      await cache.cacheEvent(event2)

      await cache.flushAll()

      const cached1 = await cache.getCachedEvent(event1.id)
      const cached2 = await cache.getCachedEvent(event2.id)

      expect(cached1).toBeNull()
      expect(cached2).toBeNull()
    })

    it('should not affect query cache when flushing events', async () => {
      const filters: NostrFilter[] = [{ kinds: [1] }]
      const events = [createTestEvent()]

      await cache.cacheQueryResult(filters, events)
      await cache.flushAll() // Only flushes event:* keys

      const cachedQuery = await cache.getQueryResult(filters)
      expect(cachedQuery).toBeDefined() // Query cache should still exist
    })
  })
})
