import { describe, it, expect } from 'vitest'
import {
  calculateEventId,
  signEvent,
  verifyEventSignature,
  NostrEvent,
} from '../../../src/peer-ui/utils/event-signer'

describe('Event Signing', () => {
  // Test private key (hex) - DO NOT USE IN PRODUCTION
  const testPrivateKey = '0000000000000000000000000000000000000000000000000000000000000001'
  const testPublicKey = '79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798'

  describe('calculateEventId', () => {
    it('should calculate correct event ID for a simple event', () => {
      const event = {
        pubkey: testPublicKey,
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Hello Nostr!',
      }

      const eventId = calculateEventId(event)

      expect(eventId).toBeTruthy()
      expect(eventId).toHaveLength(64) // SHA-256 hash is 64 hex characters
      expect(eventId).toMatch(/^[0-9a-f]+$/) // Only hex characters
    })

    it('should produce different IDs for different content', () => {
      const event1 = {
        pubkey: testPublicKey,
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Hello Nostr!',
      }

      const event2 = {
        ...event1,
        content: 'Different content',
      }

      const id1 = calculateEventId(event1)
      const id2 = calculateEventId(event2)

      expect(id1).not.toBe(id2)
    })

    it('should produce same ID for identical events', () => {
      const event = {
        pubkey: testPublicKey,
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Hello Nostr!',
      }

      const id1 = calculateEventId(event)
      const id2 = calculateEventId(event)

      expect(id1).toBe(id2)
    })

    it('should include tags in ID calculation', () => {
      const event1 = {
        pubkey: testPublicKey,
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Hello',
      }

      const event2 = {
        ...event1,
        tags: [['t', 'nostr']],
      }

      const id1 = calculateEventId(event1)
      const id2 = calculateEventId(event2)

      expect(id1).not.toBe(id2)
    })
  })

  describe('signEvent', () => {
    it('should sign an event and produce valid signature', () => {
      const event = {
        pubkey: testPublicKey,
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Hello Nostr!',
      }

      const signedEvent = signEvent(event, testPrivateKey)

      expect(signedEvent.id).toBeTruthy()
      expect(signedEvent.sig).toBeTruthy()
      expect(signedEvent.sig).toHaveLength(128) // Schnorr signature is 64 bytes = 128 hex chars
      expect(signedEvent.pubkey).toBe(testPublicKey)
      expect(signedEvent.content).toBe(event.content)
    })

    it('should produce different signatures for different events', () => {
      const event1 = {
        pubkey: testPublicKey,
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Hello',
      }

      const event2 = {
        ...event1,
        content: 'World',
      }

      const signed1 = signEvent(event1, testPrivateKey)
      const signed2 = signEvent(event2, testPrivateKey)

      expect(signed1.sig).not.toBe(signed2.sig)
      expect(signed1.id).not.toBe(signed2.id)
    })
  })

  describe('verifyEventSignature', () => {
    it('should verify a valid signature', () => {
      const event = {
        pubkey: testPublicKey,
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Hello Nostr!',
      }

      const signedEvent = signEvent(event, testPrivateKey)
      const isValid = verifyEventSignature(signedEvent)

      expect(isValid).toBe(true)
    })

    it('should reject invalid signature', () => {
      const event = {
        pubkey: testPublicKey,
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Hello Nostr!',
      }

      const signedEvent = signEvent(event, testPrivateKey)

      // Tamper with the signature
      const tamperedEvent: NostrEvent = {
        ...signedEvent,
        sig: signedEvent.sig.replace(/a/g, 'b'),
      }

      const isValid = verifyEventSignature(tamperedEvent)

      expect(isValid).toBe(false)
    })

    it('should reject event with tampered content', () => {
      const event = {
        pubkey: testPublicKey,
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Hello Nostr!',
      }

      const signedEvent = signEvent(event, testPrivateKey)

      // Tamper with the content
      const tamperedEvent: NostrEvent = {
        ...signedEvent,
        content: 'Tampered content',
      }

      const isValid = verifyEventSignature(tamperedEvent)

      expect(isValid).toBe(false)
    })

    it('should reject event with wrong ID', () => {
      const event = {
        pubkey: testPublicKey,
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Hello Nostr!',
      }

      const signedEvent = signEvent(event, testPrivateKey)

      // Tamper with the ID
      const tamperedEvent: NostrEvent = {
        ...signedEvent,
        id: signedEvent.id.replace(/a/g, 'b'),
      }

      const isValid = verifyEventSignature(tamperedEvent)

      expect(isValid).toBe(false)
    })
  })
})
