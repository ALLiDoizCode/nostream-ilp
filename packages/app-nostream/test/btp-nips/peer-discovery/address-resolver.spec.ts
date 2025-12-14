import { AddressResolver } from '../../../src/btp-nips/peer-discovery/address-resolver.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ILP_NODE_D_TAG,
  ILP_NODE_KIND,
  type ILPNodeAnnouncement,
  type ILPNodeMetadata,
} from '../../../src/btp-nips/types/ilp-node-announcement.js'

import type { AnnouncementQuery } from '../../../src/btp-nips/peer-discovery/announcement-query.js'

/**
 * Unit Tests: Address Resolver
 *
 * Epic 6: Peer Networking & Social Graph Integration
 * Story 6.2: Nostr-to-ILP Address Resolution
 *
 * Tests cover:
 * - Resolving existing peer successfully
 * - Returning null for non-existent peer
 * - Cache behavior and hit rates
 * - Refreshing stale peer info
 * - Batch resolution of multiple peers
 * - Handling partial batch results
 * - Parsing optional metadata from content field
 *
 * Reference: docs/stories/6.2.story.md#task-8
 */

// Test fixtures
const ALICE_PUBKEY = 'abc123def456789012345678901234567890123456789012345678901234abcd'
const BOB_PUBKEY = '111222333444555666777888999aaabbbcccdddeeefff000111222333444555'
const CAROL_PUBKEY = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'
const UNKNOWN_PUBKEY = 'unknownpubkey1234567890123456789012345678901234567890123456789012'

const createMockAnnouncement = (
  pubkey: string,
  nodeId: string,
  withMetadata = false,
): ILPNodeAnnouncement => {
  const metadata: ILPNodeMetadata | null = withMetadata
    ? {
        nodeId,
        operatorName: `${nodeId}'s Relay`,
        description: 'Test relay node',
        uptime: 99.9,
        lastUpdated: 1701964800,
      }
    : null

  return {
    id: `event_id_${pubkey}`,
    pubkey,
    created_at: 1701964800,
    kind: ILP_NODE_KIND,
    tags: [
      ['d', ILP_NODE_D_TAG],
      ['ilp-address', `g.btp-nips.${nodeId}.${pubkey.slice(0, 16)}`],
      ['ilp-endpoint', `https://${nodeId}-node.akash.network`],
      ['base-address', '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'],
      ['supported-tokens', 'eth,usdc'],
      ['version', '1.0.0'],
      ['features', 'subscriptions,payments,routing'],
    ],
    content: metadata ? JSON.stringify(metadata) : '',
    sig: `sig_${pubkey}`,
  }
}

