/**
 * Free Tier Tracker Service
 *
 * Manages free tier eligibility for relay users. Tracks event counts per pubkey
 * and enforces configurable thresholds before requiring payment.
 *
 * @module services/payment/free-tier-tracker
 */

/* eslint-disable sort-imports */
import { Pubkey } from '../../@types/base'
import { createLogger } from '../../factories/logger-factory'
import { IFreeTierRepository } from '../../repositories/free-tier-repository'
import { pricingConfig } from './pricing-config'
/* eslint-enable sort-imports */

const debug = createLogger('free-tier-tracker')

/**
 * Free tier status for a pubkey
 *
 * @interface FreeTierStatus
 * @property {boolean} eligible - True if user can post without payment
 * @property {number} eventsUsed - Number of free events already used
 * @property {number} eventsRemaining - Free events remaining (0 if ineligible, -1 if unlimited)
 * @property {boolean} whitelisted - True if pubkey is on permanent whitelist
 *
 * @example
 * ```typescript
 * // New user with 0 events, threshold 100
 * { eligible: true, eventsUsed: 0, eventsRemaining: 100, whitelisted: false }
 *
 * // User with 95 events, threshold 100
 * { eligible: true, eventsUsed: 95, eventsRemaining: 5, whitelisted: false }
 *
 * // User exhausted free tier (100 events, threshold 100)
 * { eligible: false, eventsUsed: 100, eventsRemaining: 0, whitelisted: false }
 *
 * // Whitelisted user (unlimited)
 * { eligible: true, eventsUsed: 1000, eventsRemaining: -1, whitelisted: true }
 * ```
 */
export interface FreeTierStatus {
  eligible: boolean
  eventsUsed: number
  eventsRemaining: number
  whitelisted: boolean
}

/**
 * Free Tier Tracker
 *
 * Manages free tier eligibility checks and event count tracking.
 * Uses FreeTierRepository for database operations.
 *
 * @class FreeTierTracker
 *
 * @example
 * ```typescript
 * const tracker = new FreeTierTracker(repository)
 *
 * // Check eligibility
 * const status = await tracker.checkFreeTierEligibility(pubkey)
 * if (status.eligible) {
 *   // Allow event without payment
 *   await tracker.incrementEventCount(pubkey)
 * }
 *
 * // Manage whitelist
 * await tracker.addToWhitelist(pubkey, 'Developer account')
 * ```
 */
export class FreeTierTracker {
  constructor(private readonly repository: IFreeTierRepository) {}

  /**
   * Get configured free tier threshold
   *
   * @private
   * @returns {number} Free tier event threshold (0 = disabled)
   */
  private get threshold(): number {
    return pricingConfig.freeTierEvents
  }

  /**
   * Check free tier eligibility for a pubkey
   *
   * Algorithm:
   * 1. Check if pubkey is whitelisted → eligible (unlimited)
   * 2. Get event count from database
   * 3. Compare with configured threshold
   * 4. Return eligibility status with remaining events
   *
   * Error handling: Database errors return not eligible (fail-safe)
   *
   * @param {Pubkey} pubkey - Nostr public key (hex)
   * @returns {Promise<FreeTierStatus>} Eligibility status
   *
   * @throws Never - Always returns valid status (fail-safe on errors)
   *
   * @example
   * ```typescript
   * const status = await tracker.checkFreeTierEligibility(pubkey)
   *
   * if (status.eligible) {
   *   if (status.whitelisted) {
   *     console.log('Whitelisted user - unlimited events')
   *   } else {
   *     console.log(`Free tier: ${status.eventsRemaining} events remaining`)
   *   }
   * } else {
   *   console.log('Free tier exhausted - payment required')
   * }
   * ```
   */
  async checkFreeTierEligibility(pubkey: Pubkey): Promise<FreeTierStatus> {
    try {
      debug('Checking free tier eligibility for pubkey: %s', pubkey)

      // Check whitelist first (highest priority)
      const whitelisted = await this.repository.isWhitelisted(pubkey)

      if (whitelisted) {
        const eventsUsed = await this.repository.getEventCount(pubkey)
        debug(
          'Pubkey %s is whitelisted (unlimited free events, %d used)',
          pubkey,
          eventsUsed
        )

        return {
          eligible: true,
          eventsUsed,
          eventsRemaining: -1, // Unlimited
          whitelisted: true,
        }
      }

      // Get event count for threshold check
      const eventsUsed = await this.repository.getEventCount(pubkey)
      const threshold = this.threshold

      // Check if free tier is disabled
      if (threshold === 0) {
        debug('Free tier disabled (threshold 0)')
        return {
          eligible: false,
          eventsUsed,
          eventsRemaining: 0,
          whitelisted: false,
        }
      }

      // Check threshold
      const eligible = eventsUsed < threshold
      const eventsRemaining = Math.max(0, threshold - eventsUsed)

      debug(
        'Pubkey %s: eligible=%s, eventsUsed=%d, eventsRemaining=%d',
        pubkey,
        eligible,
        eventsUsed,
        eventsRemaining
      )

      return {
        eligible,
        eventsUsed,
        eventsRemaining,
        whitelisted: false,
      }
    } catch (error) {
      // Fail-safe: Database error → not eligible (require payment)
      debug('Error checking free tier eligibility: %o', error)
      return {
        eligible: false,
        eventsUsed: 0,
        eventsRemaining: 0,
        whitelisted: false,
      }
    }
  }

