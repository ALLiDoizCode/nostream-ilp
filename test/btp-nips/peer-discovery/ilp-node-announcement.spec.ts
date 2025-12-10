import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getPublicKey, signEvent } from '../../../src/btp-nips/crypto.js'
import {
  generateIlpAddress,
  isValidIlpAddress,
  parseIlpAddress,
  validateNodeId,
  validatePubkey,
} from '../../../src/btp-nips/peer-discovery/ilp-address-generator.js'
import {
  NodeAnnouncementPublisher,
} from '../../../src/btp-nips/peer-discovery/announcement-publisher.js'
import {
  AnnouncementQuery,
} from '../../../src/btp-nips/peer-discovery/announcement-query.js'
import {
  validateNodeAnnouncement,
  validateNodeAnnouncementDetailed,
  ValidationErrorCode,
} from '../../../src/btp-nips/peer-discovery/announcement-validator.js'
import {
  ILP_NODE_D_TAG,
  ILP_NODE_KIND,
  ILPNodeTag,
} from '../../../src/btp-nips/types/ilp-node-announcement.js'

import type { NostrEvent } from '../../../src/btp-nips/types/index.js'

/**
 * Unit Tests: ILP Node Announcement (Kind 32001)
 *
 * Epic 6: Peer Networking & Social Graph Integration
 * Story 6.1: ILP Node Announcement
 *
 * Tests cover:
 * - ILP address generation and parsing
 * - Announcement publishing and signing
 * - Announcement querying and caching
 * - Announcement validation
 * - Configuration changes and updates
 *
 * Reference: docs/stories/6.1.story.md#task-9
 */

// Test fixtures
const TEST_PRIVATE_KEY = Buffer.from(
  '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  'hex',
)
const TEST_PUBKEY =
  'abc123def456789012345678901234567890123456789012345678901234abcd'
const TEST_NODE_ID = 'alice'
const TEST_ENDPOINT = 'https://alice-node.akash.network'
const TEST_BASE_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' // Valid Ethereum address (EIP-55 checksum)

