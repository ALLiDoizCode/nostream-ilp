import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventRepository } from '../../src/btp-nips/storage/event-repository'
import { ExpirationCleanupService } from '../../src/btp-nips/storage/expiration-cleanup'
import { getMasterDbClient } from '../../src/database/client'

import type { NostrEvent } from '../../src/btp-nips/types'

/**
 * Unit Tests for BTP-NIPs Event Expiration (NIP-40)
 *
 * Tests event expiration functionality per NIP-40 specification.
 *
 * @see src/btp-nips/storage/event-repository.ts
 * @see src/btp-nips/storage/expiration-cleanup.ts
 * @see Story 5.6 - Task 5
 */

/* eslint-disable sort-imports */
/**
 * Create a test fixture for a valid Nostr event
 */
function createTestEvent(overrides?: Partial<NostrEvent>): NostrEvent {
  return {
    id: 'event_' + Math.random().toString(36).substring(2, 15) + '0'.repeat(50),
    pubkey: 'alice_pubkey_' + '0'.repeat(51),
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: 'Test event content',
    sig: 'signature_' + '0'.repeat(118),
    ...overrides,
  }
}

describe('Event Expiration (NIP-40)', () => {
  let repository: EventRepository

  beforeEach(() => {
    repository = new EventRepository()
  })

  afterEach(async () => {
    // Clean up test data and reset time mocking
    await repository.deleteAll()
    vi.useRealTimers()
  })

  describe('EventRepository - Expiration Tag Extraction', () => {
    it('should extract expiration tag from event and store in database', async () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      const event = createTestEvent({
        tags: [['expiration', futureTimestamp.toString()]],
      })

      await repository.saveEvent(event)

      // Verify expires_at stored in database
      const db = getMasterDbClient()
      const row = await db('btp_nips_events').where({ id: event.id }).first()

      expect(row).toBeDefined()
      expect(row.expires_at).toBe(futureTimestamp)
    })

    it('should accept events with future expiration timestamp', async () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400 // 24 hours from now
      const event = createTestEvent({
        tags: [['expiration', futureTimestamp.toString()]],
      })

      // Should not throw
      await expect(repository.saveEvent(event)).resolves.toBeUndefined()
    })

    it('should reject events with pre-expired timestamp', async () => {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
      const event = createTestEvent({
        tags: [['expiration', pastTimestamp.toString()]],
      })

      await expect(repository.saveEvent(event)).rejects.toThrow(
        'Event is already expired (NIP-40)'
      )
    })

    it('should store expires_at as null for events without expiration tag', async () => {
      const event = createTestEvent({
        tags: [], // No expiration tag
      })

      await repository.saveEvent(event)

      const db = getMasterDbClient()
      const row = await db('btp_nips_events').where({ id: event.id }).first()

      expect(row).toBeDefined()
      expect(row.expires_at).toBeNull()
    })

    it('should reject events with invalid expiration timestamp', async () => {
      const event = createTestEvent({
        tags: [['expiration', 'not_a_number']],
      })

      await expect(repository.saveEvent(event)).rejects.toThrow(
        'Invalid expiration timestamp (NIP-40)'
      )
    })

    it('should handle expiration tag with empty value', async () => {
      const event = createTestEvent({
        tags: [['expiration', '']], // Empty value
      })

      // Should save without expiration (empty string is falsy)
      await repository.saveEvent(event)

      const db = getMasterDbClient()
      const row = await db('btp_nips_events').where({ id: event.id }).first()

      expect(row.expires_at).toBeNull()
    })
  })

  describe('ExpirationCleanupService', () => {
    let cleanupService: ExpirationCleanupService

    beforeEach(() => {
      cleanupService = new ExpirationCleanupService()
    })

    afterEach(() => {
      cleanupService.stop()
    })

    it('should delete events where expires_at < current_time', async () => {
      vi.useFakeTimers()

      const now = Date.now()
      vi.setSystemTime(now)

      // Create expired event (expired 1 hour ago)
      const expiredTimestamp = Math.floor(now / 1000) - 3600
      const expiredEvent = createTestEvent({
        tags: [['expiration', expiredTimestamp.toString()]],
      })

      // Manually insert to bypass validation
      const db = getMasterDbClient()
      await db('btp_nips_events').insert({
        id: expiredEvent.id,
        pubkey: expiredEvent.pubkey,
        created_at: expiredEvent.created_at,
        kind: expiredEvent.kind,
        tags: JSON.stringify(expiredEvent.tags),
        content: expiredEvent.content,
        sig: expiredEvent.sig,
        expires_at: expiredTimestamp,
        is_deleted: false,
      })

      // Run cleanup
      const deletedCount = await cleanupService.cleanup()

      expect(deletedCount).toBe(1)

      // Verify event deleted
      const row = await db('btp_nips_events').where({ id: expiredEvent.id }).first()
      expect(row).toBeUndefined()
    })

    it('should not delete events with future expiration', async () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      const event = createTestEvent({
        tags: [['expiration', futureTimestamp.toString()]],
      })

      await repository.saveEvent(event)

      // Run cleanup
      const deletedCount = await cleanupService.cleanup()

      expect(deletedCount).toBe(0)

      // Verify event still exists
      const saved = await repository.getEvent(event.id)
      expect(saved).toBeDefined()
    })

    it('should not delete events without expiration (expires_at = null)', async () => {
      const event = createTestEvent({
        tags: [], // No expiration
      })

      await repository.saveEvent(event)

      // Run cleanup
      const deletedCount = await cleanupService.cleanup()

      expect(deletedCount).toBe(0)

      // Verify event still exists
      const saved = await repository.getEvent(event.id)
      expect(saved).toBeDefined()
    })

    it('should delete multiple expired events', async () => {
      vi.useFakeTimers()

      const now = Date.now()
      vi.setSystemTime(now)

      const expiredTimestamp = Math.floor(now / 1000) - 3600

      // Create 3 expired events
      const db = getMasterDbClient()

      for (let i = 0; i < 3; i++) {
        const event = createTestEvent()
        await db('btp_nips_events').insert({
          id: event.id,
          pubkey: event.pubkey,
          created_at: event.created_at,
          kind: event.kind,
          tags: JSON.stringify([['expiration', expiredTimestamp.toString()]]),
          content: event.content,
          sig: event.sig,
          expires_at: expiredTimestamp,
          is_deleted: false,
        })
      }

      // Run cleanup
      const deletedCount = await cleanupService.cleanup()

      expect(deletedCount).toBe(3)
    })

    it('should return 0 when no expired events exist', async () => {
      // No events in database

      const deletedCount = await cleanupService.cleanup()

      expect(deletedCount).toBe(0)
    })

    it('should start and stop cleanup service', () => {
      expect(cleanupService.isActive()).toBe(false)

      cleanupService.start()
      expect(cleanupService.isActive()).toBe(true)

      cleanupService.stop()
      expect(cleanupService.isActive()).toBe(false)
    })

    it('should not start service twice', () => {
      cleanupService.start()
      const firstActive = cleanupService.isActive()

      // Attempt to start again
      cleanupService.start()
      const secondActive = cleanupService.isActive()

      expect(firstActive).toBe(true)
      expect(secondActive).toBe(true)

      cleanupService.stop()
    })
  })

  describe('Query Exclusion of Expired Events', () => {
    it('should exclude expired events from query results', async () => {
      vi.useFakeTimers()

      const now = Date.now()
      vi.setSystemTime(now)

      const currentTimestamp = Math.floor(now / 1000)

      // Create event that will expire in 1 second
      const event = createTestEvent({
        tags: [['expiration', (currentTimestamp + 1).toString()]],
      })

      await repository.saveEvent(event)

      // Verify event exists before expiration
      const resultsBefore = await repository.queryEventsByFilters([{ ids: [event.id] }])
      expect(resultsBefore).toHaveLength(1)

      // Fast-forward time by 2 seconds (past expiration)
      vi.setSystemTime(now + 2000)

      // Query again - should exclude expired event
      const resultsAfter = await repository.queryEventsByFilters([{ ids: [event.id] }])
      expect(resultsAfter).toHaveLength(0)
    })

    it('should include events with null expires_at in query results', async () => {
      const event = createTestEvent({
        tags: [], // No expiration
      })

      await repository.saveEvent(event)

      const results = await repository.queryEventsByFilters([{ ids: [event.id] }])
      expect(results).toHaveLength(1)
    })

    it('should include events with future expires_at in query results', async () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400
      const event = createTestEvent({
        tags: [['expiration', futureTimestamp.toString()]],
      })

      await repository.saveEvent(event)

      const results = await repository.queryEventsByFilters([{ ids: [event.id] }])
      expect(results).toHaveLength(1)
    })
  })
})
