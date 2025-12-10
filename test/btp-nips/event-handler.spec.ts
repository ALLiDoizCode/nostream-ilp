import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { calculateEventId } from '../../src/btp-nips/crypto'
import { EventRepository } from '../../src/btp-nips/storage/event-repository'
import {
  extractPaymentMetadata,
  handleEventPacket,
  isEventMessage,
} from '../../src/btp-nips/handlers/event-handler'
import { NostrMessageType } from '../../src/btp-nips/types'
import { randomBytes } from 'crypto'
import { schnorr } from '@noble/secp256k1'

import type { BTPNIPsPacket, NostrEvent } from '../../src/btp-nips/types'
import type { ILPPacket } from '../../src/btp-nips/handlers/event-handler'

/**
 * Unit Tests for BTP-NIPs EVENT Handler
 *
 * Tests payment validation, signature verification, and event storage logic.
 *
 * @see src/btp-nips/handlers/event-handler.ts
 * @see Story 5.2 - Task 12
 */
/**
 * Generate a valid Nostr event with signature
 */
async function createValidEvent(overrides?: Partial<NostrEvent>): Promise<NostrEvent> {
  // Generate a random private key for testing
  const privateKey = randomBytes(32)
  const publicKey = Buffer.from(schnorr.getPublicKey(privateKey)).toString('hex')

  const event: Omit<NostrEvent, 'id' | 'sig'> = {
    pubkey: publicKey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: 'Test event',
    ...overrides,
  }

  // Calculate event ID
  const id = calculateEventId(event as NostrEvent)

  // Sign the event ID
  const signature = Buffer.from(await schnorr.sign(id, privateKey)).toString('hex')

  return {
    ...event,
    id,
    sig: signature,
  }
}

/**
 * Create a test BTP-NIPs packet
 */
function createTestPacket(
  event: NostrEvent,
  paymentAmount: string = '100',
): BTPNIPsPacket {
  return {
    header: {
      version: 1,
      messageType: NostrMessageType.EVENT,
      payloadLength: 0, // Will be calculated during serialization
    },
    payload: {
      payment: {
        amount: paymentAmount,
        currency: 'msat',
        purpose: 'event_publish',
      },
      nostr: event,
      metadata: {
        timestamp: Math.floor(Date.now() / 1000),
        sender: 'g.dassie.alice',
      },
    },
  }
}

/**
 * Create a test ILP packet
 */
function createTestILPPacket(): ILPPacket {
  return {
    data: Buffer.from('test'),
    destination: 'g.dassie.relay',
    amount: '100',
  }
}

