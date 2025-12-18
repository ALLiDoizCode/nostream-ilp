import { schnorr } from '@noble/curves/secp256k1'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { describe, expect, it } from 'vitest'

import {
  calculateEventId,
  deserializeAndVerifyBtpNipsPacket,
  deserializeBtpNipsPacket,
  parseHeader,
  parsePayload,
  verifyEventSignature,
} from './parser.js'
import { BtpNipsMessageType, type NostrEvent } from './types.js'

describe('BTP-NIPs Parser', () => {
  describe('parseHeader', () => {
    it('should parse valid header', () => {
      const data = new Uint8Array([0x01, 0x01, 0x00, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f])

      const header = parseHeader(data)

      expect(header).toEqual({
        version: 0x01,
        messageType: 0x01,
        payloadLength: 5,
      })
    })

    it('should throw error for packet too short', () => {
      const data = new Uint8Array([0x01, 0x01])

      expect(() => parseHeader(data)).toThrow('Packet too short')
    })

    it('should throw error for invalid version', () => {
      const data = new Uint8Array([0x02, 0x01, 0x00, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f])

      expect(() => parseHeader(data)).toThrow('Invalid protocol version')
    })

    it('should throw error for invalid message type (too low)', () => {
      const data = new Uint8Array([0x01, 0x00, 0x00, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f])

      expect(() => parseHeader(data)).toThrow('Invalid message type')
    })

    it('should throw error for invalid message type (too high)', () => {
      const data = new Uint8Array([0x01, 0x08, 0x00, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f])

      expect(() => parseHeader(data)).toThrow('Invalid message type')
    })

    it('should throw error for payload length mismatch', () => {
      const data = new Uint8Array([0x01, 0x01, 0x00, 0x10, 0x68, 0x65])

      expect(() => parseHeader(data)).toThrow('Payload length mismatch')
    })
  })

  describe('parsePayload', () => {
    it('should parse valid EVENT payload', () => {
      const payload = {
        payment: { amount: '1000', currency: 'msat' },
        nostr: {
          id: '0'.repeat(64),
          pubkey: '0'.repeat(64),
          created_at: 1234567890,
          kind: 1,
          tags: [],
          content: 'test',
          sig: '0'.repeat(128),
        },
        metadata: { timestamp: Date.now(), sender: 'g.dassie.node1' },
      }

      const payloadJson = JSON.stringify(payload)
      const payloadBytes = new TextEncoder().encode(payloadJson)
      const data = new Uint8Array(4 + payloadBytes.length)
      data[0] = 0x01
      data[1] = BtpNipsMessageType.EVENT
      data[2] = (payloadBytes.length >> 8) & 0xff
      data[3] = payloadBytes.length & 0xff
      data.set(payloadBytes, 4)

      const header = parseHeader(data)
      const parsed = parsePayload(data, header)

      expect(parsed).toEqual(payload)
    })

    it('should parse valid REQ payload', () => {
      const payload = {
        payment: { amount: '500', currency: 'msat' },
        nostr: [{ kinds: [1], limit: 10 }],
        metadata: { timestamp: Date.now(), sender: 'g.dassie.node2' },
      }

      const payloadJson = JSON.stringify(payload)
      const payloadBytes = new TextEncoder().encode(payloadJson)
      const data = new Uint8Array(4 + payloadBytes.length)
      data[0] = 0x01
      data[1] = BtpNipsMessageType.REQ
      data[2] = (payloadBytes.length >> 8) & 0xff
      data[3] = payloadBytes.length & 0xff
      data.set(payloadBytes, 4)

      const header = parseHeader(data)
      const parsed = parsePayload(data, header)

      expect(parsed).toEqual(payload)
    })

    it('should parse valid CLOSE payload', () => {
      const payload = {
        payment: { amount: '100', currency: 'msat' },
        nostr: { subId: 'sub_123' },
        metadata: { timestamp: Date.now(), sender: 'g.dassie.node3' },
      }

      const payloadJson = JSON.stringify(payload)
      const payloadBytes = new TextEncoder().encode(payloadJson)
      const data = new Uint8Array(4 + payloadBytes.length)
      data[0] = 0x01
      data[1] = BtpNipsMessageType.CLOSE
      data[2] = (payloadBytes.length >> 8) & 0xff
      data[3] = payloadBytes.length & 0xff
      data.set(payloadBytes, 4)

      const header = parseHeader(data)
      const parsed = parsePayload(data, header)

      expect(parsed).toEqual(payload)
    })

    it('should throw error for invalid JSON', () => {
      const payloadBytes = new TextEncoder().encode('{ invalid json }')
      const data = new Uint8Array(4 + payloadBytes.length)
      data[0] = 0x01
      data[1] = BtpNipsMessageType.EVENT
      data[2] = (payloadBytes.length >> 8) & 0xff
      data[3] = payloadBytes.length & 0xff
      data.set(payloadBytes, 4)

      const header = parseHeader(data)

      expect(() => parsePayload(data, header)).toThrow('Invalid JSON payload')
    })

    it('should throw error for missing payment field', () => {
      const payload = {
        nostr: { id: '0'.repeat(64) },
        metadata: { timestamp: Date.now(), sender: 'g.dassie.node1' },
      }

      const payloadJson = JSON.stringify(payload)
      const payloadBytes = new TextEncoder().encode(payloadJson)
      const data = new Uint8Array(4 + payloadBytes.length)
      data[0] = 0x01
      data[1] = BtpNipsMessageType.EVENT
      data[2] = (payloadBytes.length >> 8) & 0xff
      data[3] = payloadBytes.length & 0xff
      data.set(payloadBytes, 4)

      const header = parseHeader(data)

      expect(() => parsePayload(data, header)).toThrow('Missing or invalid "payment" field')
    })

    it('should throw error for invalid EVENT structure', () => {
      const payload = {
        payment: { amount: '1000', currency: 'msat' },
        nostr: { id: '0'.repeat(64) }, // Missing required fields
        metadata: { timestamp: Date.now(), sender: 'g.dassie.node1' },
      }

      const payloadJson = JSON.stringify(payload)
      const payloadBytes = new TextEncoder().encode(payloadJson)
      const data = new Uint8Array(4 + payloadBytes.length)
      data[0] = 0x01
      data[1] = BtpNipsMessageType.EVENT
      data[2] = (payloadBytes.length >> 8) & 0xff
      data[3] = payloadBytes.length & 0xff
      data.set(payloadBytes, 4)

      const header = parseHeader(data)

      expect(() => parsePayload(data, header)).toThrow('invalid Nostr event structure')
    })
  })

  describe('calculateEventId', () => {
    it('should calculate correct event ID', () => {
      const event: NostrEvent = {
        id: '',
        pubkey: '0'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [['tag1', 'value1']],
        content: 'test content',
        sig: '',
      }

      const id = calculateEventId(event)

      expect(id).toHaveLength(64)
      expect(id).toMatch(/^[0-9a-f]{64}$/)
    })

    it('should produce different IDs for different events', () => {
      const event1: NostrEvent = {
        id: '',
        pubkey: '0'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'test content 1',
        sig: '',
      }

      const event2: NostrEvent = {
        ...event1,
        content: 'test content 2',
      }

      const id1 = calculateEventId(event1)
      const id2 = calculateEventId(event2)

      expect(id1).not.toBe(id2)
    })
  })

  describe('verifyEventSignature', () => {
    it('should verify valid signature', () => {
      // Generate a test keypair and sign an event
      // Using a valid private key (not all zeros)
      const privateKey = hexToBytes('0'.repeat(63) + '1')
      const publicKey = schnorr.getPublicKey(privateKey)

      const event: NostrEvent = {
        id: '',
        pubkey: bytesToHex(publicKey),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'test',
        sig: '',
      }

      // Calculate ID
      const serialized = JSON.stringify([
        0,
        event.pubkey,
        event.created_at,
        event.kind,
        event.tags,
        event.content,
      ])
      const hash = sha256(new TextEncoder().encode(serialized))
      event.id = bytesToHex(hash)

      // Sign
      const signature = schnorr.sign(hash, privateKey)
      event.sig = bytesToHex(signature)

      expect(verifyEventSignature(event)).toBe(true)
    })

    it('should reject invalid signature', () => {
      const event: NostrEvent = {
        id: '0'.repeat(64),
        pubkey: '0'.repeat(64),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'test',
        sig: '0'.repeat(128),
      }

      expect(verifyEventSignature(event)).toBe(false)
    })

    it('should reject event with wrong ID', () => {
      // Generate a test keypair and sign an event
      const privateKey = hexToBytes('0'.repeat(63) + '1')
      const publicKey = schnorr.getPublicKey(privateKey)

      const event: NostrEvent = {
        id: '',
        pubkey: bytesToHex(publicKey),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'test',
        sig: '',
      }

      // Calculate ID
      const serialized = JSON.stringify([
        0,
        event.pubkey,
        event.created_at,
        event.kind,
        event.tags,
        event.content,
      ])
      const hash = sha256(new TextEncoder().encode(serialized))
      event.id = bytesToHex(hash)

      // Sign
      const signature = schnorr.sign(hash, privateKey)
      event.sig = bytesToHex(signature)

      // Tamper with ID
      event.id = '1'.repeat(64)

      expect(verifyEventSignature(event)).toBe(false)
    })
  })

  describe('deserializeBtpNipsPacket', () => {
    it('should deserialize complete packet', () => {
      const payload = {
        payment: { amount: '1000', currency: 'msat' },
        nostr: {
          id: '0'.repeat(64),
          pubkey: '0'.repeat(64),
          created_at: 1234567890,
          kind: 1,
          tags: [],
          content: 'test',
          sig: '0'.repeat(128),
        },
        metadata: { timestamp: Date.now(), sender: 'g.dassie.node1' },
      }

      const payloadJson = JSON.stringify(payload)
      const payloadBytes = new TextEncoder().encode(payloadJson)
      const data = new Uint8Array(4 + payloadBytes.length)
      data[0] = 0x01
      data[1] = BtpNipsMessageType.EVENT
      data[2] = (payloadBytes.length >> 8) & 0xff
      data[3] = payloadBytes.length & 0xff
      data.set(payloadBytes, 4)

      const packet = deserializeBtpNipsPacket(data)

      expect(packet.header.version).toBe(0x01)
      expect(packet.header.messageType).toBe(BtpNipsMessageType.EVENT)
      expect(packet.payload).toEqual(payload)
    })
  })

  describe('deserializeAndVerifyBtpNipsPacket', () => {
    it('should deserialize and verify EVENT packet with valid signature', () => {
      // Generate a test keypair
      const privateKey = hexToBytes('0'.repeat(63) + '1')
      const publicKey = schnorr.getPublicKey(privateKey)

      const event: NostrEvent = {
        id: '',
        pubkey: bytesToHex(publicKey),
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'test',
        sig: '',
      }

      // Calculate ID
      const serialized = JSON.stringify([
        0,
        event.pubkey,
        event.created_at,
        event.kind,
        event.tags,
        event.content,
      ])
      const hash = sha256(new TextEncoder().encode(serialized))
      event.id = bytesToHex(hash)

      // Sign
      const signature = schnorr.sign(hash, privateKey)
      event.sig = bytesToHex(signature)

      const payload = {
        payment: { amount: '1000', currency: 'msat' },
        nostr: event,
        metadata: { timestamp: Date.now(), sender: 'g.dassie.node1' },
      }

      const payloadJson = JSON.stringify(payload)
      const payloadBytes = new TextEncoder().encode(payloadJson)
      const data = new Uint8Array(4 + payloadBytes.length)
      data[0] = 0x01
      data[1] = BtpNipsMessageType.EVENT
      data[2] = (payloadBytes.length >> 8) & 0xff
      data[3] = payloadBytes.length & 0xff
      data.set(payloadBytes, 4)

      const packet = deserializeAndVerifyBtpNipsPacket(data)

      expect(packet.header.messageType).toBe(BtpNipsMessageType.EVENT)
      expect(packet.payload).toEqual(payload)
    })

    it('should throw error for EVENT packet with invalid signature', () => {
      const payload = {
        payment: { amount: '1000', currency: 'msat' },
        nostr: {
          id: '0'.repeat(64),
          pubkey: '0'.repeat(64),
          created_at: 1234567890,
          kind: 1,
          tags: [],
          content: 'test',
          sig: '0'.repeat(128),
        },
        metadata: { timestamp: Date.now(), sender: 'g.dassie.node1' },
      }

      const payloadJson = JSON.stringify(payload)
      const payloadBytes = new TextEncoder().encode(payloadJson)
      const data = new Uint8Array(4 + payloadBytes.length)
      data[0] = 0x01
      data[1] = BtpNipsMessageType.EVENT
      data[2] = (payloadBytes.length >> 8) & 0xff
      data[3] = payloadBytes.length & 0xff
      data.set(payloadBytes, 4)

      expect(() => deserializeAndVerifyBtpNipsPacket(data)).toThrow('Invalid Nostr event signature')
    })

    it('should not verify signature for non-EVENT packets', () => {
      const payload = {
        payment: { amount: '500', currency: 'msat' },
        nostr: [{ kinds: [1], limit: 10 }],
        metadata: { timestamp: Date.now(), sender: 'g.dassie.node2' },
      }

      const payloadJson = JSON.stringify(payload)
      const payloadBytes = new TextEncoder().encode(payloadJson)
      const data = new Uint8Array(4 + payloadBytes.length)
      data[0] = 0x01
      data[1] = BtpNipsMessageType.REQ
      data[2] = (payloadBytes.length >> 8) & 0xff
      data[3] = payloadBytes.length & 0xff
      data.set(payloadBytes, 4)

      // Should not throw even though there's no signature
      const packet = deserializeAndVerifyBtpNipsPacket(data)

      expect(packet.header.messageType).toBe(BtpNipsMessageType.REQ)
    })
  })
})
