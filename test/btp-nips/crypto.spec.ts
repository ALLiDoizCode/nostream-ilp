import { describe, expect, it } from 'vitest'
import { randomBytes } from 'crypto'
import { schnorr } from '@noble/secp256k1'
import {
  calculateEventId,
  serializeEventForId,
  sha256,
  validateEventStructure,
  verifyEventId,
  verifyNostrSignature,
} from '../../src/btp-nips/crypto'

import type { NostrEvent } from '../../src/btp-nips/types'

/**
 * Unit Tests for BTP-NIPs Crypto Utilities
 *
 * Tests Nostr signature verification and event ID calculation.
 *
 * @see src/btp-nips/crypto.ts
 * @see Story 5.2 - Task 10
 */
describe('BTP-NIPs Crypto Utilities', () => {
  describe('serializeEventForId', () => {
    it('should serialize event in NIP-01 format', () => {
      const event: NostrEvent = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [['e', 'event_id'], ['p', 'pubkey_id']],
        content: 'Hello, world!',
        sig: 'c'.repeat(128),
      }

      const serialized = serializeEventForId(event)
      const parsed = JSON.parse(serialized)

      expect(parsed).toEqual([
        0,
        event.pubkey,
        event.created_at,
        event.kind,
        event.tags,
        event.content,
      ])
    })

    it('should handle empty content', () => {
      const event: NostrEvent = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: '',
        sig: 'c'.repeat(128),
      }

      const serialized = serializeEventForId(event)
      const parsed = JSON.parse(serialized)

      expect(parsed[5]).toBe('')
    })

    it('should handle empty tags array', () => {
      const event: NostrEvent = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Test',
        sig: 'c'.repeat(128),
      }

      const serialized = serializeEventForId(event)
      const parsed = JSON.parse(serialized)

      expect(parsed[4]).toEqual([])
    })

    it('should handle special UTF-8 characters in content', () => {
      const event: NostrEvent = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Hello 世界! 🌍🚀',
        sig: 'c'.repeat(128),
      }

      const serialized = serializeEventForId(event)
      const parsed = JSON.parse(serialized)

      expect(parsed[5]).toBe('Hello 世界! 🌍🚀')
    })
  })

  describe('sha256', () => {
    it('should calculate SHA-256 hash correctly', () => {
      const data = Buffer.from('Hello, world!')
      const hash = sha256(data)

      // Expected hash from echo -n "Hello, world!" | sha256sum
      expect(hash).toBe('315f5bdb76d078c43b8ac0064e4a0164612b1fce77c869345bfc94c75894edd3')
    })

    it('should return 64-character hex string', () => {
      const data = Buffer.from('test')
      const hash = sha256(data)

      expect(hash).toHaveLength(64)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  describe('calculateEventId', () => {
    it('should calculate event ID from serialized event', () => {
      const event: NostrEvent = {
        id: 'placeholder',
        pubkey: '0'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Test event',
        sig: 'placeholder',
      }

      const id = calculateEventId(event)

      expect(id).toHaveLength(64)
      expect(id).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should produce different IDs for different events', () => {
      const event1: NostrEvent = {
        id: 'placeholder',
        pubkey: '0'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Event 1',
        sig: 'placeholder',
      }

      const event2: NostrEvent = {
        ...event1,
        content: 'Event 2', // Different content
      }

      const id1 = calculateEventId(event1)
      const id2 = calculateEventId(event2)

      expect(id1).not.toBe(id2)
    })

    it('should produce same ID for identical events', () => {
      const event1: NostrEvent = {
        id: 'placeholder',
        pubkey: '0'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Same event',
        sig: 'placeholder',
      }

      const event2: NostrEvent = {
        ...event1,
      }

      const id1 = calculateEventId(event1)
      const id2 = calculateEventId(event2)

      expect(id1).toBe(id2)
    })
  })

  describe('verifyEventId', () => {
    it('should return true for valid event ID', () => {
      const event: NostrEvent = {
        id: 'placeholder',
        pubkey: '0'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Test',
        sig: 'placeholder',
      }

      // Calculate correct ID
      event.id = calculateEventId(event)

      const valid = verifyEventId(event)
      expect(valid).toBe(true)
    })

    it('should return false for tampered event ID', () => {
      const event: NostrEvent = {
        id: 'a'.repeat(64), // Wrong ID
        pubkey: '0'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Test',
        sig: 'placeholder',
      }

      const valid = verifyEventId(event)
      expect(valid).toBe(false)
    })

    it('should return false if content changed after ID calculation', () => {
      const event: NostrEvent = {
        id: 'placeholder',
        pubkey: '0'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Original',
        sig: 'placeholder',
      }

      // Calculate ID
      event.id = calculateEventId(event)

      // Tamper with content
      event.content = 'Modified'

      const valid = verifyEventId(event)
      expect(valid).toBe(false)
    })
  })

  describe('verifyNostrSignature', () => {
    it('should return true for valid event signature', async () => {
      // Generate a real keypair
      const privateKey = randomBytes(32)
      const publicKey = Buffer.from(schnorr.getPublicKey(privateKey)).toString('hex')

      // Create event
      const event: NostrEvent = {
        id: 'placeholder',
        pubkey: publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [],
        content: 'Test event with valid signature',
        sig: 'placeholder',
      }

      // Calculate correct event ID
      event.id = calculateEventId(event)

      // Sign event
      const signatureBytes = await schnorr.sign(event.id, privateKey)
      event.sig = Buffer.from(signatureBytes).toString('hex')

      // Verify signature
      const valid = await verifyNostrSignature(event)
      expect(valid).toBe(true)
    })

    it('should return false for invalid signature', async () => {
      // Generate keypair
      const privateKey = randomBytes(32)
      const publicKey = Buffer.from(schnorr.getPublicKey(privateKey)).toString('hex')

      // Create event
      const event: NostrEvent = {
        id: 'placeholder',
        pubkey: publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [],
        content: 'Test event',
        sig: 'placeholder',
      }

      // Calculate correct event ID
      event.id = calculateEventId(event)

      // Use a wrong signature
      event.sig = '0'.repeat(128)

      // Verify signature
      const valid = await verifyNostrSignature(event)
      expect(valid).toBe(false)
    })

    it('should return false if event ID is invalid', async () => {
      // Generate keypair
      const privateKey = randomBytes(32)
      const publicKey = Buffer.from(schnorr.getPublicKey(privateKey)).toString('hex')

      // Create event
      const event: NostrEvent = {
        id: 'placeholder',
        pubkey: publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [],
        content: 'Test event',
        sig: 'placeholder',
      }

      // Calculate correct event ID and sign
      event.id = calculateEventId(event)
      const signatureBytes = await schnorr.sign(event.id, privateKey)
      event.sig = Buffer.from(signatureBytes).toString('hex')

      // Tamper with event ID
      event.id = 'a'.repeat(64)

      // Verify signature (should fail because ID is wrong)
      const valid = await verifyNostrSignature(event)
      expect(valid).toBe(false)
    })

    it('should return false for malformed signature', async () => {
      const event: NostrEvent = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Test',
        sig: 'invalid_signature', // Malformed signature
      }

      const valid = await verifyNostrSignature(event)
      expect(valid).toBe(false)
    })

    it('should handle events with tags', async () => {
      // Generate keypair
      const privateKey = randomBytes(32)
      const publicKey = Buffer.from(schnorr.getPublicKey(privateKey)).toString('hex')

      // Create event with tags
      const event: NostrEvent = {
        id: 'placeholder',
        pubkey: publicKey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [
          ['e', '1'.repeat(64)],
          ['p', '2'.repeat(64)],
          ['content-warning', 'nsfw'],
        ],
        content: 'Event with tags',
        sig: 'placeholder',
      }

      // Calculate ID and sign
      event.id = calculateEventId(event)
      const signatureBytes = await schnorr.sign(event.id, privateKey)
      event.sig = Buffer.from(signatureBytes).toString('hex')

      // Verify signature
      const valid = await verifyNostrSignature(event)
      expect(valid).toBe(true)
    })
  })

  describe('validateEventStructure', () => {
    it('should return true for valid event structure', () => {
      const event: NostrEvent = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Test',
        sig: 'c'.repeat(128),
      }

      const valid = validateEventStructure(event)
      expect(valid).toBe(true)
    })

    it('should return false for missing required fields', () => {
      const invalidEvent = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        // Missing created_at
        kind: 1,
        tags: [],
        content: 'Test',
        sig: 'c'.repeat(128),
      }

      const valid = validateEventStructure(invalidEvent)
      expect(valid).toBe(false)
    })

    it('should return false for invalid hex string lengths', () => {
      const invalidEvent: any = {
        id: 'short', // Should be 64 characters
        pubkey: 'b'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Test',
        sig: 'c'.repeat(128),
      }

      const valid = validateEventStructure(invalidEvent)
      expect(valid).toBe(false)
    })

    it('should return false for non-hex ID', () => {
      const invalidEvent: any = {
        id: 'z'.repeat(64), // Not hex
        pubkey: 'b'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Test',
        sig: 'c'.repeat(128),
      }

      const valid = validateEventStructure(invalidEvent)
      expect(valid).toBe(false)
    })

    it('should return false for invalid tag structure', () => {
      const invalidEvent: any = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [['e', 123]], // Tag value should be string, not number
        content: 'Test',
        sig: 'c'.repeat(128),
      }

      const valid = validateEventStructure(invalidEvent)
      expect(valid).toBe(false)
    })

    it('should return false for negative timestamp', () => {
      const invalidEvent: any = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: -1, // Negative timestamp
        kind: 1,
        tags: [],
        content: 'Test',
        sig: 'c'.repeat(128),
      }

      const valid = validateEventStructure(invalidEvent)
      expect(valid).toBe(false)
    })

    it('should return false for negative kind', () => {
      const invalidEvent: any = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: 1234567890,
        kind: -1, // Negative kind
        tags: [],
        content: 'Test',
        sig: 'c'.repeat(128),
      }

      const valid = validateEventStructure(invalidEvent)
      expect(valid).toBe(false)
    })

    it('should return true for event with complex tags', () => {
      const event: NostrEvent = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [
          ['e', 'event_id', 'relay_url', 'marker'],
          ['p', 'pubkey', 'relay_url'],
          ['content-warning', 'nsfw'],
        ],
        content: 'Test',
        sig: 'c'.repeat(128),
      }

      const valid = validateEventStructure(event)
      expect(valid).toBe(true)
    })
  })
})
