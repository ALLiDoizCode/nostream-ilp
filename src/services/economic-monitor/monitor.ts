import { AktBalanceMonitor, BalanceChange } from './akt-balance-monitor'
import {
  EconomicSnapshot,
  EconomicSnapshotRepository,
} from '../../repositories/economic-snapshot.repository'
import { EventEmitter } from 'events'
import { ExchangeRateService } from './exchange-rate'
import { RevenueChangedEvent, RevenueTracker } from './revenue-tracker'

/**
 * Real-time economic metrics for the relay
 *
 * Provides current profitability and revenue metrics in USD for
 * operator dashboards and monitoring systems.
 */
export interface RealTimeMetrics {
  /** Current cryptocurrency balances */
  currentBalance: {
    /** Ethereum balance in wei */
    eth: bigint;
    /** USDC balance (6 decimals) */
    usdc: bigint;
    /** AKT balance in uakt */
    akt: bigint;
  };
  /** Daily revenue in USD (last 24 hours) */
  dailyRevenue: number;
  /** Daily expenses in USD (last 24 hours) */
  dailyExpenses: number;
  /** Net profit in USD (dailyRevenue - dailyExpenses) */
  netProfit: number;
  /** Profitability percentage (0-100) */
  profitabilityPercentage: number;
  /** Timestamp when metrics were calculated */
  timestamp: number;
}

/**
 * Economic monitoring service
 *
 * Orchestrates revenue tracking, exchange rate updates, and periodic
 * economic snapshot creation. This is the main entry point for economic
 * monitoring functionality in the relay.
 *
 * **Responsibilities:**
 * - Subscribe to revenue changes via RevenueTracker
 * - Create periodic economic snapshots (every 5 minutes)
 * - Convert revenue/balances to USD via ExchangeRateService
 * - Provide real-time metrics for dashboards
 * - Handle errors gracefully without crashing relay
 *
 * **Lifecycle:**
 * 1. `start()` - Begin monitoring and periodic snapshots
 * 2. `stop()` - Gracefully shut down monitoring
 *
 * @example
 * const monitor = new EconomicMonitor(
 *   revenueTracker,
 *   exchangeRateService,
 *   snapshotRepository
 * );
 *
 * await monitor.start();
 * const metrics = await monitor.getCurrentMetrics();
 * console.log(`Daily revenue: $${metrics.dailyRevenue.toFixed(2)}`);
 */
export class EconomicMonitor extends EventEmitter {
  private snapshotInterval: NodeJS.Timeout | null = null
  private isRunning: boolean = false

  /**
   * Creates a new EconomicMonitor
   *
   * @param revenueTracker - Service for tracking revenue from Dassie ledger
   * @param exchangeRateService - Service for fetching crypto/USD exchange rates
   * @param snapshotRepository - Repository for persisting economic snapshots
   * @param aktBalanceMonitor - Optional AKT balance monitor (Story 7.3)
   */
  constructor(
    private revenueTracker: RevenueTracker,
    private exchangeRateService: ExchangeRateService,
    private snapshotRepository: EconomicSnapshotRepository,
    private aktBalanceMonitor?: AktBalanceMonitor
  ) {
    super()
  }

