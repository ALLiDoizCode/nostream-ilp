import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  BtpNipsErrorHandler,
  ErrorRateLimiter,
  BtpNipsErrorType,
} from './error-handler.js'

describe('error-handler - ErrorRateLimiter', () => {
  let rateLimiter: ErrorRateLimiter

  beforeEach(() => {
    rateLimiter = new ErrorRateLimiter(100) // 100 errors per minute
  })

  it('should allow errors within rate limit', () => {
    const peerAddress = 'g.dassie.peer1'

    // Should allow first error
    expect(rateLimiter.isAllowed(peerAddress)).toBe(true)
    // Should allow second error
    expect(rateLimiter.isAllowed(peerAddress)).toBe(true)
  })

  it('should deny errors when rate limit exceeded', () => {
    const peerAddress = 'g.dassie.peer1'
    const maxErrors = 100

    // Consume all tokens
    for (let i = 0; i < maxErrors; i++) {
      expect(rateLimiter.isAllowed(peerAddress)).toBe(true)
    }

    // Next error should be rate limited
    expect(rateLimiter.isAllowed(peerAddress)).toBe(false)
    expect(rateLimiter.isAllowed(peerAddress)).toBe(false)
  })

  it('should track rate limits per peer independently', () => {
    const peer1 = 'g.dassie.peer1'
    const peer2 = 'g.dassie.peer2'

    // Consume tokens for peer1
    for (let i = 0; i < 50; i++) {
      rateLimiter.isAllowed(peer1)
    }

    // Peer2 should still have full capacity
    expect(rateLimiter.getTokens(peer2)).toBe(100)
    expect(rateLimiter.isAllowed(peer2)).toBe(true)
  })

  it('should refill tokens over time', async () => {
    const peerAddress = 'g.dassie.peer1'

    // Consume some tokens
    for (let i = 0; i < 10; i++) {
      rateLimiter.isAllowed(peerAddress)
    }

    const tokensAfterConsume = rateLimiter.getTokens(peerAddress)
    expect(tokensAfterConsume).toBeLessThan(100)

    // Wait for refill (100 tokens / 60 seconds = 1.67 tokens/sec)
    // Wait 1 second = ~1.67 tokens refilled
    await new Promise(resolve => setTimeout(resolve, 1000))

    const tokensAfterRefill = rateLimiter.getTokens(peerAddress)
    expect(tokensAfterRefill).toBeGreaterThan(tokensAfterConsume)
  })

  it('should reset rate limiter for specific peer', () => {
    const peer1 = 'g.dassie.peer1'
    const peer2 = 'g.dassie.peer2'

    // Consume tokens for both peers
    for (let i = 0; i < 50; i++) {
      rateLimiter.isAllowed(peer1)
      rateLimiter.isAllowed(peer2)
    }

    // Reset peer1
    rateLimiter.reset(peer1)

    // Peer1 should have full capacity, peer2 should still be depleted
    expect(rateLimiter.getTokens(peer1)).toBe(100)
    expect(rateLimiter.getTokens(peer2)).toBeLessThan(100)
  })

  it('should reset rate limiter for all peers', () => {
    const peer1 = 'g.dassie.peer1'
    const peer2 = 'g.dassie.peer2'

    // Consume tokens for both peers
    for (let i = 0; i < 50; i++) {
      rateLimiter.isAllowed(peer1)
      rateLimiter.isAllowed(peer2)
    }

    // Reset all
    rateLimiter.reset()

    // Both peers should have full capacity
    expect(rateLimiter.getTokens(peer1)).toBe(100)
    expect(rateLimiter.getTokens(peer2)).toBe(100)
  })
})

