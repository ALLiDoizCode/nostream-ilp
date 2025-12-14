import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimiter, TokenBucket } from '../../src/btp-nips/rate-limiter.js'

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('tryConsume', () => {
    it('should allow consumption within capacity', () => {
      const bucket = new TokenBucket(100, 100)

      // First 100 tokens should succeed
      for (let i = 0; i < 100; i++) {
        expect(bucket.tryConsume()).toBe(true)
      }
    })

    it('should deny consumption over capacity', () => {
      const bucket = new TokenBucket(100, 100)

      // Consume all tokens
      for (let i = 0; i < 100; i++) {
        bucket.tryConsume()
      }

      // 101st should fail
      expect(bucket.tryConsume()).toBe(false)
    })

    it('should refill tokens over time', () => {
      const bucket = new TokenBucket(100, 100)

      // Consume all tokens
      for (let i = 0; i < 100; i++) {
        bucket.tryConsume()
      }

      // No tokens left
      expect(bucket.tryConsume()).toBe(false)

      // Advance 1 second → 100 tokens added
      vi.advanceTimersByTime(1000)

      // Should succeed again
      expect(bucket.tryConsume()).toBe(true)
    })

    it('should refill partial tokens', () => {
      const bucket = new TokenBucket(100, 100)

      // Consume all tokens
      for (let i = 0; i < 100; i++) {
        bucket.tryConsume()
      }

      // Advance 0.5 seconds → 50 tokens added
      vi.advanceTimersByTime(500)

      // Should have ~50 tokens
      expect(bucket.getTokens()).toBeCloseTo(50, 0)

      // Can consume 50 times
      for (let i = 0; i < 50; i++) {
        expect(bucket.tryConsume()).toBe(true)
      }

      // 51st should fail
      expect(bucket.tryConsume()).toBe(false)
    })

    it('should not refill beyond capacity', () => {
      const bucket = new TokenBucket(100, 100)

      // Advance 10 seconds → would add 1000 tokens, but capped at 100
      vi.advanceTimersByTime(10000)

      expect(bucket.getTokens()).toBe(100)
    })
  })

  describe('getTokens', () => {
    it('should return current tokens', () => {
      const bucket = new TokenBucket(100, 100)

      expect(bucket.getTokens()).toBe(100)

      bucket.tryConsume()
      expect(bucket.getTokens()).toBe(99)

      bucket.tryConsume()
      expect(bucket.getTokens()).toBe(98)
    })

    it('should refill before returning', () => {
      const bucket = new TokenBucket(100, 100)

      bucket.tryConsume() // 99 tokens

      vi.advanceTimersByTime(1000) // +100 tokens → 100 (capped)

      expect(bucket.getTokens()).toBe(100)
    })
  })

  describe('getCapacity', () => {
    it('should return capacity', () => {
      const bucket = new TokenBucket(100, 100)
      expect(bucket.getCapacity()).toBe(100)

      const bucket2 = new TokenBucket(200, 200)
      expect(bucket2.getCapacity()).toBe(200)
    })
  })
})

