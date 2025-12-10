import { EventCache, getEventCache } from '../storage/event-cache.js'
import { EventRepository, getEventRepository } from '../storage/event-repository.js'
import { createLogger } from '../../factories/logger-factory'
import { getMasterDbClient } from '../../database/client'

import type { Knex } from 'knex'
import type { NostrEvent, NostrFilter } from '../types/index.js'

/**
 * BTP-NIPs Deletion Handler (NIP-09)
 *
 * Handles event deletion requests per NIP-09 specification.
 * Supports both individual event deletion (e tags) and addressable event deletion (a tags).
 *
 * @module btp-nips/utils/deletion-handler
 */


const debug = createLogger('btp-nips:deletion-handler')

/**
 * Deletion Handler for NIP-09 event deletion
 *
 * Implements Nostr event deletion protocol:
 * - Verifies deletion requester is the original event author
 * - Marks events as deleted (soft delete via is_deleted flag)
 * - Invalidates cache entries for deleted events
 * - Supports both individual event IDs (e tags) and addressable coordinates (a tags)
 */
export class DeletionHandler {
  private repository: EventRepository
  private cache: EventCache

  constructor(repository?: EventRepository, cache?: EventCache) {
    this.repository = repository ?? getEventRepository()
    this.cache = cache ?? getEventCache()
  }

  /**
   * Mark an event as deleted in the database.
   *
   * Verifies that the deleter is the original event author before marking as deleted.
   * This is a soft delete - the event remains in the database but is excluded from queries.
   *
   * @param eventId - The ID of the event to delete
   * @param deleterPubkey - The public key of the user requesting deletion
   * @throws Error if event not found or deleter is not the author
   * @returns Promise that resolves when deletion is complete
   *
   * @example
   * ```typescript
   * const handler = new DeletionHandler();
   * await handler.markEventDeleted('event123', 'pubkey_of_author');
   * ```
   */
  async markEventDeleted(eventId: string, deleterPubkey: string): Promise<void> {
    try {
      // Fetch the event to verify ownership
      const _event = await this.repository.getEvent(eventId)

      if (!event) {
        debug('Event not found for deletion: %s', eventId)
        throw new Error(`Event not found: ${eventId}`)
      }

      // Verify deleter is the original author
      if (event.pubkey !== deleterPubkey) {
        debug(
          'Deletion denied: requester %s is not author %s of event %s',
          deleterPubkey.substring(0, 8),
          event.pubkey.substring(0, 8),
          eventId
        )
        throw new Error('Only the event author can delete this event')
      }

      // Mark event as deleted in database
      const db: Knex = getMasterDbClient()
      await db('btp_nips_events')
        .where({ id: eventId })
        .update({ is_deleted: true })

      debug(
        'Marked event %s as deleted by author %s',
        eventId,
        deleterPubkey.substring(0, 8)
      )

      // Invalidate event cache
      await this.cache.invalidateCache(`btp_nips:event:${eventId}`)

      // Invalidate all query caches (since deletion affects query results)
      await this.cache.invalidateCache('btp_nips:query:*')

      debug('Invalidated cache for deleted event %s', eventId)
    } catch (error) {
      debug('Failed to mark event as deleted %s: %o', eventId, error)
      throw error
    }
  }

