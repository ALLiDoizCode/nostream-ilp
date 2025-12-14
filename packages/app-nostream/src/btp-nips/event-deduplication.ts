import createDebug from 'debug'

const debug = createDebug('btp-nips:deduplication')

/**
 * EventDeduplicationCache tracks seen events to prevent duplicate propagation.
 *
 * Events are cached for 24 hours to balance memory usage with effectiveness.
 * After 24 hours, events are considered "cold" and removed from cache.
 *
 * Memory usage: ~40 bytes per event × 1M events = 40 MB
 *
 * @example
 * ```typescript
 * const cache = new EventDeduplicationCache();
 *
 * // First time seeing event
 * if (!cache.hasSeenEvent('abc123')) {
 *   cache.markAsSeen('abc123');
 *   // ... propagate event
 * }
 *
 * // Second time (duplicate)
 * if (!cache.hasSeenEvent('abc123')) {
 *   // Won't reach here - already seen
 * }
 * ```
 */
export class EventDeduplicationCache {
  /**
   * Maps event ID to timestamp when first seen.
   * Used for TTL-based expiration (24 hours).
   */
  private seenEvents: Map<string, number> = new Map()

  /**
   * TTL for cached events: 24 hours in milliseconds
   */
  private readonly ttlMs = 86400000 // 24 hours

  /**
   * Check if event has been seen before.
   * Performs lazy cleanup of expired entries.
   *
   * @param eventId - Nostr event ID (64-character hex string)
   * @returns true if event was seen within last 24 hours, false otherwise
   */
  hasSeenEvent(eventId: string): boolean {
    const timestamp = this.seenEvents.get(eventId)

    if (!timestamp) {
      return false // Not seen before
    }

    // Check if entry expired (lazy cleanup)
    const now = Date.now()
    if (now - timestamp > this.ttlMs) {
      this.seenEvents.delete(eventId)
      debug('Event %s expired from dedup cache', eventId.slice(0, 8))
      return false // Expired
    }

    return true // Seen and not expired
  }

  /**
   * Mark event as seen.
   * Stores current timestamp for TTL-based expiration.
   *
   * @param eventId - Nostr event ID to mark as seen
   */
  markAsSeen(eventId: string): void {
    const now = Date.now()
    this.seenEvents.set(eventId, now)

    debug('Marked event %s as seen (cache size: %d)', eventId.slice(0, 8), this.seenEvents.size)

    // Lazy cleanup: Remove old entries during add if cache is large
    if (this.seenEvents.size % 1000 === 0) {
      this.cleanup()
    }
  }

  /**
   * Remove all expired entries from cache.
   * Should be called periodically to prevent unbounded memory growth.
   *
   * Called automatically by markAsSeen() every 1000 additions,
   * or can be called manually via background task.
   */
  cleanup(): void {
    const now = Date.now()
    const beforeSize = this.seenEvents.size
    let removed = 0

    for (const [eventId, timestamp] of this.seenEvents.entries()) {
      if (now - timestamp > this.ttlMs) {
        this.seenEvents.delete(eventId)
        removed++
      }
    }

    if (removed > 0) {
      debug('Cleanup removed %d expired entries (cache size: %d → %d)', removed, beforeSize, this.seenEvents.size)
    }
  }

  /**
   * Get current cache size.
   * Useful for monitoring and debugging.
   *
   * @returns Number of events currently in cache
   */
  size(): number {
    return this.seenEvents.size
  }

  /**
   * Clear all entries from cache.
   * Useful for testing.
   */
  clear(): void {
    this.seenEvents.clear()
    debug('Cache cleared')
  }
}
