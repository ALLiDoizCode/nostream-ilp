import { ConnectionConfig, PeerConnectionState } from '../types/peer-connection'
import { createLogger } from '../../factories/logger-factory'

import type { ConnectionLifecycleManager } from './connection-lifecycle'
import type { ConnectionStore } from './connection-store'

/**
 * Reconnection Handler
 *
 * Manages automatic reconnection of disconnected peers with exponential backoff
 * and priority-based ordering.
 *
 * @module btp-nips/peer-discovery/reconnection-handler
 */



const debug = createLogger('btp-nips:reconnection-handler')

/**
 * Reconnection task
 */
interface ReconnectionTask {
  /** Peer's public key */
  pubkey: string
  /** Scheduled reconnection time (Unix timestamp) */
  scheduledTime: number
  /** Current attempt number */
  attempt: number
  /** Timeout ID for scheduled reconnection */
  timeoutId: NodeJS.Timeout
}

/**
 * Reconnection Handler
 *
 * Handles automatic reconnection of disconnected peers:
 * - Exponential backoff: delay = min(2^attempts * 1000, 300000)
 * - Priority-based ordering: high priority peers reconnect first
 * - Max attempts: 10 (configurable)
 * - Reconnect on startup: restore connections after node restart
 *
 * Backoff sequence:
 * - Attempt 1: 1 second
 * - Attempt 2: 2 seconds
 * - Attempt 3: 4 seconds
 * - Attempt 4: 8 seconds
 * - Attempt 5: 16 seconds
 * - Attempt 6: 32 seconds
 * - Attempt 7: 64 seconds
 * - Attempt 8: 128 seconds
 * - Attempt 9: 256 seconds (capped at 300s)
 * - Attempt 10: 512 seconds (capped at 300s)
 *
 * Usage:
 * ```typescript
 * const handler = new ReconnectionHandler(lifecycleManager, connectionStore, config);
 *
 * // Reconnect all disconnected peers
 * await handler.reconnectAll();
 *
 * // Reconnect specific peer
 * await handler.reconnect('alice_pubkey');
 *
 * // Reconnect on startup
 * await handler.reconnectOnStartup();
 * ```
 */
export class ReconnectionHandler {
  private tasks: Map<string, ReconnectionTask> = new Map()

  /**
   * Create a ReconnectionHandler instance
   *
   * @param lifecycleManager - Connection lifecycle manager
   * @param connectionStore - Database storage for connections
   * @param config - Connection configuration (backoff settings)
   */
  constructor(
    private readonly lifecycleManager: ConnectionLifecycleManager,
    private readonly connectionStore: ConnectionStore,
    private readonly config: ConnectionConfig
  ) {}

  /**
   * Reconnect all disconnected peers
   *
   * Gets all DISCONNECTED connections and attempts reconnection
   * in priority order (high priority first).
   *
   * @example
   * ```typescript
   * await handler.reconnectAll();
   * ```
   */
  async reconnectAll(): Promise<void> {
    try {
      debug('Reconnecting all disconnected peers')

      // Get all DISCONNECTED connections
      const disconnected = await this.connectionStore.getConnectionsByState(PeerConnectionState.DISCONNECTED)

      if (disconnected.length === 0) {
        debug('No disconnected peers to reconnect')
        return
      }

      // Sort by priority (1 = highest, 10 = lowest)
      disconnected.sort((a, b) => a.priority - b.priority)

      debug('Found %d disconnected peers to reconnect', disconnected.length)

      // Schedule reconnection for each peer
      for (const conn of disconnected) {
        try {
          // Don't schedule if already scheduled
          if (this.tasks.has(conn.nostrPubkey)) {
            continue
          }

          // Schedule reconnection
          this.scheduleReconnection(conn.nostrPubkey)
        } catch (error) {
          debug('Error scheduling reconnection for %s: %O', conn.nostrPubkey.substring(0, 8), error)
        }
      }
    } catch (error) {
      debug('Error reconnecting all: %O', error)
      throw error
    }
  }

