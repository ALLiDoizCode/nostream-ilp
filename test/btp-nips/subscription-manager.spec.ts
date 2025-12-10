import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type StreamConnection,
  type Subscription,
  SubscriptionExpiryActor,
  SubscriptionManager,
} from '../../src/btp-nips/subscription-manager'

import type { NostrEvent } from '../../src/btp-nips/types/index'

/**
 * Subscription Manager Unit Tests
 * Tests for subscription lifecycle management
 *
 * Coverage:
 * - Add subscription successfully
 * - Remove subscription by ID
 * - Get subscription by ID
 * - Get all active subscriptions
 * - Find matching subscriptions for events
 * - Subscription expiry handling
 * - Multiple subscriptions from same peer
 */

// Mock StreamConnection for testing
function createMockStreamConnection(): StreamConnection {
  return {
    sendPacket: vi.fn().mockResolvedValue(undefined),
    fulfillPacket: vi.fn().mockResolvedValue(undefined),
    rejectPacket: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

describe('SubscriptionManager', () => {
  let manager: SubscriptionManager

  beforeEach(() => {
    manager = new SubscriptionManager()
  })

  describe('addSubscription', () => {
    it('should add subscription successfully', () => {
      const subscription: Subscription = {
        id: 'sub-123',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [1] }],
        expiresAt: Date.now() + 3600000, // 1 hour
        active: true,
      }

      manager.addSubscription(subscription)

      const retrieved = manager.getSubscription('sub-123')
      expect(retrieved).toEqual(subscription)
    })

    it('should throw error if subscription ID already exists', () => {
      const subscription: Subscription = {
        id: 'sub-123',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [1] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      }

      manager.addSubscription(subscription)

      expect(() => manager.addSubscription(subscription)).toThrow(
        'Subscription already exists: sub-123'
      )
    })
  })

  describe('removeSubscription', () => {
    it('should remove subscription by ID', () => {
      const subscription: Subscription = {
        id: 'sub-123',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [1] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      }

      manager.addSubscription(subscription)
      const removed = manager.removeSubscription('sub-123')

      expect(removed).toBe(true)
      expect(manager.getSubscription('sub-123')).toBeNull()
    })

    it('should return false if subscription not found', () => {
      const removed = manager.removeSubscription('nonexistent')

      expect(removed).toBe(false)
    })
  })

  describe('getSubscription', () => {
    it('should return subscription by ID', () => {
      const subscription: Subscription = {
        id: 'sub-123',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [1] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      }

      manager.addSubscription(subscription)

      const retrieved = manager.getSubscription('sub-123')
      expect(retrieved).toEqual(subscription)
    })

    it('should return null if subscription not found', () => {
      const retrieved = manager.getSubscription('nonexistent')

      expect(retrieved).toBeNull()
    })
  })

  describe('getActiveSubscriptions', () => {
    it('should return all active non-expired subscriptions', () => {
      const sub1: Subscription = {
        id: 'sub-1',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [1] }],
        expiresAt: Date.now() + 3600000, // Active
        active: true,
      }

      const sub2: Subscription = {
        id: 'sub-2',
        subscriber: 'g.dassie.bob',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [30023] }],
        expiresAt: Date.now() + 7200000, // Active
        active: true,
      }

      manager.addSubscription(sub1)
      manager.addSubscription(sub2)

      const active = manager.getActiveSubscriptions()

      expect(active).toHaveLength(2)
      expect(active).toContain(sub1)
      expect(active).toContain(sub2)
    })

    it('should exclude inactive subscriptions', () => {
      const sub1: Subscription = {
        id: 'sub-1',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [1] }],
        expiresAt: Date.now() + 3600000,
        active: true, // Active
      }

      const sub2: Subscription = {
        id: 'sub-2',
        subscriber: 'g.dassie.bob',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [30023] }],
        expiresAt: Date.now() + 7200000,
        active: false, // Inactive
      }

      manager.addSubscription(sub1)
      manager.addSubscription(sub2)

      const active = manager.getActiveSubscriptions()

      expect(active).toHaveLength(1)
      expect(active[0]).toEqual(sub1)
    })

    it('should exclude expired subscriptions', () => {
      const sub1: Subscription = {
        id: 'sub-1',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [1] }],
        expiresAt: Date.now() + 3600000, // Not expired
        active: true,
      }

      const sub2: Subscription = {
        id: 'sub-2',
        subscriber: 'g.dassie.bob',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [30023] }],
        expiresAt: Date.now() - 1000, // Expired
        active: true,
      }

      manager.addSubscription(sub1)
      manager.addSubscription(sub2)

      const active = manager.getActiveSubscriptions()

      expect(active).toHaveLength(1)
      expect(active[0]).toEqual(sub1)
    })
  })

  describe('findMatchingSubscriptions', () => {
    it('should find subscriptions matching event by author', () => {
      const subscription: Subscription = {
        id: 'sub-123',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ authors: ['alice_pubkey'] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      }

      manager.addSubscription(subscription)

      const event: NostrEvent = {
        id: 'event_123',
        pubkey: 'alice_pubkey',
        created_at: 1609459200,
        kind: 1,
        tags: [],
        content: 'Hello',
        sig: 'signature',
      }

      const matches = manager.findMatchingSubscriptions(event)

      expect(matches).toHaveLength(1)
      expect(matches[0]).toEqual(subscription)
    })

    it('should find subscriptions matching event by kind', () => {
      const subscription: Subscription = {
        id: 'sub-123',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [1] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      }

      manager.addSubscription(subscription)

      const event: NostrEvent = {
        id: 'event_123',
        pubkey: 'alice_pubkey',
        created_at: 1609459200,
        kind: 1,
        tags: [],
        content: 'Hello',
        sig: 'signature',
      }

      const matches = manager.findMatchingSubscriptions(event)

      expect(matches).toHaveLength(1)
      expect(matches[0]).toEqual(subscription)
    })

    it('should not match if event does not match filter', () => {
      const subscription: Subscription = {
        id: 'sub-123',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [30023] }], // Long-form content
        expiresAt: Date.now() + 3600000,
        active: true,
      }

      manager.addSubscription(subscription)

      const event: NostrEvent = {
        id: 'event_123',
        pubkey: 'alice_pubkey',
        created_at: 1609459200,
        kind: 1, // Short text note
        tags: [],
        content: 'Hello',
        sig: 'signature',
      }

      const matches = manager.findMatchingSubscriptions(event)

      expect(matches).toHaveLength(0)
    })

    it('should match event against multiple filters (OR logic)', () => {
      const subscription: Subscription = {
        id: 'sub-123',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [
          { authors: ['alice_pubkey'], kinds: [1] }, // Match on first filter
          { authors: ['bob_pubkey'], kinds: [30023] },
        ],
        expiresAt: Date.now() + 3600000,
        active: true,
      }

      manager.addSubscription(subscription)

      const event: NostrEvent = {
        id: 'event_123',
        pubkey: 'alice_pubkey',
        created_at: 1609459200,
        kind: 1,
        tags: [],
        content: 'Hello',
        sig: 'signature',
      }

      const matches = manager.findMatchingSubscriptions(event)

      expect(matches).toHaveLength(1)
      expect(matches[0]).toEqual(subscription)
    })

    it('should handle multiple subscriptions from same peer', () => {
      const sub1: Subscription = {
        id: 'sub-1',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [1] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      }

      const sub2: Subscription = {
        id: 'sub-2',
        subscriber: 'g.dassie.alice', // Same peer
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [30023] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      }

      manager.addSubscription(sub1)
      manager.addSubscription(sub2)

      const event: NostrEvent = {
        id: 'event_123',
        pubkey: 'alice_pubkey',
        created_at: 1609459200,
        kind: 1, // Matches sub-1 only
        tags: [],
        content: 'Hello',
        sig: 'signature',
      }

      const matches = manager.findMatchingSubscriptions(event)

      expect(matches).toHaveLength(1)
      expect(matches[0]).toEqual(sub1)
    })

    it('should return empty array if no subscriptions match', () => {
      const subscription: Subscription = {
        id: 'sub-123',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [30023] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      }

      manager.addSubscription(subscription)

      const event: NostrEvent = {
        id: 'event_123',
        pubkey: 'alice_pubkey',
        created_at: 1609459200,
        kind: 1, // Does not match
        tags: [],
        content: 'Hello',
        sig: 'signature',
      }

      const matches = manager.findMatchingSubscriptions(event)

      expect(matches).toHaveLength(0)
    })

    it('should find subscriptions matching event by tag filter', () => {
      const subscription: Subscription = {
        id: 'sub-123',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ '#e': ['event_id_123'] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      }

      manager.addSubscription(subscription)

      const event: NostrEvent = {
        id: 'event_456',
        pubkey: 'alice_pubkey',
        created_at: 1609459200,
        kind: 1,
        tags: [
          ['e', 'event_id_123'], // Matches filter
          ['p', 'bob_pubkey'],
        ],
        content: 'Reply',
        sig: 'signature',
      }

      const matches = manager.findMatchingSubscriptions(event)

      expect(matches).toHaveLength(1)
      expect(matches[0]).toEqual(subscription)
    })

    it('should find subscriptions matching event by timestamp range', () => {
      const subscription: Subscription = {
        id: 'sub-123',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [
          {
            kinds: [1], // Need at least one indexable field
            since: 1609459000, // Jan 1, 2021
            until: 1640995200, // Jan 1, 2022
          },
        ],
        expiresAt: Date.now() + 3600000,
        active: true,
      }

      manager.addSubscription(subscription)

      const event: NostrEvent = {
        id: 'event_123',
        pubkey: 'alice_pubkey',
        created_at: 1609459200, // Jan 1, 2021 (within range)
        kind: 1,
        tags: [],
        content: 'Hello',
        sig: 'signature',
      }

      const matches = manager.findMatchingSubscriptions(event)

      expect(matches).toHaveLength(1)
      expect(matches[0]).toEqual(subscription)
    })

    it('should not match expired subscriptions', () => {
      const subscription: Subscription = {
        id: 'sub-123',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [1] }],
        expiresAt: Date.now() - 1000, // Expired
        active: true,
      }

      manager.addSubscription(subscription)

      const event: NostrEvent = {
        id: 'event_123',
        pubkey: 'alice_pubkey',
        created_at: 1609459200,
        kind: 1,
        tags: [],
        content: 'Hello',
        sig: 'signature',
      }

      const matches = manager.findMatchingSubscriptions(event)

      expect(matches).toHaveLength(0)
    })

    it('should not match inactive subscriptions', () => {
      const subscription: Subscription = {
        id: 'sub-123',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [1] }],
        expiresAt: Date.now() + 3600000,
        active: false, // Inactive
      }

      manager.addSubscription(subscription)

      const event: NostrEvent = {
        id: 'event_123',
        pubkey: 'alice_pubkey',
        created_at: 1609459200,
        kind: 1,
        tags: [],
        content: 'Hello',
        sig: 'signature',
      }

      const matches = manager.findMatchingSubscriptions(event)

      expect(matches).toHaveLength(0)
    })

    it('should handle multiple matching subscriptions', () => {
      const sub1: Subscription = {
        id: 'sub-1',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [1] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      }

      const sub2: Subscription = {
        id: 'sub-2',
        subscriber: 'g.dassie.bob',
        streamConnection: createMockStreamConnection(),
        filters: [{ authors: ['alice_pubkey'] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      }

      const sub3: Subscription = {
        id: 'sub-3',
        subscriber: 'g.dassie.carol',
        streamConnection: createMockStreamConnection(),
        filters: [{ '#e': ['referenced_event'] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      }

      manager.addSubscription(sub1)
      manager.addSubscription(sub2)
      manager.addSubscription(sub3)

      const event: NostrEvent = {
        id: 'event_123',
        pubkey: 'alice_pubkey', // Matches sub2
        created_at: 1609459200,
        kind: 1, // Matches sub1
        tags: [['e', 'referenced_event']], // Matches sub3
        content: 'Hello',
        sig: 'signature',
      }

      const matches = manager.findMatchingSubscriptions(event)

      expect(matches).toHaveLength(3)
      expect(matches.map(s => s.id)).toContain('sub-1')
      expect(matches.map(s => s.id)).toContain('sub-2')
      expect(matches.map(s => s.id)).toContain('sub-3')
    })
  })

  describe('cleanupExpiredSubscriptions', () => {
    it('should mark expired subscriptions as inactive', () => {
      const subscription: Subscription = {
        id: 'sub-123',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [1] }],
        expiresAt: Date.now() - 1000, // Expired
        active: true,
      }

      manager.addSubscription(subscription)

      const expired = manager.cleanupExpiredSubscriptions()

      expect(expired).toHaveLength(1)
      expect(expired[0].id).toBe('sub-123')
      expect(expired[0].active).toBe(false)
    })

    it('should not affect active subscriptions', () => {
      const subscription: Subscription = {
        id: 'sub-123',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [1] }],
        expiresAt: Date.now() + 3600000, // Not expired
        active: true,
      }

      manager.addSubscription(subscription)

      const expired = manager.cleanupExpiredSubscriptions()

      expect(expired).toHaveLength(0)
      expect(manager.getSubscription('sub-123')?.active).toBe(true)
    })

    it('should return empty array if no subscriptions expired', () => {
      const expired = manager.cleanupExpiredSubscriptions()

      expect(expired).toHaveLength(0)
    })
  })

  describe('getSubscriptionCount', () => {
    it('should return total subscription count', () => {
      expect(manager.getSubscriptionCount()).toBe(0)

      manager.addSubscription({
        id: 'sub-1',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [1] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      })

      expect(manager.getSubscriptionCount()).toBe(1)

      manager.addSubscription({
        id: 'sub-2',
        subscriber: 'g.dassie.bob',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [30023] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      })

      expect(manager.getSubscriptionCount()).toBe(2)
    })
  })

  describe('getActiveSubscriptionCount', () => {
    it('should return count of active subscriptions only', () => {
      manager.addSubscription({
        id: 'sub-1',
        subscriber: 'g.dassie.alice',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [1] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      })

      manager.addSubscription({
        id: 'sub-2',
        subscriber: 'g.dassie.bob',
        streamConnection: createMockStreamConnection(),
        filters: [{ kinds: [30023] }],
        expiresAt: Date.now() - 1000, // Expired
        active: true,
      })

      expect(manager.getActiveSubscriptionCount()).toBe(1)
    })
  })
})

