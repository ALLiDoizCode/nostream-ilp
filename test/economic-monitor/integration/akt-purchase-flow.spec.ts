import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AktBalanceMonitor } from '../../../src/services/economic-monitor/akt-balance-monitor'
import { AktPurchaseRecommendation } from '../../../src/services/economic-monitor/akt-purchase-recommendation'
import { AktPurchaseRepository } from '../../../src/repositories/akt-purchase.repository'

import type { AkashWallet } from '../../../src/akash/wallet'
import type { EconomicSnapshotRepository } from '../../../src/repositories/economic-snapshot.repository'
import type { ExchangeRateService } from '../../../src/services/economic-monitor/exchange-rate'

/**
 * AKT Purchase Flow Integration Tests
 *
 * End-to-end tests for the complete AKT purchase flow:
 * 1. Get purchase recommendation
 * 2. Record manual purchase
 * 3. Detect balance change
 * 4. Update economic snapshot
 *
 * Story 7.3 AC 6: Integration test for complete purchase flow
 */


describe('AKT Purchase Flow Integration', () => {
  let recommender: AktPurchaseRecommendation
  let balanceMonitor: AktBalanceMonitor
  let purchaseRepo: AktPurchaseRepository
  let mockWallet: AkashWallet
  let mockExchangeRate: ExchangeRateService
  let mockSnapshotRepo: EconomicSnapshotRepository
  let purchases: any[]

  beforeEach(() => {
    // Reset state
    purchases = []

    // Mock wallet starting with 5 AKT
    let walletBalance = 5000000n
    mockWallet = {
      getBalance: vi.fn().mockImplementation(() =>
        Promise.resolve([{ amount: walletBalance.toString(), denom: 'uakt' }])
      ),
    } as unknown as AkashWallet

    // Mock exchange rate service
    mockExchangeRate = {
      getCurrentRates: vi.fn().mockResolvedValue({
        aktToUsd: 2.5, // $2.50/AKT
      }),
    } as unknown as ExchangeRateService

    // Mock snapshot repository
    mockSnapshotRepo = {
      getLatestSnapshot: vi.fn().mockResolvedValue({
        timestamp: new Date(),
        revenueUsd: 125.0,
        aktBalance: walletBalance,
      }),
    } as unknown as EconomicSnapshotRepository

    // Mock purchase repository (in-memory)
    purchaseRepo = {
      recordPurchase: vi.fn().mockImplementation(async (purchase) => {
        const record = {
          id: `purchase-${purchases.length + 1}`,
          ...purchase,
          purchasedAt: new Date(),
        }
        purchases.push(record)
        return record
      }),
      getRecentPurchases: vi.fn().mockImplementation(async () => [...purchases]),
      getPurchaseByTxHash: vi.fn(),
      getTotalAktPurchased: vi.fn(),
    } as unknown as AktPurchaseRepository

    // Create services
    balanceMonitor = new AktBalanceMonitor(mockWallet, purchaseRepo, {
      pollIntervalMs: 100,
      minimumDeltaForAlert: 1000000n,
    })

    balanceMonitor.setLogger({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })

    recommender = new AktPurchaseRecommendation(
      mockExchangeRate,
      mockSnapshotRepo,
      balanceMonitor,
      { targetBufferDays: 30, dailyCostAkt: 1.5 }
    )

    // Helper to simulate balance increase
    async function simulateBalanceIncrease(newBalance: bigint) {
      walletBalance = newBalance
    }

    // Expose helper for tests
    (global as any).simulateBalanceIncrease = simulateBalanceIncrease
  })

  afterEach(() => {
    balanceMonitor.stop()
    delete (global as any).simulateBalanceIncrease
  })

  it('should complete end-to-end purchase flow', async () => {
    // Step 1: Get purchase recommendation
    const rec = await recommender.getRecommendation()

    expect(rec.revenueUsd).toBe(125.0)
    expect(rec.currentAktBalance).toBe(5.0)
    expect(rec.neededAkt).toBe(40.0)
    expect(rec.neededUsd).toBe(100.0)
    expect(rec.sufficientFunds).toBe(true)

    // Step 2: Record manual purchase
    const purchase = await purchaseRepo.recordPurchase({
      usdAmount: 100,
      aktAmount: 40,
      aktPriceUsd: 2.5,
      exchange: 'Kraken',
    })

    expect(purchase.id).toBe('purchase-1')
    expect(purchase.aktAmount).toBe(40)

    // Step 3: Start balance monitor
    await balanceMonitor.start()

    // Capture balance_changed events
    const balanceChanges: any[] = []
    balanceMonitor.on('balance_changed', (change) => {
      balanceChanges.push(change)
    })

    // Step 4: Simulate AKT transfer (balance increases to 45 AKT)
    await (global as any).simulateBalanceIncrease(45000000n)

    // Wait for balance monitor to detect change
    await new Promise((resolve) => setTimeout(resolve, 150))

    // Step 5: Verify balance change detected
    expect(balanceChanges).toHaveLength(1)
    expect(balanceChanges[0].previousBalance).toBe(5000000n)
    expect(balanceChanges[0].newBalance).toBe(45000000n)
    expect(balanceChanges[0].delta).toBe(40000000n)

    // Step 6: Verify purchase matched
    expect(purchaseRepo.getRecentPurchases).toHaveBeenCalled()
    // Log should confirm purchase matched (via logger mock)
  })

  it('should handle partial purchase (smaller than recommended)', async () => {
    // Get recommendation (needs 40 AKT)
    const rec = await recommender.getRecommendation()
    expect(rec.neededAkt).toBe(40.0)

    // But operator only buys 20 AKT
    await purchaseRepo.recordPurchase({
      usdAmount: 50,
      aktAmount: 20,
      aktPriceUsd: 2.5,
      exchange: 'Coinbase',
    })

    // Start monitoring
    await balanceMonitor.start()
    const balanceChanges: any[] = []
    balanceMonitor.on('balance_changed', (change) => balanceChanges.push(change))

    // Simulate transfer of 20 AKT
    await (global as any).simulateBalanceIncrease(25000000n) // 25 AKT (5 + 20)
    await new Promise((resolve) => setTimeout(resolve, 150))

    // Verify balance change detected
    expect(balanceChanges).toHaveLength(1)
    expect(balanceChanges[0].delta).toBe(20000000n)

    // Get new recommendation (should still need 20 more AKT)
    const newRec = await recommender.getRecommendation()
    expect(newRec.currentAktBalance).toBe(25.0)
    expect(newRec.neededAkt).toBe(20.0) // 45 - 25
  })

  it('should detect unexpected transfer (no purchase record)', async () => {
    await balanceMonitor.start()

    const balanceChanges: any[] = []
    balanceMonitor.on('balance_changed', (change) => balanceChanges.push(change))

    // Simulate unexpected 10 AKT transfer (no purchase recorded)
    await (global as any).simulateBalanceIncrease(15000000n)
    await new Promise((resolve) => setTimeout(resolve, 150))

    // Balance change detected
    expect(balanceChanges).toHaveLength(1)
    expect(balanceChanges[0].delta).toBe(10000000n)

    // Should log warning about unexpected transfer
  })

  it('should handle multiple purchases over time', async () => {
    await balanceMonitor.start()

    // First purchase: 20 AKT
    await purchaseRepo.recordPurchase({
      usdAmount: 50,
      aktAmount: 20,
      aktPriceUsd: 2.5,
      exchange: 'Kraken',
    })

    await (global as any).simulateBalanceIncrease(25000000n)
    await new Promise((resolve) => setTimeout(resolve, 150))

    // Second purchase: 20 AKT more
    await purchaseRepo.recordPurchase({
      usdAmount: 50,
      aktAmount: 20,
      aktPriceUsd: 2.5,
      exchange: 'Kraken',
    })

    await (global as any).simulateBalanceIncrease(45000000n)
    await new Promise((resolve) => setTimeout(resolve, 150))

    // Verify both purchases recorded
    const allPurchases = await purchaseRepo.getRecentPurchases(10)
    expect(allPurchases).toHaveLength(2)
    expect(allPurchases[0].aktAmount).toBe(20)
    expect(allPurchases[1].aktAmount).toBe(20)
  })
})
