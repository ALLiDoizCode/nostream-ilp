import { BTPNIPsPacket, NostrMessageType } from '../types/index.js'
import { ConnectionConfig, PeerConnectionState } from '../types/peer-connection.js'
import { createLogger } from '../../factories/logger-factory.js'

import type { DassieClient } from '../../services/payment/dassie-client.js'
import type { ConnectionStore } from './connection-store.js'

/**
 * Heartbeat Monitor
 *
 * Monitors peer connection health by sending periodic PING packets
 * and expecting PONG responses within a timeout window.
 *
 * @module btp-nips/peer-discovery/heartbeat-monitor
 */



const debug = createLogger('btp-nips:heartbeat-monitor')

/**
 * Heartbeat interval timer
 */
interface HeartbeatTimer {
  /** Interval timer ID */
  intervalId: NodeJS.Timeout
  /** Timeout timer ID for PONG response */
  timeoutId: NodeJS.Timeout | null
  /** Peer's public key */
  pubkey: string
  /** Last PING sent timestamp */
  lastPingSent: number
}

/**
 * Heartbeat Monitor
 *
 * Implements the heartbeat protocol for peer connections:
 * - Send PING packet every 60 seconds (configurable)
 * - Expect PONG response within 10 seconds (configurable)
 * - Mark connection as DISCONNECTED if no PONG received
 * - Background cleanup job checks for stale connections
 *
 * PING/PONG Packet Format:
 * ```typescript
 * const _pingPacket: BTPNIPsPacket = {
 *   version: 1,
 *   messageType: NostrMessageType.PING,
 *   payment: { amount: '0', currency: 'msat', purpose: 'heartbeat' },
 *   nostr: {},
 *   metadata: { timestamp: Date.now(), sender: 'ilp.address' }
 * };
 * ```
 *
 * Usage:
 * ```typescript
 * const monitor = new HeartbeatMonitor(connectionStore, dassieClient, config);
 *
 * // Start monitoring a peer
 * await monitor.startMonitoring('alice_pubkey', streamConnection);
 *
 * // Handle PONG response
 * monitor.handlePong('alice_pubkey');
 *
 * // Stop monitoring
 * monitor.stopMonitoring('alice_pubkey');
 * ```
 */
export class HeartbeatMonitor {
  private timers: Map<string, HeartbeatTimer> = new Map()
  private cleanupIntervalId: NodeJS.Timeout | null = null

  /**
   * Create a HeartbeatMonitor instance
   *
   * @param connectionStore - Database storage for connections
   * @param dassieClient - Dassie RPC client for ILP operations
   * @param config - Connection configuration (heartbeat intervals)
   */
  constructor(
    private readonly connectionStore: ConnectionStore,
    private readonly dassieClient: DassieClient,
    private readonly config: ConnectionConfig
  ) {
    // Start background cleanup job (runs every heartbeat interval)
    this.startCleanupJob()
  }

  /**
   * Start monitoring a peer connection
   *
   * Sends PING packets at configured interval and sets timeout for PONG.
   * If no PONG received within timeout, marks connection as DISCONNECTED.
   *
   * @param pubkey - The peer's public key
   * @param streamConnection - ILP STREAM connection (mock for now)
   *
   * @example
   * ```typescript
   * await monitor.startMonitoring('alice_pubkey', connection);
   * ```
   */
  async startMonitoring(pubkey: string, streamConnection: any): Promise<void> {
    try {
      // Check if already monitoring
      if (this.timers.has(pubkey)) {
        debug('Already monitoring %s', pubkey.substring(0, 8))
        return
      }

      debug('Starting heartbeat monitoring for %s', pubkey.substring(0, 8))

      // Send initial PING immediately
      await this.sendPing(pubkey, streamConnection)

      // Create interval timer for periodic PINGs
      const intervalId = setInterval(async () => {
        try {
          await this.sendPing(pubkey, streamConnection)
        } catch (error) {
          debug('Error sending PING to %s: %O', pubkey.substring(0, 8), error)
          // Don't mark as DISCONNECTED on send error - wait for timeout
        }
      }, this.config.heartbeatIntervalMs)

      // Store timer
      const timer: HeartbeatTimer = {
        intervalId,
        timeoutId: null,
        pubkey,
        lastPingSent: Date.now(),
      }
      this.timers.set(pubkey, timer)

      debug('Heartbeat monitoring started for %s', pubkey.substring(0, 8))
    } catch (error) {
      debug('Error starting heartbeat monitoring for %s: %O', pubkey.substring(0, 8), error)
      throw error
    }
  }

  /**
   * Stop monitoring a peer connection
   *
   * Clears interval timer and timeout handlers.
   *
   * @param pubkey - The peer's public key
   *
   * @example
   * ```typescript
   * monitor.stopMonitoring('alice_pubkey');
   * ```
   */
  stopMonitoring(pubkey: string): void {
    try {
      const timer = this.timers.get(pubkey)
      if (!timer) {
        debug('No heartbeat timer found for %s', pubkey.substring(0, 8))
        return
      }

      // Clear interval
      clearInterval(timer.intervalId)

      // Clear timeout if pending
      if (timer.timeoutId) {
        clearTimeout(timer.timeoutId)
      }

      // Remove timer
      this.timers.delete(pubkey)

      debug('Stopped heartbeat monitoring for %s', pubkey.substring(0, 8))
    } catch (error) {
      debug('Error stopping heartbeat monitoring for %s: %O', pubkey.substring(0, 8), error)
    }
  }

