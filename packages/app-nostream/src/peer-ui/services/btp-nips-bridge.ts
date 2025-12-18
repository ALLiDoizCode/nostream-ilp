import { createLogger } from '../../factories/logger-factory'
import type {
  Subscription,
  SubscriptionManager,
} from '../../btp-nips/subscription-manager'
import type { NostrFilter } from '../../btp-nips/types/index'

/**
 * BTP-NIPs Bridge Service
 * Bridges between HTTP API and BTP-NIPs SubscriptionManager
 *
 * Provides:
 * - Subscription list formatting
 * - Status calculation (healthy, expiring_soon, expiring_critical, expired)
 * - Filter summary generation
 * - Error handling
 *
 * Reference: docs/stories/9.3.story.md#Task 1
 */

const debug = createLogger('peer-ui:btp-nips-bridge')

/**
 * Subscription status indicator
 */
export type SubscriptionStatus =
  | 'healthy' // >1 hour remaining
  | 'expiring_soon' // <1 hour remaining
  | 'expiring_critical' // <5 minutes remaining
  | 'expired' // Past expiration time

/**
 * Subscription with computed status and metadata for API response
 */
export interface SubscriptionWithStatus {
  id: string
  subscriber: string
  filters: NostrFilter[]
  filterSummary: string
  expiresAt: number
  expiresAtISO: string
  timeRemainingMs: number
  timeRemainingHuman: string
  status: SubscriptionStatus
  active: boolean
  createdAt?: number
}

/**
 * Calculate subscription status based on time remaining
 *
 * @param timeRemainingMs - Time remaining in milliseconds
 * @returns Subscription status indicator
 */
export function calculateSubscriptionStatus(
  timeRemainingMs: number
): SubscriptionStatus {
  const ONE_HOUR_MS = 3600000 // 1 hour
  const FIVE_MINUTES_MS = 300000 // 5 minutes

  if (timeRemainingMs <= 0) {
    return 'expired'
  }

  if (timeRemainingMs < FIVE_MINUTES_MS) {
    return 'expiring_critical'
  }

  if (timeRemainingMs < ONE_HOUR_MS) {
    return 'expiring_soon'
  }

  return 'healthy'
}

/**
 * Convert milliseconds to human-readable time string
 *
 * Examples:
 * - 3665000 ms → "1 hour 1 minute"
 * - 125000 ms → "2 minutes 5 seconds"
 * - 45000 ms → "45 seconds"
 * - -1000 ms → "expired"
 *
 * @param ms - Time in milliseconds
 * @returns Human-readable time string
 */
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) {
    return 'expired'
  }

  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    const remainingHours = hours % 24
    if (remainingHours > 0) {
      return `${days} day${days > 1 ? 's' : ''} ${remainingHours} hour${remainingHours > 1 ? 's' : ''}`
    }
    return `${days} day${days > 1 ? 's' : ''}`
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60
    if (remainingMinutes > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`
    }
    return `${hours} hour${hours > 1 ? 's' : ''}`
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60
    if (remainingSeconds > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ${remainingSeconds} second${remainingSeconds > 1 ? 's' : ''}`
    }
    return `${minutes} minute${minutes > 1 ? 's' : ''}`
  }

  return `${seconds} second${seconds > 1 ? 's' : ''}`
}

/**
 * Generate human-readable filter summary
 *
 * Examples:
 * - [{ authors: ["abc", "def"], kinds: [1, 30023] }] → "2 authors, kinds: [1, 30023]"
 * - [{ kinds: [1] }] → "kinds: [1]"
 * - [{}] → "All events"
 * - [{ authors: ["abc"], since: 1234567890 }] → "1 author, since: 2009-02-13"
 *
 * @param filters - Array of Nostr filters
 * @returns Human-readable filter summary
 */
export function generateFilterSummary(filters: NostrFilter[]): string {
  if (!filters || filters.length === 0) {
    return 'No filters (all events)'
  }

  // Combine all filters into summary
  const summaryParts: string[] = []

  // Count unique authors across all filters
  const allAuthors = new Set<string>()
  const allKinds = new Set<number>()
  let hasSince = false
  let hasUntil = false
  let hasLimit = false

  for (const filter of filters) {
    if (filter.authors) {
      filter.authors.forEach((a) => allAuthors.add(a))
    }
    if (filter.kinds) {
      filter.kinds.forEach((k) => allKinds.add(k))
    }
    if (filter.since) {
      hasSince = true
    }
    if (filter.until) {
      hasUntil = true
    }
    if (filter.limit) {
      hasLimit = true
    }
  }

  // Add author count
  if (allAuthors.size > 0) {
    summaryParts.push(
      `${allAuthors.size} author${allAuthors.size > 1 ? 's' : ''}`
    )
  }

  // Add kinds
  if (allKinds.size > 0) {
    const kindsArray = Array.from(allKinds).sort((a, b) => a - b)
    if (kindsArray.length <= 5) {
      summaryParts.push(`kinds: [${kindsArray.join(', ')}]`)
    } else {
      summaryParts.push(
        `kinds: [${kindsArray.slice(0, 5).join(', ')}, +${kindsArray.length - 5} more]`
      )
    }
  }

  // Add date filters
  if (hasSince) {
    summaryParts.push('with since filter')
  }
  if (hasUntil) {
    summaryParts.push('with until filter')
  }
  if (hasLimit) {
    summaryParts.push('with limit')
  }

  // If no criteria, it's a catch-all filter
  if (summaryParts.length === 0) {
    return 'All events'
  }

  return summaryParts.join(', ')
}

