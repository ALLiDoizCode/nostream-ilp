/**
 * Migration: Create Follow Lists Table
 *
 * Creates tables for storing follow lists and failed subscription tracking.
 * Used by Story 6.3 (Follow List Integration).
 *
 * Tables:
 * - follow_lists: Stores extracted follow lists from Kind 3 events
 * - failed_subscriptions: Tracks failed subscription attempts for retry logic
 * - subscription_preferences: Stores user preferences for auto-subscriptions
 *
 * @see Story 6.3 - Follow List Integration (Kind 3)
 */

exports.up = function (knex) {
  return knex.schema
    .createTable('follow_lists', (table) => {
      // User's public key (primary key)
      table.string('pubkey', 64).primary()

      // Array of followed pubkeys
      table.specificType('follows', 'TEXT[]').notNullable()

      // Last update timestamp
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

      // Index for fast lookups
      table.index('pubkey', 'idx_follow_lists_pubkey')
    })
    .createTable('failed_subscriptions', (table) => {
      // Auto-incrementing ID
      table.increments('id').primary()

      // Local user's pubkey
      table.string('pubkey', 64).notNullable()

      // Peer we failed to subscribe to
      table.string('followed_pubkey', 64).notNullable()

      // Failure reason
      table.text('reason').notNullable()

      // When subscription was attempted
      table.timestamp('attempted_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

      // When to retry (NULL if not retrying)
      table.timestamp('retry_after', { useTz: true })

      // Unique constraint: one failed subscription per (pubkey, followed_pubkey) pair
      table.unique(['pubkey', 'followed_pubkey'], 'unique_failed_sub')

      // Index for retry queue queries
      table.index('retry_after', 'idx_failed_subs_retry')
    })
    .createTable('subscription_preferences', (table) => {
      // User's public key (primary key)
      table.string('pubkey', 64).primary()

      // Default filters as JSON (NULL uses global defaults)
      table.jsonb('default_filters')

      // Subscription duration in milliseconds
      table.integer('subscription_duration_ms').unsigned()

      // Payment amount in millisatoshis
      table.string('payment_amount_msats', 32)

      // Auto-renew flag
      table.boolean('auto_renew')

      // Maximum subscriptions allowed
      table.integer('max_subscriptions').unsigned()

      // Last update timestamp
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())

      // Index for lookups
      table.index('pubkey', 'idx_subscription_prefs_pubkey')
    })
}

exports.down = function (knex) {
  return knex.schema
    .dropTableIfExists('subscription_preferences')
    .dropTableIfExists('failed_subscriptions')
    .dropTableIfExists('follow_lists')
}