  /**
   * Reconnect a specific peer
   *
   * Attempts to reconnect a peer with exponential backoff.
   * If reconnection fails, increments attempt counter and schedules retry.
   * If max attempts exceeded, marks connection as FAILED.
   *
   * @param pubkey - The peer's public key
   * @throws {Error} If connection not found
   *
   * @example
   * ```typescript
   * await handler.reconnect('alice_pubkey');
   * ```
   */
  async reconnect(pubkey: string): Promise<void> {
    try {
      // Get connection
      const connection = await this.connectionStore.getConnection(pubkey)
      if (!connection) {
        throw new Error(`Connection not found for pubkey: ${pubkey}`)
      }

      // Check if max attempts exceeded
      if (connection.reconnectAttempts >= this.config.maxReconnectAttempts) {
        debug(
          'Max reconnection attempts exceeded for %s (%d attempts) - marking FAILED',
          pubkey.substring(0, 8),
          connection.reconnectAttempts
        )

        await this.connectionStore.updateConnectionState(pubkey, PeerConnectionState.FAILED)

        // Cancel scheduled reconnection if any
        this.cancelReconnection(pubkey)

        return
      }

      // Calculate backoff delay
      const delay = this.calculateBackoffDelay(connection.reconnectAttempts)

      debug(
        'Reconnecting to %s (attempt %d/%d, delay: %dms)',
        pubkey.substring(0, 8),
        connection.reconnectAttempts + 1,
        this.config.maxReconnectAttempts,
        delay
      )

      // Wait for delay
      await this.sleep(delay)

      // Increment reconnection attempts
      const newAttempts = await this.connectionStore.incrementReconnectAttempts(pubkey)

      debug('Attempting reconnection for %s (attempt %d)', pubkey.substring(0, 8), newAttempts)

      try {
        // Transition to DISCOVERING to restart connection flow
        await this.connectionStore.updateConnectionState(pubkey, PeerConnectionState.DISCOVERING)

        // Attempt connection via ConnectionLifecycleManager
        // Note: connect() will check if connection exists and handle accordingly
        const updatedConn = await this.connectionStore.getConnection(pubkey)
        if (updatedConn) {
          await this.lifecycleManager.handleDiscovering(updatedConn)
        }

        debug('Reconnection initiated for %s', pubkey.substring(0, 8))

        // Cancel scheduled reconnection
        this.cancelReconnection(pubkey)
      } catch (error) {
        debug('Reconnection failed for %s: %O', pubkey.substring(0, 8), error)

        // Mark as DISCONNECTED again
        await this.connectionStore.updateConnectionState(pubkey, PeerConnectionState.DISCONNECTED)

        // Schedule next reconnection attempt
        this.scheduleReconnection(pubkey)
      }
    } catch (error) {
      debug('Error reconnecting to %s: %O', pubkey.substring(0, 8), error)
      throw error
    }
  }

  /**
   * Schedule a reconnection attempt
   *
   * Schedules a future reconnection attempt with exponential backoff.
   * Uses setTimeout to delay the reconnection.
   *
   * @param pubkey - The peer's public key
   *
   * @example
   * ```typescript
   * handler.scheduleReconnection('alice_pubkey');
   * ```
   */
  scheduleReconnection(pubkey: string): void {
    try {
      // Cancel existing task if any
      this.cancelReconnection(pubkey)

      // Get connection to check attempt count
      this.connectionStore.getConnection(pubkey).then(connection => {
        if (!connection) {
          debug('Cannot schedule reconnection - connection not found: %s', pubkey.substring(0, 8))
          return
        }

        // Calculate delay
        const delay = this.calculateBackoffDelay(connection.reconnectAttempts)
        const scheduledTime = Date.now() + delay

        // Schedule reconnection
        const timeoutId = setTimeout(async () => {
          try {
            await this.reconnect(pubkey)
          } catch (error) {
            debug('Error in scheduled reconnection for %s: %O', pubkey.substring(0, 8), error)
          }
        }, delay)

        // Store task
        const task: ReconnectionTask = {
          pubkey,
          scheduledTime,
          attempt: connection.reconnectAttempts + 1,
          timeoutId,
        }
        this.tasks.set(pubkey, task)

        debug(
          'Scheduled reconnection for %s (attempt %d, delay: %dms, time: %s)',
          pubkey.substring(0, 8),
          task.attempt,
          delay,
          new Date(scheduledTime).toISOString()
        )
      }).catch(error => {
        debug('Error getting connection for scheduling: %O', error)
      })
    } catch (error) {
      debug('Error scheduling reconnection for %s: %O', pubkey.substring(0, 8), error)
    }
  }

