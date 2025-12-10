import {
import { describe, expect, it } from 'vitest'

  canForward,
  decrementTTL,
  DEFAULT_TTL_CONFIG,
  type PacketMetadata,
  shouldDrop,
  updateMetadataForForwarding,
} from '../../../src/btp-nips/utils/ttl-manager.js'

describe('TTL Manager', () => {
  describe('decrementTTL', () => {
    it('should decrement TTL from 5 to 4', () => {
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 5,
      }

      const newTTL = decrementTTL(metadata)

      expect(newTTL).toBe(4)
    })

    it('should decrement TTL from 1 to 0', () => {
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 1,
      }

      const newTTL = decrementTTL(metadata)

      expect(newTTL).toBe(0)
    })

    it('should use initial TTL if not specified', () => {
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        // ttl not specified
      }

      const newTTL = decrementTTL(metadata)

      expect(newTTL).toBe(DEFAULT_TTL_CONFIG.initialTTL - 1) // 5 - 1 = 4
    })

    it('should handle custom config', () => {
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        // ttl not specified
      }

      const customConfig = {
        maxHops: 10,
        initialTTL: 10,
        dropOnZero: true,
      }

      const newTTL = decrementTTL(metadata, customConfig)

      expect(newTTL).toBe(9) // 10 - 1 = 9
    })

    it('should handle TTL=0 → -1', () => {
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 0,
      }

      const newTTL = decrementTTL(metadata)

      expect(newTTL).toBe(-1)
    })
  })

  describe('shouldDrop', () => {
    it('should return true for TTL=0', () => {
      expect(shouldDrop(0)).toBe(true)
    })

    it('should return true for TTL=-1', () => {
      expect(shouldDrop(-1)).toBe(true)
    })

    it('should return false for TTL=1', () => {
      expect(shouldDrop(1)).toBe(false)
    })

    it('should return false for TTL=5', () => {
      expect(shouldDrop(5)).toBe(false)
    })

    it('should respect dropOnZero=false config', () => {
      const config = {
        maxHops: 5,
        initialTTL: 5,
        dropOnZero: false,
      }

      expect(shouldDrop(0, config)).toBe(false)
      expect(shouldDrop(-1, config)).toBe(false)
    })
  })

  describe('multi-hop propagation', () => {
    it('should decrement TTL through 5 hops until drop', () => {
      let ttl = 5
      const hops = []

      // Hop 1: Alice → Bob
      ttl = ttl - 1
      hops.push(ttl)
      expect(shouldDrop(ttl)).toBe(false)

      // Hop 2: Bob → Carol
      ttl = ttl - 1
      hops.push(ttl)
      expect(shouldDrop(ttl)).toBe(false)

      // Hop 3: Carol → Dave
      ttl = ttl - 1
      hops.push(ttl)
      expect(shouldDrop(ttl)).toBe(false)

      // Hop 4: Dave → Eve
      ttl = ttl - 1
      hops.push(ttl)
      expect(shouldDrop(ttl)).toBe(false)

      // Hop 5: Eve → Frank
      ttl = ttl - 1
      hops.push(ttl)
      expect(shouldDrop(ttl)).toBe(true) // TTL=0, drop

      expect(hops).toEqual([4, 3, 2, 1, 0])
    })

    it('should simulate full propagation chain', () => {
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 5,
        hopCount: 0,
      }

      // Alice → Bob
      let ttl = decrementTTL(metadata)
      expect(ttl).toBe(4)
      expect(shouldDrop(ttl)).toBe(false)

      // Bob → Carol
      ttl = decrementTTL({ ...metadata, ttl })
      expect(ttl).toBe(3)
      expect(shouldDrop(ttl)).toBe(false)

      // Carol → Dave
      ttl = decrementTTL({ ...metadata, ttl })
      expect(ttl).toBe(2)
      expect(shouldDrop(ttl)).toBe(false)

      // Dave → Eve
      ttl = decrementTTL({ ...metadata, ttl })
      expect(ttl).toBe(1)
      expect(shouldDrop(ttl)).toBe(false)

      // Eve → Frank
      ttl = decrementTTL({ ...metadata, ttl })
      expect(ttl).toBe(0)
      expect(shouldDrop(ttl)).toBe(true) // Drop at Frank
    })
  })

  describe('updateMetadataForForwarding', () => {
    it('should update TTL, hop count, and sender', () => {
      const originalMetadata: PacketMetadata = {
        timestamp: 1234567890,
        sender: 'g.dassie.alice',
        ttl: 5,
        hopCount: 0,
      }

      const newMetadata = updateMetadataForForwarding(originalMetadata, 'g.dassie.bob')

      expect(newMetadata).toEqual({
        timestamp: 1234567890,
        sender: 'g.dassie.bob',
        ttl: 4,
        hopCount: 1,
      })
    })

    it('should preserve timestamp', () => {
      const timestamp = Date.now()
      const originalMetadata: PacketMetadata = {
        timestamp,
        sender: 'g.dassie.alice',
        ttl: 3,
        hopCount: 2,
      }

      const newMetadata = updateMetadataForForwarding(originalMetadata, 'g.dassie.carol')

      expect(newMetadata.timestamp).toBe(timestamp)
    })

    it('should initialize hopCount if not present', () => {
      const originalMetadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 5,
        // hopCount not specified
      }

      const newMetadata = updateMetadataForForwarding(originalMetadata, 'g.dassie.bob')

      expect(newMetadata.hopCount).toBe(1)
    })

    it('should handle multi-hop forwarding', () => {
      let metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 5,
        hopCount: 0,
      }

      // Alice → Bob
      metadata = updateMetadataForForwarding(metadata, 'g.dassie.bob')
      expect(metadata.sender).toBe('g.dassie.bob')
      expect(metadata.ttl).toBe(4)
      expect(metadata.hopCount).toBe(1)

      // Bob → Carol
      metadata = updateMetadataForForwarding(metadata, 'g.dassie.carol')
      expect(metadata.sender).toBe('g.dassie.carol')
      expect(metadata.ttl).toBe(3)
      expect(metadata.hopCount).toBe(2)

      // Carol → Dave
      metadata = updateMetadataForForwarding(metadata, 'g.dassie.dave')
      expect(metadata.sender).toBe('g.dassie.dave')
      expect(metadata.ttl).toBe(2)
      expect(metadata.hopCount).toBe(3)
    })
  })

  describe('canForward', () => {
    it('should return true for TTL=5', () => {
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 5,
      }

      expect(canForward(metadata)).toBe(true)
    })

    it('should return true for TTL=2', () => {
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 2,
      }

      expect(canForward(metadata)).toBe(true)
    })

    it('should return false for TTL=1', () => {
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 1,
      }

      expect(canForward(metadata)).toBe(false)
    })

    it('should return false for TTL=0', () => {
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        ttl: 0,
      }

      expect(canForward(metadata)).toBe(false)
    })

    it('should use initial TTL if not specified', () => {
      const metadata: PacketMetadata = {
        timestamp: Date.now(),
        sender: 'g.dassie.alice',
        // ttl not specified (defaults to 5)
      }

      expect(canForward(metadata)).toBe(true) // 5 > 1
    })
  })
})
