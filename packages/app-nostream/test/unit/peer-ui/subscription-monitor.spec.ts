import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SubscriptionMonitor, EventFeedFilters } from '../../../src/peer-ui/services/subscription-monitor'
import { IEventRepository } from '../../../src/@types/repositories'
import { DBEvent } from '../../../src/@types/event'

describe('SubscriptionMonitor', () => {
  let subscriptionMonitor: SubscriptionMonitor
  let mockEventRepository: IEventRepository

  const createMockEvent = (id: number, pubkey: string, kind: number, createdAt: number): DBEvent => ({
    event_id: Buffer.from(id.toString(16).padStart(64, '0'), 'hex'),
    event_pubkey: Buffer.from(pubkey.padStart(64, '0'), 'hex'),
    event_created_at: createdAt,
    event_kind: kind,
    event_tags: [],
    event_content: `Test event ${id}`,
    event_signature: Buffer.from('0'.repeat(128), 'hex'),
    event_delegator: null,
    event_deduplication: null,
    event_expiration: null,
  })

  beforeEach(() => {
    mockEventRepository = {
      findByFilters: vi.fn(),
    } as unknown as IEventRepository

    subscriptionMonitor = new SubscriptionMonitor(mockEventRepository)
  })

  describe('queryEvents', () => {
    it('should query events with default pagination', async () => {
      const mockEvents = [
        createMockEvent(1, 'pubkey1', 1, 1234567890),
        createMockEvent(2, 'pubkey2', 1, 1234567891),
      ]

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(mockEvents)

      const result = await subscriptionMonitor.queryEvents({
        limit: 50,
        offset: 0,
      })

      expect(result.events).toHaveLength(2)
      expect(result.total).toBe(2)
      expect(result.hasMore).toBe(false)
      expect(mockEventRepository.findByFilters).toHaveBeenCalledWith([
        { limit: 51 },
      ])
    })

    it('should filter by authors', async () => {
      const pubkey1 = 'a'.repeat(64)
      const pubkey2 = 'b'.repeat(64)
      const mockEvents = [
        createMockEvent(1, pubkey1, 1, 1234567890),
      ]

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(mockEvents)

      const filters: EventFeedFilters = {
        authors: [pubkey1, pubkey2],
        limit: 50,
        offset: 0,
      }

      await subscriptionMonitor.queryEvents(filters)

      expect(mockEventRepository.findByFilters).toHaveBeenCalledWith([
        {
          authors: [pubkey1, pubkey2],
          limit: 51,
        },
      ])
    })

    it('should filter by kinds', async () => {
      const mockEvents = [
        createMockEvent(1, 'pubkey1', 1, 1234567890),
        createMockEvent(2, 'pubkey2', 30023, 1234567891),
      ]

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(mockEvents)

      const filters: EventFeedFilters = {
        kinds: [1, 30023],
        limit: 50,
        offset: 0,
      }

      await subscriptionMonitor.queryEvents(filters)

      expect(mockEventRepository.findByFilters).toHaveBeenCalledWith([
        {
          kinds: [1, 30023],
          limit: 51,
        },
      ])
    })

    it('should filter by date range (since/until)', async () => {
      const mockEvents = [
        createMockEvent(1, 'pubkey1', 1, 1234567890),
      ]

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(mockEvents)

      const filters: EventFeedFilters = {
        since: 1234567800,
        until: 1234567900,
        limit: 50,
        offset: 0,
      }

      await subscriptionMonitor.queryEvents(filters)

      expect(mockEventRepository.findByFilters).toHaveBeenCalledWith([
        {
          since: 1234567800,
          until: 1234567900,
          limit: 51,
        },
      ])
    })

    it('should enforce maximum limit of 100', async () => {
      const mockEvents = Array.from({ length: 100 }, (_, i) =>
        createMockEvent(i + 1, 'pubkey1', 1, 1234567890 + i)
      )

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(mockEvents)

      const result = await subscriptionMonitor.queryEvents({
        limit: 999, // Request excessive limit
        offset: 0,
      })

      expect(result.events.length).toBeLessThanOrEqual(100)
      expect(mockEventRepository.findByFilters).toHaveBeenCalledWith([
        { limit: 101 }, // 100 + 1 to check hasMore
      ])
    })

    it('should enforce minimum limit of 1', async () => {
      const mockEvents = [createMockEvent(1, 'pubkey1', 1, 1234567890)]

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(mockEvents)

      await subscriptionMonitor.queryEvents({
        limit: -5,
        offset: 0,
      })

      expect(mockEventRepository.findByFilters).toHaveBeenCalledWith([
        { limit: 2 }, // 1 + 1 to check hasMore
      ])
    })

    it('should handle offset pagination', async () => {
      const mockEvents = Array.from({ length: 100 }, (_, i) =>
        createMockEvent(i + 1, 'pubkey1', 1, 1234567890 + i)
      )

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(mockEvents)

      const result = await subscriptionMonitor.queryEvents({
        limit: 25,
        offset: 50,
      })

      // Should slice from offset 50, take 25 events
      expect(result.events).toHaveLength(25)
      expect(result.hasMore).toBe(true)
    })

    it('should set hasMore to true when more results exist', async () => {
      const mockEvents = Array.from({ length: 51 }, (_, i) =>
        createMockEvent(i + 1, 'pubkey1', 1, 1234567890 + i)
      )

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(mockEvents)

      const result = await subscriptionMonitor.queryEvents({
        limit: 50,
        offset: 0,
      })

      expect(result.events).toHaveLength(50) // Trimmed to limit
      expect(result.hasMore).toBe(true)
    })

    it('should set hasMore to false when no more results', async () => {
      const mockEvents = Array.from({ length: 25 }, (_, i) =>
        createMockEvent(i + 1, 'pubkey1', 1, 1234567890 + i)
      )

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(mockEvents)

      const result = await subscriptionMonitor.queryEvents({
        limit: 50,
        offset: 0,
      })

      expect(result.events).toHaveLength(25)
      expect(result.hasMore).toBe(false)
    })

    it('should throw error when repository query fails', async () => {
      vi.mocked(mockEventRepository.findByFilters).mockRejectedValue(
        new Error('Database connection failed')
      )

      await expect(
        subscriptionMonitor.queryEvents({ limit: 50, offset: 0 })
      ).rejects.toThrow('Failed to query events: Database connection failed')
    })

    it('should combine multiple filters correctly', async () => {
      const mockEvents = [createMockEvent(1, 'pubkey1', 1, 1234567890)]

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(mockEvents)

      const filters: EventFeedFilters = {
        authors: ['pubkey1', 'pubkey2'],
        kinds: [1, 30023],
        since: 1234567800,
        until: 1234567900,
        limit: 25,
        offset: 10,
      }

      await subscriptionMonitor.queryEvents(filters)

      expect(mockEventRepository.findByFilters).toHaveBeenCalledWith([
        {
          authors: ['pubkey1', 'pubkey2'],
          kinds: [1, 30023],
          since: 1234567800,
          until: 1234567900,
          limit: 26,
        },
      ])
    })
  })

  describe('queryRecentEvents', () => {
    it('should query events since timestamp', async () => {
      const mockEvents = [
        createMockEvent(1, 'pubkey1', 1, 1234567890),
        createMockEvent(2, 'pubkey2', 1, 1234567891),
      ]

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(mockEvents)

      const result = await subscriptionMonitor.queryRecentEvents(1234567800, 25)

      expect(result).toHaveLength(2)
      expect(mockEventRepository.findByFilters).toHaveBeenCalledWith([
        {
          since: 1234567800,
          limit: 25,
        },
      ])
    })

    it('should enforce maximum limit of 100 for recent events', async () => {
      const mockEvents = Array.from({ length: 50 }, (_, i) =>
        createMockEvent(i + 1, 'pubkey1', 1, 1234567890 + i)
      )

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(mockEvents)

      const result = await subscriptionMonitor.queryRecentEvents(1234567800, 999)

      expect(result.length).toBeLessThanOrEqual(100)
      expect(mockEventRepository.findByFilters).toHaveBeenCalledWith([
        {
          since: 1234567800,
          limit: 100,
        },
      ])
    })

    it('should throw error when query fails', async () => {
      vi.mocked(mockEventRepository.findByFilters).mockRejectedValue(
        new Error('Network timeout')
      )

      await expect(
        subscriptionMonitor.queryRecentEvents(1234567800)
      ).rejects.toThrow('Failed to query recent events: Network timeout')
    })

    it('should use default limit of 25 when not specified', async () => {
      const mockEvents = [createMockEvent(1, 'pubkey1', 1, 1234567890)]

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(mockEvents)

      await subscriptionMonitor.queryRecentEvents(1234567800)

      expect(mockEventRepository.findByFilters).toHaveBeenCalledWith([
        {
          since: 1234567800,
          limit: 25,
        },
      ])
    })
  })
})
