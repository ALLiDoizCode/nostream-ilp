import type { EconomicSnapshotRepository } from '../../repositories/economic-snapshot.repository'
import type { AktBalanceMonitor } from './akt-balance-monitor'
import type { ExchangeRateService } from './exchange-rate'

/**
 * AKT Purchase Recommendation Service
 *
 * Calculates how much AKT the operator should purchase based on:
 * - Current revenue in USD
 * - Current AKT balance
 * - Current AKT/USD exchange rate
 * - Target AKT buffer (30 days of hosting)
 *
 * Story 7.3: Provides actionable purchase recommendations for dashboard.
 */


/**
 * Purchase recommendation result
 */
export interface PurchaseRecommendation {
  /** Current revenue in USD */
  revenueUsd: number;
  /** Current AKT balance (in AKT, not uakt) */
  currentAktBalance: number;
  /** Target AKT balance for buffer period */
  targetAktBalance: number;
  /** AKT needed to reach target */
  neededAkt: number;
  /** Current AKT price in USD */
  aktPriceUsd: number;
  /** USD cost to purchase needed AKT */
  neededUsd: number;
  /** Whether operator has sufficient revenue to purchase */
  sufficientFunds: boolean;
  /** Human-readable recommendation message */
  message: string;
}

/**
 * Configuration for purchase recommendation
 */
export interface PurchaseRecommendationConfig {
  /** Target buffer period in days (default: 30) */
  targetBufferDays: number;
  /** Daily Akash hosting cost in AKT (default: 1.5) */
  dailyCostAkt: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: PurchaseRecommendationConfig = {
  targetBufferDays: 30,
  dailyCostAkt: 1.5, // ~$5/month at $2.50/AKT
}

/**
 * AKT Purchase Recommendation Service
 *
 * Generates purchase recommendations for dashboard display.
 * Helps operators understand how much AKT to buy and whether they can afford it.
 *
 * @example
 * const recommender = new AktPurchaseRecommendation(
 *   exchangeRateService,
 *   snapshotRepo,
 *   balanceMonitor,
 *   { targetBufferDays: 30, dailyCostAkt: 1.5 }
 * );
 * const rec = await recommender.getRecommendation();
 * console.log(rec.message);
 */
export class AktPurchaseRecommendation {
  private readonly config: PurchaseRecommendationConfig

  constructor(
    private readonly exchangeRateService: ExchangeRateService,
    private readonly snapshotRepo: EconomicSnapshotRepository,
    private readonly balanceMonitor: AktBalanceMonitor,
    config: Partial<PurchaseRecommendationConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Get purchase recommendation based on current state
   *
   * Queries:
   * - Latest economic snapshot for revenue_usd
   * - Current AKT balance from balance monitor
   * - Current AKT/USD price from exchange rate service
   *
   * Calculates:
   * - Target AKT balance (dailyCostAkt * targetBufferDays)
   * - Needed AKT (target - current)
   * - USD cost (neededAkt * aktPrice)
   * - Whether funds are sufficient (revenue >= cost)
   *
   * @returns Purchase recommendation with actionable message
   * @throws Error if required data unavailable (exchange rate, snapshot)
   */
  async getRecommendation(): Promise<PurchaseRecommendation> {
    // Get current revenue from latest economic snapshot
    const snapshot = await this.snapshotRepo.getLatestSnapshot()
    const revenueUsd = snapshot?.revenueUsd ?? 0

    // Get current AKT balance
    const balanceUakt = await this.balanceMonitor.getCurrentBalance()
    const currentAktBalance = Number(balanceUakt) / 1_000_000 // Convert uakt to AKT

    // Get current AKT/USD price
    const rates = await this.exchangeRateService.getCurrentRates()
    if (!rates.aktToUsd) {
      throw new Error('AKT/USD exchange rate unavailable')
    }
    const aktPriceUsd = rates.aktToUsd

    // Calculate target AKT balance
    const targetAktBalance = this.config.dailyCostAkt * this.config.targetBufferDays

    // Calculate needed AKT
    const neededAkt = Math.max(0, targetAktBalance - currentAktBalance)

    // Calculate USD cost
    const neededUsd = neededAkt * aktPriceUsd

    // Check if operator has sufficient funds
    const sufficientFunds = revenueUsd >= neededUsd

    // Generate recommendation message
    const message = this.generateMessage({
      revenueUsd,
      currentAktBalance,
      targetAktBalance,
      neededAkt,
      aktPriceUsd,
      neededUsd,
      sufficientFunds,
    })

    return {
      revenueUsd,
      currentAktBalance,
      targetAktBalance,
      neededAkt,
      aktPriceUsd,
      neededUsd,
      sufficientFunds,
      message,
    }
  }

  /**
   * Format recommendation as human-readable string
   *
   * @param rec - Purchase recommendation to format
   * @returns Multi-line formatted recommendation
   */
  formatRecommendation(rec: PurchaseRecommendation): string {
    const lines: string[] = []

    lines.push(`Revenue: $${rec.revenueUsd.toFixed(2)} USD`)
    lines.push(
      `Current AKT Balance: ${rec.currentAktBalance.toFixed(1)} AKT ($${(rec.currentAktBalance * rec.aktPriceUsd).toFixed(2)})`,
    )
    lines.push(
      `Target Balance: ${rec.targetAktBalance.toFixed(1)} AKT (${this.config.targetBufferDays} days hosting)`,
    )
    lines.push(
      `Need to Purchase: ${rec.neededAkt.toFixed(1)} AKT ($${rec.neededUsd.toFixed(2)} at current price)`,
    )
    lines.push('')
    lines.push(rec.message)

    return lines.join('\n')
  }

  /**
   * Generate recommendation message based on scenario
   *
   * @private
   */
  private generateMessage(rec: Omit<PurchaseRecommendation, 'message'>): string {
    // Scenario 1: No purchase needed (already funded)
    if (rec.neededAkt === 0) {
      return `No purchase needed. Current balance (${rec.currentAktBalance.toFixed(1)} AKT) meets or exceeds target (${rec.targetAktBalance.toFixed(1)} AKT).`
    }

    // Scenario 2: Sufficient funds to purchase
    if (rec.sufficientFunds) {
      return `You have sufficient revenue ($${rec.revenueUsd.toFixed(2)}) to purchase ${rec.neededAkt.toFixed(1)} AKT ($${rec.neededUsd.toFixed(2)}). Buy on Kraken or Coinbase and send to your Akash wallet.`
    }

    // Scenario 3: Insufficient funds
    const shortfall = rec.neededUsd - rec.revenueUsd
    return `Insufficient revenue. Need $${rec.neededUsd.toFixed(2)} for ${rec.neededAkt.toFixed(1)} AKT, but only $${rec.revenueUsd.toFixed(2)} available. Continue earning to reach target (shortfall: $${shortfall.toFixed(2)}).`
  }
}
