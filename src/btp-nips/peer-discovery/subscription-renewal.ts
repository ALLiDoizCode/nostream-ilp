import { createLogger } from '../../factories/logger-factory.js'
import { sendReqPacket } from '../utils/packet-sender.js'

import type { Subscription, SubscriptionManager } from '../subscription-manager.js'
import type { PaymentChannelManager } from './payment-channel-manager.js'
import type { SubscriptionPreferencesManager } from './subscription-preferences.js'

/**
 * Subscription Renewal Background Job
 *
 * Automatically renews expiring subscriptions for users with autoRenew enabled.
 * Runs hourly to check for subscriptions expiring in the next 6 hours.
 *
 * @module btp-nips/peer-discovery/subscription-renewal
 */

const debug = createLogger('btp-nips:subscription-renewal')

/**
 * Configuration for subscription renewal job
 */
export interface SubscriptionRenewalConfig {
  /** How often to check for renewals (milliseconds, default: 1 hour) */
  checkIntervalMs: number
  /** How far ahead to look for expiring subscriptions (milliseconds, default: 6 hours) */
  renewalWindowMs: number
  /** Whether to enable the renewal job (default: true) */
  enabled: boolean
}

/**
 * Default renewal configuration
 */
const DEFAULT_CONFIG: SubscriptionRenewalConfig = {
  checkIntervalMs: 3600000, // 1 hour
  renewalWindowMs: 6 * 3600000, // 6 hours
  enabled: true,
}

/**
 * Statistics for renewal job run
 */
export interface RenewalRunStats {
  /** When the run started */
  startedAt: number
  /** How long the run took (milliseconds) */
  durationMs: number
  /** Number of subscriptions checked */
  checked: number
  /** Number of subscriptions renewed successfully */
  renewed: number
  /** Number of renewal failures */
  failed: number
  /** Number of subscriptions skipped (autoRenew=false or insufficient balance) */
  skipped: number
}

/**
 * Subscription Renewal Job
 *
 * Background job that automatically renews expiring subscriptions.
 *
 * Flow:
 * 1. Query subscriptions expiring in next 6 hours
 * 2. Check if user has autoRenew enabled
 * 3. Check if payment channel has sufficient balance
 * 4. Send new REQ packet with payment
 * 5. Extend subscription expiration
 *
 * Usage:
 * ```typescript
 * const renewalJob = new SubscriptionRenewalJob(
 *   subscriptionManager,
 *   paymentChannelManager,
 *   preferencesManager
 * );
 *
 * // Start the job (runs every hour)
 * renewalJob.start();
 *
 * // Stop the job
 * renewalJob.stop();
 *
 * // Manually trigger a renewal run
 * const stats = await renewalJob.runOnce();
 * console.log('Renewed:', stats.renewed, 'Failed:', stats.failed);
 * ```
 */
export class SubscriptionRenewalJob {
  private subscriptionManager: SubscriptionManager
  private paymentChannelManager: PaymentChannelManager
  private preferencesManager: SubscriptionPreferencesManager
  private config: SubscriptionRenewalConfig
  private intervalId: NodeJS.Timeout | null = null
  private isRunning: boolean = false