describe('error-handler - BtpNipsErrorHandler', () => {
  let errorHandler: BtpNipsErrorHandler

  beforeEach(() => {
    errorHandler = new BtpNipsErrorHandler(100)
    // Mock console.error to avoid noise in test output
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('should handle error and log context', () => {
    const error = new Error('Invalid packet format')
    const context = {
      errorType: BtpNipsErrorType.INVALID_PACKET,
      peerAddress: 'g.dassie.peer1',
      packetType: 'EVENT',
    }

    const isAllowed = errorHandler.handle(error, context)

    expect(isAllowed).toBe(true)
    expect(console.error).toHaveBeenCalledWith(
      '[BTP-NIPs Error]',
      expect.objectContaining({
        type: BtpNipsErrorType.INVALID_PACKET,
        peer: 'g.dassie.peer1',
        message: 'Invalid packet format',
        packet: 'EVENT',
      })
    )
  })

  it('should increment error metrics', () => {
    const error = new Error('Signature verification failed')
    const context = {
      errorType: BtpNipsErrorType.SIGNATURE_VERIFICATION_FAILED,
      peerAddress: 'g.dassie.peer1',
    }

    errorHandler.handle(error, context)
    errorHandler.handle(error, context)

    const count = errorHandler.getErrorCount(
      BtpNipsErrorType.SIGNATURE_VERIFICATION_FAILED,
      'g.dassie.peer1'
    )
    expect(count).toBe(2)
  })

  it('should track total errors across all types', () => {
    const peer = 'g.dassie.peer1'

    errorHandler.handle(new Error('Error 1'), {
      errorType: BtpNipsErrorType.INVALID_PACKET,
      peerAddress: peer,
    })

    errorHandler.handle(new Error('Error 2'), {
      errorType: BtpNipsErrorType.DUPLICATE_EVENT,
      peerAddress: peer,
    })

    const metrics = errorHandler.getMetrics()
    expect(metrics['total_errors']).toBe(2)
  })

  it('should rate limit errors per peer', () => {
    const error = new Error('Too many errors')
    const context = {
      errorType: BtpNipsErrorType.INVALID_PACKET,
      peerAddress: 'g.dassie.peer1',
    }

    // Generate 100 errors (at limit)
    for (let i = 0; i < 100; i++) {
      expect(errorHandler.handle(error, context)).toBe(true)
    }

    // Next error should be rate limited
    expect(errorHandler.handle(error, context)).toBe(false)
  })

  it('should increment rate limit counter when limited', () => {
    const error = new Error('Too many errors')
    const peer = 'g.dassie.peer1'
    const context = {
      errorType: BtpNipsErrorType.INVALID_PACKET,
      peerAddress: peer,
    }

    // Exhaust rate limit
    for (let i = 0; i < 100; i++) {
      errorHandler.handle(error, context)
    }

    // Trigger rate limit
    errorHandler.handle(error, context)

    const rateLimitCount = errorHandler.getErrorCount(
      BtpNipsErrorType.RATE_LIMITED,
      peer
    )
    expect(rateLimitCount).toBeGreaterThan(0)
  })

  it('should check if peer is rate limited', () => {
    const peer = 'g.dassie.peer1'

    // Initially not rate limited
    expect(errorHandler.isRateLimited(peer)).toBe(false)

    // Exhaust rate limit
    const error = new Error('Error')
    for (let i = 0; i < 100; i++) {
      errorHandler.handle(error, {
        errorType: BtpNipsErrorType.INVALID_PACKET,
        peerAddress: peer,
      })
    }

    // Now should be rate limited
    expect(errorHandler.isRateLimited(peer)).toBe(true)
  })

  it('should track errors per peer independently', () => {
    const peer1 = 'g.dassie.peer1'
    const peer2 = 'g.dassie.peer2'

    errorHandler.handle(new Error('Error'), {
      errorType: BtpNipsErrorType.INVALID_PACKET,
      peerAddress: peer1,
    })

    errorHandler.handle(new Error('Error'), {
      errorType: BtpNipsErrorType.INVALID_PACKET,
      peerAddress: peer2,
    })

    expect(errorHandler.getErrorCount(BtpNipsErrorType.INVALID_PACKET, peer1)).toBe(1)
    expect(errorHandler.getErrorCount(BtpNipsErrorType.INVALID_PACKET, peer2)).toBe(1)
  })

  it('should reset all metrics and rate limiters', () => {
    const error = new Error('Error')
    const context = {
      errorType: BtpNipsErrorType.INVALID_PACKET,
      peerAddress: 'g.dassie.peer1',
    }

    // Generate some errors
    for (let i = 0; i < 10; i++) {
      errorHandler.handle(error, context)
    }

    // Reset
    errorHandler.reset()

    // Metrics should be cleared
    expect(errorHandler.getErrorCount(BtpNipsErrorType.INVALID_PACKET)).toBe(0)

    // Rate limiter should be reset (can generate 100 errors again)
    for (let i = 0; i < 100; i++) {
      expect(errorHandler.handle(error, context)).toBe(true)
    }
  })

  it('should handle errors with optional context fields', () => {
    const error = new Error('Event storage failed')
    const context = {
      errorType: BtpNipsErrorType.STORAGE_ERROR,
      peerAddress: 'g.dassie.peer1',
      eventId: 'abc123',
      packetType: 'EVENT',
    }

    errorHandler.handle(error, context)

    expect(console.error).toHaveBeenCalledWith(
      '[BTP-NIPs Error]',
      expect.objectContaining({
        eventId: 'abc123',
        packet: 'EVENT',
      })
    )
  })

  it('should use default values for missing context', () => {
    const error = new Error('Unknown error')
    errorHandler.handle(error, {})

    expect(console.error).toHaveBeenCalledWith(
      '[BTP-NIPs Error]',
      expect.objectContaining({
        type: BtpNipsErrorType.UNKNOWN_ERROR,
        peer: 'unknown',
        message: 'Unknown error',
      })
    )
  })

  it('should get all metrics', () => {
    const peer = 'g.dassie.peer1'

    errorHandler.handle(new Error('E1'), {
      errorType: BtpNipsErrorType.INVALID_PACKET,
      peerAddress: peer,
    })

    errorHandler.handle(new Error('E2'), {
      errorType: BtpNipsErrorType.DUPLICATE_EVENT,
      peerAddress: peer,
    })

    const metrics = errorHandler.getMetrics()
    expect(metrics).toHaveProperty(`${BtpNipsErrorType.INVALID_PACKET}:${peer}`)
    expect(metrics).toHaveProperty(`${BtpNipsErrorType.DUPLICATE_EVENT}:${peer}`)
    expect(metrics).toHaveProperty('total_errors')
  })
})
