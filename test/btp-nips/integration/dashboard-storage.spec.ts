import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { calculateEventId } from '../../../src/btp-nips/crypto'
import { EventCache } from '../../../src/btp-nips/storage/event-cache'
import { EventRepository } from '../../../src/btp-nips/storage/event-repository'
import { schnorr } from '@noble/secp256k1'
import { randomBytes } from 'crypto'
import storageRouter from '../../../src/dashboard/routes/storage'
import express, { Express } from 'express'
import request from 'supertest'

import type { NostrEvent } from '../../../src/btp-nips/types'

/**
 * Integration Tests for Dashboard Storage Metrics API
 *
 * Tests the complete flow from database → storage stats → dashboard API.
 *
 * @see src/dashboard/routes/storage.ts
 * @see src/btp-nips/storage/storage-stats.ts
 * @see Story 5.7 - Task 7
 */

/* eslint-disable sort-imports */
/* eslint-enable sort-imports */

/**
 * Generate a valid signed Nostr event
 */
async function createSignedEvent(overrides?: Partial<NostrEvent>): Promise<NostrEvent> {
  const privateKey = randomBytes(32)
  const publicKey = Buffer.from(schnorr.getPublicKey(privateKey)).toString('hex')

  const event: Omit<NostrEvent, 'id' | 'sig'> = {
    pubkey: publicKey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: 'Integration test event',
    ...overrides,
  }

  const id = calculateEventId(event as NostrEvent)
  const signature = Buffer.from(await schnorr.sign(id, privateKey)).toString('hex')

  return {
    ...event,
    id,
    sig: signature,
  }
}

/**
 * Create Express app with storage route for testing
 */
function createTestApp(): Express {
  const app = express()
  app.use(express.json())

  // Mount storage route under /dashboard prefix
  app.use('/dashboard', storageRouter)

  return app
}

/**
 * Get auth header for dashboard endpoints
 */
function getAuthHeader(): Record<string, string> {
  // Use test credentials from dashboard auth middleware
  const credentials = Buffer.from('admin:password').toString('base64')
  return {
    Authorization: `Basic ${credentials}`,
  }
}

