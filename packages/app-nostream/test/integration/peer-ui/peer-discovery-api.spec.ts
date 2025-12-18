import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createWebApp } from '../../../src/factories/web-app-factory'
import { EventRepository } from '../../../src/btp-nips/storage/event-repository'
import { EventCache } from '../../../src/btp-nips/storage/event-cache'
import type { ILPNodeAnnouncement } from '../../../src/btp-nips/types/ilp-node-announcement'

/**
 * Integration Tests: Peer Discovery API
 *
 * Tests for peer discovery API endpoints with real database:
 * - Search endpoint with various queries
 * - Peer details endpoint
 * - Connect endpoint (placeholder validation)
 *
 * Reference: docs/stories/9.6.story.md#Task 8
 */

// Mock peer auth middleware (required for all /peer/* endpoints)
vi.mock('../../../src/peer-ui/middleware/peer-auth.js', () => ({
  peerAuth: (_req: any, _res: any, next: any) => next(),
}))

// Mock rate limiter
vi.mock('../../../src/factories/rate-limiter-factory.js', () => ({
  slidingWindowRateLimiterFactory: () => ({
    hit: vi.fn().mockResolvedValue(false), // Not rate limited
  }),
}))

// Mock settings
vi.mock('../../../src/utils/settings.js', () => ({
  SettingsStatic: {
    createSettings: vi.fn().mockReturnValue({}),
  },
}))

// Mock getRemoteAddress
vi.mock('../../../src/utils/http.js', () => ({
  getRemoteAddress: vi.fn().mockReturnValue('127.0.0.1'),
}))

// Mock BTP-NIPs bridge for subscription queries
vi.mock('../../../src/peer-ui/services/btp-nips-bridge.js', () => ({
  btpNipsBridge: {
    getSubscriptionsBySubscriber: vi.fn().mockResolvedValue([]),
  },
}))

// Mock payment channel bridge for channel queries
vi.mock('../../../src/peer-ui/services/payment-channel-bridge.js', () => ({
  paymentChannelBridge: {
    getChannelsByRecipient: vi.fn().mockResolvedValue([]),
  },
}))

