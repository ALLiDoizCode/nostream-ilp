/**
 * Migration: Create escrow_deposits table
 *
 * This table tracks automated deposits to Akash escrow accounts for deployment hosting payments.
 * Each record represents a single deposit transaction from the relay wallet to an escrow account.
 */

exports.up = function(knex) {
  return knex.raw(`
    CREATE TABLE escrow_deposits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      amount_akt NUMERIC(12,2) NOT NULL,
      escrow_address VARCHAR(100) NOT NULL,
      tx_hash VARCHAR(100) NOT NULL,
      deposited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      new_balance_akt NUMERIC(12,2) NOT NULL,
      lease_id VARCHAR(200),
      notes TEXT
    );

    CREATE INDEX idx_escrow_deposits_deposited_at ON escrow_deposits(deposited_at DESC);
    CREATE INDEX idx_escrow_deposits_tx_hash ON escrow_deposits(tx_hash);
    CREATE INDEX idx_escrow_deposits_lease_id ON escrow_deposits(lease_id);
  `);
};

exports.down = function(knex) {
  return knex.raw(`
    DROP INDEX IF EXISTS idx_escrow_deposits_lease_id;
    DROP INDEX IF EXISTS idx_escrow_deposits_tx_hash;
    DROP INDEX IF EXISTS idx_escrow_deposits_deposited_at;
    DROP TABLE IF EXISTS escrow_deposits;
  `);
};
