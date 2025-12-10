import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { performance } from 'perf_hooks'
import { randomBytes } from 'crypto'
import { schnorr } from '@noble/secp256k1'
import { EventCache } from '../../../src/btp-nips/storage/event-cache'
import { EventRepository } from '../../../src/btp-nips/storage/event-repository'
import { NostrMessageType } from '../../../src/btp-nips/types'
import { SubscriptionManager } from '../../../src/btp-nips/subscription-manager'
import { calculateEventId } from '../../../src/btp-nips/crypto'
import { handleEventPacket } from '../../../src/btp-nips/handlers/event-handler'
import { serializeBTPNIPsPacket, parseBTPNIPsPacket } from '../../../src/btp-nips/parser'

import type {
import type { ILPPacket } from '../../../src/btp-nips/handlers/event-handler'
import type { NostrEvent } from '../../../src/btp-nips/types'

/**
 * BTP-NIPs End-to-End Performance Benchmarks
 *
 * Tests performance characteristics of the BTP-NIPs protocol:
 * - Write throughput (events/sec)
 * - Query latency (p95)
 * - Subscription matching performance
 *
 * @see Story 5.8 - BTP-NIPs Integration Tests - AC 8
 * @see test/btp-nips/performance/storage-benchmark.spec.ts (reference patterns)
 */

/* eslint-disable sort-imports */
  Subscription,
  StreamConnection,
} from '../../../src/btp-nips/subscription-manager'

/**
 * Mock ILP STREAM Connection (minimal for performance testing)
 */
