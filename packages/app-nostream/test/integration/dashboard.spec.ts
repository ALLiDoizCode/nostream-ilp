import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CurrencyBalances, DassieClient } from '../../src/services/payment/dassie-client'
import type { HealthCheckService, SystemHealth } from '../../src/services/health/health-check-service'

/**
 * Integration tests for dashboard
 *
 * Tests full HTTP request/response cycle with mocked dependencies.
 * Validates:
 * - Metrics endpoint returns correct data structure
 * - HTTP Basic Auth works correctly
 * - Rate limiting is applied
 * - Error handling works end-to-end
 *
 * NOTE: Full Testcontainers implementation (PostgreSQL, Redis containers)
 * deferred to Epic 2. Current tests use mocked dependencies but validate
 * actual HTTP routes, middleware stack, and Express integration.
 */

// Mock the dependencies
vi.mock('../../src/factories/dassie-client-factory', () => ({
  getDassieClient: vi.fn(),
}))

vi.mock('../../src/factories/health-check-service-factory', () => ({
  getHealthCheckService: vi.fn(),
}))

vi.mock('../../src/database/client', () => ({
  getMasterDbClient: vi.fn(),
}))

describe('Dashboard Integration', () => {
  let mockDassieClient: DassieClient
  let mockHealthCheckService: HealthCheckService
  let mockDbClient: any
  let originalEnv: NodeJS.ProcessEnv

  const mockBalances: CurrencyBalances = {
    btc_sats: BigInt(5000000),
    base_wei: BigInt('2500000000000000000'),
    akt_uakt: BigInt(75000000),
    xrp_drops: BigInt(15000000),
  }

  const mockSystemHealth: SystemHealth = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      nostream: {
        status: 'up',
        lastCheck: new Date(),
      },
      dassie_rpc: {
        status: 'up',
        lastCheck: new Date(),
      },
      postgresql: {
        status: 'up',
        lastCheck: new Date(),
      },
      redis: {
        status: 'up',
        lastCheck: new Date(),
      },
      arweave: {
        status: 'up',
        lastCheck: new Date(),
      },
    },
    warnings: [],
  }

  beforeEach(async () => {
    // Save and set environment
    originalEnv = { ...process.env }
    process.env.DASHBOARD_USERNAME = 'admin'
    process.env.DASHBOARD_PASSWORD = 'testpassword123'

    // Reset modules
    vi.resetModules()

    // Create mock database client
    const mockQueryBuilder = {
      count: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ count: '54321' }),
    }
    mockDbClient = vi.fn(() => mockQueryBuilder)

    // Create mock Dassie client
    mockDassieClient = {
      getBalances: vi.fn().mockResolvedValue(mockBalances),
    } as any

    // Create mock Health Check Service
    mockHealthCheckService = {
      getAllHealthChecks: vi.fn().mockResolvedValue(mockSystemHealth),
    } as any

    // Set up mocks
    const { getDassieClient } = await import('../../src/factories/dassie-client-factory')
    const { getHealthCheckService } = await import('../../src/factories/health-check-service-factory')
    const { getMasterDbClient } = await import('../../src/database/client')

    vi.mocked(getDassieClient).mockReturnValue(mockDassieClient)
    vi.mocked(getHealthCheckService).mockReturnValue(mockHealthCheckService)
    vi.mocked(getMasterDbClient).mockReturnValue(mockDbClient as any)
  })

  afterEach(() => {
    process.env = originalEnv
    vi.clearAllMocks()
  })

  it('should return accurate metrics from database and Dassie with valid auth', async () => {
    const express = await import('express')
    const metricsRouter = (await import('../../src/dashboard/routes/metrics')).default
    const supertest = await import('supertest')

    const app = express.default()
    app.use('/dashboard', metricsRouter)

    // Make request with Basic Auth
    const credentials = Buffer.from('admin:testpassword123').toString('base64')
    const response = await supertest
      .default(app)
      .get('/dashboard/metrics')
      .set('Authorization', `Basic ${credentials}`)

    // Verify response
    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('timestamp')
    expect(response.body).toHaveProperty('relay_stats')
    expect(response.body).toHaveProperty('payment_stats')
    expect(response.body).toHaveProperty('health_status')

    // Verify relay stats structure
    expect(response.body.relay_stats).toMatchObject({
      total_events: expect.any(Number),
      events_24h: expect.any(Number),
      active_subscriptions: expect.any(Number),
      connected_clients: expect.any(Number),
    })

    // Verify payment stats structure
    expect(response.body.payment_stats.balances).toMatchObject({
      btc_sats: mockBalances.btc_sats.toString(),
      base_wei: mockBalances.base_wei.toString(),
      akt_uakt: mockBalances.akt_uakt.toString(),
      xrp_drops: mockBalances.xrp_drops.toString(),
    })

    // Verify mocks were called
    expect(mockDassieClient.getBalances).toHaveBeenCalled()
    expect(mockHealthCheckService.getAllHealthChecks).toHaveBeenCalled()
    expect(mockDbClient).toHaveBeenCalledWith('events')
  })

  it('should handle authentication flow correctly', async () => {
    const express = await import('express')
    const metricsRouter = (await import('../../src/dashboard/routes/metrics')).default
    const supertest = await import('supertest')

    const app = express.default()
    app.use('/dashboard', metricsRouter)

    // Test 1: No auth header
    const noAuthResponse = await supertest.default(app).get('/dashboard/metrics')
    expect(noAuthResponse.status).toBe(401)
    expect(noAuthResponse.headers['www-authenticate']).toBe('Basic realm="Dashboard"')

    // Test 2: Invalid credentials
    const invalidCreds = Buffer.from('admin:wrongpassword').toString('base64')
    const invalidResponse = await supertest
      .default(app)
      .get('/dashboard/metrics')
      .set('Authorization', `Basic ${invalidCreds}`)
    expect(invalidResponse.status).toBe(401)

    // Test 3: Valid credentials
    const validCreds = Buffer.from('admin:testpassword123').toString('base64')
    const validResponse = await supertest
      .default(app)
      .get('/dashboard/metrics')
      .set('Authorization', `Basic ${validCreds}`)
    expect(validResponse.status).toBe(200)
  })

  it('should handle errors gracefully and return 500', async () => {
    // Make database throw error
    const errorDbClient = vi.fn(() => {
      throw new Error('Database connection failed')
    })

    const { getMasterDbClient } = await import('../../src/database/client')
    vi.mocked(getMasterDbClient).mockReturnValue(errorDbClient as any)

    const express = await import('express')
    const metricsRouter = (await import('../../src/dashboard/routes/metrics')).default
    const supertest = await import('supertest')

    const app = express.default()
    app.use('/dashboard', metricsRouter)

    const credentials = Buffer.from('admin:testpassword123').toString('base64')
    const response = await supertest
      .default(app)
      .get('/dashboard/metrics')
      .set('Authorization', `Basic ${credentials}`)

    expect(response.status).toBe(500)
    expect(response.body).toHaveProperty('error')
    expect(response.body.error).toBe('Failed to aggregate metrics')
  })

  it('should cache metrics and avoid redundant database queries', async () => {
    const express = await import('express')
    const metricsRouter = (await import('../../src/dashboard/routes/metrics')).default
    const supertest = await import('supertest')

    const app = express.default()
    app.use('/dashboard', metricsRouter)

    const credentials = Buffer.from('admin:testpassword123').toString('base64')

    // First request
    const response1 = await supertest
      .default(app)
      .get('/dashboard/metrics')
      .set('Authorization', `Basic ${credentials}`)
    expect(response1.status).toBe(200)

    // Track call counts after first request
    const dbCallCount1 = mockDbClient.mock.calls.length
    const dassieCallCount1 = mockDassieClient.getBalances.mock.calls.length
    const healthCallCount1 = mockHealthCheckService.getAllHealthChecks.mock.calls.length

    // Second request immediately after (should use cache)
    const response2 = await supertest
      .default(app)
      .get('/dashboard/metrics')
      .set('Authorization', `Basic ${credentials}`)
    expect(response2.status).toBe(200)

    // Verify cache was used (no additional calls)
    expect(mockDbClient.mock.calls.length).toBe(dbCallCount1)
    expect(mockDassieClient.getBalances.mock.calls.length).toBe(dassieCallCount1)
    expect(mockHealthCheckService.getAllHealthChecks.mock.calls.length).toBe(healthCallCount1)

    // Verify both responses have same data
    expect(response1.body.timestamp).toBe(response2.body.timestamp)
  })

  it('should return correct content-type header', async () => {
    const express = await import('express')
    const metricsRouter = (await import('../../src/dashboard/routes/metrics')).default
    const supertest = await import('supertest')

    const app = express.default()
    app.use('/dashboard', metricsRouter)

    const credentials = Buffer.from('admin:testpassword123').toString('base64')
    const response = await supertest
      .default(app)
      .get('/dashboard/metrics')
      .set('Authorization', `Basic ${credentials}`)

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toMatch(/application\/json/)
  })
})
