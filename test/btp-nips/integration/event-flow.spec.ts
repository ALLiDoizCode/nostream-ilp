import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { calculateEventId } from '../../../src/btp-nips/crypto'
import { EventRepository } from '../../../src/btp-nips/storage/event-repository'
import {
  fulfillILPPacket,
  processBTPNIPsPacket,
  rejectILPPacket,
} from '../../../src/btp-nips/ilp-integration'
import { handleEventPacket } from '../../../src/btp-nips/handlers/event-handler'
import { NostrMessageType } from '../../../src/btp-nips/types'
import { randomBytes } from 'crypto'
import { schnorr } from '@noble/secp256k1'
import { serializeBTPNIPsPacket } from '../../../src/btp-nips/parser'

import type { ILPPacket } from '../../../src/btp-nips/handlers/event-handler'
import type { NostrEvent } from '../../../src/btp-nips/types'

/**
 * Integration Tests for BTP-NIPs EVENT Flow
 *
 * Tests end-to-end flow from ILP packet → EVENT handler → database storage.
 *
 * @see src/btp-nips/handlers/event-handler.ts
 * @see src/btp-nips/ilp-integration.ts
 * @see Story 5.2 - Task 13
 */
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
 * Create an ILP packet containing a BTP-NIPs EVENT message
 */
async function createEventILPPacket(
  event: NostrEvent,
  paymentAmount: string = '100',
): Promise<ILPPacket> {
  const _btpPacket = {
    header: {
      version: 1,
      messageType: NostrMessageType.EVENT,
      payloadLength: 0,
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
        sender: 'g.dassie.test',
      },
    },
  }

  const packetData = serializeBTPNIPsPacket(btpPacket)

  return {
    data: packetData,
    destination: 'g.dassie.relay',
    amount: paymentAmount,
  }
}

