import { describe, it, expect, beforeEach } from 'vitest'
import { CloseHandler } from './close-handler'
import { SubscriptionManager } from '../subscription-manager'
import type { BtpNipsPacket } from '../types'
import type { IlpContext } from '../handler-registry'
import { BtpNipsMessageType } from '../types'

describe('CloseHandler', () => {
  let subscriptionManager: SubscriptionManager
  let handler: CloseHandler
  let mockIlpContext: IlpContext

  beforeEach(() => {
    subscriptionManager = new SubscriptionManager()
    handler = new CloseHandler(subscriptionManager)
    mockIlpContext = {
      sender: 'g.dassie.test',
      amount: '1000',
      condition: Buffer.from('test-condition'),
    }
  })

  describe('validation', () => {
    it('should reject CLOSE without subId', async () => {
      const packet: BtpNipsPacket = {
        type: 'CLOSE',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.CLOSE,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: {} as unknown as { subId: string },
          metadata: { timestamp: Date.now(), sender: 'g.dassie.test' },
        },
      }

      const response = await handler.handle(packet, mockIlpContext)

      expect(response).toEqual({
        type: 'NOTICE',
        message: 'invalid: CLOSE requires subId',
      })
    })

    it('should reject CLOSE with empty subId', async () => {
      const packet: BtpNipsPacket = {
        type: 'CLOSE',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.CLOSE,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: { subId: '' },
          metadata: { timestamp: Date.now(), sender: 'g.dassie.test' },
        },
      }

      const response = await handler.handle(packet, mockIlpContext)

      expect(response).toEqual({
        type: 'NOTICE',
        message: 'invalid: subId cannot be empty',
      })
    })

    it('should reject CLOSE with non-string subId', async () => {
      const packet: BtpNipsPacket = {
        type: 'CLOSE',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.CLOSE,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: { subId: 123 } as unknown as { subId: string },
          metadata: { timestamp: Date.now(), sender: 'g.dassie.test' },
        },
      }

      const response = await handler.handle(packet, mockIlpContext)

      expect(response.type).toBe('NOTICE')
      expect(response).toMatchObject({
        type: 'NOTICE',
        message: expect.stringContaining('CLOSE requires subId'),
      })
    })
  })

  describe('subscription cleanup', () => {
    it('should unregister existing subscription', async () => {
      // First, register a subscription
      subscriptionManager.register('test_sub_123', 'g.dassie.test', [
        { kinds: [1] },
      ])
      expect(subscriptionManager.has('test_sub_123', 'g.dassie.test')).toBe(
        true,
      )

      const packet: BtpNipsPacket = {
        type: 'CLOSE',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.CLOSE,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: { subId: 'test_sub_123' },
          metadata: { timestamp: Date.now(), sender: 'g.dassie.test' },
        },
      }

      const response = await handler.handle(packet, mockIlpContext)

      expect(response).toEqual({
        type: 'EOSE',
        subId: 'test_sub_123',
      })
      expect(subscriptionManager.has('test_sub_123', 'g.dassie.test')).toBe(
        false,
      )
    })

    it('should return EOSE even if subscription does not exist', async () => {
      // Don't register any subscription
      const packet: BtpNipsPacket = {
        type: 'CLOSE',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.CLOSE,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: { subId: 'nonexistent_sub' },
          metadata: { timestamp: Date.now(), sender: 'g.dassie.test' },
        },
      }

      const response = await handler.handle(packet, mockIlpContext)

      expect(response).toEqual({
        type: 'EOSE',
        subId: 'nonexistent_sub',
      })
    })

    it('should only unregister subscription for correct subscriber', async () => {
      // Register subscriptions for two different subscribers
      subscriptionManager.register('test_sub_123', 'g.dassie.peer1', [
        { kinds: [1] },
      ])
      subscriptionManager.register('test_sub_123', 'g.dassie.peer2', [
        { kinds: [1] },
      ])

      // Close subscription for peer1
      const packet: BtpNipsPacket = {
        type: 'CLOSE',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.CLOSE,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: { subId: 'test_sub_123' },
          metadata: { timestamp: Date.now(), sender: 'g.dassie.peer1' },
        },
      }

      const context: IlpContext = {
        sender: 'g.dassie.peer1',
        amount: '1000',
        condition: Buffer.from('test-condition'),
      }

      await handler.handle(packet, context)

      // peer1's subscription should be gone
      expect(subscriptionManager.has('test_sub_123', 'g.dassie.peer1')).toBe(
        false,
      )
      // peer2's subscription should still exist
      expect(subscriptionManager.has('test_sub_123', 'g.dassie.peer2')).toBe(
        true,
      )
    })

    it('should handle multiple CLOSE calls for same subscription (idempotent)', async () => {
      // Register subscription
      subscriptionManager.register('test_sub_123', 'g.dassie.test', [
        { kinds: [1] },
      ])

      const packet: BtpNipsPacket = {
        type: 'CLOSE',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.CLOSE,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: { subId: 'test_sub_123' },
          metadata: { timestamp: Date.now(), sender: 'g.dassie.test' },
        },
      }

      // First CLOSE
      const response1 = await handler.handle(packet, mockIlpContext)
      expect(response1.type).toBe('EOSE')

      // Second CLOSE (should still succeed)
      const response2 = await handler.handle(packet, mockIlpContext)
      expect(response2.type).toBe('EOSE')
      expect(response2).toEqual({
        type: 'EOSE',
        subId: 'test_sub_123',
      })
    })

    it('should handle different subscription IDs independently', async () => {
      // Register multiple subscriptions
      subscriptionManager.register('sub_1', 'g.dassie.test', [{ kinds: [1] }])
      subscriptionManager.register('sub_2', 'g.dassie.test', [{ kinds: [3] }])
      subscriptionManager.register('sub_3', 'g.dassie.test', [{ kinds: [7] }])

      // Close sub_2
      const packet: BtpNipsPacket = {
        type: 'CLOSE',
        header: {
          version: 1,
          messageType: BtpNipsMessageType.CLOSE,
          payloadLength: 100,
        },
        payload: {
          payment: { amount: '1000', currency: 'msat' },
          nostr: { subId: 'sub_2' },
          metadata: { timestamp: Date.now(), sender: 'g.dassie.test' },
        },
      }

      await handler.handle(packet, mockIlpContext)

      // sub_1 and sub_3 should still exist
      expect(subscriptionManager.has('sub_1', 'g.dassie.test')).toBe(true)
      expect(subscriptionManager.has('sub_2', 'g.dassie.test')).toBe(false)
      expect(subscriptionManager.has('sub_3', 'g.dassie.test')).toBe(true)
    })
  })
})
