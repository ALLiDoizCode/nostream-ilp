import type { TableSchema } from '@dassie/lib-sqlite'

/**
 * Nostr events table schema
 * Stores Nostr events received via BTP-NIPs protocol
 */
export const nostrEventsTable = {
  name: 'nostr_events',
  columns: {
    /**
     * Event ID (hex-encoded SHA-256 hash)
     * This is the primary key and matches the Nostr event ID
     */
    id: 'TEXT PRIMARY KEY NOT NULL',

    /**
     * Author public key (hex-encoded schnorr public key)
     */
    pubkey: 'TEXT NOT NULL',

    /**
     * Unix timestamp when event was created (by author)
     */
    created_at: 'INTEGER NOT NULL',

    /**
     * Event kind (Nostr event type number)
     */
    kind: 'INTEGER NOT NULL',

    /**
     * Event tags (JSON array of string arrays)
     * Stored as TEXT for SQLite JSON queries
     */
    tags: 'TEXT NOT NULL',

    /**
     * Event content (arbitrary string)
     */
    content: 'TEXT NOT NULL',

    /**
     * Schnorr signature (hex-encoded)
     */
    sig: 'TEXT NOT NULL',

    /**
     * Unix timestamp when event was received by this node
     */
    received_at: 'INTEGER NOT NULL',

    /**
     * ILP address of the peer who sent us this event
     */
    source_peer: 'TEXT NOT NULL',
  },
  indexes: {
    /**
     * Index for querying events by author
     */
    idx_nostr_events_pubkey: {
      columns: ['pubkey'],
    },

    /**
     * Index for querying events by kind
     */
    idx_nostr_events_kind: {
      columns: ['kind'],
    },

    /**
     * Index for querying events by creation timestamp
     */
    idx_nostr_events_created_at: {
      columns: ['created_at'],
    },

    /**
     * Index for querying events by receive timestamp
     */
    idx_nostr_events_received_at: {
      columns: ['received_at'],
    },

    /**
     * Composite index for author + kind queries (common filter pattern)
     */
    idx_nostr_events_pubkey_kind: {
      columns: ['pubkey', 'kind'],
    },
  },
} as const satisfies TableSchema

export type NostrEventRow = {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string
  content: string
  sig: string
  received_at: number
  source_peer: string
}
