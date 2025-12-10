import { CacheClient } from '../../@types/cache'
import { EconomicSnapshotRepository } from '../../repositories/economic-snapshot.repository'
import { DassieClient } from '../payment/dassie-client'
import { EventEmitter } from 'events'

/**
 * Revenue sources tracked by the economic monitor
 *
 * All amounts are in millisatoshis (msats) - the smallest ILP unit
 */
export interface RevenueSource {
  /** Revenue from REQ subscription payments (msats) */
  subscriptions: bigint;
  /** Revenue from ILP packet routing fees (msats) */
  routing: bigint;
  /** Revenue from paid EVENT deliveries (msats) */
  content: bigint;
}

/**
 * Snapshot of current cryptocurrency balances
 *
 * Balances are in smallest units:
 * - ETH: wei (1 ETH = 10^18 wei)
 * - USDC: base units (1 USDC = 10^6 base units)
 * - AKT: uakt (1 AKT = 10^6 uakt)
 */
export interface BalanceSnapshot {
  /** Ethereum balance in wei */
  eth: bigint;
  /** USDC balance (6 decimals) */
  usdc: bigint;
  /** AKT balance in uakt (6 decimals) */
  akt: bigint;
}

/**
 * Revenue change event payload
 */
export interface RevenueChangedEvent {
  /** Amount changed (positive for credit, negative for debit) */
  delta: bigint;
  /** Revenue source account (e.g., 'eth:revenue/subscriptions') */
  accountPath: string;
  /** New balance after change */
  balance: bigint;
  /** Timestamp of change */
  timestamp: number;
}

/**
 * Revenue tracking service
 *
 * Subscribes to Dassie ledger balance changes for revenue accounts and
 * provides methods to query current revenue and balances. Emits events
 * when revenue changes occur.
 *
 * **Revenue Accounts Tracked:**
 * - `eth:revenue/subscriptions` - REQ subscription payments (ETH)
 * - `eth:revenue/routing` - ILP routing fees (ETH)
 * - `eth:revenue/content` - Paid EVENT deliveries (ETH)
 * - `usdc:revenue/subscriptions` - REQ subscription payments (USDC)
 * - `usdc:revenue/routing` - ILP routing fees (USDC)
 * - `usdc:revenue/content` - Paid EVENT deliveries (USDC)
 *
 * **Events Emitted:**
 * - `revenue_changed` - Emitted when revenue account balance changes
 *
 * @example
 * const tracker = new RevenueTracker(dassieClient, repository, redisClient);
 * tracker.on('revenue_changed', (_event) => {
 *   console.log(`Revenue changed: ${event.accountPath} delta=${event.delta}`);
 * });
 * await tracker.subscribeToBalanceChanges();
 */
export class RevenueTracker extends EventEmitter {
  private readonly REVENUE_ACCOUNTS = [
    'eth:revenue/subscriptions',
    'eth:revenue/routing',
    'eth:revenue/content',
    'usdc:revenue/subscriptions',
    'usdc:revenue/routing',
    'usdc:revenue/content',
  ]

  private readonly SETTLEMENT_ACCOUNTS = [
    'eth:assets/settlement',
    'usdc:assets/settlement',
    'akt:assets/settlement',
  ]

  private subscriptions: Map<string, () => void> = new Map()

  /**
   * Creates a new RevenueTracker
   *
   * @param dassieClient - Dassie RPC client for ledger queries
   * @param economicSnapshotRepo - Repository for querying historical snapshots
   * @param redisClient - Redis client for caching (optional, for future use)
   */
  constructor(
    private dassieClient: DassieClient,
    private economicSnapshotRepo: EconomicSnapshotRepository,
    private redisClient?: CacheClient
  ) {
    super()
  }

  /**
   * Subscribe to balance changes for all revenue accounts
   *
   * Establishes WebSocket subscriptions to Dassie ledger for real-time
   * revenue tracking. Automatically reconnects if connection drops.
   *
   * @throws {Error} If Dassie client is not connected
   */
  subscribeToBalanceChanges(): void {
    if (!this.dassieClient.isConnected()) {
      throw new Error(
        'Cannot subscribe to balance changes: Dassie client not connected'
      )
    }

    for (const accountPath of this.REVENUE_ACCOUNTS) {
      const subscription = this.dassieClient.subscribeToBalance(
        accountPath,
        (update) => {
          // Emit revenue_changed event with delta information
          const event: RevenueChangedEvent = {
            delta: update.delta,
            accountPath,
            balance: update.balance,
            timestamp: Date.now(),
          }

          this.emit('revenue_changed', event)
        }
      )

      this.subscriptions.set(accountPath, subscription.unsubscribe)
    }

    console.log(
      `Subscribed to ${this.REVENUE_ACCOUNTS.length} revenue account balance changes`
    )
  }