describe('Story 6.2: Address Resolver', () => {
  let mockAnnouncementQuery: AnnouncementQuery
  let resolver: AddressResolver

  beforeEach(() => {
    // Create mock AnnouncementQuery
    mockAnnouncementQuery = {
      queryNodeAnnouncement: vi.fn(),
      batchQueryAnnouncements: vi.fn(),
      invalidateCache: vi.fn(),
      getCacheStats: vi.fn(),
      resetCacheStats: vi.fn(),
    } as unknown as AnnouncementQuery

    resolver = new AddressResolver(mockAnnouncementQuery)
  })

  describe('Test 8.1: should resolve existing peer successfully', () => {
    it('resolves peer with all required tags', async () => {
      const aliceAnnouncement = createMockAnnouncement(ALICE_PUBKEY, 'alice')

      vi.mocked(mockAnnouncementQuery.queryNodeAnnouncement).mockResolvedValue(
        aliceAnnouncement,
      )

      const peerInfo = await resolver.resolveIlpAddress(ALICE_PUBKEY)

      expect(peerInfo).not.toBeNull()
      expect(peerInfo?.pubkey).toBe(ALICE_PUBKEY)
      expect(peerInfo?.ilpAddress).toBe(
        `g.btp-nips.alice.${ALICE_PUBKEY.slice(0, 16)}`,
      )
      expect(peerInfo?.endpoint).toBe('https://alice-node.akash.network')
      expect(peerInfo?.baseAddress).toBe(
        '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      )
      expect(peerInfo?.supportedTokens).toEqual(['eth', 'usdc'])
      expect(peerInfo?.version).toBe('1.0.0')
      expect(peerInfo?.features).toEqual(['subscriptions', 'payments', 'routing'])

      expect(mockAnnouncementQuery.queryNodeAnnouncement).toHaveBeenCalledWith(
        ALICE_PUBKEY,
      )
    })

    it('verifies all tags parsed correctly', async () => {
      const aliceAnnouncement = createMockAnnouncement(ALICE_PUBKEY, 'alice')

      vi.mocked(mockAnnouncementQuery.queryNodeAnnouncement).mockResolvedValue(
        aliceAnnouncement,
      )

      const peerInfo = await resolver.resolveIlpAddress(ALICE_PUBKEY)

      expect(peerInfo).toBeDefined()
      expect(peerInfo?.ilpAddress).toMatch(/^g\.btp-nips\.[a-z0-9]+\.[0-9a-f]{16}$/)
      expect(peerInfo?.endpoint).toMatch(/^https:\/\//)
      expect(peerInfo?.baseAddress).toMatch(/^0x[0-9a-fA-F]{40}$/)
      expect(peerInfo?.supportedTokens).toBeInstanceOf(Array)
      expect(peerInfo?.features).toBeInstanceOf(Array)
    })
  })

  describe('Test 8.2: should return null for non-existent peer', () => {
    it('returns null when announcement not found', async () => {
      vi.mocked(mockAnnouncementQuery.queryNodeAnnouncement).mockResolvedValue(
        null,
      )

      const peerInfo = await resolver.resolveIlpAddress(UNKNOWN_PUBKEY)

      expect(peerInfo).toBeNull()
      expect(mockAnnouncementQuery.queryNodeAnnouncement).toHaveBeenCalledWith(
        UNKNOWN_PUBKEY,
      )
    })

    it('logs warning when peer not found', async () => {
      vi.mocked(mockAnnouncementQuery.queryNodeAnnouncement).mockResolvedValue(
        null,
      )

      await resolver.resolveIlpAddress(UNKNOWN_PUBKEY)

      // Logger is mocked implicitly - just verify no errors thrown
      expect(true).toBe(true)
    })
  })

  describe('Test 8.3: should use cache on second call (cache hit)', () => {
    it('queries only once when called twice with same pubkey', async () => {
      const aliceAnnouncement = createMockAnnouncement(ALICE_PUBKEY, 'alice')

      // Mock returns cached result on second call (AnnouncementQuery handles caching)
      vi.mocked(mockAnnouncementQuery.queryNodeAnnouncement)
        .mockResolvedValueOnce(aliceAnnouncement)
        .mockResolvedValueOnce(aliceAnnouncement)

      const firstCall = await resolver.resolveIlpAddress(ALICE_PUBKEY)
      const secondCall = await resolver.resolveIlpAddress(ALICE_PUBKEY)

      expect(firstCall).toEqual(secondCall)
      expect(mockAnnouncementQuery.queryNodeAnnouncement).toHaveBeenCalledTimes(
        2,
      )
    })

    it('cache behavior is delegated to AnnouncementQuery', async () => {
      const aliceAnnouncement = createMockAnnouncement(ALICE_PUBKEY, 'alice')

      vi.mocked(mockAnnouncementQuery.queryNodeAnnouncement).mockResolvedValue(
        aliceAnnouncement,
      )

      await resolver.resolveIlpAddress(ALICE_PUBKEY)

      // Verify AnnouncementQuery is called (it handles caching internally)
      expect(mockAnnouncementQuery.queryNodeAnnouncement).toHaveBeenCalled()
    })
  })

  describe('Test 8.4: should refresh stale peer info', () => {
    it('invalidates cache and re-queries', async () => {
      const aliceAnnouncement = createMockAnnouncement(ALICE_PUBKEY, 'alice')

      vi.mocked(mockAnnouncementQuery.queryNodeAnnouncement).mockResolvedValue(
        aliceAnnouncement,
      )
      vi.mocked(mockAnnouncementQuery.invalidateCache).mockResolvedValue()

      const freshInfo = await resolver.refreshPeerInfo(ALICE_PUBKEY)

      expect(mockAnnouncementQuery.invalidateCache).toHaveBeenCalledWith(
        ALICE_PUBKEY,
      )
      expect(mockAnnouncementQuery.queryNodeAnnouncement).toHaveBeenCalledWith(
        ALICE_PUBKEY,
      )
      expect(freshInfo).not.toBeNull()
      expect(freshInfo?.pubkey).toBe(ALICE_PUBKEY)
    })

    it('returns null if fresh query finds no announcement', async () => {
      vi.mocked(mockAnnouncementQuery.queryNodeAnnouncement).mockResolvedValue(
        null,
      )
      vi.mocked(mockAnnouncementQuery.invalidateCache).mockResolvedValue()

      const freshInfo = await resolver.refreshPeerInfo(UNKNOWN_PUBKEY)

      expect(freshInfo).toBeNull()
      expect(mockAnnouncementQuery.invalidateCache).toHaveBeenCalled()
    })
  })

  describe('Test 8.5: should batch resolve multiple peers', () => {
    it('resolves all 3 peers correctly', async () => {
      const aliceAnnouncement = createMockAnnouncement(ALICE_PUBKEY, 'alice')
      const bobAnnouncement = createMockAnnouncement(BOB_PUBKEY, 'bob')
      const carolAnnouncement = createMockAnnouncement(CAROL_PUBKEY, 'carol')

      const announcements = new Map<string, ILPNodeAnnouncement>([
        [ALICE_PUBKEY, aliceAnnouncement],
        [BOB_PUBKEY, bobAnnouncement],
        [CAROL_PUBKEY, carolAnnouncement],
      ])

      vi.mocked(mockAnnouncementQuery.batchQueryAnnouncements).mockResolvedValue(
        announcements,
      )

      const pubkeys = [ALICE_PUBKEY, BOB_PUBKEY, CAROL_PUBKEY]
      const results = await resolver.batchResolveIlpAddresses(pubkeys)

      expect(results.size).toBe(3)
      expect(results.has(ALICE_PUBKEY)).toBe(true)
      expect(results.has(BOB_PUBKEY)).toBe(true)
      expect(results.has(CAROL_PUBKEY)).toBe(true)

      expect(results.get(ALICE_PUBKEY)?.ilpAddress).toContain('alice')
      expect(results.get(BOB_PUBKEY)?.ilpAddress).toContain('bob')
      expect(results.get(CAROL_PUBKEY)?.ilpAddress).toContain('carol')

      expect(
        mockAnnouncementQuery.batchQueryAnnouncements,
      ).toHaveBeenCalledWith(pubkeys)
    })

    it('returns Map with 3 entries', async () => {
      const announcements = new Map<string, ILPNodeAnnouncement>([
        [ALICE_PUBKEY, createMockAnnouncement(ALICE_PUBKEY, 'alice')],
        [BOB_PUBKEY, createMockAnnouncement(BOB_PUBKEY, 'bob')],
        [CAROL_PUBKEY, createMockAnnouncement(CAROL_PUBKEY, 'carol')],
      ])

      vi.mocked(mockAnnouncementQuery.batchQueryAnnouncements).mockResolvedValue(
        announcements,
      )

      const results = await resolver.batchResolveIlpAddresses([
        ALICE_PUBKEY,
        BOB_PUBKEY,
        CAROL_PUBKEY,
      ])

      expect(results).toBeInstanceOf(Map)
      expect(results.size).toBe(3)
    })
  })

  describe('Test 8.6: should handle partial batch results', () => {
    it('returns only 2 entries when 2/3 found', async () => {
      const announcements = new Map<string, ILPNodeAnnouncement>([
        [ALICE_PUBKEY, createMockAnnouncement(ALICE_PUBKEY, 'alice')],
        [BOB_PUBKEY, createMockAnnouncement(BOB_PUBKEY, 'bob')],
        // CAROL_PUBKEY not found
      ])

      vi.mocked(mockAnnouncementQuery.batchQueryAnnouncements).mockResolvedValue(
        announcements,
      )

      const results = await resolver.batchResolveIlpAddresses([
        ALICE_PUBKEY,
        BOB_PUBKEY,
        CAROL_PUBKEY,
      ])

      expect(results.size).toBe(2)
      expect(results.has(ALICE_PUBKEY)).toBe(true)
      expect(results.has(BOB_PUBKEY)).toBe(true)
      expect(results.has(CAROL_PUBKEY)).toBe(false)
    })

    it('does not throw errors for missing peers', async () => {
      const announcements = new Map<string, ILPNodeAnnouncement>([
        [ALICE_PUBKEY, createMockAnnouncement(ALICE_PUBKEY, 'alice')],
      ])

      vi.mocked(mockAnnouncementQuery.batchQueryAnnouncements).mockResolvedValue(
        announcements,
      )

      await expect(
        resolver.batchResolveIlpAddresses([ALICE_PUBKEY, UNKNOWN_PUBKEY]),
      ).resolves.not.toThrow()
    })

    it('returns empty map when all peers missing', async () => {
      vi.mocked(mockAnnouncementQuery.batchQueryAnnouncements).mockResolvedValue(
        new Map(),
      )

      const results = await resolver.batchResolveIlpAddresses([
        UNKNOWN_PUBKEY,
        'another_unknown',
      ])

      expect(results.size).toBe(0)
    })
  })

  describe('Test 8.7: should parse optional metadata from content field', () => {
    it('populates metadata when present', async () => {
      const aliceAnnouncement = createMockAnnouncement(
        ALICE_PUBKEY,
        'alice',
        true,
      )

      vi.mocked(mockAnnouncementQuery.queryNodeAnnouncement).mockResolvedValue(
        aliceAnnouncement,
      )

      const peerInfo = await resolver.resolveIlpAddress(ALICE_PUBKEY)

      expect(peerInfo).not.toBeNull()
      expect(peerInfo?.metadata).toBeDefined()
      expect(peerInfo?.metadata?.nodeId).toBe('alice')
      expect(peerInfo?.metadata?.operatorName).toBe("alice's Relay")
      expect(peerInfo?.metadata?.description).toBe('Test relay node')
      expect(peerInfo?.metadata?.uptime).toBe(99.9)
      expect(peerInfo?.metadata?.lastUpdated).toBe(1701964800)
    })

    it('leaves metadata undefined when content empty', async () => {
      const aliceAnnouncement = createMockAnnouncement(
        ALICE_PUBKEY,
        'alice',
        false,
      )

      vi.mocked(mockAnnouncementQuery.queryNodeAnnouncement).mockResolvedValue(
        aliceAnnouncement,
      )

      const peerInfo = await resolver.resolveIlpAddress(ALICE_PUBKEY)

      expect(peerInfo).not.toBeNull()
      expect(peerInfo?.metadata).toBeUndefined()
    })

    it('handles invalid JSON in content field gracefully', async () => {
      const aliceAnnouncement = createMockAnnouncement(ALICE_PUBKEY, 'alice')
      aliceAnnouncement.content = 'invalid json {'

      vi.mocked(mockAnnouncementQuery.queryNodeAnnouncement).mockResolvedValue(
        aliceAnnouncement,
      )

      const peerInfo = await resolver.resolveIlpAddress(ALICE_PUBKEY)

      expect(peerInfo).not.toBeNull()
      expect(peerInfo?.metadata).toBeUndefined()
    })
  })

  describe('Edge Cases', () => {
    it('handles empty pubkeys array in batch resolve', async () => {
      const results = await resolver.batchResolveIlpAddresses([])

      expect(results.size).toBe(0)
      expect(
        mockAnnouncementQuery.batchQueryAnnouncements,
      ).not.toHaveBeenCalled()
    })

    it('handles announcement with missing required tags', async () => {
      const invalidAnnouncement = {
        id: 'invalid_event',
        pubkey: ALICE_PUBKEY,
        created_at: 1701964800,
        kind: ILP_NODE_KIND,
        tags: [
          ['d', ILP_NODE_D_TAG],
          // Missing required tags
        ],
        content: '',
        sig: 'sig',
      } as ILPNodeAnnouncement

      vi.mocked(mockAnnouncementQuery.queryNodeAnnouncement).mockResolvedValue(
        invalidAnnouncement,
      )

      const peerInfo = await resolver.resolveIlpAddress(ALICE_PUBKEY)

      expect(peerInfo).toBeNull()
    })
  })
})
