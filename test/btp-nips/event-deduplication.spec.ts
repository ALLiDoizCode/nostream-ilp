import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventDeduplicationCache } from '../../src/btp-nips/event-deduplication.js'

describe('EventDeduplicationCache', () => {
  let cache: EventDeduplicationCache

  beforeEach(() => {
    cache = new EventDeduplicationCache()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('hasSeenEvent', () => {
    it('should return false for new event', () => {
      const eventId = 'abc123'
      expect(cache.hasSeenEvent(eventId)).toBe(false)
    })

    it('should return true for seen event', () => {
      const eventId = 'abc123'
      cache.markAsSeen(eventId)
      expect(cache.hasSeenEvent(eventId)).toBe(true)
    })

    it('should return false after TTL expires (24 hours)', () => {
      const eventId = 'abc123'
      cache.markAsSeen(eventId)

      // Fast-forward 25 hours
      vi.advanceTimersByTime(25 * 60 * 60 * 1000)

      expect(cache.hasSeenEvent(eventId)).toBe(false)
    })

    it('should return true if within TTL (23 hours)', () => {
      const eventId = 'abc123'
      cache.markAsSeen(eventId)

      // Fast-forward 23 hours
      vi.advanceTimersByTime(23 * 60 * 60 * 1000)

      expect(cache.hasSeenEvent(eventId)).toBe(true)
    })

    it('should perform lazy cleanup on expired entries', () => {
      const eventId = 'abc123'
      cache.markAsSeen(eventId)

      expect(cache.size()).toBe(1)

      // Fast-forward 25 hours
      vi.advanceTimersByTime(25 * 60 * 60 * 1000)

      // hasSeenEvent should clean up expired entry
      cache.hasSeenEvent(eventId)

      expect(cache.size()).toBe(0)
    })
  })

  describe('markAsSeen', () => {
    it('should mark event as seen', () => {
      const eventId = 'abc123'
      cache.markAsSeen(eventId)

      expect(cache.hasSeenEvent(eventId)).toBe(true)
    })

    it('should handle marking same event multiple times', () => {
      const eventId = 'abc123'
      cache.markAsSeen(eventId)
      cache.markAsSeen(eventId)
      cache.markAsSeen(eventId)

      expect(cache.hasSeenEvent(eventId)).toBe(true)
      expect(cache.size()).toBe(1) // Only one entry
    })

    it('should update timestamp on re-mark', () => {
      const eventId = 'abc123'
      cache.markAsSeen(eventId)

      // Fast-forward 23 hours
      vi.advanceTimersByTime(23 * 60 * 60 * 1000)

      // Re-mark event (resets TTL)
      cache.markAsSeen(eventId)

      // Fast-forward another 23 hours (46 hours total from first mark, 23 hours from re-mark)
      vi.advanceTimersByTime(23 * 60 * 60 * 1000)

      // Should still be valid (TTL reset on re-mark)
      expect(cache.hasSeenEvent(eventId)).toBe(true)
    })
  })

  describe('cleanup', () => {
    it('should remove expired entries', () => {
      const event1 = 'event1'
      const event2 = 'event2'

      cache.markAsSeen(event1)

      // Fast-forward 12 hours
      vi.advanceTimersByTime(12 * 60 * 60 * 1000)

      cache.markAsSeen(event2)

      // Fast-forward 13 more hours (25 hours total, 13 hours for event2)
      vi.advanceTimersByTime(13 * 60 * 60 * 1000)

      expect(cache.size()).toBe(2)

      cache.cleanup()

      expect(cache.size()).toBe(1)
      expect(cache.hasSeenEvent(event1)).toBe(false) // Expired
      expect(cache.hasSeenEvent(event2)).toBe(true) // Still valid
    })

    it('should handle cleanup with no expired entries', () => {
      cache.markAsSeen('event1')
      cache.markAsSeen('event2')
      cache.markAsSeen('event3')

      expect(cache.size()).toBe(3)

      cache.cleanup()

      expect(cache.size()).toBe(3) // No entries removed
    })

    it('should handle cleanup with empty cache', () => {
      cache.cleanup()
      expect(cache.size()).toBe(0)
    })

    it('should remove all entries if all expired', () => {
      cache.markAsSeen('event1')
      cache.markAsSeen('event2')
      cache.markAsSeen('event3')

      // Fast-forward 25 hours
      vi.advanceTimersByTime(25 * 60 * 60 * 1000)

      cache.cleanup()

      expect(cache.size()).toBe(0)
    })
  })

  describe('performance', () => {
    it('should handle 10,000 events efficiently', () => {
      const startTime = performance.now()

      // Add 10,000 events
      for (let i = 0; i < 10000; i++) {
        cache.markAsSeen(`event${i}`)
      }

      const addTime = performance.now() - startTime

      expect(cache.size()).toBe(10000)
      expect(addTime).toBeLessThan(100) // Should complete in < 100ms

      // Check all events
      const checkStartTime = performance.now()

      for (let i = 0; i < 10000; i++) {
        expect(cache.hasSeenEvent(`event${i}`)).toBe(true)
      }

      const checkTime = performance.now() - checkStartTime

      expect(checkTime).toBeLessThan(50) // Should complete in < 50ms
    })

    it('should perform automatic cleanup every 1000 additions', () => {
      // Add 999 events
      for (let i = 0; i < 999; i++) {
        cache.markAsSeen(`event${i}`)
      }

      expect(cache.size()).toBe(999)

      // Fast-forward 25 hours (all entries expired)
      vi.advanceTimersByTime(25 * 60 * 60 * 1000)

      // Add 1000th event (triggers cleanup)
      cache.markAsSeen('event999')

      // All expired entries should be cleaned up, only new entry remains
      expect(cache.size()).toBe(1)
      expect(cache.hasSeenEvent('event999')).toBe(true)
    })
  })

  describe('size', () => {
    it('should return 0 for empty cache', () => {
      expect(cache.size()).toBe(0)
    })

    it('should return correct size after additions', () => {
      cache.markAsSeen('event1')
      expect(cache.size()).toBe(1)

      cache.markAsSeen('event2')
      expect(cache.size()).toBe(2)

      cache.markAsSeen('event3')
      expect(cache.size()).toBe(3)
    })
  })

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.markAsSeen('event1')
      cache.markAsSeen('event2')
      cache.markAsSeen('event3')

      expect(cache.size()).toBe(3)

      cache.clear()

      expect(cache.size()).toBe(0)
      expect(cache.hasSeenEvent('event1')).toBe(false)
      expect(cache.hasSeenEvent('event2')).toBe(false)
      expect(cache.hasSeenEvent('event3')).toBe(false)
    })
  })
})
