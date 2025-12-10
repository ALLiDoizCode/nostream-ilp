import { CacheClient } from '../@types/cache'
import { loadAkashConfig } from '../akash/config'
import { EscrowDepositor } from '../akash/escrow-depositor'
import { AkashWallet } from '../akash/wallet'
import { AktPurchaseRepository } from '../repositories/akt-purchase.repository'
import { EconomicSnapshotRepository } from '../repositories/economic-snapshot.repository'
import { EscrowDepositRepository } from '../repositories/escrow-deposit.repository'
import { AktBalanceMonitor } from '../services/economic-monitor/akt-balance-monitor'
import { ExchangeRateService } from '../services/economic-monitor/exchange-rate'
import { EconomicMonitor } from '../services/economic-monitor/monitor'
import { RevenueTracker } from '../services/economic-monitor/revenue-tracker'
import { DassieClient } from '../services/payment/dassie-client'
import { decrypt } from '../utils/encryption'
import { Pool } from 'pg'

/**
 * Economic Monitor Factory
 *
 * Provides singleton instance of EconomicMonitor for dependency injection.
 * Initializes the complete economic monitoring stack:
 * - ExchangeRateService (CoinGecko API + Redis caching)
 * - RevenueTracker (Dassie ledger subscriptions)
 * - EconomicMonitor (orchestration + periodic snapshots)
 *
 * @module economic-monitor-factory
 */


let economicMonitorInstance: EconomicMonitor | null = null
let aktBalanceMonitorInstance: AktBalanceMonitor | null = null
let escrowDepositorInstance: EscrowDepositor | null = null

/**
 * Initialize EconomicMonitor singleton
 *
 * Creates full economic monitoring stack and starts periodic snapshots.
 * This should be called during app startup after Dassie client is connected.
 *
 * @param dassieClient - Connected Dassie RPC client
 * @param dbPool - PostgreSQL connection pool
 * @param redisClient - Redis client (ioredis instance)
 * @returns Promise that resolves when monitor is started
 */
