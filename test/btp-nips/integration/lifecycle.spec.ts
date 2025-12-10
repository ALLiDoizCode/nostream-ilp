import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomBytes } from 'crypto'
import { schnorr } from '@noble/secp256k1'
import { DeletionHandler } from '../../../src/btp-nips/utils/deletion-handler'
import { EventCache } from '../../../src/btp-nips/storage/event-cache'
import { EventRepository } from '../../../src/btp-nips/storage/event-repository'
import { ExpirationCleanupService } from '../../../src/btp-nips/storage/expiration-cleanup'
import { calculateEventId } from '../../../src/btp-nips/crypto'
import { getMasterDbClient } from '../../../src/database/client'

import type { NostrEvent } from '../../../src/btp-nips/types'

/**
 * Integration Tests for BTP-NIPs Event Lifecycle (NIP-09/40)
 *
 * Tests end-to-end deletion and expiration workflows with real database.
 *
 * @see src/btp-nips/utils/deletion-handler.ts
 * @see src/btp-nips/storage/event-repository.ts
 * @see src/btp-nips/storage/expiration-cleanup.ts
 * @see Story 5.6 - Task 6
 */

/* eslint-disable sort-imports */
/**
 * Generate a valid signed Nostr event
 */
async function createSignedEvent(overrides?: Partial<NostrEvent>): Promise<NostrEvent> {
  const privateKey = randomBytes(32)
  const publicKey = Buffer.from(schnorr.getPublicKey(privateKey)).toString('hex')

  const event: Omit<NostrEvent, 'id' | 'sig'> = {
    pubkey: publicKey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: 'Integration test event',
    ...overrides,
  }

  const id = calculateEventId(event as NostrEvent)
  const signature = Buffer.from(await schnorr.sign(id, privateKey)).toString('hex')

  return {
    ...event,
    id,
    sig: signature,
  }
}

/**
 * Create a deletion event (kind 5) for testing
 */
async function createDeletionEvent(
  privateKey: Buffer,
  eventIds: string[],
  addressableTags: string[] = []
): Promise<NostrEvent> {
  const publicKey = Buffer.from(schnorr.getPublicKey(privateKey)).toString('hex')

  const tags: string[][] = [
    ...eventIds.map((id) => ['e', id]),
    ...addressableTags.map((coord) => ['a', coord]),
  ]

  const event: Omit<NostrEvent, 'id' | 'sig'> = {
    pubkey: publicKey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 5,
    tags,
    content: '',
  }

  const id = calculateEventId(event as NostrEvent)
  const signature = Buffer.from(await schnorr.sign(id, privateKey)).toString('hex')

  return {
    ...event,
    id,
    sig: signature,
  }
}

