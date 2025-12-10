import { parseNodeAnnouncement } from '../types/ilp-peer-info.js'
import pino from 'pino'

import type { ILPPeerInfo } from '../types/ilp-peer-info.js'
import type { AnnouncementQuery } from './announcement-query.js'

/**
 * ILP Address Resolver Module
 * Resolves Nostr pubkeys to ILP peer information
 *
 * Epic 6: Peer Networking & Social Graph Integration
 * Story 6.2: Nostr-to-ILP Address Resolution
 *
 * Reference: docs/stories/6.2.story.md
 */

const logger = pino({ name: 'address-resolver' })

/**
 * Address Resolver
 *
 * Provides resolution from Nostr public keys to ILP peer information.
 * Used for peer discovery and connection management.
 *
 * Caching is handled by the underlying AnnouncementQuery module.
 * Resolution follows cache-aside pattern with 1-hour TTL.
 *
 * @example
 * ```typescript
 * const resolver = new AddressResolver(announcementQuery);
 *
 * // Single resolution
 * const peerInfo = await resolver.resolveIlpAddress(bobPubkey);
 * if (peerInfo) {
 *   console.log('ILP address:', peerInfo.ilpAddress);
 *   console.log('Endpoint:', peerInfo.endpoint);
 *   console.log('Tokens:', peerInfo.supportedTokens);
 * } else {
 *   console.log('Peer not on BTP-NIPs network');
 * }
 *
 * // Batch resolution (follow list)
 * const followList = ['alice_pubkey', 'bob_pubkey', 'carol_pubkey'];
 * const peers = await resolver.batchResolveIlpAddresses(followList);
 *
 * for (const [pubkey, peerInfo] of peers) {
 *   console.log(`${pubkey} → ${peerInfo.ilpAddress}`);
 * }
 *
 * // Force refresh stale data
 * const fresh = await resolver.refreshPeerInfo(bobPubkey);
 * ```
 */
export class AddressResolver {
  private announcementQuery: AnnouncementQuery

  /**
   * Create new address resolver
   *
   * @param announcementQuery - Announcement query instance for fetching announcements
   */
  constructor(announcementQuery: AnnouncementQuery) {
    this.announcementQuery = announcementQuery
  }

  /**
   * Resolve Nostr pubkey to ILP peer information
   *
   * Queries for Kind 32001 announcement and extracts ILP peer info.
   * Returns null if peer has not published announcement.
   *
   * @param nostrPubkey - Nostr public key (64-char hex)
   * @returns ILP peer info or null if not found
   *
   * @example
   * ```typescript
   * const peerInfo = await resolver.resolveIlpAddress(bobPubkey);
   * if (!peerInfo) {
   *   console.log('Peer not available on BTP-NIPs network');
   *   return;
   * }
   *
   * // Use peer info for ILP routing
   * const payment = await ilp.sendPayment(peerInfo.ilpAddress, amount);
   * ```
   */
  async resolveIlpAddress(nostrPubkey: string): Promise<ILPPeerInfo | null> {
    // Query announcement (uses cache if available)
    const announcement =
      await this.announcementQuery.queryNodeAnnouncement(nostrPubkey)

    if (!announcement) {
      logger.warn(
        { pubkey: nostrPubkey },
        'ILP node announcement not found for peer',
      )
      return null
    }

    // Parse announcement to peer info
    const peerInfo = parseNodeAnnouncement(announcement)

    if (!peerInfo) {
      logger.warn(
        { pubkey: nostrPubkey },
        'Invalid ILP node announcement - missing required tags',
      )
      return null
    }

    logger.debug(
      { pubkey: nostrPubkey, ilpAddress: peerInfo.ilpAddress },
      'Resolved ILP address for peer',
    )

    return peerInfo
  }

  /**
   * Batch resolve ILP addresses for multiple pubkeys
   *
   * More efficient than calling resolveIlpAddress() multiple times.
   * Uses single database query for all pubkeys.
   *
   * Only returns entries for successfully resolved peers.
   * Missing or invalid announcements are excluded from result.
   *
   * @param pubkeys - Array of Nostr public keys to resolve
   * @returns Map of pubkey → ILP peer info (only successful resolutions)
   *
   * @example
   * ```typescript
   * const followList = ['alice_pubkey', 'bob_pubkey', 'carol_pubkey'];
   * const peers = await resolver.batchResolveIlpAddresses(followList);
   *
   * console.log(`Resolved ${peers.size}/${followList.length} peers`);
   *
   * for (const [pubkey, peerInfo] of peers) {
   *   console.log(`${pubkey}:`);
   *   console.log(`  ILP address: ${peerInfo.ilpAddress}`);
   *   console.log(`  Endpoint: ${peerInfo.endpoint}`);
   *   console.log(`  Tokens: ${peerInfo.supportedTokens.join(', ')}`);
   * }
   * ```
   */
  async batchResolveIlpAddresses(
    pubkeys: string[],
  ): Promise<Map<string, ILPPeerInfo>> {
    if (pubkeys.length === 0) {
      return new Map()
    }

    // Batch query announcements
    const announcements =
      await this.announcementQuery.batchQueryAnnouncements(pubkeys)

    // Convert announcements to peer info
    const results = new Map<string, ILPPeerInfo>()

    for (const [pubkey, announcement] of announcements) {
      const peerInfo = parseNodeAnnouncement(announcement)
      if (peerInfo) {
        results.set(pubkey, peerInfo)
      } else {
        logger.warn(
          { pubkey },
          'Invalid announcement in batch resolution - skipping',
        )
      }
    }

    logger.info(
      { count: pubkeys.length, resolved: results.size },
      'Batch resolved ILP addresses',
    )

    return results
  }

  /**
   * Force refresh peer info from database
   *
   * Invalidates cache and queries database for latest announcement.
   * Use when you need fresh data (e.g., after peer publishes new announcement).
   *
   * @param pubkey - Nostr public key to refresh
   * @returns Fresh ILP peer info or null if not found
   *
   * @example
   * ```typescript
   * // After receiving announcement event
   * if (event.kind === 32001 && event.pubkey === trackedPeerPubkey) {
   *   // Refresh cached peer info
   *   const freshInfo = await resolver.refreshPeerInfo(event.pubkey);
   *   console.log('Updated peer info:', freshInfo);
   * }
   * ```
   */
  async refreshPeerInfo(pubkey: string): Promise<ILPPeerInfo | null> {
    // Invalidate cache
    await this.announcementQuery.invalidateCache(pubkey)

    // Re-query (will fetch fresh from database)
    return this.resolveIlpAddress(pubkey)
  }
}