export async function initializeEconomicMonitor(
  dassieClient: DassieClient,
  dbPool: Pool,
  redisClient: CacheClient
): Promise<void> {
  if (economicMonitorInstance) {
    console.warn('EconomicMonitor already initialized')
    return
  }

  // Create services
  const exchangeRateService = new ExchangeRateService(
    redisClient,
    300000 // 5 minutes cache TTL
  )

  const snapshotRepository = new EconomicSnapshotRepository(dbPool)

  const revenueTracker = new RevenueTracker(
    dassieClient,
    snapshotRepository,
    redisClient
  )

  // Initialize AKT Balance Monitor if Akash is enabled (Story 7.3)
  let aktBalanceMonitor: AktBalanceMonitor | undefined = undefined

  try {
    const akashConfig = loadAkashConfig()

    if (akashConfig.enabled) {
      // Initialize AkashWallet if encrypted mnemonic exists
      if (akashConfig.wallet.encryptedMnemonic && akashConfig.wallet.password) {
        const decryptedMnemonic = decrypt(
          akashConfig.wallet.encryptedMnemonic,
          akashConfig.wallet.password
        )

        const akashWallet = await AkashWallet.fromMnemonic(
          decryptedMnemonic,
          akashConfig,
          akashConfig.wallet.password
        )

        // Initialize repositories
        const aktPurchaseRepository = new AktPurchaseRepository(dbPool)

        // Create balance monitor
        aktBalanceMonitor = new AktBalanceMonitor(
          akashWallet,
          aktPurchaseRepository,
          {
            pollIntervalMs: 300000, // 5 minutes (from config or default)
            minimumDeltaForAlert: 1000000n, // 1 AKT
          }
        )

        // Start monitoring
        await aktBalanceMonitor.start()
        aktBalanceMonitorInstance = aktBalanceMonitor

        console.log('AKT Balance Monitor initialized and started')

        // Initialize Escrow Depositor if escrow config exists (Story 7.4)
        if (akashConfig.escrow?.address && akashConfig.leaseId && akashConfig.wallet.password) {
          const escrowDepositRepository = new EscrowDepositRepository(dbPool)

          const escrowDepositor = new EscrowDepositor(
            akashWallet,
            escrowDepositRepository,
            {
              minDays: akashConfig.escrow.minDays || 7,
              targetDays: akashConfig.escrow.targetDays || 30,
              dailyCostAkt: akashConfig.escrow.dailyCostAkt || 1.5,
              walletMinBalance: akashConfig.escrow.walletMinBalance || 10.0,
              escrowAddress: akashConfig.escrow.address,
              leaseId: akashConfig.leaseId,
              walletPassword: akashConfig.wallet.password,
              checkIntervalHours: akashConfig.escrow.checkIntervalHours || 24,
            }
          )

          // Subscribe to AKT balance changes to trigger automatic deposits
          aktBalanceMonitor.on('balance_changed', async () => {
            try {
              await escrowDepositor.checkAndDeposit()
            } catch (error) {
              console.error('Escrow deposit after balance change failed:', error)
            }
          })

          // Start daily scheduler
          escrowDepositor.start()
          escrowDepositorInstance = escrowDepositor

          console.log('Escrow Depositor initialized and started')
        } else {
          console.warn('Escrow configuration incomplete. Escrow deposits disabled.')
        }
      } else {
        console.warn(
          'Akash enabled but wallet not configured. AKT balance monitoring disabled.'
        )
      }
    } else {
      console.log('Akash not enabled. AKT balance monitoring disabled.')
    }
  } catch (error) {
    console.error('Failed to initialize AKT Balance Monitor:', error)
    console.warn('Continuing without AKT balance monitoring')
    // Non-fatal: continue without AKT monitoring
  }

  const economicMonitor = new EconomicMonitor(
    revenueTracker,
    exchangeRateService,
    snapshotRepository,
    aktBalanceMonitor // Pass optional AKT balance monitor (Story 7.3)
  )

  // Start monitoring
  await economicMonitor.start()

  economicMonitorInstance = economicMonitor
  console.log('EconomicMonitor initialized and started')
}

/**
 * Get singleton EconomicMonitor instance (synchronous)
 *
 * Returns the initialized monitor instance. Monitor must be initialized
 * via initializeEconomicMonitor() during app startup.
 *
 * @returns EconomicMonitor Singleton economic monitor instance
 * @throws Error if monitor not initialized
 */
export function getEconomicMonitor(): EconomicMonitor {
  if (!economicMonitorInstance) {
    throw new Error(
      'EconomicMonitor not initialized. Call initializeEconomicMonitor() during app startup.'
    )
  }
  return economicMonitorInstance
}

/**
 * Get singleton AktBalanceMonitor instance (Story 7.3)
 *
 * Returns the initialized AKT balance monitor instance if Akash is enabled.
 * Returns null if Akash is not configured or monitoring is disabled.
 *
 * @returns AktBalanceMonitor | null Singleton AKT balance monitor or null
 */
export function getAktBalanceMonitor(): AktBalanceMonitor | null {
  return aktBalanceMonitorInstance
}

/**
 * Get singleton EscrowDepositor instance (Story 7.4)
 *
 * Returns the initialized escrow depositor instance if Akash escrow is configured.
 * Returns null if escrow is not configured or disabled.
 *
 * @returns EscrowDepositor | null Singleton escrow depositor or null
 */
export function getEscrowDepositor(): EscrowDepositor | null {
  return escrowDepositorInstance
}

/**
 * Stop and reset singleton (for testing and graceful shutdown)
 */
export async function resetEconomicMonitor(): Promise<void> {
  if (escrowDepositorInstance) {
    escrowDepositorInstance.stop()
    escrowDepositorInstance = null
  }

  if (aktBalanceMonitorInstance) {
    aktBalanceMonitorInstance.stop()
    aktBalanceMonitorInstance = null
  }

  if (economicMonitorInstance) {
    await economicMonitorInstance.stop()
    economicMonitorInstance = null
  }
}
