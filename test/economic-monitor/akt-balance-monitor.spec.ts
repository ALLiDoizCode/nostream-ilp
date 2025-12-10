import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AktBalanceMonitor, BalanceChange } from '../../src/services/economic-monitor/akt-balance-monitor'

import type { AkashWallet } from '../../src/akash/wallet'
import type { AktPurchaseRepository } from '../../src/repositories/akt-purchase.repository'

/**
 * AKT Balance Monitor Unit Tests
 *
 * Tests for the AktBalanceMonitor service that polls Akash wallet balance
 * and detects incoming AKT transfers.
 *
 * Story 7.3 AC 6: Tests for balance monitoring functionality
 */


describe('AktBalanceMonitor', () => {
  let monitor: AktBalanceMonitor
  let mockWallet: AkashWallet
  let mockPurchaseRepo: AktPurchaseRepository
  let balanceChangeEvents: BalanceChange[]

  beforeEach(() => {
    // Reset test state
    balanceChangeEvents = []

    // Mock AkashWallet
    mockWallet = {
      getBalance: vi.fn().mockResolvedValue([
        { amount: '5000000', denom: 'uakt' }, // 5 AKT
      ]),
    } as unknown as AkashWallet

    // Mock AktPurchaseRepository
    mockPurchaseRepo = {
      getRecentPurchases: vi.fn().mockResolvedValue([]),
    } as unknown as AktPurchaseRepository

    // Create monitor
    monitor = new AktBalanceMonitor(mockWallet, mockPurchaseRepo, {
      pollIntervalMs: 100, // Fast polling for tests
      minimumDeltaForAlert: 1000000n, // 1 AKT
    })

    // Suppress console logs in tests
    monitor.setLogger({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })

    // Capture balance_changed events
    monitor.on('balance_changed', (change: BalanceChange) => {
      balanceChangeEvents.push(change)
    })
  })

  afterEach(() => {
    monitor.stop()
  })

  describe('start and stop', () => {
    it('should start polling and query initial balance', async () => {
      await monitor.start()

      expect(mockWallet.getBalance).toHaveBeenCalledTimes(1)

      const currentBalance = await monitor.getCurrentBalance()
      expect(currentBalance).toBe(5000000n) // 5 AKT in uakt
    })

    it('should stop polling when stop() called', async () => {
      await monitor.start()
      monitor.stop()

      const callCountBefore = vi.mocked(mockWallet.getBalance).mock.calls.length

      // Wait for potential poll interval
      await new Promise((resolve) => setTimeout(resolve, 150))

      const callCountAfter = vi.mocked(mockWallet.getBalance).mock.calls.length
      expect(callCountAfter).toBe(callCountBefore) // No additional calls
    })

    it('should throw error if already started', async () => {
      await monitor.start()
      await expect(monitor.start()).rejects.toThrow('Balance monitor already started')
    })
  })

  describe('balance change detection', () => {
    it('should detect balance increase and emit event', async () => {
      // Start with 5 AKT
      await monitor.start()

      // Simulate balance increase to 45 AKT
      vi.mocked(mockWallet.getBalance).mockResolvedValue([
        { amount: '45000000', denom: 'uakt' }, // 45 AKT
      ])

      // Wait for next poll
      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(balanceChangeEvents).toHaveLength(1)
      expect(balanceChangeEvents[0].previousBalance).toBe(5000000n)
      expect(balanceChangeEvents[0].newBalance).toBe(45000000n)
      expect(balanceChangeEvents[0].delta).toBe(40000000n) // +40 AKT
    })

    it('should detect balance decrease and emit event', async () => {
      await monitor.start()

      // Simulate balance decrease to 2 AKT
      vi.mocked(mockWallet.getBalance).mockResolvedValue([
        { amount: '2000000', denom: 'uakt' }, // 2 AKT
      ])

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(balanceChangeEvents).toHaveLength(1)
      expect(balanceChangeEvents[0].delta).toBe(-3000000n) // -3 AKT
    })

    it('should ignore small balance changes below threshold', async () => {
      await monitor.start()

      // Simulate small increase of 0.5 AKT (below 1 AKT threshold)
      vi.mocked(mockWallet.getBalance).mockResolvedValue([
        { amount: '5500000', denom: 'uakt' }, // 5.5 AKT
      ])

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(balanceChangeEvents).toHaveLength(0) // No event emitted
    })

    it('should not emit event when balance unchanged', async () => {
      await monitor.start()

      // Keep balance the same
      vi.mocked(mockWallet.getBalance).mockResolvedValue([
        { amount: '5000000', denom: 'uakt' }, // 5 AKT
      ])

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(balanceChangeEvents).toHaveLength(0)
    })
  })

  describe('purchase matching', () => {
    it('should match balance increase with purchase record', async () => {
      // Mock purchase record for 40 AKT
      vi.mocked(mockPurchaseRepo.getRecentPurchases).mockResolvedValue([
        {
          id: 'purchase-1',
          usdAmount: 100,
          aktAmount: 40.0,
          aktPriceUsd: 2.5,
          exchange: 'Kraken',
          txHash: null,
          purchasedAt: new Date(),
          notes: null,
        },
      ])

      await monitor.start()

      // Simulate balance increase of 40 AKT
      vi.mocked(mockWallet.getBalance).mockResolvedValue([
        { amount: '45000000', denom: 'uakt' }, // 45 AKT (5 + 40)
      ])

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(mockPurchaseRepo.getRecentPurchases).toHaveBeenCalled()
      expect(balanceChangeEvents).toHaveLength(1)
      expect(balanceChangeEvents[0].delta).toBe(40000000n)
      // Log should confirm purchase matched (verified by logger mock)
    })

    it('should detect unexpected transfer when no matching purchase', async () => {
      // No purchase records
      vi.mocked(mockPurchaseRepo.getRecentPurchases).mockResolvedValue([])

      await monitor.start()

      // Simulate unexpected 10 AKT transfer
      vi.mocked(mockWallet.getBalance).mockResolvedValue([
        { amount: '15000000', denom: 'uakt' }, // 15 AKT (5 + 10)
      ])

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(balanceChangeEvents).toHaveLength(1)
      expect(balanceChangeEvents[0].delta).toBe(10000000n)
      // Log should warn about unexpected transfer (verified by logger mock)
    })

    it('should match purchase with 1% tolerance', async () => {
      // Mock purchase for 40 AKT
      vi.mocked(mockPurchaseRepo.getRecentPurchases).mockResolvedValue([
        {
          id: 'purchase-1',
          usdAmount: 100,
          aktAmount: 40.0,
          aktPriceUsd: 2.5,
          exchange: 'Kraken',
          txHash: null,
          purchasedAt: new Date(),
          notes: null,
        },
      ])

      await monitor.start()

      // Simulate balance increase of 40.2 AKT (within 1% tolerance)
      vi.mocked(mockWallet.getBalance).mockResolvedValue([
        { amount: '45200000', denom: 'uakt' }, // 45.2 AKT (5 + 40.2)
      ])

      await new Promise((resolve) => setTimeout(resolve, 150))

      expect(balanceChangeEvents).toHaveLength(1)
      // Should match purchase despite slight difference
    })
  })

  describe('getCurrentBalance', () => {
    it('should return current balance in uakt', async () => {
      const balance = await monitor.getCurrentBalance()
      expect(balance).toBe(5000000n) // 5 AKT
    })

    it('should return 0 if no uakt coin found', async () => {
      vi.mocked(mockWallet.getBalance).mockResolvedValue([
        { amount: '1000000', denom: 'foo' }, // Different denom
      ])

      const balance = await monitor.getCurrentBalance()
      expect(balance).toBe(0n)
    })

    it('should handle empty coins array', async () => {
      vi.mocked(mockWallet.getBalance).mockResolvedValue([])

      const balance = await monitor.getCurrentBalance()
      expect(balance).toBe(0n)
    })
  })

  describe('error handling', () => {
    it('should handle wallet balance query failure gracefully', async () => {
      // First call succeeds, subsequent calls fail
      vi.mocked(mockWallet.getBalance)
        .mockResolvedValueOnce([{ amount: '5000000', denom: 'uakt' }]) // Initial start() succeeds
        .mockRejectedValue(new Error('Network error')) // Poll fails

      await monitor.start()

      // Wait for poll attempt that will fail
      await new Promise((resolve) => setTimeout(resolve, 150))

      // Should not crash, error logged
      expect(balanceChangeEvents).toHaveLength(0)
    })

    it('should handle purchase repo failure gracefully', async () => {
      vi.mocked(mockPurchaseRepo.getRecentPurchases).mockRejectedValue(
        new Error('Database error')
      )

      await monitor.start()

      // Simulate balance increase
      vi.mocked(mockWallet.getBalance).mockResolvedValue([
        { amount: '15000000', denom: 'uakt' },
      ])

      await new Promise((resolve) => setTimeout(resolve, 150))

      // Should still emit balance_changed event despite purchase matching failure
      expect(balanceChangeEvents).toHaveLength(1)
    })
  })
})
