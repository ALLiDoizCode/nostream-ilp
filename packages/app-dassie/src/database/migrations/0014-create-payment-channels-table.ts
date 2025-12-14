import type { MigrationDefinition } from "@dassie/lib-sqlite"

export const CREATE_PAYMENT_CHANNELS_TABLE = `
CREATE TABLE payment_channels (
  channel_id TEXT PRIMARY KEY NOT NULL,
  sender_pubkey TEXT NOT NULL,
  recipient_pubkey TEXT NOT NULL,
  currency TEXT NOT NULL,
  capacity_sats INTEGER NOT NULL,
  highest_nonce INTEGER NOT NULL DEFAULT 0,
  expiration INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT
`

const migration: MigrationDefinition = {
  version: 14,
  up: (database) => {
    database.prepare(CREATE_PAYMENT_CHANNELS_TABLE).run()
  },
  down: (database) => {
    database.prepare(`DROP TABLE payment_channels`).run()
  },
}

export default migration
