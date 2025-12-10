
/**
 * Peer Connection State Management Types
 *
 * Defines types for the peer connection lifecycle state machine, including:
 * - Connection states (DISCOVERING → CONNECTING → CONNECTED)
 * - Connection data models
 * - Configuration interfaces
 *
 * Part of Story 6.5: Peer Connection Lifecycle
 */

/**
 * Connection states representing the peer connection lifecycle
 *
 * State transitions:
 * - DISCOVERING: Querying for peer's ILP address (Kind 32001)
 * - CONNECTING: Establishing Dassie ILP session
 * - CHANNEL_NEEDED: Need payment channel before connection
 * - CHANNEL_OPENING: Waiting for Base L2 on-chain confirmation
 * - CONNECTED: Fully operational with active subscriptions
 * - DISCONNECTED: Connection lost, scheduled for reconnection
 * - FAILED: Connection failed, manual intervention needed
 */
export enum PeerConnectionState {
  DISCOVERING = 'discovering',
  CONNECTING = 'connecting',
  CHANNEL_NEEDED = 'channel_needed',
  CHANNEL_OPENING = 'channel_opening',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  FAILED = 'failed'
}

/**
 * Peer connection data model
 *
 * Represents a single peer connection with full lifecycle state
 */
export interface PeerConnection {
  /** Connection ID (UUID v4) */
  id: string;

  /** Peer's Nostr public key (unique identifier) */
  nostrPubkey: string;

  /** Resolved ILP address (e.g., g.btp-nips.alice.npub1abc) */
  ilpAddress: string | null;

  /** Current connection state */
  state: PeerConnectionState;

  /** Peer's HTTPS endpoint for discovery */
  endpoint: string | null;

  /** Peer's Base L2 wallet address */
  baseAddress: string | null;

  /** Payment channel ID (if channel exists) */
  channelId: string | null;

  /** Connection priority: 1 (highest) - 10 (lowest) */
  priority: number;

  /** Unix timestamp (milliseconds) of last successful heartbeat */
  lastHeartbeat: number | null;

  /** Reconnection attempt counter for exponential backoff */
  reconnectAttempts: number;

  /** Active subscription IDs for this peer connection */
  subscriptionIds: string[];

  /** Unix timestamp (milliseconds) of connection creation */
  createdAt: number;

  /** Unix timestamp (milliseconds) of last update */
  updatedAt: number;
}

/**
 * Configuration for connection lifecycle behavior
 */
export interface ConnectionConfig {
  /** Heartbeat interval in milliseconds (default: 60000 = 60s) */
  heartbeatIntervalMs: number;

  /** Heartbeat timeout in milliseconds (default: 10000 = 10s) */
  heartbeatTimeoutMs: number;

  /** Maximum reconnection attempts before marking FAILED (default: 10) */
  maxReconnectAttempts: number;

  /** Initial reconnection delay in milliseconds (default: 1000 = 1s) */
  reconnectInitialDelayMs: number;

  /** Maximum reconnection delay in milliseconds (default: 300000 = 5min) */
  reconnectMaxDelayMs: number;

  /** Channel opening timeout in milliseconds (default: 600000 = 10min) */
  channelOpeningTimeoutMs: number;

  /** Auto-reconnect on startup (default: true) */
  autoReconnectOnStartup: boolean;

  /** Maximum number of active connections (default: 1000) */
  maxActiveConnections: number;
}

/**
 * Default connection configuration
 */
export const DEFAULT_CONNECTION_CONFIG: ConnectionConfig = {
  heartbeatIntervalMs: 60000,
  heartbeatTimeoutMs: 10000,
  maxReconnectAttempts: 10,
  reconnectInitialDelayMs: 1000,
  reconnectMaxDelayMs: 300000,
  channelOpeningTimeoutMs: 600000,
  autoReconnectOnStartup: true,
  maxActiveConnections: 1000,
}

/**
 * Context for priority calculation
 */
export interface PriorityContext {
  /** Is this peer in the user's follow list? */
  isFollowed: boolean;

  /** Number of subscribers this peer has (measure of network importance) */
  subscriberCount: number;

  /** Average latency to this peer in milliseconds */
  avgLatencyMs: number;
}

/**
 * State transition validation map
 *
 * Defines valid state transitions for the connection state machine
 */
export const VALID_STATE_TRANSITIONS: Record<PeerConnectionState, PeerConnectionState[]> = {
  [PeerConnectionState.DISCOVERING]: [
    PeerConnectionState.CONNECTING,
    PeerConnectionState.FAILED,
  ],
  [PeerConnectionState.CONNECTING]: [
    PeerConnectionState.CHANNEL_NEEDED,
    PeerConnectionState.CONNECTED,
    PeerConnectionState.FAILED,
  ],
  [PeerConnectionState.CHANNEL_NEEDED]: [
    PeerConnectionState.CHANNEL_OPENING,
    PeerConnectionState.FAILED,
  ],
  [PeerConnectionState.CHANNEL_OPENING]: [
    PeerConnectionState.CONNECTED,
    PeerConnectionState.FAILED,
  ],
  [PeerConnectionState.CONNECTED]: [
    PeerConnectionState.DISCONNECTED,
    PeerConnectionState.FAILED,
  ],
  [PeerConnectionState.DISCONNECTED]: [
    PeerConnectionState.DISCOVERING,
    PeerConnectionState.FAILED,
  ],
  [PeerConnectionState.FAILED]: [
    PeerConnectionState.DISCOVERING,  // Manual retry only
  ],
}

/**
 * Event emitted when connection state changes
 */
export interface ConnectionStateChangeEvent {
  pubkey: string;
  oldState: PeerConnectionState;
  newState: PeerConnectionState;
  timestamp: number;
}

/**
 * Event emitted when a payment channel is needed
 */
export interface ChannelNeededEvent {
  pubkey: string;
  baseAddress: string;
  estimatedCost: string;
  timestamp: number;
}
