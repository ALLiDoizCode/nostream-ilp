import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventDeduplicationCache } from '../../../src/btp-nips/event-deduplication.js'
import { EventPropagationService } from '../../../src/btp-nips/event-propagation.js'
import { PeerEventTracker } from '../../../src/btp-nips/peer-event-tracker.js'
import { RateLimiter } from '../../../src/btp-nips/rate-limiter.js'
import { SubscriptionManager } from '../../../src/btp-nips/subscription-manager.js'

import type { NostrEvent } from '../../../src/btp-nips/types/index.js'
import type { PacketMetadata } from '../../../src/btp-nips/utils/ttl-manager.js'
import type { StreamConnection } from '../../../src/btp-nips/subscription-manager.js'

describe('Event Propagation Performance', () => {
  let propagationService: EventPropagationService
  let subscriptionManager: SubscriptionManager

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
      sig: '0'.repeat(128),
    }
  }

  beforeEach(() => {
    subscriptionManager = new SubscriptionManager()

    propagationService = new EventPropagationService(
      subscriptionManager,
      new EventDeduplicationCache(),
      new PeerEventTracker(),
      new RateLimiter()
    )
  })

  describe('Benchmark: Propagate 1 event to 1000 subscriptions', () => {
    it('should complete in < 100ms', async () => {
      const event = createEvent('event123', 'alice_pubkey')
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 5,
      }

      // Create 1000 subscriptions
      for (let i = 0; i < 1000; i++) {
        const stream = createMockStream()
        subscriptionManager.addSubscription({
          id: `sub-${i}`,
          subscriber: `g.dassie.peer${i}`,
          streamConnection: stream,
          filters: [{ authors: ['alice_pubkey'] }],
          expiresAt: Date.now() + 3600000,
          active: true,
        })
      }

      // Benchmark propagation
      const startTime = performance.now()

      await propagationService.propagateEvent(event, metadata)

      const elapsed = performance.now() - startTime

      // Should complete in < 100ms
      expect(elapsed).toBeLessThan(100)

      // Verify all 1000 subscribers received event
      const stats = propagationService.getStats()
      expect(stats.peerCount).toBe(1000)
    })
  })

  describe('Benchmark: Propagate 1000 events to 10 subscriptions', () => {
    it('should complete in < 1 second', async () => {
      // Create 10 subscriptions
      for (let i = 0; i < 10; i++) {
        const stream = createMockStream()
        subscriptionManager.addSubscription({
          id: `sub-${i}`,
          subscriber: `g.dassie.peer${i}`,
          streamConnection: stream,
          filters: [{ authors: ['alice_pubkey'] }],
          expiresAt: Date.now() + 3600000,
          active: true,
        })
      }

      // Benchmark 1000 event propagations
      const startTime = performance.now()

      for (let i = 0; i < 1000; i++) {
        const event = createEvent(`event${i}`, 'alice_pubkey')
        const metadata: PacketMetadata = {
          timestamp: Date.now(),
          sender: 'g.dassie.carol', // Different sender to avoid source filtering
          ttl: 5,
        }

        await propagationService.propagateEvent(event, metadata)
      }

      const elapsed = performance.now() - startTime

      // Should complete in < 1 second
      expect(elapsed).toBeLessThan(1000)

      // Verify deduplication cache has 1000 events
      const stats = propagationService.getStats()
      expect(stats.dedupCacheSize).toBe(1000)
    })
  })

  describe('Benchmark: Rate limiter overhead', () => {
    it('should have < 1ms overhead per tryConsume call', () => {
      const rateLimiter = new RateLimiter()
      const iterations = 10000

      const startTime = performance.now()

      for (let i = 0; i < iterations; i++) {
        rateLimiter.tryConsume('g.dassie.alice')
      }

      const elapsed = performance.now() - startTime
      const averagePerCall = elapsed / iterations

      // Average should be < 1ms per call
      expect(averagePerCall).toBeLessThan(1)
    })
  })

  describe('Benchmark: Deduplication cache performance', () => {
    it('should have < 0.1ms per check', () => {
      const cache = new EventDeduplicationCache()
      const iterations = 10000

      // Pre-populate cache
      for (let i = 0; i < iterations; i++) {
        cache.markAsSeen(`event${i}`)
      }

      // Benchmark lookups
      const startTime = performance.now()

      for (let i = 0; i < iterations; i++) {
        cache.hasSeenEvent(`event${i}`)
      }

      const elapsed = performance.now() - startTime
      const averagePerCheck = elapsed / iterations

      // Average should be < 0.1ms per check
      expect(averagePerCheck).toBeLessThan(0.1)
    })
  })

  describe('Benchmark: Peer tracking performance', () => {
    it('should have < 0.1ms per hasSent check', () => {
      const tracker = new PeerEventTracker()
      const iterations = 10000

      // Pre-populate tracker
      for (let i = 0; i < 100; i++) {
        for (let j = 0; j < 100; j++) {
          tracker.markEventSent(`g.dassie.peer${i}`, `event${j}`)
        }
      }

      // Benchmark lookups
      const startTime = performance.now()

      for (let i = 0; i < iterations; i++) {
        tracker.hasSent(`g.dassie.peer${i % 100}`, `event${i % 100}`)
      }

      const elapsed = performance.now() - startTime
      const averagePerCheck = elapsed / iterations

      // Average should be < 0.1ms per check
      expect(averagePerCheck).toBeLessThan(0.1)
    })
  })

  describe('Benchmark: Subscription matching performance', () => {
    it('should match < 10ms for 10,000 subscriptions', () => {
      // Create 10,000 subscriptions
      for (let i = 0; i < 10000; i++) {
        const stream = createMockStream()
        subscriptionManager.addSubscription({
          id: `sub-${i}`,
          subscriber: `g.dassie.peer${i}`,
          streamConnection: stream,
          filters: [{ authors: ['alice_pubkey'], kinds: [1] }],
          expiresAt: Date.now() + 3600000,
          active: true,
        })
      }

      const event = createEvent('event123', 'alice_pubkey', 1)

      // Benchmark matching
      const startTime = performance.now()

      const matches = subscriptionManager.findMatchingSubscriptions(event)

      const elapsed = performance.now() - startTime

      // Should complete in < 10ms
      expect(elapsed).toBeLessThan(10)

      // Verify all 10,000 matched
      expect(matches.length).toBe(10000)
    })
  })

  describe('Memory usage', () => {
    it('should have reasonable memory footprint', async () => {
      // Create 100 subscriptions
      for (let i = 0; i < 100; i++) {
        const stream = createMockStream()
        subscriptionManager.addSubscription({
          id: `sub-${i}`,
          subscriber: `g.dassie.peer${i}`,
          streamConnection: stream,
          filters: [{ authors: ['alice_pubkey'] }],
          expiresAt: Date.now() + 3600000,
          active: true,
        })
      }

      // Propagate 1000 events
      const propagateEvents = async () => {
        for (let i = 0; i < 1000; i++) {
          const evt = createEvent(`event${i}`, 'alice_pubkey')
          await propagationService.propagateEvent(evt, metadata)
        }
      }

      // Should not throw OOM error
      await expect(propagateEvents()).resolves.toBeUndefined()
    })
  })
})
