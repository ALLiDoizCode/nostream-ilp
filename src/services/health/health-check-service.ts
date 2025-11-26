/**
 * Health Check Service for Nostream
 *
 * Monitors health of all system dependencies:
 * - Dassie RPC (WebSocket connection state)
 * - PostgreSQL (event storage)
 * - Redis (subscription caching)
 * - Arweave (permanent storage)
 *
 * Provides aggregated system health status for monitoring and alerting.
 *
 * @module health-check-service
 */

import type { Knex } from 'knex'

import type { ConnectionState, DassieClient } from '../payment/dassie-client'
import { healthStatusToValue, serviceHealthStatus } from '../metrics'

/**
 * Health status for individual service
 */
export interface HealthStatus {
  /** Service status */
  status: 'up' | 'down' | 'degraded'
  /** Last health check timestamp */
  lastCheck: Date
  /** Error message if down */
  message?: string
  /** Response time in milliseconds (for HTTP checks) */
  responseTimeMs?: number
}

/**
 * Aggregated system health
 */
export interface SystemHealth {
  /** Overall system status */
  status: 'healthy' | 'degraded' | 'unhealthy'
  /** ISO 8601 timestamp */
  timestamp: string
  /** Individual service health status */
  services: {
    nostream: HealthStatus
    dassie_rpc: HealthStatus
    postgresql: HealthStatus
    redis: HealthStatus
    arweave: HealthStatus
  }
  /** Human-readable warning messages */
  warnings: string[]
}

/**
 * Logger interface (compatible with Pino)
 */
interface Logger {
  info: (obj: any, msg?: string) => void
  warn: (obj: any, msg?: string) => void
  error: (obj: any, msg?: string) => void
  debug: (obj: any, msg?: string) => void
}

/**
 * Arweave wallet interface (minimal for health checks)
 */
interface ArweaveWallet {
  getBalance?: () => Promise<string>
}

/**
 * Health Check Service
 *
 * Monitors all system dependencies and provides aggregated health status.
 *
 * @example
 * ```typescript
 * const healthService = new HealthCheckService(
 *   dassieClient,
 *   database,
 *   redisClient,
 *   arweaveWallet,
 *   logger
 * )
 *
 * const systemHealth = await healthService.getAllHealthChecks()
 * console.log('System status:', systemHealth.status)
 * ```
 */
export class HealthCheckService {
  private dassieClient: DassieClient
  private database: Knex
  private redis: any // Redis client type varies
  private arweaveWallet: ArweaveWallet | null
  private logger: Logger
  private cachedHealth: SystemHealth | null = null
  private cacheTimestamp: number = 0
  private readonly cacheTTL = 5000 // 5 seconds

  /**
   * Create health check service
   *
   * @param dassieClient - Dassie RPC client
   * @param database - Knex database instance
   * @param redis - Redis client
   * @param arweaveWallet - Arweave wallet (optional)
   * @param logger - Logger instance
   */
  constructor(
    dassieClient: DassieClient,
    database: Knex,
    redis: any,
    arweaveWallet: ArweaveWallet | null,
    logger: Logger
  ) {
    this.dassieClient = dassieClient
    this.database = database
    this.redis = redis
    this.arweaveWallet = arweaveWallet
    this.logger = logger
  }

