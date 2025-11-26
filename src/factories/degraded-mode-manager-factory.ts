/**
 * Degraded Mode Manager Factory
 *
 * Creates singleton instance of DegradedModeManager for the application.
 *
 * @module degraded-mode-manager-factory
 */

import { createLogger as createDebugLogger } from './logger-factory'
import { getDassieClient } from './dassie-client-factory'

import { DegradedModeManager } from '../services/payment/degraded-mode-manager'

let degradedModeManagerInstance: DegradedModeManager | null = null

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
 * Get or create DegradedModeManager singleton
 *
 * @returns DegradedModeManager instance
 */
export function getDegradedModeManager(): DegradedModeManager {
  if (degradedModeManagerInstance) {
    return degradedModeManagerInstance
  }

  const dassieClient = getDassieClient()
  const logger = createPinoLikeLogger('degraded-mode-manager')
  const maxQueueSize = process.env.DEGRADED_MODE_MAX_QUEUE_SIZE
    ? Number(process.env.DEGRADED_MODE_MAX_QUEUE_SIZE)
    : 10000

  degradedModeManagerInstance = new DegradedModeManager(
    dassieClient,
    logger,
    maxQueueSize
  )

  return degradedModeManagerInstance
}

/**
 * Reset degraded mode manager (for testing)
 */
export function resetDegradedModeManager(): void {
  degradedModeManagerInstance = null
}
