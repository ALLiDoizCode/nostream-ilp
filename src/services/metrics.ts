import { Gauge, Registry } from 'prom-client'

/**
 * Prometheus Metrics for Nostream
 *
 * Defines application-level metrics for monitoring and observability.
 * Metrics include:
 * - Dassie connection state
 * - Degraded mode status
 * - Degraded mode queue size
 * - Service health status
 *
 * @module metrics
 */

/**
 * Prometheus registry for all Nostream metrics
 */
export const register = new Registry()

/**
 * Dassie connection state metric
 *
 * Values:
 * - 0: DISCONNECTED
 * - 1: CONNECTING
 * - 2: CONNECTED
 * - 3: RECONNECTING
 */
export const dassieConnectionState = new Gauge({
  name: 'nostream_dassie_connection_state',
  help: 'Dassie connection state (0=disconnected, 1=connecting, 2=connected, 3=reconnecting)',
  registers: [register],
})

/**
 * Degraded mode active metric
 *
 * Values:
 * - 0: Normal mode (payment verification active)
 * - 1: Degraded mode (payment verification disabled)
 */
export const degradedModeActive = new Gauge({
  name: 'nostream_degraded_mode_active',
  help: 'Whether degraded mode is active (0=no, 1=yes)',
  registers: [register],
})

/**
 * Degraded mode queue size metric
 *
 * Number of queued payment verifications waiting to be processed
 */
export const degradedModeQueueSize = new Gauge({
  name: 'nostream_degraded_mode_queue_size',
  help: 'Number of queued payment verifications in degraded mode',
  registers: [register],
})

/**
 * Service health status metric
 *
 * Labeled by service name (nostream, dassie_rpc, postgresql, redis, arweave)
 *
 * Values:
 * - 0: down
 * - 1: up
 * - 2: degraded
 */
export const serviceHealthStatus = new Gauge({
  name: 'nostream_service_health_status',
  help: 'Service health status (0=down, 1=up, 2=degraded)',
  labelNames: ['service'],
  registers: [register],
})

/**
 * Helper: Convert connection state to numeric value
 *
 * @param state - Connection state string
 * @returns Numeric state value
 */
export function connectionStateToValue(state: string): number {
  switch (state) {
    case 'DISCONNECTED':
      return 0
    case 'CONNECTING':
      return 1
    case 'CONNECTED':
      return 2
    case 'RECONNECTING':
      return 3
    default:
      return 0
  }
}

/**
 * Helper: Convert health status to numeric value
 *
 * @param status - Health status string
 * @returns Numeric health value
 */
export function healthStatusToValue(status: 'up' | 'down' | 'degraded'): number {
  switch (status) {
    case 'down':
      return 0
    case 'up':
      return 1
    case 'degraded':
      return 2
    default:
      return 0
  }
}

/**
 * Initialize all metrics with default values
 */
export function initializeMetrics(): void {
  dassieConnectionState.set(0) // DISCONNECTED
  degradedModeActive.set(0) // Normal mode
  degradedModeQueueSize.set(0) // Empty queue

  // Initialize service health metrics
  const services = ['nostream', 'dassie_rpc', 'postgresql', 'redis', 'arweave']
  services.forEach(service => {
    serviceHealthStatus.labels(service).set(0) // All down initially
  })
}

// Initialize metrics on module load
initializeMetrics()
