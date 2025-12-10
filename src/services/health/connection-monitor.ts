import type { ConnectionState, DassieClient } from '../payment/dassie-client'
import type { DegradedModeManager } from '../payment/degraded-mode-manager'

/**
 * Connection Monitor
 *
 * Monitors Dassie RPC connection state and triggers degraded mode
 * when connection is lost.
 *
 * Listens for connection state changes from DassieClient and:
 * - Enables degraded mode on disconnect
 * - Processes queued verifications on reconnect
 * - Broadcasts NOTICE to clients about degraded mode
 *
 * @module connection-monitor
 */

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
 * WebSocket adapter for broadcasting NOTICE messages
 */
export interface WebSocketAdapter {
  /**
   * Broadcast NOTICE message to all connected clients
   *
   * @param message - NOTICE message content
   */
  broadcastNotice(message: string): void
}

/**
 * Connection Monitor
 *
 * Monitors Dassie connection state and manages degraded mode transitions.
 *
 * @example
 * ```typescript
 * const monitor = new ConnectionMonitor(
 *   dassieClient,
 *   degradedModeManager,
 *   wsAdapter,
 *   logger
 * )
 *
 * // ConnectionMonitor automatically listens for state changes
 * // No manual invocation needed - everything is event-driven
 * ```
 */
export class ConnectionMonitor {
  private dassieClient: DassieClient
  private degradedModeManager: DegradedModeManager
  private wsAdapter: WebSocketAdapter | null
  private logger: Logger

  /**
   * Create connection monitor
   *
   * Automatically subscribes to DassieClient connection state changes.
   *
   * @param dassieClient - Dassie RPC client
   * @param degradedModeManager - Degraded mode manager
   * @param wsAdapter - WebSocket adapter for broadcasting NOTICE (optional)
   * @param logger - Logger instance
   */
  constructor(
    dassieClient: DassieClient,
    degradedModeManager: DegradedModeManager,
    wsAdapter: WebSocketAdapter | null,
    logger: Logger
  ) {
    this.dassieClient = dassieClient
    this.degradedModeManager = degradedModeManager
    this.wsAdapter = wsAdapter
    this.logger = logger

    // Subscribe to connection state changes
    this.dassieClient.on('state', this.handleStateChange.bind(this))

    this.logger.info(
      { event: 'connection_monitor_initialized' },
      'Connection monitor initialized - listening for Dassie state changes'
    )
  }

  /**
   * Handle Dassie connection state change
   *
   * Called when DassieClient emits 'state' event.
   *
   * @param state - New connection state
   */
  private async handleStateChange(state: ConnectionState): Promise<void> {
    this.logger.debug(
      { event: 'dassie_connection_state_change', state },
      `Dassie connection state: ${state}`
    )

    switch (state) {
      case 'DISCONNECTED':
      case 'RECONNECTING':
        await this.handleConnectionLost(state)
        break

      case 'CONNECTED':
        await this.handleConnectionRestored()
        break

      case 'CONNECTING':
        // No action needed during initial connection
        this.logger.debug({ state }, 'Dassie connecting...')
        break

      default:
        this.logger.warn({ state }, `Unknown connection state: ${state}`)
    }
  }

  /**
   * Handle Dassie connection lost
   *
   * Enables degraded mode and broadcasts NOTICE to clients.
   *
   * @param state - Connection state (DISCONNECTED or RECONNECTING)
   */
  private async handleConnectionLost(state: ConnectionState): Promise<void> {
    // Only enable degraded mode if not already degraded
    if (!this.degradedModeManager.isDegraded()) {
      this.logger.error(
        {
          event: 'alert_dassie_connection_lost',
          severity: 'critical',
          state,
          action_required: 'Check Dassie node status and logs',
        },
        'ALERT: Dassie RPC connection lost - entering degraded mode'
      )

      this.degradedModeManager.enableDegradedMode()
      this.broadcastDegradedModeNotice()
    } else {
      this.logger.debug({ state }, 'Already in degraded mode - no action needed')
    }
  }

  /**
   * Handle Dassie connection restored
   *
   * Processes queued verifications and disables degraded mode.
   */
  private async handleConnectionRestored(): Promise<void> {
    const queueSize = this.degradedModeManager.getQueueSize()

    this.logger.info(
      {
        event: 'alert_dassie_reconnected',
        severity: 'info',
        queued_verifications: queueSize,
      },
      `Dassie RPC reconnected - processing ${queueSize} queued verifications`
    )

    // Process queued verifications
    if (queueSize > 0) {
      try {
        await this.processQueuedVerifications()
      } catch (error) {
        this.logger.error(
          {
            error,
            event: 'queued_verification_error',
          },
          'Error processing queued verifications after reconnection'
        )

        // Don't disable degraded mode if queue processing failed
        return
      }
    }

    // Disable degraded mode
    this.degradedModeManager.disableDegradedMode()
  }

  /**
   * Broadcast NOTICE to all connected clients
   *
   * Informs clients that payment verification is temporarily unavailable.
   */
  private broadcastDegradedModeNotice(): void {
    if (!this.wsAdapter) {
      this.logger.warn(
        { event: 'broadcast_notice_skipped' },
        'WebSocket adapter not available - cannot broadcast NOTICE'
      )
      return
    }

    const notice = 'Payment verification temporarily unavailable - events accepted without verification'

    try {
      this.wsAdapter.broadcastNotice(notice)

      this.logger.info(
        {
          event: 'degraded_mode_notice_broadcast',
          message: notice,
        },
        'Broadcasted degraded mode NOTICE to all connected clients'
      )
    } catch (error) {
      this.logger.error(
        {
          error,
          event: 'broadcast_notice_failed',
        },
        'Failed to broadcast degraded mode NOTICE'
      )
    }
  }

  /**
   * Process queued payment verifications
   *
   * Delegates to DegradedModeManager and logs results.
   */
  private async processQueuedVerifications(): Promise<void> {
    const queueSize = this.degradedModeManager.getQueueSize()

    // Warn if queue is large
    if (queueSize > 1000) {
      this.logger.warn(
        {
          event: 'alert_degraded_queue_high',
          severity: 'warning',
          queue_size: queueSize,
        },
        `WARNING: Large degraded mode queue (${queueSize} events) - processing may take time`
      )
    }

    const results = await this.degradedModeManager.processQueuedVerifications()

    this.logger.info(
      {
        event: 'queued_verifications_processed',
        total: results.total,
        valid: results.valid,
        invalid: results.invalid,
        duration_ms: results.durationMs,
      },
      `Processed ${results.total} queued payment verifications (${results.valid} valid, ${results.invalid} invalid)`
    )

    // Log warning if many invalid claims
    if (results.invalid > 0) {
      const invalidPercent = (results.invalid / results.total) * 100

      this.logger.warn(
        {
          event: 'queued_verifications_invalid_high',
          invalid_count: results.invalid,
          invalid_percent: invalidPercent.toFixed(1),
        },
        `WARNING: ${results.invalid} of ${results.total} queued verifications were invalid (${invalidPercent.toFixed(1)}%)`
      )
    }
  }

  /**
   * Get current monitoring status
   *
   * @returns Object with monitoring status
   */
  getStatus(): {
    dassieConnected: boolean
    degradedMode: boolean
    queueSize: number
  } {
    return {
      dassieConnected: this.dassieClient.isConnected(),
      degradedMode: this.degradedModeManager.isDegraded(),
      queueSize: this.degradedModeManager.getQueueSize(),
    }
  }
}
