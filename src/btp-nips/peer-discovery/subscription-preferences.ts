import { createLogger } from '../../factories/logger-factory.js'
import { getMasterDbClient, getReadReplicaDbClient } from '../../database/client.js'

import type { Knex } from 'knex'
import type { NostrFilter: _NostrFilter,} from '../types/index.js'

/**
 * Subscription Preferences Manager
 *
 * Manages user preferences for auto-subscriptions to followed peers.
 * Provides defaults and per-user customization.
 *
 * @module btp-nips/peer-discovery/subscription-preferences
 */

const debug = createLogger('btp-nips:subscription-preferences')

/**
 * Subscription preferences for auto-subscriptions
 */
export interface SubscriptionPreferences {
  /** Default filters to apply to followed peers */
  defaultFilters: NostrFilter[]
  /** Subscription duration in milliseconds (default: 86400000 = 1 day) */
  subscriptionDurationMs: number
  /** Payment amount per subscription in millisatoshis */
  paymentAmountMsats: string
  /** Whether to automatically renew expiring subscriptions */
  autoRenew: boolean
  /** Maximum number of subscriptions per user */
  maxSubscriptions: number
}

/**
 * Default subscription preferences
 */
const DEFAULT_PREFERENCES: SubscriptionPreferences = {
  defaultFilters: [{ kinds: [1, 30023] }], // Short notes and long-form content
  subscriptionDurationMs: 86400000, // 1 day
  paymentAmountMsats: '1000', // 1 sat
  autoRenew: true,
  maxSubscriptions: 100,
}

/**
 * Subscription Preferences Manager
 *
 * Manages user-specific preferences for auto-subscriptions.
 * Preferences are stored in PostgreSQL with defaults for users without custom settings.
 *
 * Usage:
 * ```typescript
 * const manager = new SubscriptionPreferencesManager();
 *
 * // Get preferences (returns defaults if none set)
 * const prefs = await manager.getPreferences('g.dassie.alice');
 *
 * // Update preferences
 * await manager.setPreferences('g.dassie.alice', {
 *   paymentAmountMsats: '5000', // Increase payment to 5 sats
 *   autoRenew: false
 * });
 *
 * // Get default filters for a specific follow
 * const filters = manager.getDefaultFiltersForFollow('bob_pubkey');
 * ```
 */
export class SubscriptionPreferencesManager {
  private writeDb: Knex
  private readDb: Knex

  /**
   * Create a SubscriptionPreferencesManager instance
   *
   * @param writeDb - Master database client (optional)
   * @param readDb - Read replica client (optional)
   */
  constructor(writeDb?: Knex, readDb?: Knex) {
    this.writeDb = writeDb ?? getMasterDbClient()
    this.readDb = readDb ?? getReadReplicaDbClient()
  }

  /**
   * Get subscription preferences for a user
   *
   * Returns default preferences if the user hasn't customized their settings.
   *
   * @param pubkey - User's public key or ILP address
   * @returns Subscription preferences (defaults or custom)
   *
   * @example
   * ```typescript
   * const prefs = await manager.getPreferences('alice_pubkey');
   * console.log('Payment amount:', prefs.paymentAmountMsats, 'msats');
   * ```
   */
  async getPreferences(pubkey: string): Promise<SubscriptionPreferences> {
    try {
      // Query database for custom preferences
      const row = await this.readDb('subscription_preferences')
        .where({ pubkey })
        .first()

      if (!row) {
        debug('No custom preferences for %s, using defaults', pubkey.substring(0, 8))
        return DEFAULT_PREFERENCES
      }

      // Merge stored preferences with defaults
      const stored: Partial<SubscriptionPreferences> = {
        defaultFilters: row.default_filters ? JSON.parse(row.default_filters) : undefined,
        subscriptionDurationMs: row.subscription_duration_ms ?? undefined,
        paymentAmountMsats: row.payment_amount_msats ?? undefined,
        autoRenew: row.auto_renew ?? undefined,
        maxSubscriptions: row.max_subscriptions ?? undefined,
      }

      const merged = {
        ...DEFAULT_PREFERENCES,
        ...Object.fromEntries(
          Object.entries(stored).filter(([_, v]) => v !== undefined)
        ),
      } as SubscriptionPreferences

      debug('Loaded preferences for %s', pubkey.substring(0, 8))

      return merged
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      debug('Failed to get preferences for %s: %s', pubkey.substring(0, 8), errorMessage)
      // Return defaults on error
      return DEFAULT_PREFERENCES
    }
  }

