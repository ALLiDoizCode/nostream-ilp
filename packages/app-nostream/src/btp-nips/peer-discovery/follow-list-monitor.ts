import { createLogger } from '../../factories/logger-factory'

import type { EventRepository } from '../storage/event-repository'
import type { NostrEvent } from '../types/index'
import type { AddressResolver } from './address-resolver'
import type { ConnectionLifecycleManager } from './connection-lifecycle'
import type { FollowListStore } from './follow-list-store'

/**
 * Follow List Monitor Module
 *
 * Monitors Nostr Kind 3 (Contact List) events and detects follow/unfollow actions.
 * Triggers callbacks when users add or remove follows from their contact list.
 *
 * Story 6.5: Integrated with ConnectionLifecycleManager to automatically
 * establish connections to followed peers.
 *
 * @module btp-nips/peer-discovery/follow-list-monitor
 */



const debug = createLogger('btp-nips:follow-list-monitor')

/**
 * Callback function invoked when a follow is added
 */
export type OnFollowAddedCallback = (pubkey: string) => void | Promise<void>

/**
 * Callback function invoked when a follow is removed
 */
export type OnFollowRemovedCallback = (pubkey: string) => void | Promise<void>

/**
 * Follow List Monitor
 *
 * Watches for Kind 3 (Contact List) events from local users and detects
 * additions/removals. Triggers callbacks for auto-subscription logic.
 *
 * Story 6.5: Now integrates with ConnectionLifecycleManager to automatically
 * establish high-priority connections to followed peers.
 *
 * Usage:
 * ```typescript
 * const monitor = new FollowListMonitor(
 *   eventRepository,
 *   addressResolver,
 *   followListStore,
 *   connectionLifecycleManager  // Optional for Story 6.5 integration
 * );
 *
 * monitor.onFollowAdded = async (pubkey) => {
 *   await autoSubscriber.subscribeToUser(pubkey);
 * };
 *
 * monitor.onFollowRemoved = async (pubkey) => {
 *   await autoSubscriber.unsubscribeFromPeer(pubkey);
 * };
 *
 * monitor.watchForFollowListUpdates('local_user_pubkey');
 * ```
 */
export class FollowListMonitor {
  private eventRepository: EventRepository
  private addressResolver: AddressResolver
  private followListStore: FollowListStore
  private connectionLifecycleManager?: ConnectionLifecycleManager
  private watchedPubkeys: Set<string> = new Set()

  /**
   * Callback invoked when a follow is added
   */
  public onFollowAdded?: OnFollowAddedCallback

  /**
   * Callback invoked when a follow is removed
   */
  public onFollowRemoved?: OnFollowRemovedCallback

  /**
   * Create a FollowListMonitor instance
   *
   * @param eventRepository - Event storage for querying Kind 3 events
   * @param addressResolver - Resolver for ILP addresses (unused in this module, reserved for future)
   * @param followListStore - Storage for follow lists
   * @param connectionLifecycleManager - Optional connection lifecycle manager (Story 6.5)
   */
  constructor(
    eventRepository: EventRepository,
    addressResolver: AddressResolver,
    followListStore: FollowListStore,
    connectionLifecycleManager?: ConnectionLifecycleManager
  ) {
    this.eventRepository = eventRepository
    this.addressResolver = addressResolver
    this.followListStore = followListStore
    this.connectionLifecycleManager = connectionLifecycleManager
  }

  /**
   * Start watching for Kind 3 (Contact List) events for a local user
   *
   * This method subscribes to Kind 3 events for the specified pubkey and
   * triggers follow list update handling whenever a new event is received.
   *
   * @param localPubkey - The local user's public key to monitor
   *
   * @example
   * ```typescript
   * monitor.watchForFollowListUpdates('abcd1234...');
   * // Will call handleFollowListUpdate() whenever this user publishes a new Kind 3 event
   * ```
   */
  watchForFollowListUpdates(localPubkey: string): void {
    if (this.watchedPubkeys.has(localPubkey)) {
      debug('Already watching follow list for pubkey %s', localPubkey.substring(0, 8))
      return
    }

    this.watchedPubkeys.add(localPubkey)

    debug('Started watching follow list updates for pubkey %s', localPubkey.substring(0, 8))

    // Subscribe to Kind 3 events for this user
    this.eventRepository.subscribeToKind3Events(localPubkey, async (event: NostrEvent) => {
      debug('Received Kind 3 event %s from %s', event.id, event.pubkey.substring(0, 8))
      await this.handleFollowListUpdate(event)
    })
  }

