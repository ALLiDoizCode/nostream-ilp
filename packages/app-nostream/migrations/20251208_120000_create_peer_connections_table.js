/**
 * Database migration: Create peer_connections table
 *
 * Story 6.5: Peer Connection Lifecycle
 *
 * This migration creates the peer_connections table for storing
 * stateful peer connection information including state machine states,
 * heartbeat timestamps, and reconnection attempts.
 */

/**
 * Create peer_connections table
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.up = async function (knex) {
  await knex.schema.createTable('peer_connections', (table) => {
    // Primary key
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    // Unique peer identifier
    table.string('nostr_pubkey', 64).notNullable().unique();

    // Connection details
    table.string('ilp_address', 255).nullable();
    table.string('endpoint', 255).nullable();
    table.string('base_address', 42).nullable(); // Ethereum address length
    table.string('channel_id', 255).nullable();

    // State machine
    table.enum('state', [
      'discovering',
      'connecting',
      'channel_needed',
      'channel_opening',
      'connected',
      'disconnected',
      'failed'
    ]).notNullable().defaultTo('discovering');

    // Priority and reconnection
    table.integer('priority').notNullable().defaultTo(10); // 1-10, lower = higher priority
    table.bigInteger('last_heartbeat').nullable(); // Unix timestamp in milliseconds
    table.integer('reconnect_attempts').notNullable().defaultTo(0);

    // Active subscriptions (JSON array of subscription IDs)
    table.jsonb('subscription_ids').notNullable().defaultTo('[]');

    // Timestamps
    table.bigInteger('created_at').notNullable().defaultTo(knex.raw('EXTRACT(EPOCH FROM NOW()) * 1000'));
    table.bigInteger('updated_at').notNullable().defaultTo(knex.raw('EXTRACT(EPOCH FROM NOW()) * 1000'));

    // Indexes
    table.index('nostr_pubkey', 'idx_peer_connections_pubkey');
    table.index('state', 'idx_peer_connections_state');
    table.index('priority', 'idx_peer_connections_priority');
    table.index(['state', 'priority'], 'idx_peer_connections_state_priority');
  });

  // Create trigger to auto-update updated_at timestamp
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_peer_connections_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = EXTRACT(EPOCH FROM NOW()) * 1000;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER peer_connections_updated_at_trigger
    BEFORE UPDATE ON peer_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_peer_connections_updated_at();
  `);
};

/**
 * Drop peer_connections table
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<void>}
 */
exports.down = async function (knex) {
  await knex.raw('DROP TRIGGER IF EXISTS peer_connections_updated_at_trigger ON peer_connections');
  await knex.raw('DROP FUNCTION IF EXISTS update_peer_connections_updated_at()');
  await knex.schema.dropTableIfExists('peer_connections');
};
