import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventDeduplicationCache } from '../../../src/btp-nips/event-deduplication.js'
import { EventPropagationService } from '../../../src/btp-nips/event-propagation.js'
import { PeerEventTracker } from '../../../src/btp-nips/peer-event-tracker.js'
import { RateLimiter } from '../../../src/btp-nips/rate-limiter.js'
import { SubscriptionManager } from '../../../src/btp-nips/subscription-manager.js'

import type { NostrEvent } from '../../../src/btp-nips/types/index.js'
import type { PacketMetadata } from '../../../src/btp-nips/utils/ttl-manager.js'
import type { StreamConnection } from '../../../src/btp-nips/subscription-manager.js'

describe('Event Propagation Integration', () => {
  let propagationService: EventPropagationService
  let subscriptionManager: SubscriptionManager
  let dedupCache: EventDeduplicationCache
  let peerTracker: PeerEventTracker
  let rateLimiter: RateLimiter

  // Mock stream connection factory
  function createMockStream(): StreamConnection {
    return {
      sendPacket: vi.fn().mockResolvedValue(undefined),
      fulfillPacket: vi.fn().mockResolvedValue(undefined),
      rejectPacket: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }
  }

  // Sample event factory
  function createEvent(id: string, pubkey: string, kind: number = 1): NostrEvent {
    return {
      id,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind,
      tags: [],
      content: `Test event ${id}`,
      sig: '0'.repeat(128), // Mock signature
    }
  }

  beforeEach(() => {
    subscriptionManager = new SubscriptionManager()
    dedupCache = new EventDeduplicationCache()
    peerTracker = new PeerEventTracker()
    rateLimiter = new RateLimiter()

    propagationService = new EventPropagationService(
      subscriptionManager,
      dedupCache,
      peerTracker,
      rateLimiter
    )
  })

  describe('Alice publishes event → Subscribed peers receive event', () => {
    it('should propagate event to all matching subscribers', async () => {
      const event = createEvent('event123', 'alice_pubkey')
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 5,
      }

      // Create 3 subscriptions (Bob, Carol, Dave)
      const bobStream = createMockStream()
      const carolStream = createMockStream()
      const daveStream = createMockStream()

      subscriptionManager.addSubscription({
        id: 'sub-bob',
        subscriber: 'g.dassie.bob',
        streamConnection: bobStream,
        filters: [{ authors: ['alice_pubkey'] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      })

      subscriptionManager.addSubscription({
        id: 'sub-carol',
        subscriber: 'g.dassie.carol',
        streamConnection: carolStream,
        filters: [{ authors: ['alice_pubkey'] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      })

      subscriptionManager.addSubscription({
        id: 'sub-dave',
        subscriber: 'g.dassie.dave',
        streamConnection: daveStream,
        filters: [{ authors: ['alice_pubkey'] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      })

      // Propagate event
      await propagationService.propagateEvent(event, metadata)

      // All 3 should receive event
      expect(bobStream.sendPacket).toHaveBeenCalled()
      expect(carolStream.sendPacket).toHaveBeenCalled()
      expect(daveStream.sendPacket).toHaveBeenCalled()

      // Verify tracking
      expect(peerTracker.hasSent('g.dassie.bob', 'event123')).toBe(true)
      expect(peerTracker.hasSent('g.dassie.carol', 'event123')).toBe(true)
      expect(peerTracker.hasSent('g.dassie.dave', 'event123')).toBe(true)
    })

    it('should not send to source peer (Alice)', async () => {
      const event = createEvent('event123', 'alice_pubkey')
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 5,
      }

      // Alice subscribes to herself (edge case)
      const aliceStream = createMockStream()
      const bobStream = createMockStream()

      subscriptionManager.addSubscription({
        id: 'sub-alice',
        subscriber: 'g.dassie.alice', // Same as sender
        streamConnection: aliceStream,
        filters: [{ authors: ['alice_pubkey'] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      })

      subscriptionManager.addSubscription({
        id: 'sub-bob',
        subscriber: 'g.dassie.bob',
        streamConnection: bobStream,
        filters: [{ authors: ['alice_pubkey'] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      })

      // Propagate event
      await propagationService.propagateEvent(event, metadata)

      // Alice should NOT receive (source filtering)
      expect(aliceStream.sendPacket).not.toHaveBeenCalled()

      // Bob should receive
      expect(bobStream.sendPacket).toHaveBeenCalled()
    })
  })

  describe('Deduplication prevents duplicate delivery', () => {
    it('should not propagate duplicate event', async () => {
      const event = createEvent('event123', 'alice_pubkey')
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 5,
      }

      const bobStream = createMockStream()

      subscriptionManager.addSubscription({
        id: 'sub-bob',
        subscriber: 'g.dassie.bob',
        streamConnection: bobStream,
        filters: [{ authors: ['alice_pubkey'] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      })

      // First propagation
      await propagationService.propagateEvent(event, metadata)
      expect(bobStream.sendPacket).toHaveBeenCalledTimes(1)

      // Second propagation (duplicate)
      await propagationService.propagateEvent(event, metadata)

      // Still only called once (duplicate blocked)
      expect(bobStream.sendPacket).toHaveBeenCalledTimes(1)
    })
  })

  describe('TTL enforcement prevents infinite loops', () => {
    it('should drop event when TTL reaches 0', async () => {
      const event = createEvent('event123', 'alice_pubkey')
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 0, // Already at 0
      }

      const bobStream = createMockStream()

      subscriptionManager.addSubscription({
        id: 'sub-bob',
        subscriber: 'g.dassie.bob',
        streamConnection: bobStream,
        filters: [{ authors: ['alice_pubkey'] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      })

      // Propagate event with TTL=0
      await propagationService.propagateEvent(event, metadata)

      // Should NOT be sent (TTL expired)
      expect(bobStream.sendPacket).not.toHaveBeenCalled()
    })

    it('should propagate with TTL > 0', async () => {
      const event = createEvent('event123', 'alice_pubkey')
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 2, // Will become 1 after decrement (still valid)
      }

      const bobStream = createMockStream()

      subscriptionManager.addSubscription({
        id: 'sub-bob',
        subscriber: 'g.dassie.bob',
        streamConnection: bobStream,
        filters: [{ authors: ['alice_pubkey'] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      })

      // Propagate event with TTL=2
      await propagationService.propagateEvent(event, metadata)

      // Should be sent (TTL becomes 1 after decrement, still valid)
      expect(bobStream.sendPacket).toHaveBeenCalled()
    })
  })

  describe('Multi-hop propagation', () => {
    it('should propagate Alice → Bob → Carol', async () => {
      const event = createEvent('event123', 'alice_pubkey')

      // Hop 1: Alice publishes (TTL=5)
      const aliceMetadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 5,
        hopCount: 0,
      }

      const bobStream = createMockStream()

      subscriptionManager.addSubscription({
        id: 'sub-bob',
        subscriber: 'g.dassie.bob',
        streamConnection: bobStream,
        filters: [{ authors: ['alice_pubkey'] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      })

      // Alice → Bob
      await propagationService.propagateEvent(event, aliceMetadata)
      expect(bobStream.sendPacket).toHaveBeenCalledTimes(1)

      // Hop 2: Bob forwards to Carol (TTL=4)
      const bobMetadata: PacketMetadata = {
        timestamp: aliceMetadata.timestamp,
        sender: 'g.dassie.bob',
        ttl: 4,
        hopCount: 1,
      }

      const carolStream = createMockStream()

      subscriptionManager.addSubscription({
        id: 'sub-carol',
        subscriber: 'g.dassie.carol',
        streamConnection: carolStream,
        filters: [{ authors: ['alice_pubkey'] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      })

      // Bob → Carol (new propagation service instance simulating Bob's node)
      const bobPropagation = new EventPropagationService(
        subscriptionManager,
        new EventDeduplicationCache(), // New dedup cache (Bob's cache)
        new PeerEventTracker(),
        new RateLimiter()
      )

      await bobPropagation.propagateEvent(event, bobMetadata)

      // Carol should receive
      expect(carolStream.sendPacket).toHaveBeenCalledTimes(1)
    })
  })

  describe('Rate limiting', () => {
    it('should respect rate limits', async () => {
      const bobStream = createMockStream()

      subscriptionManager.addSubscription({
        id: 'sub-bob',
        subscriber: 'g.dassie.bob',
        streamConnection: bobStream,
        filters: [{ authors: ['alice_pubkey'] }], // Match Alice's events
        expiresAt: Date.now() + 3600000,
        active: true,
      })

      // Send 100 events (default rate limit)
      for (let i = 0; i < 100; i++) {
        const event = createEvent(`event${i}`, 'alice_pubkey')
        const metadata: PacketMetadata = {
          timestamp: Date.now(),
          sender: 'g.dassie.carol', // Different sender to avoid source filtering
          ttl: 5,
        }

        await propagationService.propagateEvent(event, metadata)
      }

      // All 100 should be sent
      expect(bobStream.sendPacket).toHaveBeenCalledTimes(100)

      // 101st should be rate limited
      const event101 = createEvent('event101', 'alice_pubkey')
      const metadata101: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.carol',
        ttl: 5,
      }

      await propagationService.propagateEvent(event101, metadata101)

      // Still only 100 (rate limited)
      expect(bobStream.sendPacket).toHaveBeenCalledTimes(100)
    })
  })

  describe('No matching subscriptions', () => {
    it('should handle event with no matching subscriptions', async () => {
      const event = createEvent('event123', 'alice_pubkey')
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 5,
      }

      // No subscriptions added

      // Should not throw
      await expect(propagationService.propagateEvent(event, metadata)).resolves.toBeUndefined()

      // Should still be marked as seen
      expect(dedupCache.hasSeenEvent('event123')).toBe(true)
    })
  })

  describe('Stream errors', () => {
    it('should continue propagation despite individual stream errors', async () => {
      const event = createEvent('event123', 'alice_pubkey')
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 5,
      }

      // Bob's stream fails
      const bobStream = createMockStream()
      vi.mocked(bobStream.sendPacket).mockRejectedValue(new Error('Stream error'))

      // Carol's stream succeeds
      const carolStream = createMockStream()

      subscriptionManager.addSubscription({
        id: 'sub-bob',
        subscriber: 'g.dassie.bob',
        streamConnection: bobStream,
        filters: [{ authors: ['alice_pubkey'] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      })

      subscriptionManager.addSubscription({
        id: 'sub-carol',
        subscriber: 'g.dassie.carol',
        streamConnection: carolStream,
        filters: [{ authors: ['alice_pubkey'] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      })

      // Should not throw
      await expect(propagationService.propagateEvent(event, metadata)).resolves.toBeUndefined()

      // Carol should still receive (despite Bob's failure)
      expect(carolStream.sendPacket).toHaveBeenCalled()
    })
  })

  describe('Statistics', () => {
    it('should provide propagation statistics', async () => {
      const event = createEvent('event123', 'alice_pubkey')
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 5,
      }

      const bobStream = createMockStream()

      subscriptionManager.addSubscription({
        id: 'sub-bob',
        subscriber: 'g.dassie.bob',
        streamConnection: bobStream,
        filters: [{ authors: ['alice_pubkey'] }],
        expiresAt: Date.now() + 3600000,
        active: true,
      })

      await propagationService.propagateEvent(event, metadata)

      const stats = propagationService.getStats()

      expect(stats.dedupCacheSize).toBe(1) // 1 event seen
      expect(stats.peerCount).toBe(1) // 1 peer tracked (Bob)
      expect(stats.rateLimiterPeerCount).toBe(1) // 1 peer in rate limiter
    })
  })
})