/**
 * BTP-NIPs Bridge
 * Provides interface to BTP-NIPs SubscriptionManager for HTTP API
 */
export class BTPNIPsBridge {
  private subscriptionManager: SubscriptionManager | null

  constructor(subscriptionManager?: SubscriptionManager) {
    this.subscriptionManager = subscriptionManager || null
    debug('BTPNIPsBridge initialized')
  }

  /**
   * Set the subscription manager instance
   * Used for lazy initialization or dependency injection
   */
  setSubscriptionManager(manager: SubscriptionManager): void {
    this.subscriptionManager = manager
    debug('SubscriptionManager set on BTPNIPsBridge')
  }

  /**
   * Get subscription manager instance
   * @throws Error if not initialized
   */
  private getManager(): SubscriptionManager {
    if (!this.subscriptionManager) {
      throw new Error('SubscriptionManager not initialized in BTPNIPsBridge')
    }
    return this.subscriptionManager
  }

  /**
   * Format a single subscription with status and metadata
   *
   * @param sub - Raw subscription from SubscriptionManager
   * @returns Formatted subscription with status
   */
  private formatSubscription(sub: Subscription): SubscriptionWithStatus {
    const now = Date.now()
    const timeRemainingMs = sub.expiresAt - now

    return {
      id: sub.id,
      subscriber: sub.subscriber,
      filters: sub.filters,
      filterSummary: generateFilterSummary(sub.filters),
      expiresAt: sub.expiresAt,
      expiresAtISO: new Date(sub.expiresAt).toISOString(),
      timeRemainingMs,
      timeRemainingHuman: formatTimeRemaining(timeRemainingMs),
      status: calculateSubscriptionStatus(timeRemainingMs),
      active: sub.active,
    }
  }

  /**
   * Get all active subscriptions with status
   *
   * @returns Array of formatted subscriptions
   * @throws Error if SubscriptionManager not initialized
   */
  getActiveSubscriptions(): SubscriptionWithStatus[] {
    try {
      const manager = this.getManager()
      const subs = manager.getActiveSubscriptions()

      debug('Retrieved %d active subscriptions', subs.length)

      return subs.map((sub) => this.formatSubscription(sub))
    } catch (error) {
      debug('Error getting active subscriptions: %o', error)
      throw error
    }
  }

  /**
   * Get a single subscription by ID with status
   *
   * @param id - Subscription ID
   * @returns Formatted subscription or null if not found
   * @throws Error if SubscriptionManager not initialized
   */
  getSubscription(id: string): SubscriptionWithStatus | null {
    try {
      const manager = this.getManager()
      const sub = manager.getSubscription(id)

      if (!sub) {
        debug('Subscription not found: %s', id)
        return null
      }

      return this.formatSubscription(sub)
    } catch (error) {
      debug('Error getting subscription %s: %o', id, error)
      throw error
    }
  }

  /**
   * Get subscriptions by subscriber ILP address
   *
   * @param subscriber - ILP address of subscriber
   * @returns Array of formatted subscriptions
   * @throws Error if SubscriptionManager not initialized
   */
  getSubscriptionsBySubscriber(subscriber: string): SubscriptionWithStatus[] {
    try {
      const manager = this.getManager()
      const allSubs = manager.getActiveSubscriptions()

      // Filter by subscriber
      const filtered = allSubs.filter((sub) => sub.subscriber === subscriber)

      debug(
        'Found %d active subscriptions for subscriber: %s',
        filtered.length,
        subscriber
      )

      return filtered.map((sub) => this.formatSubscription(sub))
    } catch (error) {
      debug('Error getting subscriptions for subscriber %s: %o', subscriber, error)
      throw error
    }
  }

  /**
   * Get subscription count
   *
   * @returns Total number of subscriptions (active + inactive)
   * @throws Error if SubscriptionManager not initialized
   */
  getSubscriptionCount(): number {
    try {
      const manager = this.getManager()
      return manager.getSubscriptionCount()
    } catch (error) {
      debug('Error getting subscription count: %o', error)
      throw error
    }
  }

  /**
   * Get active subscription count
   *
   * @returns Number of active subscriptions
   * @throws Error if SubscriptionManager not initialized
   */
  getActiveSubscriptionCount(): number {
    try {
      const manager = this.getManager()
      return manager.getActiveSubscriptionCount()
    } catch (error) {
      debug('Error getting active subscription count: %o', error)
      throw error
    }
  }

  /**
   * Check if SubscriptionManager is initialized
   *
   * @returns True if initialized, false otherwise
   */
  isInitialized(): boolean {
    return this.subscriptionManager !== null
  }
}

/**
 * Singleton instance for use across application
 * Initialize with setSubscriptionManager() before use
 */
export const btpNipsBridge = new BTPNIPsBridge()