describe('EVENT Flow Integration Tests', () => {
  let repository: EventRepository

  beforeAll(() => {
    repository = new EventRepository()
  })

  afterEach(async () => {
    // Clean up after each test
    await repository.deleteAll()
  })

  describe('End-to-End EVENT Processing', () => {
    it('should process valid EVENT from ILP packet to database', async () => {
      // 1. Create a valid signed event
      const _event = await createSignedEvent({
        content: 'Hello from ILP integration test!',
      })

      // 2. Wrap in ILP packet
      const ilpPacket = await createEventILPPacket(event, '100')

      // 3. Process ILP packet through BTP-NIPs integration
      const _btpPacket = await processBTPNIPsPacket(ilpPacket)

      expect(btpPacket).toBeDefined()
      expect(btpPacket?.header.messageType).toBe(NostrMessageType.EVENT)

      // 4. Handle EVENT packet
      if (btpPacket) {
        const result = await handleEventPacket(btpPacket, ilpPacket)

        expect(result.success).toBe(true)
        expect(result.fulfillPacket).toBe(true)
        expect(result.rejectPacket).toBe(false)
      }

      // 5. Verify event was stored in database
      const stored = await repository.getEvent(event.id)
      expect(stored).toBeDefined()
      expect(stored?.id).toBe(event.id)
      expect(stored?.content).toBe('Hello from ILP integration test!')
    })

    it('should reject EVENT with insufficient payment', async () => {
      const _event = await createSignedEvent()
      const ilpPacket = await createEventILPPacket(event, '10') // Insufficient

      const _btpPacket = await processBTPNIPsPacket(ilpPacket)

      if (btpPacket) {
        const result = await handleEventPacket(btpPacket, ilpPacket)

        expect(result.success).toBe(false)
        expect(result.rejectPacket).toBe(true)
        expect(result.rejectionReason).toContain('Insufficient payment')
      }

      // Verify event was NOT stored
      const stored = await repository.getEvent(event.id)
      expect(stored).toBeNull()
    })

    it('should handle duplicate EVENT submissions (idempotent)', async () => {
      const _event = await createSignedEvent()
      const ilpPacket1 = await createEventILPPacket(event, '100')
      const ilpPacket2 = await createEventILPPacket(event, '100')

      // First submission
      const btpPacket1 = await processBTPNIPsPacket(ilpPacket1)
      if (btpPacket1) {
        const result1 = await handleEventPacket(btpPacket1, ilpPacket1)
        expect(result1.success).toBe(true)
        expect(result1.duplicate).toBe(false)
      }

      // Second submission (duplicate)
      const btpPacket2 = await processBTPNIPsPacket(ilpPacket2)
      if (btpPacket2) {
        const result2 = await handleEventPacket(btpPacket2, ilpPacket2)
        expect(result2.success).toBe(true)
        expect(result2.duplicate).toBe(true)
        expect(result2.fulfillPacket).toBe(true)
      }

      // Verify only one event in database
      const stored = await repository.getEvent(event.id)
      expect(stored).toBeDefined()
    })

    it('should process 10 EVENTs in parallel without race conditions', async () => {
      const events = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          createSignedEvent({ content: `Parallel event ${i}` }),
        ),
      )

      const promises = events.map(async (_event) => {
        const ilpPacket = await createEventILPPacket(event, '100')
        const _btpPacket = await processBTPNIPsPacket(ilpPacket)

        if (btpPacket) {
          return await handleEventPacket(btpPacket, ilpPacket)
        }

        return null
      })

      const results = await Promise.all(promises)

      // All should succeed
      expect(results.every(r => r?.success === true)).toBe(true)

      // Verify all 10 events in database
      for (const event of events) {
        const stored = await repository.getEvent(event.id)
        expect(stored).toBeDefined()
        expect(stored?.id).toBe(event.id)
      }
    })

    it('should handle kind-specific pricing (kind 30023)', async () => {
      const _event = await createSignedEvent({ kind: 30023 })
      const ilpPacket = await createEventILPPacket(event, '500') // 500 msats for kind 30023

      const _btpPacket = await processBTPNIPsPacket(ilpPacket)

      if (btpPacket) {
        const result = await handleEventPacket(btpPacket, ilpPacket)
        expect(result.success).toBe(true)
      }

      const stored = await repository.getEvent(event.id)
      expect(stored).toBeDefined()
      expect(stored?.kind).toBe(30023)
    })

    it('should return null for non-BTP-NIPs ILP packets', async () => {
      const invalidPacket: ILPPacket = {
        data: Buffer.from('invalid data'),
        destination: 'g.dassie.relay',
        amount: '100',
      }

      const _btpPacket = await processBTPNIPsPacket(invalidPacket)

      expect(btpPacket).toBeNull()
    })

    it('should handle ILP packet with malformed BTP-NIPs data', async () => {
      const malformedPacket: ILPPacket = {
        data: Buffer.from([0x01, 0x01, 0x00, 0xFF]), // Truncated packet
        destination: 'g.dassie.relay',
        amount: '100',
      }

      const _btpPacket = await processBTPNIPsPacket(malformedPacket)

      // Should return null and log error (not throw)
      expect(btpPacket).toBeNull()
    })
  })

  describe('ILP Packet Fulfillment/Rejection', () => {
    it('should fulfill ILP packet for successful EVENT', async () => {
      const _event = await createSignedEvent()
      const ilpPacket = await createEventILPPacket(event, '100')

      // Note: fulfillILPPacket is a stub in current implementation
      // In real Dassie integration, this would call Dassie's fulfillment API
      await expect(fulfillILPPacket(ilpPacket)).resolves.toBeUndefined()
    })

    it('should reject ILP packet for insufficient payment', async () => {
      const _event = await createSignedEvent()
      const ilpPacket = await createEventILPPacket(event, '10')

      // Note: rejectILPPacket is a stub in current implementation
      await expect(
        rejectILPPacket(ilpPacket, 'Insufficient payment'),
      ).resolves.toBeUndefined()
    })
  })

  describe('Performance Tests', () => {
    it('should process 100 events within 5 seconds', async () => {
      const startTime = Date.now()

      const events = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          createSignedEvent({ content: `Performance test event ${i}` }),
        ),
      )

      const promises = events.map(async (_event) => {
        const ilpPacket = await createEventILPPacket(event, '100')
        const _btpPacket = await processBTPNIPsPacket(ilpPacket)

        if (btpPacket) {
          return await handleEventPacket(btpPacket, ilpPacket)
        }

        return null
      })

      await Promise.all(promises)

      const elapsed = Date.now() - startTime

      expect(elapsed).toBeLessThan(5000) // Should complete within 5 seconds
    }, 10000) // 10 second test timeout
  })
})
