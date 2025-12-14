import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurrencyBalances, DassieClient } from '../../../src/services/payment/dassie-client'
import type { HealthCheckService, SystemHealth } from '../../../src/services/health/health-check-service'

/**
 * Unit tests for dashboard metrics endpoint
 *
 * Tests:
 * - Mock DassieClient, HealthCheckService
 * - Test GET /dashboard/metrics returns correct structure
 * - Test caching (verify 5 second TTL)
 * - Test error handling
 */

// Mock the factories
vi.mock('../../../src/factories/dassie-client-factory', () => ({
  getDassieClient: vi.fn(),
}))

vi.mock('../../../src/factories/health-check-service-factory', () => ({
  getHealthCheckService: vi.fn(),
}))

vi.mock('../../../src/database/client', () => ({
  getMasterDbClient: vi.fn(),
}))

// Mock auth middleware to bypass auth in tests
vi.mock('../../../src/dashboard/middleware/auth', () => ({
  dashboardAuth: vi.fn((_req, _res, next) => next()),
}))

describe('Dashboard Metrics API', () => {
  let mockDassieClient: DassieClient
  let mockHealthCheckService: HealthCheckService
  let mockDbClient: any

  const mockBalances: CurrencyBalances = {
    btc_sats: BigInt(1000000),
    base_wei: BigInt('5000000000000000000'),
    akt_uakt: BigInt(50000000),
    xrp_drops: BigInt(10000000),
  }

  const mockSystemHealth: SystemHealth = {
    status: 'healthy',
    timestamp: '2025-11-25T12:00:00Z',
    services: {
      nostream: {
        status: 'up',
        lastCheck: new Date('2025-11-25T12:00:00Z'),
      },
      dassie_rpc: {
        status: 'up',
        lastCheck: new Date('2025-11-25T12:00:00Z'),
      },
      postgresql: {
        status: 'up',
        lastCheck: new Date('2025-11-25T12:00:00Z'),
      },
      redis: {
        status: 'up',
        lastCheck: new Date('2025-11-25T12:00:00Z'),
      },
      arweave: {
        status: 'up',
        lastCheck: new Date('2025-11-25T12:00:00Z'),
      },
    },
    warnings: [],
  }

  // Expected health status after JSON serialization (dates become strings)
  const expectedHealthStatusInResponse = {
    status: 'healthy',
    timestamp: '2025-11-25T12:00:00Z',
    services: {
      nostream: {
        status: 'up',
        lastCheck: '2025-11-25T12:00:00.000Z',
      },
      dassie_rpc: {
        status: 'up',
        lastCheck: '2025-11-25T12:00:00.000Z',
      },
      postgresql: {
        status: 'up',
        lastCheck: '2025-11-25T12:00:00.000Z',
      },
      redis: {
        status: 'up',
        lastCheck: '2025-11-25T12:00:00.000Z',
      },
      arweave: {
        status: 'up',
        lastCheck: '2025-11-25T12:00:00.000Z',
      },
    },
    warnings: [],
  }

  beforeEach(async () => {
    // Reset modules to clear cache
    vi.resetModules()

    // Create mock database client with Knex-like query builder
    const mockQueryBuilder = {
      count: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ count: '12345' }), // Mock total events count
    }

    mockDbClient = vi.fn(() => mockQueryBuilder)
    mockDbClient.count = mockQueryBuilder.count
    mockDbClient.where = mockQueryBuilder.where
    mockDbClient.first = mockQueryBuilder.first

    // Create mock Dassie client
    mockDassieClient = {
      getBalances: vi.fn().mockResolvedValue(mockBalances),
    } as any

    // Create mock Health Check Service
    mockHealthCheckService = {
      getAllHealthChecks: vi.fn().mockResolvedValue(mockSystemHealth),
    } as any

    // Set up factory mocks
    const { getDassieClient } = await import('../../../src/factories/dassie-client-factory')
    const { getHealthCheckService } = await import('../../../src/factories/health-check-service-factory')
    const { getMasterDbClient } = await import('../../../src/database/client')

    vi.mocked(getDassieClient).mockReturnValue(mockDassieClient)
    vi.mocked(getHealthCheckService).mockReturnValue(mockHealthCheckService)
    vi.mocked(getMasterDbClient).mockReturnValue(mockDbClient as any)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should return metrics with correct structure', async () => {
    const express = await import('express')
    const metricsRouter = (await import('../../../src/dashboard/routes/metrics')).default

    const app = express.default()
    app.use('/dashboard', metricsRouter)

    // Make request using supertest-like approach
    const request = await import('supertest')
    const response = await request.default(app).get('/dashboard/metrics')

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      timestamp: expect.any(String),
      relay_stats: {
        total_events: expect.any(Number),
        events_24h: expect.any(Number),
        active_subscriptions: expect.any(Number),
        connected_clients: expect.any(Number),
      },
      payment_stats: {
        balances: {
          btc_sats: mockBalances.btc_sats.toString(),
          base_wei: mockBalances.base_wei.toString(),
          akt_uakt: mockBalances.akt_uakt.toString(),
          xrp_drops: mockBalances.xrp_drops.toString(),
        },
      },
      health_status: expectedHealthStatusInResponse,
    })

    // Verify mocks were called
    expect(mockDassieClient.getBalances).toHaveBeenCalledOnce()
    expect(mockHealthCheckService.getAllHealthChecks).toHaveBeenCalledOnce()
  })

  it('should cache metrics for 5 seconds', async () => {
    const express = await import('express')
    const metricsRouter = (await import('../../../src/dashboard/routes/metrics')).default

    const app = express.default()
    app.use('/dashboard', metricsRouter)

    const request = await import('supertest')

    // First request
    const response1 = await request.default(app).get('/dashboard/metrics')
    expect(response1.status).toBe(200)

    // Second request immediately after (should use cache)
    const response2 = await request.default(app).get('/dashboard/metrics')
    expect(response2.status).toBe(200)

    // Should have only called the mocks once due to caching
    expect(mockDassieClient.getBalances).toHaveBeenCalledOnce()
    expect(mockHealthCheckService.getAllHealthChecks).toHaveBeenCalledOnce()

    // Both responses should have the same data
    expect(response1.body).toEqual(response2.body)
  })

  it('should handle Dassie client errors gracefully', async () => {
    // Make Dassie client throw error
    mockDassieClient.getBalances = vi.fn().mockRejectedValue(new Error('Dassie connection lost'))

    const express = await import('express')
    const metricsRouter = (await import('../../../src/dashboard/routes/metrics')).default

    const app = express.default()
    app.use('/dashboard', metricsRouter)

    const request = await import('supertest')
    const response = await request.default(app).get('/dashboard/metrics')

    expect(response.status).toBe(500)
    expect(response.body).toMatchObject({
      error: 'Failed to aggregate metrics',
      message: expect.stringContaining('Dassie connection lost'),
    })
  })

  it('should handle health check service errors gracefully', async () => {
    // Make health check service throw error
    mockHealthCheckService.getAllHealthChecks = vi
      .fn()
      .mockRejectedValue(new Error('Health check failed'))

    const express = await import('express')
    const metricsRouter = (await import('../../../src/dashboard/routes/metrics')).default

    const app = express.default()
    app.use('/dashboard', metricsRouter)

    const request = await import('supertest')
    const response = await request.default(app).get('/dashboard/metrics')

    expect(response.status).toBe(500)
    expect(response.body).toMatchObject({
      error: 'Failed to aggregate metrics',
      message: expect.stringContaining('Health check failed'),
    })
  })

  it('should return ISO 8601 timestamp', async () => {
    const express = await import('express')
    const metricsRouter = (await import('../../../src/dashboard/routes/metrics')).default

    const app = express.default()
    app.use('/dashboard', metricsRouter)

    const request = await import('supertest')
    const response = await request.default(app).get('/dashboard/metrics')

    expect(response.status).toBe(200)

    // Verify timestamp is valid ISO 8601
    const timestamp = response.body.timestamp
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

    // Verify it can be parsed as a date
    const date = new Date(timestamp)
    expect(date.getTime()).toBeGreaterThan(0)
  })
})
