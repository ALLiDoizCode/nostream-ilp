import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AktPurchaseRecommendation } from '../../src/services/economic-monitor/akt-purchase-recommendation'

import type { AktBalanceMonitor } from '../../src/services/economic-monitor/akt-balance-monitor'
import type { EconomicSnapshotRepository } from '../../src/repositories/economic-snapshot.repository'
import type { ExchangeRateService } from '../../src/services/economic-monitor/exchange-rate'

/**
 * AKT Purchase Recommendation Unit Tests
 *
 * Tests for the AktPurchaseRecommendation service that calculates how much AKT
 * operators should purchase based on revenue, balance, and price.
 *
 * Story 7.3 AC 6: Tests for purchase recommendation calculation
 */


describe('AktPurchaseRecommendation', () => {
  let recommender: AktPurchaseRecommendation
  let mockExchangeRateService: ExchangeRateService
  let mockSnapshotRepo: EconomicSnapshotRepository
  let mockBalanceMonitor: AktBalanceMonitor

  beforeEach(() => {
    // Mock ExchangeRateService
    mockExchangeRateService = {
      getCurrentRates: vi.fn().mockResolvedValue({
        ethToUsd: 2000,
        usdcToUsd: 1.0,
        aktToUsd: 2.5, // $2.50 per AKT
        lastUpdated: Date.now(),
      }),
    } as unknown as ExchangeRateService

    // Mock EconomicSnapshotRepository
    mockSnapshotRepo = {
      getLatestSnapshot: vi.fn().mockResolvedValue({
        timestamp: new Date(),
        revenueUsd: 125.0, // $125 revenue
        subscriptionRevenueUsd: 0,
        routingRevenueUsd: 0,
        contentRevenueUsd: 0,
        expensesUsd: 0,
        akashCostUsd: 0,
        gasFeeUsd: 0,
        netProfitUsd: 125.0,
        ethBalance: 0n,
        usdcBalance: 0n,
        aktBalance: 5000000n, // 5 AKT
      }),
    } as unknown as EconomicSnapshotRepository

    // Mock AktBalanceMonitor
    mockBalanceMonitor = {
      getCurrentBalance: vi.fn().mockResolvedValue(5000000n), // 5 AKT in uakt
    } as unknown as AktBalanceMonitor

    // Create recommender with default config (30 days, 1.5 AKT/day)
    recommender = new AktPurchaseRecommendation(
      mockExchangeRateService,
      mockSnapshotRepo,
      mockBalanceMonitor,
      {
        targetBufferDays: 30,
        dailyCostAkt: 1.5,
      }
    )
  })

  describe('getRecommendation', () => {
    it('should calculate recommendation with sufficient funds', async () => {
      const rec = await recommender.getRecommendation()

      expect(rec.revenueUsd).toBe(125.0)
      expect(rec.currentAktBalance).toBe(5.0) // 5 AKT
      expect(rec.targetAktBalance).toBe(45.0) // 30 days * 1.5 AKT/day
      expect(rec.neededAkt).toBe(40.0) // 45 - 5
      expect(rec.aktPriceUsd).toBe(2.5)
      expect(rec.neededUsd).toBe(100.0) // 40 * 2.5
      expect(rec.sufficientFunds).toBe(true) // $125 >= $100
      expect(rec.message).toContain('sufficient revenue')
    })

    it('should calculate recommendation with insufficient funds', async () => {
      // Mock lower revenue
      vi.mocked(mockSnapshotRepo.getLatestSnapshot).mockResolvedValue({
        timestamp: new Date(),
        revenueUsd: 50.0, // Only $50 revenue
        subscriptionRevenueUsd: 0,
        routingRevenueUsd: 0,
        contentRevenueUsd: 0,
        expensesUsd: 0,
        akashCostUsd: 0,
        gasFeeUsd: 0,
        netProfitUsd: 50.0,
        ethBalance: 0n,
        usdcBalance: 0n,
        aktBalance: 5000000n,
      })

      const rec = await recommender.getRecommendation()

      expect(rec.revenueUsd).toBe(50.0)
      expect(rec.neededAkt).toBe(40.0)
      expect(rec.neededUsd).toBe(100.0)
      expect(rec.sufficientFunds).toBe(false) // $50 < $100
      expect(rec.message).toContain('Insufficient revenue')
      expect(rec.message).toContain('shortfall')
    })

    it('should recommend no purchase when already funded', async () => {
      // Mock higher AKT balance (already has 50 AKT, target is 45)
      vi.mocked(mockBalanceMonitor.getCurrentBalance).mockResolvedValue(50000000n) // 50 AKT

      const rec = await recommender.getRecommendation()

      expect(rec.currentAktBalance).toBe(50.0)
      expect(rec.targetAktBalance).toBe(45.0)
      expect(rec.neededAkt).toBe(0) // Already exceeds target
      expect(rec.neededUsd).toBe(0)
      expect(rec.sufficientFunds).toBe(true)
      expect(rec.message).toContain('No purchase needed')
    })

    it('should handle price fluctuations correctly', async () => {
      // Mock higher AKT price ($5.00 instead of $2.50)
      vi.mocked(mockExchangeRateService.getCurrentRates).mockResolvedValue({
        ethToUsd: 2000,
        usdcToUsd: 1.0,
        aktToUsd: 5.0, // $5.00 per AKT
        lastUpdated: Date.now(),
      })

      const rec = await recommender.getRecommendation()

      expect(rec.aktPriceUsd).toBe(5.0)
      expect(rec.neededAkt).toBe(40.0) // Same AKT amount needed
      expect(rec.neededUsd).toBe(200.0) // But costs $200 now (40 * 5.0)
      expect(rec.sufficientFunds).toBe(false) // $125 < $200
    })

    it('should use custom config for target buffer', async () => {
      // Create recommender with different config
      const customRecommender = new AktPurchaseRecommendation(
        mockExchangeRateService,
        mockSnapshotRepo,
        mockBalanceMonitor,
        {
          targetBufferDays: 60, // 60 days instead of 30
          dailyCostAkt: 2.0, // 2 AKT/day instead of 1.5
        }
      )

      const rec = await customRecommender.getRecommendation()

      expect(rec.targetAktBalance).toBe(120.0) // 60 * 2.0
      expect(rec.neededAkt).toBe(115.0) // 120 - 5
      expect(rec.neededUsd).toBe(287.5) // 115 * 2.5
    })

    it('should throw error if exchange rate unavailable', async () => {
      vi.mocked(mockExchangeRateService.getCurrentRates).mockResolvedValue({
        ethToUsd: 2000,
        usdcToUsd: 1.0,
        aktToUsd: undefined, // AKT price missing
        lastUpdated: Date.now(),
      } as any)

      await expect(recommender.getRecommendation()).rejects.toThrow(
        'AKT/USD exchange rate unavailable'
      )
    })

    it('should handle missing snapshot (zero revenue)', async () => {
      vi.mocked(mockSnapshotRepo.getLatestSnapshot).mockResolvedValue(null)

      const rec = await recommender.getRecommendation()

      expect(rec.revenueUsd).toBe(0)
      expect(rec.sufficientFunds).toBe(false)
    })
  })

  describe('formatRecommendation', () => {
    it('should format recommendation as multiline string', async () => {
      const rec = await recommender.getRecommendation()
      const formatted = recommender.formatRecommendation(rec)

      expect(formatted).toContain('Revenue: $125.00 USD')
      expect(formatted).toContain('Current AKT Balance: 5.0 AKT')
      expect(formatted).toContain('Target Balance: 45.0 AKT')
      expect(formatted).toContain('Need to Purchase: 40.0 AKT')
      expect(formatted).toContain('30 days hosting')
      expect(formatted).toContain('sufficient revenue')
    })

    it('should format zero needed AKT', async () => {
      vi.mocked(mockBalanceMonitor.getCurrentBalance).mockResolvedValue(50000000n)

      const rec = await recommender.getRecommendation()
      const formatted = recommender.formatRecommendation(rec)

      expect(formatted).toContain('Need to Purchase: 0.0 AKT')
      expect(formatted).toContain('No purchase needed')
    })

    it('should format insufficient funds message', async () => {
      vi.mocked(mockSnapshotRepo.getLatestSnapshot).mockResolvedValue({
        timestamp: new Date(),
        revenueUsd: 50.0,
        subscriptionRevenueUsd: 0,
        routingRevenueUsd: 0,
        contentRevenueUsd: 0,
        expensesUsd: 0,
        akashCostUsd: 0,
        gasFeeUsd: 0,
        netProfitUsd: 50.0,
        ethBalance: 0n,
        usdcBalance: 0n,
        aktBalance: 5000000n,
      })

      const rec = await recommender.getRecommendation()
      const formatted = recommender.formatRecommendation(rec)

      expect(formatted).toContain('Revenue: $50.00 USD')
      expect(formatted).toContain('Insufficient revenue')
    })
  })

  describe('edge cases', () => {
    it('should handle zero revenue', async () => {
      vi.mocked(mockSnapshotRepo.getLatestSnapshot).mockResolvedValue({
        timestamp: new Date(),
        revenueUsd: 0,
        subscriptionRevenueUsd: 0,
        routingRevenueUsd: 0,
        contentRevenueUsd: 0,
        expensesUsd: 0,
        akashCostUsd: 0,
        gasFeeUsd: 0,
        netProfitUsd: 0,
        ethBalance: 0n,
        usdcBalance: 0n,
        aktBalance: 0n,
      })

      vi.mocked(mockBalanceMonitor.getCurrentBalance).mockResolvedValue(0n)

      const rec = await recommender.getRecommendation()

      expect(rec.revenueUsd).toBe(0)
      expect(rec.currentAktBalance).toBe(0)
      expect(rec.neededAkt).toBe(45.0)
      expect(rec.sufficientFunds).toBe(false)
    })

    it('should handle zero AKT balance', async () => {
      vi.mocked(mockBalanceMonitor.getCurrentBalance).mockResolvedValue(0n)

      const rec = await recommender.getRecommendation()

      expect(rec.currentAktBalance).toBe(0)
      expect(rec.neededAkt).toBe(45.0)
    })

    it('should handle very high AKT price', async () => {
      vi.mocked(mockExchangeRateService.getCurrentRates).mockResolvedValue({
        ethToUsd: 2000,
        usdcToUsd: 1.0,
        aktToUsd: 100.0, // $100 per AKT (unrealistic but tests edge case)
        lastUpdated: Date.now(),
      })

      const rec = await recommender.getRecommendation()

      expect(rec.aktPriceUsd).toBe(100.0)
      expect(rec.neededUsd).toBe(4000.0) // 40 * 100
      expect(rec.sufficientFunds).toBe(false) // $125 << $4000
    })
  })
})
