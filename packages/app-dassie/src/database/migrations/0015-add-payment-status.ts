import type { MigrationDefinition } from "@dassie/lib-sqlite"

/**
 * Migration 0015: Add payment status tracking columns to outgoing_payment table
 *
 * This migration adds support for tracking payment status, sent amounts, and errors
 * to enable the test framework to query payment status.
 *
 * New columns:
 * - status: Payment status (pending, fulfilled, failed)
 * - sent_amount: Amount actually delivered (may differ from total_amount due to fees)
 * - error: Error message if payment failed
 *
 * @see Story 5.9 - Dassie tRPC Endpoints for Test Integration
 */
const migration: MigrationDefinition = {
  version: 15,
  up: (database) => {
    // Add status column with default 'pending'
    database
      .prepare(
        `ALTER TABLE outgoing_payment ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`,
      )
      .run()

    // Add sent_amount column with default 0
    database
      .prepare(
        `ALTER TABLE outgoing_payment ADD COLUMN sent_amount INTEGER NOT NULL DEFAULT 0`,
      )
      .run()

    // Add error column (nullable)
    database
      .prepare(`ALTER TABLE outgoing_payment ADD COLUMN error TEXT`)
      .run()
  },
  down: (database) => {
    // SQLite doesn't support dropping columns easily, so we need to recreate the table
    // Create a temporary table with the old schema
    database
      .prepare(
        `
      CREATE TABLE outgoing_payment_backup (
        id TEXT PRIMARY KEY NOT NULL,
        destination TEXT NOT NULL,
        ledger TEXT NOT NULL,
        total_amount INTEGER NOT NULL,
        metadata TEXT NOT NULL
      ) STRICT
    `,
      )
      .run()

    // Copy data from the current table
    database
      .prepare(
        `
      INSERT INTO outgoing_payment_backup (id, destination, ledger, total_amount, metadata)
      SELECT id, destination, ledger, total_amount, metadata FROM outgoing_payment
    `,
      )
      .run()

    // Drop the current table
    database.prepare(`DROP TABLE outgoing_payment`).run()

    // Rename the backup table
    database
      .prepare(`ALTER TABLE outgoing_payment_backup RENAME TO outgoing_payment`)
      .run()
  },
}

export default migration