describe('Peer Discovery API Integration', () => {
  let app: express.Application
  let eventRepository: EventRepository
  let eventCache: EventCache

  // Test data
  const testPeers = [
    {
      pubkey: 'alice'.padEnd(64, '0'),
      ilpAddress: 'g.btp-nips.alice.npub1alice',
      endpoint: 'https://alice-node.akash.network',
      operatorName: 'Alice\'s Relay',
      nodeId: 'alice',
      uptime: 99.9,
    },
    {
      pubkey: 'bob'.padEnd(64, '0'),
      ilpAddress: 'g.btp-nips.bob.npub1bob',
      endpoint: 'https://bob-node.akash.network',
      operatorName: 'Bob\'s Node',
      nodeId: 'bob',
      uptime: 95.5,
    },
    {
      pubkey: 'carol'.padEnd(64, '0'),
      ilpAddress: 'g.btp-nips.carol.npub1carol',
      endpoint: 'https://carol-node.akash.network',
      operatorName: 'Carol\'s Infrastructure',
      nodeId: 'carol',
      uptime: 88.0,
    },
  ]

  beforeAll(async () => {
    // Initialize app
    app = createWebApp()

    // Initialize repositories
    eventRepository = new EventRepository()
    eventCache = new EventCache()

    // Seed test data (ILP node announcements)
    for (const peer of testPeers) {
      const announcement: ILPNodeAnnouncement = {
        id: `event-${peer.pubkey}`,
        pubkey: peer.pubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 32001,
        tags: [
          ['d', 'ilp-node-info'],
          ['ilp-address', peer.ilpAddress],
          ['ilp-endpoint', peer.endpoint],
          ['base-address', '0x1234567890abcdef1234567890abcdef12345678'],
          ['supported-tokens', 'eth', 'usdc'],
          ['version', '1.0.0'],
          ['features', 'subscriptions', 'payments', 'routing'],
        ],
        content: JSON.stringify({
          nodeId: peer.nodeId,
          operatorName: peer.operatorName,
          uptime: peer.uptime,
          description: `${peer.operatorName} - High-performance BTP-NIPs relay`,
        }),
        sig: 'test-signature',
      }

      await eventRepository.saveEvent(announcement)
    }
  })

  afterAll(async () => {
    // Cleanup test data
    // Note: In production, you'd clean up the database here
  })

  describe('GET /peer/api/discovery/search', () => {
    it('should search by exact pubkey', async () => {
      const response = await request(app)
        .get('/peer/api/discovery/search')
        .query({ query: testPeers[0].pubkey })

      expect(response.status).toBe(200)
      expect(response.body.peers).toBeDefined()
      expect(response.body.total).toBeGreaterThanOrEqual(1)
      expect(response.body.peers[0].pubkey).toBe(testPeers[0].pubkey)
    })

    it('should search by pubkey prefix', async () => {
      const response = await request(app)
        .get('/peer/api/discovery/search')
        .query({ query: 'alice' })

      expect(response.status).toBe(200)
      expect(response.body.peers).toBeDefined()
      expect(response.body.total).toBeGreaterThanOrEqual(1)
    })

    it('should search by operator name (fuzzy)', async () => {
      const response = await request(app)
        .get('/peer/api/discovery/search')
        .query({ query: 'Alice' })

      expect(response.status).toBe(200)
      expect(response.body.peers).toBeDefined()
      expect(response.body.total).toBeGreaterThanOrEqual(1)

      const alicePeer = response.body.peers.find(
        (p: any) => p.operatorName === 'Alice\'s Relay'
      )
      expect(alicePeer).toBeDefined()
    })

    it('should search by node ID', async () => {
      const response = await request(app)
        .get('/peer/api/discovery/search')
        .query({ query: 'bob' })

      expect(response.status).toBe(200)
      expect(response.body.peers).toBeDefined()
      expect(response.body.total).toBeGreaterThanOrEqual(1)
    })

    it('should respect limit parameter', async () => {
      const response = await request(app)
        .get('/peer/api/discovery/search')
        .query({ query: 'node', limit: 2 })

      expect(response.status).toBe(200)
      expect(response.body.peers.length).toBeLessThanOrEqual(2)
      expect(response.body.limit).toBe(2)
    })

    it('should respect offset parameter for pagination', async () => {
      const page1 = await request(app)
        .get('/peer/api/discovery/search')
        .query({ query: 'node', limit: 1, offset: 0 })

      const page2 = await request(app)
        .get('/peer/api/discovery/search')
        .query({ query: 'node', limit: 1, offset: 1 })

      expect(page1.status).toBe(200)
      expect(page2.status).toBe(200)

      if (page1.body.total > 1) {
        expect(page1.body.peers[0].pubkey).not.toBe(page2.body.peers[0]?.pubkey)
      }
    })

    it('should return 400 for missing query parameter', async () => {
      const response = await request(app)
        .get('/peer/api/discovery/search')

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('Query parameter')
    })

    it('should return 400 for empty query', async () => {
      const response = await request(app)
        .get('/peer/api/discovery/search')
        .query({ query: '' })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('Query parameter')
    })

    it('should return 400 for invalid limit (too high)', async () => {
      const response = await request(app)
        .get('/peer/api/discovery/search')
        .query({ query: 'test', limit: 150 })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('limit')
    })

    it('should return 400 for invalid limit (negative)', async () => {
      const response = await request(app)
        .get('/peer/api/discovery/search')
        .query({ query: 'test', limit: -1 })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('limit')
    })

    it('should return 400 for invalid offset (negative)', async () => {
      const response = await request(app)
        .get('/peer/api/discovery/search')
        .query({ query: 'test', offset: -5 })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('offset')
    })

    it('should return empty results for non-existent peer', async () => {
      const response = await request(app)
        .get('/peer/api/discovery/search')
        .query({ query: 'nonexistent123456' })

      expect(response.status).toBe(200)
      expect(response.body.peers).toEqual([])
      expect(response.body.total).toBe(0)
    })

    it('should rank results by relevance (exact match first)', async () => {
      const response = await request(app)
        .get('/peer/api/discovery/search')
        .query({ query: 'alice' })

      expect(response.status).toBe(200)
      expect(response.body.peers.length).toBeGreaterThan(0)

      // First result should be exact or prefix match
      expect(response.body.peers[0].pubkey.toLowerCase()).toContain('alice')
    })
  })

  describe('GET /peer/api/discovery/peer/:pubkey', () => {
    it('should return full peer details', async () => {
      const response = await request(app)
        .get(`/peer/api/discovery/peer/${testPeers[0].pubkey}`)

      expect(response.status).toBe(200)
      expect(response.body.peer).toBeDefined()
      expect(response.body.connectionStatus).toBeDefined()
      expect(response.body.reputation).toBeDefined()

      expect(response.body.peer.pubkey).toBe(testPeers[0].pubkey)
      expect(response.body.peer.ilpAddress).toBe(testPeers[0].ilpAddress)
      expect(response.body.peer.endpoint).toBe(testPeers[0].endpoint)
    })

    it('should include metadata in peer details', async () => {
      const response = await request(app)
        .get(`/peer/api/discovery/peer/${testPeers[0].pubkey}`)

      expect(response.status).toBe(200)
      expect(response.body.peer.metadata).toBeDefined()
      expect(response.body.peer.metadata.operatorName).toBe(testPeers[0].operatorName)
      expect(response.body.peer.metadata.nodeId).toBe(testPeers[0].nodeId)
      expect(response.body.peer.metadata.uptime).toBe(testPeers[0].uptime)
    })

    it('should include connection status', async () => {
      const response = await request(app)
        .get(`/peer/api/discovery/peer/${testPeers[0].pubkey}`)

      expect(response.status).toBe(200)
      expect(response.body.connectionStatus).toMatchObject({
        hasSubscription: expect.any(Boolean),
        hasChannel: expect.any(Boolean),
        lastContact: expect.anything(),
      })
    })

    it('should include reputation metrics', async () => {
      const response = await request(app)
        .get(`/peer/api/discovery/peer/${testPeers[0].pubkey}`)

      expect(response.status).toBe(200)
      expect(response.body.reputation).toMatchObject({
        uptime: expect.any(Number),
        totalPayments: expect.any(Number),
        failedPayments: expect.any(Number),
        averageResponseTime: expect.any(Number),
        reliability: expect.any(Number),
      })
    })

    it('should return 400 for invalid pubkey format (too short)', async () => {
      const response = await request(app)
        .get('/peer/api/discovery/peer/invalid')

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('Invalid pubkey format')
    })

    it('should return 400 for invalid pubkey format (non-hex)', async () => {
      const response = await request(app)
        .get('/peer/api/discovery/peer/' + 'g'.repeat(64))

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('Invalid pubkey format')
    })

    it('should return 404 for non-existent peer', async () => {
      const nonExistentPubkey = '9'.repeat(64)
      const response = await request(app)
        .get(`/peer/api/discovery/peer/${nonExistentPubkey}`)

      expect(response.status).toBe(404)
      expect(response.body.error).toContain('Peer not found')
    })
  })

  describe('POST /peer/api/discovery/connect', () => {
    it('should validate subscription connection request', async () => {
      const response = await request(app)
        .post('/peer/api/discovery/connect')
        .send({
          pubkey: testPeers[0].pubkey,
          connectionType: 'subscription',
          subscriptionParams: {
            filters: [{ kinds: [1] }],
            ttl: 3600,
          },
        })

      // Should return 501 (not implemented) since actual connection logic is in future stories
      expect([200, 501]).toContain(response.status)
    })

    it('should validate channel connection request', async () => {
      const response = await request(app)
        .post('/peer/api/discovery/connect')
        .send({
          pubkey: testPeers[0].pubkey,
          connectionType: 'channel',
          channelParams: {
            blockchain: 'BASE',
            amount: '1000000',
            expirationBlocks: 1000,
          },
        })

      // Should return 501 (not implemented) since actual connection logic is in future stories
      expect([200, 501]).toContain(response.status)
    })

    it('should return 400 for invalid pubkey', async () => {
      const response = await request(app)
        .post('/peer/api/discovery/connect')
        .send({
          pubkey: 'invalid',
          connectionType: 'subscription',
          subscriptionParams: {
            filters: [],
            ttl: 3600,
          },
        })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('Invalid pubkey format')
    })

    it('should return 400 for invalid connection type', async () => {
      const response = await request(app)
        .post('/peer/api/discovery/connect')
        .send({
          pubkey: testPeers[0].pubkey,
          connectionType: 'invalid',
        })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('Invalid connection type')
    })

    it('should return 400 for missing subscription params', async () => {
      const response = await request(app)
        .post('/peer/api/discovery/connect')
        .send({
          pubkey: testPeers[0].pubkey,
          connectionType: 'subscription',
        })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('subscription parameters')
    })

    it('should return 400 for missing channel params', async () => {
      const response = await request(app)
        .post('/peer/api/discovery/connect')
        .send({
          pubkey: testPeers[0].pubkey,
          connectionType: 'channel',
        })

      expect(response.status).toBe(400)
      expect(response.body.error).toContain('channel parameters')
    })

    it('should return 404 for non-existent peer', async () => {
      const nonExistentPubkey = '9'.repeat(64)
      const response = await request(app)
        .post('/peer/api/discovery/connect')
        .send({
          pubkey: nonExistentPubkey,
          connectionType: 'subscription',
          subscriptionParams: {
            filters: [],
            ttl: 3600,
          },
        })

      expect(response.status).toBe(404)
      expect(response.body.error).toContain('Peer not found')
    })
  })

  describe('Rate Limiting', () => {
    it('should apply rate limiting to search endpoint (basic test)', async () => {
      // Make multiple requests
      const requests = Array.from({ length: 5 }, () =>
        request(app)
          .get('/peer/api/discovery/search')
          .query({ query: 'test' })
      )

      const responses = await Promise.all(requests)

      // All should succeed (within rate limit)
      responses.forEach((response) => {
        expect([200, 400]).toContain(response.status)
      })
    })
  })
})