  /**
   * Cancel a scheduled reconnection
   *
   * Cancels the timeout for a scheduled reconnection.
   *
   * @param pubkey - The peer's public key
   *
   * @example
   * ```typescript
   * handler.cancelReconnection('alice_pubkey');
   * ```
   */
  cancelReconnection(pubkey: string): void {
    const task = this.tasks.get(pubkey)
    if (task) {
      clearTimeout(task.timeoutId)
      this.tasks.delete(pubkey)
      debug('Cancelled scheduled reconnection for %s', pubkey.substring(0, 8))
    }
  }

  /**
   * Reconnect on startup
   *
   * Called when the node restarts to restore connections.
   * Marks all CONNECTED/CONNECTING/CHANNEL_OPENING connections as DISCONNECTED
   * and schedules reconnection attempts.
   *
   * @example
   * ```typescript
   * // In node startup
   * await handler.reconnectOnStartup();
   * ```
   */
  async reconnectOnStartup(): Promise<void> {
    try {
      if (!this.config.autoReconnectOnStartup) {
        debug('Auto-reconnect on startup disabled')
        return
      }

      debug('Reconnecting on startup')

      // Get all connections that should be reconnected
      const activeStates = [
        PeerConnectionState.CONNECTED,
        PeerConnectionState.CONNECTING,
        PeerConnectionState.CHANNEL_OPENING,
      ]

      const allConnections = await this.connectionStore.getAllConnections()
      const toReconnect = allConnections.filter(conn => activeStates.includes(conn.state))

      if (toReconnect.length === 0) {
        debug('No connections to reconnect on startup')
        return
      }

      debug('Found %d connections to reconnect on startup', toReconnect.length)

      // Mark all as DISCONNECTED
      for (const conn of toReconnect) {
        try {
          await this.connectionStore.updateConnectionState(conn.nostrPubkey, PeerConnectionState.DISCONNECTED)
          debug('Marked %s as DISCONNECTED for reconnection', conn.nostrPubkey.substring(0, 8))
        } catch (error) {
          debug('Error marking %s as DISCONNECTED: %O', conn.nostrPubkey.substring(0, 8), error)
        }
      }

      // Schedule reconnection for all
      await this.reconnectAll()

      debug('Startup reconnection complete')
    } catch (error) {
      debug('Error reconnecting on startup: %O', error)
      throw error
    }
  }

  /**
   * Calculate exponential backoff delay
   *
   * Formula: min(2^attempts * baseDelay, maxDelay)
   *
   * @param attempts - Current attempt number
   * @returns Delay in milliseconds
   */
  private calculateBackoffDelay(attempts: number): number {
    const baseDelay = this.config.reconnectInitialDelayMs
    const maxDelay = this.config.reconnectMaxDelayMs

    // Exponential: 2^attempts * baseDelay
    const delay = Math.pow(2, attempts) * baseDelay

    // Cap at maxDelay
    return Math.min(delay, maxDelay)
  }

  /**
   * Sleep for specified milliseconds
   *
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Get scheduled reconnection tasks
   *
   * Used for testing/debugging.
   *
   * @returns Map of pubkey to reconnection task
   */
  getTasks(): Map<string, ReconnectionTask> {
    return new Map(this.tasks)
  }

  /**
   * Cancel all scheduled reconnections
   *
   * Used for testing or shutdown.
   */
  cancelAll(): void {
    for (const pubkey of Array.from(this.tasks.keys())) {
      this.cancelReconnection(pubkey)
    }
    debug('Cancelled all scheduled reconnections')
  }
}
