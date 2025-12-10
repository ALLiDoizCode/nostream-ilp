import { EventEmitter as _EventEmitter } from 'events'
import { EscrowDepositRepository } from '../repositories/escrow-deposit.repository'
import { IAkashWallet } from './wallet'

/**
 * Configuration for automatic escrow deposits
 */
export interface EscrowDepositConfig {
  /** Warning threshold in days (default: 7) */
  minDays: number;
  /** Auto-deposit target in days (default: 30) */
  targetDays: number;
  /** Daily hosting cost in AKT (default: 1.5) */
  dailyCostAkt: number;
  /** Minimum wallet balance to maintain (default: 10 AKT) */
  walletMinBalance: number;
  /** Akash escrow account address */
  escrowAddress: string;
  /** Akash deployment lease ID */
  leaseId: string;
  /** Wallet password for spending */
  walletPassword: string;
  /** Check interval in hours (default: 24) */
  checkIntervalHours?: number;
}

/**
 * Result of a deposit operation
 */
export interface DepositResult {
  deposited: boolean;
  amountAkt?: number;
  txHash?: string;
  reason?: string;
}

/**
 * Current escrow account status
 */
export interface EscrowStatus {
  escrowBalanceAkt: number;
  daysRemaining: number;
  warningLevel: 'OK' | 'WARNING' | 'CRITICAL';
  needsDeposit: boolean;
  walletBalanceAkt?: number;
  targetBalanceAkt?: number;
}

/**
 * EscrowDepositor - Automated Akash escrow deposit management
 *
 * Monitors escrow balance and automatically deposits AKT to maintain hosting uptime.
 * Runs on a configurable schedule and responds to wallet balance changes.
 *
 * Warning Levels:
 * - OK: Escrow balance >= minDays
 * - WARNING: Escrow balance < minDays but >= 3 days
 * - CRITICAL: Escrow balance < 3 days
 *
 * Events Emitted:
 * - deposit_complete: When deposit successfully completes
 * - escrow_warning: When escrow balance falls below warning threshold
 * - escrow_critical: When escrow balance critically low
 * - deposit_failed: When deposit attempt fails
 */
export class EscrowDepositor extends EventEmitter {
  private wallet: IAkashWallet
  private repository: EscrowDepositRepository
  private config: EscrowDepositConfig
  private dailyCheckInterval: NodeJS.Timeout | null = null
  private isRunning: boolean = false

  constructor(
    wallet: IAkashWallet,
    repository: EscrowDepositRepository,
    config: EscrowDepositConfig
  ) {
    super()
    this.wallet = wallet
    this.repository = repository
    this.config = config
  }

