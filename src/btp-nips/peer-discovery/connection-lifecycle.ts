import { EventEmitter as _EventEmitter } from 'events'
import { createLogger } from '../../factories/logger-factory.js'
import { v4 as uuidv4 } from 'uuid'
import {
  ChannelNeededEvent,
  ConnectionStateChangeEvent,
  PeerConnection,
  PeerConnectionState,
  VALID_STATE_TRANSITIONS,
} from '../types/peer-connection.js'

import type { AddressResolver } from './address-resolver.js'
import type { ConnectionStore } from './connection-store.js'
import type { DassieClient } from '../../services/payment/dassie-client.js'
import type { PaymentChannelManager } from './payment-channel-manager.js'

/**
 * Connection Lifecycle Manager
 *
 * Implements the peer connection state machine for BTP-NIPs network.
 * Manages transitions between connection states from discovery to connected,
 * including payment channel setup and ILP session establishment.
 *
 * @module btp-nips/peer-discovery/connection-lifecycle
 */

const debug = createLogger('btp-nips:connection-lifecycle')

/**
 * Connection Lifecycle Manager
 *
 * Manages the full lifecycle of peer connections through the state machine:
 * - DISCOVERING: Query for peer's ILP address (Kind 32001)
 * - CONNECTING: Establish Dassie ILP session
 * - CHANNEL_NEEDED: Prompt user to open payment channel
 * - CHANNEL_OPENING: Wait for Base L2 confirmation
 * - CONNECTED: Fully operational with subscriptions
 * - DISCONNECTED: Connection lost, scheduled for reconnection
 * - FAILED: Connection failed, manual intervention needed
 *
 * Usage:
 * ```typescript
 * const manager = new ConnectionLifecycleManager(
 *   addressResolver,
 *   connectionStore,
 *   channelManager,
 *   dassieClient
 * );
 *
 * // Connect to a peer
 * await manager.connect('alice_pubkey', 1);
 *
 * // Listen for state changes
 * manager.on('stateChange', (_event) => {
 *   console.log('State changed:', event.oldState, '->', event.newState);
 * });
 *
 * // Disconnect peer
 * await manager.disconnect('alice_pubkey');
 * ```
 */
export class ConnectionLifecycleManager extends EventEmitter {
  /**
   * Create a ConnectionLifecycleManager instance
   *
   * @param addressResolver - Resolves Nostr pubkey to ILP address
   * @param connectionStore - Database storage for connections
   * @param channelManager - Payment channel management
   * @param dassieClient - Dassie RPC client for ILP operations
   */
  constructor(
    private readonly addressResolver: AddressResolver,
    private readonly connectionStore: ConnectionStore,
    private readonly channelManager: PaymentChannelManager,
    private readonly dassieClient: DassieClient
  ) {
    super()
  }

