import {
import { describe, expect, it } from 'vitest'

import type { NostrEvent, NostrFilter } from '../../src/btp-nips/types/index'

/**
 * Filter Matcher Unit Tests
 * Tests for Nostr filter matching logic
 *
 * Coverage:
 * - Event matching by author (pubkey)
 * - Event matching by kind
 * - Event matching by timestamp range (since/until)
 * - Event matching by tags (#e, #p, etc.)
 * - Empty filter edge cases
 * - Multiple filters with OR logic
 */

  eventMatchesAnyFilter,
  eventMatchesFilter,
} from '../../src/btp-nips/utils/filter-matcher'
describe('Filter Matcher', () => {
  // Test event fixture
  const testEvent: NostrEvent = {
    id: 'abc123def456',
    pubkey: 'alice_pubkey_64_chars',
    created_at: 1609459200, // 2021-01-01 00:00:00 UTC
    kind: 1, // Short text note
    tags: [
      ['e', 'referenced_event_id'],
      ['p', 'bob_pubkey'],
      ['t', 'nostr'],
    ],
    content: 'Hello, Nostr!',
    sig: 'signature_64_chars',
  }

  describe('eventMatchesFilter', () => {
    it('should match event by author (pubkey)', () => {
      const filter: NostrFilter = {
        authors: ['alice_pubkey_64_chars'],
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })

    it('should not match event with wrong author', () => {
      const filter: NostrFilter = {
        authors: ['bob_pubkey_64_chars'],
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(false)
    })

    it('should match event by kind', () => {
      const filter: NostrFilter = {
        kinds: [1], // Short text note
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })

    it('should not match event with wrong kind', () => {
      const filter: NostrFilter = {
        kinds: [30023], // Long-form content
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(false)
    })

    it('should match event by multiple kinds', () => {
      const filter: NostrFilter = {
        kinds: [1, 3, 7], // Multiple kinds
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })

    it('should match event by timestamp range (since)', () => {
      const filter: NostrFilter = {
        since: 1609459000, // Before event created_at
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })

    it('should not match event before since timestamp', () => {
      const filter: NostrFilter = {
        since: 1609459300, // After event created_at
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(false)
    })

    it('should match event by timestamp range (until)', () => {
      const filter: NostrFilter = {
        until: 1609459300, // After event created_at
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })

    it('should not match event after until timestamp', () => {
      const filter: NostrFilter = {
        until: 1609459100, // Before event created_at
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(false)
    })

    it('should match event within timestamp range (since and until)', () => {
      const filter: NostrFilter = {
        since: 1609459000,
        until: 1609459300,
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })

    it('should match event by tag filter (#e)', () => {
      const filter: NostrFilter = {
        '#e': ['referenced_event_id'],
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })

    it('should match event by tag filter (#p)', () => {
      const filter: NostrFilter = {
        '#p': ['bob_pubkey'],
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })

    it('should match event by tag filter (#t)', () => {
      const filter: NostrFilter = {
        '#t': ['nostr'],
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })

    it('should not match event with wrong tag value', () => {
      const filter: NostrFilter = {
        '#e': ['different_event_id'],
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(false)
    })

    it('should match event by multiple tag values (OR within tag)', () => {
      const filter: NostrFilter = {
        '#p': ['alice_pubkey', 'bob_pubkey', 'charlie_pubkey'],
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })

    it('should match event by event ID', () => {
      const filter: NostrFilter = {
        ids: ['abc123def456'],
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })

    it('should not match event with wrong ID', () => {
      const filter: NostrFilter = {
        ids: ['different_event_id'],
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(false)
    })

    it('should match event by multiple criteria (AND logic)', () => {
      const filter: NostrFilter = {
        authors: ['alice_pubkey_64_chars'],
        kinds: [1],
        since: 1609459000,
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })

    it('should not match if one criterion fails (AND logic)', () => {
      const filter: NostrFilter = {
        authors: ['alice_pubkey_64_chars'], // Match
        kinds: [30023], // NO MATCH
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(false)
    })

    it('should match empty filter (matches all events)', () => {
      const filter: NostrFilter = {}

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })

    it('should match filter with empty arrays (matches all)', () => {
      const filter: NostrFilter = {
        authors: [],
        kinds: [],
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })
  })

  describe('eventMatchesAnyFilter', () => {
    it('should match event against first filter (OR logic)', () => {
      const filters: NostrFilter[] = [
        { authors: ['alice_pubkey_64_chars'], kinds: [1] }, // MATCH
        { authors: ['bob_pubkey'], kinds: [30023] },
      ]

      expect(eventMatchesAnyFilter(testEvent, filters)).toBe(true)
    })

    it('should match event against second filter (OR logic)', () => {
      const filters: NostrFilter[] = [
        { authors: ['bob_pubkey'], kinds: [30023] },
        { authors: ['alice_pubkey_64_chars'], kinds: [1] }, // MATCH
      ]

      expect(eventMatchesAnyFilter(testEvent, filters)).toBe(true)
    })

    it('should not match if no filters match', () => {
      const filters: NostrFilter[] = [
        { authors: ['bob_pubkey'] },
        { kinds: [30023] },
        { since: 1609459300 },
      ]

      expect(eventMatchesAnyFilter(testEvent, filters)).toBe(false)
    })

    it('should return false for empty filter array', () => {
      const filters: NostrFilter[] = []

      expect(eventMatchesAnyFilter(testEvent, filters)).toBe(false)
    })

    it('should match complex filter combination', () => {
      const filters: NostrFilter[] = [
        {
          authors: ['alice_pubkey_64_chars'],
          kinds: [1],
          since: 1609459000,
          '#p': ['bob_pubkey'],
        },
      ]

      expect(eventMatchesAnyFilter(testEvent, filters)).toBe(true)
    })

    it('should handle partial matches across multiple filters', () => {
      // First filter matches author but not kind
      // Second filter matches kind but not author
      // Event should NOT match either filter (AND within filter)
      const filters: NostrFilter[] = [
        { authors: ['alice_pubkey_64_chars'], kinds: [30023] }, // NO MATCH
        { authors: ['bob_pubkey'], kinds: [1] }, // NO MATCH
      ]

      expect(eventMatchesAnyFilter(testEvent, filters)).toBe(false)
    })
  })

  describe('Edge Cases', () => {
    it('should handle event with no tags', () => {
      const eventNoTags: NostrEvent = {
        ...testEvent,
        tags: [],
      }

      const filter: NostrFilter = {
        '#p': ['bob_pubkey'],
      }

      expect(eventMatchesFilter(eventNoTags, filter)).toBe(false)
    })

    it('should handle filter with undefined optional fields', () => {
      const filter: NostrFilter = {
        authors: ['alice_pubkey_64_chars'],
        since: undefined,
        until: undefined,
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })

    it('should match at exact since timestamp (inclusive)', () => {
      const filter: NostrFilter = {
        since: 1609459200, // Exactly equal to created_at
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })

    it('should match at exact until timestamp (inclusive)', () => {
      const filter: NostrFilter = {
        until: 1609459200, // Exactly equal to created_at
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })

    it('should handle tag with no value', () => {
      const eventBadTag: NostrEvent = {
        ...testEvent,
        tags: [['e']], // Tag with no value
      }

      const filter: NostrFilter = {
        '#e': ['some_value'],
      }

      expect(eventMatchesFilter(eventBadTag, filter)).toBe(false)
    })

    it('should match multiple IDs', () => {
      const filter: NostrFilter = {
        ids: ['wrong_id', 'abc123def456', 'another_wrong_id'],
      }

      expect(eventMatchesFilter(testEvent, filter)).toBe(true)
    })
  })
})
