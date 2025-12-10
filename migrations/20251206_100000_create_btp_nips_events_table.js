/**
 * Migration: Create BTP-NIPs Events Table
 *
 * Creates a dedicated table for storing Nostr events received via BTP-NIPs protocol.
 * This table is separate from the existing Nostream events table to support
 * the BTP-NIPs peer-to-peer architecture.
 *
 * Table: btp_nips_events
 *
 * Indexes:
 * - Primary key on `id` (prevents duplicates)
 * - Index on `pubkey` (query events by author)
 * - Index on `kind` (filter by event type)
 * - Index on `created_at DESC` (time-based queries)
 * - GIN index on `tags` (JSONB tag queries for subscriptions)
 *
 * @see Story 5.2 - BTP-NIPs EVENT Message Handler
 */

exports.up = function (knex) {
  return knex.schema.createTable('btp_nips_events', (table) => {
    // Event ID (SHA-256 hash, hex string) - Primary key prevents duplicates
    table.string('id', 64).primary()

    // Author's public key (hex string, 64 characters)
    table.string('pubkey', 64).notNullable()

    // Unix timestamp (seconds since epoch)
    table.integer('created_at').unsigned().notNullable()

    // Event type (kind number)
    table.integer('kind').unsigned().notNullable()

    // Tags (JSONB for efficient querying)
    table.jsonb('tags').notNullable()

    // Event content (text)
    table.text('content').notNullable()

    // Schnorr signature (hex string, 128 characters)
    table.string('sig', 128).notNullable()

    // When the relay received this event (for internal tracking)
    table.timestamp('received_at', { useTz: true }).defaultTo(knex.fn.now())

    // Indexes for efficient querying
    table.index('pubkey', 'idx_btp_nips_events_pubkey')
    table.index('kind', 'idx_btp_nips_events_kind')
    table.index('created_at', 'idx_btp_nips_events_created_at')

    // GIN index on JSONB tags for tag-based filtering (Story 5.3 REQ handler)
    // This enables queries like: WHERE tags @> '[["e", "event_id"]]'
    table.index('tags', 'idx_btp_nips_events_tags', 'GIN')
  })
}

exports.down = function (knex) {
  return knex.schema.dropTable('btp_nips_events')
}
