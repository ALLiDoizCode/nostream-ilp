import { EventEmitter as _EventEmitter } from 'events'

import type { AkashWallet } from '../../akash/wallet'
import type { AktPurchaseRepository } from '../../repositories/akt-purchase.repository'

/**
 * AKT Balance Monitor Service
 *
 * Polls Akash wallet balance periodically and detects incoming AKT transfers.
 * Story 7.3: Automated balance detection for manual purchase confirmation.
 */


/**
 * Balance change event data
 */
export interface BalanceChange {
  /** Previous balance in uakt */
  previousBalance: bigint;
  /** New balance in uakt */
  newBalance: bigint;
  /** Delta in uakt (positive = increase, negative = decrease) */
  delta: bigint;
  /** Timestamp of detection (Unix milliseconds) */
  timestamp: number;
}

/**
 * Balance monitor configuration
 */
export interface BalanceMonitorConfig {
  /** Polling interval in milliseconds (default: 300000 = 5 minutes) */
  pollIntervalMs: number;
  /** Minimum delta in uakt to trigger alert (default: 1000000 = 1 AKT) */
  minimumDeltaForAlert: bigint;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: BalanceMonitorConfig = {
  pollIntervalMs: 300000, // 5 minutes
  minimumDeltaForAlert: 1000000n, // 1 AKT
}

/**
 * AKT Balance Monitor
 *
 * Monitors Akash wallet balance for changes and emits events.
 * Matches balance increases with recorded purchases.
 *
 * Events:
 * - 'balance_changed': Emitted when balance changes by more than minimum delta
 *
 * @example
 * const monitor = new AktBalanceMonitor(wallet, purchaseRepo, eventBus, config);
 * monitor.on('balance_changed', (change) => {
 *   console.log(`Balance changed by ${change.delta} uakt`);
 * });
 * await monitor.start();
 */
export class AktBalanceMonitor extends EventEmitter {
  private lastBalance: bigint = 0n
  private pollInterval: NodeJS.Timer | null = null
  private readonly config: BalanceMonitorConfig
  private logger: any // Pino logger

  constructor(
    private readonly wallet: AkashWallet,
    private readonly purchaseRepo: AktPurchaseRepository,
    config: Partial<BalanceMonitorConfig> = {},
  ) {
    super()
    this.config = { ...DEFAULT_CONFIG, ...config }

    // Initialize logger (simple console for now, replace with Pino in factory)
    this.logger = console
  }

  /**
   * Set logger instance (Pino)
   */
  setLogger(logger: any): void {
    this.logger = logger
  }

  /**
   * Start periodic balance polling
   *
   * Queries wallet balance immediately, then polls at configured interval.
   * Emits 'balance_changed' events when significant changes detected.
   *
   * @throws Error if monitor is already started
   */
  async start(): Promise<void> {
    if (this.pollInterval) {
      throw new Error('Balance monitor already started')
    }

    // Get initial balance
    this.lastBalance = await this.getCurrentBalance()
    this.logger.info?.('AKT Balance Monitor started', {
      initialBalance: this.lastBalance.toString(),
      pollIntervalMs: this.config.pollIntervalMs,
    })

    // Start polling
    this.pollInterval = setInterval(async () => {
      try {
        await this.checkBalanceChange()
      } catch (error) {
        this.logger.error?.('Balance check failed', { error })
      }
    }, this.config.pollIntervalMs)
  }

  /**
   * Stop periodic polling
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
      this.logger.info?.('AKT Balance Monitor stopped')
    }
  }

  /**
   * Get current wallet balance in uakt
   *
   * @returns Balance as bigint (uakt)
   */
  async getCurrentBalance(): Promise<bigint> {
    const coins = await this.wallet.getBalance()
    const aktCoin = coins.find((c) => c.denom === 'uakt')
    return aktCoin ? BigInt(aktCoin.amount) : 0n
  }

  /**
   * Check for balance changes and emit events
   *
   * Queries current balance, compares with last known balance,
   * and emits 'balance_changed' event if delta exceeds threshold.
   *
   * @private
   */
  private async checkBalanceChange(): Promise<void> {
    const currentBalance = await this.getCurrentBalance()
    const delta = currentBalance - this.lastBalance

    if (delta === 0n) {
      return // No change
    }

    // Check if delta exceeds minimum threshold
    const absDelta = delta > 0n ? delta : -delta
    if (absDelta < this.config.minimumDeltaForAlert) {
      this.logger.debug?.('Balance change below threshold', {
        delta: delta.toString(),
        threshold: this.config.minimumDeltaForAlert.toString(),
      })
      this.lastBalance = currentBalance // Update but don't alert
      return
    }

    // Emit balance_changed event
    const change: BalanceChange = {
      previousBalance: this.lastBalance,
      newBalance: currentBalance,
      delta,
      timestamp: Date.now(),
    }

    this.emit('balance_changed', change)
    this.logger.info?.('Balance changed', {
      previous: this.lastBalance.toString(),
      new: currentBalance.toString(),
      delta: delta.toString(),
    })

    // If balance increased, check if it matches a recent purchase
    if (delta > 0n) {
      await this.matchPurchase(delta)
    }

    // Update last known balance
    this.lastBalance = currentBalance
  }

  /**
   * Match balance increase with recent purchases
   *
   * Queries recent purchases and checks if any match the detected delta.
   * Uses 1% tolerance to account for small price fluctuations.
   *
   * @param delta - Balance increase in uakt
   * @private
   */
  private async matchPurchase(delta: bigint): Promise<void> {
    try {
      const recentPurchases = await this.purchaseRepo.getRecentPurchases(10)
      const deltaAkt = Number(delta) / 1_000_000 // Convert uakt to AKT

      // Find purchase with matching amount (±1% tolerance)
      const matchingPurchase = recentPurchases.find((p) => {
        const tolerance = p.aktAmount * 0.01 // 1% tolerance
        return Math.abs(p.aktAmount - deltaAkt) <= tolerance
      })

      if (matchingPurchase) {
        this.logger.info?.('AKT purchase confirmed', {
          amount: deltaAkt,
          usd: matchingPurchase.usdAmount,
          exchange: matchingPurchase.exchange,
          purchaseId: matchingPurchase.id,
        })
      } else {
        this.logger.warn?.('Unexpected AKT transfer detected', {
          amount: deltaAkt,
          delta: delta.toString(),
        })
      }
    } catch (error) {
      this.logger.error?.('Failed to match purchase', { error })
    }
  }
}
