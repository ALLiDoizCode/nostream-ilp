import createDebug from 'debug'

const debug = createDebug('btp-nips:rate-limiter')

/**
 * Token bucket for rate limiting.
 *
 * The token bucket algorithm allows bursts of activity while maintaining
 * a long-term average rate limit.
 *
 * @example
 * ```typescript
 * const bucket = new TokenBucket(100, 100); // 100 events/sec capacity
 *
 * // First 100 events succeed (burst)
 * for (let i = 0; i < 100; i++) {
 *   bucket.tryConsume(); // true
 * }
 *
 * // 101st event fails (rate limited)
 * bucket.tryConsume(); // false
 *
 * // Wait 1 second → bucket refills
 * await sleep(1000);
 * bucket.tryConsume(); // true
 * ```
 */
export class TokenBucket {
  /**
   * Current number of available tokens.
   */
  private tokens: number

  /**
   * Maximum tokens in bucket (burst capacity).
   */
  private readonly capacity: number

  /**
   * Tokens added per second.
   */
  private readonly refillRate: number

  /**
   * Timestamp of last refill (milliseconds).
   */
  private lastRefill: number

  /**
   * Create a new token bucket.
   *
   * @param capacity - Maximum tokens (burst capacity)
   * @param refillRate - Tokens added per second
   */
  constructor(capacity: number, refillRate: number) {
    this.capacity = capacity
    this.refillRate = refillRate
    this.tokens = capacity // Start full
    this.lastRefill = Date.now()
  }

  /**
   * Refill tokens based on elapsed time.
   * Called automatically by tryConsume().
   */
  refill(): void {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000 // seconds
    const tokensToAdd = elapsed * this.refillRate

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd)
    this.lastRefill = now
  }

  /**
   * Attempt to consume one token.
   *
   * @returns true if token consumed (allowed), false if rate limited
   */
  tryConsume(): boolean {
    this.refill()

    if (this.tokens >= 1) {
      this.tokens -= 1
      return true // Allowed
    }

    return false // Rate limited
  }

  /**
   * Get current number of available tokens.
   *
   * @returns Current tokens
   */
  getTokens(): number {
    this.refill()
    return this.tokens
  }

  /**
   * Get capacity of this bucket.
   *
   * @returns Maximum tokens
   */
  getCapacity(): number {
    return this.capacity
  }
}

/**
 * Rate limiter using token bucket algorithm.
 *
 * Manages per-peer rate limits with payment-based capacity adjustments.
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter();
 *
 * // Set higher capacity for high-paying peer
 * limiter.setPeerCapacity('g.dassie.alice', 2000); // 2000 msats → 200 events/sec
 *
 * // Try to send event
 * if (limiter.tryConsume('g.dassie.alice')) {
 *   // Send event
 * } else {
 *   // Rate limited - queue for later
 * }
 * ```
 */
export class RateLimiter {
  /**
   * Maps peer ILP address → TokenBucket.
   */
  private buckets: Map<string, TokenBucket> = new Map()

  /**
   * Default rate limit: 100 events/sec.
   */
  private readonly defaultRate = 100

  /**
   * Maximum queue size per peer (not yet implemented).
   */
  private readonly queueSize = 1000

  /**
   * Base payment amount for default rate (msats).
   * Used for payment-based capacity calculation.
   */
  private readonly basePaymentAmount = 1000 // 1000 msats

  /**
   * Try to consume a token for a peer.
   *
   * @param peerAddress - ILP address of peer
   * @returns true if allowed, false if rate limited
   */
  tryConsume(peerAddress: string): boolean {
    const bucket = this.getOrCreateBucket(peerAddress)
    const allowed = bucket.tryConsume()

    if (!allowed) {
      debug('Rate limited: %s (tokens: %d)', peerAddress, bucket.getTokens())
    }

    return allowed
  }

  /**
   * Set peer capacity based on payment amount.
   *
   * Higher payments → higher rate limits (QoS).
   *
   * Formula: capacity = baseCapacity × (paymentAmount / basePaymentAmount)
   *
   * Examples:
   * - 1000 msats (base) → 100 events/sec
   * - 2000 msats (2x) → 200 events/sec
   * - 500 msats (0.5x) → 50 events/sec
   *
   * @param peerAddress - ILP address of peer
   * @param paymentAmount - Payment amount in msats
   */
  setPeerCapacity(peerAddress: string, paymentAmount: number): void {
    const multiplier = paymentAmount / this.basePaymentAmount
    const capacity = Math.floor(this.defaultRate * multiplier)
    const refillRate = capacity // Same as capacity for 1:1 refill

    // Create new bucket with updated capacity
    const bucket = new TokenBucket(capacity, refillRate)
    this.buckets.set(peerAddress, bucket)

    debug('Set capacity for %s: %d events/sec (payment: %d msats)', peerAddress, capacity, paymentAmount)
  }

  /**
   * Get or create bucket for peer.
   * Uses default capacity if peer not yet configured.
   *
   * @param peerAddress - ILP address of peer
   * @returns TokenBucket for peer
   */
  private getOrCreateBucket(peerAddress: string): TokenBucket {
    let bucket = this.buckets.get(peerAddress)

    if (!bucket) {
      bucket = new TokenBucket(this.defaultRate, this.defaultRate)
      this.buckets.set(peerAddress, bucket)
      debug('Created default bucket for %s: %d events/sec', peerAddress, this.defaultRate)
    }

    return bucket
  }

  /**
   * Get current tokens available for peer.
   *
   * @param peerAddress - ILP address of peer
   * @returns Current tokens
   */
  getTokens(peerAddress: string): number {
    const bucket = this.buckets.get(peerAddress)
    return bucket ? bucket.getTokens() : this.defaultRate
  }

  /**
   * Get capacity for peer.
   *
   * @param peerAddress - ILP address of peer
   * @returns Capacity (events/sec)
   */
  getCapacity(peerAddress: string): number {
    const bucket = this.buckets.get(peerAddress)
    return bucket ? bucket.getCapacity() : this.defaultRate
  }

  /**
   * Remove peer's bucket.
   * Useful when peer disconnects.
   *
   * @param peerAddress - ILP address of peer
   */
  removePeer(peerAddress: string): void {
    const deleted = this.buckets.delete(peerAddress)

    if (deleted) {
      debug('Removed bucket for %s', peerAddress)
    }
  }

  /**
   * Clear all buckets.
   * Useful for testing.
   */
  clear(): void {
    this.buckets.clear()
    debug('Cleared all buckets')
  }

  /**
   * Get number of peers being tracked.
   *
   * @returns Number of peers
   */
  getPeerCount(): number {
    return this.buckets.size
  }
}
