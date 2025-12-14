import { beforeEach, describe, expect, it } from 'vitest'
import { SubscriptionIndex } from '../../src/btp-nips/subscription-index.js'

import type { NostrEvent, NostrFilter } from '../../src/btp-nips/types/index.js'

/**
 * Subscription Index Tests
 * Tests for indexed subscription lookup functionality
 */

describe('SubscriptionIndex', () => {
  let index: SubscriptionIndex

  beforeEach(() => {
    index = new SubscriptionIndex()
  })

  describe('addSubscription', () => {
    it('should index by authors', () => {
      const filters: NostrFilter[] = [
        {
          authors: ['alice', 'bob'],
          kinds: [1],
        },
      ]

      index.addSubscription('sub-1', filters)

      const event1: NostrEvent = {
        id: 'event_id_1',
        pubkey: 'alice',
        created_at: 1640000000,
        kind: 1,
        tags: [],
        content: 'Hello',
        sig: 'sig_1',
      }

      const event2: NostrEvent = {
        id: 'event_id_2',
        pubkey: 'bob',
        created_at: 1640000000,
        kind: 1,
        tags: [],
        content: 'Hello',
        sig: 'sig_2',
      }

      const candidates1 = index.findCandidates(event1)
      const candidates2 = index.findCandidates(event2)

      expect(candidates1.has('sub-1')).toBe(true)
      expect(candidates2.has('sub-1')).toBe(true)
    })

    it('should index by kinds', () => {
      const filters: NostrFilter[] = [
        {
          kinds: [1, 7, 30023],
        },
      ]

      index.addSubscription('sub-1', filters)

      const event: NostrEvent = {
        id: 'event_id',
        pubkey: 'charlie',
        created_at: 1640000000,
        kind: 7, // Reaction
        tags: [],
        content: '+',
        sig: 'sig',
      }

      const candidates = index.findCandidates(event)

      expect(candidates.has('sub-1')).toBe(true)
    })

    it('should index by tags', () => {
      const filters: NostrFilter[] = [
        {
          '#e': ['event_id_123', 'event_id_456'],
          '#p': ['alice_pubkey'],
        },
      ]

      index.addSubscription('sub-1', filters)

      const event: NostrEvent = {
        id: 'event_id',
        pubkey: 'dave',
        created_at: 1640000000,
        kind: 1,
        tags: [
          ['e', 'event_id_123'],
          ['p', 'bob_pubkey'],
        ],
        content: 'Reply',
        sig: 'sig',
      }

      const candidates = index.findCandidates(event)

      expect(candidates.has('sub-1')).toBe(true)
    })

    it('should handle multiple filters per subscription', () => {
      const filters: NostrFilter[] = [
        { authors: ['alice'], kinds: [1] },
        { authors: ['bob'], kinds: [30023] },
      ]

      index.addSubscription('sub-1', filters)

      const aliceEvent: NostrEvent = {
        id: 'event_1',
        pubkey: 'alice',
        created_at: 1640000000,
        kind: 1,
        tags: [],
        content: 'Hello',
        sig: 'sig',
      }

      const bobEvent: NostrEvent = {
        id: 'event_2',
        pubkey: 'bob',
        created_at: 1640000000,
        kind: 30023,
        tags: [],
        content: 'Article',
        sig: 'sig',
      }

      const candidates1 = index.findCandidates(aliceEvent)
      const candidates2 = index.findCandidates(bobEvent)

      expect(candidates1.has('sub-1')).toBe(true)
      expect(candidates2.has('sub-1')).toBe(true)
    })

    it('should handle empty filters', () => {
      const filters: NostrFilter[] = [{}]

      index.addSubscription('sub-1', filters)

      const event: NostrEvent = {
        id: 'event_id',
        pubkey: 'any_pubkey',
        created_at: 1640000000,
        kind: 1,
        tags: [],
        content: 'Content',
        sig: 'sig',
      }

      // Empty filter doesn't add to index, so no candidates
      const candidates = index.findCandidates(event)

      // Empty filter doesn't index anything
      expect(candidates.size).toBe(0)
    })
  })

  describe('removeSubscription', () => {
    it('should remove from all indexes', () => {
      const filters: NostrFilter[] = [
        {
          authors: ['alice'],
          kinds: [1],
          '#e': ['event_id_1'],
        },
      ]

      index.addSubscription('sub-1', filters)
      index.removeSubscription('sub-1', filters)

      const event: NostrEvent = {
        id: 'event_id',
        pubkey: 'alice',
        created_at: 1640000000,
        kind: 1,
        tags: [['e', 'event_id_1']],
        content: 'Hello',
        sig: 'sig',
      }

      const candidates = index.findCandidates(event)

      expect(candidates.size).toBe(0)
    })

    it('should clean up empty sets from Maps', () => {
      const filters: NostrFilter[] = [
        {
          authors: ['alice'],
          kinds: [1],
        },
      ]

      index.addSubscription('sub-1', filters)
      index.removeSubscription('sub-1', filters)

      const stats = index.getStats()

      // All indexes should be empty
      expect(stats.authorIndexSize).toBe(0)
      expect(stats.kindIndexSize).toBe(0)
      expect(stats.tagIndexSize).toBe(0)
    })

    it('should only remove specific subscription ID', () => {
      const filters: NostrFilter[] = [
        {
          authors: ['alice'],
          kinds: [1],
        },
      ]

      index.addSubscription('sub-1', filters)
      index.addSubscription('sub-2', filters)

      index.removeSubscription('sub-1', filters)

      const event: NostrEvent = {
        id: 'event_id',
        pubkey: 'alice',
        created_at: 1640000000,
        kind: 1,
        tags: [],
        content: 'Hello',
        sig: 'sig',
      }

      const candidates = index.findCandidates(event)

      expect(candidates.has('sub-1')).toBe(false)
      expect(candidates.has('sub-2')).toBe(true)
      expect(candidates.size).toBe(1)
    })

    it('should handle removing non-existent subscription', () => {
      const filters: NostrFilter[] = [
        {
          authors: ['alice'],
        },
      ]

      // Removing non-existent subscription should not throw
      expect(() => {
        index.removeSubscription('sub-999', filters)
      }).not.toThrow()
    })
  })

  describe('findCandidates', () => {
    beforeEach(() => {
      // Add test subscriptions
      index.addSubscription('sub-author-alice', [{ authors: ['alice'] }])
      index.addSubscription('sub-kind-1', [{ kinds: [1] }])
      index.addSubscription('sub-kind-7', [{ kinds: [7] }])
      index.addSubscription('sub-tag-e', [{ '#e': ['event_id_123'] }])
      index.addSubscription('sub-tag-p', [{ '#p': ['bob_pubkey'] }])
    })

    it('should find candidates by author', () => {
      const event: NostrEvent = {
        id: 'event_id',
        pubkey: 'alice',
        created_at: 1640000000,
        kind: 999, // Kind not indexed
        tags: [],
        content: 'Hello',
        sig: 'sig',
      }

      const candidates = index.findCandidates(event)

      expect(candidates.has('sub-author-alice')).toBe(true)
      expect(candidates.size).toBe(1)
    })

    it('should find candidates by kind', () => {
      const event: NostrEvent = {
        id: 'event_id',
        pubkey: 'unknown_author',
        created_at: 1640000000,
        kind: 1,
        tags: [],
        content: 'Hello',
        sig: 'sig',
      }

      const candidates = index.findCandidates(event)

      expect(candidates.has('sub-kind-1')).toBe(true)
      expect(candidates.size).toBe(1)
    })

    it('should find candidates by tags', () => {
      const event: NostrEvent = {
        id: 'event_id',
        pubkey: 'unknown_author',
        created_at: 1640000000,
        kind: 999,
        tags: [
          ['e', 'event_id_123'],
          ['p', 'alice_pubkey'], // Not indexed
        ],
        content: 'Reply',
        sig: 'sig',
      }

      const candidates = index.findCandidates(event)

      expect(candidates.has('sub-tag-e')).toBe(true)
      expect(candidates.size).toBe(1)
    })

    it('should return union of all candidates', () => {
      const event: NostrEvent = {
        id: 'event_id',
        pubkey: 'alice', // Matches sub-author-alice
        created_at: 1640000000,
        kind: 1, // Matches sub-kind-1
        tags: [
          ['e', 'event_id_123'], // Matches sub-tag-e
        ],
        content: 'Hello',
        sig: 'sig',
      }

      const candidates = index.findCandidates(event)

      expect(candidates.has('sub-author-alice')).toBe(true)
      expect(candidates.has('sub-kind-1')).toBe(true)
      expect(candidates.has('sub-tag-e')).toBe(true)
      expect(candidates.size).toBe(3)
    })

    it('should return empty set if no candidates', () => {
      const event: NostrEvent = {
        id: 'event_id',
        pubkey: 'unknown_author',
        created_at: 1640000000,
        kind: 999,
        tags: [],
        content: 'Hello',
        sig: 'sig',
      }

      const candidates = index.findCandidates(event)

      expect(candidates.size).toBe(0)
    })

    it('should handle events with multiple tags', () => {
      const event: NostrEvent = {
        id: 'event_id',
        pubkey: 'charlie',
        created_at: 1640000000,
        kind: 999,
        tags: [
          ['e', 'event_id_123'], // Matches sub-tag-e
          ['p', 'bob_pubkey'], // Matches sub-tag-p
          ['t', 'nostr'], // Not indexed
        ],
        content: 'Multi-tag event',
        sig: 'sig',
      }

      const candidates = index.findCandidates(event)

      expect(candidates.has('sub-tag-e')).toBe(true)
      expect(candidates.has('sub-tag-p')).toBe(true)
      expect(candidates.size).toBe(2)
    })
  })

  describe('getStats', () => {
    it('should return index statistics', () => {
      index.addSubscription('sub-1', [
        {
          authors: ['alice', 'bob'],
          kinds: [1, 7],
          '#e': ['event_id_1'],
        },
      ])

      const stats = index.getStats()

      expect(stats.authorIndexSize).toBe(2) // alice, bob
      expect(stats.kindIndexSize).toBe(2) // kind 1, kind 7
      expect(stats.tagIndexSize).toBe(1) // #e:event_id_1
      expect(stats.totalSubscriptionReferences).toBe(5) // 2 authors + 2 kinds + 1 tag
    })

    it('should return zero stats for empty index', () => {
      const stats = index.getStats()

      expect(stats.authorIndexSize).toBe(0)
      expect(stats.kindIndexSize).toBe(0)
      expect(stats.tagIndexSize).toBe(0)
      expect(stats.totalSubscriptionReferences).toBe(0)
    })
  })

  describe('clear', () => {
    it('should clear all indexes', () => {
      index.addSubscription('sub-1', [
        {
          authors: ['alice'],
          kinds: [1],
          '#e': ['event_id_1'],
        },
      ])

      index.clear()

      const stats = index.getStats()

      expect(stats.authorIndexSize).toBe(0)
      expect(stats.kindIndexSize).toBe(0)
      expect(stats.tagIndexSize).toBe(0)
    })
  })
})
