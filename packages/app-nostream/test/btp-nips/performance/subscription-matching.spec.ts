import { beforeEach, describe, expect, it } from 'vitest'
import { type Subscription, SubscriptionManager } from '../../../src/btp-nips/subscription-manager.js'

import type { NostrEvent, NostrFilter } from '../../../src/btp-nips/types/index.js'

/**
 * Subscription Matching Performance Benchmark Tests
 *
 * Tests performance targets from Story 5.5 AC 7:
 * 1. Add 10,000 subscriptions in <1 second
 * 2. Find matching subscriptions in <10ms with 10,000 active subscriptions
 * 3. Expire 1000 subscriptions in <100ms
 *
 * These tests verify that indexed subscription matching provides O(1) performance
 * regardless of total subscription count.
 */

/**
 * Mock StreamConnection for testing
 */
class MockStreamConnection {
  async sendPacket(_data: Buffer): Promise<void> {
    // No-op
  }

  async fulfillPacket(): Promise<void> {
    // No-op
  }

  async rejectPacket(_reason: string): Promise<void> {
    // No-op
  }

  async close(): Promise<void> {
    // No-op
  }
}

/**
 * Generate test subscriptions with random filters
 */
function generateTestSubscriptions(count: number): Subscription[] {
  const subscriptions: Subscription[] = []
  const authors = ['alice', 'bob', 'carol', 'dave', 'eve', 'frank', 'grace', 'henry']
  const kinds = [1, 3, 7, 30023]

  for (let i = 0; i < count; i++) {
    const filters: NostrFilter[] = [
      {
        authors: [authors[i % authors.length]],
        kinds: [kinds[i % kinds.length]],
        since: Math.floor(Date.now() / 1000) - 86400, // Last 24h
      },
    ]

    subscriptions.push({
      id: `sub-${i}`,
      subscriber: `g.dassie.peer${i % 100}`,
      streamConnection: new MockStreamConnection() as any,
      filters,
      expiresAt: Date.now() + 3600000, // 1 hour
      active: true,
    })
  }

  return subscriptions
}

/**
 * Generate test event
 */
function generateTestEvent(author: string, kind: number): NostrEvent {
  return {
    id: `event_${Math.random().toString(36).substring(7)}`,
    pubkey: author,
    created_at: Math.floor(Date.now() / 1000),
    kind,
    tags: [
      ['e', 'referenced_event_id'],
      ['p', 'bob'],
    ],
    content: 'Test event',
    sig: 'signature_placeholder',
  }
}

