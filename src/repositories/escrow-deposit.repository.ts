import { Pool } from 'pg'

/**
 * EscrowDeposit represents a deposit transaction to an Akash escrow account
 */
export interface EscrowDeposit {
  id: string;
  amountAkt: number;
  escrowAddress: string;
  txHash: string;
  depositedAt: Date;
  newBalanceAkt: number;
  leaseId: string | null;
  notes: string | null;
}

/**
 * Repository for managing escrow deposit records
 */
export class EscrowDepositRepository {
  private db: Pool

  constructor(db: Pool) {
    this.db = db
  }

  /**
   * Record a new escrow deposit transaction
   *
   * @param deposit - Deposit details (id will be auto-generated if not provided)
   * @returns Promise<void>
   */
  async recordDeposit(deposit: Omit<EscrowDeposit, 'id' | 'depositedAt'>): Promise<void> {
    await this.db.query(
      `INSERT INTO escrow_deposits (amount_akt, escrow_address, tx_hash, new_balance_akt, lease_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        deposit.amountAkt,
        deposit.escrowAddress,
        deposit.txHash,
        deposit.newBalanceAkt,
        deposit.leaseId,
        deposit.notes,
      ]
    )
  }

  /**
   * Retrieve a deposit record by transaction hash
   *
   * @param txHash - Akash transaction hash
   * @returns Promise<EscrowDeposit | null>
   */
  async getDepositByTxHash(txHash: string): Promise<EscrowDeposit | null> {
    const result = await this.db.query(
      'SELECT * FROM escrow_deposits WHERE tx_hash = $1 LIMIT 1',
      [txHash]
    )

    if (result.rows.length === 0) return null

    return this.mapRowToDeposit(result.rows[0])
  }

  /**
   * Retrieve the N most recent deposit records
   *
   * @param limit - Maximum number of records to return
   * @returns Promise<EscrowDeposit[]>
   */
  async getRecentDeposits(limit: number = 10): Promise<EscrowDeposit[]> {
    const result = await this.db.query(
      'SELECT * FROM escrow_deposits ORDER BY deposited_at DESC LIMIT $1',
      [limit]
    )

    return result.rows.map((row) => this.mapRowToDeposit(row))
  }

  /**
   * Calculate total amount deposited across all records
   *
   * @returns Promise<number> - Total AKT deposited
   */
  async getTotalDeposited(): Promise<number> {
    const result = await this.db.query(
      'SELECT COALESCE(SUM(amount_akt), 0) as total FROM escrow_deposits'
    )

    return result.rows[0]?.total ? parseFloat(result.rows[0].total) : 0
  }

  /**
   * Map database row to EscrowDeposit interface
   *
   * @private
   */
  private mapRowToDeposit(row: any): EscrowDeposit {
    return {
      id: row.id,
      amountAkt: parseFloat(row.amount_akt),
      escrowAddress: row.escrow_address,
      txHash: row.tx_hash,
      depositedAt: new Date(row.deposited_at),
      newBalanceAkt: parseFloat(row.new_balance_akt),
      leaseId: row.lease_id,
      notes: row.notes,
    }
  }
}
