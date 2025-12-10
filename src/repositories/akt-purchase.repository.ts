import { type Knex } from 'knex'

/**
 * AKT Purchase Repository
 *
 * Data access layer for manual AKT token purchase tracking.
 * Story 7.3: Stores operator purchases for purchase confirmation matching.
 */

/**
 * Represents a manual AKT purchase record
 */
export interface AktPurchase {
  /** UUID primary key */
  id: string;
  /** USD amount spent on purchase */
  usdAmount: number;
  /** AKT amount received */
  aktAmount: number;
  /** Price per AKT at purchase time (USD/AKT) */
  aktPriceUsd: number;
  /** Exchange used for purchase (e.g., "Kraken", "Coinbase") */
  exchange: string | null;
  /** Akash transaction hash (optional) */
  txHash: string | null;
  /** Timestamp of purchase */
  purchasedAt: Date;
  /** Optional notes */
  notes: string | null;
}

/**
 * Input type for recording new purchases (omits generated fields)
 */
export interface CreateAktPurchase {
  usdAmount: number;
  aktAmount: number;
  aktPriceUsd: number;
  exchange?: string;
  txHash?: string;
  notes?: string;
}

/**
 * Repository for AKT purchase data access
 */
export class AktPurchaseRepository {
  constructor(private readonly db: Knex) {}

  /**
   * Record a new AKT purchase
   *
   * @param purchase - Purchase details to record
   * @throws Error if database insertion fails
   */
  async recordPurchase(purchase: CreateAktPurchase): Promise<AktPurchase> {
    const [record] = await this.db('akt_purchases')
      .insert({
        usd_amount: purchase.usdAmount,
        akt_amount: purchase.aktAmount,
        akt_price_usd: purchase.aktPriceUsd,
        exchange: purchase.exchange || null,
        tx_hash: purchase.txHash || null,
        notes: purchase.notes || null,
      })
      .returning('*')

    return this.mapDbRecordToDomain(record)
  }

  /**
   * Get purchase by Akash transaction hash
   *
   * @param txHash - Akash transaction hash to search for
   * @returns Purchase record or null if not found
   */
  async getPurchaseByTxHash(txHash: string): Promise<AktPurchase | null> {
    const record = await this.db('akt_purchases')
      .where({ tx_hash: txHash })
      .first()

    return record ? this.mapDbRecordToDomain(record) : null
  }

  /**
   * Get recent purchases (ordered by purchased_at DESC)
   *
   * @param limit - Maximum number of purchases to return (default: 10)
   * @returns Array of purchase records
   */
  async getRecentPurchases(limit: number = 10): Promise<AktPurchase[]> {
    const records = await this.db('akt_purchases')
      .orderBy('purchased_at', 'desc')
      .limit(limit)

    return records.map(this.mapDbRecordToDomain)
  }

  /**
   * Get total AKT purchased across all records
   *
   * @returns Total AKT amount purchased
   */
  async getTotalAktPurchased(): Promise<number> {
    const result = await this.db('akt_purchases')
      .sum('akt_amount as total')
      .first()

    return result?.total ? parseFloat(result.total as string) : 0
  }

  /**
   * Map database record to domain model
   * Converts snake_case to camelCase and parses numeric values
   *
   * @private
   */
  private mapDbRecordToDomain(record: any): AktPurchase {
    return {
      id: record.id,
      usdAmount: parseFloat(record.usd_amount),
      aktAmount: parseFloat(record.akt_amount),
      aktPriceUsd: parseFloat(record.akt_price_usd),
      exchange: record.exchange,
      txHash: record.tx_hash,
      purchasedAt: new Date(record.purchased_at),
      notes: record.notes,
    }
  }
}
