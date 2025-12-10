import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMasterDbClient } from '../../src/database/client'
import { getEscrowDepositor } from '../../src/factories/economic-monitor-factory'
import { EconomicSnapshotRepository } from '../../src/repositories/economic-snapshot.repository'
import economicsRouter from '../../src/dashboard/routes/economics'
import express from 'express'
import request from 'supertest'

/**
 * Unit tests for Economics Dashboard API (Story 7.5)
 */

vi.mock('../../src/database/client')
vi.mock('../../src/factories/economic-monitor-factory')

describe('Economics Dashboard API', () => {
  let app: express.Application
  let mockRepository: EconomicSnapshotRepository
  let mockDepositor: any

  beforeEach(() => {
    // Create Express app with economics router
    app = express()
    app.use(express.json())
    app.use('/dashboard', economicsRouter)

    // Mock database client
    const mockPool = {
      query: vi.fn(),
    }
    vi.mocked(getMasterDbClient).mockReturnValue({
      client: { pool: mockPool },
    } as any)

    // Mock repository
    mockRepository = {
      getLatestSnapshot: vi.fn(),
      getDailySnapshots: vi.fn(),
      getSnapshotsByDateRange: vi.fn(),
      createSnapshot: vi.fn(),
    } as unknown as EconomicSnapshotRepository

    // Mock escrow depositor
    mockDepositor = {
      getEscrowStatus: vi.fn().mockResolvedValue({
        escrowBalanceAkt: 45.0,
        daysRemaining: 30.0,
        warningLevel: 'OK',
        needsDeposit: false,
      }),
    }
    vi.mocked(getEscrowDepositor).mockReturnValue(mockDepositor)

    // Mock repository to be returned by getMasterDbClient
    vi.spyOn(EconomicSnapshotRepository.prototype, 'getLatestSnapshot').mockImplementation(
      mockRepository.getLatestSnapshot
    )
    vi.spyOn(EconomicSnapshotRepository.prototype, 'getDailySnapshots').mockImplementation(
      mockRepository.getDailySnapshots
    )
    vi.spyOn(EconomicSnapshotRepository.prototype, 'getSnapshotsByDateRange').mockImplementation(
      mockRepository.getSnapshotsByDateRange
    )
  })

  describe('GET /economics', () => {
    it('should return economics metrics with profitable status', async () => {
      const now = new Date()

      // Mock snapshots data
      vi.mocked(mockRepository.getLatestSnapshot).mockResolvedValue({
        timestamp: now,
        revenueUsd: 5.5,
        subscriptionRevenueUsd: 4.0,
        routingRevenueUsd: 1.0,
        contentRevenueUsd: 0.5,
        expensesUsd: 0.22,
        akashCostUsd: 0.17,
        gasFeeUsd: 0.05,
        netProfitUsd: 5.28,
        ethBalance: BigInt('5000000000000000000'), // 5 ETH
        usdcBalance: BigInt('1000000000'), // 1000 USDC
        aktBalance: BigInt('50000000'), // 50 AKT
      })

      vi.mocked(mockRepository.getDailySnapshots).mockResolvedValue([
        {
          timestamp: now,
          revenueUsd: 5.5,
          subscriptionRevenueUsd: 4.0,
          routingRevenueUsd: 1.0,
          contentRevenueUsd: 0.5,
          expensesUsd: 0.22,
          akashCostUsd: 0.17,
          gasFeeUsd: 0.05,
          netProfitUsd: 5.28,
          ethBalance: BigInt('5000000000000000000'),
          usdcBalance: BigInt('1000000000'),
          aktBalance: BigInt('50000000'),
        },
      ])

      vi.mocked(mockRepository.getSnapshotsByDateRange).mockResolvedValue([
        {
          timestamp: now,
          revenueUsd: 450.0,
          subscriptionRevenueUsd: 350.0,
          routingRevenueUsd: 80.0,
          contentRevenueUsd: 20.0,
          expensesUsd: 18.5,
          akashCostUsd: 15.0,
          gasFeeUsd: 3.5,
          netProfitUsd: 431.5,
          ethBalance: BigInt('5000000000000000000'),
          usdcBalance: BigInt('1000000000'),
          aktBalance: BigInt('50000000'),
        },
      ])

      const response = await request(app)
        .get('/dashboard/economics')
        .auth('admin', 'testpassword')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        status: 'profitable',
        today: {
          revenue_usd: 5.5,
          expenses_usd: 0.22,
          profit_usd: 5.28,
        },
        this_month: {
          revenue_usd: 5.5,
          expenses_usd: 0.22,
          profit_usd: 5.28,
          profitability_percentage: expect.any(Number),
        },
        all_time: {
          total_revenue_usd: 450.0,
          total_expenses_usd: 18.5,
          net_profit_usd: 431.5,
        },
        revenue_breakdown: {
          subscriptions_usd: 4.0,
          routing_usd: 1.0,
          content_usd: 0.5,
        },
        expense_breakdown: {
          akash_cost_usd: 0.17,
          gas_fees_usd: 0.05,
          other_usd: expect.any(Number),
        },
        balances: {
          eth_balance: '5000000000000000000',
          usdc_balance: '1000000000',
          akt_wallet_balance: '50000000',
          akt_escrow_balance: '45000000',
          days_hosting_remaining: 30.0,
        },
      })
    })

    it('should return losing-money status when net profit is negative', async () => {
      const now = new Date()

      vi.mocked(mockRepository.getLatestSnapshot).mockResolvedValue({
        timestamp: now,
        revenueUsd: 0,
        subscriptionRevenueUsd: 0,
        routingRevenueUsd: 0,
        contentRevenueUsd: 0,
        expensesUsd: 0,
        akashCostUsd: 0,
        gasFeeUsd: 0,
        netProfitUsd: 0,
        ethBalance: BigInt('0'),
        usdcBalance: BigInt('0'),
        aktBalance: BigInt('0'),
      })

      vi.mocked(mockRepository.getDailySnapshots).mockResolvedValue([])

      vi.mocked(mockRepository.getSnapshotsByDateRange).mockResolvedValue([
        {
          timestamp: now,
          revenueUsd: 10.0,
          subscriptionRevenueUsd: 10.0,
          routingRevenueUsd: 0,
          contentRevenueUsd: 0,
          expensesUsd: 15.0,
          akashCostUsd: 15.0,
          gasFeeUsd: 0,
          netProfitUsd: -5.0,
          ethBalance: BigInt('0'),
          usdcBalance: BigInt('0'),
          aktBalance: BigInt('0'),
        },
      ])

      const response = await request(app)
        .get('/dashboard/economics')
        .auth('admin', 'testpassword')

      expect(response.status).toBe(200)
      expect(response.body.status).toBe('losing-money')
      expect(response.body.all_time.net_profit_usd).toBe(-5.0)
    })

    it('should return break-even status when net profit is between -1 and 0', async () => {
      const now = new Date()

      vi.mocked(mockRepository.getLatestSnapshot).mockResolvedValue(null)
      vi.mocked(mockRepository.getDailySnapshots).mockResolvedValue([])
      vi.mocked(mockRepository.getSnapshotsByDateRange).mockResolvedValue([
        {
          timestamp: now,
          revenueUsd: 10.0,
          subscriptionRevenueUsd: 10.0,
          routingRevenueUsd: 0,
          contentRevenueUsd: 0,
          expensesUsd: 10.5,
          akashCostUsd: 10.5,
          gasFeeUsd: 0,
          netProfitUsd: -0.5,
          ethBalance: BigInt('0'),
          usdcBalance: BigInt('0'),
          aktBalance: BigInt('0'),
        },
      ])

      const response = await request(app)
        .get('/dashboard/economics')
        .auth('admin', 'testpassword')

      expect(response.status).toBe(200)
      expect(response.body.status).toBe('break-even')
    })

    it('should require authentication', async () => {
      const response = await request(app).get('/dashboard/economics')

      expect(response.status).toBe(401)
    })
  })

  describe('GET /economics/snapshots', () => {
    it('should return snapshots for date range', async () => {
      const now = new Date()
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      const mockSnapshots = [
        {
          timestamp: now,
          revenueUsd: 5.5,
          subscriptionRevenueUsd: 4.0,
          routingRevenueUsd: 1.0,
          contentRevenueUsd: 0.5,
          expensesUsd: 0.22,
          akashCostUsd: 0.17,
          gasFeeUsd: 0.05,
          netProfitUsd: 5.28,
          ethBalance: BigInt('5000000000000000000'),
          usdcBalance: BigInt('1000000000'),
          aktBalance: BigInt('50000000'),
        },
      ]

      vi.mocked(mockRepository.getSnapshotsByDateRange).mockResolvedValue(mockSnapshots)

      const response = await request(app)
        .get('/dashboard/economics/snapshots')
        .query({
          startDate: startDate.toISOString(),
          endDate: now.toISOString(),
        })
        .auth('admin', 'testpassword')

      expect(response.status).toBe(200)
      expect(response.body).toHaveLength(1)
      expect(response.body[0]).toMatchObject({
        revenue_usd: 5.5,
        expenses_usd: 0.22,
        net_profit_usd: 5.28,
        eth_balance: '5000000000000000000',
      })
    })

    it('should validate date range', async () => {
      const response = await request(app)
        .get('/dashboard/economics/snapshots')
        .query({
          startDate: 'invalid-date',
          endDate: 'invalid-date',
        })
        .auth('admin', 'testpassword')

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('Invalid date range')
    })
  })

  describe('GET /economics/export.csv', () => {
    it('should export snapshots as CSV', async () => {
      const now = new Date()
      const mockSnapshots = [
        {
          timestamp: now,
          revenueUsd: 5.5,
          subscriptionRevenueUsd: 4.0,
          routingRevenueUsd: 1.0,
          contentRevenueUsd: 0.5,
          expensesUsd: 0.22,
          akashCostUsd: 0.17,
          gasFeeUsd: 0.05,
          netProfitUsd: 5.28,
          ethBalance: BigInt('5000000000000000000'),
          usdcBalance: BigInt('1000000000'),
          aktBalance: BigInt('50000000'),
        },
      ]

      vi.mocked(mockRepository.getSnapshotsByDateRange).mockResolvedValue(mockSnapshots)

      const response = await request(app)
        .get('/dashboard/economics/export.csv')
        .auth('admin', 'testpassword')

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('text/csv')
      expect(response.headers['content-disposition']).toContain('attachment')
      expect(response.text).toContain('timestamp,revenue_usd')
      expect(response.text).toContain('5.50')
      expect(response.text).toContain('0.22')
    })
  })
})