  /**
   * Check escrow balance and deposit if needed
   *
   * @returns DepositResult indicating what action was taken
   */
  async checkAndDeposit(): Promise<DepositResult> {
    try {
      // Get wallet balance
      const balances = await this.wallet.getBalance()
      const aktBalance = balances.find(b => b.denom === 'uakt')
      const walletBalanceUakt = aktBalance ? parseInt(aktBalance.amount, 10) : 0
      const walletBalanceAkt = walletBalanceUakt / 1_000_000

      // Get escrow balance
      let escrowBalanceUakt: number
      try {
        const escrowBalanceStr = await this.wallet.queryEscrowBalance(this.config.leaseId)
        escrowBalanceUakt = parseInt(escrowBalanceStr, 10)
      } catch (error) {
        // If escrow query fails, log and skip this check
        console.error('Failed to query escrow balance:', error)
        return {
          deposited: false,
          reason: 'escrow-query-failed',
        }
      }

      const escrowBalanceAkt = escrowBalanceUakt / 1_000_000

      // Calculate target balance
      const targetBalanceAkt = this.config.dailyCostAkt * this.config.targetDays

      // Determine if deposit is needed
      const needsDeposit = escrowBalanceAkt < targetBalanceAkt
      const walletSufficient = walletBalanceAkt > this.config.walletMinBalance

      if (!needsDeposit) {
        return {
          deposited: false,
          reason: 'sufficient-balance',
        }
      }

      if (!walletSufficient) {
        this.emit('deposit_failed', {
          reason: 'insufficient-wallet',
          walletBalance: walletBalanceAkt,
          minRequired: this.config.walletMinBalance,
        })
        return {
          deposited: false,
          reason: 'insufficient-wallet',
        }
      }

      // Calculate deposit amount
      const depositAmountAkt = targetBalanceAkt - escrowBalanceAkt
      const depositAmountUakt = Math.floor(depositAmountAkt * 1_000_000)

      // Send deposit
      const txHash = await this.wallet.sendTokens(
        this.config.escrowAddress,
        depositAmountUakt.toString(),
        this.config.walletPassword,
        `Escrow deposit for lease ${this.config.leaseId}`
      )

      // Calculate new balance
      const newBalanceAkt = escrowBalanceAkt + depositAmountAkt

      // Record deposit
      await this.repository.recordDeposit({
        amountAkt: depositAmountAkt,
        escrowAddress: this.config.escrowAddress,
        txHash,
        newBalanceAkt,
        leaseId: this.config.leaseId,
        notes: `Automatic deposit: ${depositAmountAkt.toFixed(2)} AKT to maintain ${this.config.targetDays}-day buffer`,
      })

      // Emit success event
      this.emit('deposit_complete', {
        amountAkt: depositAmountAkt,
        txHash,
        newBalanceAkt,
      })

      return {
        deposited: true,
        amountAkt: depositAmountAkt,
        txHash,
      }

    } catch (error) {
      this.emit('deposit_failed', {
        reason: 'deposit-error',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Get current escrow status with warning level
   *
   * @returns EscrowStatus object
   */
  async getEscrowStatus(): Promise<EscrowStatus> {
    // Get wallet balance
    const balances = await this.wallet.getBalance()
    const aktBalance = balances.find(b => b.denom === 'uakt')
    const walletBalanceUakt = aktBalance ? parseInt(aktBalance.amount, 10) : 0
    const walletBalanceAkt = walletBalanceUakt / 1_000_000

    // Get escrow balance
    let escrowBalanceUakt: number
    try {
      const escrowBalanceStr = await this.wallet.queryEscrowBalance(this.config.leaseId)
      escrowBalanceUakt = parseInt(escrowBalanceStr, 10)
    } catch (error) {
      // Return safe default if query fails
      console.error('Failed to query escrow balance:', error)
      return {
        escrowBalanceAkt: 0,
        daysRemaining: 0,
        warningLevel: 'CRITICAL',
        needsDeposit: true,
        walletBalanceAkt,
        targetBalanceAkt: this.config.dailyCostAkt * this.config.targetDays,
      }
    }

    const escrowBalanceAkt = escrowBalanceUakt / 1_000_000

    // Calculate days remaining
    const daysRemaining = escrowBalanceAkt / this.config.dailyCostAkt

    // Determine warning level
    let warningLevel: 'OK' | 'WARNING' | 'CRITICAL'
    if (daysRemaining <= 3) {
      warningLevel = 'CRITICAL'
    } else if (daysRemaining < this.config.minDays) {
      warningLevel = 'WARNING'
    } else {
      warningLevel = 'OK'
    }

    // Emit alerts if needed
    const needsDeposit = daysRemaining < this.config.targetDays
    this.emitAlert({ escrowBalanceAkt, daysRemaining, warningLevel, needsDeposit })

    return {
      escrowBalanceAkt,
      daysRemaining,
      warningLevel,
      needsDeposit: daysRemaining < this.config.targetDays,
      walletBalanceAkt,
      targetBalanceAkt: this.config.dailyCostAkt * this.config.targetDays,
    }
  }

  /**
   * Start automated escrow monitoring
   *
   * Runs initial check and schedules recurring checks
   */
  start(): void {
    if (this.isRunning) {
      console.warn('EscrowDepositor already running')
      return
    }

    this.isRunning = true

    // Run initial check
    this.checkAndDeposit().catch(error => {
      console.error('Initial escrow check failed:', error)
    })

    // Schedule recurring checks
    const intervalMs = (this.config.checkIntervalHours || 24) * 60 * 60 * 1000
    this.dailyCheckInterval = setInterval(() => {
      this.checkAndDeposit().catch(error => {
        console.error('Scheduled escrow check failed:', error)
      })
    }, intervalMs)

    console.log(`EscrowDepositor started (checking every ${this.config.checkIntervalHours || 24} hours)`)
  }

  /**
   * Stop automated escrow monitoring
   */
  stop(): void {
    if (!this.isRunning) {
      return
    }

    if (this.dailyCheckInterval) {
      clearInterval(this.dailyCheckInterval)
      this.dailyCheckInterval = null
    }

    this.isRunning = false
    console.log('EscrowDepositor stopped')
  }

  /**
   * Emit alert events based on warning level
   *
   * @private
   */
  private emitAlert(status: EscrowStatus): void {
    if (status.warningLevel === 'CRITICAL') {
      this.emit('escrow_critical', {
        daysRemaining: status.daysRemaining,
        escrowBalance: status.escrowBalanceAkt,
        message: `🚨 CRITICAL: Escrow balance critically low! Only ${status.daysRemaining.toFixed(1)} days remaining.`,
      })
    } else if (status.warningLevel === 'WARNING') {
      this.emit('escrow_warning', {
        daysRemaining: status.daysRemaining,
        escrowBalance: status.escrowBalanceAkt,
        message: `⚠️ Escrow balance low. ${status.daysRemaining.toFixed(1)} days remaining. Auto-deposit will trigger soon.`,
      })
    }
  }
}
