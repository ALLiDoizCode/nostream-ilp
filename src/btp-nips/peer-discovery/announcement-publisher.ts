import { EventRepository } from '../storage/event-repository.js'
import { generateIlpAddress } from './ilp-address-generator.js'
import { getPublicKey, signEvent } from '../crypto.js'
import {
  ILP_NODE_D_TAG,
  ILP_NODE_KIND,
  ILPNodeTag,
} from '../types/ilp-node-announcement.js'
import {
  ILPNodeAnnouncement,
  ILPNodeMetadata,
} from '../types/ilp-node-announcement.js'

import type { _NostrEvent } from '../types/index.js'

/**
 * ILP Node Announcement Publisher
 * Publishes and updates ILP node announcements (Kind 32001)
 *
 * Epic 6: Peer Networking & Social Graph Integration
 * Story 6.1: ILP Node Announcement
 *
 * Reference: docs/stories/6.1.story.md
 */


/**
 * Configuration for node announcement publisher
 */
export interface NodeAnnouncementConfig {
  /** Public HTTPS endpoint for ILP node */
  endpoint: string
  /** Base L2 wallet address (Ethereum format: 0x...) */
  baseAddress: string
  /** Array of supported payment tokens */
  supportedTokens: string[]
  /** Protocol version (semver format) */
  version?: string
  /** Array of node features/capabilities */
  features?: string[]
  /** Optional metadata for announcement content */
  metadata?: Partial<ILPNodeMetadata>
}

/**
 * In-memory cached announcement
 */
interface CachedAnnouncement {
  event: ILPNodeAnnouncement
  publishedAt: number
}

/**
 * Node Announcement Publisher
 *
 * Publishes and manages ILP node announcements (Kind 32001).
 * Auto-publishes on startup and when configuration changes.
 *
 * @example
 * ```typescript
 * const publisher = new NodeAnnouncementPublisher(eventRepository, {
 *   endpoint: 'https://alice-node.akash.network',
 *   baseAddress: '0x123abc...',
 *   supportedTokens: ['eth', 'usdc'],
 *   version: '1.0.0',
 *   features: ['subscriptions', 'payments', 'routing']
 * });
 *
 * const privateKey = Buffer.from('...', 'hex');
 * await publisher.publishAnnouncement('alice', privateKey);
 * ```
 */
export class NodeAnnouncementPublisher {
  private eventRepository: EventRepository
  private config: NodeAnnouncementConfig
  private cachedAnnouncement: CachedAnnouncement | null = null

  constructor(
    eventRepository: EventRepository,
    config: NodeAnnouncementConfig,
  ) {
    this.eventRepository = eventRepository
    this.config = config
  }

  /**
   * Publish ILP node announcement
   *
   * Creates, signs, and publishes a Kind 32001 event with node information.
   * Caches the published announcement in memory for quick access.
   *
   * @param nodeId - Unique node identifier (alphanumeric, lowercase)
   * @param privateKey - 32-byte private key for signing
   * @returns Published and signed announcement event
   * @throws Error if nodeId is invalid, config is missing required fields, or signing fails
   *
   * @example
   * ```typescript
   * const privateKey = Buffer.from('...', 'hex');
   * const announcement = await publisher.publishAnnouncement('alice', privateKey);
   * console.log('Published announcement:', announcement.id);
   * ```
   */
  async publishAnnouncement(
    nodeId: string,
    privateKey: Buffer | Uint8Array,
  ): Promise<ILPNodeAnnouncement> {
    // Derive public key from private key
    const pubkey = getPublicKey(privateKey)

    // Generate ILP address
    const ilpAddress = generateIlpAddress(nodeId, pubkey)

    // Build announcement tags
    const tags: string[][] = [
      [ILPNodeTag.D, ILP_NODE_D_TAG],
      [ILPNodeTag.ILP_ADDRESS, ilpAddress],
      [ILPNodeTag.ILP_ENDPOINT, this.config.endpoint],
      [ILPNodeTag.BASE_ADDRESS, this.config.baseAddress],
      [
        ILPNodeTag.SUPPORTED_TOKENS,
        this.config.supportedTokens.join(','),
      ],
      [ILPNodeTag.VERSION, this.config.version ?? '1.0.0'],
      [
        ILPNodeTag.FEATURES,
        (this.config.features ?? ['subscriptions', 'payments']).join(','),
      ],
    ]

    // Build content metadata (optional)
    const metadata: ILPNodeMetadata = {
      nodeId,
      lastUpdated: Math.floor(Date.now() / 1000),
      ...this.config.metadata,
    }

    // Create unsigned event
    const unsignedEvent = {
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind: ILP_NODE_KIND,
      tags,
      content: JSON.stringify(metadata),
    }

    // Sign event
    const signedEvent = await signEvent(unsignedEvent, privateKey)

    // Save to repository
    await this.eventRepository.saveEvent(signedEvent)

    // Cache announcement
    const announcement = signedEvent as ILPNodeAnnouncement
    this.cachedAnnouncement = {
      event: announcement,
      publishedAt: Date.now(),
    }

    return announcement
  }

  /**
   * Update announcement with configuration changes
   *
   * Creates and publishes a new announcement with updated configuration.
   * Since Kind 32001 is a parameterized replaceable event (NIP-33),
   * the new announcement automatically replaces the old one (same 'd' tag).
   *
   * @param changes - Partial configuration changes to apply
   * @param nodeId - Node identifier (must match original)
   * @param privateKey - Private key for signing (must match original pubkey)
   * @returns Updated announcement event
   *
   * @example
   * ```typescript
   * // Update endpoint after Akash deployment
   * const updated = await publisher.updateAnnouncement(
   *   { endpoint: 'https://new-endpoint.akash.network' },
   *   'alice',
   *   privateKey
   * );
   * ```
   */
  async updateAnnouncement(
    changes: Partial<NodeAnnouncementConfig>,
    nodeId: string,
    privateKey: Buffer | Uint8Array,
  ): Promise<ILPNodeAnnouncement> {
    // Merge config changes
    this.config = {
      ...this.config,
      ...changes,
      metadata: {
        ...this.config.metadata,
        ...changes.metadata,
      },
    }

    // Publish updated announcement
    return this.publishAnnouncement(nodeId, privateKey)
  }

  /**
   * Get cached announcement (if available)
   *
   * Returns the most recently published announcement from memory cache.
   * Returns null if no announcement has been published yet.
   *
   * @returns Cached announcement or null
   *
   * @example
   * ```typescript
   * const cached = publisher.getCachedAnnouncement();
   * if (cached) {
   *   console.log('Last published:', new Date(cached.publishedAt));
   * }
   * ```
   */
  getCachedAnnouncement(): CachedAnnouncement | null {
    return this.cachedAnnouncement
  }

  /**
   * Update configuration (does not re-publish)
   *
   * Updates the internal configuration without publishing a new announcement.
   * Call `publishAnnouncement()` or `updateAnnouncement()` to publish changes.
   *
   * @param config - New configuration to apply
   *
   * @example
   * ```typescript
   * publisher.updateConfig({
   *   supportedTokens: ['eth', 'usdc', 'akt']
   * });
   * // Must call publishAnnouncement() to broadcast changes
   * ```
   */
  updateConfig(config: Partial<NodeAnnouncementConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      metadata: {
        ...this.config.metadata,
        ...config.metadata,
      },
    }
  }

  /**
   * Get current configuration
   *
   * @returns Current announcement configuration
   */
  getConfig(): NodeAnnouncementConfig {
    return { ...this.config }
  }
}