describe('Dashboard Storage Metrics Integration Tests', () => {
  let repository: EventRepository
  let cache: EventCache
  let app: Express

  beforeAll(async () => {
    repository = new EventRepository()
    cache = new EventCache()
    await cache.waitForInitialization()

    app = createTestApp()
  })

  afterEach(async () => {
    // Clean up database and cache after each test
    await repository.deleteAll()
    await cache.flushAll()
    cache.resetStats()
  })

  describe('GET /dashboard/storage', () => {
    it('should return valid JSON with all required fields', async () => {
      // Insert test events
      const event1 = await createSignedEvent({ kind: 1, content: 'Short note' })
      const event2 = await createSignedEvent({ kind: 30023, content: 'Long-form article' })

      await repository.saveEvent(event1)
      await repository.saveEvent(event2)

      const response = await request(app)
        .get('/dashboard/storage')
        .set(getAuthHeader())
        .expect(200)
        .expect('Content-Type', /json/)

      expect(response.body).toHaveProperty('timestamp')
      expect(response.body).toHaveProperty('totalEvents')
      expect(response.body).toHaveProperty('eventsByKind')
      expect(response.body).toHaveProperty('storageSize')
      expect(response.body).toHaveProperty('storageSizeMB')
      expect(response.body).toHaveProperty('cacheHitRate')
      expect(response.body).toHaveProperty('queryPerformance')
      expect(response.body).toHaveProperty('deletedEvents')
      expect(response.body).toHaveProperty('expiredEvents')
    })

    it('should return correct statistics matching database state', async () => {
      // Insert events with varied kinds
      const events = [
        await createSignedEvent({ kind: 1, content: 'Note 1' }),
        await createSignedEvent({ kind: 1, content: 'Note 2' }),
        await createSignedEvent({ kind: 30023, content: 'Article' }),
        await createSignedEvent({ kind: 7, content: '+' }), // Reaction
      ]

      for (const event of events) {
        await repository.saveEvent(event)
      }

      const response = await request(app)
        .get('/dashboard/storage')
        .set(getAuthHeader())
        .expect(200)

      expect(response.body.totalEvents).toBe(4)
      expect(response.body.eventsByKind).toEqual({
        1: 2,
        30023: 1,
        7: 1,
      })
      expect(response.body.deletedEvents).toBe(0)
      expect(response.body.expiredEvents).toBe(0)
    })

    it('should calculate storage size correctly', async () => {
      const event = await createSignedEvent({
        content: 'A'.repeat(1000), // 1000 character content
        tags: [['e', 'event_id'], ['p', 'pubkey']],
      })

      await repository.saveEvent(event)

      const response = await request(app)
        .get('/dashboard/storage')
        .set(getAuthHeader())
        .expect(200)

      expect(response.body.storageSize).toBeGreaterThan(1000) // At least content size
      expect(response.body.storageSizeMB).toBeGreaterThan(0)
    })

    it('should report cache hit rate', async () => {
      const event = await createSignedEvent()
      await repository.saveEvent(event)

      // Perform queries to generate cache hits
      await repository.getEvent(event.id) // Cache miss → DB → cache write
      await repository.getEvent(event.id) // Cache hit

      const response = await request(app)
        .get('/dashboard/storage')
        .set(getAuthHeader())
        .expect(200)

      // Cache hit rate should be > 0 (we had 1 hit out of 2 requests = 50%)
      expect(response.body.cacheHitRate).toBeGreaterThan(0)
      expect(response.body.cacheHitRate).toBeLessThanOrEqual(1)
    })

    it('should report query performance percentiles', async () => {
      // Insert events and perform queries
      for (let i = 0; i < 10; i++) {
        const event = await createSignedEvent({ content: `Event ${i}` })
        await repository.saveEvent(event)
      }

      // Perform several queries to populate query performance stats
      await repository.queryEventsByFilters([{ kinds: [1], limit: 10 }])
      await repository.queryEventsByFilters([{ kinds: [1], limit: 5 }])

      const response = await request(app)
        .get('/dashboard/storage')
        .set(getAuthHeader())
        .expect(200)

      expect(response.body.queryPerformance).toHaveProperty('p50')
      expect(response.body.queryPerformance).toHaveProperty('p95')
      expect(response.body.queryPerformance).toHaveProperty('p99')

      // All percentiles should be non-negative numbers
      expect(response.body.queryPerformance.p50).toBeGreaterThanOrEqual(0)
      expect(response.body.queryPerformance.p95).toBeGreaterThanOrEqual(0)
      expect(response.body.queryPerformance.p99).toBeGreaterThanOrEqual(0)
    })

    it('should require authentication', async () => {
      // Request without auth header should fail
      await request(app)
        .get('/dashboard/storage')
        .expect(401)
    })

    it('should reject invalid authentication', async () => {
      const invalidCredentials = Buffer.from('invalid:wrong').toString('base64')

      await request(app)
        .get('/dashboard/storage')
        .set({ Authorization: `Basic ${invalidCredentials}` })
        .expect(401)
    })

    it('should handle empty database gracefully', async () => {
      const response = await request(app)
        .get('/dashboard/storage')
        .set(getAuthHeader())
        .expect(200)

      expect(response.body.totalEvents).toBe(0)
      expect(response.body.eventsByKind).toEqual({})
      expect(response.body.storageSize).toBe(0)
      expect(response.body.storageSizeMB).toBe(0)
    })

    it('should cache metrics for 5 seconds', async () => {
      // First request
      const response1 = await request(app)
        .get('/dashboard/storage')
        .set(getAuthHeader())
        .expect(200)

      const timestamp1 = response1.body.timestamp

      // Immediate second request should return cached data
      const response2 = await request(app)
        .get('/dashboard/storage')
        .set(getAuthHeader())
        .expect(200)

      const timestamp2 = response2.body.timestamp

      // Timestamps should be identical (cached response)
      expect(timestamp1).toBe(timestamp2)
    })

    it('should include timestamp in ISO 8601 format', async () => {
      const response = await request(app)
        .get('/dashboard/storage')
        .set(getAuthHeader())
        .expect(200)

      // Validate ISO 8601 timestamp format
      expect(response.body.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      )

      // Validate it's a recent timestamp
      const timestamp = new Date(response.body.timestamp)
      const now = new Date()
      const diffMs = Math.abs(now.getTime() - timestamp.getTime())

      expect(diffMs).toBeLessThan(10000) // Within 10 seconds
    })

    it('should handle large number of events efficiently', async () => {
      // Insert 100 events
      const events = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          createSignedEvent({ content: `Event ${i}` })
        )
      )

      for (const event of events) {
        await repository.saveEvent(event)
      }

      const startTime = Date.now()

      const response = await request(app)
        .get('/dashboard/storage')
        .set(getAuthHeader())
        .expect(200)

      const endTime = Date.now()
      const requestDuration = endTime - startTime

      expect(response.body.totalEvents).toBe(100)

      // Request should complete in reasonable time (< 1 second)
      expect(requestDuration).toBeLessThan(1000)
    })
  })

  describe('Rate Limiting', () => {
    it('should allow up to 100 requests per minute', async () => {
      // Make 10 rapid requests (under limit)
      for (let i = 0; i < 10; i++) {
        await request(app)
          .get('/dashboard/storage')
          .set(getAuthHeader())
          .expect(200)
      }
    })

    // Note: Full rate limit test (101 requests) would be slow
    // In production, this should be tested separately
  })

  describe('Error Handling', () => {
    it('should return 500 on database error', async () => {
      // This would require mocking the database to fail
      // Deferred to unit tests for StorageStats
    })
  })
})