  /**
   * Increment event count for a pubkey
   *
   * Called after a free event is successfully stored.
   * Uses atomic database operation to prevent race conditions.
   *
   * Error handling: Logs warning but does not throw (non-blocking)
   *
   * @param {Pubkey} pubkey - Nostr public key (hex)
   * @returns {Promise<void>}
   *
   * @throws Never - Errors logged but not thrown (non-blocking)
   *
   * @example
   * ```typescript
   * // After event stored
   * if (status.eligible && !status.whitelisted) {
   *   await tracker.incrementEventCount(pubkey)
   * }
   * ```
   */
  async incrementEventCount(pubkey: Pubkey): Promise<void> {
    try {
      debug('Incrementing event count for pubkey: %s', pubkey)
      await this.repository.incrementEventCount(pubkey)
    } catch (error) {
      // Non-blocking: Log warning but don't fail event storage
      debug('Failed to increment event count for %s: %o', pubkey, error)
    }
  }

  /**
   * Get remaining free events for a pubkey
   *
   * Convenience method for displaying to users.
   *
   * @param {Pubkey} pubkey - Nostr public key (hex)
   * @returns {Promise<number>} Events remaining (0 if ineligible, -1 if unlimited)
   *
   * @example
   * ```typescript
   * const remaining = await tracker.getRemainingFreeEvents(pubkey)
   * if (remaining > 0) {
   *   console.log(`You have ${remaining} free events remaining`)
   * } else if (remaining === -1) {
   *   console.log('You have unlimited free events (whitelisted)')
   * } else {
   *   console.log('Free tier exhausted - payment required')
   * }
   * ```
   */
  async getRemainingFreeEvents(pubkey: Pubkey): Promise<number> {
    const status = await this.checkFreeTierEligibility(pubkey)
    return status.eventsRemaining
  }

  /**
   * Check if pubkey is whitelisted
   *
   * @param {Pubkey} pubkey - Nostr public key (hex)
   * @returns {Promise<boolean>} True if whitelisted
   */
  async isWhitelisted(pubkey: Pubkey): Promise<boolean> {
    return this.repository.isWhitelisted(pubkey)
  }

  /**
   * Add pubkey to whitelist
   *
   * Whitelisted users have unlimited free events.
   * Idempotent - no error if already whitelisted.
   *
   * @param {Pubkey} pubkey - Nostr public key (hex)
   * @param {string} description - Reason for whitelisting (e.g., "developer", "moderator")
   * @returns {Promise<void>}
   *
   * @example
   * ```typescript
   * await tracker.addToWhitelist(
   *   '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d',
   *   'Core developer - unlimited access'
   * )
   * ```
   */
  async addToWhitelist(pubkey: Pubkey, description: string): Promise<void> {
    debug('Adding pubkey to whitelist: %s (%s)', pubkey, description)
    await this.repository.addToWhitelist(pubkey, description)
  }

  /**
   * Remove pubkey from whitelist
   *
   * Idempotent - no error if not whitelisted.
   *
   * @param {Pubkey} pubkey - Nostr public key (hex)
   * @returns {Promise<void>}
   *
   * @example
   * ```typescript
   * await tracker.removeFromWhitelist(pubkey)
   * ```
   */
  async removeFromWhitelist(pubkey: Pubkey): Promise<void> {
    debug('Removing pubkey from whitelist: %s', pubkey)
    await this.repository.removeFromWhitelist(pubkey)
  }
}