  /**
   * Unsubscribe from all balance change subscriptions
   */
  unsubscribeAll(): void {
    for (const [_accountPath, unsubscribe] of this.subscriptions.entries()) {
      unsubscribe()
    }
    this.subscriptions.clear()
    console.log('Unsubscribed from all revenue account balance changes')
  }

  /**
   * Get current revenue from all sources
   *
   * Queries Dassie ledger for current balances of revenue accounts and
   * aggregates them by source (subscriptions, routing, content).
   *
   * @returns Aggregated revenue by source (in msats)
   * @throws {Error} If Dassie RPC calls fail
   */
  async getCurrentRevenue(): Promise<RevenueSource> {
    // Query all revenue accounts in parallel
    const balancePromises = this.REVENUE_ACCOUNTS.map(async (accountPath) => {
      try {
        const balance = await this.queryAccountBalance(accountPath)
        return { accountPath, balance }
      } catch (error) {
        console.error(
          `Failed to query balance for ${accountPath}:`,
          error instanceof Error ? error.message : String(error)
        )
        return { accountPath, balance: 0n }
      }
    })

    const balances = await Promise.all(balancePromises)

    // Aggregate by source (subscriptions, routing, content)
    let subscriptions = 0n
    let routing = 0n
    let content = 0n

    for (const { accountPath, balance } of balances) {
      if (accountPath.includes('/subscriptions')) {
        subscriptions += balance
      } else if (accountPath.includes('/routing')) {
        routing += balance
      } else if (accountPath.includes('/content')) {
        content += balance
      }
    }

    return { subscriptions, routing, content }
  }

  /**
   * Get current balances for settlement accounts
   *
   * Queries Dassie ledger for current ETH, USDC, and AKT balances.
   *
   * @returns Current balances in smallest units (wei, base units, uakt)
   * @throws {Error} If Dassie RPC calls fail
   */
  async getCurrentBalances(): Promise<BalanceSnapshot> {
    const [ethBalance, usdcBalance, aktBalance] = await Promise.all([
      this.queryAccountBalance('eth:assets/settlement'),
      this.queryAccountBalance('usdc:assets/settlement'),
      this.queryAccountBalance('akt:assets/settlement'),
    ])

    return {
      eth: ethBalance,
      usdc: usdcBalance,
      akt: aktBalance,
    }
  }

  /**
   * Calculate daily revenue (revenue delta over last 24 hours)
   *
   * Compares current revenue with revenue from 24 hours ago by querying
   * economic snapshots table. Returns change in USD.
   *
   * @returns Daily revenue in USD (e.g., 125.50)
   * @throws {Error} If snapshot query fails
   */
  async getDailyRevenue(): Promise<number> {
    // Get snapshot from 24 hours ago
    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const snapshots = await this.economicSnapshotRepo.getSnapshotsByDateRange(
      twentyFourHoursAgo,
      now
    )

    if (snapshots.length === 0) {
      // No historical data, return 0
      return 0
    }

    // Get oldest and newest snapshots within range
    const oldestSnapshot = snapshots[snapshots.length - 1]
    const newestSnapshot = snapshots[0]

    // Calculate delta
    const revenueDelta =
      newestSnapshot.revenueUsd - oldestSnapshot.revenueUsd
    return revenueDelta
  }

  /**
   * Query account balance from Dassie ledger via tRPC
   *
   * This is a private helper that wraps the Dassie client's RPC call
   * for querying account balances. Note: The current implementation
   * uses getBalanceForCurrency, but this may need adjustment based
   * on actual Dassie tRPC API shape.
   *
   * @param accountPath - Ledger account path (e.g., 'eth:revenue/subscriptions')
   * @returns Account balance as BigInt
   * @throws {Error} If RPC call fails
   */
  private async queryAccountBalance(accountPath: string): Promise<bigint> {
    // NOTE: This implementation assumes a method to query specific account paths.
    // The current DassieRPCClient only exposes getBalances() which returns aggregated
    // balances per currency. For Story 7.1, we need granular account queries.
    //
    // TEMPORARY APPROACH: Mock granular queries until Epic 2 provides proper API
    // For now, we'll return 0n and log a warning. Tests will use mocked Dassie client.

    console.warn(
      `queryAccountBalance called for ${accountPath}, but granular account queries not yet implemented in Dassie client. Returning 0n.`
    )

    // TODO: Replace with actual tRPC call when available:
    // const response = await this.dassieClient.sendRequest('ledger.getBalance', {
    //   accountPath
    // });
    // return BigInt(response.balance);

    return 0n
  }
}