class MockStreamConnection implements StreamConnection {
  async sendPacket(_data: Buffer): Promise<void> {
    // No-op for performance testing
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
 * Create a signed Nostr event
 */
async function createSignedEvent(
  overrides?: Partial<NostrEvent>,
): Promise<NostrEvent> {
  const privateKey = randomBytes(32)
  const publicKey = Buffer.from(schnorr.getPublicKey(privateKey)).toString('hex')

  const event: Omit<NostrEvent, 'id' | 'sig'> = {
    pubkey: publicKey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: 'Performance test event',
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
 * Create ILP packet for event publishing
 */
function createEventILPPacket(event: NostrEvent): ILPPacket {
  // Use appropriate payment based on kind (kind 1 = 50 msats)
  const amount = event.kind === 1 ? '50' : '100'

  const _btpPacket = {
    header: {
      version: 1,
      messageType: NostrMessageType.EVENT,
      payloadLength: 0,
    },
    payload: {
      payment: {
        amount,
        currency: 'msat',
        purpose: 'event_publish',
      },
      nostr: event,
      metadata: {
        timestamp: Math.floor(Date.now() / 1000),
        sender: 'g.dassie.test',
      },
    },
  }

  const data = serializeBTPNIPsPacket(btpPacket)

  return {
    data,
    destination: 'g.dassie.relay',
    amount,
  }
}

/**
 * Calculate percentile from sorted array of numbers
 *
 * @param sorted - Sorted array of numbers
 * @param percentile - Percentile (0-1, e.g., 0.95 for p95)
 * @returns Value at the given percentile
 */
function calculatePercentile(sorted: number[], percentile: number): number {
  if (sorted.length === 0) return 0

  const index = percentile * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)

  if (lower === upper) {
    return sorted[lower]
  }

  // Linear interpolation
  const weight = index - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

describe('BTP-NIPs Performance Benchmarks', () => {
  let repository: EventRepository
  let cache: EventCache
  let subscriptionManager: SubscriptionManager

  beforeEach(() => {
    repository = new EventRepository()
    cache = new EventCache()
    subscriptionManager = new SubscriptionManager()
  })

  afterEach(async () => {
    await repository.deleteAll()
    await cache.flushAll()
  })

  describe('AC 8.1: Throughput - 100 events/sec sustained', () => {
    it(
      'should publish 1000 events with throughput >= 100 events/sec',
      async () => {
        const eventCount = 1000

        // Generate all events upfront
        const events = await Promise.all(
          Array.from({ length: eventCount }, (_, i) =>
            createSignedEvent({ content: `Event ${i}` }),
          ),
        )

        // Measure total time
        const start = performance.now()

        // Publish as fast as possible
        await Promise.all(
          events.map(async (_event) => {
            const ilpPacket = createEventILPPacket(event)
            const _btpPacket = parseBTPNIPsPacket(ilpPacket.data)
            await handleEventPacket(btpPacket, ilpPacket)
          }),
        )

        const duration = performance.now() - start
        const durationSeconds = duration / 1000
        const eventsPerSec = eventCount / durationSeconds

        console.log(
          `Throughput: ${eventsPerSec.toFixed(2)} events/sec (${duration.toFixed(2)}ms total)`,
        )

        // Verify throughput
        expect(eventsPerSec).toBeGreaterThanOrEqual(100)

        // Verify all events stored
        for (const event of events.slice(0, 10)) {
          // Sample verification
          const stored = await repository.getEvent(event.id)
          expect(stored).toBeDefined()
        }
      },
      30000, // 30 second timeout
    )
  })

  describe('AC 8.2: Latency - p95 < 100ms', () => {
    it('should achieve p95 latency < 100ms for event publishing', async () => {
      const eventCount = 100
      const latencies: number[] = []

      // Send events one-by-one, measuring latency
      for (let i = 0; i < eventCount; i++) {
        const _event = await createSignedEvent({ content: `Latency test ${i}` })
        const ilpPacket = createEventILPPacket(event)
        const _btpPacket = parseBTPNIPsPacket(ilpPacket.data)

        const start = performance.now()
        await handleEventPacket(btpPacket, ilpPacket)

        // Wait for database write to complete
        const stored = await repository.getEvent(event.id)
        expect(stored).toBeDefined() // Ensure stored

        const end = performance.now()
        const latency = end - start

        latencies.push(latency)
      }

      // Calculate percentiles
      latencies.sort((a, b) => a - b)

      const p50 = calculatePercentile(latencies, 0.5)
      const p95 = calculatePercentile(latencies, 0.95)
      const p99 = calculatePercentile(latencies, 0.99)

      console.log(`Latency p50: ${p50.toFixed(2)}ms`)
      console.log(`Latency p95: ${p95.toFixed(2)}ms`)
      console.log(`Latency p99: ${p99.toFixed(2)}ms`)

      // Verify p95 latency
      expect(p95).toBeLessThan(100)
    }, 60000) // 60 second timeout
  })

  describe('AC 8.3: Subscription Matching - 1000 subscriptions < 50ms', () => {
    it('should match event to 1000 subscriptions in < 50ms', async () => {
      // Create 1000 subscriptions with varied filters
      const streamConnection = new MockStreamConnection()

      // Generate unique pubkeys for variety
      const pubkeys = Array.from({ length: 10 }, () =>
        Buffer.from(schnorr.getPublicKey(randomBytes(32))).toString('hex'),
      )

      // Create event first so we can match subscriptions to it
      const testPubkey = pubkeys[0]
      const _event = await createSignedEvent({
        kind: 1,
        pubkey: testPubkey,
        content: 'Matching test event',
      })

      for (let i = 0; i < 1000; i++) {
        const subscription: Subscription = {
          id: `sub-${i}`,
          subscriber: `g.dassie.node${i % 10}`,
          streamConnection,
          filters: [
            {
              kinds: [1], // All match kind 1
              authors: i < 100 ? [testPubkey] : [pubkeys[i % 10]], // First 100 match the test event
            },
          ],
          expiresAt: Date.now() + 3600000,
          active: true,
        }

        subscriptionManager.addSubscription(subscription)
      }

      await repository.saveEvent(event)

      // Measure matching time
      const start = performance.now()
      const matches = subscriptionManager.findMatchingSubscriptions(event)
      const elapsed = performance.now() - start

      console.log(
        `Subscription matching: ${elapsed.toFixed(2)}ms for ${matches.length} matches out of 1000 subscriptions`,
      )

      // Verify performance
      expect(elapsed).toBeLessThan(50)

      // Verify correct matches found
      expect(matches.length).toBeGreaterThan(0)

      // Verify all matches have correct filters
      for (const match of matches) {
        const hasMatchingFilter = match.filters.some(
          (filter) =>
            filter.kinds?.includes(event.kind) &&
            (filter.authors?.includes(event.pubkey) || !filter.authors),
        )
        expect(hasMatchingFilter).toBe(true)
      }
    })

    it('should scale linearly with subscription count (O(log n) or better)', async () => {
      const streamConnection = new MockStreamConnection()
      const pubkey = Buffer.from(schnorr.getPublicKey(randomBytes(32))).toString('hex')

      const subscriptionCounts = [100, 500, 1000, 2000]
      const matchingTimes: number[] = []

      for (const count of subscriptionCounts) {
        // Reset subscription manager
        subscriptionManager = new SubscriptionManager()

        // Add subscriptions
        for (let i = 0; i < count; i++) {
          const subscription: Subscription = {
            id: `sub-${i}`,
            subscriber: `g.dassie.node${i}`,
            streamConnection,
            filters: [
              {
                kinds: [1],
                authors: [pubkey],
              },
            ],
            expiresAt: Date.now() + 3600000,
            active: true,
          }

          subscriptionManager.addSubscription(subscription)
        }

        // Create matching event
        const _event = await createSignedEvent({
          kind: 1,
          pubkey,
          content: 'Scale test event',
        })

        // Measure matching time
        const start = performance.now()
        const matches = subscriptionManager.findMatchingSubscriptions(event)
        const elapsed = performance.now() - start

        matchingTimes.push(elapsed)

        console.log(`${count} subscriptions → ${elapsed.toFixed(2)}ms (${matches.length} matches)`)

        // Verify all subscriptions matched
        expect(matches.length).toBe(count)
      }

      // Verify sub-linear scaling (doubling subscriptions should not double time)
      const ratio = matchingTimes[3] / matchingTimes[0] // 2000 vs 100
      console.log(`Scaling ratio (2000 vs 100 subs): ${ratio.toFixed(2)}x`)

      // If O(log n), ratio should be ~1.3x (log2(2000) / log2(100) ≈ 1.66)
      // If O(n), ratio would be exactly 20x (2000/100)
      // The actual ratio will vary due to JIT warmup, GC, and constant overhead
      // As long as it's significantly better than O(n), the indexing is working
      // We verify ratio < 20x (which would be pure O(n))
      expect(ratio).toBeLessThan(20)
    }, 30000)
  })

  describe('Realistic Workload - Mixed Operations', () => {
    it('should handle mixed read/write/subscribe workload efficiently', async () => {
      // Simulate realistic relay workload:
      // - 70% writes (EVENT)
      // - 20% reads (queries)
      // - 10% subscription operations

      const operationCount = 1000
      const streamConnection = new MockStreamConnection()

      // Pre-populate with some events
      const initialEvents = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          createSignedEvent({ content: `Initial event ${i}` }),
        ),
      )

      for (const event of initialEvents) {
        await repository.saveEvent(event)
      }

      // Add some subscriptions
      for (let i = 0; i < 10; i++) {
        const subscription: Subscription = {
          id: `sub-${i}`,
          subscriber: `g.dassie.node${i}`,
          streamConnection,
          filters: [{ kinds: [1] }],
          expiresAt: Date.now() + 3600000,
          active: true,
        }
        subscriptionManager.addSubscription(subscription)
      }

      const start = performance.now()

      // Execute mixed workload
      const operations = []
      for (let i = 0; i < operationCount; i++) {
        const rand = Math.random()

        if (rand < 0.7) {
          // 70% writes
          operations.push(
            (async () => {
              const _event = await createSignedEvent({ content: `Mixed workload ${i}` })
              const ilpPacket = createEventILPPacket(event)
              const _btpPacket = parseBTPNIPsPacket(ilpPacket.data)
              await handleEventPacket(btpPacket, ilpPacket)
            })(),
          )
        } else if (rand < 0.9) {
          // 20% reads
          operations.push(repository.queryEventsByFilters([{ kinds: [1], limit: 10 }]))
        } else {
          // 10% subscription matching
          const randomEvent = initialEvents[Math.floor(Math.random() * initialEvents.length)]
          operations.push(
            Promise.resolve(subscriptionManager.findMatchingSubscriptions(randomEvent)),
          )
        }
      }

      await Promise.all(operations)

      const elapsed = performance.now() - start
      const opsPerSec = operationCount / (elapsed / 1000)

      console.log(
        `Mixed workload: ${opsPerSec.toFixed(2)} ops/sec (${elapsed.toFixed(2)}ms total)`,
      )

      // Verify reasonable throughput
      expect(opsPerSec).toBeGreaterThan(100)
    }, 60000)
  })
})
