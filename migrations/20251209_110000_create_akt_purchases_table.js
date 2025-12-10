/**
 * Migration: Create AKT Purchases Table
 *
 * Creates the akt_purchases table for tracking manual AKT token purchases.
 * Used by Story 7.3 to record operator purchases and detect balance changes.
 */

exports.up = async function(knex) {
  await knex.raw(`
    CREATE TABLE akt_purchases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      usd_amount NUMERIC(12,2) NOT NULL,
      akt_amount NUMERIC(12,2) NOT NULL,
      akt_price_usd NUMERIC(8,4) NOT NULL,
      exchange VARCHAR(50),
      tx_hash VARCHAR(100),
      purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      notes TEXT
    );

    CREATE INDEX idx_akt_purchases_purchased_at ON akt_purchases(purchased_at DESC);
    CREATE INDEX idx_akt_purchases_tx_hash ON akt_purchases(tx_hash);
  `);
};

exports.down = async function(knex) {
  await knex.raw(`
    DROP INDEX IF EXISTS idx_akt_purchases_tx_hash;
    DROP INDEX IF EXISTS idx_akt_purchases_purchased_at;
    DROP TABLE IF EXISTS akt_purchases;
  `);
};
