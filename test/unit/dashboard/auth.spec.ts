import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { NextFunction, Request, Response } from 'express'

/**
 * Unit tests for dashboard authentication middleware
 *
 * Tests HTTP Basic Auth validation:
 * - Valid credentials → allow request
 * - Invalid credentials → 401 Unauthorized
 * - Missing Authorization header → 401 Unauthorized
 * - Missing DASHBOARD_PASSWORD env var → 500 error
 */

describe('Dashboard Authentication Middleware', () => {
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>
  let mockNext: NextFunction
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env }

    // Create mock request
    mockRequest = {
      headers: {},
    }

    // Create mock response with chainable methods
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    }

    // Create mock next function
    mockNext = vi.fn()
  })

  afterEach(() => {
    // Restore original env
    process.env = originalEnv
    vi.clearAllMocks()
  })

  it('should allow request with valid credentials', async () => {
    // Set up environment
    process.env.DASHBOARD_USERNAME = 'testuser'
    process.env.DASHBOARD_PASSWORD = 'testpass'

    // Create valid Basic Auth header
    const credentials = Buffer.from('testuser:testpass').toString('base64')
    mockRequest.headers = {
      authorization: `Basic ${credentials}`,
    }

    // Import module fresh to get updated env
    const { dashboardAuth } = await import('../../../src/dashboard/middleware/auth')

    // Execute middleware
    await dashboardAuth(mockRequest as Request, mockResponse as Response, mockNext)

    // Should call next() without errors
    expect(mockNext).toHaveBeenCalledOnce()
    expect(mockResponse.status).not.toHaveBeenCalled()
    expect(mockResponse.send).not.toHaveBeenCalled()
  })

  it('should reject request with invalid username', async () => {
    process.env.DASHBOARD_USERNAME = 'admin'
    process.env.DASHBOARD_PASSWORD = 'secret'

    const credentials = Buffer.from('wronguser:secret').toString('base64')
    mockRequest.headers = {
      authorization: `Basic ${credentials}`,
    }

    const { dashboardAuth } = await import('../../../src/dashboard/middleware/auth')

    await dashboardAuth(mockRequest as Request, mockResponse as Response, mockNext)

    expect(mockResponse.status).toHaveBeenCalledWith(401)
    expect(mockResponse.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Basic realm="Dashboard"')
    expect(mockResponse.send).toHaveBeenCalledWith('Unauthorized')
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('should reject request with invalid password', async () => {
    process.env.DASHBOARD_USERNAME = 'admin'
    process.env.DASHBOARD_PASSWORD = 'secret'

    const credentials = Buffer.from('admin:wrongpass').toString('base64')
    mockRequest.headers = {
      authorization: `Basic ${credentials}`,
    }

    const { dashboardAuth } = await import('../../../src/dashboard/middleware/auth')

    await dashboardAuth(mockRequest as Request, mockResponse as Response, mockNext)

    expect(mockResponse.status).toHaveBeenCalledWith(401)
    expect(mockResponse.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Basic realm="Dashboard"')
    expect(mockResponse.send).toHaveBeenCalledWith('Unauthorized')
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('should reject request with missing auth header', async () => {
    process.env.DASHBOARD_PASSWORD = 'secret'

    mockRequest.headers = {} // No authorization header

    const { dashboardAuth } = await import('../../../src/dashboard/middleware/auth')

    await dashboardAuth(mockRequest as Request, mockResponse as Response, mockNext)

    expect(mockResponse.status).toHaveBeenCalledWith(401)
    expect(mockResponse.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Basic realm="Dashboard"')
    expect(mockResponse.send).toHaveBeenCalledWith('Unauthorized')
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('should reject request with malformed auth header', async () => {
    process.env.DASHBOARD_PASSWORD = 'secret'

    mockRequest.headers = {
      authorization: 'Bearer sometoken', // Not Basic auth
    }

    const { dashboardAuth } = await import('../../../src/dashboard/middleware/auth')

    await dashboardAuth(mockRequest as Request, mockResponse as Response, mockNext)

    expect(mockResponse.status).toHaveBeenCalledWith(401)
    expect(mockResponse.setHeader).toHaveBeenCalledWith('WWW-Authenticate', 'Basic realm="Dashboard"')
    expect(mockResponse.send).toHaveBeenCalledWith('Unauthorized')
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('should return 500 when DASHBOARD_PASSWORD not set', async () => {
    delete process.env.DASHBOARD_PASSWORD

    const credentials = Buffer.from('admin:anypass').toString('base64')
    mockRequest.headers = {
      authorization: `Basic ${credentials}`,
    }

    const { dashboardAuth } = await import('../../../src/dashboard/middleware/auth')

    await dashboardAuth(mockRequest as Request, mockResponse as Response, mockNext)

    expect(mockResponse.status).toHaveBeenCalledWith(500)
    expect(mockResponse.send).toHaveBeenCalledWith('Dashboard authentication not configured')
    expect(mockNext).not.toHaveBeenCalled()
  })

  it('should use default username "admin" when DASHBOARD_USERNAME not set', async () => {
    delete process.env.DASHBOARD_USERNAME
    process.env.DASHBOARD_PASSWORD = 'secret'

    const credentials = Buffer.from('admin:secret').toString('base64')
    mockRequest.headers = {
      authorization: `Basic ${credentials}`,
    }

    const { dashboardAuth } = await import('../../../src/dashboard/middleware/auth')

    await dashboardAuth(mockRequest as Request, mockResponse as Response, mockNext)

    expect(mockNext).toHaveBeenCalledOnce()
    expect(mockResponse.status).not.toHaveBeenCalled()
  })
})