  /**
   * Start economic monitoring
   *
   * Subscribes to revenue changes and starts periodic snapshot creation.
   * This method is idempotent - calling it multiple times has no effect
   * if already running.
   *
   * @throws {Error} If RevenueTracker subscription fails
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('EconomicMonitor already running')
      return
    }

    console.log('Starting EconomicMonitor...')

    // Subscribe to revenue changes
    this.revenueTracker.on('revenue_changed', (event: RevenueChangedEvent) => {
      this.onRevenueChange(event.delta, event.accountPath)
    })

    try {
      this.revenueTracker.subscribeToBalanceChanges()
    } catch (error) {
      console.error(
        'Failed to subscribe to balance changes:',
        error instanceof Error ? error.message : String(error)
      )
      throw error
    }

    // Subscribe to AKT balance changes (Story 7.3)
    if (this.aktBalanceMonitor) {
      this.aktBalanceMonitor.on('balance_changed', (change: BalanceChange) => {
        this.onAktBalanceChange(change)
      })
    }

    // Start periodic snapshots
    this.startPeriodicSnapshots()

    // Create initial snapshot
    try {
      await this.createSnapshot()
      console.log('Created initial economic snapshot')
    } catch (error) {
      console.error(
        'Failed to create initial snapshot:',
        error instanceof Error ? error.message : String(error)
      )
      // Non-fatal: continue startup
    }

    this.isRunning = true
    console.log('EconomicMonitor started')
    this.emit('started')
  }

  /**
   * Stop economic monitoring
   *
   * Unsubscribes from revenue changes and stops periodic snapshot creation.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return
    }

    console.log('Stopping EconomicMonitor...')

    // Stop periodic snapshots
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval)
      this.snapshotInterval = null
    }

    // Unsubscribe from revenue changes
    this.revenueTracker.unsubscribeAll()
    this.revenueTracker.removeAllListeners('revenue_changed')

    this.isRunning = false
    console.log('EconomicMonitor stopped')
    this.emit('stopped')
  }

  /**
   * Create an economic snapshot
   *
   * Queries current revenue, balances, and exchange rates, then creates
   * and persists a snapshot to the database.
   *
   * @returns Created snapshot
   * @throws {Error} If snapshot creation fails
   */
  async createSnapshot(): Promise<EconomicSnapshot> {
    try {
      // Get current data
      const [, balances] = await Promise.all([
        this.revenueTracker.getCurrentRevenue(),
        this.revenueTracker.getCurrentBalances(),
        this.exchangeRateService.getCurrentRates(),
      ])

      // Get current AKT balance from balance monitor (Story 7.3)
      let aktBalance = balances.akt
      if (this.aktBalanceMonitor) {
        try {
          aktBalance = await this.aktBalanceMonitor.getCurrentBalance()
        } catch (error) {
          console.warn('Failed to get AKT balance from monitor, using tracker balance:', error)
          // Fall back to revenue tracker balance
        }
      }

      // Convert revenue to USD (revenue is currently in msats, but we'll use
      // the balance conversion for now since we don't have msat->USD direct conversion)
      // For Story 7.1, we'll use a placeholder calculation
      // TODO: Implement proper msat->USD conversion via ILP rate oracle

      const subscriptionRevenueUsd = 0 // Placeholder for Story 7.1
      const routingRevenueUsd = 0 // Placeholder for Story 7.1
      const contentRevenueUsd = 0 // Placeholder for Story 7.1

      // Convert balances to USD
      const ethBalanceUsd = await this.exchangeRateService.convertToUsd(
        balances.eth,
        'ETH'
      )
      const usdcBalanceUsd = await this.exchangeRateService.convertToUsd(
        balances.usdc,
        'USDC'
      )
      const aktBalanceUsd = await this.exchangeRateService.convertToUsd(
        aktBalance, // Use aktBalance from monitor (Story 7.3)
        'AKT'
      )

      const totalRevenueUsd =
        subscriptionRevenueUsd + routingRevenueUsd + contentRevenueUsd

      // Calculate expenses (placeholder for Story 7.4)
      const expensesUsd = 0
      const akashCostUsd = 0
      const gasFeeUsd = 0

      // Calculate net profit
      const netProfitUsd = totalRevenueUsd - expensesUsd

      // Create snapshot object
      const snapshot: EconomicSnapshot = {
        timestamp: new Date(),
        revenueUsd: totalRevenueUsd,
        subscriptionRevenueUsd,
        routingRevenueUsd,
        contentRevenueUsd,
        expensesUsd,
        akashCostUsd,
        gasFeeUsd: gasFeeUsd,
        netProfitUsd,
        ethBalance: balances.eth,
        usdcBalance: balances.usdc,
        aktBalance: aktBalance, // Use aktBalance from monitor (Story 7.3)
      }

      // Persist snapshot
      await this.snapshotRepository.createSnapshot(snapshot)

      console.log('Economic snapshot created:', {
        timestamp: snapshot.timestamp.toISOString(),
        revenueUsd: snapshot.revenueUsd,
        netProfitUsd: snapshot.netProfitUsd,
        ethBalanceUsd: ethBalanceUsd.toFixed(2),
        usdcBalanceUsd: usdcBalanceUsd.toFixed(2),
        aktBalanceUsd: aktBalanceUsd.toFixed(2),
      })

      this.emit('snapshot_created', snapshot)
      return snapshot
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error)
      console.error('Failed to create economic snapshot:', errorMsg)
      throw error
    }
  }

  /**
   * Get current real-time metrics
   *
   * Retrieves latest snapshot and calculates current profitability metrics.
   *
   * @returns Real-time economic metrics
   * @throws {Error} If metrics calculation fails
   */
  async getCurrentMetrics(): Promise<RealTimeMetrics> {
    try {
      // Get latest snapshot
      const latestSnapshot = await this.snapshotRepository.getLatestSnapshot()

      if (!latestSnapshot) {
        // No snapshots yet, return empty metrics
        return {
          currentBalance: { eth: 0n, usdc: 0n, akt: 0n },
          dailyRevenue: 0,
          dailyExpenses: 0,
          netProfit: 0,
          profitabilityPercentage: 0,
          timestamp: Date.now(),
        }
      }

      // Calculate daily revenue (delta from 24h ago)
      const dailyRevenue = await this.revenueTracker.getDailyRevenue()

      // Calculate daily expenses (difference from 24h ago)
      const now = new Date()
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const snapshots = await this.snapshotRepository.getSnapshotsByDateRange(
        twentyFourHoursAgo,
        now
      )

      let dailyExpenses = 0
      if (snapshots.length > 1) {
        const oldestSnapshot = snapshots[snapshots.length - 1]
        dailyExpenses =
          latestSnapshot.expensesUsd - oldestSnapshot.expensesUsd
      }

      // Calculate net profit
      const netProfit = dailyRevenue - dailyExpenses

      // Calculate profitability percentage
      let profitabilityPercentage = 0
      if (dailyRevenue > 0) {
        profitabilityPercentage = (netProfit / dailyRevenue) * 100
      }

      return {
        currentBalance: {
          eth: latestSnapshot.ethBalance,
          usdc: latestSnapshot.usdcBalance,
          akt: latestSnapshot.aktBalance,
        },
        dailyRevenue,
        dailyExpenses,
        netProfit,
        profitabilityPercentage,
        timestamp: Date.now(),
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error)
      console.error('Failed to get current metrics:', errorMsg)
      throw error
    }
  }

  /**
   * Start periodic snapshot creation
   *
   * Creates a snapshot every 5 minutes. Errors are logged but don't stop
   * the interval (graceful degradation).
   */
  private startPeriodicSnapshots(): void {
    const INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

    this.snapshotInterval = setInterval(async () => {
      try {
        await this.createSnapshot()
      } catch (error) {
        console.error(
          'Periodic snapshot creation failed:',
          error instanceof Error ? error.message : String(error)
        )
        // Non-fatal: continue with next interval
      }
    }, INTERVAL_MS)

    console.log(
      `Periodic snapshots scheduled every ${INTERVAL_MS / 1000} seconds`
    )
  }

  /**
   * Handle revenue change events
   *
   * Called when RevenueTracker emits 'revenue_changed'. Can optionally
   * trigger immediate snapshots for large revenue changes.
   *
   * @param delta - Revenue change amount (positive = credit, negative = debit)
   * @param accountPath - Ledger account that changed
   */
  private onRevenueChange(delta: bigint, accountPath: string): void {
    console.log(`Revenue changed: ${accountPath}, delta=${delta}`)

    // TODO: Optionally trigger immediate snapshot if delta is large
    // For Story 7.1, we'll just log the change
    // const LARGE_DELTA_THRESHOLD = 1000000n; // 1000 sats
    // if (delta > LARGE_DELTA_THRESHOLD) {
    //   this.createSnapshot().catch(error => {
    //     console.error('Failed to create snapshot after large revenue change:', error);
    //   });
    // }
  }

  /**
   * Handle AKT balance change events (Story 7.3)
   *
   * Called when AktBalanceMonitor emits 'balance_changed'.
   * Triggers immediate snapshot to update akt_balance field.
   *
   * @param change - Balance change event data
   */
  private onAktBalanceChange(change: BalanceChange): void {
    console.log('AKT balance changed', {
      previous: change.previousBalance.toString(),
      new: change.newBalance.toString(),
      delta: change.delta.toString(),
    })

    // Trigger immediate snapshot to capture new balance
    this.createSnapshot().catch((_error) => {
      console.error('Failed to create snapshot after AKT balance change:', error)
    })
  }
}
