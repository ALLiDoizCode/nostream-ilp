import type { NostrEvent } from './index.js'

/**
 * ILP Node Announcement (Kind 32001)
 * Type definitions for peer discovery via Nostr events
 *
 * Epic 6: Peer Networking & Social Graph Integration
 * Story 6.1: ILP Node Announcement
 *
 * Reference: docs/stories/6.1.story.md
 * Reference: docs/prd/epic-6-peer-networking.md
 */

/**
 * ILP Node Announcement event kind
 * NIP-33 parameterized replaceable event
 */
export const ILP_NODE_KIND = 32001

/**
 * D-tag identifier for ILP node announcements
 * Required for NIP-33 parameterized replaceable events
 */
export const ILP_NODE_D_TAG = 'ilp-node-info'

/**
 * Tag names for ILP node announcement
 */
export enum ILPNodeTag {
  /** Parameterized replaceable event identifier */
  D = 'd',
  /** ILP address (e.g., g.btp-nips.alice.npub1abc123) */
  ILP_ADDRESS = 'ilp-address',
  /** Public HTTPS endpoint (e.g., https://alice-node.akash.network) */
  ILP_ENDPOINT = 'ilp-endpoint',
  /** Base L2 wallet address (0x...) */
  BASE_ADDRESS = 'base-address',
  /** Supported payment tokens (comma-separated) */
  SUPPORTED_TOKENS = 'supported-tokens',
  /** Protocol version (semver format) */
  VERSION = 'version',
  /** Node capabilities (comma-separated features) */
  FEATURES = 'features',
}

/**
 * ILP Node Announcement event structure
 * Extends NostrEvent with specific Kind 32001 requirements
 *
 * @example
 * ```typescript
 * const announcement: ILPNodeAnnouncement = {
 *   id: '...',
 *   pubkey: 'abc123...',
 *   created_at: 1701964800,
 *   kind: 32001,
 *   tags: [
 *     ['d', 'ilp-node-info'],
 *     ['ilp-address', 'g.btp-nips.alice.npub1abc123def4567'],
 *     ['ilp-endpoint', 'https://alice-node.akash.network'],
 *     ['base-address', '0x123abc...'],
 *     ['supported-tokens', 'eth,usdc'],
 *     ['version', '1.0.0'],
 *     ['features', 'subscriptions,payments,routing']
 *   ],
 *   content: JSON.stringify({ nodeId: 'alice', ... }),
 *   sig: '...'
 * }
 * ```
 */
export interface ILPNodeAnnouncement extends NostrEvent {
  /** Event kind must be 32001 */
  kind: typeof ILP_NODE_KIND
  /** Tags array with required ILP node metadata */
  tags: [
    [ILPNodeTag.D, typeof ILP_NODE_D_TAG],
    [ILPNodeTag.ILP_ADDRESS, string],
    [ILPNodeTag.ILP_ENDPOINT, string],
    [ILPNodeTag.BASE_ADDRESS, string],
    [ILPNodeTag.SUPPORTED_TOKENS, string],
    [ILPNodeTag.VERSION, string],
    [ILPNodeTag.FEATURES, string],
    ...string[][],
  ]
  /** JSON-encoded metadata (optional) */
  content: string
}

/**
 * Metadata stored in the content field (optional)
 * Contains human-readable information and additional details
 *
 * @example
 * ```typescript
 * const metadata: ILPNodeMetadata = {
 *   nodeId: 'alice',
 *   operatorName: 'Alice\'s Relay',
 *   description: 'High-performance relay with ILP payments',
 *   geolocation: { country: 'US', city: 'San Francisco' },
 *   uptime: 99.9,
 *   lastUpdated: 1701964800
 * }
 * ```
 */
export interface ILPNodeMetadata {
  /** Unique node identifier (alphanumeric, lowercase) */
  nodeId: string
  /** Human-readable operator name (optional) */
  operatorName?: string
  /** Node description (optional) */
  description?: string
  /** Geolocation information (optional) */
  geolocation?: {
    /** ISO country code (e.g., "US", "DE") */
    country: string
    /** City name (optional) */
    city?: string
  }
  /** Uptime percentage (0-100, optional) */
  uptime?: number
  /** Unix timestamp of last update */
  lastUpdated: number
}

/**
 * Parse result for ILP node announcement tags
 */
export interface ParsedAnnouncementTags {
  /** ILP address (e.g., g.btp-nips.alice.npub1abc123) */
  ilpAddress: string
  /** Public HTTPS endpoint */
  ilpEndpoint: string
  /** Base L2 wallet address */
  baseAddress: string
  /** Array of supported token symbols */
  supportedTokens: string[]
  /** Protocol version (semver) */
  version: string
  /** Array of node features */
  features: string[]
}

