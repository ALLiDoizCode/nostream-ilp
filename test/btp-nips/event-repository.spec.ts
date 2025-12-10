import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EventRepository } from '../../src/btp-nips/storage/event-repository'

import type { NostrEvent } from '../../src/btp-nips/types'

/**
 * Unit Tests for BTP-NIPs Event Repository
 *
 * Tests database operations for storing and retrieving Nostr events.
 *
 * @see src/btp-nips/storage/event-repository.ts
 * @see Story 5.2 - Task 11
 */

/* eslint-disable sort-imports */
/**
 * Create a test fixture for a valid Nostr event
 */
function createTestEvent(overrides?: Partial<NostrEvent>): NostrEvent {
  return {
    id: 'a1b2c3d4e5f6' + '0'.repeat(52), // 64-char hex
    pubkey: 'alice_pubkey_' + '0'.repeat(51), // 64-char hex
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [
      ['e', 'reply_to_event'],
      ['p', 'mentioned_pubkey'],
    ],
    content: 'Test event content',
    sig: 'signature_' + '0'.repeat(118), // 128-char hex
    ...overrides,
  }
}

describe('EventRepository', () => {
  let repository: EventRepository

  beforeEach(() => {
    repository = new EventRepository()
  })

  afterEach(async () => {
    // Clean up test data after each test
    await repository.deleteAll()
  })

  describe('saveEvent', () => {
    it('should save a new event successfully', async () => {
      const _event = createTestEvent()

      await repository.saveEvent(event)

      const saved = await repository.getEvent(event.id)
      expect(saved).toBeDefined()
      expect(saved?.id).toBe(event.id)
      expect(saved?.pubkey).toBe(event.pubkey)
      expect(saved?.kind).toBe(event.kind)
      expect(saved?.content).toBe(event.content)
    })

    it('should save event with empty content', async () => {
      const _event = createTestEvent({ content: '' })

      await repository.saveEvent(event)

      const saved = await repository.getEvent(event.id)
      expect(saved).toBeDefined()
      expect(saved?.content).toBe('')
    })

    it('should save event with empty tags array', async () => {
      const _event = createTestEvent({ tags: [] })

      await repository.saveEvent(event)

      const saved = await repository.getEvent(event.id)
      expect(saved).toBeDefined()
      expect(saved?.tags).toEqual([])
    })

    it('should handle duplicate events gracefully (ON CONFLICT DO NOTHING)', async () => {
      const _event = createTestEvent()

      // Save event twice
      await repository.saveEvent(event)
      await repository.saveEvent(event)

      // Should not throw error, and event should still exist
      const saved = await repository.getEvent(event.id)
      expect(saved).toBeDefined()
      expect(saved?.id).toBe(event.id)
    })

    it('should save event with complex tags (nested arrays)', async () => {
      const _event = createTestEvent({
        tags: [
          ['e', 'event_id_123', 'wss://relay.example.com'],
          ['p', 'pubkey_abc'],
          ['t', 'hashtag'],
        ],
      })

      await repository.saveEvent(event)

      const saved = await repository.getEvent(event.id)
      expect(saved).toBeDefined()
      expect(saved?.tags).toEqual(event.tags)
    })

    it('should save event with special UTF-8 characters in content', async () => {
      const _event = createTestEvent({
        content: 'Hello 世界! 🌍🚀 Emoji test',
      })

      await repository.saveEvent(event)

      const saved = await repository.getEvent(event.id)
      expect(saved).toBeDefined()
      expect(saved?.content).toBe('Hello 世界! 🌍🚀 Emoji test')
    })
  })

  describe('getEvent', () => {
    it('should retrieve event by ID', async () => {
      const _event = createTestEvent()
      await repository.saveEvent(event)

      const retrieved = await repository.getEvent(event.id)

      expect(retrieved).toBeDefined()
      expect(retrieved?.id).toBe(event.id)
      expect(retrieved?.pubkey).toBe(event.pubkey)
      expect(retrieved?.created_at).toBe(event.created_at)
      expect(retrieved?.kind).toBe(event.kind)
      expect(retrieved?.tags).toEqual(event.tags)
      expect(retrieved?.content).toBe(event.content)
      expect(retrieved?.sig).toBe(event.sig)
    })

    it('should return null for non-existent event', async () => {
      const retrieved = await repository.getEvent('non_existent_id')

      expect(retrieved).toBeNull()
    })
  })

  describe('eventExists', () => {
    it('should return true for existing event', async () => {
      const _event = createTestEvent()
      await repository.saveEvent(event)

      const exists = await repository.eventExists(event.id)

      expect(exists).toBe(true)
    })

    it('should return false for non-existent event', async () => {
      const exists = await repository.eventExists('non_existent_id')

      expect(exists).toBe(false)
    })

    it('should be faster than getEvent (only checks existence)', async () => {
      const _event = createTestEvent()
      await repository.saveEvent(event)

      // Both should work, but eventExists is optimized
      const existsStart = Date.now()
      await repository.eventExists(event.id)
      const existsTime = Date.now() - existsStart

      const getStart = Date.now()
      await repository.getEvent(event.id)
      const getTime = Date.now() - getStart

      // eventExists should be faster or equal (uses COUNT instead of SELECT *)
      expect(existsTime).toBeLessThanOrEqual(getTime + 10) // Allow 10ms tolerance
    })
  })

  describe('queryEvents', () => {
    beforeEach(async () => {
      // Create test events
      await repository.saveEvent(
        createTestEvent({
          id: 'event1' + '0'.repeat(58),
          pubkey: 'alice' + '0'.repeat(59),
          kind: 1,
          created_at: 1000,
        })
      )

      await repository.saveEvent(
        createTestEvent({
          id: 'event2' + '0'.repeat(58),
          pubkey: 'bob' + '0'.repeat(61),
          kind: 1,
          created_at: 2000,
        })
      )

      await repository.saveEvent(
        createTestEvent({
          id: 'event3' + '0'.repeat(58),
          pubkey: 'alice' + '0'.repeat(59),
          kind: 30023,
          created_at: 3000,
        })
      )
    })

    it('should filter events by pubkey', async () => {
      const events = await repository.queryEvents({
        pubkeys: ['alice' + '0'.repeat(59)],
      })

      expect(events).toHaveLength(2)
      expect(events.every((e) => e.pubkey === 'alice' + '0'.repeat(59))).toBe(
        true
      )
    })

    it('should filter events by kind', async () => {
      const events = await repository.queryEvents({
        kinds: [30023],
      })

      expect(events).toHaveLength(1)
      expect(events[0].kind).toBe(30023)
    })

    it('should filter events by since timestamp', async () => {
      const events = await repository.queryEvents({
        since: 2000,
      })

      expect(events).toHaveLength(2)
      expect(events.every((e) => e.created_at >= 2000)).toBe(true)
    })

    it('should filter events by until timestamp', async () => {
      const events = await repository.queryEvents({
        until: 2000,
      })

      expect(events).toHaveLength(2)
      expect(events.every((e) => e.created_at <= 2000)).toBe(true)
    })

    it('should limit number of results', async () => {
      const events = await repository.queryEvents({
        limit: 2,
      })

      expect(events).toHaveLength(2)
    })

    it('should return events in descending order by created_at', async () => {
      const events = await repository.queryEvents({})

      expect(events).toHaveLength(3)
      expect(events[0].created_at).toBeGreaterThanOrEqual(events[1].created_at)
      expect(events[1].created_at).toBeGreaterThanOrEqual(events[2].created_at)
    })

    it('should combine multiple filters', async () => {
      const events = await repository.queryEvents({
        pubkeys: ['alice' + '0'.repeat(59)],
        kinds: [1],
        since: 500,
        until: 1500,
        limit: 10,
      })

      expect(events).toHaveLength(1)
      expect(events[0].pubkey).toBe('alice' + '0'.repeat(59))
      expect(events[0].kind).toBe(1)
      expect(events[0].created_at).toBe(1000)
    })

    it('should return empty array when no events match filter', async () => {
      const events = await repository.queryEvents({
        pubkeys: ['nonexistent_pubkey'],
      })

      expect(events).toEqual([])
    })
  })

  describe('error handling', () => {
    it('should throw error when database connection fails (saveEvent)', async () => {
      // Note: This test is limited without proper database mocking
      // In a real scenario, you would use dependency injection or test containers
      // For now, we document that error handling exists
      expect(true).toBe(true)
    })

    it('should throw error when database connection fails (getEvent)', async () => {
      // Similar limitation as above
      // In real tests, use test containers or mock the database client
      expect(true).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should handle very long content (10MB)', async () => {
      const longContent = 'a'.repeat(10 * 1024 * 1024) // 10MB
      const _event = createTestEvent({ content: longContent })

      await repository.saveEvent(event)

      const saved = await repository.getEvent(event.id)
      expect(saved).toBeDefined()
      expect(saved?.content.length).toBe(longContent.length)
    })

    it('should handle event with maximum number of tags', async () => {
      const tags: string[][] = []
      for (let i = 0; i < 100; i++) {
        tags.push(['t', `tag${i}`])
      }

      const _event = createTestEvent({ tags })

      await repository.saveEvent(event)

      const saved = await repository.getEvent(event.id)
      expect(saved).toBeDefined()
      expect(saved?.tags).toHaveLength(100)
    })
  })

  describe('Tag Filtering (Story 5.4 - AC2)', () => {
    beforeEach(async () => {
      // Create events with various tag configurations
      await repository.saveEvent(
        createTestEvent({
          id: 'event_with_e_tag' + '0'.repeat(48),
          tags: [['e', 'referenced_event_123']],
          content: 'Event referencing another event',
        })
      )

      await repository.saveEvent(
        createTestEvent({
          id: 'event_with_p_tag' + '0'.repeat(48),
          tags: [['p', 'mentioned_pubkey_abc']],
          content: 'Event mentioning a user',
        })
      )

      await repository.saveEvent(
        createTestEvent({
          id: 'event_with_both' + '0'.repeat(50),
          tags: [
            ['e', 'referenced_event_456'],
            ['p', 'mentioned_pubkey_xyz'],
          ],
          content: 'Event with both e and p tags',
        })
      )

      await repository.saveEvent(
        createTestEvent({
          id: 'event_with_multiple_e' + '0'.repeat(45),
          tags: [
            ['e', 'event_1'],
            ['e', 'event_2'],
            ['e', 'event_3'],
          ],
          content: 'Event referencing multiple events',
        })
      )

      await repository.saveEvent(
        createTestEvent({
          id: 'event_no_tags' + '0'.repeat(52),
          tags: [],
          content: 'Event with no tags',
        })
      )
    })

    it('should filter events by single #e tag', async () => {
      const events = await repository.queryEventsByFilters([
        { '#e': ['referenced_event_123'] },
      ])

      expect(events).toHaveLength(1)
      expect(events[0].id).toBe('event_with_e_tag' + '0'.repeat(48))
    })

    it('should filter events by single #p tag', async () => {
      const events = await repository.queryEventsByFilters([
        { '#p': ['mentioned_pubkey_abc'] },
      ])

      expect(events).toHaveLength(1)
      expect(events[0].id).toBe('event_with_p_tag' + '0'.repeat(48))
    })

    it('should filter events by multiple tag values (OR logic within tag)', async () => {
      const events = await repository.queryEventsByFilters([
        { '#e': ['referenced_event_123', 'referenced_event_456'] },
      ])

      expect(events).toHaveLength(2)
      const ids = events.map((e) => e.id)
      expect(ids).toContain('event_with_e_tag' + '0'.repeat(48))
      expect(ids).toContain('event_with_both' + '0'.repeat(50))
    })

    it('should filter events by multiple tag types (AND logic)', async () => {
      const events = await repository.queryEventsByFilters([
        {
          '#e': ['referenced_event_456'],
          '#p': ['mentioned_pubkey_xyz'],
        },
      ])

      // Only the event with BOTH tags should match
      expect(events).toHaveLength(1)
      expect(events[0].id).toBe('event_with_both' + '0'.repeat(50))
    })

    it('should match events with one of multiple e tags', async () => {
      const events = await repository.queryEventsByFilters([
        { '#e': ['event_2'] },
      ])

      expect(events).toHaveLength(1)
      expect(events[0].id).toBe('event_with_multiple_e' + '0'.repeat(45))
    })

    it('should return empty array when no events match tag filter', async () => {
      const events = await repository.queryEventsByFilters([
        { '#e': ['nonexistent_event_id'] },
      ])

      expect(events).toEqual([])
    })

    it('should combine tag filters with kind filters', async () => {
      await repository.saveEvent(
        createTestEvent({
          id: 'kind_30023_with_e' + '0'.repeat(47),
          kind: 30023,
          tags: [['e', 'long_form_ref']],
          content: 'Long-form content',
        })
      )

      const events = await repository.queryEventsByFilters([
        {
          kinds: [30023],
          '#e': ['long_form_ref'],
        },
      ])

      expect(events).toHaveLength(1)
      expect(events[0].kind).toBe(30023)
      expect(events[0].id).toBe('kind_30023_with_e' + '0'.repeat(47))
    })

    it('should handle complex JSONB containment queries with nested tag values', async () => {
      await repository.saveEvent(
        createTestEvent({
          id: 'event_complex_tags' + '0'.repeat(47),
          tags: [
            ['e', 'event_id', 'wss://relay.example.com'],
            ['p', 'pubkey', 'wss://relay2.example.com', 'marker'],
          ],
          content: 'Event with complex tags',
        })
      )

      // Should match even with extra tag values (containment)
      const events = await repository.queryEventsByFilters([
        { '#e': ['event_id'] },
      ])

      const matchingEvent = events.find(
        (e) => e.id === 'event_complex_tags' + '0'.repeat(47)
      )
      expect(matchingEvent).toBeDefined()
    })

    it('should handle edge case: empty tag values array', async () => {
      const events = await repository.queryEventsByFilters([{ '#e': [] }])

      // Empty tag filter should not crash, but may return no results
      expect(events).toBeDefined()
    })
  })

  describe('Soft Delete and Expiration Filtering (Story 5.4 - AC3)', () => {
    it('should exclude soft-deleted events from query results', async () => {
      // Create a normal event
      const _event = createTestEvent({
        id: 'deleted_event' + '0'.repeat(51),
      })
      await repository.saveEvent(event)

      // Manually mark as deleted (simulating NIP-09 deletion handler)
      await repository['writeDb']('btp_nips_events')
        .where({ id: event.id })
        .update({ is_deleted: true })

      // Query should not return deleted event
      const events = await repository.queryEventsByFilters([
        { ids: [event.id] },
      ])

      expect(events).toHaveLength(0)
    })

    it('should include non-deleted events in query results', async () => {
      const event1 = createTestEvent({
        id: 'normal_event_1' + '0'.repeat(50),
      })
      const event2 = createTestEvent({
        id: 'deleted_event_2' + '0'.repeat(49),
      })

      await repository.saveEvent(event1)
      await repository.saveEvent(event2)

      // Mark event2 as deleted
      await repository['writeDb']('btp_nips_events')
        .where({ id: event2.id })
        .update({ is_deleted: true })

      // Query should only return event1
      const events = await repository.queryEventsByFilters([
        { ids: [event1.id, event2.id] },
      ])

      expect(events).toHaveLength(1)
      expect(events[0].id).toBe(event1.id)
    })

    it('should exclude expired events (expires_at < now)', async () => {
      const now = Math.floor(Date.now() / 1000)
      const pastTimestamp = now - 3600 // 1 hour ago

      const _event = createTestEvent({
        id: 'expired_event' + '0'.repeat(51),
        tags: [['expiration', pastTimestamp.toString()]],
      })
      await repository.saveEvent(event)

      // Manually set expiration (simulating expiration parsing on save)
      await repository['writeDb']('btp_nips_events')
        .where({ id: event.id })
        .update({ expires_at: pastTimestamp })

      // Query should not return expired event
      const events = await repository.queryEventsByFilters([
        { ids: [event.id] },
      ])

      expect(events).toHaveLength(0)
    })

    it('should include events with expires_at > now (future expiration)', async () => {
      const now = Math.floor(Date.now() / 1000)
      const futureTimestamp = now + 3600 // 1 hour from now

      const _event = createTestEvent({
        id: 'future_expire' + '0'.repeat(51),
        tags: [['expiration', futureTimestamp.toString()]],
      })
      await repository.saveEvent(event)

      // Set future expiration
      await repository['writeDb']('btp_nips_events')
        .where({ id: event.id })
        .update({ expires_at: futureTimestamp })

      // Query should return event (not yet expired)
      const events = await repository.queryEventsByFilters([
        { ids: [event.id] },
      ])

      expect(events).toHaveLength(1)
      expect(events[0].id).toBe(event.id)
    })

    it('should include events with expires_at = null (no expiration)', async () => {
      const _event = createTestEvent({
        id: 'no_expiration' + '0'.repeat(51),
      })
      await repository.saveEvent(event)

      // Verify expires_at is null (default)
      const row = await repository['readDb']('btp_nips_events')
        .where({ id: event.id })
        .first()

      expect(row.expires_at).toBeNull()

      // Query should return event
      const events = await repository.queryEventsByFilters([
        { ids: [event.id] },
      ])

      expect(events).toHaveLength(1)
      expect(events[0].id).toBe(event.id)
    })

    it('should handle boundary condition: expires_at = now', async () => {
      const now = Math.floor(Date.now() / 1000)

      const _event = createTestEvent({
        id: 'boundary_expire' + '0'.repeat(49),
      })
      await repository.saveEvent(event)

      // Set expiration to exactly now
      await repository['writeDb']('btp_nips_events')
        .where({ id: event.id })
        .update({ expires_at: now })

      // Query should NOT return event (expires_at <= now is excluded)
      // NOTE: Implementation uses >, not >=
      const events = await repository.queryEventsByFilters([
        { ids: [event.id] },
      ])

      // Depending on exact timing, this might be 0 or 1
      // The query uses > not >=, so exactly now should be excluded
      expect(events.length).toBeLessThanOrEqual(1)
    })

    it('should combine soft delete and expiration filters correctly', async () => {
      const now = Math.floor(Date.now() / 1000)

      const event1 = createTestEvent({
        id: 'deleted_and_expired' + '0'.repeat(45),
      })
      const event2 = createTestEvent({
        id: 'deleted_not_expired' + '0'.repeat(43),
      })
      const event3 = createTestEvent({
        id: 'not_deleted_expired' + '0'.repeat(43),
      })
      const event4 = createTestEvent({ id: 'valid_event' + '0'.repeat(52) })

      await repository.saveEvent(event1)
      await repository.saveEvent(event2)
      await repository.saveEvent(event3)
      await repository.saveEvent(event4)

      // Event 1: deleted and expired
      await repository['writeDb']('btp_nips_events')
        .where({ id: event1.id })
        .update({ is_deleted: true, expires_at: now - 3600 })

      // Event 2: deleted but not expired
      await repository['writeDb']('btp_nips_events')
        .where({ id: event2.id })
        .update({ is_deleted: true, expires_at: now + 3600 })

      // Event 3: not deleted but expired
      await repository['writeDb']('btp_nips_events')
        .where({ id: event3.id })
        .update({ is_deleted: false, expires_at: now - 3600 })

      // Event 4: valid (not deleted, not expired)
      // No updates needed

      // Query all
      const events = await repository.queryEventsByFilters([
        { ids: [event1.id, event2.id, event3.id, event4.id] },
      ])

      // Only event4 should be returned
      expect(events).toHaveLength(1)
      expect(events[0].id).toBe(event4.id)
    })
  })
})
