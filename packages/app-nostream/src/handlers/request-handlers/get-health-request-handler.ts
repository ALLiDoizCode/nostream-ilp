import { NextFunction, Request, Response } from 'express'
import { getHealthCheckService } from '../../factories/health-check-service-factory'

/**
 * Health check endpoint handler
 *
 * Returns comprehensive health status for all services:
 * - 200 OK: System healthy or degraded (operational)
 * - 503 Service Unavailable: System unhealthy (critical service down)
 *
 * Response format:
 * {
 *   status: 'healthy' | 'degraded' | 'unhealthy',
 *   timestamp: string (ISO 8601),
 *   services: {
 *     nostream: { status, lastCheck, ... },
 *     dassie_rpc: { status, lastCheck, ... },
 *     postgresql: { status, lastCheck, ... },
 *     redis: { status, lastCheck, ... },
 *     arweave: { status, lastCheck, ... }
 *   },
 *   warnings: string[]
 * }
 */
export const getHealthRequestHandler = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const healthService = getHealthCheckService()
    const systemHealth = await healthService.getAllHealthChecks()

    // Return 503 if unhealthy (critical service down), 200 otherwise
    const statusCode = systemHealth.status === 'unhealthy' ? 503 : 200

    res
      .status(statusCode)
      .setHeader('content-type', 'application/json; charset=utf8')
      .json(systemHealth)

    next()
  } catch (error) {
    // If health check itself fails, return 503
    console.error('Health check failed:', error)

    res.status(503).setHeader('content-type', 'application/json; charset=utf8').json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {},
      warnings: ['Health check service error'],
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    next(error)
  }
}
