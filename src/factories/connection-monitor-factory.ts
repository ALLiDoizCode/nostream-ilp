/**
 * Connection Monitor Factory
 *
 * Creates singleton instance of ConnectionMonitor for the application.
 *
 * @module connection-monitor-factory
 */

import { ConnectionMonitor } from '../services/health/connection-monitor'
import { createLogger as createDebugLogger } from './logger-factory'
import { getDassieClient } from './dassie-client-factory'
import { getDegradedModeManager } from './degraded-mode-manager-factory'

let connectionMonitorInstance: ConnectionMonitor | null = null

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
 * Get or create ConnectionMonitor singleton
 *
 * @param wsAdapter - WebSocket adapter for broadcasting NOTICE (optional)
 * @returns ConnectionMonitor instance
 */
export function getConnectionMonitor(wsAdapter: any = null): ConnectionMonitor {
  if (connectionMonitorInstance) {
    return connectionMonitorInstance
  }

  const dassieClient = getDassieClient()
  const degradedModeManager = getDegradedModeManager()
  const logger = createPinoLikeLogger('connection-monitor')

  connectionMonitorInstance = new ConnectionMonitor(
    dassieClient,
    degradedModeManager,
    wsAdapter,
    logger
  )

  return connectionMonitorInstance
}

/**
 * Reset connection monitor (for testing)
 */
export function resetConnectionMonitor(): void {
  connectionMonitorInstance = null
}
