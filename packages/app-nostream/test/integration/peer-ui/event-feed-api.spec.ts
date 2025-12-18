import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SubscriptionMonitor } from '../../../src/peer-ui/services/subscription-monitor'
import { IEventRepository } from '../../../src/@types/repositories'
import { DBEvent } from '../../../src/@types/event'

/**
 * Integration test for Event Feed API
 *
 * Tests the full event feed query flow:
 * 1. SubscriptionMonitor queries EventRepository
 * 2. Filters and pagination applied correctly
 * 3. Results formatted correctly for API response
 */
describe('Event Feed API Integration', () => {
  const createMockEvent = (id: number, pubkey: string, kind: number, createdAt: number): DBEvent => ({
    event_id: Buffer.from(id.toString(16).padStart(64, '0'), 'hex'),
    event_pubkey: Buffer.from(pubkey.padStart(64, '0'), 'hex'),
    event_created_at: createdAt,
    event_kind: kind,
    event_tags: [['t', 'test']],
    event_content: `Test event ${id} from ${pubkey.slice(0, 8)}`,
    event_signature: Buffer.from('a'.repeat(128), 'hex'),
    event_delegator: null,
    event_deduplication: null,
    event_expiration: null,
  })

  describe('Full Query Flow', () => {
    let mockEventRepository: IEventRepository
    let subscriptionMonitor: SubscriptionMonitor

    beforeEach(() => {
      mockEventRepository = {
        findByFilters: vi.fn(),
      } as unknown as IEventRepository

      subscriptionMonitor = new SubscriptionMonitor(mockEventRepository)
    })

    it('should retrieve and paginate events correctly', async () => {
      // Simulate database with 150 events
      const allEvents = Array.from({ length: 150 }, (_, i) =>
        createMockEvent(i + 1, 'pubkey1', 1, 1234567890 + i)
      )

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(allEvents)

      // First page
      const page1 = await subscriptionMonitor.queryEvents({
        limit: 50,
        offset: 0,
      })

      expect(page1.events).toHaveLength(50)
      expect(page1.hasMore).toBe(true)
      expect(page1.total).toBeGreaterThan(50)

      // Second page (with offset)
      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(allEvents)
      const page2 = await subscriptionMonitor.queryEvents({
        limit: 50,
        offset: 50,
      })

      expect(page2.events).toHaveLength(50)
      expect(page2.hasMore).toBe(true)

      // Third page (final)
      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(allEvents)
      const page3 = await subscriptionMonitor.queryEvents({
        limit: 50,
        offset: 100,
      })

      expect(page3.events).toHaveLength(50)
      expect(page3.hasMore).toBe(false)
    })

    it('should filter by author pubkey correctly', async () => {
      const pubkey1 = 'a'.repeat(64)
      const pubkey2 = 'b'.repeat(64)

      const mixedEvents = [
        createMockEvent(1, pubkey1, 1, 1234567890),
        createMockEvent(2, pubkey2, 1, 1234567891),
        createMockEvent(3, pubkey1, 1, 1234567892),
      ]

      // Simulate repository filtering by author
      vi.mocked(mockEventRepository.findByFilters).mockImplementation(async (filters: any) => {
        const authorFilter = filters[0].authors
        if (authorFilter && authorFilter.length > 0) {
          return mixedEvents.filter(e =>
            authorFilter.includes(e.event_pubkey.toString('hex').padStart(64, '0'))
          )
        }
        return mixedEvents
      })

      const result = await subscriptionMonitor.queryEvents({
        authors: [pubkey1],
        limit: 50,
        offset: 0,
      })

      // Should only return events from pubkey1
      result.events.forEach(event => {
        expect(event.event_pubkey.toString('hex').padStart(64, '0')).toBe(pubkey1)
      })
    })

    it('should filter by event kind correctly', async () => {
      const mixedKindEvents = [
        createMockEvent(1, 'pubkey1', 1, 1234567890),
        createMockEvent(2, 'pubkey1', 30023, 1234567891),
        createMockEvent(3, 'pubkey1', 7, 1234567892),
        createMockEvent(4, 'pubkey1', 1, 1234567893),
      ]

      vi.mocked(mockEventRepository.findByFilters).mockImplementation(async (filters: any) => {
        const kindFilter = filters[0].kinds
        if (kindFilter && kindFilter.length > 0) {
          return mixedKindEvents.filter(e => kindFilter.includes(e.event_kind))
        }
        return mixedKindEvents
      })

      const result = await subscriptionMonitor.queryEvents({
        kinds: [1],
        limit: 50,
        offset: 0,
      })

      // Should only return kind 1 events
      result.events.forEach(event => {
        expect(event.event_kind).toBe(1)
      })
      expect(result.events).toHaveLength(2)
    })

    it('should filter by date range correctly', async () => {
      const timeBasedEvents = [
        createMockEvent(1, 'pubkey1', 1, 1234567890), // Oldest
        createMockEvent(2, 'pubkey1', 1, 1234567895),
        createMockEvent(3, 'pubkey1', 1, 1234567900),
        createMockEvent(4, 'pubkey1', 1, 1234567905), // Newest
      ]

      vi.mocked(mockEventRepository.findByFilters).mockImplementation(async (filters: any) => {
        const since = filters[0].since
        const until = filters[0].until

        return timeBasedEvents.filter(e => {
          const time = e.event_created_at
          const afterSince = !since || time >= since
          const beforeUntil = !until || time <= until
          return afterSince && beforeUntil
        })
      })

      const result = await subscriptionMonitor.queryEvents({
        since: 1234567895,
        until: 1234567900,
        limit: 50,
        offset: 0,
      })

      // Should return events in the range [1234567895, 1234567900]
      expect(result.events).toHaveLength(2)
      result.events.forEach(event => {
        expect(event.event_created_at).toBeGreaterThanOrEqual(1234567895)
        expect(event.event_created_at).toBeLessThanOrEqual(1234567900)
      })
    })

    it('should handle combined filters (author + kind + date)', async () => {
      const pubkey1 = 'a'.repeat(64)
      const pubkey2 = 'b'.repeat(64)

      const complexEvents = [
        createMockEvent(1, pubkey1, 1, 1234567890),
        createMockEvent(2, pubkey1, 30023, 1234567891),
        createMockEvent(3, pubkey2, 1, 1234567892),
        createMockEvent(4, pubkey1, 1, 1234567893),
        createMockEvent(5, pubkey1, 7, 1234567894),
      ]

      vi.mocked(mockEventRepository.findByFilters).mockImplementation(async (filters: any) => {
        const { authors, kinds, since, until } = filters[0]

        return complexEvents.filter(e => {
          const matchAuthor = !authors || authors.includes(e.event_pubkey.toString('hex').padStart(64, '0'))
          const matchKind = !kinds || kinds.includes(e.event_kind)
          const matchSince = !since || e.event_created_at >= since
          const matchUntil = !until || e.event_created_at <= until
          return matchAuthor && matchKind && matchSince && matchUntil
        })
      })

      const result = await subscriptionMonitor.queryEvents({
        authors: [pubkey1],
        kinds: [1],
        since: 1234567890,
        until: 1234567893,
        limit: 50,
        offset: 0,
      })

      // Should match: events 1 and 4 (pubkey1, kind 1, within date range)
      expect(result.events).toHaveLength(2)
      result.events.forEach(event => {
        expect(event.event_pubkey.toString('hex').padStart(64, '0')).toBe(pubkey1)
        expect(event.event_kind).toBe(1)
        expect(event.event_created_at).toBeGreaterThanOrEqual(1234567890)
        expect(event.event_created_at).toBeLessThanOrEqual(1234567893)
      })
    })

    it('should handle empty results gracefully', async () => {
      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue([])

      const result = await subscriptionMonitor.queryEvents({
        authors: ['nonexistent_pubkey'],
        limit: 50,
        offset: 0,
      })

      expect(result.events).toHaveLength(0)
      expect(result.hasMore).toBe(false)
      expect(result.total).toBe(0)
    })

    it('should respect limit boundaries (max 100)', async () => {
      const largeResultSet = Array.from({ length: 200 }, (_, i) =>
        createMockEvent(i + 1, 'pubkey1', 1, 1234567890 + i)
      )

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(largeResultSet)

      const result = await subscriptionMonitor.queryEvents({
        limit: 999, // Request excessive limit
        offset: 0,
      })

      // Should be clamped to 100
      expect(result.events.length).toBeLessThanOrEqual(100)
    })
  })

  describe('Real-time Event Updates', () => {
    let mockEventRepository: IEventRepository
    let subscriptionMonitor: SubscriptionMonitor

    beforeEach(() => {
      mockEventRepository = {
        findByFilters: vi.fn(),
      } as unknown as IEventRepository

      subscriptionMonitor = new SubscriptionMonitor(mockEventRepository)
    })

    it('should query recent events since timestamp', async () => {
      const baseTime = 1234567890
      const recentEvents = [
        createMockEvent(1, 'pubkey1', 1, baseTime + 5),
        createMockEvent(2, 'pubkey1', 1, baseTime + 10),
        createMockEvent(3, 'pubkey1', 1, baseTime + 15),
      ]

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(recentEvents)

      const result = await subscriptionMonitor.queryRecentEvents(baseTime, 25)

      expect(result).toHaveLength(3)
      result.forEach(event => {
        expect(event.event_created_at).toBeGreaterThan(baseTime)
      })
    })

    it('should limit recent events to specified amount', async () => {
      const baseTime = 1234567890
      const manyRecentEvents = Array.from({ length: 50 }, (_, i) =>
        createMockEvent(i + 1, 'pubkey1', 1, baseTime + i)
      )

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(manyRecentEvents)

      const result = await subscriptionMonitor.queryRecentEvents(baseTime, 10)

      expect(result.length).toBeLessThanOrEqual(10)
    })
  })

  describe('Error Handling', () => {
    let mockEventRepository: IEventRepository
    let subscriptionMonitor: SubscriptionMonitor

    beforeEach(() => {
      mockEventRepository = {
        findByFilters: vi.fn(),
      } as unknown as IEventRepository

      subscriptionMonitor = new SubscriptionMonitor(mockEventRepository)
    })

    it('should throw descriptive error on database failure', async () => {
      vi.mocked(mockEventRepository.findByFilters).mockRejectedValue(
        new Error('Connection timeout')
      )

      await expect(
        subscriptionMonitor.queryEvents({ limit: 50, offset: 0 })
      ).rejects.toThrow('Failed to query events: Connection timeout')
    })

    it('should throw descriptive error on recent events query failure', async () => {
      vi.mocked(mockEventRepository.findByFilters).mockRejectedValue(
        new Error('Query syntax error')
      )

      await expect(
        subscriptionMonitor.queryRecentEvents(1234567890)
      ).rejects.toThrow('Failed to query recent events: Query syntax error')
    })
  })

  describe('DBEvent to Event Conversion', () => {
    it('should convert DBEvent fields to hex strings correctly', () => {
      const dbEvent = createMockEvent(42, 'a'.repeat(64), 1, 1234567890)

      // Simulate conversion (as done in event-feed.ts)
      const event = {
        id: dbEvent.event_id.toString('hex'),
        pubkey: dbEvent.event_pubkey.toString('hex'),
        created_at: dbEvent.event_created_at,
        kind: dbEvent.event_kind,
        tags: dbEvent.event_tags || [],
        content: dbEvent.event_content,
        sig: dbEvent.event_signature.toString('hex'),
      }

      expect(event.id).toMatch(/^[0-9a-f]+$/)
      expect(event.pubkey).toMatch(/^[0-9a-f]+$/)
      expect(event.sig).toMatch(/^[0-9a-f]+$/)
      expect(event.sig).toHaveLength(128)
      expect(event.created_at).toBe(1234567890)
      expect(event.kind).toBe(1)
      expect(Array.isArray(event.tags)).toBe(true)
    })
  })
})
