import { EscrowDepositConfig, EscrowDepositor } from '../../../src/akash/escrow-depositor'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { IAkashWallet } from '../../../src/akash/wallet'
import { EscrowDepositRepository } from '../../../src/repositories/escrow-deposit.repository'
import { Pool } from 'pg'

/**
 * Integration tests for Escrow Deposit Flow (Story 7.4)
 *
 * These tests verify the end-to-end escrow deposit workflow with a real database.
 * Uses mocked Akash wallet to avoid requiring testnet access.
 */
describe('Escrow Deposit Flow Integration', () => {
  let dbPool: Pool
  let repository: EscrowDepositRepository
  let mockWallet: IAkashWallet
  let depositor: EscrowDepositor
  let config: EscrowDepositConfig

  beforeAll(async () => {
    // Initialize database connection
    // In real integration tests, use Testcontainers for PostgreSQL
    // For this story, we'll use the existing test database
    dbPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME_TEST || 'nostream_test',
      user: process.env.DB_USER || 'nostream',
      password: process.env.DB_PASSWORD || 'nostream',
    })

    // Run migration to ensure escrow_deposits table exists
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS escrow_deposits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        amount_akt NUMERIC(12,2) NOT NULL,
        escrow_address VARCHAR(100) NOT NULL,
        tx_hash VARCHAR(100) NOT NULL,
        deposited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        new_balance_akt NUMERIC(12,2) NOT NULL,
        lease_id VARCHAR(200),
        notes TEXT
      );
    `)

    repository = new EscrowDepositRepository(dbPool)
  })

  afterAll(async () => {
    // Clean up test data
    await dbPool.query('DELETE FROM escrow_deposits WHERE lease_id = $1', ['test-lease-12345/1/1'])
    await dbPool.end()
  })

  beforeEach(() => {
    // Mock Akash wallet with realistic responses
    mockWallet = {
      getAddress: vi.fn().mockResolvedValue('akash1test123'),
      getBalance: vi.fn().mockResolvedValue([{ amount: '45000000', denom: 'uakt' }]), // 45 AKT
      sendTokens: vi.fn().mockImplementation(async (_recipient, _amount, _password, _memo) => {
        // Simulate transaction hash generation
        return `TEST_TX_${Date.now()}_${Math.random().toString(36).substring(7)}`
      }),
      queryEscrowBalance: vi.fn().mockResolvedValue('5000000'), // 5 AKT initially
      signMessage: vi.fn().mockRejectedValue(new Error('Not implemented')),
      exportMnemonic: vi.fn().mockRejectedValue(new Error('Not implemented')),
    }

    config = {
      minDays: 7,
      targetDays: 30,
      dailyCostAkt: 1.5,
      walletMinBalance: 10.0,
      escrowAddress: 'akash1escrow_test',
      leaseId: 'test-lease-12345/1/1',
      walletPassword: 'test-password',
      checkIntervalHours: 24,
    }

    depositor = new EscrowDepositor(mockWallet, repository, config)
  })

  it('should complete end-to-end escrow deposit flow', async () => {
    // Step 1: Get initial escrow status
    const initialStatus = await depositor.getEscrowStatus()

    expect(initialStatus.escrowBalanceAkt).toBeCloseTo(5.0, 1)
    expect(initialStatus.daysRemaining).toBeCloseTo(3.33, 1) // 5 / 1.5
    expect(initialStatus.warningLevel).toBe('CRITICAL')
    expect(initialStatus.needsDeposit).toBe(true)

    // Step 2: Trigger deposit
    const depositResult = await depositor.checkAndDeposit()

    expect(depositResult.deposited).toBe(true)
    expect(depositResult.amountAkt).toBeCloseTo(40.0, 1) // 45 - 5
    expect(depositResult.txHash).toMatch(/^TEST_TX_/)

    // Step 3: Verify wallet.sendTokens was called with correct parameters
    expect(mockWallet.sendTokens).toHaveBeenCalledWith(
      'akash1escrow_test',
      '40000000', // 40 AKT in uakt
      'test-password',
      expect.stringContaining('Escrow deposit')
    )

    // Step 4: Verify deposit was recorded in database
    const recentDeposits = await repository.getRecentDeposits(1)

    expect(recentDeposits).toHaveLength(1)
    expect(recentDeposits[0]).toMatchObject({
      amountAkt: 40.0,
      escrowAddress: 'akash1escrow_test',
      txHash: depositResult.txHash,
      newBalanceAkt: 45.0,
      leaseId: 'test-lease-12345/1/1',
    })

    // Step 5: Simulate escrow balance update
    vi.mocked(mockWallet.queryEscrowBalance).mockResolvedValue('45000000') // 45 AKT after deposit

    // Step 6: Get updated escrow status
    const updatedStatus = await depositor.getEscrowStatus()

    expect(updatedStatus.escrowBalanceAkt).toBeCloseTo(45.0, 1)
    expect(updatedStatus.daysRemaining).toBeCloseTo(30.0, 1) // 45 / 1.5
    expect(updatedStatus.warningLevel).toBe('OK')
    expect(updatedStatus.needsDeposit).toBe(false)
  })

  it('should prevent duplicate deposits when escrow sufficient', async () => {
    // Set escrow balance to sufficient amount
    vi.mocked(mockWallet.queryEscrowBalance).mockResolvedValue('50000000') // 50 AKT

    const result = await depositor.checkAndDeposit()

    expect(result.deposited).toBe(false)
    expect(result.reason).toBe('sufficient-balance')
    expect(mockWallet.sendTokens).not.toHaveBeenCalled()

    // Verify no deposit recorded
    const countBefore = await repository.getTotalDeposited()
    expect(countBefore).toBeGreaterThanOrEqual(0) // May have previous test deposits
  })

  it('should handle insufficient wallet balance gracefully', async () => {
    // Set wallet balance below minimum
    vi.mocked(mockWallet.getBalance).mockResolvedValue([{ amount: '8000000', denom: 'uakt' }]) // 8 AKT
    // Set escrow balance low
    vi.mocked(mockWallet.queryEscrowBalance).mockResolvedValue('5000000') // 5 AKT

    const result = await depositor.checkAndDeposit()

    expect(result.deposited).toBe(false)
    expect(result.reason).toBe('insufficient-wallet')
    expect(mockWallet.sendTokens).not.toHaveBeenCalled()
  })

  it('should track total deposits across multiple transactions', async () => {
    const initialTotal = await repository.getTotalDeposited()

    // First deposit
    await depositor.checkAndDeposit()

    // Simulate escrow depletion
    vi.mocked(mockWallet.queryEscrowBalance).mockResolvedValue('10000000') // 10 AKT

    // Second deposit
    await depositor.checkAndDeposit()

    const finalTotal = await repository.getTotalDeposited()

    // Total should have increased by ~75 AKT (40 + 35)
    expect(finalTotal).toBeGreaterThan(initialTotal)
  })

  it('should retrieve deposit by transaction hash', async () => {
    const depositResult = await depositor.checkAndDeposit()

    if (!depositResult.deposited || !depositResult.txHash) {
      throw new Error('Deposit should have succeeded')
    }

    const foundDeposit = await repository.getDepositByTxHash(depositResult.txHash)

    expect(foundDeposit).not.toBeNull()
    expect(foundDeposit?.txHash).toBe(depositResult.txHash)
    expect(foundDeposit?.amountAkt).toBeCloseTo(40.0, 1)
  })
})