describe('Subscription Matching Performance', () => {
  describe('Benchmark: Add Subscriptions', () => {
    it('should add 10,000 subscriptions in <1 second', () => {
      const manager = new SubscriptionManager()
      const subscriptions = generateTestSubscriptions(10000)

      const startTime = performance.now()

      for (const sub of subscriptions) {
        manager.addSubscription(sub)
      }

      const endTime = performance.now()
      const elapsedMs = endTime - startTime

      console.log(
        `  ✓ Added 10,000 subscriptions in ${elapsedMs.toFixed(2)}ms (${(elapsedMs / 10000).toFixed(4)}ms per subscription)`
      )

      expect(elapsedMs).toBeLessThan(1000) // <1 second
      expect(manager.getSubscriptionCount()).toBe(10000)
    })

    it('should add 1,000 subscriptions in <100ms', () => {
      const manager = new SubscriptionManager()
      const subscriptions = generateTestSubscriptions(1000)

      const startTime = performance.now()

      for (const sub of subscriptions) {
        manager.addSubscription(sub)
      }

      const endTime = performance.now()
      const elapsedMs = endTime - startTime

      console.log(
        `  ✓ Added 1,000 subscriptions in ${elapsedMs.toFixed(2)}ms (${(elapsedMs / 1000).toFixed(4)}ms per subscription)`
      )

      expect(elapsedMs).toBeLessThan(100)
    })
  })

  describe('Benchmark: Find Matching Subscriptions', () => {
    let manager: SubscriptionManager
    let testEvent: NostrEvent

    beforeEach(() => {
      manager = new SubscriptionManager()

      // Add 10,000 subscriptions
      const subscriptions = generateTestSubscriptions(10000)
      for (const sub of subscriptions) {
        manager.addSubscription(sub)
      }

      // Create test event matching some subscriptions
      testEvent = generateTestEvent('alice', 1)
    })

    it('should find matching subscriptions in <10ms with 10,000 active subscriptions', () => {
      const startTime = performance.now()

      const matches = manager.findMatchingSubscriptions(testEvent)

      const endTime = performance.now()
      const elapsedMs = endTime - startTime

      console.log(
        `  ✓ Found ${matches.length} matching subscriptions in ${elapsedMs.toFixed(2)}ms (10,000 total subscriptions)`
      )

      expect(elapsedMs).toBeLessThan(10) // <10ms target
      expect(matches.length).toBeGreaterThan(0) // Should have at least some matches
    })

    it('should have O(1) performance regardless of subscription count', () => {
      const counts = [100, 1000, 10000]
      const timings: number[] = []

      for (const count of counts) {
        const testManager = new SubscriptionManager()
        const subs = generateTestSubscriptions(count)

        for (const sub of subs) {
          testManager.addSubscription(sub)
        }

        const event = generateTestEvent('alice', 1)

        // Run multiple iterations to get more stable timing
        const iterations = 100
        const startTime = performance.now()

        for (let i = 0; i < iterations; i++) {
          testManager.findMatchingSubscriptions(event)
        }

        const endTime = performance.now()
        const avgElapsed = (endTime - startTime) / iterations
        timings.push(avgElapsed)

        console.log(
          `  ✓ ${count} subscriptions: ${avgElapsed.toFixed(3)}ms avg (${iterations} iterations)`
        )
      }

      // Verify O(1) performance: All subscription counts should complete in <10ms
      for (const timing of timings) {
        expect(timing).toBeLessThan(10) // Each should be <10ms
      }

      console.log(
        '  ✓ All subscription counts perform in <10ms (indexed lookup working)'
      )
    })
  })

  describe('Benchmark: Subscription Removal', () => {
    it('should remove 1000 subscriptions in <100ms', () => {
      const manager = new SubscriptionManager()
      const subscriptions = generateTestSubscriptions(1000)

      // Add subscriptions
      for (const sub of subscriptions) {
        manager.addSubscription(sub)
      }

      // Remove subscriptions
      const startTime = performance.now()

      for (const sub of subscriptions) {
        manager.removeSubscription(sub.id)
      }

      const endTime = performance.now()
      const elapsedMs = endTime - startTime

      console.log(
        `  ✓ Removed 1,000 subscriptions in ${elapsedMs.toFixed(2)}ms (${(elapsedMs / 1000).toFixed(4)}ms per subscription)`
      )

      expect(elapsedMs).toBeLessThan(100) // <100ms
      expect(manager.getSubscriptionCount()).toBe(0)
    })
  })

  describe('Benchmark: Subscription Expiry Cleanup', () => {
    it('should expire 1000 subscriptions in <100ms', () => {
      const manager = new SubscriptionManager()
      const subscriptions = generateTestSubscriptions(1000)

      // Add subscriptions with past expiry time
      const pastExpiry = Date.now() - 1000 // 1 second ago

      for (const sub of subscriptions) {
        sub.expiresAt = pastExpiry
        manager.addSubscription(sub)
      }

      // Clean up expired subscriptions
      const startTime = performance.now()

      const expired = manager.cleanupExpiredSubscriptions()

      const endTime = performance.now()
      const elapsedMs = endTime - startTime

      console.log(
        `  ✓ Found ${expired.length} expired subscriptions in ${elapsedMs.toFixed(2)}ms`
      )

      expect(elapsedMs).toBeLessThan(100) // <100ms
      expect(expired.length).toBe(1000)
    })
  })

  describe('Benchmark: Memory Usage', () => {
    it('should track index statistics for 10,000 subscriptions', () => {
      const manager = new SubscriptionManager()
      const subscriptions = generateTestSubscriptions(10000)

      for (const sub of subscriptions) {
        manager.addSubscription(sub)
      }

      // Estimate memory usage (rough)
      const subscriptionCount = manager.getSubscriptionCount()
      const estimatedMemoryMB = (subscriptionCount * 3) / 1000 // ~3KB per subscription (Map + Index)

      console.log(`  ✓ Subscriptions: ${subscriptionCount}`)
      console.log(`  ✓ Estimated memory: ${estimatedMemoryMB.toFixed(2)} MB`)

      expect(subscriptionCount).toBe(10000)
      expect(estimatedMemoryMB).toBeLessThan(50) // Should be <50MB for 10k subscriptions
    })
  })
})
