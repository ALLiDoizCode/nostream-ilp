import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DeletionHandler } from '../../src/btp-nips/utils/deletion-handler'
import { EventCache } from '../../src/btp-nips/storage/event-cache'
import { EventRepository } from '../../src/btp-nips/storage/event-repository'
import { getMasterDbClient } from '../../src/database/client'

import type { NostrEvent } from '../../src/btp-nips/types'

/**
 * Unit Tests for BTP-NIPs Deletion Handler (NIP-09)
 *
 * Tests event deletion functionality per NIP-09 specification.
 *
 * @see src/btp-nips/utils/deletion-handler.ts
 * @see Story 5.6 - Task 4
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

/**
 * Create a NIP-09 deletion event
 */
function createDeletionEvent(
  deleterPubkey: string,
  eventIds: string[],
  addressableTags: string[] = []
): NostrEvent {
  const tags: string[][] = [
    ...eventIds.map((id) => ['e', id]),
    ...addressableTags.map((coord) => ['a', coord]),
  ]

  return createTestEvent({
    kind: 5, // NIP-09 deletion event kind
    pubkey: deleterPubkey,
    tags,
    content: '',
  })
}

describe('DeletionHandler', () => {
  let handler: DeletionHandler
  let repository: EventRepository
  let cache: EventCache

  beforeEach(() => {
    repository = new EventRepository()
    cache = new EventCache()
    handler = new DeletionHandler(repository, cache)
  })

  afterEach(async () => {
    // Clean up test data after each test
    await repository.deleteAll()
    await cache.flushAll()
  })

  describe('markEventDeleted', () => {
    it('should mark event as deleted when author requests deletion', async () => {
      const event = createTestEvent()
      await repository.saveEvent(event)

      // Author deletes their own event
      await handler.markEventDeleted(event.id, event.pubkey)

      // Verify event is marked as deleted in database
      const db = getMasterDbClient()
      const row = await db('btp_nips_events').where({ id: event.id }).first()

      expect(row).toBeDefined()
      expect(row.is_deleted).toBe(true)
    })

    it('should throw error if event not found', async () => {
      const nonExistentId = 'nonexistent_event_id' + '0'.repeat(46)

      await expect(
        handler.markEventDeleted(nonExistentId, 'any_pubkey')
      ).rejects.toThrow('Event not found')
    })

    it('should throw error if deleter is not the event author', async () => {
      const event = createTestEvent({ pubkey: 'alice_pubkey' + '0'.repeat(52) })
      await repository.saveEvent(event)

      const differentPubkey = 'bob_pubkey_' + '0'.repeat(53)

      await expect(
        handler.markEventDeleted(event.id, differentPubkey)
      ).rejects.toThrow('Only the event author can delete this event')
    })

    it('should invalidate event cache after deletion', async () => {
      const event = createTestEvent()
      await repository.saveEvent(event)

      // Verify event is cached
      const cachedBefore = await cache.getCachedEvent(event.id)
      expect(cachedBefore).toBeDefined()

      // Delete event
      await handler.markEventDeleted(event.id, event.pubkey)

      // Verify cache invalidation
      const cachedAfter = await cache.getCachedEvent(event.id)
      expect(cachedAfter).toBeNull()
    })
  })

  describe('verifyDeletionRequest', () => {
    it('should process deletion event with e tags', async () => {
      const event1 = createTestEvent({ pubkey: 'alice' + '0'.repeat(59) })
      const event2 = createTestEvent({ pubkey: 'alice' + '0'.repeat(59) })

      await repository.saveEvent(event1)
      await repository.saveEvent(event2)

      // Create deletion event
      const deleteEvent = createDeletionEvent(event1.pubkey, [event1.id, event2.id])

      // Process deletion
      await handler.verifyDeletionRequest(deleteEvent)

      // Verify both events marked as deleted
      const db = getMasterDbClient()
      const rows = await db('btp_nips_events')
        .whereIn('id', [event1.id, event2.id])
        .select('id', 'is_deleted')

      expect(rows).toHaveLength(2)
      expect(rows.every((r) => r.is_deleted === true)).toBe(true)
    })

    it('should throw error if event kind is not 5', async () => {
      const invalidDeleteEvent = createTestEvent({ kind: 1 }) // Not a deletion event

      await expect(handler.verifyDeletionRequest(invalidDeleteEvent)).rejects.toThrow(
        'Invalid deletion event kind: 1, expected 5'
      )
    })

    it('should extract event IDs from e tags', async () => {
      const event = createTestEvent({ pubkey: 'alice' + '0'.repeat(59) })
      await repository.saveEvent(event)

      const deleteEvent = createDeletionEvent(event.pubkey, [event.id])

      // Process deletion
      await handler.verifyDeletionRequest(deleteEvent)

      // Verify event marked as deleted
      const db = getMasterDbClient()
      const row = await db('btp_nips_events').where({ id: event.id }).first()

      expect(row.is_deleted).toBe(true)
    })

    it('should process addressable event deletion with a tags', async () => {
      const pubkey = 'alice_pubkey' + '0'.repeat(52)
      const dIdentifier = 'my-article'

      // Create replaceable event (kind 30023 = long-form content)
      const replaceableEvent = createTestEvent({
        kind: 30023,
        pubkey,
        tags: [['d', dIdentifier]],
      })

      await repository.saveEvent(replaceableEvent)

      // Create deletion event with a tag
      const addressableTag = `30023:${pubkey}:${dIdentifier}`
      const deleteEvent = createDeletionEvent(pubkey, [], [addressableTag])

      // Process deletion
      await handler.verifyDeletionRequest(deleteEvent)

      // Verify event marked as deleted
      const db = getMasterDbClient()
      const row = await db('btp_nips_events')
        .where({ id: replaceableEvent.id })
        .first()

      expect(row.is_deleted).toBe(true)
    })

    it('should handle malformed a tags gracefully', async () => {
      const pubkey = 'alice_pubkey' + '0'.repeat(52)

      // Malformed a tag (missing parts)
      const malformedTag = '30023:alice'
      const deleteEvent = createDeletionEvent(pubkey, [], [malformedTag])

      // Should not throw - graceful degradation (logs and skips)
      await expect(handler.verifyDeletionRequest(deleteEvent)).resolves.toBeUndefined()
    })

    it('should handle invalid kind in a tag', async () => {
      const pubkey = 'alice_pubkey' + '0'.repeat(52)

      // Invalid kind (not a number)
      const invalidTag = 'invalid:alice:article'
      const deleteEvent = createDeletionEvent(pubkey, [], [invalidTag])

      // Should handle gracefully (logs and skips)
      await expect(handler.verifyDeletionRequest(deleteEvent)).resolves.toBeUndefined()
    })

    it('should not delete events if no matching events found', async () => {
      const pubkey = 'alice_pubkey' + '0'.repeat(52)

      // Delete non-existent events
      const deleteEvent = createDeletionEvent(
        pubkey,
        ['nonexistent1' + '0'.repeat(53), 'nonexistent2' + '0'.repeat(53)]
      )

      // Should not throw - graceful degradation
      await handler.verifyDeletionRequest(deleteEvent)

      // No events should be affected
      const db = getMasterDbClient()
      const count = await db('btp_nips_events').where({ is_deleted: true }).count('id as count').first()

      expect(parseInt(count?.count as string)).toBe(0)
    })

    it('should delete multiple replaceable events with same coordinate', async () => {
      const pubkey = 'alice_pubkey' + '0'.repeat(52)
      const dIdentifier = 'my-article'

      // Create two versions of the same replaceable event
      const event1 = createTestEvent({
        kind: 30023,
        pubkey,
        tags: [['d', dIdentifier]],
        created_at: 1000,
      })
      const event2 = createTestEvent({
        kind: 30023,
        pubkey,
        tags: [['d', dIdentifier]],
        created_at: 2000,
      })

      await repository.saveEvent(event1)
      await repository.saveEvent(event2)

      // Delete using addressable coordinate
      const addressableTag = `30023:${pubkey}:${dIdentifier}`
      const deleteEvent = createDeletionEvent(pubkey, [], [addressableTag])

      await handler.verifyDeletionRequest(deleteEvent)

      // Verify both events marked as deleted
      const db = getMasterDbClient()
      const rows = await db('btp_nips_events')
        .whereIn('id', [event1.id, event2.id])
        .select('is_deleted')

      expect(rows).toHaveLength(2)
      expect(rows.every((r) => r.is_deleted === true)).toBe(true)
    })
  })

  describe('cache invalidation', () => {
    it('should invalidate query caches after deletion', async () => {
      const event = createTestEvent()
      await repository.saveEvent(event)

      // Query to populate cache
      await repository.queryEventsByFilters([{ ids: [event.id] }])

      // Delete event
      await handler.markEventDeleted(event.id, event.pubkey)

      // Verify query cache invalidated by querying again
      // (Should not return deleted event)
      const results = await repository.queryEventsByFilters([{ ids: [event.id] }])
      expect(results).toHaveLength(0)
    })
  })
})
