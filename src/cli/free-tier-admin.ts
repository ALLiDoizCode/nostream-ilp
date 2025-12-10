#!/usr/bin/env tsx

import knex, { Knex } from 'knex'
import { FreeTierRepository } from '../repositories/free-tier-repository'
import { FreeTierTracker } from '../services/payment/free-tier-tracker'

/**
 * Free Tier Admin CLI
 *
 * Command-line tool for managing free tier whitelist and checking pubkey status.
 * Requires database connection configuration via environment variables.
 *
 * Usage:
 *   pnpm free-tier-admin add <pubkey> [description]
 *   pnpm free-tier-admin remove <pubkey>
 *   pnpm free-tier-admin list
 *   pnpm free-tier-admin status <pubkey>
 *
 * @module cli/free-tier-admin
 */

// Load database configuration from environment
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'nostream',
  user: process.env.DB_USER || 'nostream',
  password: process.env.DB_PASSWORD || 'nostream',
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
Free Tier Admin CLI - Manage whitelist and check pubkey status

Usage:
  pnpm free-tier-admin <command> [options]

Commands:
  add <pubkey> [description]    Add pubkey to whitelist (unlimited free events)
  remove <pubkey>               Remove pubkey from whitelist
  list                          List all whitelisted pubkeys
  status <pubkey>               Show free tier status for pubkey

Examples:
  # Add developer to whitelist
  pnpm free-tier-admin add 3bf0c63fcb93...efa459d "Core developer"

  # Remove from whitelist
  pnpm free-tier-admin remove 3bf0c63fcb93...efa459d

  # List all whitelisted pubkeys
  pnpm free-tier-admin list

  # Check status for specific pubkey
  pnpm free-tier-admin status 3bf0c63fcb93...efa459d

Environment Variables:
  DB_HOST      PostgreSQL host (default: localhost)
  DB_PORT      PostgreSQL port (default: 5432)
  DB_NAME      Database name (default: nostream)
  DB_USER      Database user (default: nostream)
  DB_PASSWORD  Database password (default: nostream)
`)
}

/**
 * Add pubkey to whitelist
 */
async function addToWhitelist(
  tracker: FreeTierTracker,
  pubkey: string,
  description: string
): Promise<void> {
  try {
    await tracker.addToWhitelist(pubkey, description)
    console.log(`✅ Added pubkey to whitelist: ${pubkey}`)
    console.log(`   Description: ${description}`)
  } catch (error) {
    console.error('❌ Failed to add pubkey to whitelist:', error)
    process.exit(1)
  }
}

/**
 * Remove pubkey from whitelist
 */
async function removeFromWhitelist(
  tracker: FreeTierTracker,
  pubkey: string
): Promise<void> {
  try {
    await tracker.removeFromWhitelist(pubkey)
    console.log(`✅ Removed pubkey from whitelist: ${pubkey}`)
  } catch (error) {
    console.error('❌ Failed to remove pubkey from whitelist:', error)
    process.exit(1)
  }
}

/**
 * List all whitelisted pubkeys
 */
async function listWhitelist(dbClient: Knex): Promise<void> {
  try {
    const rows = await dbClient('free_tier_whitelist')
      .select('pubkey', 'description', 'added_at')
      .orderBy('added_at', 'desc')

    if (rows.length === 0) {
      console.log('No pubkeys in whitelist.')
      return
    }

    console.log(`\nWhitelisted Pubkeys (${rows.length} total):\n`)
    for (const row of rows) {
      console.log(`  Pubkey:      ${row.pubkey}`)
      console.log(`  Description: ${row.description || '(none)'}`)
      console.log(`  Added:       ${new Date(row.added_at).toISOString()}`)
      console.log('')
    }
  } catch (error) {
    console.error('❌ Failed to list whitelist:', error)
    process.exit(1)
  }
}

/**
 * Check status for specific pubkey
 */
async function checkStatus(
  tracker: FreeTierTracker,
  pubkey: string
): Promise<void> {
  try {
    const status = await tracker.checkFreeTierEligibility(pubkey)

    console.log(`\nFree Tier Status for: ${pubkey}\n`)
    console.log(`  Eligible:       ${status.eligible ? '✅ Yes' : '❌ No'}`)
    console.log(`  Whitelisted:    ${status.whitelisted ? '✅ Yes' : '❌ No'}`)
    console.log(`  Events Used:    ${status.eventsUsed}`)
    console.log(
      `  Events Remaining: ${
        status.eventsRemaining === -1
          ? 'Unlimited (whitelisted)'
          : status.eventsRemaining
      }`
    )
    console.log('')

    if (status.eligible && !status.whitelisted && status.eventsRemaining <= 10) {
      console.log('⚠️  Warning: User is approaching free tier limit!')
      console.log(`   Only ${status.eventsRemaining} events remaining before payment required.`)
      console.log('')
    }

    if (!status.eligible && !status.whitelisted) {
      console.log('ℹ️  This pubkey has exhausted their free tier.')
      console.log('   Payment is now required for all events.')
      console.log('')
    }
  } catch (error) {
    console.error('❌ Failed to check status:', error)
    process.exit(1)
  }
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage()
    process.exit(0)
  }

  const command = args[0]

  // Initialize database connection
  const dbClient = knex({
    client: 'pg',
    connection: dbConfig,
  })

  const repository = new FreeTierRepository(dbClient)
  const tracker = new FreeTierTracker(repository)

  try {
    switch (command) {
      case 'add': {
        if (args.length < 2) {
          console.error('❌ Error: pubkey required')
          console.error('Usage: pnpm free-tier-admin add <pubkey> [description]')
          process.exit(1)
        }
        const pubkey = args[1]
        const description = args.slice(2).join(' ') || 'No description provided'
        await addToWhitelist(tracker, pubkey, description)
        break
      }

      case 'remove': {
        if (args.length < 2) {
          console.error('❌ Error: pubkey required')
          console.error('Usage: pnpm free-tier-admin remove <pubkey>')
          process.exit(1)
        }
        const pubkey = args[1]
        await removeFromWhitelist(tracker, pubkey)
        break
      }

      case 'list': {
        await listWhitelist(dbClient)
        break
      }

      case 'status': {
        if (args.length < 2) {
          console.error('❌ Error: pubkey required')
          console.error('Usage: pnpm free-tier-admin status <pubkey>')
          process.exit(1)
        }
        const pubkey = args[1]
        await checkStatus(tracker, pubkey)
        break
      }

      default:
        console.error(`❌ Unknown command: ${command}`)
        printUsage()
        process.exit(1)
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  } finally {
    await dbClient.destroy()
  }
}

// Run CLI
main().catch((_error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
