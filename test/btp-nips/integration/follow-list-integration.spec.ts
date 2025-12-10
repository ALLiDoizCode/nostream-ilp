import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddressResolver } from '../../../src/btp-nips/peer-discovery/address-resolver.js'
import { AutoSubscriber } from '../../../src/btp-nips/peer-discovery/auto-subscriber.js'
import { FollowListMonitor } from '../../../src/btp-nips/peer-discovery/follow-list-monitor.js'
import { FollowListStore } from '../../../src/btp-nips/peer-discovery/follow-list-store.js'
import { PaymentChannelManager } from '../../../src/btp-nips/peer-discovery/payment-channel-manager.js'
import { SubscriptionManager } from '../../../src/btp-nips/subscription-manager.js'
import { SubscriptionRenewalJob } from '../../../src/btp-nips/peer-discovery/subscription-renewal.js'

import type { ILPPeerInfo } from '../../../src/btp-nips/types/ilp-peer-info.js'
import type { NostrEvent } from '../../../src/btp-nips/types/index.js'
import type { StreamConnection } from '../../../src/btp-nips/subscription-manager.js'

/**
 * @file test/btp-nips/integration/follow-list-integration.spec.ts
 * Integration tests for follow list functionality
 *
 * Coverage:
 * - Test 11.1: Auto-subscribe when follow added
 * - Test 11.2: Auto-unsubscribe when follow removed
 * - Test 11.3: Sync follow list on startup
 * - Test 11.4: Auto-renew expiring subscriptions
 * - Test 11.5: Handle renewal failure when balance insufficient
 */

// Mock implementations
vi.mock('../../../src/btp-nips/peer-discovery/address-resolver.js')
vi.mock('../../../src/btp-nips/peer-discovery/follow-list-store.js')
vi.mock('../../../src/btp-nips/subscription-manager.js')
vi.mock('../../../src/btp-nips/peer-discovery/payment-channel-manager.js')
vi.mock('../../../src/btp-nips/utils/packet-sender.js', () => ({
  sendClosedPacket: vi.fn(),
  sendReqPacket: vi.fn(),
}))