  /**
   * Verify and process a NIP-09 deletion request event.
   *
   * Validates that the event is a proper deletion request (kind 5),
   * extracts event IDs from 'e' tags and addressable coordinates from 'a' tags,
   * and marks all matching events as deleted.
   *
   * @param deleteEvent - The deletion event (kind 5)
   * @returns Promise<void>
   * @throws Error if not a valid deletion event
   *
   * @example
   * ```typescript
   * const deleteEvent = {
   *   kind: 5,
   *   pubkey: 'author_pubkey',
   *   tags: [
   *     ['e', 'event_id_1'],
   *     ['e', 'event_id_2'],
   *     ['a', '30023:author_pubkey:my-article']
   *   ],
   *   // ... other fields
   * };
   * await handler.verifyDeletionRequest(deleteEvent);
   * ```
   */
  async verifyDeletionRequest(deleteEvent: NostrEvent): Promise<void> {
    // Verify this is a deletion event (kind 5)
    if (deleteEvent.kind !== 5) {
      throw new Error(`Invalid deletion event kind: ${deleteEvent.kind}, expected 5`)
    }

    debug(
      'Processing deletion request from %s',
      deleteEvent.pubkey.substring(0, 8)
    )

    // Extract event IDs from 'e' tags
    const eventIds = deleteEvent.tags
      .filter((tag) => tag[0] === 'e')
      .map((tag) => tag[1])
      .filter((id) => id) // Remove undefined/empty values

    debug('Found %d event IDs to delete from e tags', eventIds.length)

    // Delete each event ID
    for (const eventId of eventIds) {
      try {
        await this.markEventDeleted(eventId, deleteEvent.pubkey)
      } catch (error) {
        // Log but continue processing other deletions
        debug('Failed to delete event %s: %o', eventId, error)
      }
    }

    // Extract addressable coordinates from 'a' tags
    const aTags = deleteEvent.tags
      .filter((tag) => tag[0] === 'a')
      .map((tag) => tag[1])
      .filter((coord) => coord) // Remove undefined/empty values

    debug('Found %d addressable coordinates to delete from a tags', aTags.length)

    // Process addressable event deletions
    for (const aTagValue of aTags) {
      try {
        await this.deleteAddressableEvent(aTagValue, deleteEvent.pubkey)
      } catch (error) {
        // Log but continue processing other deletions
        debug('Failed to delete addressable event %s: %o', aTagValue, error)
      }
    }
  }

  /**
   * Delete an addressable/replaceable event by its coordinate.
   *
   * Addressable event coordinates have format: `<kind>:<pubkey>:<d-identifier>`
   * Example: "30023:alice_pubkey:my-article"
   *
   * Handles malformed tags gracefully - logs error and continues.
   *
   * @param aTagValue - Addressable event coordinate
   * @param deleterPubkey - Public key of the deletion requester
   * @returns Promise that resolves when deletion is complete (or skips if malformed)
   *
   * @example
   * ```typescript
   * await handler.deleteAddressableEvent(
   *   '30023:alice_pubkey:my-article',
   *   'alice_pubkey'
   * );
   * ```
   */
  private async deleteAddressableEvent(
    aTagValue: string,
    deleterPubkey: string
  ): Promise<void> {
    // Parse addressable coordinate
    const parts = aTagValue.split(':')

    if (parts.length !== 3) {
      debug('Invalid a tag format: %s (expected format: kind:pubkey:d), skipping', aTagValue)
      return // Graceful degradation - skip malformed tags
    }

    const [kindStr, pubkey, dIdentifier] = parts
    const kind = parseInt(kindStr, 10)

    if (isNaN(kind)) {
      debug('Invalid kind in a tag: %s, skipping', kindStr)
      return // Graceful degradation - skip malformed tags
    }

    // Verify the deleter is the author
    if (pubkey !== deleterPubkey) {
      debug(
        'Deletion denied: requester %s is not author %s of addressable event, skipping',
        deleterPubkey.substring(0, 8),
        pubkey.substring(0, 8)
      )
      return // Graceful degradation - skip unauthorized deletions
    }

    debug(
      'Querying for addressable event: kind=%d, pubkey=%s, d=%s',
      kind,
      pubkey.substring(0, 8),
      dIdentifier
    )

    // Query for replaceable events matching this coordinate
    const filters: NostrFilter[] = [
      {
        kinds: [kind],
        authors: [pubkey],
        '#d': [dIdentifier],
      },
    ]

    const replaceableEvents = await this.repository.queryEventsByFilters(filters)

    debug(
      'Found %d replaceable events matching coordinate %s',
      replaceableEvents.length,
      aTagValue
    )

    // Mark all matching events as deleted
    for (const event of replaceableEvents) {
      try {
        await this.markEventDeleted(event.id, deleterPubkey)
      } catch (error) {
        // Log but continue processing other deletions
        debug('Failed to delete event %s: %o', event.id, error)
      }
    }
  }
}

/**
 * Singleton instance of DeletionHandler
 */
let handlerInstance: DeletionHandler | null = null

/**
 * Get the singleton instance of DeletionHandler.
 *
 * @returns Shared DeletionHandler instance
 *
 * @example
 * ```typescript
 * const handler = getDeletionHandler();
 * await handler.verifyDeletionRequest(deleteEvent);
 * ```
 */
export function getDeletionHandler(): DeletionHandler {
  if (!handlerInstance) {
    handlerInstance = new DeletionHandler()
  }
  return handlerInstance
}