/**
 * Extract ILP address from announcement tags
 *
 * @param event - ILP node announcement event
 * @returns ILP address string or null if not found
 *
 * @example
 * ```typescript
 * const address = extractIlpAddress(announcement)
 * // Returns: 'g.btp-nips.alice.npub1abc123def4567'
 * ```
 */
export function extractIlpAddress(event: NostrEvent): string | null {
  const tag = event.tags.find(([key]) => key === ILPNodeTag.ILP_ADDRESS)
  return tag?.[1] ?? null
}

/**
 * Extract ILP endpoint from announcement tags
 *
 * @param event - ILP node announcement event
 * @returns HTTPS endpoint URL or null if not found
 *
 * @example
 * ```typescript
 * const endpoint = extractEndpoint(announcement)
 * // Returns: 'https://alice-node.akash.network'
 * ```
 */
export function extractEndpoint(event: NostrEvent): string | null {
  const tag = event.tags.find(([key]) => key === ILPNodeTag.ILP_ENDPOINT)
  return tag?.[1] ?? null
}

/**
 * Extract Base L2 address from announcement tags
 *
 * @param event - ILP node announcement event
 * @returns Ethereum address or null if not found
 *
 * @example
 * ```typescript
 * const baseAddr = extractBaseAddress(announcement)
 * // Returns: '0x123abc...'
 * ```
 */
export function extractBaseAddress(event: NostrEvent): string | null {
  const tag = event.tags.find(([key]) => key === ILPNodeTag.BASE_ADDRESS)
  return tag?.[1] ?? null
}

/**
 * Extract supported tokens from announcement tags
 *
 * @param event - ILP node announcement event
 * @returns Array of token symbols or empty array if not found
 *
 * @example
 * ```typescript
 * const tokens = extractSupportedTokens(announcement)
 * // Returns: ['eth', 'usdc']
 * ```
 */
export function extractSupportedTokens(event: NostrEvent): string[] {
  const tag = event.tags.find(([key]) => key === ILPNodeTag.SUPPORTED_TOKENS)
  return tag?.[1]?.split(',').map((t) => t.trim()) ?? []
}

/**
 * Extract version from announcement tags
 *
 * @param event - ILP node announcement event
 * @returns Version string or null if not found
 *
 * @example
 * ```typescript
 * const version = extractVersion(announcement)
 * // Returns: '1.0.0'
 * ```
 */
export function extractVersion(event: NostrEvent): string | null {
  const tag = event.tags.find(([key]) => key === ILPNodeTag.VERSION)
  return tag?.[1] ?? null
}

/**
 * Extract features from announcement tags
 *
 * @param event - ILP node announcement event
 * @returns Array of feature strings or empty array if not found
 *
 * @example
 * ```typescript
 * const features = extractFeatures(announcement)
 * // Returns: ['subscriptions', 'payments', 'routing']
 * ```
 */
export function extractFeatures(event: NostrEvent): string[] {
  const tag = event.tags.find(([key]) => key === ILPNodeTag.FEATURES)
  return tag?.[1]?.split(',').map((f) => f.trim()) ?? []
}

/**
 * Parse all announcement tags into structured object
 *
 * @param event - ILP node announcement event
 * @returns Parsed tags or null if required tags missing
 *
 * @example
 * ```typescript
 * const parsed = parseAnnouncementTags(announcement)
 * if (parsed) {
 *   console.log(parsed.ilpAddress)
 *   console.log(parsed.supportedTokens)
 * }
 * ```
 */
export function parseAnnouncementTags(
  event: NostrEvent,
): ParsedAnnouncementTags | null {
  const ilpAddress = extractIlpAddress(event)
  const ilpEndpoint = extractEndpoint(event)
  const baseAddress = extractBaseAddress(event)
  const version = extractVersion(event)

  // All required tags must be present
  if (!ilpAddress || !ilpEndpoint || !baseAddress || !version) {
    return null
  }

  return {
    ilpAddress,
    ilpEndpoint,
    baseAddress,
    supportedTokens: extractSupportedTokens(event),
    version,
    features: extractFeatures(event),
  }
}

/**
 * Parse metadata from announcement content field
 *
 * @param event - ILP node announcement event
 * @returns Parsed metadata or null if invalid JSON or empty
 *
 * @example
 * ```typescript
 * const metadata = parseAnnouncementMetadata(announcement)
 * if (metadata) {
 *   console.log(metadata.nodeId)
 *   console.log(metadata.operatorName)
 * }
 * ```
 */
export function parseAnnouncementMetadata(
  event: NostrEvent,
): ILPNodeMetadata | null {
  if (!event.content || event.content.trim() === '') {
    return null
  }

  try {
    return JSON.parse(event.content) as ILPNodeMetadata
  } catch {
    return null
  }
}
