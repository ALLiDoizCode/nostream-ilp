/**
 * Migration: Enhance BTP-NIPs Storage Layer
 *
 * Adds support for:
 * - NIP-09: Soft delete (is_deleted column)
 * - NIP-40: Event expiration (expires_at column)
 * - Performance: Indexes for efficient querying
 *
 * @see https://github.com/nostr-protocol/nips/blob/master/09.md
 * @see https://github.com/nostr-protocol/nips/blob/master/40.md
 */

exports.up = async (knex) => {
  // Add is_deleted column for NIP-09 soft delete support
  await knex.schema.alterTable('btp_nips_events', (table) => {
    table.boolean('is_deleted').defaultTo(false).notNullable()
      .comment('Soft delete flag for NIP-09 event deletion')
  })

  // Add expires_at column for NIP-40 expiration timestamps
  await knex.schema.alterTable('btp_nips_events', (table) => {
    table.integer('expires_at').nullable()
      .comment('Unix timestamp for NIP-40 event expiration')
  })

  // Add index on is_deleted for filtering deleted events
  await knex.schema.alterTable('btp_nips_events', (table) => {
    table.index('is_deleted', 'idx_btp_nips_events_is_deleted')
  })

  // Add index on expires_at for expiration queries
  await knex.schema.alterTable('btp_nips_events', (table) => {
    table.index('expires_at', 'idx_btp_nips_events_expires_at')
  })

  // Update unique constraint to exclude deleted events
  // Drop existing unique constraint
  await knex.schema.alterTable('btp_nips_events', (table) => {
    table.dropUnique(['id'], 'btp_nips_events_id_unique')
  })

  // Recreate unique constraint with partial index (PostgreSQL-specific)
  // Only enforce uniqueness on non-deleted events
  await knex.raw(`
    CREATE UNIQUE INDEX btp_nips_events_id_unique_active
    ON btp_nips_events(id)
    WHERE is_deleted = false
  `)
}

exports.down = async (knex) => {
  // Drop partial unique index
  await knex.raw('DROP INDEX IF EXISTS btp_nips_events_id_unique_active')

  // Restore original unique constraint
  await knex.schema.alterTable('btp_nips_events', (table) => {
    table.unique(['id'], 'btp_nips_events_id_unique')
  })

  // Drop indexes
  await knex.schema.alterTable('btp_nips_events', (table) => {
    table.dropIndex('expires_at', 'idx_btp_nips_events_expires_at')
  })

  await knex.schema.alterTable('btp_nips_events', (table) => {
    table.dropIndex('is_deleted', 'idx_btp_nips_events_is_deleted')
  })

  // Drop columns
  await knex.schema.alterTable('btp_nips_events', (table) => {
    table.dropColumn('expires_at')
  })

  await knex.schema.alterTable('btp_nips_events', (table) => {
    table.dropColumn('is_deleted')
  })
}
