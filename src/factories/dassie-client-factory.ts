/**
 * Dassie Client Factory
 *
 * Provides singleton instance of DassieClient for dependency injection.
 * Ensures one WebSocket connection is shared across all event verifications.
 *
 * The client is initialized synchronously and connects asynchronously in the background.
 * This allows the message handler factory to remain synchronous while still providing
 * a connected client for use.
 *
 * @module dassie-client-factory
 */

import { DassieClient, type DassieClientConfig } from '../services/payment/dassie-client'
import { createLogger as createDebugLogger } from './logger-factory'

let dassieClientInstance: DassieClient | null = null

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
 * Initialize DassieClient singleton
 *
 * Creates client instance and initiates connection in background.
 * Must be called during app startup before handling messages.
 *
 * @returns Promise that resolves when client is connected
 */
export async function initializeDassieClient(): Promise<void> {
  if (dassieClientInstance) {
    return
  }

  const logger = createPinoLikeLogger('dassie-client')
  const config: DassieClientConfig = {
    url: process.env.DASSIE_RPC_URL || 'ws://localhost:5000/trpc',
    paymentEndpointsAvailable: process.env.DASSIE_PAYMENT_ENDPOINTS_AVAILABLE === 'true',
  }

  dassieClientInstance = new DassieClient(config, logger)
  await dassieClientInstance.connect()
}

/**
 * Get singleton DassieClient instance (synchronous)
 *
 * Returns the initialized client instance. Client must be initialized
 * via initializeDassieClient() during app startup.
 *
 * @returns DassieClient Singleton Dassie client instance
 * @throws Error if client not initialized
 */
export function getDassieClient(): DassieClient {
  if (!dassieClientInstance) {
    throw new Error('DassieClient not initialized. Call initializeDassieClient() during app startup.')
  }
  return dassieClientInstance
}

/**
 * Reset singleton (for testing only)
 * @internal
 */
export function resetDassieClient(): void {
  if (dassieClientInstance) {
    dassieClientInstance.disconnect()
    dassieClientInstance = null
  }
}
