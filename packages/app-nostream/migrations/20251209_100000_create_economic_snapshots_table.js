/**
 * Migration: Create economic_snapshots table
 *
 * This table stores periodic economic health snapshots for the relay,
 * tracking revenue sources, expenses, and balances in USD.
 */

exports.up = async (knex) => {
  await knex.schema.createTable('economic_snapshots', (table) => {
    table.timestamp('timestamp', { useTz: true }).primary().notNullable()
      .comment('Snapshot creation timestamp')
    table.decimal('revenue_usd', 12, 2).notNullable().defaultTo(0)
      .comment('Total revenue in USD')
    table.decimal('subscription_revenue_usd', 12, 2).notNullable().defaultTo(0)
      .comment('Revenue from REQ subscriptions in USD')
    table.decimal('routing_revenue_usd', 12, 2).notNullable().defaultTo(0)
      .comment('Revenue from ILP routing fees in USD')
    table.decimal('content_revenue_usd', 12, 2).notNullable().defaultTo(0)
      .comment('Revenue from paid EVENT deliveries in USD')
    table.decimal('expenses_usd', 12, 2).notNullable().defaultTo(0)
      .comment('Total expenses in USD')
    table.decimal('akash_cost_usd', 12, 2).notNullable().defaultTo(0)
      .comment('Akash hosting cost in USD')
    table.decimal('gas_fees_usd', 12, 2).notNullable().defaultTo(0)
      .comment('Blockchain gas fees in USD')
    table.decimal('net_profit_usd', 12, 2).notNullable().defaultTo(0)
      .comment('Net profit (revenue - expenses) in USD')
    table.bigInteger('eth_balance').notNullable().defaultTo(0)
      .comment('ETH balance in wei')
    table.bigInteger('usdc_balance').notNullable().defaultTo(0)
      .comment('USDC balance (6 decimals)')
    table.bigInteger('akt_balance').notNullable().defaultTo(0)
      .comment('AKT balance in uakt')

    // Create index for efficient time-based queries
    table.index('timestamp', 'idx_economic_snapshots_timestamp')
  })
};

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('economic_snapshots')
};
