/**
 * Add free tier tracking tables
 *
 * This migration adds tables to track free event counts per pubkey
 * and manage whitelist for unlimited free events.
 *
 * Story 1.6: Implement Free Tier / Grace Period
 *
 * Tables:
 * - pubkey_event_counts: Tracks number of events stored per pubkey
 * - free_tier_whitelist: Pubkeys exempt from payment requirements
 */

exports.up = async function (knex) {
  return knex.schema
    // Create pubkey_event_counts table
    .createTable('pubkey_event_counts', (table) => {
      table.text('pubkey').primary()
      table.integer('event_count').notNullable().defaultTo(0)
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now())
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now())

      // Index for fast pubkey lookups
      table.index('pubkey', 'idx_pubkey_event_counts_pubkey')
    })
    .raw(`COMMENT ON TABLE pubkey_event_counts IS 'Tracks number of events stored per pubkey for free tier enforcement'`)

    // Create free_tier_whitelist table
    .createTable('free_tier_whitelist', (table) => {
      table.text('pubkey').primary()
      table.text('description')
      table.timestamp('added_at').notNullable().defaultTo(knex.fn.now())
    })
    .raw(`COMMENT ON TABLE free_tier_whitelist IS 'Pubkeys exempt from payment requirements (unlimited free events)'`)
}

exports.down = async function (knex) {
  return knex.schema
    .dropTableIfExists('free_tier_whitelist')
    .dropTableIfExists('pubkey_event_counts')
}