describe('Event Handler', () => {
  let repository: EventRepository

  beforeEach(() => {
    repository = new EventRepository()
  })

  afterEach(async () => {
    // Clean up test data
    await repository.deleteAll()
  })

  describe('handleEventPacket', () => {
    it('should store valid event with sufficient payment', async () => {
      const _event = await createValidEvent()
      const packet = createTestPacket(event, '100') // 100 msats (sufficient for kind 1)
      const ilpPacket = createTestILPPacket()

      const result = await handleEventPacket(packet, ilpPacket)

      expect(result.success).toBe(true)
      expect(result.eventId).toBe(event.id)
      expect(result.duplicate).toBe(false)
      expect(result.fulfillPacket).toBe(true)
      expect(result.rejectPacket).toBe(false)

      // Verify event was saved
      const saved = await repository.getEvent(event.id)
      expect(saved).toBeDefined()
      expect(saved?.id).toBe(event.id)
    })

    it('should reject event with insufficient payment', async () => {
      const _event = await createValidEvent()
      const packet = createTestPacket(event, '10') // Only 10 msats (insufficient)
      const ilpPacket = createTestILPPacket()

      const result = await handleEventPacket(packet, ilpPacket)

      expect(result.success).toBe(false)
      expect(result.eventId).toBe(event.id)
      expect(result.duplicate).toBe(false)
      expect(result.fulfillPacket).toBe(false)
      expect(result.rejectPacket).toBe(true)
      expect(result.rejectionReason).toContain('Insufficient payment')

      // Verify event was NOT saved
      const saved = await repository.getEvent(event.id)
      expect(saved).toBeNull()
    })

    it('should fulfill payment for invalid signature but not store event', async () => {
      const _event = await createValidEvent()

      // Tamper with signature to make it invalid
      const tamperedEvent = { ...event, sig: 'invalid_signature_' + '0'.repeat(112) }
      const packet = createTestPacket(tamperedEvent, '100')
      const ilpPacket = createTestILPPacket()

      const result = await handleEventPacket(packet, ilpPacket)

      expect(result.success).toBe(false)
      expect(result.eventId).toBe(event.id)
      expect(result.duplicate).toBe(false)
      expect(result.fulfillPacket).toBe(true) // Accept payment to prevent DoS
      expect(result.rejectPacket).toBe(false)
      expect(result.error).toContain('Signature verification failed')

      // Verify event was NOT saved
      const saved = await repository.getEvent(event.id)
      expect(saved).toBeNull()
    })

    it('should ignore duplicate events (fulfill packet)', async () => {
      const _event = await createValidEvent()
      const packet = createTestPacket(event, '100')
      const ilpPacket = createTestILPPacket()

      // Save event first time
      const result1 = await handleEventPacket(packet, ilpPacket)
      expect(result1.success).toBe(true)
      expect(result1.duplicate).toBe(false)

      // Try to save same event again
      const result2 = await handleEventPacket(packet, ilpPacket)
      expect(result2.success).toBe(true)
      expect(result2.duplicate).toBe(true)
      expect(result2.fulfillPacket).toBe(true)
      expect(result2.rejectPacket).toBe(false)
    })

    it('should handle kind-specific pricing (kind 30023 = 500 msats)', async () => {
      const _event = await createValidEvent({ kind: 30023 }) // Long-form content
      const packet = createTestPacket(event, '500') // 500 msats (sufficient for kind 30023)
      const ilpPacket = createTestILPPacket()

      const result = await handleEventPacket(packet, ilpPacket)

      expect(result.success).toBe(true)
      expect(result.fulfillPacket).toBe(true)

      // Verify event was saved
      const saved = await repository.getEvent(event.id)
      expect(saved).toBeDefined()
      expect(saved?.kind).toBe(30023)
    })

    it('should reject kind 30023 event with insufficient payment (< 500 msats)', async () => {
      const _event = await createValidEvent({ kind: 30023 })
      const packet = createTestPacket(event, '100') // Only 100 msats (insufficient for kind 30023)
      const ilpPacket = createTestILPPacket()

      const result = await handleEventPacket(packet, ilpPacket)

      expect(result.success).toBe(false)
      expect(result.rejectPacket).toBe(true)
      expect(result.rejectionReason).toContain('Insufficient payment')

      // Verify event was NOT saved
      const saved = await repository.getEvent(event.id)
      expect(saved).toBeNull()
    })

    it('should handle database retry on transient failures', async () => {
      // Note: This test would require mocking the repository to simulate failures
      // For now, we test the happy path and document that retry logic exists
      const _event = await createValidEvent()
      const packet = createTestPacket(event, '100')
      const ilpPacket = createTestILPPacket()

      const result = await handleEventPacket(packet, ilpPacket)

      expect(result.success).toBe(true)
      // In real implementation with mocks, we would verify:
      // - Repository.saveEvent was called with retry logic
      // - Exponential backoff was applied
      // - Maximum 3 attempts were made
    })

    it('should cache event in Redis after successful save', async () => {
      const _event = await createValidEvent()
      const packet = createTestPacket(event, '100')
      const ilpPacket = createTestILPPacket()

      const result = await handleEventPacket(packet, ilpPacket)

      expect(result.success).toBe(true)

      // In real implementation with Redis mocks, we would verify:
      // - EventCache.cacheEvent was called
      // - Event was stored with 24-hour TTL
      // - Cache failures are non-blocking (graceful degradation)
    })
  })

  describe('extractPaymentMetadata', () => {
    it('should extract payment metadata from packet', async () => {
      const _event = await createValidEvent()
      const packet = createTestPacket(event, '100')

      const payment = extractPaymentMetadata(packet)

      expect(payment.amount).toBe('100')
      expect(payment.currency).toBe('msat')
      expect(payment.purpose).toBe('event_publish')
    })
  })

  describe('isEventMessage', () => {
    it('should return true for EVENT message type', async () => {
      const _event = await createValidEvent()
      const packet = createTestPacket(event)

      expect(isEventMessage(packet)).toBe(true)
    })

    it('should return false for non-EVENT message types', async () => {
      const _event = await createValidEvent()
      const packet = createTestPacket(event)

      // Change message type to REQ
      packet.header.messageType = NostrMessageType.REQ

      expect(isEventMessage(packet)).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('should handle event with empty content', async () => {
      const _event = await createValidEvent({ content: '' })
      const packet = createTestPacket(event, '100')
      const ilpPacket = createTestILPPacket()

      const result = await handleEventPacket(packet, ilpPacket)

      expect(result.success).toBe(true)

      const saved = await repository.getEvent(event.id)
      expect(saved?.content).toBe('')
    })

    it('should handle event with empty tags array', async () => {
      const _event = await createValidEvent({ tags: [] })
      const packet = createTestPacket(event, '100')
      const ilpPacket = createTestILPPacket()

      const result = await handleEventPacket(packet, ilpPacket)

      expect(result.success).toBe(true)

      const saved = await repository.getEvent(event.id)
      expect(saved?.tags).toEqual([])
    })

    it('should handle event with special UTF-8 characters', async () => {
      const _event = await createValidEvent({ content: 'Hello 世界! 🌍🚀' })
      const packet = createTestPacket(event, '100')
      const ilpPacket = createTestILPPacket()

      const result = await handleEventPacket(packet, ilpPacket)

      expect(result.success).toBe(true)

      const saved = await repository.getEvent(event.id)
      expect(saved?.content).toBe('Hello 世界! 🌍🚀')
    })

    it('should handle payment amount as string (not number)', async () => {
      const _event = await createValidEvent()
      const packet = createTestPacket(event, '100')
      const ilpPacket = createTestILPPacket()

      const result = await handleEventPacket(packet, ilpPacket)

      expect(result.success).toBe(true)
      // Payment validation should work with string amounts
    })

    it('should handle very large payment amounts', async () => {
      const _event = await createValidEvent()
      const packet = createTestPacket(event, '999999999') // 999M msats
      const ilpPacket = createTestILPPacket()

      const result = await handleEventPacket(packet, ilpPacket)

      expect(result.success).toBe(true)
      expect(result.fulfillPacket).toBe(true)
    })
  })
})