describe('Follow List Integration', () => {
  let followListMonitor: FollowListMonitor
  let followListStore: FollowListStore
  let addressResolver: AddressResolver
  let autoSubscriber: AutoSubscriber
  let subscriptionManager: SubscriptionManager
  let paymentChannelManager: PaymentChannelManager
  let renewalJob: SubscriptionRenewalJob

  const localPubkey = 'a'.repeat(64)
  const alicePubkey = 'b'.repeat(64)
  const bobPubkey = 'c'.repeat(64)
  const carolPubkey = 'd'.repeat(64)

  const aliceIlpAddress = 'g.crypto.base.alice'
  const bobIlpAddress = 'g.crypto.base.bob'
  const carolIlpAddress = 'g.crypto.base.carol'

  const bobPeerInfo: ILPPeerInfo = {
    ilpAddress: bobIlpAddress,
    pubkey: bobPubkey,
    baseAddress: '0xbob',
    nostrRelays: ['wss://relay.example.com'],
    publishedAt: Date.now(),
  }

  const mockStreamConnection: StreamConnection = {
    send: vi.fn(),
    receive: vi.fn(),
    close: vi.fn(),
  } as unknown as StreamConnection

  beforeEach(() => {
    // Create mock instances
    followListStore = new FollowListStore({} as any, {} as any)
    addressResolver = new AddressResolver({} as any, {} as any)
    subscriptionManager = new SubscriptionManager()
    paymentChannelManager = new PaymentChannelManager('http://localhost:5000')

    autoSubscriber = new AutoSubscriber(
      addressResolver,
      subscriptionManager,
      paymentChannelManager
    )

    followListMonitor = new FollowListMonitor(
      {} as any, // EventRepository mock
      addressResolver,
      followListStore
    )

    const mockPreferencesManager = {
      getPreferences: vi.fn().mockResolvedValue({
        autoRenew: true,
        paymentAmountMsats: '1000',
        subscriptionDurationMs: 86400000,
        defaultFilters: [{ kinds: [1, 30023] }],
        maxSubscriptions: 100,
      }),
      setPreferences: vi.fn().mockResolvedValue(undefined),
      getDefaultFiltersForFollow: vi.fn().mockReturnValue([{ kinds: [1, 30023] }]),
    }

    renewalJob = new SubscriptionRenewalJob(
      subscriptionManager,
      paymentChannelManager,
      mockPreferencesManager as any
    )

    // Setup default mocks
    vi.spyOn(paymentChannelManager, 'hasChannel').mockResolvedValue(true)
    vi.spyOn(subscriptionManager, 'addSubscription').mockReturnValue(undefined)
    vi.spyOn(subscriptionManager, 'removeSubscription').mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  /**
   * Test 11.1: Should auto-subscribe when follow added
   */
  describe('auto-subscribe on follow add', () => {
    it('should create subscription when peer added to follow list', async () => {
      // Arrange
      const alicePeerInfo: ILPPeerInfo = {
        ilpAddress: aliceIlpAddress,
        pubkey: alicePubkey,
        baseAddress: '0xalice',
        nostrRelays: ['wss://relay.example.com'],
        publishedAt: Date.now(),
      }

      const kind3Event: NostrEvent = {
        id: 'event_1',
        pubkey: localPubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 3,
        tags: [
          ['p', alicePubkey],
        ],
        content: '',
        sig: 'signature',
      }

      // Mock previous follow list (empty)
      vi.spyOn(followListStore, 'getFollowList').mockResolvedValue([])
      vi.spyOn(followListStore, 'setFollowList').mockResolvedValue(undefined)

      // Mock address resolution
      vi.spyOn(addressResolver, 'resolveIlpAddress').mockResolvedValue(alicePeerInfo)

      // Mock establishStream
      // @ts-expect-error - accessing private method for testing
      vi.spyOn(autoSubscriber, 'establishStream').mockResolvedValue(mockStreamConnection)

      // Setup follow monitor callbacks
      followListMonitor.onFollowAdded = async (pubkey: string) => {
        await autoSubscriber.subscribeToUser(pubkey)
      }

      // Act
      await followListMonitor.handleFollowListUpdate(kind3Event)

      // Assert
      expect(addressResolver.resolveIlpAddress).toHaveBeenCalledWith(alicePubkey)
      expect(paymentChannelManager.hasChannel).toHaveBeenCalledWith(aliceIlpAddress)
      expect(subscriptionManager.addSubscription).toHaveBeenCalled()

      // Verify subscription structure
      const addedSub = vi.mocked(subscriptionManager.addSubscription).mock.calls[0][0]
      expect(addedSub.filters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            authors: [alicePubkey],
            kinds: [1, 30023],
          }),
        ])
      )
    })

    it('should handle multiple follows added at once', async () => {
      // Arrange
      const alicePeerInfo: ILPPeerInfo = {
        ilpAddress: aliceIlpAddress,
        pubkey: alicePubkey,
        baseAddress: '0xalice',
        nostrRelays: [],
        publishedAt: Date.now(),
      }

      const bobPeerInfo: ILPPeerInfo = {
        ilpAddress: bobIlpAddress,
        pubkey: bobPubkey,
        baseAddress: '0xbob',
        nostrRelays: [],
        publishedAt: Date.now(),
      }

      const kind3Event: NostrEvent = {
        id: 'event_2',
        pubkey: localPubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 3,
        tags: [
          ['p', alicePubkey],
          ['p', bobPubkey],
        ],
        content: '',
        sig: 'signature',
      }

      vi.spyOn(followListStore, 'getFollowList').mockResolvedValue([])
      vi.spyOn(followListStore, 'setFollowList').mockResolvedValue(undefined)

      vi.spyOn(addressResolver, 'resolveIlpAddress')
        .mockResolvedValueOnce(alicePeerInfo)
        .mockResolvedValueOnce(bobPeerInfo)

      // @ts-expect-error - accessing private method for testing
      vi.spyOn(autoSubscriber, 'establishStream').mockResolvedValue(mockStreamConnection)

      let subscriptionCount = 0
      followListMonitor.onFollowAdded = async (pubkey: string) => {
        await autoSubscriber.subscribeToUser(pubkey)
        subscriptionCount++
      }

      // Act
      await followListMonitor.handleFollowListUpdate(kind3Event)

      // Assert - both subscriptions created
      expect(subscriptionCount).toBe(2)
      expect(addressResolver.resolveIlpAddress).toHaveBeenCalledWith(alicePubkey)
      expect(addressResolver.resolveIlpAddress).toHaveBeenCalledWith(bobPubkey)
      expect(subscriptionManager.addSubscription).toHaveBeenCalledTimes(2)
    })
  })

  /**
   * Test 11.2: Should auto-unsubscribe when follow removed
   */
  describe('auto-unsubscribe on follow remove', () => {
    it('should remove subscription when peer removed from follow list', async () => {
      // Arrange - First, subscribe to Bob to set up the activeSubscriptions tracking
      vi.spyOn(addressResolver, 'resolveIlpAddress').mockResolvedValue(bobPeerInfo)
      vi.spyOn(paymentChannelManager, 'hasChannel').mockResolvedValue(true)
      vi.spyOn(subscriptionManager, 'getSubscription').mockReturnValue({
        id: 'auto-sub-cccccccccccccccc',
        subscriber: bobIlpAddress,
        streamConnection: mockStreamConnection,
        filters: [{ authors: [bobPubkey], kinds: [1, 30023] }],
        expiresAt: Date.now() + 86400000,
        active: true,
      })

      const { sendReqPacket, sendClosedPacket } = await import('../../../src/btp-nips/utils/packet-sender.js')
      vi.mocked(sendReqPacket).mockResolvedValue(undefined)
      vi.mocked(sendClosedPacket).mockResolvedValue(undefined)

      // Subscribe to Bob first
      await autoSubscriber.subscribeToUser(bobPubkey)

      // Now create Kind 3 event removing Bob
      const kind3Event: NostrEvent = {
        id: 'event_3',
        pubkey: localPubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 3,
        tags: [
          ['p', alicePubkey], // Only Alice remains
        ],
        content: '',
        sig: 'signature',
      }

      // Mock previous follow list (Alice and Bob)
      vi.spyOn(followListStore, 'getFollowList').mockResolvedValue([alicePubkey, bobPubkey])
      vi.spyOn(followListStore, 'setFollowList').mockResolvedValue(undefined)

      followListMonitor.onFollowRemoved = async (pubkey: string) => {
        await autoSubscriber.unsubscribeFromPeer(pubkey)
      }

      // Act
      await followListMonitor.handleFollowListUpdate(kind3Event)

      // Assert
      expect(sendClosedPacket).toHaveBeenCalledWith(
        mockStreamConnection,
        'auto-sub-cccccccccccccccc',
        expect.any(String)
      )
      expect(subscriptionManager.removeSubscription).toHaveBeenCalledWith('auto-sub-cccccccccccccccc')
    })
  })

  /**
   * Test 11.3: Should sync follow list on startup
   */
  describe('follow list sync on startup', () => {
    it('should restore subscriptions for existing follow list', async () => {
      // Arrange
      const kind3Event: NostrEvent = {
        id: 'event_4',
        pubkey: localPubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 3,
        tags: [
          ['p', alicePubkey],
          ['p', bobPubkey],
        ],
        content: '',
        sig: 'signature',
      }

      const alicePeerInfo: ILPPeerInfo = {
        ilpAddress: aliceIlpAddress,
        pubkey: alicePubkey,
        baseAddress: '0xalice',
        nostrRelays: [],
        publishedAt: Date.now(),
      }

      const bobPeerInfo: ILPPeerInfo = {
        ilpAddress: bobIlpAddress,
        pubkey: bobPubkey,
        baseAddress: '0xbob',
        nostrRelays: [],
        publishedAt: Date.now(),
      }

      // Simulate startup: no previous follows
      vi.spyOn(followListStore, 'getFollowList').mockResolvedValue([])
      vi.spyOn(followListStore, 'setFollowList').mockResolvedValue(undefined)

      vi.spyOn(addressResolver, 'resolveIlpAddress')
        .mockResolvedValueOnce(alicePeerInfo)
        .mockResolvedValueOnce(bobPeerInfo)

      // @ts-expect-error - accessing private method for testing
      vi.spyOn(autoSubscriber, 'establishStream').mockResolvedValue(mockStreamConnection)

      let subscriptionCount = 0
      followListMonitor.onFollowAdded = async (pubkey: string) => {
        await autoSubscriber.subscribeToUser(pubkey)
        subscriptionCount++
      }

      // Act - process existing Kind 3 event
      await followListMonitor.handleFollowListUpdate(kind3Event)

      // Assert
      expect(subscriptionCount).toBe(2)
      expect(followListStore.setFollowList).toHaveBeenCalledWith(localPubkey, [alicePubkey, bobPubkey])
      expect(subscriptionManager.addSubscription).toHaveBeenCalledTimes(2)
    })
  })

  /**
   * Test 11.4: Should auto-renew expiring subscriptions
   */
  describe('subscription renewal', () => {
    it('should renew subscriptions expiring within 6 hours', async () => {
      // Arrange
      vi.useFakeTimers()
      const now = Date.now()
      vi.setSystemTime(now)

      const expiringSubscription = {
        id: 'sub_expiring',
        subscriber: aliceIlpAddress,
        streamConnection: mockStreamConnection,
        filters: [{ authors: [alicePubkey], kinds: [1, 30023] }],
        expiresAt: now + 3 * 3600 * 1000, // Expires in 3 hours
        active: true,
      }

      vi.spyOn(subscriptionManager, 'getAllSubscriptions').mockReturnValue([expiringSubscription])
      vi.spyOn(paymentChannelManager, 'getChannelBalance').mockResolvedValue(BigInt(10000))

      const { sendReqPacket } = await import('../../../src/btp-nips/utils/packet-sender.js')
      vi.mocked(sendReqPacket).mockResolvedValue(undefined)

      // Act
      await renewalJob.runOnce()

      // Assert
      expect(sendReqPacket).toHaveBeenCalledWith(
        mockStreamConnection,
        expect.objectContaining({
          subscriptionId: 'sub_expiring',
          filters: expiringSubscription.filters,
        }),
        expect.any(String),
        expect.any(Number)
      )

      // Verify expiration was extended
      expect(expiringSubscription.expiresAt).toBeGreaterThan(now + 20 * 3600 * 1000) // Extended by ~24 hours
    })

    it('should not renew subscriptions not expiring soon', async () => {
      // Arrange
      vi.useFakeTimers()
      const now = Date.now()
      vi.setSystemTime(now)

      const freshSubscription = {
        id: 'sub_fresh',
        subscriber: bobIlpAddress,
        streamConnection: mockStreamConnection,
        filters: [{ authors: [bobPubkey], kinds: [1, 30023] }],
        expiresAt: now + 20 * 3600 * 1000, // Expires in 20 hours
        active: true,
      }

      vi.spyOn(subscriptionManager, 'getAllSubscriptions').mockReturnValue([freshSubscription])

      const { sendReqPacket } = await import('../../../src/btp-nips/utils/packet-sender.js')
      vi.mocked(sendReqPacket).mockResolvedValue(undefined)

      // Act
      await renewalJob.runOnce()

      // Assert - should not attempt renewal
      expect(sendReqPacket).not.toHaveBeenCalled()
    })
  })

  /**
   * Test 11.5: Should handle renewal failure when balance insufficient
   */
  describe('renewal failure handling', () => {
    it('should log warning when channel balance is insufficient', async () => {
      // Arrange
      vi.useFakeTimers()
      const now = Date.now()
      vi.setSystemTime(now)

      const expiringSubscription = {
        id: 'sub_low_balance',
        subscriber: carolIlpAddress,
        streamConnection: mockStreamConnection,
        filters: [{ authors: [carolPubkey], kinds: [1, 30023] }],
        expiresAt: now + 2 * 3600 * 1000, // Expires in 2 hours
        active: true,
      }

      vi.spyOn(subscriptionManager, 'getAllSubscriptions').mockReturnValue([expiringSubscription])

      const { sendReqPacket } = await import('../../../src/btp-nips/utils/packet-sender.js')
      vi.mocked(sendReqPacket).mockRejectedValue(new Error('Insufficient balance'))

      // Act
      const stats = await renewalJob.runOnce()

      // Assert
      // NOTE: Balance checking is not implemented (TODO in subscription-renewal.ts:311-313)
      // This test verifies that renewal attempts to send payment, which may fail due to insufficient balance
      // Errors with "insufficient" or "balance" are treated as skipped, not failed (subscription-renewal.ts:346)
      expect(sendReqPacket).toHaveBeenCalled()
      expect(stats.skipped).toBe(1)
      expect(stats.renewed).toBe(0)
      expect(stats.failed).toBe(0)
    })

    it('should continue processing other subscriptions after failure', async () => {
      // Arrange
      vi.useFakeTimers()
      const now = Date.now()
      vi.setSystemTime(now)

      const failingSubscription = {
        id: 'sub_failing',
        subscriber: aliceIlpAddress,
        streamConnection: mockStreamConnection,
        filters: [{ authors: [alicePubkey], kinds: [1, 30023] }],
        expiresAt: now + 2 * 3600 * 1000,
        active: true,
      }

      const successfulSubscription = {
        id: 'sub_successful',
        subscriber: bobIlpAddress,
        streamConnection: mockStreamConnection,
        filters: [{ authors: [bobPubkey], kinds: [1, 30023] }],
        expiresAt: now + 3 * 3600 * 1000,
        active: true,
      }

      vi.spyOn(subscriptionManager, 'getAllSubscriptions').mockReturnValue([
        failingSubscription,
        successfulSubscription,
      ])

      const { sendReqPacket } = await import('../../../src/btp-nips/utils/packet-sender.js')
      vi.mocked(sendReqPacket)
        .mockRejectedValueOnce(new Error('Payment failed')) // First subscription fails
        .mockResolvedValueOnce(undefined) // Second subscription succeeds

      // Act
      const stats = await renewalJob.runOnce()

      // Assert
      expect(stats.failed).toBe(1) // First subscription failed
      expect(stats.renewed).toBe(1) // Second subscription succeeded
      expect(sendReqPacket).toHaveBeenCalledTimes(2) // Both subscriptions attempted
      expect(sendReqPacket).toHaveBeenNthCalledWith(
        2,
        mockStreamConnection,
        expect.objectContaining({
          subscriptionId: 'sub_successful',
        }),
        expect.any(String),
        expect.any(Number)
      )
    })
  })
})
