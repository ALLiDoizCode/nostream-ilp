/**
 * Error handling and rate limiting for BTP-NIPs packets
 * Implements logging, metrics, and rate limiting to prevent abuse
 */

/**
 * Error metrics counters
 * In production, these would be Prometheus counters
 */
class ErrorMetrics {
  private counters = new Map<string, number>()

  /**
   * Increment error counter for a specific error type
   */
  increment(errorType: string, peerAddress?: string): void {
    const key = peerAddress ? `${errorType}:${peerAddress}` : errorType
    const current = this.counters.get(key) ?? 0
    this.counters.set(key, current + 1)
  }

  /**
   * Get error count for a specific error type
   */
  get(errorType: string, peerAddress?: string): number {
    const key = peerAddress ? `${errorType}:${peerAddress}` : errorType
    return this.counters.get(key) ?? 0
  }

  /**
   * Reset all counters (for testing)
   */
  reset(): void {
    this.counters.clear()
  }

  /**
   * Get all metrics as object (for monitoring/debugging)
   */
  getAll(): Record<string, number> {
    return Object.fromEntries(this.counters.entries())
  }
}

/**
 * Token bucket for rate limiting
 */
class TokenBucket {
  private tokens: number
  private lastRefill: number

  constructor(
    private readonly capacity: number,
    private readonly refillRate: number, // tokens per second
  ) {
    this.tokens = capacity
    this.lastRefill = Date.now()
  }

  /**
   * Try to consume a token
   * @returns true if token was available, false if rate limited
   */
  tryConsume(): boolean {
    this.refill()

    if (this.tokens >= 1) {
      this.tokens -= 1
      return true
    }

    return false
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refill(): void {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000 // seconds
    const tokensToAdd = elapsed * this.refillRate

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd)
    this.lastRefill = now
  }

  /**
   * Get current token count (for testing/debugging)
   */
  getTokens(): number {
    this.refill()
    return this.tokens
  }

  /**
   * Reset bucket (for testing)
   */
  reset(): void {
    this.tokens = this.capacity
    this.lastRefill = Date.now()
  }
}

/**
 * Rate limiter using token bucket algorithm
 * Limits error responses per peer to prevent abuse
 */
export class ErrorRateLimiter {
  private buckets = new Map<string, TokenBucket>()
  private readonly maxErrorsPerMinute: number
  private readonly capacity: number
  private readonly refillRate: number

  constructor(maxErrorsPerMinute = 100) {
    this.maxErrorsPerMinute = maxErrorsPerMinute
    // Convert to tokens per second
    this.capacity = maxErrorsPerMinute
    this.refillRate = maxErrorsPerMinute / 60 // tokens per second
  }

  /**
   * Check if error response is allowed for peer
   * @param peerAddress ILP address of peer
   * @returns true if allowed, false if rate limited
   */
  isAllowed(peerAddress: string): boolean {
    let bucket = this.buckets.get(peerAddress)

    if (!bucket) {
      bucket = new TokenBucket(this.capacity, this.refillRate)
      this.buckets.set(peerAddress, bucket)
    }

    return bucket.tryConsume()
  }

  /**
   * Reset rate limiter for peer (for testing)
   */
  reset(peerAddress?: string): void {
    if (peerAddress) {
      this.buckets.delete(peerAddress)
    } else {
      this.buckets.clear()
    }
  }

  /**
   * Get current token count for peer (for testing/debugging)
   */
  getTokens(peerAddress: string): number {
    const bucket = this.buckets.get(peerAddress)
    return bucket?.getTokens() ?? this.capacity
  }
}

/**
 * Error types for BTP-NIPs processing
 */
export enum BtpNipsErrorType {
  INVALID_PACKET = 'invalid_packet',
  SIGNATURE_VERIFICATION_FAILED = 'signature_verification_failed',
  DUPLICATE_EVENT = 'duplicate_event',
  STORAGE_ERROR = 'storage_error',
  MALFORMED_FILTER = 'malformed_filter',
  SUBSCRIPTION_NOT_FOUND = 'subscription_not_found',
  RATE_LIMITED = 'rate_limited',
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * Structured error context for logging
 */
export interface ErrorContext {
  errorType: BtpNipsErrorType
  peerAddress: string
  message: string
  packetType?: string
  eventId?: string
  subId?: string
  timestamp: number
  stack?: string
}

/**
 * Error handler for BTP-NIPs packet processing
 * Provides logging, metrics, and rate limiting
 */
export class BtpNipsErrorHandler {
  private readonly metrics = new ErrorMetrics()
  private readonly rateLimiter: ErrorRateLimiter

  constructor(maxErrorsPerMinute = 100) {
    this.rateLimiter = new ErrorRateLimiter(maxErrorsPerMinute)
  }

  /**
   * Handle error during packet processing
   * Logs error, increments metrics, and checks rate limits
   *
   * @param error Error that occurred
   * @param context Error context for logging
   * @returns true if error response is allowed, false if rate limited
   */
  handle(error: Error, context: Partial<ErrorContext>): boolean {
    const fullContext: ErrorContext = {
      errorType: context.errorType ?? BtpNipsErrorType.UNKNOWN_ERROR,
      peerAddress: context.peerAddress ?? 'unknown',
      message: error.message,
      packetType: context.packetType,
      eventId: context.eventId,
      subId: context.subId,
      timestamp: Date.now(),
      stack: error.stack,
    }

    // Log error with structured context
    this.log(fullContext)

    // Increment metrics
    this.metrics.increment(fullContext.errorType, fullContext.peerAddress)
    this.metrics.increment('total_errors')

    // Check rate limit
    const isAllowed = this.rateLimiter.isAllowed(fullContext.peerAddress)
    if (!isAllowed) {
      // Increment rate limit counter
      this.metrics.increment(BtpNipsErrorType.RATE_LIMITED, fullContext.peerAddress)
      this.log({
        ...fullContext,
        errorType: BtpNipsErrorType.RATE_LIMITED,
        message: `Rate limit exceeded for peer ${fullContext.peerAddress}`,
      })
    }

    return isAllowed
  }

  /**
   * Log error with structured context
   * In production, this would use a proper logger (e.g., Pino)
   */
  private log(context: ErrorContext): void {
    // TODO: Replace with proper logger in production
    console.error('[BTP-NIPs Error]', {
      type: context.errorType,
      peer: context.peerAddress,
      message: context.message,
      packet: context.packetType,
      eventId: context.eventId,
      subId: context.subId,
      timestamp: new Date(context.timestamp).toISOString(),
    })
  }

  /**
   * Get error metrics (for monitoring)
   */
  getMetrics(): Record<string, number> {
    return this.metrics.getAll()
  }

  /**
   * Get specific error count
   */
  getErrorCount(errorType: BtpNipsErrorType, peerAddress?: string): number {
    return this.metrics.get(errorType, peerAddress)
  }

  /**
   * Reset metrics and rate limiter (for testing)
   */
  reset(): void {
    this.metrics.reset()
    this.rateLimiter.reset()
  }

  /**
   * Check if peer is rate limited
   */
  isRateLimited(peerAddress: string): boolean {
    return !this.rateLimiter.isAllowed(peerAddress)
  }
}

/**
 * Global error handler instance
 * In production, this would be injected via dependency injection
 */
export const globalErrorHandler = new BtpNipsErrorHandler()
