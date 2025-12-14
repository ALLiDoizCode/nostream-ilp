import { Pool } from 'pg'

/**
 * Economic snapshot data structure
 *
 * Represents a point-in-time snapshot of the relay's economic health,
 * including revenue sources, expenses, balances, and profitability.
 */
export interface EconomicSnapshot {
  timestamp: Date;
  revenueUsd: number;
  subscriptionRevenueUsd: number;
  routingRevenueUsd: number;
  contentRevenueUsd: number;
  expensesUsd: number;
  akashCostUsd: number;
  gasFeeUsd: number;
  netProfitUsd: number;
  ethBalance: bigint;
  usdcBalance: bigint;
  aktBalance: bigint;
}

/**
 * Repository for managing economic snapshot persistence
 *
 * Handles CRUD operations for economic_snapshots table, providing methods
 * to store periodic snapshots and query historical data.
 */
export class EconomicSnapshotRepository {
  /**
   * Creates a new EconomicSnapshotRepository
   *
   * @param pool - PostgreSQL connection pool
   */
  constructor(private pool: Pool) {}

  /**
   * Creates a new economic snapshot in the database
   *
   * @param snapshot - Economic snapshot data to store
   * @throws {Error} If database insertion fails or snapshot already exists for timestamp
   */
  async createSnapshot(snapshot: EconomicSnapshot): Promise<void> {
    const query = `
      INSERT INTO economic_snapshots (
        timestamp,
        revenue_usd,
        subscription_revenue_usd,
        routing_revenue_usd,
        content_revenue_usd,
        expenses_usd,
        akash_cost_usd,
        gas_fees_usd,
        net_profit_usd,
        eth_balance,
        usdc_balance,
        akt_balance
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `

    const values = [
      snapshot.timestamp,
      snapshot.revenueUsd,
      snapshot.subscriptionRevenueUsd,
      snapshot.routingRevenueUsd,
      snapshot.contentRevenueUsd,
      snapshot.expensesUsd,
      snapshot.akashCostUsd,
      snapshot.gasFeeUsd,
      snapshot.netProfitUsd,
      snapshot.ethBalance.toString(),
      snapshot.usdcBalance.toString(),
      snapshot.aktBalance.toString(),
    ]

    await this.pool.query(query, values)
  }

  /**
   * Retrieves the most recent economic snapshot
   *
   * @returns Latest snapshot, or null if no snapshots exist
   */
  async getLatestSnapshot(): Promise<EconomicSnapshot | null> {
    const query = `
      SELECT
        timestamp,
        revenue_usd,
        subscription_revenue_usd,
        routing_revenue_usd,
        content_revenue_usd,
        expenses_usd,
        akash_cost_usd,
        gas_fees_usd,
        net_profit_usd,
        eth_balance,
        usdc_balance,
        akt_balance
      FROM economic_snapshots
      ORDER BY timestamp DESC
      LIMIT 1
    `

    const result = await this.pool.query(query)

    if (result.rows.length === 0) {
      return null
    }

    return this.mapRowToSnapshot(result.rows[0])
  }

  /**
   * Retrieves snapshots within a date range
   *
   * @param start - Start date (inclusive)
   * @param end - End date (inclusive)
   * @returns Array of snapshots ordered by timestamp descending
   */
  async getSnapshotsByDateRange(
    start: Date,
    end: Date
  ): Promise<EconomicSnapshot[]> {
    const query = `
      SELECT
        timestamp,
        revenue_usd,
        subscription_revenue_usd,
        routing_revenue_usd,
        content_revenue_usd,
        expenses_usd,
        akash_cost_usd,
        gas_fees_usd,
        net_profit_usd,
        eth_balance,
        usdc_balance,
        akt_balance
      FROM economic_snapshots
      WHERE timestamp >= $1 AND timestamp <= $2
      ORDER BY timestamp DESC
    `

    const result = await this.pool.query(query, [start, end])
    return result.rows.map((row) => this.mapRowToSnapshot(row))
  }

  /**
   * Retrieves daily snapshots for the last N days
   *
   * Returns the first snapshot of each day (by descending timestamp order),
   * useful for generating daily revenue charts.
   *
   * @param days - Number of days to retrieve (e.g., 7 for last week)
   * @returns Array of daily snapshots ordered by date descending
   */
  async getDailySnapshots(days: number): Promise<EconomicSnapshot[]> {
    const query = `
      SELECT DISTINCT ON (DATE(timestamp))
        timestamp,
        revenue_usd,
        subscription_revenue_usd,
        routing_revenue_usd,
        content_revenue_usd,
        expenses_usd,
        akash_cost_usd,
        gas_fees_usd,
        net_profit_usd,
        eth_balance,
        usdc_balance,
        akt_balance
      FROM economic_snapshots
      WHERE timestamp >= NOW() - $1::interval
      ORDER BY DATE(timestamp) DESC, timestamp DESC
    `

    const result = await this.pool.query(query, [`${days} days`])
    return result.rows.map((row) => this.mapRowToSnapshot(row))
  }

  /**
   * Maps database row to EconomicSnapshot interface
   *
   * Handles type conversions (snake_case to camelCase, bigint strings to BigInt)
   *
   * @param row - Database row object
   * @returns Typed EconomicSnapshot object
   */
  private mapRowToSnapshot(row: any): EconomicSnapshot {
    return {
      timestamp: new Date(row.timestamp),
      revenueUsd: parseFloat(row.revenue_usd),
      subscriptionRevenueUsd: parseFloat(row.subscription_revenue_usd),
      routingRevenueUsd: parseFloat(row.routing_revenue_usd),
      contentRevenueUsd: parseFloat(row.content_revenue_usd),
      expensesUsd: parseFloat(row.expenses_usd),
      akashCostUsd: parseFloat(row.akash_cost_usd),
      gasFeeUsd: parseFloat(row.gas_fees_usd),
      netProfitUsd: parseFloat(row.net_profit_usd),
      ethBalance: BigInt(row.eth_balance),
      usdcBalance: BigInt(row.usdc_balance),
      aktBalance: BigInt(row.akt_balance),
    }
  }
}
