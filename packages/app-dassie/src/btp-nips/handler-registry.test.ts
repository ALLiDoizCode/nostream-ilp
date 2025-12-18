import { describe, expect, it } from 'vitest'
import { HandlerRegistry, type BtpNipsHandler, type IlpContext } from './handler-registry'
import type { BtpNipsPacket, BtpNipsResponse } from './types'

describe('HandlerRegistry', () => {
  describe('register', () => {
    it('should register a handler for a message type', () => {
      const registry = new HandlerRegistry()
      const handler: BtpNipsHandler = {
        type: 'EVENT',
        handle: async () => ({ type: 'OK', eventId: 'test', accepted: true, message: '' }),
      }

      registry.register(handler)
      expect(registry.has('EVENT')).toBe(true)
    })

    it('should throw error when registering duplicate handler', () => {
      const registry = new HandlerRegistry()
      const handler1: BtpNipsHandler = {
        type: 'EVENT',
        handle: async () => ({ type: 'OK', eventId: 'test', accepted: true, message: '' }),
      }
      const handler2: BtpNipsHandler = {
        type: 'EVENT',
        handle: async () => ({ type: 'OK', eventId: 'test2', accepted: false, message: 'duplicate' }),
      }

      registry.register(handler1)
      expect(() => registry.register(handler2)).toThrow('Handler already registered for type: EVENT')
    })

    it('should register multiple handlers for different types', () => {
      const registry = new HandlerRegistry()
      const eventHandler: BtpNipsHandler = {
        type: 'EVENT',
        handle: async () => ({ type: 'OK', eventId: 'test', accepted: true, message: '' }),
      }
      const reqHandler: BtpNipsHandler = {
        type: 'REQ',
        handle: async () => ({ type: 'EOSE', subId: 'test' }),
      }

      registry.register(eventHandler)
      registry.register(reqHandler)
      expect(registry.has('EVENT')).toBe(true)
      expect(registry.has('REQ')).toBe(true)
    })
  })

  describe('unregister', () => {
    it('should unregister a handler', () => {
      const registry = new HandlerRegistry()
      const handler: BtpNipsHandler = {
        type: 'EVENT',
        handle: async () => ({ type: 'OK', eventId: 'test', accepted: true, message: '' }),
      }

      registry.register(handler)
      expect(registry.has('EVENT')).toBe(true)

      const removed = registry.unregister('EVENT')
      expect(removed).toBe(true)
      expect(registry.has('EVENT')).toBe(false)
    })

    it('should return false when unregistering non-existent handler', () => {
      const registry = new HandlerRegistry()
      const removed = registry.unregister('NONEXISTENT')
      expect(removed).toBe(false)
    })
  })

  describe('route', () => {
    it('should route EVENT packet to EVENT handler', async () => {
      const registry = new HandlerRegistry()
      const mockResponse: BtpNipsResponse = {
        type: 'OK',
        eventId: 'abc123',
        accepted: true,
        message: '',
      }
      const handler: BtpNipsHandler = {
        type: 'EVENT',
        handle: async () => mockResponse,
      }

      registry.register(handler)

      const packet: BtpNipsPacket = {
        type: 'EVENT',
        header: { version: 1, messageType: 0x01, payloadLength: 100 },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: {
            id: 'abc123',
            pubkey: '02'.repeat(32),
            created_at: 1234567890,
            kind: 1,
            tags: [],
            content: 'test',
            sig: '00'.repeat(64),
          },
          metadata: { timestamp: Date.now(), sender: 'g.dassie.sender' },
        },
      }

      const ilpContext: IlpContext = {
        sender: 'g.dassie.sender',
        amount: '1000',
        condition: Buffer.alloc(32),
      }

      const response = await registry.route(packet, ilpContext)
      expect(response).toEqual(mockResponse)
    })

    it('should route REQ packet to REQ handler', async () => {
      const registry = new HandlerRegistry()
      const mockResponse: BtpNipsResponse = {
        type: 'EOSE',
        subId: 'sub123',
      }
      const handler: BtpNipsHandler = {
        type: 'REQ',
        handle: async () => mockResponse,
      }

      registry.register(handler)

      const packet: BtpNipsPacket = {
        type: 'REQ',
        header: { version: 1, messageType: 0x02, payloadLength: 100 },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: [{ kinds: [1], limit: 10 }],
          metadata: { timestamp: Date.now(), sender: 'g.dassie.sender' },
        },
      }

      const ilpContext: IlpContext = {
        sender: 'g.dassie.sender',
        amount: '1000',
        condition: Buffer.alloc(32),
      }

      const response = await registry.route(packet, ilpContext)
      expect(response).toEqual(mockResponse)
    })

    it('should throw error when routing to unregistered handler', async () => {
      const registry = new HandlerRegistry()
      const packet: BtpNipsPacket = {
        type: 'EVENT',
        header: { version: 1, messageType: 0x01, payloadLength: 100 },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: {
            id: 'abc123',
            pubkey: '02'.repeat(32),
            created_at: 1234567890,
            kind: 1,
            tags: [],
            content: 'test',
            sig: '00'.repeat(64),
          },
          metadata: { timestamp: Date.now(), sender: 'g.dassie.sender' },
        },
      }

      const ilpContext: IlpContext = {
        sender: 'g.dassie.sender',
        amount: '1000',
        condition: Buffer.alloc(32),
      }

      await expect(registry.route(packet, ilpContext)).rejects.toThrow(
        'No handler registered for packet type: EVENT (0x01)',
      )
    })

    it('should pass ILP context to handler', async () => {
      const registry = new HandlerRegistry()
      let receivedContext: IlpContext | null = null

      const handler: BtpNipsHandler = {
        type: 'EVENT',
        handle: async (_packet, context) => {
          receivedContext = context
          return { type: 'OK', eventId: 'test', accepted: true, message: '' }
        },
      }

      registry.register(handler)

      const packet: BtpNipsPacket = {
        type: 'EVENT',
        header: { version: 1, messageType: 0x01, payloadLength: 100 },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: {
            id: 'abc123',
            pubkey: '02'.repeat(32),
            created_at: 1234567890,
            kind: 1,
            tags: [],
            content: 'test',
            sig: '00'.repeat(64),
          },
          metadata: { timestamp: Date.now(), sender: 'g.dassie.sender' },
        },
      }

      const ilpContext: IlpContext = {
        sender: 'g.dassie.sender',
        amount: '5000',
        condition: Buffer.from('abc123', 'hex'),
        fulfillment: Buffer.from('def456', 'hex'),
      }

      await registry.route(packet, ilpContext)

      expect(receivedContext).toEqual(ilpContext)
    })
  })

  describe('has', () => {
    it('should return true for registered handler', () => {
      const registry = new HandlerRegistry()
      const handler: BtpNipsHandler = {
        type: 'EVENT',
        handle: async () => ({ type: 'OK', eventId: 'test', accepted: true, message: '' }),
      }

      registry.register(handler)
      expect(registry.has('EVENT')).toBe(true)
    })

    it('should return false for unregistered handler', () => {
      const registry = new HandlerRegistry()
      expect(registry.has('NONEXISTENT')).toBe(false)
    })
  })

  describe('getRegisteredTypes', () => {
    it('should return empty array when no handlers registered', () => {
      const registry = new HandlerRegistry()
      expect(registry.getRegisteredTypes()).toEqual([])
    })

    it('should return all registered types', () => {
      const registry = new HandlerRegistry()
      const eventHandler: BtpNipsHandler = {
        type: 'EVENT',
        handle: async () => ({ type: 'OK', eventId: 'test', accepted: true, message: '' }),
      }
      const reqHandler: BtpNipsHandler = {
        type: 'REQ',
        handle: async () => ({ type: 'EOSE', subId: 'test' }),
      }
      const closeHandler: BtpNipsHandler = {
        type: 'CLOSE',
        handle: async () => ({ type: 'NOTICE', message: 'closed' }),
      }

      registry.register(eventHandler)
      registry.register(reqHandler)
      registry.register(closeHandler)

      const types = registry.getRegisteredTypes()
      expect(types).toHaveLength(3)
      expect(types).toContain('EVENT')
      expect(types).toContain('REQ')
      expect(types).toContain('CLOSE')
    })
  })
})
