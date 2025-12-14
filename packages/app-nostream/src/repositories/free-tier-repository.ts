import { DatabaseClient, Pubkey } from '../@types/base'
import { createLogger } from '../factories/logger-factory'

const debug = createLogger('free-tier-repository')

export interface IFreeTierRepository {
  getEventCount(pubkey: Pubkey): Promise<number>
  incrementEventCount(pubkey: Pubkey): Promise<void>
  isWhitelisted(pubkey: Pubkey): Promise<boolean>
  addToWhitelist(pubkey: Pubkey, description: string): Promise<void>
  removeFromWhitelist(pubkey: Pubkey): Promise<void>
}

interface PubkeyEventCount {
  pubkey: string
  event_count: number
  created_at: Date
  updated_at: Date
}

interface FreeTierWhitelist {
  pubkey: string
  description: string | null
  added_at: Date
}

export class FreeTierRepository implements IFreeTierRepository {
  public constructor(private readonly dbClient: DatabaseClient) {}

  /**
   * Get event count for a pubkey
   * Returns 0 if pubkey not found
   */
  public async getEventCount(
    pubkey: Pubkey,
    client: DatabaseClient = this.dbClient
  ): Promise<number> {
    debug('get event count for pubkey: %s', pubkey)

    const result = await client<PubkeyEventCount>('pubkey_event_counts')
      .select('event_count')
      .where('pubkey', pubkey)
      .first()

    return result?.event_count ?? 0
  }

  /**
   * Atomically increment event count for a pubkey
   * Uses INSERT ... ON CONFLICT DO UPDATE for atomic operation
   */
  public async incrementEventCount(
    pubkey: Pubkey,
    client: DatabaseClient = this.dbClient
  ): Promise<void> {
    debug('increment event count for pubkey: %s', pubkey)

    const now = new Date()

    await client.raw(`
      INSERT INTO pubkey_event_counts (pubkey, event_count, created_at, updated_at)
      VALUES (?, 1, ?, ?)
      ON CONFLICT (pubkey) DO UPDATE
      SET event_count = pubkey_event_counts.event_count + 1,
          updated_at = ?
    `, [pubkey, now, now, now])
  }

  /**
   * Check if pubkey is whitelisted
   */
  public async isWhitelisted(
    pubkey: Pubkey,
    client: DatabaseClient = this.dbClient
  ): Promise<boolean> {
    debug('check whitelist for pubkey: %s', pubkey)

    const result = await client<FreeTierWhitelist>('free_tier_whitelist')
      .select(client.raw('1'))
      .where('pubkey', pubkey)
      .first()

    return !!result
  }

  /**
   * Add pubkey to whitelist
   * Idempotent - no error if pubkey already whitelisted
   */
  public async addToWhitelist(
    pubkey: Pubkey,
    description: string,
    client: DatabaseClient = this.dbClient
  ): Promise<void> {
    debug('add pubkey to whitelist: %s (%s)', pubkey, description)

    const now = new Date()

    await client.raw(`
      INSERT INTO free_tier_whitelist (pubkey, description, added_at)
      VALUES (?, ?, ?)
      ON CONFLICT (pubkey) DO NOTHING
    `, [pubkey, description, now])
  }

  /**
   * Remove pubkey from whitelist
   * Idempotent - no error if pubkey not whitelisted
   */
  public async removeFromWhitelist(
    pubkey: Pubkey,
    client: DatabaseClient = this.dbClient
  ): Promise<void> {
    debug('remove pubkey from whitelist: %s', pubkey)

    await client<FreeTierWhitelist>('free_tier_whitelist')
      .where('pubkey', pubkey)
      .delete()
  }
}