  /**
   * Handle PONG response from peer
   *
   * Called when PONG packet received from peer.
   * Updates last_heartbeat timestamp and clears timeout.
   *
   * @param pubkey - The peer's public key
   *
   * @example
   * ```typescript
   * // In message handler
   * if (packet.messageType === NostrMessageType.PONG) {
   *   monitor.handlePong(senderPubkey);
   * }
   * ```
   */
  async handlePong(pubkey: string): Promise<void> {
    try {
      const timer = this.timers.get(pubkey)
      if (!timer) {
        debug('Received PONG from unmonitored peer: %s', pubkey.substring(0, 8))
        return
      }

      // Clear timeout if pending
      if (timer.timeoutId) {
        clearTimeout(timer.timeoutId)
        timer.timeoutId = null
      }

      // Update last_heartbeat timestamp in database
      await this.connectionStore.updateLastHeartbeat(pubkey)

      debug('PONG received from %s', pubkey.substring(0, 8))
    } catch (error) {
      debug('Error handling PONG from %s: %O', pubkey.substring(0, 8), error)
    }
  }

  /**
   * Send PING packet to peer
   *
   * Sends PING via ILP STREAM and sets timeout for PONG response.
   * If no PONG received within timeout, marks connection as DISCONNECTED.
   *
   * @param pubkey - The peer's public key
   * @param streamConnection - ILP STREAM connection
   */
  private async sendPing(pubkey: string, _streamConnection: any): Promise<void> {
    try {
      const timer = this.timers.get(pubkey)
      if (!timer) {
        return
      }

      // Get connection to check ILP address
      const connection = await this.connectionStore.getConnection(pubkey)
      if (!connection || !connection.ilpAddress) {
        debug('Cannot send PING - connection not ready: %s', pubkey.substring(0, 8))
        return
      }

      // Create PING packet
      const _pingPacket: BTPNIPsPacket = {
        header: {
          version: 1,
          messageType: NostrMessageType.PING,
          payloadLength: 0, // Will be calculated when serialized
        },
        payload: {
          payment: {
            amount: '0',
            currency: 'msat',
            purpose: 'heartbeat',
          },
          nostr: {},
          metadata: {
            timestamp: Math.floor(Date.now() / 1000),
            sender: connection.ilpAddress,
          },
        },
      }

      // Send PING via ILP STREAM (Epic 2 dependency - mock for now)
      // await this.dassieClient.sendPacket(connection.ilpAddress, pingPacket)

      debug('Sent PING to %s', pubkey.substring(0, 8))

      // Update last PING sent timestamp
      timer.lastPingSent = Date.now()

      // Set timeout for PONG response
      timer.timeoutId = setTimeout(async () => {
        try {
          debug('PONG timeout for %s - marking DISCONNECTED', pubkey.substring(0, 8))

          // Mark connection as DISCONNECTED
          await this.connectionStore.updateConnectionState(pubkey, PeerConnectionState.DISCONNECTED)

          // Stop monitoring
          this.stopMonitoring(pubkey)
        } catch (error) {
          debug('Error handling PONG timeout for %s: %O', pubkey.substring(0, 8), error)
        }
      }, this.config.heartbeatTimeoutMs)
    } catch (error) {
      debug('Error sending PING to %s: %O', pubkey.substring(0, 8), error)
      throw error
    }
  }

  /**
   * Check all connections for stale heartbeats
   *
   * Background cleanup job that checks all CONNECTED connections
   * for heartbeats older than (interval + timeout).
   * Marks stale connections as DISCONNECTED.
   *
   * Called automatically every heartbeat interval.
   */
  async checkAllConnections(): Promise<void> {
    try {
      // Get all CONNECTED connections
      const connections = await this.connectionStore.getConnectionsByState(PeerConnectionState.CONNECTED)

      const now = Date.now()
      const staleThreshold = this.config.heartbeatIntervalMs + this.config.heartbeatTimeoutMs + 10000 // +10s grace

      for (const conn of connections) {
        // Skip if no heartbeat timestamp
        if (!conn.lastHeartbeat) {
          continue
        }

        // Check if heartbeat is stale
        const age = now - conn.lastHeartbeat
        if (age > staleThreshold) {
          debug(
            'Stale heartbeat detected for %s (age: %dms) - marking DISCONNECTED',
            conn.nostrPubkey.substring(0, 8),
            age
          )

          // Mark as DISCONNECTED
          await this.connectionStore.updateConnectionState(conn.nostrPubkey, PeerConnectionState.DISCONNECTED)

          // Stop monitoring if active
          this.stopMonitoring(conn.nostrPubkey)
        }
      }
    } catch (error) {
      debug('Error checking all connections: %O', error)
    }
  }

  /**
   * Start background cleanup job
   *
   * Runs checkAllConnections() periodically to detect stale heartbeats.
   */
  private startCleanupJob(): void {
    if (this.cleanupIntervalId) {
      return
    }

    this.cleanupIntervalId = setInterval(async () => {
      try {
        await this.checkAllConnections()
      } catch (error) {
        debug('Error in cleanup job: %O', error)
      }
    }, this.config.heartbeatIntervalMs)

    debug('Heartbeat cleanup job started (interval: %dms)', this.config.heartbeatIntervalMs)
  }

  /**
   * Stop background cleanup job
   *
   * Used for testing or shutdown.
   */
  stopCleanupJob(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId)
      this.cleanupIntervalId = null
      debug('Heartbeat cleanup job stopped')
    }
  }

  /**
   * Stop all monitoring
   *
   * Stops all active heartbeat timers and cleanup job.
   * Used for testing or shutdown.
   */
  stopAll(): void {
    // Stop all timers
    for (const pubkey of Array.from(this.timers.keys())) {
      this.stopMonitoring(pubkey)
    }

    // Stop cleanup job
    this.stopCleanupJob()

    debug('All heartbeat monitoring stopped')
  }
}