describe('Story 6.1: ILP Node Announcement', () => {
  describe('Task 2: ILP Address Generator', () => {
    describe('Test 9.1: should generate valid ILP address from nodeId and pubkey', () => {
      it('generates correct ILP address format', () => {
        const address = generateIlpAddress(TEST_NODE_ID, TEST_PUBKEY)

        expect(address).toBe('g.btp-nips.alice.abc123def4567890')
        expect(address).toMatch(/^g\.btp-nips\.[a-z0-9]+\.[0-9a-f]{16}$/)
      })

      it('uses first 16 hex chars of pubkey', () => {
        const address = generateIlpAddress(TEST_NODE_ID, TEST_PUBKEY)
        const parsed = parseIlpAddress(address)

        expect(parsed).not.toBeNull()
        expect(parsed?.pubkeyPrefix).toBe('abc123def4567890')
        expect(parsed?.pubkeyPrefix.length).toBe(16)
      })

      it('validates nodeId format correctly', () => {
        expect(validateNodeId('alice').valid).toBe(true)
        expect(validateNodeId('bob123').valid).toBe(true)
        expect(validateNodeId('a').valid).toBe(true)

        // Invalid: starts with number
        expect(validateNodeId('123alice').valid).toBe(false)
        // Invalid: contains special chars
        expect(validateNodeId('alice-node').valid).toBe(false)
        // Invalid: uppercase
        expect(validateNodeId('Alice').valid).toBe(false)
        // Invalid: too long
        expect(validateNodeId('a'.repeat(33)).valid).toBe(false)
        // Invalid: empty
        expect(validateNodeId('').valid).toBe(false)
      })

      it('validates pubkey format correctly', () => {
        expect(validatePubkey(TEST_PUBKEY).valid).toBe(true)

        // Invalid: too short
        expect(validatePubkey('abc123').valid).toBe(false)
        // Invalid: non-hex chars
        expect(validatePubkey('z'.repeat(64)).valid).toBe(false)
        // Invalid: empty
        expect(validatePubkey('').valid).toBe(false)
      })

      it('parses ILP address correctly', () => {
        const address = 'g.btp-nips.alice.abc123def4567890'
        const parsed = parseIlpAddress(address)

        expect(parsed).not.toBeNull()
        expect(parsed?.nodeId).toBe('alice')
        expect(parsed?.pubkeyPrefix).toBe('abc123def4567890')
      })

      it('returns null for invalid ILP address', () => {
        expect(parseIlpAddress('invalid-address')).toBeNull()
        expect(parseIlpAddress('g.wrong-network.alice.abc123')).toBeNull()
        expect(parseIlpAddress('g.btp-nips.alice')).toBeNull() // Missing pubkey prefix
        expect(parseIlpAddress('g.btp-nips.123alice.abc123def4567890')).toBeNull() // Invalid nodeId
      })

      it('validates ILP address format', () => {
        expect(isValidIlpAddress('g.btp-nips.alice.abc123def4567890')).toBe(true)
        expect(isValidIlpAddress('invalid-address')).toBe(false)
      })
    })

    describe('Test 9.2: should publish announcement on startup', () => {
      let mockRepository: any
      let mockCache: any
      let publisher: NodeAnnouncementPublisher

      beforeEach(() => {
        mockRepository = {
          saveEvent: vi.fn().mockResolvedValue(undefined),
        }
        mockCache = {
          cacheEvent: vi.fn().mockResolvedValue(undefined),
        }

        publisher = new NodeAnnouncementPublisher(mockRepository, {
          endpoint: TEST_ENDPOINT,
          baseAddress: TEST_BASE_ADDRESS,
          supportedTokens: ['eth', 'usdc'],
          version: '1.0.0',
          features: ['subscriptions', 'payments'],
        })
      })

      it('publishes announcement with correct structure', async () => {
        const announcement = await publisher.publishAnnouncement(
          TEST_NODE_ID,
          TEST_PRIVATE_KEY,
        )

        // Verify event structure
        expect(announcement.kind).toBe(ILP_NODE_KIND)
        expect(announcement.pubkey).toBeDefined()
        expect(announcement.sig).toBeDefined()
        expect(announcement.id).toBeDefined()
        expect(announcement.created_at).toBeGreaterThan(0)
      })

      it('includes all required tags', async () => {
        const announcement = await publisher.publishAnnouncement(
          TEST_NODE_ID,
          TEST_PRIVATE_KEY,
        )

        const tags = new Map(announcement.tags.map((t) => [t[0], t[1]]))

        expect(tags.get('d')).toBe(ILP_NODE_D_TAG)
        expect(tags.get(ILPNodeTag.ILP_ADDRESS)).toMatch(/^g\.btp-nips\./)
        expect(tags.get(ILPNodeTag.ILP_ENDPOINT)).toBe(TEST_ENDPOINT)
        expect(tags.get(ILPNodeTag.BASE_ADDRESS)).toBe(TEST_BASE_ADDRESS)
        expect(tags.get(ILPNodeTag.SUPPORTED_TOKENS)).toBe('eth,usdc')
        expect(tags.get(ILPNodeTag.VERSION)).toBe('1.0.0')
        expect(tags.get(ILPNodeTag.FEATURES)).toBe('subscriptions,payments')
      })

      it('generates valid schnorr signature', async () => {
        const announcement = await publisher.publishAnnouncement(
          TEST_NODE_ID,
          TEST_PRIVATE_KEY,
        )

        // Signature should be 128 hex chars
        expect(announcement.sig).toMatch(/^[0-9a-f]{128}$/)
      })

      it('saves announcement to repository', async () => {
        await publisher.publishAnnouncement(TEST_NODE_ID, TEST_PRIVATE_KEY)

        expect(mockRepository.saveEvent).toHaveBeenCalledOnce()
        expect(mockRepository.saveEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: ILP_NODE_KIND,
          }),
        )
      })

      it('caches announcement in memory', async () => {
        const announcement = await publisher.publishAnnouncement(
          TEST_NODE_ID,
          TEST_PRIVATE_KEY,
        )

        const cached = publisher.getCachedAnnouncement()
        expect(cached).not.toBeNull()
        expect(cached?.event.id).toBe(announcement.id)
        expect(cached?.publishedAt).toBeGreaterThan(0)
      })
    })

    describe('Test 9.3: should query peer announcement successfully', () => {
      let mockRepository: any
      let mockCache: any
      let query: AnnouncementQuery

      beforeEach(() => {
        mockRepository = {
          queryEventsByFilters: vi.fn(),
        }
        mockCache = {
          getCustomKey: vi.fn().mockResolvedValue(null),
          setCustomKey: vi.fn().mockResolvedValue(undefined),
          deleteCustomKey: vi.fn().mockResolvedValue(undefined),
        }

        query = new AnnouncementQuery(mockRepository, mockCache)
      })

      it('queries announcement by pubkey', async () => {
        const testAnnouncement = {
          id: 'test_event_id',
          pubkey: TEST_PUBKEY,
          created_at: Math.floor(Date.now() / 1000),
          kind: ILP_NODE_KIND,
          tags: [
            ['d', ILP_NODE_D_TAG],
            ['ilp-address', 'g.btp-nips.alice.abc123def4567890'],
          ],
          content: '',
          sig: '0'.repeat(128),
        }

        mockRepository.queryEventsByFilters.mockResolvedValue([testAnnouncement])

        const result = await query.queryNodeAnnouncement(TEST_PUBKEY)

        expect(result).not.toBeNull()
        expect(result?.id).toBe('test_event_id')
        expect(result?.pubkey).toBe(TEST_PUBKEY)
      })

      it('returns null when announcement not found', async () => {
        mockRepository.queryEventsByFilters.mockResolvedValue([])

        const result = await query.queryNodeAnnouncement(TEST_PUBKEY)

        expect(result).toBeNull()
      })

      it('uses correct filter for query', async () => {
        mockRepository.queryEventsByFilters.mockResolvedValue([])

        await query.queryNodeAnnouncement(TEST_PUBKEY)

        expect(mockRepository.queryEventsByFilters).toHaveBeenCalledWith([
          expect.objectContaining({
            kinds: [ILP_NODE_KIND],
            authors: [TEST_PUBKEY],
            '#d': [ILP_NODE_D_TAG],
            limit: 1,
          }),
        ])
      })
    })

    describe('Test 9.4: should cache announcement queries (cache hit)', () => {
      let mockRepository: any
      let mockCache: any
      let query: AnnouncementQuery

      beforeEach(() => {
        mockRepository = {
          queryEventsByFilters: vi.fn(),
        }
        mockCache = {
          getCustomKey: vi.fn(),
          setCustomKey: vi.fn().mockResolvedValue(undefined),
          deleteCustomKey: vi.fn().mockResolvedValue(undefined),
        }

        query = new AnnouncementQuery(mockRepository, mockCache)
      })

      it('queries database on cache miss', async () => {
        mockCache.getCustomKey.mockResolvedValue(null) // Cache miss
        mockRepository.queryEventsByFilters.mockResolvedValue([
          {
            id: 'test_id',
            pubkey: TEST_PUBKEY,
            kind: ILP_NODE_KIND,
            tags: [['d', ILP_NODE_D_TAG]],
          },
        ])

        await query.queryNodeAnnouncement(TEST_PUBKEY)

        expect(mockCache.getCustomKey).toHaveBeenCalledOnce()
        expect(mockRepository.queryEventsByFilters).toHaveBeenCalledOnce()
      })

      it('skips database query on cache hit', async () => {
        const cachedAnnouncement = {
          id: 'cached_id',
          pubkey: TEST_PUBKEY,
          kind: ILP_NODE_KIND,
          tags: [['d', ILP_NODE_D_TAG]],
        }

        mockCache.getCustomKey.mockResolvedValue(cachedAnnouncement)

        const result = await query.queryNodeAnnouncement(TEST_PUBKEY)

        expect(result?.id).toBe('cached_id')
        expect(mockRepository.queryEventsByFilters).not.toHaveBeenCalled()
      })

      it('tracks cache hit rate correctly', async () => {
        // First query - cache miss
        mockCache.getCustomKey.mockResolvedValueOnce(null)
        mockRepository.queryEventsByFilters.mockResolvedValue([
          { id: 'test', pubkey: TEST_PUBKEY, kind: ILP_NODE_KIND, tags: [] },
        ])
        await query.queryNodeAnnouncement(TEST_PUBKEY)

        // Second query - cache hit
        mockCache.getCustomKey.mockResolvedValueOnce({
          id: 'test',
          pubkey: TEST_PUBKEY,
        })
        await query.queryNodeAnnouncement(TEST_PUBKEY)

        const stats = query.getCacheStats()
        expect(stats.hits).toBe(1)
        expect(stats.misses).toBe(1)
        expect(stats.hitRate).toBe(50)
      })
    })

    describe('Test 9.5: should handle missing announcements gracefully', () => {
      let mockRepository: any
      let mockCache: any
      let query: AnnouncementQuery

      beforeEach(() => {
        mockRepository = {
          queryEventsByFilters: vi.fn().mockResolvedValue([]),
        }
        mockCache = {
          getCustomKey: vi.fn().mockResolvedValue(null),
          setCustomKey: vi.fn().mockResolvedValue(undefined),
          deleteCustomKey: vi.fn().mockResolvedValue(undefined),
        }

        query = new AnnouncementQuery(mockRepository, mockCache)
      })

      it('returns null for non-existent pubkey', async () => {
        const result = await query.queryNodeAnnouncement('nonexistent_pubkey')

        expect(result).toBeNull()
      })

      it('does not throw errors', async () => {
        await expect(
          query.queryNodeAnnouncement('nonexistent_pubkey'),
        ).resolves.toBeNull()
      })

      it('caches negative result to prevent repeated queries', async () => {
        await query.queryNodeAnnouncement('nonexistent_pubkey')

        expect(mockCache.setCustomKey).toHaveBeenCalled()
      })
    })

    describe('Test 9.6: should validate announcement signatures', () => {
      it('validates valid announcement signature', async () => {
        // Create properly signed announcement
        const unsignedEvent = {
          pubkey: getPublicKey(TEST_PRIVATE_KEY),
          created_at: Math.floor(Date.now() / 1000),
          kind: ILP_NODE_KIND,
          tags: [
            ['d', ILP_NODE_D_TAG],
            ['ilp-address', 'g.btp-nips.alice.abc123def4567890'],
            ['ilp-endpoint', TEST_ENDPOINT],
            ['base-address', TEST_BASE_ADDRESS],
            ['supported-tokens', 'eth,usdc'],
            ['version', '1.0.0'],
          ],
          content: '',
        }

        const signedEvent = await signEvent(unsignedEvent, TEST_PRIVATE_KEY)
        const result = await validateNodeAnnouncement(signedEvent)

        if (!result.valid) {
          console.error('Validation errors:', result.errors)
        }

        expect(result.valid).toBe(true)
        expect(result.errors).toHaveLength(0)
      })

      it('rejects invalid signature', async () => {
        const invalidEvent: NostrEvent = {
          id: '0'.repeat(64),
          pubkey: TEST_PUBKEY,
          created_at: Math.floor(Date.now() / 1000),
          kind: ILP_NODE_KIND,
          tags: [
            ['d', ILP_NODE_D_TAG],
            ['ilp-address', 'g.btp-nips.alice.abc123def4567890'],
            ['ilp-endpoint', TEST_ENDPOINT],
            ['base-address', TEST_BASE_ADDRESS],
            ['supported-tokens', 'eth,usdc'],
            ['version', '1.0.0'],
          ],
          content: '',
          sig: '0'.repeat(128), // Invalid signature
        }

        const result = await validateNodeAnnouncement(invalidEvent)

        expect(result.valid).toBe(false)
        expect(result.errors.some((e) => e.includes('signature'))).toBe(true)
      })

      it('provides detailed error codes for validation failures', async () => {
        const invalidEvent: NostrEvent = {
          id: '0'.repeat(64),
          pubkey: TEST_PUBKEY,
          created_at: Math.floor(Date.now() / 1000),
          kind: ILP_NODE_KIND,
          tags: [],
          content: '',
          sig: '0'.repeat(128),
        }

        const result = await validateNodeAnnouncementDetailed(invalidEvent)

        expect(result.valid).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
        expect(result.errors.some((e) => e.code === ValidationErrorCode.MISSING_D_TAG)).toBe(
          true,
        )
      })
    })

    describe('Test 9.7: should update announcement when config changes', () => {
      let mockRepository: any
      let publisher: NodeAnnouncementPublisher

      beforeEach(() => {
        mockRepository = {
          saveEvent: vi.fn().mockResolvedValue(undefined),
        }

        publisher = new NodeAnnouncementPublisher(mockRepository, {
          endpoint: TEST_ENDPOINT,
          baseAddress: TEST_BASE_ADDRESS,
          supportedTokens: ['eth', 'usdc'],
        })
      })

      it('publishes new announcement with updated endpoint', async () => {
        // Initial publish
        const initial = await publisher.publishAnnouncement(
          TEST_NODE_ID,
          TEST_PRIVATE_KEY,
        )

        // Update endpoint
        const newEndpoint = 'https://new-endpoint.akash.network'
        const updated = await publisher.updateAnnouncement(
          { endpoint: newEndpoint },
          TEST_NODE_ID,
          TEST_PRIVATE_KEY,
        )

        // Verify new announcement has updated endpoint
        const endpointTag = updated.tags.find((t) => t[0] === ILPNodeTag.ILP_ENDPOINT)
        expect(endpointTag?.[1]).toBe(newEndpoint)

        // Verify new announcement has different timestamp
        expect(updated.created_at).toBeGreaterThanOrEqual(initial.created_at)
      })

      it('updates config without republishing', () => {
        publisher.updateConfig({ endpoint: 'https://test.example.com' })

        const config = publisher.getConfig()
        expect(config.endpoint).toBe('https://test.example.com')

        // saveEvent should not have been called
        expect(mockRepository.saveEvent).not.toHaveBeenCalled()
      })
    })
  })
})
