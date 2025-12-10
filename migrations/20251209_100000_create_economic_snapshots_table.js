/**
 * Migration: Create economic_snapshots table
 *
 * This table stores periodic economic health snapshots for the relay,
 * tracking revenue sources, expenses, and balances in USD.
 *
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  pgm.createTable('economic_snapshots', {
    timestamp: {
      type: 'timestamptz',
      notNull: true,
      primaryKey: true,
      comment: 'Snapshot creation timestamp'
    },
    revenue_usd: {
      type: 'numeric(12,2)',
      notNull: true,
      default: 0,
      comment: 'Total revenue in USD'
    },
    subscription_revenue_usd: {
      type: 'numeric(12,2)',
      notNull: true,
      default: 0,
      comment: 'Revenue from REQ subscriptions in USD'
    },
    routing_revenue_usd: {
      type: 'numeric(12,2)',
      notNull: true,
      default: 0,
      comment: 'Revenue from ILP routing fees in USD'
    },
    content_revenue_usd: {
      type: 'numeric(12,2)',
      notNull: true,
      default: 0,
      comment: 'Revenue from paid EVENT deliveries in USD'
    },
    expenses_usd: {
      type: 'numeric(12,2)',
      notNull: true,
      default: 0,
      comment: 'Total expenses in USD'
    },
    akash_cost_usd: {
      type: 'numeric(12,2)',
      notNull: true,
      default: 0,
      comment: 'Akash hosting cost in USD'
    },
    gas_fees_usd: {
      type: 'numeric(12,2)',
      notNull: true,
      default: 0,
      comment: 'Blockchain gas fees in USD'
    },
    net_profit_usd: {
      type: 'numeric(12,2)',
      notNull: true,
      default: 0,
      comment: 'Net profit (revenue - expenses) in USD'
    },
    eth_balance: {
      type: 'bigint',
      notNull: true,
      default: 0,
      comment: 'ETH balance in wei'
    },
    usdc_balance: {
      type: 'bigint',
      notNull: true,
      default: 0,
      comment: 'USDC balance (6 decimals)'
    },
    akt_balance: {
      type: 'bigint',
      notNull: true,
      default: 0,
      comment: 'AKT balance in uakt'
    }
  });

  // Create index for efficient time-based queries
  pgm.createIndex('economic_snapshots', 'timestamp', {
    name: 'idx_economic_snapshots_timestamp',
    method: 'btree',
    order: 'DESC'
  });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropIndex('economic_snapshots', 'timestamp', {
    name: 'idx_economic_snapshots_timestamp',
    ifExists: true
  });
  pgm.dropTable('economic_snapshots', { ifExists: true });
};
