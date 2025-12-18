
/**
 * BTP-NIPs (Bitcoin Transfer Protocol for Nostr Implementation Possibilities)
 * Type definitions for embedding Nostr protocol messages in ILP STREAM packets
 *
 * Protocol Version: 1
 * Reference: docs/prd/epic-5-btp-nips-protocol.md
 */

/**
 * Nostr message types supported by BTP-NIPs protocol
 */
export enum NostrMessageType {
  /** Publish a new event */
  EVENT = 0x01,
  /** Subscribe to events (request) */
  REQ = 0x02,
  /** Unsubscribe from events */
  CLOSE = 0x03,
  /** Server notification to client */
  NOTICE = 0x04,
  /** End of stored events */
  EOSE = 0x05,
  /** Event acceptance confirmation */
  OK = 0x06,
  /** Authentication challenge/response */
  AUTH = 0x07,
}

/**
 * 4-byte binary header for BTP-NIPs packets
 */
export interface BTPNIPsHeader {
  /** Protocol version (currently 1) */
  version: number
  /** Message type (0x01-0x07) */
  messageType: NostrMessageType
  /** Payload length in bytes (max 65,535) */
  payloadLength: number
}

/**
 * Payment metadata embedded in BTP-NIPs messages
 */
export interface PaymentMetadata {
  /** Payment amount in smallest units (e.g., msats) */
  amount: string
  /** Currency code (e.g., "msat", "usd") */
  currency: string
  /** Purpose of payment (e.g., "event_publish", "subscription") */
  purpose: string
}

/**
 * Nostr event structure (kind 1 - short text note)
 * Reference: NIP-01
 */
export interface NostrEvent {
  /** Event ID (32-byte hex hash) */
  id: string
  /** Author's public key (32-byte hex) */
  pubkey: string
  /** Unix timestamp in seconds */
  created_at: number
  /** Event kind (determines interpretation) */
  kind: number
  /** Array of tags (e.g., [["e", "event_id"], ["p", "pubkey"]]) */
  tags: string[][]
  /** Event content (UTF-8 string) */
  content: string
  /** Schnorr signature (64-byte hex) */
  sig: string
}

/**
 * Nostr subscription filter
 * Reference: NIP-01
 */
export interface NostrFilter {
  /** Event IDs to match */
  ids?: string[]
  /** Author public keys to match */
  authors?: string[]
  /** Event kinds to match */
  kinds?: number[]
  /** Events with specific tag values */
  [key: `#${string}`]: string[] | undefined
  /** Events since timestamp (inclusive) */
  since?: number
  /** Events until timestamp (inclusive) */
  until?: number
  /** Maximum number of events to return */
  limit?: number
}

/**
 * Nostr REQ message structure
 * Reference: NIP-01
 */
export interface NostrReq {
  /** Client-generated subscription ID */
  subscriptionId: string
  /** Array of filters for events */
  filters: NostrFilter[]
}

/**
 * Nostr CLOSE message structure
 * Reference: NIP-01
 */
export interface NostrClose {
  /** Subscription ID to close */
  subscriptionId: string
}

/**
 * Nostr NOTICE message structure
 * Reference: NIP-01
 */
export interface NostrNotice {
  /** Human-readable message */
  message: string
}

/**
 * Nostr EOSE (End of Stored Events) message structure
 * Reference: NIP-01
 */
export interface NostrEOSE {
  /** Subscription ID that reached end of stored events */
  subscriptionId: string
}

/**
 * Nostr OK message structure
 * Reference: NIP-20
 */
export interface NostrOK {
  /** Event ID being acknowledged */
  eventId: string
  /** Whether event was accepted */
  accepted: boolean
  /** Optional message (error description if rejected) */
  message: string
}

/**
 * Nostr AUTH message structure
 * Reference: NIP-42
 */
export interface NostrAuth {
  /** Authentication challenge string */
  challenge: string
  /** Relay URL for authentication */
  relay?: string
}

/**
 * Union type of all possible Nostr messages
 */
export type NostrMessage =
  | NostrEvent
  | NostrReq
  | NostrClose
  | NostrNotice
  | NostrEOSE
  | NostrOK
  | NostrAuth

/**
 * Message metadata for BTP-NIPs packets
 */
export interface MessageMetadata {
  /** Unix timestamp when message was created */
  timestamp: number
  /** ILP address of sender (e.g., "g.dassie.alice") */
  sender: string
  /** Optional time-to-live in seconds */
  ttl?: number
}

/**
 * JSON payload embedded in BTP-NIPs packets
 */
export interface BTPNIPsPayload {
  /** Payment information */
  payment: PaymentMetadata
  /** Nostr protocol message */
  nostr: NostrMessage
  /** Additional message metadata */
  metadata: MessageMetadata
}

/**
 * Complete BTP-NIPs packet structure
 * Consists of 4-byte header + variable-length JSON payload
 */
export interface BTPNIPsPacket {
  /** Packet header (version, messageType, payloadLength) */
  header: BTPNIPsHeader
  /** JSON payload (payment, nostr, metadata) */
  payload: BTPNIPsPayload
}

// Export ILP node announcement types
export * from './ilp-node-announcement'

// Export ILP peer info types (Story 6.2)
export type { ILPPeerInfo } from './ilp-peer-info'
export { parseNodeAnnouncement } from './ilp-peer-info'

// Export peer connection types (Story 6.5)
export type {
  PeerConnection,
  ConnectionConfig,
  PriorityContext,
  ConnectionStateChangeEvent,
  ChannelNeededEvent,
} from './peer-connection'
export {
  PeerConnectionState,
  DEFAULT_CONNECTION_CONFIG,
  VALID_STATE_TRANSITIONS,
} from './peer-connection'