describe('Event Lifecycle Integration Tests', () => {
  let repository: EventRepository
  let cache: EventCache
  let deletionHandler: DeletionHandler
  let cleanupService: ExpirationCleanupService

  beforeEach(() => {
    repository = new EventRepository()
    cache = new EventCache()
    deletionHandler = new DeletionHandler(repository, cache)
    cleanupService = new ExpirationCleanupService()
  })

  afterEach(async () => {
    // Clean up test data
    await repository.deleteAll()
    await cache.flushAll()
    cleanupService.stop()
    vi.useRealTimers()
  })

  describe('End-to-End Deletion Workflow (NIP-09)', () => {
    it('should handle complete deletion workflow with e tags', async () => {
      // Step 1: Create and save an event
      const event = await createSignedEvent({
        content: 'This event will be deleted',
      })

      await repository.saveEvent(event)

      // Verify event exists
      const savedEvent = await repository.getEvent(event.id)
      expect(savedEvent).toBeDefined()
      expect(savedEvent?.content).toBe('This event will be deleted')

      // Step 2: Create deletion event
      const privateKey = randomBytes(32)
      const publicKey = Buffer.from(schnorr.getPublicKey(privateKey)).toString('hex')

      // Create original event with same author as deletion
      const authorEvent = await createSignedEvent({
        pubkey: publicKey,
        content: 'Event by known author',
      })

      await repository.saveEvent(authorEvent)

      // Create deletion event
      const deleteEvent = await createDeletionEvent(privateKey, [authorEvent.id])

      // Step 3: Process deletion
      await deletionHandler.verifyDeletionRequest(deleteEvent)

      // Step 4: Verify event marked as deleted
      const db = getMasterDbClient()
      const row = await db('btp_nips_events').where({ id: authorEvent.id }).first()

      expect(row).toBeDefined()
      expect(row.is_deleted).toBe(true)

      // Step 5: Verify event excluded from queries
      const results = await repository.queryEventsByFilters([{ ids: [authorEvent.id] }])
      expect(results).toHaveLength(0)
    })

    it('should handle addressable event deletion with a tags', async () => {
      // Step 1: Create replaceable event (kind 30023)
      const privateKey = randomBytes(32)
      const publicKey = Buffer.from(schnorr.getPublicKey(privateKey)).toString('hex')

      const replaceableEvent = await createSignedEvent({
        kind: 30023,
        pubkey: publicKey,
        tags: [
          ['d', 'my-article'],
          ['title', 'Test Article'],
        ],
        content: 'This is a long-form article',
      })

      await repository.saveEvent(replaceableEvent)

      // Verify event exists
      const savedEvent = await repository.getEvent(replaceableEvent.id)
      expect(savedEvent).toBeDefined()

      // Step 2: Create deletion event with a tag
      const addressableTag = `30023:${publicKey}:my-article`
      const deleteEvent = await createDeletionEvent(privateKey, [], [addressableTag])

      // Step 3: Process deletion
      await deletionHandler.verifyDeletionRequest(deleteEvent)

      // Step 4: Verify event marked as deleted
      const db = getMasterDbClient()
      const row = await db('btp_nips_events')
        .where({ id: replaceableEvent.id })
        .first()

      expect(row.is_deleted).toBe(true)

      // Step 5: Verify event excluded from queries
      const results = await repository.queryEventsByFilters([
        {
          kinds: [30023],
          authors: [publicKey],
        },
      ])
      expect(results).toHaveLength(0)
    })

    it('should invalidate cache when event is deleted', async () => {
      // Step 1: Create and save event
      const privateKey = randomBytes(32)
      const publicKey = Buffer.from(schnorr.getPublicKey(privateKey)).toString('hex')

      const event = await createSignedEvent({
        pubkey: publicKey,
        content: 'Cached event',
      })

      await repository.saveEvent(event)

      // Verify event is cached
      const cachedBefore = await cache.getCachedEvent(event.id)
      expect(cachedBefore).toBeDefined()

      // Step 2: Delete event
      const deleteEvent = await createDeletionEvent(privateKey, [event.id])
      await deletionHandler.verifyDeletionRequest(deleteEvent)

      // Step 3: Verify cache invalidated
      const cachedAfter = await cache.getCachedEvent(event.id)
      expect(cachedAfter).toBeNull()
    })
  })

  describe('End-to-End Expiration Workflow (NIP-40)', () => {
    it('should handle complete expiration workflow', async () => {
      vi.useFakeTimers()

      const now = Date.now()
      vi.setSystemTime(now)

      // Step 1: Save event with expiration tag (expires in 2 seconds)
      const expiresAt = Math.floor(now / 1000) + 2

      const event = await createSignedEvent({
        tags: [['expiration', expiresAt.toString()]],
        content: 'This event will expire',
      })

      await repository.saveEvent(event)

      // Step 2: Verify stored in database with expires_at
      const db = getMasterDbClient()
      let row = await db('btp_nips_events').where({ id: event.id }).first()

      expect(row).toBeDefined()
      expect(row.expires_at).toBe(expiresAt)

      // Step 3: Verify event included in queries (not yet expired)
      let results = await repository.queryEventsByFilters([{ ids: [event.id] }])
      expect(results).toHaveLength(1)

      // Step 4: Fast-forward time past expiration (3 seconds)
      vi.setSystemTime(now + 3000)

      // Step 5: Verify event excluded from queries (expired)
      results = await repository.queryEventsByFilters([{ ids: [event.id] }])
      expect(results).toHaveLength(0)

      // Step 6: Run cleanup task
      const deletedCount = await cleanupService.cleanup()
      expect(deletedCount).toBe(1)

      // Step 7: Verify event deleted from database
      row = await db('btp_nips_events').where({ id: event.id }).first()
      expect(row).toBeUndefined()
    })

    it('should reject pre-expired events', async () => {
      vi.useFakeTimers()

      const now = Date.now()
      vi.setSystemTime(now)

      // Create event with expiration in the past
      const pastExpiration = Math.floor(now / 1000) - 3600

      const event = await createSignedEvent({
        tags: [['expiration', pastExpiration.toString()]],
        content: 'Already expired',
      })

      // Should reject
      await expect(repository.saveEvent(event)).rejects.toThrow(
        'Event is already expired (NIP-40)'
      )

      // Verify not saved
      const db = getMasterDbClient()
      const row = await db('btp_nips_events').where({ id: event.id }).first()
      expect(row).toBeUndefined()
    })

    it('should cleanup multiple expired events in batch', async () => {
      vi.useFakeTimers()

      const now = Date.now()
      vi.setSystemTime(now)

      const expiredTimestamp = Math.floor(now / 1000) - 3600

      // Create 5 expired events (manually insert to bypass validation)
      const db = getMasterDbClient()
      const expiredEvents: NostrEvent[] = []

      for (let i = 0; i < 5; i++) {
        const event = await createSignedEvent({
          content: `Expired event ${i}`,
        })

        await db('btp_nips_events').insert({
          id: event.id,
          pubkey: event.pubkey,
          created_at: event.created_at,
          kind: event.kind,
          tags: JSON.stringify([['expiration', expiredTimestamp.toString()]]),
          content: event.content,
          sig: event.sig,
          expires_at: expiredTimestamp,
          is_deleted: false,
        })

        expiredEvents.push(event)
      }

      // Create 2 non-expired events
      const futureExpiration = Math.floor(now / 1000) + 3600

      for (let i = 0; i < 2; i++) {
        const event = await createSignedEvent({
          tags: [['expiration', futureExpiration.toString()]],
          content: `Future event ${i}`,
        })

        await repository.saveEvent(event)
      }

      // Run cleanup
      const deletedCount = await cleanupService.cleanup()
      expect(deletedCount).toBe(5)

      // Verify only expired events deleted
      const remainingCount = await db('btp_nips_events').count('id as count').first()
      expect(parseInt(remainingCount?.count as string)).toBe(2)
    })
  })

  describe('Combined Deletion and Expiration', () => {
    it('should handle deleted event with expiration', async () => {
      vi.useFakeTimers()

      const now = Date.now()
      vi.setSystemTime(now)

      // Create event with future expiration
      const privateKey = randomBytes(32)
      const publicKey = Buffer.from(schnorr.getPublicKey(privateKey)).toString('hex')

      const expiresAt = Math.floor(now / 1000) + 3600

      const event = await createSignedEvent({
        pubkey: publicKey,
        tags: [['expiration', expiresAt.toString()]],
        content: 'Event with expiration',
      })

      await repository.saveEvent(event)

      // Delete the event before expiration
      const deleteEvent = await createDeletionEvent(privateKey, [event.id])
      await deletionHandler.verifyDeletionRequest(deleteEvent)

      // Verify excluded from queries (deleted)
      const results = await repository.queryEventsByFilters([{ ids: [event.id] }])
      expect(results).toHaveLength(0)

      // Fast-forward past expiration
      vi.setSystemTime(now + 7200000) // 2 hours

      // Run cleanup - deleted events should not be counted (already soft deleted)
      // But they should still exist in database
      const db = getMasterDbClient()
      const beforeCleanup = await db('btp_nips_events').where({ id: event.id }).first()
      expect(beforeCleanup).toBeDefined()
      expect(beforeCleanup.is_deleted).toBe(true)
    })

    it('should exclude both deleted and expired events from queries', async () => {
      vi.useFakeTimers()

      const now = Date.now()
      vi.setSystemTime(now)

      // Create deleted event
      const privateKey1 = randomBytes(32)
      const publicKey1 = Buffer.from(schnorr.getPublicKey(privateKey1)).toString('hex')

      const deletedEvent = await createSignedEvent({
        pubkey: publicKey1,
        content: 'Deleted event',
      })

      await repository.saveEvent(deletedEvent)

      const deleteEvent = await createDeletionEvent(privateKey1, [deletedEvent.id])
      await deletionHandler.verifyDeletionRequest(deleteEvent)

      // Create expired event (manually insert)
      const expiredEvent = await createSignedEvent({
        content: 'Expired event',
      })

      const expiredTimestamp = Math.floor(now / 1000) - 3600
      const db = getMasterDbClient()

      await db('btp_nips_events').insert({
        id: expiredEvent.id,
        pubkey: expiredEvent.pubkey,
        created_at: expiredEvent.created_at,
        kind: expiredEvent.kind,
        tags: JSON.stringify([['expiration', expiredTimestamp.toString()]]),
        content: expiredEvent.content,
        sig: expiredEvent.sig,
        expires_at: expiredTimestamp,
        is_deleted: false,
      })

      // Create valid event
      const validEvent = await createSignedEvent({
        content: 'Valid event',
      })

      await repository.saveEvent(validEvent)

      // Query all events
      const results = await repository.queryEventsByFilters([{ kinds: [1] }])

      // Should only return valid event (exclude deleted and expired)
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe(validEvent.id)
    })
  })
})
