import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { calculateEventId } from '../../../src/btp-nips/crypto'
import { EventCache } from '../../../src/btp-nips/storage/event-cache'
import { EventRepository } from '../../../src/btp-nips/storage/event-repository'
import { StorageStats } from '../../../src/btp-nips/storage/storage-stats'
import { schnorr } from '@noble/secp256k1'
import { randomBytes } from 'crypto'
import { performance } from 'perf_hooks'

import type { NostrEvent, NostrFilter } from '../../../src/btp-nips/types'

/**
 * Storage Performance Benchmark Tests
 *
 * Tests performance targets from Story 5.7 AC 4:
 * 1. Write throughput: >= 1000 events/sec
 * 2. Query latency: p95 < 100ms with complex filters
 * 3. Cache hit rate: > 80% with realistic workload
 * 4. Concurrent writes: No conflicts with 10 parallel writers
 *
 * These tests verify that storage layer meets performance requirements
 * for production relay operations.
 */

/* eslint-disable sort-imports */
/* eslint-enable sort-imports */

/**
 * Generate a valid signed Nostr event
 */
async function createSignedEvent(overrides?: Partial<NostrEvent>): Promise<NostrEvent> {
  const privateKey = randomBytes(32)
  const publicKey = Buffer.from(schnorr.getPublicKey(privateKey)).toString('hex')

  const event: Omit<NostrEvent, 'id' | 'sig'> = {
    pubkey: publicKey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: 'Benchmark test event',
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
 * Generate varied test data with realistic distribution
 */
async function generateRealisticEvents(count: number): Promise<NostrEvent[]> {
  const events: NostrEvent[] = []

  // Realistic kind distribution (based on Nostr usage patterns)
  const kindDistribution = [
    { kind: 1, ratio: 0.7 }, // 70% short notes
    { kind: 7, ratio: 0.2 }, // 20% reactions
    { kind: 3, ratio: 0.05 }, // 5% contact lists
    { kind: 30023, ratio: 0.03 }, // 3% long-form
    { kind: 0, ratio: 0.02 }, // 2% profile metadata
  ]

  for (let i = 0; i < count; i++) {
    // Select kind based on distribution
    const rand = Math.random()
    let cumulativeRatio = 0
    let selectedKind = 1

    for (const { kind, ratio } of kindDistribution) {
      cumulativeRatio += ratio
      if (rand < cumulativeRatio) {
        selectedKind = kind
        break
      }
    }

    // Vary content length based on kind
    let contentLength = 100
    if (selectedKind === 1) contentLength = Math.floor(Math.random() * 280)
    if (selectedKind === 30023) contentLength = Math.floor(Math.random() * 5000) + 500
    if (selectedKind === 7) contentLength = 1 // Reactions are just "+"

    const content = selectedKind === 7 ? '+' : 'x'.repeat(contentLength)

    // Add varied tags
    const tags: string[][] = []
    if (selectedKind === 1) {
      // Short notes may reference events
      if (Math.random() > 0.5) {
        tags.push(['e', randomBytes(32).toString('hex')])
      }
    }
    if (selectedKind === 7) {
      // Reactions always reference an event
      tags.push(['e', randomBytes(32).toString('hex')])
      tags.push(['p', randomBytes(32).toString('hex')])
    }

    events.push(
      await createSignedEvent({
        kind: selectedKind,
        content,
        tags,
        created_at: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 86400), // Last 24h
      })
    )
  }

  return events
}

describe('Storage Performance Benchmarks', () => {
  let repository: EventRepository
  let cache: EventCache
  let stats: StorageStats

  beforeAll(async () => {
    repository = new EventRepository()
    cache = new EventCache()
    stats = new StorageStats()

    await cache.waitForInitialization()
  })

  afterEach(async () => {
    // Clean up after each test
    await repository.deleteAll()
    await cache.flushAll()
    cache.resetStats()
    stats.resetQueryStats()
  })

  describe('Write Throughput (AC 4.1: >= 1000 events/sec)', () => {
    it('should insert 10,000 events at >= 1000 events/sec', async () => {
      const events = await generateRealisticEvents(10000)

      const startTime = performance.now()

      // Insert all events
      for (const event of events) {
        await repository.saveEvent(event)
      }

      const endTime = performance.now()
      const durationSeconds = (endTime - startTime) / 1000

      const eventsPerSecond = 10000 / durationSeconds

      console.log(`Write throughput: ${eventsPerSecond.toFixed(0)} events/sec`)

      // Target: >= 1000 events/sec
      expect(eventsPerSecond).toBeGreaterThanOrEqual(1000)
    }, 30000) // 30 second timeout

    it('should handle sustained write load without degradation', async () => {
      const batchSize = 1000
      const batches = 5
      const throughputs: number[] = []

      for (let batch = 0; batch < batches; batch++) {
        const events = await generateRealisticEvents(batchSize)

        const startTime = performance.now()

        for (const event of events) {
          await repository.saveEvent(event)
        }

        const endTime = performance.now()
        const durationSeconds = (endTime - startTime) / 1000
        const eventsPerSecond = batchSize / durationSeconds

        throughputs.push(eventsPerSecond)
      }

      // All batches should meet minimum throughput
      for (const throughput of throughputs) {
        expect(throughput).toBeGreaterThanOrEqual(1000)
      }

      // Throughput shouldn't degrade (last batch >= 90% of first batch)
      const firstBatch = throughputs[0]
      const lastBatch = throughputs[throughputs.length - 1]
      expect(lastBatch).toBeGreaterThanOrEqual(firstBatch * 0.9)

      console.log(`Sustained throughput: ${throughputs.map(t => t.toFixed(0)).join(', ')} events/sec`)
    }, 60000) // 60 second timeout
  })

  describe('Query Latency (AC 4.2: p95 < 100ms)', () => {
    it('should query with complex filters in < 100ms (p95)', async () => {
      // Insert 1000 events for querying
      const events = await generateRealisticEvents(1000)
      for (const event of events) {
        await repository.saveEvent(event)
      }

      const queryDurations: number[] = []
      const numQueries = 100

      // Execute varied queries
      for (let i = 0; i < numQueries; i++) {
        const filters: NostrFilter[] = [
          {
            kinds: [1, 7],
            since: Math.floor(Date.now() / 1000) - 3600,
            limit: 50,
          },
        ]

        const startTime = performance.now()
        await repository.queryEventsByFilters(filters)
        const endTime = performance.now()

        queryDurations.push(endTime - startTime)
      }

      // Calculate p95 latency
      const sortedDurations = queryDurations.sort((a, b) => a - b)
      const p95Index = Math.floor(sortedDurations.length * 0.95)
      const p95Latency = sortedDurations[p95Index]

      console.log(`Query latency p95: ${p95Latency.toFixed(2)}ms`)

      // Target: p95 < 100ms
      expect(p95Latency).toBeLessThan(100)
    }, 30000)

    it('should handle complex tag-based queries efficiently', async () => {
      // Insert events with varied tags
      const events = await generateRealisticEvents(1000)
      for (const event of events) {
        await repository.saveEvent(event)
      }

      // Complex query with tag filters
      const filters: NostrFilter[] = [
        {
          kinds: [7],
          '#e': [events[0].id, events[1].id, events[2].id],
          limit: 100,
        },
      ]

      const startTime = performance.now()
      await repository.queryEventsByFilters(filters)
      const endTime = performance.now()

      const duration = endTime - startTime

      console.log(`Complex tag query: ${duration.toFixed(2)}ms`)

      // Should complete in reasonable time
      expect(duration).toBeLessThan(100)
    })
  })

  describe('Cache Hit Rate (AC 4.3: > 80%)', () => {
    it('should achieve > 80% cache hit rate with realistic workload', async () => {
      // Insert 100 events
      const events = await generateRealisticEvents(100)
      for (const event of events) {
        await repository.saveEvent(event)
      }

      // Simulate realistic read pattern:
      // - 20% of events are "hot" (frequently accessed)
      // - 80% of reads go to hot events
      const hotEvents = events.slice(0, 20)

      // Perform 1000 reads
      for (let i = 0; i < 1000; i++) {
        const isHotRead = Math.random() < 0.8
        const event = isHotRead
          ? hotEvents[Math.floor(Math.random() * hotEvents.length)]
          : events[Math.floor(Math.random() * events.length)]

        await repository.getEvent(event.id)
      }

      const cacheHitRate = await stats.getCacheHitRate()

      console.log(`Cache hit rate: ${(cacheHitRate * 100).toFixed(1)}%`)

      // Target: > 80% cache hit rate
      expect(cacheHitRate).toBeGreaterThan(0.8)
    })

    it('should cache query results effectively', async () => {
      const events = await generateRealisticEvents(100)
      for (const event of events) {
        await repository.saveEvent(event)
      }

      const commonFilter: NostrFilter[] = [{ kinds: [1], limit: 50 }]

      // First query - cache miss
      await repository.queryEventsByFilters(commonFilter)

      // Repeated queries - should hit cache
      for (let i = 0; i < 10; i++) {
        await repository.queryEventsByFilters(commonFilter)
      }

      // Cache hit rate should be high due to repeated queries
      const hitRate = await stats.getCacheHitRate()

      console.log(`Query cache hit rate: ${(hitRate * 100).toFixed(1)}%`)

      expect(hitRate).toBeGreaterThan(0.7)
    })
  })

  describe('Concurrent Writes (AC 4.4: 10 parallel writers, no conflicts)', () => {
    it('should handle concurrent writes without conflicts', async () => {
      const writersCount = 10
      const eventsPerWriter = 100

      // Generate events for each writer
      const writerEvents: NostrEvent[][] = []
      for (let i = 0; i < writersCount; i++) {
        writerEvents.push(await generateRealisticEvents(eventsPerWriter))
      }

      // Launch parallel writers
      const writePromises = writerEvents.map(async (events, writerIndex) => {
        for (const event of events) {
          await repository.saveEvent(event)
        }
        console.log(`Writer ${writerIndex} completed`)
      })

      // Wait for all writers to complete
      await Promise.all(writePromises)

      // Verify all events were written
      const totalEvents = await stats.getTotalEventCount()

      expect(totalEvents).toBe(writersCount * eventsPerWriter)
    }, 60000)

    it('should handle concurrent writes and reads', async () => {
      // Insert initial events
      const events = await generateRealisticEvents(500)
      for (const event of events) {
        await repository.saveEvent(event)
      }

      // Concurrent writers
      const writePromises = Array.from({ length: 5 }, async () => {
        const newEvents = await generateRealisticEvents(100)
        for (const event of newEvents) {
          await repository.saveEvent(event)
        }
      })

      // Concurrent readers
      const readPromises = Array.from({ length: 5 }, async () => {
        for (let i = 0; i < 100; i++) {
          const randomEvent = events[Math.floor(Math.random() * events.length)]
          await repository.getEvent(randomEvent.id)
        }
      })

      // Execute concurrently
      await Promise.all([...writePromises, ...readPromises])

      // Verify final state
      const totalEvents = await stats.getTotalEventCount()

      // Should have initial 500 + (5 writers * 100) = 1000 events
      expect(totalEvents).toBe(1000)
    }, 60000)
  })

  describe('End-to-End Performance', () => {
    it('should maintain performance targets under mixed workload', async () => {
      // Realistic mixed workload: writes, reads, queries
      const events = await generateRealisticEvents(2000)

      const startTime = performance.now()

      // Write events
      for (const event of events) {
        await repository.saveEvent(event)
      }

      // Perform reads
      for (let i = 0; i < 500; i++) {
        const randomEvent = events[Math.floor(Math.random() * events.length)]
        await repository.getEvent(randomEvent.id)
      }

      // Perform queries
      for (let i = 0; i < 100; i++) {
        await repository.queryEventsByFilters([
          { kinds: [1, 7], limit: 50 },
        ])
      }

      const endTime = performance.now()
      const totalDuration = (endTime - startTime) / 1000

      const metrics = await stats.getQueryPerformanceMetrics()
      const cacheHitRate = await stats.getCacheHitRate()

      console.log(`Mixed workload completed in ${totalDuration.toFixed(2)}s`)
      console.log(`Query p95: ${metrics.p95.toFixed(2)}ms`)
      console.log(`Cache hit rate: ${(cacheHitRate * 100).toFixed(1)}%`)

      // All metrics should meet targets
      expect(metrics.p95).toBeLessThan(100)
      expect(cacheHitRate).toBeGreaterThan(0.5) // Lower due to write-heavy workload
    }, 120000) // 2 minute timeout
  })
})