describe('SubscriptionExpiryActor', () => {
  let manager: SubscriptionManager
  let cleanup: () => void

  beforeEach(() => {
    manager = new SubscriptionManager()
    vi.useFakeTimers()
  })

  afterEach(() => {
    if (cleanup) {
      cleanup()
    }
    vi.useRealTimers()
  })

  it('should clean up expired subscriptions after 60 seconds', async () => {
    const mockStream = createMockStreamConnection()

    manager.addSubscription({
      id: 'sub-expired',
      subscriber: 'g.dassie.alice',
      streamConnection: mockStream,
      filters: [{ kinds: [1] }],
      expiresAt: Date.now() + 30000, // Expires in 30 seconds
      active: true,
    })

    cleanup = SubscriptionExpiryActor(manager)

    // Fast-forward 60 seconds
    await vi.advanceTimersByTimeAsync(60000)

    // Subscription should be removed
    expect(manager.getSubscription('sub-expired')).toBeNull()

    // CLOSED packet should be sent
    expect(mockStream.sendPacket).toHaveBeenCalled()
  })

  it('should not remove active subscriptions', async () => {
    const mockStream = createMockStreamConnection()

    manager.addSubscription({
      id: 'sub-active',
      subscriber: 'g.dassie.alice',
      streamConnection: mockStream,
      filters: [{ kinds: [1] }],
      expiresAt: Date.now() + 120000, // Expires in 2 minutes
      active: true,
    })

    cleanup = SubscriptionExpiryActor(manager)

    // Fast-forward 60 seconds
    await vi.advanceTimersByTimeAsync(60000)

    // Subscription should still exist
    expect(manager.getSubscription('sub-active')).not.toBeNull()
  })

  it('should handle errors gracefully when sending CLOSED packet fails', async () => {
    const mockStream = createMockStreamConnection()
    mockStream.sendPacket = vi.fn().mockRejectedValue(new Error('Stream closed'))

    manager.addSubscription({
      id: 'sub-error',
      subscriber: 'g.dassie.alice',
      streamConnection: mockStream,
      filters: [{ kinds: [1] }],
      expiresAt: Date.now() + 30000,
      active: true,
    })

    cleanup = SubscriptionExpiryActor(manager)

    // Fast-forward 60 seconds
    await vi.advanceTimersByTimeAsync(60000)

    // Subscription should still be removed even if CLOSED packet fails
    expect(manager.getSubscription('sub-error')).toBeNull()
  })
})