  /**
   * Create a SubscriptionRenewalJob instance
   *
   * @param subscriptionManager - Manager for active subscriptions
   * @param paymentChannelManager - Manager for payment channels
   * @param preferencesManager - Manager for subscription preferences
   * @param config - Optional renewal configuration
   */
  constructor(
    subscriptionManager: SubscriptionManager,
    paymentChannelManager: PaymentChannelManager,
    preferencesManager: SubscriptionPreferencesManager,
    config?: Partial<SubscriptionRenewalConfig>
  ) {
    this.subscriptionManager = subscriptionManager
    this.paymentChannelManager = paymentChannelManager
    this.preferencesManager = preferencesManager
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Start the renewal job
   *
   * Runs at configured interval (default: hourly).
   * If already running, this is a no-op.
   */
  start(): void {
    if (this.intervalId) {
      debug('Renewal job already running')
      return
    }

    if (!this.config.enabled) {
      debug('Renewal job disabled via config')
      return
    }

    debug(
      'Starting renewal job: interval=%dms, window=%dms',
      this.config.checkIntervalMs,
      this.config.renewalWindowMs
    )

    // Run immediately on start
    this.runOnce().catch(error => {
      debug('Initial renewal run failed: %s', error.message)
    })

    // Schedule recurring runs
    this.intervalId = setInterval(() => {
      this.runOnce().catch(error => {
        debug('Scheduled renewal run failed: %s', error.message)
      })
    }, this.config.checkIntervalMs)

    debug('Renewal job started')
  }

  /**
   * Stop the renewal job
   *
   * Cancels the recurring interval.
   * If not running, this is a no-op.
   */
  stop(): void {
    if (!this.intervalId) {
      debug('Renewal job not running')
      return
    }

    clearInterval(this.intervalId)
    this.intervalId = null
    debug('Renewal job stopped')
  }

  /**
   * Run a single renewal check
   *
   * Checks all expiring subscriptions and renews them if possible.
   * This method can be called manually for testing or forced renewal.
   *
   * @returns RenewalRunStats with renewal results
   */
  async runOnce(): Promise<RenewalRunStats> {
    if (this.isRunning) {
      debug('Renewal run already in progress, skipping')
      return {
        startedAt: Date.now(),
        durationMs: 0,
        checked: 0,
        renewed: 0,
        failed: 0,
        skipped: 0,
      }
    }

    this.isRunning = true
    const startTime = Date.now()

    debug('Starting renewal run')

    const stats: RenewalRunStats = {
      startedAt: startTime,
      durationMs: 0,
      checked: 0,
      renewed: 0,
      failed: 0,
      skipped: 0,
    }

    try {
      // 1. Find subscriptions expiring in the renewal window
      const expiringSubs = this.findExpiringSubscriptions()

      stats.checked = expiringSubs.length

      debug('Found %d subscriptions expiring in next %dms', expiringSubs.length, this.config.renewalWindowMs)

      // 2. Attempt to renew each subscription
      for (const sub of expiringSubs) {
        try {
          const renewed = await this.renewSubscription(sub)
          if (renewed) {
            stats.renewed++
          } else {
            stats.skipped++
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error)
          debug('Failed to renew subscription %s: %s', sub.id, errorMessage)
          stats.failed++
        }
      }

      const duration = Date.now() - startTime
      stats.durationMs = duration

      debug(
        'Renewal run complete: checked=%d, renewed=%d, failed=%d, skipped=%d, duration=%dms',
        stats.checked,
        stats.renewed,
        stats.failed,
        stats.skipped,
        duration
      )

      return stats
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Find subscriptions expiring within the renewal window
   *
   * @returns Array of subscriptions that need renewal
   */
  private findExpiringSubscriptions(): Subscription[] {
    const now = Date.now()
    const renewalDeadline = now + this.config.renewalWindowMs

    const allSubs = this.subscriptionManager.getAllSubscriptions()
    const expiring: Subscription[] = []

    for (const sub of allSubs) {
      // Only consider active subscriptions
      if (!sub.active) {
        continue
      }

      // Check if expiring within window
      if (sub.expiresAt < renewalDeadline) {
        expiring.push(sub)
      }
    }

    return expiring
  }

  /**
   * Attempt to renew a single subscription
   *
   * Flow:
   * 1. Check if autoRenew enabled for subscriber
   * 2. Extract channel ID from subscriber ILP address
   * 3. Check channel balance
   * 4. Send new REQ packet with payment
   * 5. Extend subscription expiration
   *
   * @param sub - Subscription to renew
   * @returns true if renewed, false if skipped
   * @throws Error if renewal fails
   */
  private async renewSubscription(sub: Subscription): Promise<boolean> {
    debug('Attempting to renew subscription: %s (expires at %s)', sub.id, new Date(sub.expiresAt).toISOString())

    // 1. Get preferences for subscriber
    const prefs = await this.preferencesManager.getPreferences(sub.subscriber)

    if (!prefs.autoRenew) {
      debug('Subscription %s has autoRenew=false, skipping', sub.id)
      return false
    }

    // 2. Find payment channel for subscriber
    // Note: For auto-subscriptions, subscriber is the peer's ILP address
    const hasChannel = await this.paymentChannelManager.hasChannel(sub.subscriber)

    if (!hasChannel) {
      debug('No payment channel found for %s, skipping renewal', sub.subscriber)
      return false
    }

    // 3. Check channel balance
    // NOTE: This requires mapping ILP address to channel ID
    // For now, we'll skip balance check and rely on payment failure
    // TODO: Implement channel ID lookup by ILP address

    // 4. Send new REQ packet with payment
    const paymentAmount = prefs.paymentAmountMsats
    const durationMs = prefs.subscriptionDurationMs

    try {
      await sendReqPacket(
        sub.streamConnection,
        {
          subscriptionId: sub.id,
          filters: sub.filters,
        },
        paymentAmount,
        durationMs
      )

      // 5. Extend expiration
      const newExpiry = Date.now() + durationMs
      sub.expiresAt = newExpiry

      debug(
        'Renewed subscription %s: new expiry=%s, payment=%s msats',
        sub.id,
        new Date(newExpiry).toISOString(),
        paymentAmount
      )

      return true
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Check if error is due to insufficient balance
      if (errorMessage.includes('insufficient') || errorMessage.includes('balance')) {
        debug('Insufficient channel balance for renewal of %s', sub.id)
        return false
      }

      // Re-throw other errors
      throw error
    }
  }

  /**
   * Get renewal job status
   *
   * @returns Object with job status information
   */
  getStatus(): { running: boolean; interval: number; windowMs: number; enabled: boolean } {
    return {
      running: this.intervalId !== null,
      interval: this.config.checkIntervalMs,
      windowMs: this.config.renewalWindowMs,
      enabled: this.config.enabled,
    }
  }

  /**
   * Update renewal job configuration
   *
   * If the job is running, it will be restarted with the new configuration.
   *
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<SubscriptionRenewalConfig>): void {
    const wasRunning = this.intervalId !== null

    if (wasRunning) {
      this.stop()
    }

    this.config = { ...this.config, ...config }

    if (wasRunning && this.config.enabled) {
      this.start()
    }

    debug('Updated renewal job config: %o', this.config)
  }
}

/**
 * Singleton instance of SubscriptionRenewalJob
 */
let renewalJobInstance: SubscriptionRenewalJob | null = null

/**
 * Get the singleton instance of SubscriptionRenewalJob
 *
 * @returns Shared SubscriptionRenewalJob instance
 * @throws Error if not initialized
 */
export function getSubscriptionRenewalJob(): SubscriptionRenewalJob {
  if (!renewalJobInstance) {
    throw new Error('SubscriptionRenewalJob not initialized - call setSubscriptionRenewalJob() first')
  }
  return renewalJobInstance
}

/**
 * Set the singleton instance of SubscriptionRenewalJob
 *
 * @param instance - SubscriptionRenewalJob instance to use
 */
export function setSubscriptionRenewalJob(instance: SubscriptionRenewalJob): void {
  renewalJobInstance = instance
}