  /**
   * Handle a new Kind 3 (Contact List) event
   *
   * Extracts followed pubkeys from the event, compares with the stored follow list,
   * calculates additions/removals, and triggers appropriate callbacks.
   *
   * @param followList - The Kind 3 event to process
   *
   * @example
   * ```typescript
   * await monitor.handleFollowListUpdate(kind3Event);
   * // Calls onFollowAdded for new follows, onFollowRemoved for unfollows
   * ```
   */
  async handleFollowListUpdate(followList: NostrEvent): Promise<void> {
    try {
      if (followList.kind !== 3) {
        debug('Ignoring non-Kind-3 event: kind=%d', followList.kind)
        return
      }

      // Extract current follows from event
      const currentFollows = this.extractFollowedPubkeys(followList)

      // Load previous follows from storage
      const previousFollows = await this.followListStore.getFollowList(followList.pubkey)

      // Calculate diff
      const added = currentFollows.filter(p => !previousFollows.includes(p))
      const removed = previousFollows.filter(p => !currentFollows.includes(p))

      debug(
        'Follow list diff for %s: added=%d, removed=%d',
        followList.pubkey.substring(0, 8),
        added.length,
        removed.length
      )

      // Trigger callbacks for added follows
      for (const pubkey of added) {
        debug('Follow added: %s', pubkey.substring(0, 8))

        // Story 6.5: Create high-priority connection for followed peer
        if (this.connectionLifecycleManager) {
          try {
            await this.connectionLifecycleManager.connect(pubkey, 1) // Priority 1 = highest
            debug('Created high-priority connection for followed peer: %s', pubkey.substring(0, 8))
          } catch (error) {
            debug('Error creating connection for followed peer %s: %O', pubkey.substring(0, 8), error)
          }
        }

        // Execute custom callback
        if (this.onFollowAdded) {
          await this.onFollowAdded(pubkey)
        }
      }

      // Trigger callbacks for removed follows
      for (const pubkey of removed) {
        debug('Follow removed: %s', pubkey.substring(0, 8))

        // Story 6.5: Disconnect from unfollowed peer
        if (this.connectionLifecycleManager) {
          try {
            await this.connectionLifecycleManager.disconnect(pubkey)
            debug('Disconnected from unfollowed peer: %s', pubkey.substring(0, 8))
          } catch (error) {
            debug('Error disconnecting from unfollowed peer %s: %O', pubkey.substring(0, 8), error)
          }
        }

        // Execute custom callback
        if (this.onFollowRemoved) {
          await this.onFollowRemoved(pubkey)
        }
      }

      // Update stored follow list
      await this.followListStore.setFollowList(followList.pubkey, currentFollows)

      debug(
        'Updated follow list for %s: %d follows',
        followList.pubkey.substring(0, 8),
        currentFollows.length
      )
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      debug('Failed to handle follow list update: %s', errorMessage)
      throw error
    }
  }

  /**
   * Extract followed pubkeys from a Kind 3 event
   *
   * Filters tags for ["p", pubkey] format and validates pubkey length.
   *
   * @param event - The Kind 3 event
   * @returns Array of followed pubkeys (64-character hex strings)
   *
   * @example
   * ```typescript
   * const follows = monitor.extractFollowedPubkeys(kind3Event);
   * // Returns: ['abc123...', 'def456...']
   * ```
   */
  extractFollowedPubkeys(event: NostrEvent): string[] {
    if (event.kind !== 3) {
      throw new Error('Not a Kind 3 event')
    }

    return event.tags
      .filter(tag => tag[0] === 'p' && tag.length >= 2)
      .map(tag => tag[1])
      .filter(pubkey => pubkey.length === 64) // Valid pubkey length (32 bytes hex)
  }

  /**
   * Stop watching for follow list updates
   *
   * @param localPubkey - The public key to stop monitoring
   */
  stopWatching(localPubkey: string): void {
    this.watchedPubkeys.delete(localPubkey)
    debug('Stopped watching follow list updates for pubkey %s', localPubkey.substring(0, 8))
  }

  /**
   * Get list of currently watched pubkeys
   *
   * @returns Set of pubkeys being monitored
   */
  getWatchedPubkeys(): Set<string> {
    return new Set(this.watchedPubkeys)
  }
}
