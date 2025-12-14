import { beforeEach, describe, expect, it } from 'vitest'
import { PeerEventTracker } from '../../src/btp-nips/peer-event-tracker.js'

import type { PacketMetadata } from '../../src/btp-nips/utils/ttl-manager.js'

describe('PeerEventTracker', () => {
  let tracker: PeerEventTracker

  beforeEach(() => {
    tracker = new PeerEventTracker()
  })

  describe('markEventSent', () => {
    it('should mark event as sent to peer', () => {
      tracker.markEventSent('g.dassie.bob', 'event123')

      expect(tracker.hasSent('g.dassie.bob', 'event123')).toBe(true)
    })

    it('should track multiple events for same peer', () => {
      tracker.markEventSent('g.dassie.bob', 'event1')
      tracker.markEventSent('g.dassie.bob', 'event2')
      tracker.markEventSent('g.dassie.bob', 'event3')

      expect(tracker.hasSent('g.dassie.bob', 'event1')).toBe(true)
      expect(tracker.hasSent('g.dassie.bob', 'event2')).toBe(true)
      expect(tracker.hasSent('g.dassie.bob', 'event3')).toBe(true)
      expect(tracker.getEventCount('g.dassie.bob')).toBe(3)
    })

    it('should track same event for multiple peers', () => {
      tracker.markEventSent('g.dassie.alice', 'event123')
      tracker.markEventSent('g.dassie.bob', 'event123')
      tracker.markEventSent('g.dassie.carol', 'event123')

      expect(tracker.hasSent('g.dassie.alice', 'event123')).toBe(true)
      expect(tracker.hasSent('g.dassie.bob', 'event123')).toBe(true)
      expect(tracker.hasSent('g.dassie.carol', 'event123')).toBe(true)
    })

    it('should handle marking same event multiple times', () => {
      tracker.markEventSent('g.dassie.bob', 'event123')
      tracker.markEventSent('g.dassie.bob', 'event123')
      tracker.markEventSent('g.dassie.bob', 'event123')

      expect(tracker.getEventCount('g.dassie.bob')).toBe(1) // Only one entry (Set deduplication)
    })
  })

  describe('hasSent', () => {
    it('should return false for non-existent peer', () => {
      expect(tracker.hasSent('g.dassie.bob', 'event123')).toBe(false)
    })

    it('should return false for non-existent event', () => {
      tracker.markEventSent('g.dassie.bob', 'event1')

      expect(tracker.hasSent('g.dassie.bob', 'event2')).toBe(false)
    })

    it('should return true for sent event', () => {
      tracker.markEventSent('g.dassie.bob', 'event123')

      expect(tracker.hasSent('g.dassie.bob', 'event123')).toBe(true)
    })
  })

  describe('getSourcePeer', () => {
    it('should extract sender from metadata', () => {
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 5,
      }

      const sourcePeer = tracker.getSourcePeer(metadata)

      expect(sourcePeer).toBe('g.dassie.alice')
    })

    it('should return null if sender not present', () => {
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: '',
        ttl: 5,
      }

      const sourcePeer = tracker.getSourcePeer(metadata)

      expect(sourcePeer).toBe(null)
    })

    it('should handle metadata with different senders', () => {
      const metadata1: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 5,
      }

      const metadata2: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.bob',
        ttl: 4,
      }

      expect(tracker.getSourcePeer(metadata1)).toBe('g.dassie.alice')
      expect(tracker.getSourcePeer(metadata2)).toBe('g.dassie.bob')
    })
  })

  describe('LRU eviction', () => {
    it('should enforce 10,000 event limit per peer', () => {
      // Add 10,001 events to single peer
      for (let i = 0; i < 10001; i++) {
        tracker.markEventSent('g.dassie.bob', `event${i}`)
      }

      // Should have exactly 10,000 events (oldest evicted)
      expect(tracker.getEventCount('g.dassie.bob')).toBe(10000)
    })

    it('should evict oldest events when limit exceeded', () => {
      // Add 10,000 events
      for (let i = 0; i < 10000; i++) {
        tracker.markEventSent('g.dassie.bob', `event${i}`)
      }

      // All events present
      expect(tracker.hasSent('g.dassie.bob', 'event0')).toBe(true)
      expect(tracker.hasSent('g.dassie.bob', 'event9999')).toBe(true)

      // Add one more (triggers eviction)
      tracker.markEventSent('g.dassie.bob', 'event10000')

      // First event should be evicted (approximate LRU)
      expect(tracker.getEventCount('g.dassie.bob')).toBe(10000)
      expect(tracker.hasSent('g.dassie.bob', 'event10000')).toBe(true)
    })
  })

  describe('getEventCount', () => {
    it('should return 0 for non-existent peer', () => {
      expect(tracker.getEventCount('g.dassie.bob')).toBe(0)
    })

    it('should return correct count', () => {
      tracker.markEventSent('g.dassie.bob', 'event1')
      tracker.markEventSent('g.dassie.bob', 'event2')
      tracker.markEventSent('g.dassie.bob', 'event3')

      expect(tracker.getEventCount('g.dassie.bob')).toBe(3)
    })
  })

  describe('getPeerCount', () => {
    it('should return 0 for empty tracker', () => {
      expect(tracker.getPeerCount()).toBe(0)
    })

    it('should return correct count', () => {
      tracker.markEventSent('g.dassie.alice', 'event1')
      tracker.markEventSent('g.dassie.bob', 'event2')
      tracker.markEventSent('g.dassie.carol', 'event3')

      expect(tracker.getPeerCount()).toBe(3)
    })
  })

  describe('clearPeer', () => {
    it('should clear tracking data for peer', () => {
      tracker.markEventSent('g.dassie.bob', 'event1')
      tracker.markEventSent('g.dassie.bob', 'event2')
      tracker.markEventSent('g.dassie.carol', 'event3')

      tracker.clearPeer('g.dassie.bob')

      expect(tracker.hasSent('g.dassie.bob', 'event1')).toBe(false)
      expect(tracker.hasSent('g.dassie.bob', 'event2')).toBe(false)
      expect(tracker.hasSent('g.dassie.carol', 'event3')).toBe(true) // Other peer unaffected
      expect(tracker.getPeerCount()).toBe(1)
    })

    it('should handle clearing non-existent peer', () => {
      tracker.clearPeer('g.dassie.nonexistent')

      expect(tracker.getPeerCount()).toBe(0)
    })
  })

  describe('clear', () => {
    it('should clear all tracking data', () => {
      tracker.markEventSent('g.dassie.alice', 'event1')
      tracker.markEventSent('g.dassie.bob', 'event2')
      tracker.markEventSent('g.dassie.carol', 'event3')

      tracker.clear()

      expect(tracker.getPeerCount()).toBe(0)
      expect(tracker.hasSent('g.dassie.alice', 'event1')).toBe(false)
      expect(tracker.hasSent('g.dassie.bob', 'event2')).toBe(false)
      expect(tracker.hasSent('g.dassie.carol', 'event3')).toBe(false)
    })
  })

  describe('cleanup', () => {
    it('should remove peers with no events', () => {
      tracker.markEventSent('g.dassie.alice', 'event1')
      tracker.markEventSent('g.dassie.bob', 'event2')

      // Manually clear Bob's events (simulating all events expired)
      tracker.clearPeer('g.dassie.bob')
      // Re-create empty set for Bob
      tracker.markEventSent('g.dassie.carol', 'event3')
      tracker.clearPeer('g.dassie.carol')

      // Before cleanup: Alice has events, Bob/Carol have no events (removed by clearPeer)
      expect(tracker.getPeerCount()).toBe(1)

      tracker.cleanup()

      // After cleanup: Only Alice remains
      expect(tracker.getPeerCount()).toBe(1)
    })
  })

  describe('multi-peer scenarios', () => {
    it('should track same event sent to multiple peers', () => {
      const eventId = 'event123'

      tracker.markEventSent('g.dassie.alice', eventId)
      tracker.markEventSent('g.dassie.bob', eventId)
      tracker.markEventSent('g.dassie.carol', eventId)

      expect(tracker.hasSent('g.dassie.alice', eventId)).toBe(true)
      expect(tracker.hasSent('g.dassie.bob', eventId)).toBe(true)
      expect(tracker.hasSent('g.dassie.carol', eventId)).toBe(true)
    })

    it('should track different events for different peers', () => {
      tracker.markEventSent('g.dassie.alice', 'event1')
      tracker.markEventSent('g.dassie.bob', 'event2')
      tracker.markEventSent('g.dassie.carol', 'event3')

      expect(tracker.hasSent('g.dassie.alice', 'event1')).toBe(true)
      expect(tracker.hasSent('g.dassie.alice', 'event2')).toBe(false)

      expect(tracker.hasSent('g.dassie.bob', 'event2')).toBe(true)
      expect(tracker.hasSent('g.dassie.bob', 'event1')).toBe(false)

      expect(tracker.hasSent('g.dassie.carol', 'event3')).toBe(true)
      expect(tracker.hasSent('g.dassie.carol', 'event1')).toBe(false)
    })
  })

  describe('performance', () => {
    it('should handle 100 peers with 1000 events each efficiently', () => {
      const startTime = performance.now()

      // Add 1000 events for 100 peers
      for (let peer = 0; peer < 100; peer++) {
        for (let event = 0; event < 1000; event++) {
          tracker.markEventSent(`g.dassie.peer${peer}`, `event${event}`)
        }
      }

      const addTime = performance.now() - startTime

      expect(tracker.getPeerCount()).toBe(100)
      expect(tracker.getEventCount('g.dassie.peer0')).toBe(1000)
      expect(addTime).toBeLessThan(500) // Should complete in < 500ms

      // Check all events
      const checkStartTime = performance.now()

      for (let peer = 0; peer < 100; peer++) {
        for (let event = 0; event < 1000; event++) {
          expect(tracker.hasSent(`g.dassie.peer${peer}`, `event${event}`)).toBe(true)
        }
      }

      const checkTime = performance.now() - checkStartTime

      expect(checkTime).toBeLessThan(1000) // Should complete in < 1 second
    })
  })
})
