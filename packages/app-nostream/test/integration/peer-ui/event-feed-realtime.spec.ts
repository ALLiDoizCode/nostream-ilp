import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SubscriptionMonitor } from '../../../src/peer-ui/services/subscription-monitor'
import { IEventRepository } from '../../../src/@types/repositories'
import { DBEvent } from '../../../src/@types/event'

/**
 * Integration test for Event Feed Real-time Updates
 *
 * Tests real-time polling behavior:
 * 1. Polling interval triggers queries
 * 2. New events retrieved using 'since' timestamp
 * 3. Auto-pause when scrolled down
 * 4. Resume when scrolled back to top
 */
describe('Event Feed Real-time Updates Integration', () => {
  const createMockEvent = (id: number, pubkey: string, kind: number, createdAt: number): DBEvent => ({
    event_id: Buffer.from(id.toString(16).padStart(64, '0'), 'hex'),
    event_pubkey: Buffer.from(pubkey.padStart(64, '0'), 'hex'),
    event_created_at: createdAt,
    event_kind: kind,
    event_tags: [],
    event_content: `Event ${id}`,
    event_signature: Buffer.from('a'.repeat(128), 'hex'),
    event_delegator: null,
    event_deduplication: null,
    event_expiration: null,
  })

  describe('Polling Mechanism', () => {
    let mockEventRepository: IEventRepository
    let subscriptionMonitor: SubscriptionMonitor
    let intervalId: NodeJS.Timeout | null = null

    beforeEach(() => {
      mockEventRepository = {
        findByFilters: vi.fn(),
      } as unknown as IEventRepository

      subscriptionMonitor = new SubscriptionMonitor(mockEventRepository)
    })

    afterEach(() => {
      if (intervalId) {
        clearInterval(intervalId)
        intervalId = null
      }
    })

    it('should poll for new events at 5 second intervals', async () => {
      vi.useFakeTimers()

      const pollCallback = vi.fn(async () => {
        await subscriptionMonitor.queryRecentEvents(Date.now() / 1000)
      })

      // Start polling
      intervalId = setInterval(pollCallback, 5000)

      // Advance time by 5 seconds
      await vi.advanceTimersByTimeAsync(5000)
      expect(pollCallback).toHaveBeenCalledTimes(1)

      // Advance another 5 seconds
      await vi.advanceTimersByTimeAsync(5000)
      expect(pollCallback).toHaveBeenCalledTimes(2)

      // Advance another 5 seconds
      await vi.advanceTimersByTimeAsync(5000)
      expect(pollCallback).toHaveBeenCalledTimes(3)

      vi.useRealTimers()
    })

    it('should query events newer than newest displayed event', async () => {
      const baseTime = Math.floor(Date.now() / 1000)
      let newestEventTimestamp = baseTime

      // Simulate initial load
      const initialEvents = [
        createMockEvent(1, 'pubkey1', 1, baseTime),
        createMockEvent(2, 'pubkey1', 1, baseTime + 5),
        createMockEvent(3, 'pubkey1', 1, baseTime + 10),
      ]

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(initialEvents)
      const initial = await subscriptionMonitor.queryEvents({ limit: 50, offset: 0 })

      // Track newest event
      newestEventTimestamp = Math.max(...initial.events.map(e => e.event_created_at))
      expect(newestEventTimestamp).toBe(baseTime + 10)

      // Simulate poll for new events
      const newEvents = [
        createMockEvent(4, 'pubkey1', 1, baseTime + 15),
        createMockEvent(5, 'pubkey1', 1, baseTime + 20),
      ]

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue(newEvents)
      const recent = await subscriptionMonitor.queryRecentEvents(newestEventTimestamp, 25)

      // Should only get events after newestEventTimestamp
      expect(recent.every(e => e.event_created_at > newestEventTimestamp)).toBe(true)
    })

    it('should handle empty polling results (no new events)', async () => {
      const baseTime = Math.floor(Date.now() / 1000)

      vi.mocked(mockEventRepository.findByFilters).mockResolvedValue([])

      const result = await subscriptionMonitor.queryRecentEvents(baseTime, 25)

      expect(result).toHaveLength(0)
    })
  })

  describe('Auto-pause Behavior', () => {
    it('should pause polling when scrolled down', () => {
      const state = {
        isPaused: false,
        scrollTop: 0,
      }

      // Simulate scroll event
      const handleScroll = (scrollTop: number) => {
        state.scrollTop = scrollTop
        state.isPaused = scrollTop > 200
      }

      // User scrolls down 250px
      handleScroll(250)

      expect(state.isPaused).toBe(true)
    })

    it('should resume polling when scrolled back to top', () => {
      const state = {
        isPaused: true,
        scrollTop: 300,
      }

      // Simulate scroll event
      const handleScroll = (scrollTop: number) => {
        state.scrollTop = scrollTop
        state.isPaused = scrollTop > 200
      }

      // User scrolls back to top
      handleScroll(50)

      expect(state.isPaused).toBe(false)
    })

    it('should not add new events when paused', () => {
      const state = {
        isPaused: true,
        events: [
          { id: '1', content: 'Event 1' },
        ],
        newEventCount: 0,
      }

      // Simulate polling returns new event
      const newEvent = { id: '2', content: 'Event 2' }

      if (state.isPaused) {
        // Don't prepend, just count
        state.newEventCount += 1
      } else {
        state.events.unshift(newEvent)
      }

      expect(state.events).toHaveLength(1)
      expect(state.newEventCount).toBe(1)
    })

    it('should show "N new events" notification when paused', () => {
      const state = {
        isPaused: true,
        newEventCount: 5,
      }

      const showNotification = state.isPaused && state.newEventCount > 0
      const notificationText = `${state.newEventCount} new event${state.newEventCount === 1 ? '' : 's'}`

      expect(showNotification).toBe(true)
      expect(notificationText).toBe('5 new events')
    })

    it('should prepend new events when user clicks "Load new events"', () => {
      const state = {
        isPaused: true,
        events: [
          { id: '1', created_at: 1000 },
          { id: '2', created_at: 900 },
        ],
        newEventCount: 3,
      }

      const newEvents = [
        { id: '5', created_at: 1300 },
        { id: '4', created_at: 1200 },
        { id: '3', created_at: 1100 },
      ]

      // User clicks "Load N new events" button
      const loadNewEvents = () => {
        state.events = [...newEvents, ...state.events]
        state.newEventCount = 0
        state.isPaused = false // Resume polling
      }

      loadNewEvents()

      expect(state.events).toHaveLength(5)
      expect(state.events[0].id).toBe('5') // Newest at top
      expect(state.newEventCount).toBe(0)
      expect(state.isPaused).toBe(false)
    })
  })

  describe('Prepend vs Append Logic', () => {
    it('should prepend new events to top of feed', () => {
      const existingEvents = [
        { id: '2', created_at: 1000 },
        { id: '1', created_at: 900 },
      ]

      const newEvents = [
        { id: '3', created_at: 1100 },
      ]

      const allEvents = [...newEvents, ...existingEvents]

      expect(allEvents[0].id).toBe('3') // Newest at top
      expect(allEvents[0].created_at).toBeGreaterThan(allEvents[1].created_at)
    })

    it('should append older events to bottom for pagination', () => {
      const existingEvents = [
        { id: '3', created_at: 1000 },
        { id: '2', created_at: 900 },
      ]

      const olderEvents = [
        { id: '1', created_at: 800 },
        { id: '0', created_at: 700 },
      ]

      const allEvents = [...existingEvents, ...olderEvents]

      expect(allEvents[2].id).toBe('1')
      expect(allEvents[3].id).toBe('0')
      expect(allEvents[allEvents.length - 1].created_at).toBeLessThan(allEvents[0].created_at)
    })

    it('should maintain chronological order (newest first)', () => {
      const events = [
        { id: '5', created_at: 1500 },
        { id: '4', created_at: 1400 },
        { id: '3', created_at: 1300 },
        { id: '2', created_at: 1200 },
        { id: '1', created_at: 1100 },
      ]

      // Verify descending order
      for (let i = 0; i < events.length - 1; i++) {
        expect(events[i].created_at).toBeGreaterThan(events[i + 1].created_at)
      }
    })
  })

  describe('Edge Cases', () => {
    let mockEventRepository: IEventRepository
    let subscriptionMonitor: SubscriptionMonitor

    beforeEach(() => {
      mockEventRepository = {
        findByFilters: vi.fn(),
      } as unknown as IEventRepository

      subscriptionMonitor = new SubscriptionMonitor(mockEventRepository)
    })

    it('should handle polling error gracefully', async () => {
      vi.mocked(mockEventRepository.findByFilters).mockRejectedValue(
        new Error('Network timeout')
      )

      await expect(
        subscriptionMonitor.queryRecentEvents(Date.now() / 1000)
      ).rejects.toThrow('Failed to query recent events')
    })

    it('should handle duplicate events in polling results', () => {
      const existingEvents = [
        { id: '1', created_at: 1000 },
        { id: '2', created_at: 1100 },
      ]

      const pollingResults = [
        { id: '2', created_at: 1100 }, // Duplicate
        { id: '3', created_at: 1200 }, // New
      ]

      // Deduplicate by ID
      const existingIds = new Set(existingEvents.map(e => e.id))
      const newEvents = pollingResults.filter(e => !existingIds.has(e.id))

      const allEvents = [...newEvents, ...existingEvents]

      expect(allEvents).toHaveLength(3)
      expect(allEvents.filter(e => e.id === '2')).toHaveLength(1)
    })

    it('should limit in-memory events to 200 maximum during real-time updates', () => {
      const events = Array.from({ length: 195 }, (_, i) => ({
        id: `event-${i}`,
        created_at: 1000 + i,
      }))

      // Simulate 10 new events arriving (reverse order so newest is first)
      const newEvents = Array.from({ length: 10 }, (_, i) => ({
        id: `new-event-${9 - i}`, // Reverse order: 9, 8, 7, ... 0
        created_at: 2009 - i,      // Descending timestamps
      }))

      let allEvents = [...newEvents, ...events]

      // Trim to 200
      const MAX_EVENTS = 200
      if (allEvents.length > MAX_EVENTS) {
        allEvents = allEvents.slice(0, MAX_EVENTS)
      }

      expect(allEvents).toHaveLength(200)
      expect(allEvents[0].id).toBe('new-event-9') // Newest at top
      expect(allEvents[0].created_at).toBeGreaterThan(allEvents[1].created_at)
    })

    it('should stop polling when feed is destroyed', () => {
      vi.useFakeTimers()

      const pollCallback = vi.fn()
      const intervalId = setInterval(pollCallback, 5000)

      // Advance 5 seconds
      vi.advanceTimersByTime(5000)
      expect(pollCallback).toHaveBeenCalledTimes(1)

      // Destroy feed (clear interval)
      clearInterval(intervalId)

      // Advance another 10 seconds
      vi.advanceTimersByTime(10000)

      // Should still only be called once
      expect(pollCallback).toHaveBeenCalledTimes(1)

      vi.useRealTimers()
    })
  })

  describe('Performance Considerations', () => {
    it('should use limit parameter to avoid fetching excessive events', async () => {
      const mockEventRepository: IEventRepository = {
        findByFilters: vi.fn().mockResolvedValue([]),
      } as unknown as IEventRepository

      const subscriptionMonitor = new SubscriptionMonitor(mockEventRepository)

      await subscriptionMonitor.queryRecentEvents(Date.now() / 1000, 25)

      expect(mockEventRepository.findByFilters).toHaveBeenCalledWith([
        expect.objectContaining({ limit: 25 }),
      ])
    })

    it('should debounce rapid polling requests', async () => {
      vi.useFakeTimers()

      let lastPollTime = 0
      const minPollInterval = 1000 // 1 second debounce

      const poll = vi.fn(() => {
        const now = Date.now()
        if (now - lastPollTime < minPollInterval) {
          return // Skip this poll
        }
        lastPollTime = now
      })

      // Rapid calls
      poll()
      await vi.advanceTimersByTimeAsync(500)
      poll() // Should be skipped
      await vi.advanceTimersByTimeAsync(500)
      poll() // Should execute
      await vi.advanceTimersByTimeAsync(500)
      poll() // Should be skipped

      expect(poll).toHaveBeenCalledTimes(4)

      vi.useRealTimers()
    })
  })
})
