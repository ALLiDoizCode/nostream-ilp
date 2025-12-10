import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DassieClient } from '../../../../src/services/payment/dassie-client'
import type { Knex } from 'knex'

describe('HealthCheckService', () => {
  let mockDassieClient: DassieClient
  let mockDatabase: Knex
  let mockRedis: any
  let mockArweaveWallet: any
  let mockLogger: any

  beforeEach(() => {
    // Create mock logger
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }

    // Create mock Dassie client
    mockDassieClient = {
      getConnectionState: vi.fn(),
      isConnected: vi.fn(),
      on: vi.fn(),
    } as any

    // Create mock database
    mockDatabase = {
      raw: vi.fn().mockReturnValue({
        timeout: vi.fn().mockResolvedValue([{ result: 1 }]),
      }),
    } as any

    // Create mock Redis client
    mockRedis = {
      ping: vi.fn((callback: (err: Error | null, result: string) => void) => {
        callback(null, 'PONG')
      }),
    }

    // Create mock Arweave wallet (optional)
    mockArweaveWallet = {
      getBalance: vi.fn().mockResolvedValue('10000000000'),
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('checkDassieConnection', () => {
    it('should return "up" when connection state is CONNECTED', async () => {
      const { HealthCheckService } = await import('../../../../src/services/health/health-check-service')

      vi.mocked(mockDassieClient.getConnectionState).mockReturnValue('CONNECTED')

      const service = new HealthCheckService(
        mockDassieClient,
        mockDatabase,
        mockRedis,
        mockArweaveWallet,
        mockLogger
      )

      const status = await service.checkDassieConnection()

      expect(status.status).toBe('up')
      expect(status.lastCheck).toBeInstanceOf(Date)
      expect(status.message).toBeUndefined()
    })

    it('should return "degraded" when connection state is CONNECTING', async () => {
      const { HealthCheckService } = await import('../../../../src/services/health/health-check-service')

      vi.mocked(mockDassieClient.getConnectionState).mockReturnValue('CONNECTING')

      const service = new HealthCheckService(
        mockDassieClient,
        mockDatabase,
        mockRedis,
        mockArweaveWallet,
        mockLogger
      )

      const status = await service.checkDassieConnection()

      expect(status.status).toBe('degraded')
      expect(status.message).toBe('Dassie RPC connecting')
    })

    it('should return "degraded" when connection state is RECONNECTING', async () => {
      const { HealthCheckService } = await import('../../../../src/services/health/health-check-service')

      vi.mocked(mockDassieClient.getConnectionState).mockReturnValue('RECONNECTING')

      const service = new HealthCheckService(
        mockDassieClient,
        mockDatabase,
        mockRedis,
        mockArweaveWallet,
        mockLogger
      )

      const status = await service.checkDassieConnection()

      expect(status.status).toBe('degraded')
      expect(status.message).toBe('Dassie RPC reconnecting')
    })

    it('should return "down" when connection state is DISCONNECTED', async () => {
      const { HealthCheckService } = await import('../../../../src/services/health/health-check-service')

      vi.mocked(mockDassieClient.getConnectionState).mockReturnValue('DISCONNECTED')

      const service = new HealthCheckService(
        mockDassieClient,
        mockDatabase,
        mockRedis,
        mockArweaveWallet,
        mockLogger
      )

      const status = await service.checkDassieConnection()

      expect(status.status).toBe('down')
      expect(status.message).toBe('Dassie RPC disconnected')
    })

    it('should return "down" and log error when getConnectionState throws', async () => {
      const { HealthCheckService } = await import('../../../../src/services/health/health-check-service')

      const error = new Error('Connection check failed')
      vi.mocked(mockDassieClient.getConnectionState).mockImplementation(() => {
        throw error
      })

      const service = new HealthCheckService(
        mockDassieClient,
        mockDatabase,
        mockRedis,
        mockArweaveWallet,
        mockLogger
      )

      const status = await service.checkDassieConnection()

      expect(status.status).toBe('down')
      expect(status.message).toBe('Connection check failed')
      expect(mockLogger.error).toHaveBeenCalledWith(
        { error },
        'Failed to check Dassie connection state'
      )
    })
  })

  describe('checkPostgreSQL', () => {
    it('should return "up" when database query succeeds', async () => {
      const { HealthCheckService } = await import('../../../../src/services/health/health-check-service')

      vi.mocked(mockDassieClient.getConnectionState).mockReturnValue('CONNECTED')

      const service = new HealthCheckService(
        mockDassieClient,
        mockDatabase,
        mockRedis,
        mockArweaveWallet,
        mockLogger
      )

      const status = await service.checkPostgreSQL()

      expect(status.status).toBe('up')
      expect(status.responseTimeMs).toBeGreaterThanOrEqual(0)
      expect(mockDatabase.raw).toHaveBeenCalledWith('SELECT 1')
    })

    it('should return "down" when database query fails', async () => {
      const { HealthCheckService } = await import('../../../../src/services/health/health-check-service')

      const error = new Error('Database connection failed')
      mockDatabase.raw = vi.fn().mockReturnValue({
        timeout: vi.fn().mockRejectedValue(error),
      })

      vi.mocked(mockDassieClient.getConnectionState).mockReturnValue('CONNECTED')

      const service = new HealthCheckService(
        mockDassieClient,
        mockDatabase,
        mockRedis,
        mockArweaveWallet,
        mockLogger
      )

      const status = await service.checkPostgreSQL()

      expect(status.status).toBe('down')
      expect(status.message).toBe('Database connection failed')
      expect(mockLogger.error).toHaveBeenCalled()
    })
  })

  describe('checkRedis', () => {
    it('should return "up" when Redis ping succeeds', async () => {
      const { HealthCheckService } = await import('../../../../src/services/health/health-check-service')

      vi.mocked(mockDassieClient.getConnectionState).mockReturnValue('CONNECTED')

      const service = new HealthCheckService(
        mockDassieClient,
        mockDatabase,
        mockRedis,
        mockArweaveWallet,
        mockLogger
      )

      const status = await service.checkRedis()

      expect(status.status).toBe('up')
      expect(status.responseTimeMs).toBeGreaterThanOrEqual(0)
    })

    it('should return "down" when Redis ping fails', async () => {
      const { HealthCheckService } = await import('../../../../src/services/health/health-check-service')

      const error = new Error('Redis connection failed')
      mockRedis.ping = vi.fn((callback: (err: Error | null, result: string) => void) => {
        callback(error, '')
      })

      vi.mocked(mockDassieClient.getConnectionState).mockReturnValue('CONNECTED')

      const service = new HealthCheckService(
        mockDassieClient,
        mockDatabase,
        mockRedis,
        mockArweaveWallet,
        mockLogger
      )

      const status = await service.checkRedis()

      expect(status.status).toBe('down')
      expect(status.message).toBe('Redis connection failed')
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should return "down" when Redis ping times out', async () => {
      const { HealthCheckService } = await import('../../../../src/services/health/health-check-service')

      // Mock a slow Redis ping that doesn't call callback
      mockRedis.ping = vi.fn(() => {
        // Never calls callback, simulating timeout
      })

      vi.mocked(mockDassieClient.getConnectionState).mockReturnValue('CONNECTED')

      const service = new HealthCheckService(
        mockDassieClient,
        mockDatabase,
        mockRedis,
        mockArweaveWallet,
        mockLogger
      )

      // This test will timeout if Redis doesn't handle timeout properly
      const statusPromise = service.checkRedis()

      // Wait briefly to allow timeout logic to trigger
      await new Promise(resolve => setTimeout(resolve, 1100))

      const status = await statusPromise

      expect(status.status).toBe('down')
      expect(status.message).toBe('Redis ping timeout')
    })
  })

  describe('checkArweave', () => {
    it('should return "degraded" when Arweave wallet is not configured', async () => {
      const { HealthCheckService } = await import('../../../../src/services/health/health-check-service')

      vi.mocked(mockDassieClient.getConnectionState).mockReturnValue('CONNECTED')

      const service = new HealthCheckService(
        mockDassieClient,
        mockDatabase,
        mockRedis,
        null, // No Arweave wallet
        mockLogger
      )

      const status = await service.checkArweave()

      expect(status.status).toBe('degraded')
      expect(status.message).toBe('Arweave wallet not configured')
    })

    it('should return "up" when Arweave wallet getBalance succeeds', async () => {
      const { HealthCheckService } = await import('../../../../src/services/health/health-check-service')

      vi.mocked(mockDassieClient.getConnectionState).mockReturnValue('CONNECTED')

      const service = new HealthCheckService(
        mockDassieClient,
        mockDatabase,
        mockRedis,
        mockArweaveWallet,
        mockLogger
      )

      const status = await service.checkArweave()

      expect(status.status).toBe('up')
      expect(mockArweaveWallet.getBalance).toHaveBeenCalled()
    })

    it('should return "down" when Arweave wallet getBalance fails', async () => {
      const { HealthCheckService } = await import('../../../../src/services/health/health-check-service')

      const error = new Error('Arweave connection failed')
      mockArweaveWallet.getBalance = vi.fn().mockRejectedValue(error)

      vi.mocked(mockDassieClient.getConnectionState).mockReturnValue('CONNECTED')

      const service = new HealthCheckService(
        mockDassieClient,
        mockDatabase,
        mockRedis,
        mockArweaveWallet,
        mockLogger
      )

      const status = await service.checkArweave()

      expect(status.status).toBe('down')
      expect(status.message).toBe('Arweave connection failed')
      expect(mockLogger.error).toHaveBeenCalled()
    })
  })

  describe('getAllHealthChecks', () => {
    it('should return "healthy" when all services are up', async () => {
      const { HealthCheckService } = await import('../../../../src/services/health/health-check-service')

      vi.mocked(mockDassieClient.getConnectionState).mockReturnValue('CONNECTED')

      const service = new HealthCheckService(
        mockDassieClient,
        mockDatabase,
        mockRedis,
        mockArweaveWallet,
        mockLogger
      )

      const systemHealth = await service.getAllHealthChecks()

      expect(systemHealth.status).toBe('healthy')
      expect(systemHealth.services.nostream.status).toBe('up')
      expect(systemHealth.services.dassie_rpc.status).toBe('up')
      expect(systemHealth.services.postgresql.status).toBe('up')
      expect(systemHealth.services.redis.status).toBe('up')
      expect(systemHealth.services.arweave.status).toBe('up')
      expect(systemHealth.warnings).toHaveLength(0)
    })

    it('should return "degraded" when Dassie is down', async () => {
      const { HealthCheckService } = await import('../../../../src/services/health/health-check-service')

      vi.mocked(mockDassieClient.getConnectionState).mockReturnValue('DISCONNECTED')

      const service = new HealthCheckService(
        mockDassieClient,
        mockDatabase,
        mockRedis,
        mockArweaveWallet,
        mockLogger
      )

      const systemHealth = await service.getAllHealthChecks()

      expect(systemHealth.status).toBe('degraded')
      expect(systemHealth.services.dassie_rpc.status).toBe('down')
      expect(systemHealth.warnings).toContain('Dassie RPC unavailable - payments cannot be verified')
      expect(systemHealth.warnings).toContain('Degraded mode active - events accepted without verification')
    })

    it('should return "unhealthy" when PostgreSQL is down', async () => {
      const { HealthCheckService } = await import('../../../../src/services/health/health-check-service')

      mockDatabase.raw = vi.fn().mockReturnValue({
        timeout: vi.fn().mockRejectedValue(new Error('Database down')),
      })

      vi.mocked(mockDassieClient.getConnectionState).mockReturnValue('CONNECTED')

      const service = new HealthCheckService(
        mockDassieClient,
        mockDatabase,
        mockRedis,
        mockArweaveWallet,
        mockLogger
      )

      const systemHealth = await service.getAllHealthChecks()

      expect(systemHealth.status).toBe('unhealthy')
      expect(systemHealth.services.postgresql.status).toBe('down')
      expect(systemHealth.warnings).toContain('PostgreSQL unavailable - CRITICAL: event storage offline')
    })

    it('should cache results for 5 seconds', async () => {
      const { HealthCheckService } = await import('../../../../src/services/health/health-check-service')

      vi.mocked(mockDassieClient.getConnectionState).mockReturnValue('CONNECTED')

      const service = new HealthCheckService(
        mockDassieClient,
        mockDatabase,
        mockRedis,
        mockArweaveWallet,
        mockLogger
      )

      // First call
      const health1 = await service.getAllHealthChecks()
      const timestamp1 = health1.timestamp

      // Immediate second call (should be cached)
      const health2 = await service.getAllHealthChecks()
      const timestamp2 = health2.timestamp

      expect(timestamp1).toBe(timestamp2)
      expect(mockDatabase.raw).toHaveBeenCalledTimes(1) // Only called once due to cache
    })
  })
})
