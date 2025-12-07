/**
 * Migration: Add ILP Node Announcement Index
 *
 * Epic 6: Peer Networking & Social Graph Integration
 * Story 6.1: ILP Node Announcement (Kind 32001)
 *
 * Adds optimized index for querying ILP node announcements by pubkey.
 * Target query time: <10ms for single announcement query.
 *
 * Index details:
 * - Partial index (WHERE kind = 32001) - only indexes relevant events
 * - Covers pubkey lookups for peer discovery
 * - Enables fast announcement queries for follow list sync
 *
 * @see docs/stories/6.1.story.md#task-6
 */

exports.up = async (knex) => {
  // Add partial index on (pubkey) for Kind 32001 events
  // This enables fast queries like:
  // SELECT * FROM btp_nips_events WHERE kind = 32001 AND pubkey = ?
  await knex.raw(`
    CREATE INDEX idx_btp_nips_events_kind_32001_pubkey
    ON btp_nips_events (pubkey)
    WHERE kind = 32001 AND is_deleted = false
  `)

  // Add comment explaining the index
  await knex.raw(`
    COMMENT ON INDEX idx_btp_nips_events_kind_32001_pubkey IS
    'Optimized index for ILP node announcement queries (Kind 32001) by pubkey. Enables <10ms query performance for peer discovery.'
  `)
}

exports.down = async (knex) => {
  // Drop the partial index
  await knex.raw('DROP INDEX IF EXISTS idx_btp_nips_events_kind_32001_pubkey')
}
