import { EventEmitter as _EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _DepositResult, EscrowDepositConfig, EscrowDepositor, _EscrowStatus } from '../../src/akash/escrow-depositor'
import { EscrowDepositRepository } from '../../src/repositories/escrow-deposit.repository'
import { IAkashWallet } from '../../src/akash/wallet'

/**
 * Unit tests for EscrowDepositor (Story 7.4)
 */
describe('EscrowDepositor', () => {
  let mockWallet: IAkashWallet
  let mockRepository: EscrowDepositRepository
  let config: EscrowDepositConfig
  let depositor: EscrowDepositor

  beforeEach(() => {
    // Mock wallet
    mockWallet = {
      getAddress: vi.fn().mockResolvedValue('akash1test123'),
      getBalance: vi.fn().mockResolvedValue([{ amount: '45000000', denom: 'uakt' }]), // 45 AKT
      sendTokens: vi.fn().mockResolvedValue('TX_HASH_123'),
      queryEscrowBalance: vi.fn().mockResolvedValue('25500000'), // 25.5 AKT
      signMessage: vi.fn().mockRejectedValue(new Error('Not implemented')),
      exportMnemonic: vi.fn().mockRejectedValue(new Error('Not implemented')),
    }

    // Mock repository
    mockRepository = {
      recordDeposit: vi.fn().mockResolvedValue(undefined),
      getDepositByTxHash: vi.fn().mockResolvedValue(null),
      getRecentDeposits: vi.fn().mockResolvedValue([]),
      getTotalDeposited: vi.fn().mockResolvedValue(0),
    } as unknown as EscrowDepositRepository

    // Default config
    config = {
      minDays: 7,
      targetDays: 30,
      dailyCostAkt: 1.5,
      walletMinBalance: 10.0,
      escrowAddress: 'akash1escrow456',
      leaseId: '12345/1/1',
      walletPassword: 'test-password',
      checkIntervalHours: 24,
    }

    depositor = new EscrowDepositor(mockWallet, mockRepository, config)
  })

  afterEach(() => {
    depositor.stop()
    vi.clearAllMocks()
  })

  describe('checkAndDeposit', () => {
    it('should calculate deposit needed and execute deposit', async () => {
      const result = await depositor.checkAndDeposit()

      expect(result.deposited).toBe(true)
      expect(result.amountAkt).toBeCloseTo(19.5, 1) // 45 - 25.5 = 19.5 AKT
      expect(result.txHash).toBe('TX_HASH_123')

      expect(mockWallet.sendTokens).toHaveBeenCalledWith(
        'akash1escrow456',
        '19500000', // 19.5 AKT in uakt
        'test-password',
        expect.stringContaining('Escrow deposit')
      )

      expect(mockRepository.recordDeposit).toHaveBeenCalledWith(
        expect.objectContaining({
          amountAkt: expect.closeTo(19.5, 1),
          escrowAddress: 'akash1escrow456',
          txHash: 'TX_HASH_123',
          newBalanceAkt: 45.0,
          leaseId: '12345/1/1',
        })
      )
    })

    it('should not deposit if escrow balance is sufficient', async () => {
      // Mock escrow balance exceeds target (50 AKT > 45 AKT target)
      vi.mocked(mockWallet.queryEscrowBalance).mockResolvedValue('50000000')

      const result = await depositor.checkAndDeposit()

      expect(result.deposited).toBe(false)
      expect(result.reason).toBe('sufficient-balance')
      expect(mockWallet.sendTokens).not.toHaveBeenCalled()
      expect(mockRepository.recordDeposit).not.toHaveBeenCalled()
    })

    it('should not deposit if wallet balance is insufficient', async () => {
      // Mock wallet balance below minimum (8 AKT < 10 AKT minimum)
      vi.mocked(mockWallet.getBalance).mockResolvedValue([{ amount: '8000000', denom: 'uakt' }])
      // Mock escrow balance very low (5 AKT)
      vi.mocked(mockWallet.queryEscrowBalance).mockResolvedValue('5000000')

      const result = await depositor.checkAndDeposit()

      expect(result.deposited).toBe(false)
      expect(result.reason).toBe('insufficient-wallet')
      expect(mockWallet.sendTokens).not.toHaveBeenCalled()
      expect(mockRepository.recordDeposit).not.toHaveBeenCalled()
    })

    it('should emit deposit_complete event on successful deposit', async () => {
      const depositCompleteListener = vi.fn()
      depositor.on('deposit_complete', depositCompleteListener)

      await depositor.checkAndDeposit()

      expect(depositCompleteListener).toHaveBeenCalledWith(
        expect.objectContaining({
          amountAkt: expect.closeTo(19.5, 1),
          txHash: 'TX_HASH_123',
          newBalanceAkt: 45.0,
        })
      )
    })

    it('should emit deposit_failed event if wallet insufficient', async () => {
      vi.mocked(mockWallet.getBalance).mockResolvedValue([{ amount: '8000000', denom: 'uakt' }])
      vi.mocked(mockWallet.queryEscrowBalance).mockResolvedValue('5000000')

      const depositFailedListener = vi.fn()
      depositor.on('deposit_failed', depositFailedListener)

      await depositor.checkAndDeposit()

      expect(depositFailedListener).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'insufficient-wallet',
          walletBalance: 8.0,
          minRequired: 10.0,
        })
      )
    })

    it('should handle escrow query failure gracefully', async () => {
      vi.mocked(mockWallet.queryEscrowBalance).mockRejectedValue(new Error('RPC connection failed'))

      const result = await depositor.checkAndDeposit()

      expect(result.deposited).toBe(false)
      expect(result.reason).toBe('escrow-query-failed')
    })
  })

  describe('getEscrowStatus', () => {
    it('should calculate escrow status with OK warning level', async () => {
      // 25.5 AKT / 1.5 AKT per day = 17 days (OK, > 7 days)
      const status = await depositor.getEscrowStatus()

      expect(status.escrowBalanceAkt).toBeCloseTo(25.5, 1)
      expect(status.daysRemaining).toBeCloseTo(17.0, 1)
      expect(status.warningLevel).toBe('OK')
      expect(status.needsDeposit).toBe(true)
      expect(status.walletBalanceAkt).toBeCloseTo(45.0, 1)
      expect(status.targetBalanceAkt).toBeCloseTo(45.0, 1)
    })

    it('should detect WARNING level when days < minDays', async () => {
      // 9 AKT / 1.5 AKT per day = 6 days (WARNING, < 7 days but >= 3)
      vi.mocked(mockWallet.queryEscrowBalance).mockResolvedValue('9000000')

      const status = await depositor.getEscrowStatus()

      expect(status.daysRemaining).toBeCloseTo(6.0, 1)
      expect(status.warningLevel).toBe('WARNING')
      expect(status.needsDeposit).toBe(true)
    })

    it('should detect CRITICAL level when days < 3', async () => {
      // 4.5 AKT / 1.5 AKT per day = 3 days (CRITICAL, < 3 days)
      vi.mocked(mockWallet.queryEscrowBalance).mockResolvedValue('4500000')

      const status = await depositor.getEscrowStatus()

      expect(status.daysRemaining).toBeCloseTo(3.0, 1)
      expect(status.warningLevel).toBe('CRITICAL')
      expect(status.needsDeposit).toBe(true)
    })

    it('should emit escrow_warning event when WARNING', async () => {
      vi.mocked(mockWallet.queryEscrowBalance).mockResolvedValue('9000000')

      const warningListener = vi.fn()
      depositor.on('escrow_warning', warningListener)

      await depositor.getEscrowStatus()

      expect(warningListener).toHaveBeenCalledWith(
        expect.objectContaining({
          daysRemaining: expect.closeTo(6.0, 1),
          escrowBalance: 9.0,
          message: expect.stringContaining('⚠️'),
        })
      )
    })

    it('should emit escrow_critical event when CRITICAL', async () => {
      vi.mocked(mockWallet.queryEscrowBalance).mockResolvedValue('3000000')

      const criticalListener = vi.fn()
      depositor.on('escrow_critical', criticalListener)

      await depositor.getEscrowStatus()

      expect(criticalListener).toHaveBeenCalledWith(
        expect.objectContaining({
          daysRemaining: expect.closeTo(2.0, 1),
          escrowBalance: 3.0,
          message: expect.stringContaining('🚨 CRITICAL'),
        })
      )
    })

    it('should return safe default if escrow query fails', async () => {
      vi.mocked(mockWallet.queryEscrowBalance).mockRejectedValue(new Error('RPC failed'))

      const status = await depositor.getEscrowStatus()

      expect(status.escrowBalanceAkt).toBe(0)
      expect(status.daysRemaining).toBe(0)
      expect(status.warningLevel).toBe('CRITICAL')
      expect(status.needsDeposit).toBe(true)
    })
  })

  describe('start and stop', () => {
    it('should run initial check on start', async () => {
      const checkSpy = vi.spyOn(depositor, 'checkAndDeposit')

      depositor.start()

      // Wait for initial check
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(checkSpy).toHaveBeenCalled()
    })

    it('should not run if already started', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      depositor.start()
      depositor.start() // Second start

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already running'))

      warnSpy.mockRestore()
    })

    it('should stop without errors', () => {
      depositor.start()
      depositor.stop()

      // No error should be thrown
      expect(true).toBe(true)
    })

    it('should stop gracefully if not started', () => {
      depositor.stop() // Stop without starting

      // No error should be thrown
      expect(true).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('should handle zero escrow balance', async () => {
      vi.mocked(mockWallet.queryEscrowBalance).mockResolvedValue('0')

      const status = await depositor.getEscrowStatus()

      expect(status.escrowBalanceAkt).toBe(0)
      expect(status.daysRemaining).toBe(0)
      expect(status.warningLevel).toBe('CRITICAL')
    })

    it('should handle wallet with no AKT balance', async () => {
      vi.mocked(mockWallet.getBalance).mockResolvedValue([])

      const result = await depositor.checkAndDeposit()

      expect(result.deposited).toBe(false)
      expect(result.reason).toBe('insufficient-wallet')
    })

    it('should handle wallet with only non-AKT tokens', async () => {
      vi.mocked(mockWallet.getBalance).mockResolvedValue([
        { amount: '1000000', denom: 'uusdc' },
      ])

      const result = await depositor.checkAndDeposit()

      expect(result.deposited).toBe(false)
      expect(result.reason).toBe('insufficient-wallet')
    })
  })
})