  /**
   * Connect to a peer
   *
   * Initiates the connection lifecycle:
   * 1. Create connection record (DISCOVERING)
   * 2. Resolve ILP address
   * 3. Establish ILP session
   * 4. Check/open payment channel
   * 5. Transition to CONNECTED
   *
   * @param nostrPubkey - The peer's Nostr public key
   * @param priority - Connection priority (1-10, lower = higher priority)
   * @throws {Error} If connection already exists
   *
   * @example
   * ```typescript
   * await manager.connect('alice_pubkey', 1); // High priority
   * ```
   */
  async connect(nostrPubkey: string, priority: number): Promise<void> {
    try {
      // Check if connection already exists
      const existing = await this.connectionStore.getConnection(nostrPubkey)
      if (existing) {
        debug('Connection already exists for %s (state: %s)', nostrPubkey.substring(0, 8), existing.state)
        return
      }

      // Create initial connection record
      const connection: PeerConnection = {
        id: uuidv4(),
        nostrPubkey,
        ilpAddress: null,
        state: PeerConnectionState.DISCOVERING,
        endpoint: null,
        baseAddress: null,
        channelId: null,
        priority,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      await this.connectionStore.createConnection(connection)
      debug('Created connection for %s (priority: %d)', nostrPubkey.substring(0, 8), priority)

      // Start connection flow
      await this.handleDiscovering(connection)
    } catch (error) {
      debug('Error connecting to peer %s: %O', nostrPubkey.substring(0, 8), error)
      throw error
    }
  }

  /**
   * Transition a connection to a new state
   *
   * Validates state transition and updates connection record.
   * Emits stateChange event on success.
   *
   * @param pubkey - The peer's public key
   * @param newState - The target state
   * @throws {Error} If transition is invalid
   *
   * @example
   * ```typescript
   * await manager.transitionTo('alice_pubkey', PeerConnectionState.CONNECTED);
   * ```
   */
  async transitionTo(pubkey: string, newState: PeerConnectionState): Promise<void> {
    try {
      const connection = await this.connectionStore.getConnection(pubkey)
      if (!connection) {
        throw new Error(`Connection not found for pubkey: ${pubkey}`)
      }

      const oldState = connection.state

      // Validate transition
      const validTransitions = VALID_STATE_TRANSITIONS[oldState]
      if (!validTransitions.includes(newState)) {
        throw new Error(
          `Invalid state transition for ${pubkey.substring(0, 8)}: ${oldState} -> ${newState}`
        )
      }

      // Update state
      await this.connectionStore.updateConnectionState(pubkey, newState)

      // Emit state change event
      const event: ConnectionStateChangeEvent = {
        pubkey,
        oldState,
        newState,
        timestamp: Date.now(),
      }
      this.emit('stateChange', event)

      debug('State transition for %s: %s -> %s', pubkey.substring(0, 8), oldState, newState)
    } catch (error) {
      debug('Error transitioning state for %s: %O', pubkey.substring(0, 8), error)
      throw error
    }
  }

  /**
   * Handle DISCOVERING state
   *
   * Resolves the peer's ILP address from their Kind 32001 announcement.
   * - If found: transition to CONNECTING
   * - If not found: transition to FAILED
   *
   * @param connection - The peer connection
   */
  async handleDiscovering(connection: PeerConnection): Promise<void> {
    try {
      debug('Discovering ILP address for %s', connection.nostrPubkey.substring(0, 8))

      // Resolve ILP address via AddressResolver
      const peerInfo = await this.addressResolver.resolveIlpAddress(connection.nostrPubkey)

      if (!peerInfo) {
        debug('Peer not found (no Kind 32001): %s', connection.nostrPubkey.substring(0, 8))
        await this.transitionTo(connection.nostrPubkey, PeerConnectionState.FAILED)
        return
      }

      // Update connection with discovered info
      await this.connectionStore.updateConnection(connection.nostrPubkey, {
        ilpAddress: peerInfo.ilpAddress,
        endpoint: peerInfo.endpoint,
        baseAddress: peerInfo.baseAddress,
      })

      debug(
        'Discovered peer info for %s: ILP=%s, endpoint=%s',
        connection.nostrPubkey.substring(0, 8),
        peerInfo.ilpAddress,
        peerInfo.endpoint
      )

      // Transition to CONNECTING
      await this.transitionTo(connection.nostrPubkey, PeerConnectionState.CONNECTING)

      // Continue to CONNECTING handler
      const updatedConn = await this.connectionStore.getConnection(connection.nostrPubkey)
      if (updatedConn) {
        await this.handleConnecting(updatedConn)
      }
    } catch (error) {
      debug('Error in DISCOVERING state for %s: %O', connection.nostrPubkey.substring(0, 8), error)
      await this.transitionTo(connection.nostrPubkey, PeerConnectionState.FAILED)
    }
  }

  /**
   * Handle CONNECTING state
   *
   * Establishes ILP session via Dassie and checks for payment channel.
   * - If channel exists: transition to CONNECTED
   * - If no channel: transition to CHANNEL_NEEDED
   *
   * @param connection - The peer connection
   */
  async handleConnecting(connection: PeerConnection): Promise<void> {
    try {
      debug('Establishing ILP session for %s', connection.nostrPubkey.substring(0, 8))

      if (!connection.ilpAddress) {
        throw new Error('ILP address not set')
      }

      // Establish Dassie ILP session (Epic 2 dependency - mock for now)
      // const session = await this.dassieClient.connectToPeer(connection.ilpAddress)

      // Check if payment channel exists
      const hasChannel = await this.channelManager.hasChannel(connection.ilpAddress)

      if (hasChannel) {
        // Get channel ID
        const channel = await this.channelManager.getChannelByPeer(connection.ilpAddress)

        await this.connectionStore.updateConnection(connection.nostrPubkey, {
          channelId: channel?.channelId ?? null,
        })

        // Transition to CONNECTED
        await this.transitionTo(connection.nostrPubkey, PeerConnectionState.CONNECTED)

        // Continue to CONNECTED handler
        const updatedConn = await this.connectionStore.getConnection(connection.nostrPubkey)
        if (updatedConn) {
          await this.handleConnected(updatedConn)
        }
      } else {
        // No channel - transition to CHANNEL_NEEDED
        await this.transitionTo(connection.nostrPubkey, PeerConnectionState.CHANNEL_NEEDED)

        // Continue to CHANNEL_NEEDED handler
        const updatedConn = await this.connectionStore.getConnection(connection.nostrPubkey)
        if (updatedConn) {
          await this.handleChannelNeeded(updatedConn)
        }
      }
    } catch (error) {
      debug('Error in CONNECTING state for %s: %O', connection.nostrPubkey.substring(0, 8), error)
      await this.transitionTo(connection.nostrPubkey, PeerConnectionState.FAILED)
    }
  }

  /**
   * Handle CHANNEL_NEEDED state
   *
   * Emits event for user to open payment channel.
   * Waits for external channel creation.
   *
   * @param connection - The peer connection
   */
  async handleChannelNeeded(connection: PeerConnection): Promise<void> {
    try {
      debug('Payment channel needed for %s', connection.nostrPubkey.substring(0, 8))

      if (!connection.baseAddress) {
        throw new Error('Base address not set')
      }

      // Emit event for UI/user to open channel
      const event: ChannelNeededEvent = {
        pubkey: connection.nostrPubkey,
        baseAddress: connection.baseAddress,
        estimatedCost: '0.01', // TODO: Calculate from pricing
        timestamp: Date.now(),
      }
      this.emit('channelNeeded', event)

      debug(
        'Emitted channelNeeded event for %s (baseAddress: %s)',
        connection.nostrPubkey.substring(0, 8),
        connection.baseAddress
      )

      // NOTE: External system will call resumeChannelOpening() when channel is created
    } catch (error) {
      debug('Error in CHANNEL_NEEDED state for %s: %O', connection.nostrPubkey.substring(0, 8), error)
      await this.transitionTo(connection.nostrPubkey, PeerConnectionState.FAILED)
    }
  }

  /**
   * Resume channel opening flow after user creates channel
   *
   * Called externally when payment channel is created.
   * Transitions to CHANNEL_OPENING and polls for confirmation.
   *
   * @param pubkey - The peer's public key
   * @param channelId - The created channel ID
   *
   * @example
   * ```typescript
   * // After user opens channel via UI
   * await manager.resumeChannelOpening('alice_pubkey', 'channel_123');
   * ```
   */
  async resumeChannelOpening(pubkey: string, channelId: string): Promise<void> {
    try {
      const connection = await this.connectionStore.getConnection(pubkey)
      if (!connection) {
        throw new Error(`Connection not found for pubkey: ${pubkey}`)
      }

      // Update channel ID
      await this.connectionStore.updateConnection(pubkey, { channelId })

      // Transition to CHANNEL_OPENING
      await this.transitionTo(pubkey, PeerConnectionState.CHANNEL_OPENING)

      // Continue to CHANNEL_OPENING handler
      const updatedConn = await this.connectionStore.getConnection(pubkey)
      if (updatedConn) {
        await this.handleChannelOpening(updatedConn)
      }
    } catch (error) {
      debug('Error resuming channel opening for %s: %O', pubkey.substring(0, 8), error)
      throw error
    }
  }

  /**
   * Handle CHANNEL_OPENING state
   *
   * Polls Base L2 for channel confirmation.
   * - If confirmed: transition to CONNECTED
   * - If timeout: transition to FAILED
   *
   * @param connection - The peer connection
   */
  async handleChannelOpening(connection: PeerConnection): Promise<void> {
    try {
      debug('Polling for channel confirmation for %s', connection.nostrPubkey.substring(0, 8))

      if (!connection.channelId) {
        throw new Error('Channel ID not set')
      }

      // Poll for channel confirmation (max 10 minutes)
      const maxAttempts = 60 // 10 minutes with 10s intervals
      let attempts = 0

      const pollInterval = setInterval(async () => {
        try {
          attempts++

          const channel = await this.channelManager.getChannelState(connection.channelId!)

          if (channel?.status === 'open') {
            clearInterval(pollInterval)

            // Transition to CONNECTED
            await this.transitionTo(connection.nostrPubkey, PeerConnectionState.CONNECTED)

            // Continue to CONNECTED handler
            const updatedConn = await this.connectionStore.getConnection(connection.nostrPubkey)
            if (updatedConn) {
              await this.handleConnected(updatedConn)
            }
          } else if (attempts >= maxAttempts) {
            clearInterval(pollInterval)

            debug('Channel opening timeout for %s', connection.nostrPubkey.substring(0, 8))
            await this.transitionTo(connection.nostrPubkey, PeerConnectionState.FAILED)
          }
        } catch (error) {
          debug('Error polling channel state: %O', error)
        }
      }, 10000) // Poll every 10 seconds
    } catch (error) {
      debug('Error in CHANNEL_OPENING state for %s: %O', connection.nostrPubkey.substring(0, 8), error)
      await this.transitionTo(connection.nostrPubkey, PeerConnectionState.FAILED)
    }
  }

  /**
   * Handle CONNECTED state
   *
   * Finalizes connection setup:
   * - Sends initial REQ packet
   * - Starts heartbeat monitoring
   * - Emits connected event
   *
   * @param connection - The peer connection
   */
  async handleConnected(connection: PeerConnection): Promise<void> {
    try {
      debug('Connection established for %s', connection.nostrPubkey.substring(0, 8))

      // Reset reconnection attempts
      await this.connectionStore.resetReconnectAttempts(connection.nostrPubkey)

      // TODO: Send initial REQ packet via SubscriptionManager (Story 5.5)
      // TODO: Start heartbeat monitoring (Story 6.5 Task 4)

      // Emit connected event
      this.emit('connected', { pubkey: connection.nostrPubkey, timestamp: Date.now() })

      debug('Peer %s is now CONNECTED', connection.nostrPubkey.substring(0, 8))
    } catch (error) {
      debug('Error in CONNECTED state for %s: %O', connection.nostrPubkey.substring(0, 8), error)
      // Don't transition to FAILED here - connection is established
    }
  }

  /**
   * Disconnect from a peer
   *
   * Transitions to DISCONNECTED state and cleans up:
   * - Stops heartbeat monitoring
   * - Closes active subscriptions
   *
   * @param pubkey - The peer's public key
   *
   * @example
   * ```typescript
   * await manager.disconnect('alice_pubkey');
   * ```
   */
  async disconnect(pubkey: string): Promise<void> {
    try {
      const connection = await this.connectionStore.getConnection(pubkey)
      if (!connection) {
        debug('Cannot disconnect - connection not found: %s', pubkey.substring(0, 8))
        return
      }

      // Transition to DISCONNECTED
      await this.transitionTo(pubkey, PeerConnectionState.DISCONNECTED)

      // TODO: Stop heartbeat monitoring (Story 6.5 Task 4)
      // TODO: Close active subscriptions (Story 5.5)

      // Emit disconnected event
      this.emit('disconnected', { pubkey, timestamp: Date.now() })

      debug('Disconnected from peer %s', pubkey.substring(0, 8))
    } catch (error) {
      debug('Error disconnecting from %s: %O', pubkey.substring(0, 8), error)
      throw error
    }
  }
}
