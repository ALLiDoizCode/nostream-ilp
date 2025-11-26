/**
 * Health Check Service Factory
 *
 * Creates singleton instance of HealthCheckService for the application.
 *
 * @module health-check-service-factory
 */

import { createLogger as createDebugLogger } from './logger-factory'
import { getDassieClient } from './dassie-client-factory'

import { getCacheClient } from '../cache/client'
import { getMasterDbClient } from '../database/client'
import { HealthCheckService } from '../services/health/health-check-service'

let healthCheckServiceInstance: HealthCheckService | null = null

/**
 * Adapter to convert debug logger to Pino-like logger interface
 */
function createPinoLikeLogger(namespace: string) {
  const debug = createDebugLogger(namespace)

  return {
    info: (obj: any, msg?: string) => debug(msg || JSON.stringify(obj)),
    warn: (obj: any, msg?: string) => debug(`WARN: ${msg || JSON.stringify(obj)}`),
    error: (obj: any, msg?: string) => debug(`ERROR: ${msg || JSON.stringify(obj)}`),
    debug: (obj: any, msg?: string) => debug(msg || JSON.stringify(obj)),
  }
}

/**
 * Get or create HealthCheckService singleton
 *
 * @returns HealthCheckService instance
 */
export function getHealthCheckService(): HealthCheckService {
  if (healthCheckServiceInstance) {
    return healthCheckServiceInstance
  }

  const dassieClient = getDassieClient()
  const database = getMasterDbClient()
  const redis = getCacheClient()
  const logger = createPinoLikeLogger('health-check-service')

  // Arweave wallet is optional (not always configured)
  const arweaveWallet = null // TODO: Implement in Epic 3

  healthCheckServiceInstance = new HealthCheckService(
    dassieClient,
    database,
    redis,
    arweaveWallet,
    logger
  )

  return healthCheckServiceInstance
}

/**
 * Reset health check service (for testing)
 */
export function resetHealthCheckService(): void {
  healthCheckServiceInstance = null
}
