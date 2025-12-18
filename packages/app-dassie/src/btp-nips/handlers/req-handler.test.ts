import { describe, it, expect, beforeEach } from 'vitest'
import { ReqHandler } from './req-handler'
import { EventRepository } from '../event-repository'
import { SubscriptionManager } from '../subscription-manager'
import { generateTestEvent } from '../test-utils'
import type { BtpNipsPacket, NostrFilter, DatabaseInstance } from '../types'
import type { IlpContext } from '../handler-registry'
import { BtpNipsMessageType } from '../types'

// Mock database for testing (without full Dassie dependencies)
function createTestDatabase(): DatabaseInstance {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3')
  const raw = new Database(':memory:')

  // Create nostr_events table
  raw.exec(`
    CREATE TABLE nostr_events (
      id TEXT PRIMARY KEY NOT NULL,
      pubkey TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      kind INTEGER NOT NULL,
      tags TEXT NOT NULL,
      content TEXT NOT NULL,
      sig TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      source_peer TEXT NOT NULL
    ) STRICT
  `)

  return { raw } as DatabaseInstance
}

describe('ReqHandler', () => {
  let eventRepository: EventRepository
  let subscriptionManager: SubscriptionManager
  let handler: ReqHandler
  let mockIlpContext: IlpContext

  beforeEach(() => {
    const db = createTestDatabase()
    eventRepository = new EventRepository(db)
    subscriptionManager = new SubscriptionManager()
    handler = new ReqHandler(eventRepository, subscriptionManager, () => 'test_sub_123')
    mockIlpContext = {
      sender: 'g.dassie.test',
      amount: '1000',
      condition: Buffer.from('test-condition'),
    }
  })

  describe('filter validation', () => {
    it('should reject REQ with empty filter array', async () => {
      const packet: BtpNipsPacket = {
        type: 'REQ',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.REQ,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: [],
          metadata: { timestamp: Date.now(), sender: 'g.dassie.test' },
        },
      }

      const response = await handler.handle(packet, mockIlpContext)

      expect(response).toEqual({
        type: 'NOTICE',
        message: 'invalid: REQ requires at least one filter',
      })
    })

    it('should reject REQ with limit too large', async () => {
      const filters: NostrFilter[] = [{ limit: 10000 }]
      const packet: BtpNipsPacket = {
        type: 'REQ',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.REQ,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: filters,
          metadata: { timestamp: Date.now(), sender: 'g.dassie.test' },
        },
      }

      const response = await handler.handle(packet, mockIlpContext)

      expect(response.type).toBe('NOTICE')
      expect(response).toMatchObject({
        type: 'NOTICE',
        message: expect.stringContaining('limit too large'),
      })
    })

    it('should reject REQ with negative limit', async () => {
      const filters: NostrFilter[] = [{ limit: -1 }]
      const packet: BtpNipsPacket = {
        type: 'REQ',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.REQ,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: filters,
          metadata: { timestamp: Date.now(), sender: 'g.dassie.test' },
        },
      }

      const response = await handler.handle(packet, mockIlpContext)

      expect(response.type).toBe('NOTICE')
      expect(response).toMatchObject({
        type: 'NOTICE',
        message: expect.stringContaining('non-negative'),
      })
    })

    it('should reject REQ with since > until', async () => {
      const filters: NostrFilter[] = [{ since: 1000, until: 500 }]
      const packet: BtpNipsPacket = {
        type: 'REQ',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.REQ,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: filters,
          metadata: { timestamp: Date.now(), sender: 'g.dassie.test' },
        },
      }

      const response = await handler.handle(packet, mockIlpContext)

      expect(response.type).toBe('NOTICE')
      expect(response).toMatchObject({
        type: 'NOTICE',
        message: expect.stringContaining('since must be <= until'),
      })
    })

    it('should accept valid filter with all fields', async () => {
      const filters: NostrFilter[] = [
        {
          ids: ['abc123'],
          authors: ['pubkey1'],
          kinds: [1],
          since: 100,
          until: 1000,
          limit: 10,
        },
      ]
      const packet: BtpNipsPacket = {
        type: 'REQ',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.REQ,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: filters,
          metadata: { timestamp: Date.now(), sender: 'g.dassie.test' },
        },
      }

      const response = await handler.handle(packet, mockIlpContext)

      expect(response.type).toBe('EOSE')
      expect(response).toMatchObject({
        type: 'EOSE',
        subId: 'test_sub_123',
      })
    })
  })

  describe('subscription management', () => {
    it('should register subscription with filters', async () => {
      const filters: NostrFilter[] = [{ kinds: [1], limit: 10 }]
      const packet: BtpNipsPacket = {
        type: 'REQ',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.REQ,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: filters,
          metadata: { timestamp: Date.now(), sender: 'g.dassie.test' },
        },
      }

      await handler.handle(packet, mockIlpContext)

      // Verify subscription was registered
      const subscription = subscriptionManager.get('test_sub_123', 'g.dassie.test')
      expect(subscription).toBeDefined()
      expect(subscription?.subId).toBe('test_sub_123')
      expect(subscription?.subscriber).toBe('g.dassie.test')
      expect(subscription?.filters).toEqual(filters)
    })

    it('should return EOSE after processing subscription', async () => {
      const filters: NostrFilter[] = [{ kinds: [1] }]
      const packet: BtpNipsPacket = {
        type: 'REQ',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.REQ,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: filters,
          metadata: { timestamp: Date.now(), sender: 'g.dassie.test' },
        },
      }

      const response = await handler.handle(packet, mockIlpContext)

      expect(response).toEqual({
        type: 'EOSE',
        subId: 'test_sub_123',
      })
    })
  })

  describe('event querying', () => {
    it('should query events matching filters', async () => {
      // Store some test events
      const event1 = generateTestEvent({ kind: 1, content: 'Test 1' })
      const event2 = generateTestEvent({ kind: 1, content: 'Test 2' })
      const event3 = generateTestEvent({ kind: 3, content: 'Test 3' })

      eventRepository.store(event1, 'g.dassie.peer1')
      eventRepository.store(event2, 'g.dassie.peer2')
      eventRepository.store(event3, 'g.dassie.peer3')

      const filters: NostrFilter[] = [{ kinds: [1] }]
      const packet: BtpNipsPacket = {
        type: 'REQ',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.REQ,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: filters,
          metadata: { timestamp: Date.now(), sender: 'g.dassie.test' },
        },
      }

      const response = await handler.handle(packet, mockIlpContext)

      // Should return EOSE (events would be sent separately in production)
      expect(response.type).toBe('EOSE')
    })

    it('should handle multiple filters (OR logic)', async () => {
      // Store test events
      const event1 = generateTestEvent({ kind: 1 })
      const event2 = generateTestEvent({ kind: 3 })
      eventRepository.store(event1, 'g.dassie.peer1')
      eventRepository.store(event2, 'g.dassie.peer2')

      const filters: NostrFilter[] = [{ kinds: [1] }, { kinds: [3] }]
      const packet: BtpNipsPacket = {
        type: 'REQ',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.REQ,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: filters,
          metadata: { timestamp: Date.now(), sender: 'g.dassie.test' },
        },
      }

      const response = await handler.handle(packet, mockIlpContext)

      expect(response.type).toBe('EOSE')
      expect(subscriptionManager.count()).toBe(1)
    })

    it('should handle empty query results', async () => {
      const filters: NostrFilter[] = [{ kinds: [999] }] // No events with kind 999
      const packet: BtpNipsPacket = {
        type: 'REQ',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.REQ,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: filters,
          metadata: { timestamp: Date.now(), sender: 'g.dassie.test' },
        },
      }

      const response = await handler.handle(packet, mockIlpContext)

      expect(response.type).toBe('EOSE')
    })
  })
})
