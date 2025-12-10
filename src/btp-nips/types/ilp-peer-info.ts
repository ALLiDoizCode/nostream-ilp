import {

import type { ILPNodeAnnouncement, ILPNodeMetadata } from './ilp-node-announcement.js'

/**
 * ILP Peer Information Type
 * Aggregated peer data for ILP routing and connection management
 *
 * Epic 6: Peer Networking & Social Graph Integration
 * Story 6.2: Nostr-to-ILP Address Resolution
 *
 * Reference: docs/stories/6.2.story.md
 * Reference: docs/prd/epic-6-peer-networking.md
 */

  parseAnnouncementMetadata,
  parseAnnouncementTags,
} from './ilp-node-announcement.js'

/**
 * ILP Peer Information
 * Aggregates all peer data needed for ILP routing and connection management
 *
 * This type is constructed from ILPNodeAnnouncement (Kind 32001) events,
 * combining tag data with optional metadata from the content field.
 *
 * @example
 * ```typescript
 * const peerInfo: ILPPeerInfo = {
 *   pubkey: 'abc123...',
 *   ilpAddress: 'g.btp-nips.alice.npub1abc123def4567',
 *   endpoint: 'https://alice-node.akash.network',
 *   baseAddress: '0x123abc...',
 *   supportedTokens: ['eth', 'usdc'],
 *   version: '1.0.0',
 *   features: ['subscriptions', 'payments', 'routing'],
 *   metadata: {
 *     nodeId: 'alice',
 *     operatorName: 'Alice\'s Relay',
 *     uptime: 99.9
 *   }
 * }
 * ```
 */
export interface ILPPeerInfo {
  /** Nostr public key (64-char hex) */
  pubkey: string
  /** ILP address (e.g., g.btp-nips.alice.npub1abc123def4567) */
  ilpAddress: string
  /** HTTPS endpoint (e.g., https://alice-node.akash.network) */
  endpoint: string
  /** Base L2 wallet address (0x...) */
  baseAddress: string
  /** Payment tokens (e.g., ['eth', 'usdc']) */
  supportedTokens: string[]
  /** Protocol version (semver) */
  version: string
  /** Node capabilities (e.g., ['subscriptions', 'payments']) */
  features: string[]
  /** Optional metadata from content field */
  metadata?: ILPNodeMetadata
}

/**
 * Parse ILP Node Announcement to ILP Peer Info
 *
 * Converts a Kind 32001 announcement event into structured peer information
 * suitable for ILP routing and connection management.
 *
 * @param announcement - ILP node announcement event (Kind 32001)
 * @returns Parsed peer info or null if required tags missing
 *
 * @example
 * ```typescript
 * const announcement = await storage.queryEvents({
 *   kinds: [32001],
 *   authors: [pubkey],
 *   '#d': ['ilp-node-info'],
 *   limit: 1
 * })
 *
 * const peerInfo = parseNodeAnnouncement(announcement)
 * if (peerInfo) {
 *   console.log('ILP address:', peerInfo.ilpAddress)
 *   console.log('Endpoint:', peerInfo.endpoint)
 *   console.log('Supported tokens:', peerInfo.supportedTokens)
 * } else {
 *   console.warn('Invalid announcement - missing required tags')
 * }
 * ```
 */
export function parseNodeAnnouncement(
  announcement: ILPNodeAnnouncement,
): ILPPeerInfo | null {
  // Parse tags using existing helper from Story 6.1
  const tags = parseAnnouncementTags(announcement)
  if (!tags) {
    // Missing required tags
    return null
  }

  // Parse optional metadata from content field
  const metadata = parseAnnouncementMetadata(announcement)

  // Build ILPPeerInfo object
  return {
    pubkey: announcement.pubkey,
    ilpAddress: tags.ilpAddress,
    endpoint: tags.ilpEndpoint,
    baseAddress: tags.baseAddress,
    supportedTokens: tags.supportedTokens,
    version: tags.version,
    features: tags.features,
    metadata: metadata ?? undefined,
  }
}
