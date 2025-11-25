/**
 * Drop payment processor tables and functions
 *
 * This migration removes all Lightning Network payment infrastructure
 * in preparation for ILP integration (Story 1.2+).
 *
 * Removed:
 * - invoices table
 * - users table (payment-related columns)
 * - confirm_invoice() function
 * - charge_user() function
 * - now_utc() function
 * - ASSERT_SERIALIZED() function
 *
 * Note: This migration is ONLY for existing deployments that have
 * payment tables. Clean installations should skip payment migrations entirely.
 */

exports.up = async function (knex) {
  return knex.schema
    // Drop functions first (they depend on tables)
    .raw('DROP FUNCTION IF EXISTS charge_user(BYTEA, BIGINT);')
    .raw('DROP FUNCTION IF EXISTS confirm_invoice(UUID, BIGINT, TIMESTAMP WITHOUT TIME ZONE);')
    .raw('DROP FUNCTION IF EXISTS now_utc();')
    .raw('DROP FUNCTION IF EXISTS ASSERT_SERIALIZED();')

    // Drop tables
    .dropTableIfExists('invoices')
    .dropTableIfExists('users')
}

exports.down = function (knex) {
  // No rollback - payment infrastructure will not be restored
  // If rollback is needed, restore from backup or re-fork from upstream Nostream
  throw new Error('Cannot rollback payment processor removal. Restore from backup if needed.')
}
