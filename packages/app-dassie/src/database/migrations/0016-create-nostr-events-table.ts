import type { MigrationDefinition } from "@dassie/lib-sqlite"

/**
 * Migration 0016: Create nostr_events table for BTP-NIPs storage
 *
 * This migration adds support for storing Nostr events received via the BTP-NIPs protocol.
 * Events are received over ILP STREAM and stored in SQLite for query and propagation.
 *
 * Table structure:
 * - id: Event ID (hex-encoded SHA-256 hash) - PRIMARY KEY
 * - pubkey: Author public key (hex-encoded schnorr pubkey)
 * - created_at: Unix timestamp (event creation time)
 * - kind: Event kind number
 * - tags: JSON array of tags (stored as TEXT for JSON queries)
 * - content: Event content string
 * - sig: Schnorr signature (hex-encoded)
 * - received_at: Unix timestamp (when we received it)
 * - source_peer: ILP address of the peer who sent us this event
 *
 * Indexes for common queries:
 * - pubkey (author queries)
 * - kind (event type queries)
 * - created_at (time-based queries)
 * - received_at (recent events)
 * - pubkey + kind (combined filter)
 *
 * @see Story 5.10 - Dassie Configuration & BTP-NIPs Reception
 */
const migration: MigrationDefinition = {
  version: 16,
  up: (database) => {
    // Create nostr_events table
    database
      .prepare(
        `
      CREATE TABLE nostr_events (
        id TEXT PRIMARY KEY NOT NULL,
        pubkey TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        kind INTEGER NOT NULL,
        tags TEXT NOT NULL,
        content TEXT NOT NULL,
        sig TEXT NOT NULL,
        received_at INTEGER NOT NULL,
        source_peer TEXT NOT NULL
      ) STRICT
    `,
      )
      .run()

    // Create index for pubkey queries
    database
      .prepare(
        `CREATE INDEX idx_nostr_events_pubkey ON nostr_events(pubkey)`,
      )
      .run()

    // Create index for kind queries
    database
      .prepare(`CREATE INDEX idx_nostr_events_kind ON nostr_events(kind)`)
      .run()

    // Create index for created_at queries
    database
      .prepare(
        `CREATE INDEX idx_nostr_events_created_at ON nostr_events(created_at)`,
      )
      .run()

    // Create index for received_at queries
    database
      .prepare(
        `CREATE INDEX idx_nostr_events_received_at ON nostr_events(received_at)`,
      )
      .run()

    // Create composite index for pubkey + kind queries (common Nostr filter pattern)
    database
      .prepare(
        `CREATE INDEX idx_nostr_events_pubkey_kind ON nostr_events(pubkey, kind)`,
      )
      .run()
  },
  down: (database) => {
    // Drop indexes first
    database.prepare(`DROP INDEX IF EXISTS idx_nostr_events_pubkey_kind`).run()
    database
      .prepare(`DROP INDEX IF EXISTS idx_nostr_events_received_at`)
      .run()
    database.prepare(`DROP INDEX IF EXISTS idx_nostr_events_created_at`).run()
    database.prepare(`DROP INDEX IF EXISTS idx_nostr_events_kind`).run()
    database.prepare(`DROP INDEX IF EXISTS idx_nostr_events_pubkey`).run()

    // Drop table
    database.prepare(`DROP TABLE nostr_events`).run()
  },
}

export default migration