  /**
   * Check Dassie RPC connection health
   *
   * Uses WebSocket connection state for real-time status.
   *
   * @returns Promise<HealthStatus> Dassie connection health
   */
  async checkDassieConnection(): Promise<HealthStatus> {
    try {
      const state: ConnectionState = this.dassieClient.getConnectionState()

      switch (state) {
        case 'CONNECTED':
          return {
            status: 'up',
            lastCheck: new Date(),
          }

        case 'CONNECTING':
        case 'RECONNECTING':
          return {
            status: 'degraded',
            lastCheck: new Date(),
            message: `Dassie RPC ${state.toLowerCase()}`,
          }

        case 'DISCONNECTED':
        default:
          return {
            status: 'down',
            lastCheck: new Date(),
            message: 'Dassie RPC disconnected',
          }
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to check Dassie connection state')
      return {
        status: 'down',
        lastCheck: new Date(),
        message: (error as Error).message,
      }
    }
  }

  /**
   * Check PostgreSQL database health
   *
   * Executes simple query (SELECT 1) with timeout.
   *
   * @returns Promise<HealthStatus> Database health
   */
  async checkPostgreSQL(): Promise<HealthStatus> {
    const startTime = Date.now()

    try {
      // Simple health check query with 1 second timeout
      await this.database.raw('SELECT 1').timeout(1000)

      const responseTime = Date.now() - startTime

      return {
        status: 'up',
        lastCheck: new Date(),
        responseTimeMs: responseTime,
      }
    } catch (error) {
      this.logger.error({ error }, 'PostgreSQL health check failed')

      return {
        status: 'down',
        lastCheck: new Date(),
        message: (error as Error).message,
      }
    }
  }

  /**
   * Check Redis health
   *
   * Executes PING command with timeout.
   *
   * @returns Promise<HealthStatus> Redis health
   */
  async checkRedis(): Promise<HealthStatus> {
    const startTime = Date.now()

    try {
      // Redis PING command with timeout
      const pingPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Redis ping timeout')), 1000)

        this.redis.ping((err: Error | null, result: string) => {
          clearTimeout(timeout)
          if (err) {
            reject(err)
          } else {
            resolve(result)
          }
        })
      })

      await pingPromise

      const responseTime = Date.now() - startTime

      return {
        status: 'up',
        lastCheck: new Date(),
        responseTimeMs: responseTime,
      }
    } catch (error) {
      this.logger.error({ error }, 'Redis health check failed')

      return {
        status: 'down',
        lastCheck: new Date(),
        message: (error as Error).message,
      }
    }
  }

  /**
   * Check Arweave wallet health
   *
   * Verifies wallet is accessible (optional service).
   *
   * @returns Promise<HealthStatus> Arweave health
   */
  async checkArweave(): Promise<HealthStatus> {
    // Arweave is optional
    if (!this.arweaveWallet) {
      return {
        status: 'degraded',
        lastCheck: new Date(),
        message: 'Arweave wallet not configured',
      }
    }

    try {
      // Check if wallet can access balance
      if (this.arweaveWallet.getBalance) {
        await this.arweaveWallet.getBalance()
      }

      return {
        status: 'up',
        lastCheck: new Date(),
      }
    } catch (error) {
      this.logger.error({ error }, 'Arweave health check failed')

      return {
        status: 'down',
        lastCheck: new Date(),
        message: (error as Error).message,
      }
    }
  }

  /**
   * Check Dassie HTTP health endpoint
   *
   * Fallback check if WebSocket state is ambiguous.
   * Uses HTTP GET to Dassie's /health endpoint.
   *
   * @returns Promise<HealthStatus> Dassie HTTP health
   */
  async checkDassieHTTPHealth(): Promise<HealthStatus> {
    const dassieHttpUrl = process.env.DASSIE_HTTP_URL || 'http://localhost:5000'
    const startTime = Date.now()

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000) // 5 second timeout

      const response = await fetch(`${dassieHttpUrl}/health`, {
        signal: controller.signal,
      })

      clearTimeout(timeout)

      const responseTime = Date.now() - startTime

      if (response.ok) {
        return {
          status: 'up',
          lastCheck: new Date(),
          responseTimeMs: responseTime,
        }
      } else {
        return {
          status: 'down',
          lastCheck: new Date(),
          message: `HTTP ${response.status}: ${response.statusText}`,
        }
      }
    } catch (error) {
      this.logger.error({ error, url: dassieHttpUrl }, 'Dassie HTTP health check failed')

      return {
        status: 'down',
        lastCheck: new Date(),
        message: (error as Error).message,
      }
    }
  }

  /**
   * Get aggregated health status for all services
   *
   * Checks all services in parallel and aggregates results.
   * Results are cached for 5 seconds to avoid excessive load.
   *
   * @returns Promise<SystemHealth> Aggregated system health
   */
  async getAllHealthChecks(): Promise<SystemHealth> {
    // Return cached health if within TTL
    const now = Date.now()
    if (this.cachedHealth && (now - this.cacheTimestamp) < this.cacheTTL) {
      return this.cachedHealth
    }

    // Check all services in parallel
    const [dassieStatus, postgresStatus, redisStatus, arweaveStatus] = await Promise.all([
      this.checkDassieConnection(),
      this.checkPostgreSQL(),
      this.checkRedis(),
      this.checkArweave(),
    ])

    // Nostream itself is always "up" if we can execute this code
    const nostreamStatus: HealthStatus = {
      status: 'up',
      lastCheck: new Date(),
    }

    // Aggregate warnings
    const warnings: string[] = []

    if (dassieStatus.status === 'down') {
      warnings.push('Dassie RPC unavailable - payments cannot be verified')
      warnings.push('Degraded mode active - events accepted without verification')
    } else if (dassieStatus.status === 'degraded') {
      warnings.push('Dassie RPC reconnecting - temporary service degradation')
    }

    if (postgresStatus.status === 'down') {
      warnings.push('PostgreSQL unavailable - CRITICAL: event storage offline')
    }

    if (redisStatus.status === 'down') {
      warnings.push('Redis unavailable - subscription caching degraded')
    }

    if (arweaveStatus.status === 'down') {
      warnings.push('Arweave unavailable - permanent storage offline')
    }

    // Determine overall system status
    let systemStatus: 'healthy' | 'degraded' | 'unhealthy'

    if (postgresStatus.status === 'down') {
      // PostgreSQL down = unhealthy (critical service)
      systemStatus = 'unhealthy'
    } else if (
      dassieStatus.status !== 'up' ||
      redisStatus.status !== 'up' ||
      arweaveStatus.status === 'down'
    ) {
      // Non-critical service down = degraded
      systemStatus = 'degraded'
    } else {
      // All services up = healthy
      systemStatus = 'healthy'
    }

    const systemHealth: SystemHealth = {
      status: systemStatus,
      timestamp: new Date().toISOString(),
      services: {
        nostream: nostreamStatus,
        dassie_rpc: dassieStatus,
        postgresql: postgresStatus,
        redis: redisStatus,
        arweave: arweaveStatus,
      },
      warnings,
    }

    // Update Prometheus metrics for service health
    serviceHealthStatus.labels('nostream').set(healthStatusToValue(nostreamStatus.status))
    serviceHealthStatus.labels('dassie_rpc').set(healthStatusToValue(dassieStatus.status))
    serviceHealthStatus.labels('postgresql').set(healthStatusToValue(postgresStatus.status))
    serviceHealthStatus.labels('redis').set(healthStatusToValue(redisStatus.status))
    serviceHealthStatus.labels('arweave').set(healthStatusToValue(arweaveStatus.status))

    // Cache result
    this.cachedHealth = systemHealth
    this.cacheTimestamp = now

    return systemHealth
  }
}