describe('RateLimiter', () => {
  let limiter: RateLimiter

  beforeEach(() => {
    limiter = new RateLimiter()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('tryConsume', () => {
    it('should allow 100 consumptions in 1 second (default rate)', () => {
      const peerAddress = 'g.dassie.alice'

      // First 100 should succeed
      for (let i = 0; i < 100; i++) {
        expect(limiter.tryConsume(peerAddress)).toBe(true)
      }
    })

    it('should deny 101st consumption in 1 second (rate limited)', () => {
      const peerAddress = 'g.dassie.alice'

      // Consume all tokens
      for (let i = 0; i < 100; i++) {
        limiter.tryConsume(peerAddress)
      }

      // 101st should fail
      expect(limiter.tryConsume(peerAddress)).toBe(false)
    })

    it('should allow consumption after refill', () => {
      const peerAddress = 'g.dassie.alice'

      // Consume all tokens
      for (let i = 0; i < 100; i++) {
        limiter.tryConsume(peerAddress)
      }

      // No tokens left
      expect(limiter.tryConsume(peerAddress)).toBe(false)

      // Advance 1 second → refill
      vi.advanceTimersByTime(1000)

      // Should succeed again
      expect(limiter.tryConsume(peerAddress)).toBe(true)
    })

    it('should track different peers independently', () => {
      const alice = 'g.dassie.alice'
      const bob = 'g.dassie.bob'

      // Consume all of Alice's tokens
      for (let i = 0; i < 100; i++) {
        limiter.tryConsume(alice)
      }

      // Alice is rate limited
      expect(limiter.tryConsume(alice)).toBe(false)

      // Bob still has tokens
      expect(limiter.tryConsume(bob)).toBe(true)
    })
  })

  describe('setPeerCapacity', () => {
    it('should set capacity based on payment amount', () => {
      const peerAddress = 'g.dassie.alice'

      // 2x payment → 200 events/sec
      limiter.setPeerCapacity(peerAddress, 2000)

      expect(limiter.getCapacity(peerAddress)).toBe(200)
    })

    it('should allow higher rate for higher payment', () => {
      const peerAddress = 'g.dassie.alice'

      // 2x payment → 200 events/sec
      limiter.setPeerCapacity(peerAddress, 2000)

      // Should allow 200 consumptions
      for (let i = 0; i < 200; i++) {
        expect(limiter.tryConsume(peerAddress)).toBe(true)
      }

      // 201st should fail
      expect(limiter.tryConsume(peerAddress)).toBe(false)
    })

    it('should allow lower rate for lower payment', () => {
      const peerAddress = 'g.dassie.alice'

      // 0.5x payment → 50 events/sec
      limiter.setPeerCapacity(peerAddress, 500)

      expect(limiter.getCapacity(peerAddress)).toBe(50)

      // Should allow 50 consumptions
      for (let i = 0; i < 50; i++) {
        expect(limiter.tryConsume(peerAddress)).toBe(true)
      }

      // 51st should fail
      expect(limiter.tryConsume(peerAddress)).toBe(false)
    })

    it('should handle payment-based capacity updates', () => {
      const peerAddress = 'g.dassie.alice'

      // Start with default (100 events/sec)
      expect(limiter.getCapacity(peerAddress)).toBe(100)

      // Upgrade to 2x (200 events/sec)
      limiter.setPeerCapacity(peerAddress, 2000)
      expect(limiter.getCapacity(peerAddress)).toBe(200)

      // Downgrade to 0.5x (50 events/sec)
      limiter.setPeerCapacity(peerAddress, 500)
      expect(limiter.getCapacity(peerAddress)).toBe(50)
    })
  })

  describe('getTokens', () => {
    it('should return default tokens for new peer', () => {
      const peerAddress = 'g.dassie.alice'

      expect(limiter.getTokens(peerAddress)).toBe(100) // Default
    })

    it('should return current tokens after consumption', () => {
      const peerAddress = 'g.dassie.alice'

      limiter.tryConsume(peerAddress)

      expect(limiter.getTokens(peerAddress)).toBe(99)
    })
  })

  describe('getCapacity', () => {
    it('should return default capacity for new peer', () => {
      const peerAddress = 'g.dassie.alice'

      expect(limiter.getCapacity(peerAddress)).toBe(100) // Default
    })

    it('should return custom capacity after setPeerCapacity', () => {
      const peerAddress = 'g.dassie.alice'

      limiter.setPeerCapacity(peerAddress, 2000)

      expect(limiter.getCapacity(peerAddress)).toBe(200)
    })
  })

  describe('removePeer', () => {
    it('should remove peer bucket', () => {
      const peerAddress = 'g.dassie.alice'

      // Create bucket
      limiter.tryConsume(peerAddress)

      expect(limiter.getPeerCount()).toBe(1)

      // Remove peer
      limiter.removePeer(peerAddress)

      expect(limiter.getPeerCount()).toBe(0)
    })

    it('should reset to default after removal', () => {
      const peerAddress = 'g.dassie.alice'

      // Set custom capacity
      limiter.setPeerCapacity(peerAddress, 2000)
      expect(limiter.getCapacity(peerAddress)).toBe(200)

      // Remove peer
      limiter.removePeer(peerAddress)

      // Next call creates new bucket with default capacity
      limiter.tryConsume(peerAddress)
      expect(limiter.getCapacity(peerAddress)).toBe(100) // Default
    })
  })

  describe('clear', () => {
    it('should clear all buckets', () => {
      limiter.tryConsume('g.dassie.alice')
      limiter.tryConsume('g.dassie.bob')
      limiter.tryConsume('g.dassie.carol')

      expect(limiter.getPeerCount()).toBe(3)

      limiter.clear()

      expect(limiter.getPeerCount()).toBe(0)
    })
  })

  describe('getPeerCount', () => {
    it('should return 0 for empty limiter', () => {
      expect(limiter.getPeerCount()).toBe(0)
    })

    it('should return correct count', () => {
      limiter.tryConsume('g.dassie.alice')
      limiter.tryConsume('g.dassie.bob')
      limiter.tryConsume('g.dassie.carol')

      expect(limiter.getPeerCount()).toBe(3)
    })
  })

  describe('performance', () => {
    it('should handle rapid consumption efficiently', () => {
      const peerAddress = 'g.dassie.alice'
      const startTime = performance.now()

      // Try to consume 1000 times
      for (let i = 0; i < 1000; i++) {
        limiter.tryConsume(peerAddress)
      }

      const elapsed = performance.now() - startTime

      // Should complete in < 10ms
      expect(elapsed).toBeLessThan(10)
    })

    it('should handle multiple peers efficiently', () => {
      const startTime = performance.now()

      // 100 peers, 100 consumptions each
      for (let peer = 0; peer < 100; peer++) {
        for (let i = 0; i < 100; i++) {
          limiter.tryConsume(`g.dassie.peer${peer}`)
        }
      }

      const elapsed = performance.now() - startTime

      // Should complete in < 100ms
      expect(elapsed).toBeLessThan(100)
    })
  })

  describe('edge cases', () => {
    it('should handle zero payment amount', () => {
      const peerAddress = 'g.dassie.alice'

      limiter.setPeerCapacity(peerAddress, 0)

      expect(limiter.getCapacity(peerAddress)).toBe(0)
      expect(limiter.tryConsume(peerAddress)).toBe(false) // No capacity
    })

    it('should handle very high payment amount', () => {
      const peerAddress = 'g.dassie.alice'

      // 100x payment → 10,000 events/sec
      limiter.setPeerCapacity(peerAddress, 100000)

      expect(limiter.getCapacity(peerAddress)).toBe(10000)

      // Should allow 10,000 consumptions
      for (let i = 0; i < 10000; i++) {
        expect(limiter.tryConsume(peerAddress)).toBe(true)
      }
    })
  })
})