  /**
   * Set subscription preferences for a user
   *
   * Updates preferences in the database. Partial updates are supported
   * (only specified fields are updated, others remain at current values).
   *
   * @param pubkey - User's public key or ILP address
   * @param prefs - Partial preferences to update
   *
   * @example
   * ```typescript
   * await manager.setPreferences('alice_pubkey', {
   *   paymentAmountMsats: '2000', // Increase to 2 sats
   *   subscriptionDurationMs: 172800000 // 2 days
   * });
   * ```
   */
  async setPreferences(pubkey: string, prefs: Partial<SubscriptionPreferences>): Promise<void> {
    try {
      // Build update object
      const updateData: Record<string, unknown> = {
        pubkey,
        updated_at: this.writeDb.fn.now(),
      }

      if (prefs.defaultFilters !== undefined) {
        updateData.default_filters = JSON.stringify(prefs.defaultFilters)
      }

      if (prefs.subscriptionDurationMs !== undefined) {
        updateData.subscription_duration_ms = prefs.subscriptionDurationMs
      }

      if (prefs.paymentAmountMsats !== undefined) {
        updateData.payment_amount_msats = prefs.paymentAmountMsats
      }

      if (prefs.autoRenew !== undefined) {
        updateData.auto_renew = prefs.autoRenew
      }

      if (prefs.maxSubscriptions !== undefined) {
        updateData.max_subscriptions = prefs.maxSubscriptions
      }

      // Upsert preferences
      await this.writeDb('subscription_preferences')
        .insert(updateData)
        .onConflict('pubkey')
        .merge(updateData)

      debug('Updated preferences for %s', pubkey.substring(0, 8))
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      debug('Failed to set preferences for %s: %s', pubkey.substring(0, 8), errorMessage)
      throw error
    }
  }

  /**
   * Get default filters for a specific follow
   *
   * Returns filters customized for the followed pubkey.
   * Default: All events from the followed user (kinds 1 and 30023).
   *
   * @param followedPubkey - The pubkey of the followed user
   * @returns Nostr filters for the subscription
   *
   * @example
   * ```typescript
   * const filters = manager.getDefaultFiltersForFollow('bob_pubkey');
   * // Returns: [{ authors: ['bob_pubkey'], kinds: [1, 30023] }]
   * ```
   */
  getDefaultFiltersForFollow(followedPubkey: string): NostrFilter[] {
    return [
      {
        authors: [followedPubkey],
        kinds: [1, 30023], // Short notes and long-form content
      },
    ]
  }

  /**
   * Get the default preferences (for reference)
   *
   * @returns Default SubscriptionPreferences
   */
  getDefaultPreferences(): SubscriptionPreferences {
    return { ...DEFAULT_PREFERENCES }
  }
}

/**
 * Singleton instance of SubscriptionPreferencesManager
 */
let managerInstance: SubscriptionPreferencesManager | null = null

/**
 * Get the singleton instance of SubscriptionPreferencesManager
 *
 * @returns Shared SubscriptionPreferencesManager instance
 */
export function getSubscriptionPreferencesManager(): SubscriptionPreferencesManager {
  if (!managerInstance) {
    managerInstance = new SubscriptionPreferencesManager()
  }
  return managerInstance
}
