import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FollowListMonitor } from '../../../src/btp-nips/peer-discovery/follow-list-monitor.js'

import type { AddressResolver } from '../../../src/btp-nips/peer-discovery/address-resolver.js'
import type { EventRepository } from '../../../src/btp-nips/storage/event-repository.js'
import type { FollowListStore } from '../../../src/btp-nips/peer-discovery/follow-list-store.js'
import type { NostrEvent } from '../../../src/btp-nips/types/index.js'

/**
 * Tests for Follow List Monitor
 * Story 6.3: Follow List Integration (Kind 3)
 */

// Test pubkeys (64 characters each)
const ALICE_PUBKEY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const BOB_PUBKEY = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const CAROL_PUBKEY = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'

describe('FollowListMonitor', () => {
  let monitor: FollowListMonitor
  let mockEventRepo: EventRepository
  let mockAddressResolver: AddressResolver
  let mockFollowListStore: FollowListStore

  beforeEach(() => {
    // Create mock dependencies
    mockEventRepo = {
      subscribeToKind3Events: vi.fn(),
    } as unknown as EventRepository

    mockAddressResolver = {} as AddressResolver

    mockFollowListStore = {
      getFollowList: vi.fn(),
      setFollowList: vi.fn(),
    } as unknown as FollowListStore

    monitor = new FollowListMonitor(
      mockEventRepo,
      mockAddressResolver,
      mockFollowListStore
    )
  })

  describe('extractFollowedPubkeys', () => {
    it('should extract pubkeys from p tags', () => {
      const event: NostrEvent = {
        id: 'event123',
        pubkey: ALICE_PUBKEY,
        created_at: 1234567890,
        kind: 3,
        tags: [
          ['p', BOB_PUBKEY],
          ['p', CAROL_PUBKEY],
        ],
        content: '',
        sig: 'sig123',
      }

      const follows = monitor.extractFollowedPubkeys(event)

      expect(follows).toEqual([BOB_PUBKEY, CAROL_PUBKEY])
    })

    it('should filter out invalid pubkeys (wrong length)', () => {
      const event: NostrEvent = {
        id: 'event123',
        pubkey: ALICE_PUBKEY,
        created_at: 1234567890,
        kind: 3,
        tags: [
          ['p', BOB_PUBKEY],
          ['p', 'short'], // Invalid: too short
          ['p', ''], // Invalid: empty
        ],
        content: '',
        sig: 'sig123',
      }

      const follows = monitor.extractFollowedPubkeys(event)

      expect(follows).toEqual([BOB_PUBKEY])
    })

    it('should ignore non-p tags', () => {
      const event: NostrEvent = {
        id: 'event123',
        pubkey: ALICE_PUBKEY,
        created_at: 1234567890,
        kind: 3,
        tags: [
          ['p', BOB_PUBKEY],
          ['e', 'event456'], // Should be ignored
          ['relay', 'wss://relay.example.com'], // Should be ignored
        ],
        content: '',
        sig: 'sig123',
      }

      const follows = monitor.extractFollowedPubkeys(event)

      expect(follows).toEqual([BOB_PUBKEY])
    })

    it('should throw error for non-Kind-3 events', () => {
      const event: NostrEvent = {
        id: 'event123',
        pubkey: ALICE_PUBKEY,
        created_at: 1234567890,
        kind: 1, // Wrong kind
        tags: [['p', BOB_PUBKEY]],
        content: 'Hello world',
        sig: 'sig123',
      }

      expect(() => monitor.extractFollowedPubkeys(event)).toThrow('Not a Kind 3 event')
    })
  })

  describe('handleFollowListUpdate', () => {
    it('should detect added follows', async () => {
      const event: NostrEvent = {
        id: 'event123',
        pubkey: ALICE_PUBKEY,
        created_at: 1234567890,
        kind: 3,
        tags: [
          ['p', BOB_PUBKEY],
          ['p', CAROL_PUBKEY],
        ],
        content: '',
        sig: 'sig123',
      }

      // Mock previous follows (only bob)
      vi.mocked(mockFollowListStore.getFollowList).mockResolvedValue([BOB_PUBKEY])

      const onFollowAdded = vi.fn()
      const onFollowRemoved = vi.fn()
      monitor.onFollowAdded = onFollowAdded
      monitor.onFollowRemoved = onFollowRemoved

      await monitor.handleFollowListUpdate(event)

      // Should detect carol as new follow
      expect(onFollowAdded).toHaveBeenCalledWith(CAROL_PUBKEY)
      expect(onFollowAdded).toHaveBeenCalledTimes(1)
      expect(onFollowRemoved).not.toHaveBeenCalled()

      // Should update stored follow list
      expect(mockFollowListStore.setFollowList).toHaveBeenCalledWith(
        ALICE_PUBKEY,
        [BOB_PUBKEY, CAROL_PUBKEY]
      )
    })

    it('should detect removed follows', async () => {
      const event: NostrEvent = {
        id: 'event123',
        pubkey: ALICE_PUBKEY,
        created_at: 1234567890,
        kind: 3,
        tags: [
          ['p', BOB_PUBKEY],
        ],
        content: '',
        sig: 'sig123',
      }

      // Mock previous follows (bob and carol)
      vi.mocked(mockFollowListStore.getFollowList).mockResolvedValue([
        BOB_PUBKEY,
        CAROL_PUBKEY,
      ])

      const onFollowAdded = vi.fn()
      const onFollowRemoved = vi.fn()
      monitor.onFollowAdded = onFollowAdded
      monitor.onFollowRemoved = onFollowRemoved

      await monitor.handleFollowListUpdate(event)

      // Should detect carol as removed
      expect(onFollowRemoved).toHaveBeenCalledWith(CAROL_PUBKEY)
      expect(onFollowRemoved).toHaveBeenCalledTimes(1)
      expect(onFollowAdded).not.toHaveBeenCalled()
    })

    it('should handle first follow list (no previous follows)', async () => {
      const event: NostrEvent = {
        id: 'event123',
        pubkey: ALICE_PUBKEY,
        created_at: 1234567890,
        kind: 3,
        tags: [
          ['p', BOB_PUBKEY],
          ['p', CAROL_PUBKEY],
        ],
        content: '',
        sig: 'sig123',
      }

      // Mock no previous follows
      vi.mocked(mockFollowListStore.getFollowList).mockResolvedValue([])

      const onFollowAdded = vi.fn()
      monitor.onFollowAdded = onFollowAdded

      await monitor.handleFollowListUpdate(event)

      // Should add both follows
      expect(onFollowAdded).toHaveBeenCalledWith(BOB_PUBKEY)
      expect(onFollowAdded).toHaveBeenCalledWith(CAROL_PUBKEY)
      expect(onFollowAdded).toHaveBeenCalledTimes(2)
    })

    it('should ignore non-Kind-3 events', async () => {
      const event: NostrEvent = {
        id: 'event123',
        pubkey: ALICE_PUBKEY,
        created_at: 1234567890,
        kind: 1, // Not Kind 3
        tags: [],
        content: 'Hello world',
        sig: 'sig123',
      }

      const onFollowAdded = vi.fn()
      monitor.onFollowAdded = onFollowAdded

      await monitor.handleFollowListUpdate(event)

      // Should not process
      expect(onFollowAdded).not.toHaveBeenCalled()
      expect(mockFollowListStore.getFollowList).not.toHaveBeenCalled()
    })
  })

  describe('watchForFollowListUpdates', () => {
    it('should subscribe to Kind 3 events', () => {
      monitor.watchForFollowListUpdates(ALICE_PUBKEY)

      expect(mockEventRepo.subscribeToKind3Events).toHaveBeenCalledWith(
        ALICE_PUBKEY,
        expect.any(Function)
      )
    })

    it('should not subscribe twice for same pubkey', () => {
      monitor.watchForFollowListUpdates(ALICE_PUBKEY)
      monitor.watchForFollowListUpdates(ALICE_PUBKEY) // Second call

      // Should only subscribe once
      expect(mockEventRepo.subscribeToKind3Events).toHaveBeenCalledTimes(1)
    })
  })

  describe('stopWatching', () => {
    it('should remove pubkey from watched list', () => {
      monitor.watchForFollowListUpdates(ALICE_PUBKEY)
      expect(monitor.getWatchedPubkeys()).toContain(ALICE_PUBKEY)

      monitor.stopWatching(ALICE_PUBKEY)
      expect(monitor.getWatchedPubkeys()).not.toContain(ALICE_PUBKEY)
    })
  })
})
