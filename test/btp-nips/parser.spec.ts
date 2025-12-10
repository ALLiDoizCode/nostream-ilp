import {
import {
import { describe, expect, it } from 'vitest'
import { BTPNIPsPacket, NostrEvent, NostrMessageType } from '../../src/btp-nips/types'

/**
 * BTP-NIPs Parser Unit Tests
 *
 * Comprehensive test suite for BTP-NIPs packet parsing and serialization.
 * Tests cover all message types, error cases, and round-trip scenarios.
 */

  InvalidMessageTypeError,
  InvalidPayloadStructureError,
  InvalidVersionError,
  MalformedPayloadError,
  PayloadLengthMismatchError,
  TruncatedPacketError,
} from '../../src/btp-nips/errors'
  parseBTPNIPsPacket,
  parseHeader,
  parsePayload,
  serializeBTPNIPsPacket,
  serializeHeader,
  serializePayload,
} from '../../src/btp-nips/parser'
// eslint-disable-next-line sort-imports
describe('BTPNIPsParser', () => {
  describe('parseHeader', () => {
    it('should parse valid header with EVENT message type', () => {
      const buffer = Buffer.from([0x01, 0x01, 0x00, 0x64]) // version=1, type=EVENT, length=100
      const header = parseHeader(buffer)

      expect(header.version).toBe(1)
      expect(header.messageType).toBe(NostrMessageType.EVENT)
      expect(header.payloadLength).toBe(100)
    })

    it('should parse valid header with REQ message type', () => {
      const buffer = Buffer.from([0x01, 0x02, 0x01, 0xf4]) // version=1, type=REQ, length=500
      const header = parseHeader(buffer)

      expect(header.version).toBe(1)
      expect(header.messageType).toBe(NostrMessageType.REQ)
      expect(header.payloadLength).toBe(500)
    })

    it('should parse all valid message types (0x01-0x07)', () => {
      const messageTypes = [
        { type: 0x01, name: NostrMessageType.EVENT },
        { type: 0x02, name: NostrMessageType.REQ },
        { type: 0x03, name: NostrMessageType.CLOSE },
        { type: 0x04, name: NostrMessageType.NOTICE },
        { type: 0x05, name: NostrMessageType.EOSE },
        { type: 0x06, name: NostrMessageType.OK },
        { type: 0x07, name: NostrMessageType.AUTH },
      ]

      messageTypes.forEach(({ type, name }) => {
        const buffer = Buffer.from([0x01, type, 0x00, 0x64])
        const header = parseHeader(buffer)
        expect(header.messageType).toBe(name)
      })
    })

    it('should reject invalid version', () => {
      const buffer = Buffer.from([0x02, 0x01, 0x00, 0x64]) // version=2

      expect(() => parseHeader(buffer)).toThrow(InvalidVersionError)
      expect(() => parseHeader(buffer)).toThrow('Expected 1, got 2')
    })

    it('should reject invalid message type (too high)', () => {
      const buffer = Buffer.from([0x01, 0xff, 0x00, 0x64]) // type=0xFF

      expect(() => parseHeader(buffer)).toThrow(InvalidMessageTypeError)
      expect(() => parseHeader(buffer)).toThrow('0xff')
    })

    it('should reject invalid message type (zero)', () => {
      const buffer = Buffer.from([0x01, 0x00, 0x00, 0x64]) // type=0x00

      expect(() => parseHeader(buffer)).toThrow(InvalidMessageTypeError)
    })

    it('should handle truncated header (< 4 bytes)', () => {
      const buffer = Buffer.from([0x01, 0x01]) // Only 2 bytes

      expect(() => parseHeader(buffer)).toThrow(TruncatedPacketError)
      expect(() => parseHeader(buffer)).toThrow('Expected at least 4 bytes, got 2')
    })

    it('should handle empty buffer', () => {
      const buffer = Buffer.from([])

      expect(() => parseHeader(buffer)).toThrow(TruncatedPacketError)
    })

    it('should parse maximum payload length (65535)', () => {
      const buffer = Buffer.from([0x01, 0x01, 0xff, 0xff]) // length=65535
      const header = parseHeader(buffer)

      expect(header.payloadLength).toBe(65535)
    })

    it('should parse zero payload length', () => {
      const buffer = Buffer.from([0x01, 0x01, 0x00, 0x00]) // length=0
      const header = parseHeader(buffer)

      expect(header.payloadLength).toBe(0)
    })
  })

  describe('parsePayload', () => {
    const createValidPayload = () => ({
      payment: { amount: '1000', currency: 'msat', purpose: 'event_publish' },
      nostr: {
        id: 'event_id_123',
        pubkey: 'pubkey_abc',
        created_at: 1234567890,
        kind: 1,
        tags: [],
        content: 'Hello, BTP-NIPs!',
        sig: 'signature_xyz',
      },
      metadata: { timestamp: 1234567890, sender: 'g.dassie.alice' },
    })

    it('should parse valid EVENT payload', () => {
      const payloadObj = createValidPayload()
      const payloadJson = JSON.stringify(payloadObj)
      const payloadBuffer = Buffer.from(payloadJson, 'utf-8')
      const header = { version: 1, messageType: NostrMessageType.EVENT, payloadLength: payloadBuffer.length }
      const fullBuffer = Buffer.concat([Buffer.from([0x01, 0x01, 0x00, 0x00]), payloadBuffer])

      // Update header length in buffer
      fullBuffer.writeUInt16BE(payloadBuffer.length, 2)

      const payload = parsePayload(fullBuffer, header)

      expect(payload.payment.amount).toBe('1000')
      expect(payload.payment.currency).toBe('msat')
      expect(payload.nostr).toHaveProperty('id')
      expect(payload.metadata.sender).toBe('g.dassie.alice')
    })

    it('should parse valid REQ payload with filters', () => {
      const payloadObj = {
        payment: { amount: '5000', currency: 'msat', purpose: 'subscription' },
        nostr: {
          subscriptionId: 'sub-123',
          filters: [{ kinds: [1], authors: ['alice_pubkey'], since: 1234567890 }],
        },
        metadata: { timestamp: 1234567890, sender: 'g.dassie.bob', ttl: 3600 },
      }
      const payloadJson = JSON.stringify(payloadObj)
      const payloadBuffer = Buffer.from(payloadJson, 'utf-8')
      const header = { version: 1, messageType: NostrMessageType.REQ, payloadLength: payloadBuffer.length }
      const fullBuffer = Buffer.concat([Buffer.from([0x01, 0x02, 0x00, 0x00]), payloadBuffer])
      fullBuffer.writeUInt16BE(payloadBuffer.length, 2)

      const payload = parsePayload(fullBuffer, header)

      expect(payload.payment.purpose).toBe('subscription')
      expect(payload.metadata.ttl).toBe(3600)
    })

    it('should reject malformed JSON', () => {
      const payloadBuffer = Buffer.from('{ invalid json }', 'utf-8')
      const header = { version: 1, messageType: NostrMessageType.EVENT, payloadLength: payloadBuffer.length }
      const fullBuffer = Buffer.concat([Buffer.from([0x01, 0x01, 0x00, 0x00]), payloadBuffer])
      fullBuffer.writeUInt16BE(payloadBuffer.length, 2)

      expect(() => parsePayload(fullBuffer, header)).toThrow(MalformedPayloadError)
      expect(() => parsePayload(fullBuffer, header)).toThrow('Invalid JSON')
    })

    it('should reject payload with missing payment field', () => {
      const payloadObj = {
        nostr: { id: 'test' },
        metadata: { timestamp: 123, sender: 'test' },
      }
      const payloadJson = JSON.stringify(payloadObj)
      const payloadBuffer = Buffer.from(payloadJson, 'utf-8')
      const header = { version: 1, messageType: NostrMessageType.EVENT, payloadLength: payloadBuffer.length }
      const fullBuffer = Buffer.concat([Buffer.from([0x01, 0x01, 0x00, 0x00]), payloadBuffer])
      fullBuffer.writeUInt16BE(payloadBuffer.length, 2)

      expect(() => parsePayload(fullBuffer, header)).toThrow(InvalidPayloadStructureError)
      expect(() => parsePayload(fullBuffer, header)).toThrow('payment')
    })

    it('should reject payload with missing nostr field', () => {
      const payloadObj = {
        payment: { amount: '1000', currency: 'msat', purpose: 'test' },
        metadata: { timestamp: 123, sender: 'test' },
      }
      const payloadJson = JSON.stringify(payloadObj)
      const payloadBuffer = Buffer.from(payloadJson, 'utf-8')
      const header = { version: 1, messageType: NostrMessageType.EVENT, payloadLength: payloadBuffer.length }
      const fullBuffer = Buffer.concat([Buffer.from([0x01, 0x01, 0x00, 0x00]), payloadBuffer])
      fullBuffer.writeUInt16BE(payloadBuffer.length, 2)

      expect(() => parsePayload(fullBuffer, header)).toThrow(InvalidPayloadStructureError)
      expect(() => parsePayload(fullBuffer, header)).toThrow('nostr')
    })

    it('should reject payload with missing metadata field', () => {
      const payloadObj = {
        payment: { amount: '1000', currency: 'msat', purpose: 'test' },
        nostr: { id: 'test' },
      }
      const payloadJson = JSON.stringify(payloadObj)
      const payloadBuffer = Buffer.from(payloadJson, 'utf-8')
      const header = { version: 1, messageType: NostrMessageType.EVENT, payloadLength: payloadBuffer.length }
      const fullBuffer = Buffer.concat([Buffer.from([0x01, 0x01, 0x00, 0x00]), payloadBuffer])
      fullBuffer.writeUInt16BE(payloadBuffer.length, 2)

      expect(() => parsePayload(fullBuffer, header)).toThrow(InvalidPayloadStructureError)
      expect(() => parsePayload(fullBuffer, header)).toThrow('metadata')
    })

    it('should handle payload length mismatch (buffer too short)', () => {
      const payloadBuffer = Buffer.from('{"test":true}', 'utf-8')
      const header = { version: 1, messageType: NostrMessageType.EVENT, payloadLength: 1000 } // Claims 1000 bytes
      const fullBuffer = Buffer.concat([Buffer.from([0x01, 0x01, 0x03, 0xe8]), payloadBuffer]) // Only has ~13 bytes

      expect(() => parsePayload(fullBuffer, header)).toThrow(PayloadLengthMismatchError)
    })

    it('should handle payload with special UTF-8 characters', () => {
      const payloadObj = {
        payment: { amount: '1000', currency: 'msat', purpose: 'test' },
        nostr: { content: '你好世界 🌍 émojis & spëcial çhars' },
        metadata: { timestamp: 123, sender: 'test' },
      }
      const payloadJson = JSON.stringify(payloadObj)
      const payloadBuffer = Buffer.from(payloadJson, 'utf-8')
      const header = { version: 1, messageType: NostrMessageType.EVENT, payloadLength: payloadBuffer.length }
      const fullBuffer = Buffer.concat([Buffer.from([0x01, 0x01, 0x00, 0x00]), payloadBuffer])
      fullBuffer.writeUInt16BE(payloadBuffer.length, 2)

      const payload = parsePayload(fullBuffer, header)

      expect((payload.nostr as any).content).toContain('你好世界')
      expect((payload.nostr as any).content).toContain('🌍')
    })

    it('should handle large payload (>10KB)', () => {
      const largeContent = 'x'.repeat(15000) // 15KB content
      const payloadObj = {
        payment: { amount: '1000', currency: 'msat', purpose: 'test' },
        nostr: { content: largeContent },
        metadata: { timestamp: 123, sender: 'test' },
      }
      const payloadJson = JSON.stringify(payloadObj)
      const payloadBuffer = Buffer.from(payloadJson, 'utf-8')
      const header = { version: 1, messageType: NostrMessageType.EVENT, payloadLength: payloadBuffer.length }
      const fullBuffer = Buffer.concat([Buffer.from([0x01, 0x01, 0x00, 0x00]), payloadBuffer])
      fullBuffer.writeUInt16BE(payloadBuffer.length, 2)

      const payload = parsePayload(fullBuffer, header)

      expect((payload.nostr as any).content).toHaveLength(15000)
    })
  })

  describe('parseBTPNIPsPacket', () => {
    const createValidPacketBuffer = (): Buffer => {
      const payload = {
        payment: { amount: '1000', currency: 'msat', purpose: 'event_publish' },
        nostr: {
          id: 'event_id',
          pubkey: 'pubkey',
          created_at: 123,
          kind: 1,
          tags: [],
          content: 'test',
          sig: 'sig',
        },
        metadata: { timestamp: 123, sender: 'g.dassie.alice' },
      }
      const payloadBuffer = Buffer.from(JSON.stringify(payload), 'utf-8')
      const header = Buffer.allocUnsafe(4)
      header.writeUInt8(1, 0) // version
      header.writeUInt8(NostrMessageType.EVENT, 1) // messageType
      header.writeUInt16BE(payloadBuffer.length, 2) // payloadLength

      return Buffer.concat([header, payloadBuffer])
    }

    it('should parse complete valid packet', () => {
      const buffer = createValidPacketBuffer()
      const packet = parseBTPNIPsPacket(buffer)

      expect(packet.header.version).toBe(1)
      expect(packet.header.messageType).toBe(NostrMessageType.EVENT)
      expect(packet.payload.payment.amount).toBe('1000')
      expect(packet.payload.metadata.sender).toBe('g.dassie.alice')
    })

    it('should handle all message types in complete packets', () => {
      const messageTypes = [
        NostrMessageType.EVENT,
        NostrMessageType.REQ,
        NostrMessageType.CLOSE,
        NostrMessageType.NOTICE,
        NostrMessageType.EOSE,
        NostrMessageType.OK,
        NostrMessageType.AUTH,
      ]

      messageTypes.forEach((type) => {
        const buffer = createValidPacketBuffer()
        buffer.writeUInt8(type, 1) // Update message type

        const packet = parseBTPNIPsPacket(buffer)
        expect(packet.header.messageType).toBe(type)
      })
    })
  })

  describe('serializeHeader', () => {
    it('should serialize valid header', () => {
      const header = { version: 1, messageType: NostrMessageType.EVENT, payloadLength: 100 }
      const buffer = serializeHeader(header)

      expect(buffer).toHaveLength(4)
      expect(buffer.readUInt8(0)).toBe(1)
      expect(buffer.readUInt8(1)).toBe(NostrMessageType.EVENT)
      expect(buffer.readUInt16BE(2)).toBe(100)
    })

    it('should serialize EVENT message type', () => {
      const header = { version: 1, messageType: NostrMessageType.EVENT, payloadLength: 200 }
      const buffer = serializeHeader(header)

      expect(buffer.readUInt8(1)).toBe(0x01)
    })

    it('should serialize REQ message type', () => {
      const header = { version: 1, messageType: NostrMessageType.REQ, payloadLength: 200 }
      const buffer = serializeHeader(header)

      expect(buffer.readUInt8(1)).toBe(0x02)
    })

    it('should verify big-endian byte order for payload length', () => {
      const header = { version: 1, messageType: NostrMessageType.EVENT, payloadLength: 0x1234 }
      const buffer = serializeHeader(header)

      expect(buffer.readUInt8(2)).toBe(0x12) // High byte
      expect(buffer.readUInt8(3)).toBe(0x34) // Low byte
    })

    it('should handle maximum payload length', () => {
      const header = { version: 1, messageType: NostrMessageType.EVENT, payloadLength: 65535 }
      const buffer = serializeHeader(header)

      expect(buffer.readUInt16BE(2)).toBe(65535)
    })
  })

  describe('serializePayload', () => {
    it('should serialize valid payload to UTF-8 JSON', () => {
      const payload = {
        payment: { amount: '1000', currency: 'msat', purpose: 'test' },
        nostr: { id: 'test' },
        metadata: { timestamp: 123, sender: 'alice' },
      }
      const buffer = serializePayload(payload as any)

      const jsonString = buffer.toString('utf-8')
      const parsed = JSON.parse(jsonString)

      expect(parsed.payment.amount).toBe('1000')
      expect(parsed.metadata.sender).toBe('alice')
    })

    it('should handle special UTF-8 characters', () => {
      const payload = {
        payment: { amount: '1000', currency: 'msat', purpose: 'test' },
        nostr: { content: '你好 🌍' },
        metadata: { timestamp: 123, sender: 'alice' },
      }
      const buffer = serializePayload(payload as any)

      const parsed = JSON.parse(buffer.toString('utf-8'))
      expect((parsed.nostr as any).content).toBe('你好 🌍')
    })

    it('should handle large payload (>10KB)', () => {
      const largeContent = 'x'.repeat(15000)
      const payload = {
        payment: { amount: '1000', currency: 'msat', purpose: 'test' },
        nostr: { content: largeContent },
        metadata: { timestamp: 123, sender: 'alice' },
      }
      const buffer = serializePayload(payload as any)

      expect(buffer.length).toBeGreaterThan(10000)
    })
  })

  describe('serializeBTPNIPsPacket', () => {
    it('should serialize complete packet', () => {
      const packet: BTPNIPsPacket = {
        header: { version: 1, messageType: NostrMessageType.EVENT, payloadLength: 0 },
        payload: {
          payment: { amount: '1000', currency: 'msat', purpose: 'test' },
          nostr: { id: 'test' } as NostrEvent,
          metadata: { timestamp: 123, sender: 'alice' },
        },
      }
      const buffer = serializeBTPNIPsPacket(packet)

      expect(buffer.length).toBeGreaterThan(4) // Header + payload
      expect(buffer.readUInt8(0)).toBe(1) // Version
      expect(buffer.readUInt8(1)).toBe(NostrMessageType.EVENT) // Message type
    })

    it('should automatically calculate payload length', () => {
      const packet: BTPNIPsPacket = {
        header: { version: 1, messageType: NostrMessageType.EVENT, payloadLength: 999 }, // Wrong length
        payload: {
          payment: { amount: '1000', currency: 'msat', purpose: 'test' },
          nostr: { id: 'test' } as NostrEvent,
          metadata: { timestamp: 123, sender: 'alice' },
        },
      }
      const buffer = serializeBTPNIPsPacket(packet)

      const actualPayloadLength = buffer.length - 4
      const headerPayloadLength = buffer.readUInt16BE(2)

      expect(headerPayloadLength).toBe(actualPayloadLength)
      expect(headerPayloadLength).not.toBe(999)
    })
  })

  describe('round-trip tests', () => {
    it('should maintain data integrity for EVENT packet (serialize → parse)', () => {
      const originalPacket: BTPNIPsPacket = {
        header: { version: 1, messageType: NostrMessageType.EVENT, payloadLength: 0 },
        payload: {
          payment: { amount: '1000', currency: 'msat', purpose: 'event_publish' },
          nostr: {
            id: 'event_id_123',
            pubkey: 'pubkey_abc',
            created_at: 1234567890,
            kind: 1,
            tags: [['e', 'reply_id'], ['p', 'mention_pubkey']],
            content: 'Hello, BTP-NIPs!',
            sig: 'signature_xyz',
          } as NostrEvent,
          metadata: { timestamp: 1234567890, sender: 'g.dassie.alice' },
        },
      }

      const serialized = serializeBTPNIPsPacket(originalPacket)
      const parsed = parseBTPNIPsPacket(serialized)

      expect(parsed.header.version).toBe(originalPacket.header.version)
      expect(parsed.header.messageType).toBe(originalPacket.header.messageType)
      expect(parsed.payload.payment).toEqual(originalPacket.payload.payment)
      expect(parsed.payload.nostr).toEqual(originalPacket.payload.nostr)
      expect(parsed.payload.metadata).toEqual(originalPacket.payload.metadata)
    })

    it('should maintain data integrity for REQ packet (serialize → parse)', () => {
      const originalPacket: BTPNIPsPacket = {
        header: { version: 1, messageType: NostrMessageType.REQ, payloadLength: 0 },
        payload: {
          payment: { amount: '5000', currency: 'msat', purpose: 'subscription' },
          nostr: {
            subscriptionId: 'sub-123',
            filters: [{ kinds: [1], authors: ['alice'], since: 1234567890 }],
          },
          metadata: { timestamp: 1234567890, sender: 'g.dassie.bob', ttl: 3600 },
        },
      }

      const serialized = serializeBTPNIPsPacket(originalPacket)
      const parsed = parseBTPNIPsPacket(serialized)

      expect(parsed.payload).toEqual(originalPacket.payload)
    })

    it('should maintain data integrity for CLOSE packet (serialize → parse)', () => {
      const originalPacket: BTPNIPsPacket = {
        header: { version: 1, messageType: NostrMessageType.CLOSE, payloadLength: 0 },
        payload: {
          payment: { amount: '0', currency: 'msat', purpose: 'close_subscription' },
          nostr: { subscriptionId: 'sub-123' },
          metadata: { timestamp: 1234567890, sender: 'g.dassie.bob' },
        },
      }

      const serialized = serializeBTPNIPsPacket(originalPacket)
      const parsed = parseBTPNIPsPacket(serialized)

      expect(parsed.payload).toEqual(originalPacket.payload)
    })

    it('should handle special UTF-8 characters in round-trip', () => {
      const originalPacket: BTPNIPsPacket = {
        header: { version: 1, messageType: NostrMessageType.EVENT, payloadLength: 0 },
        payload: {
          payment: { amount: '1000', currency: 'msat', purpose: 'test' },
          nostr: {
            id: 'test',
            pubkey: 'test',
            created_at: 123,
            kind: 1,
            tags: [],
            content: '你好世界 🌍 émojis & spëcial çhars',
            sig: 'test',
          } as NostrEvent,
          metadata: { timestamp: 123, sender: 'g.dassie.alice' },
        },
      }

      const serialized = serializeBTPNIPsPacket(originalPacket)
      const parsed = parseBTPNIPsPacket(serialized)

      expect((parsed.payload.nostr as NostrEvent).content).toBe(
        (originalPacket.payload.nostr as NostrEvent).content,
      )
    })

    it('should handle maximum size payload in round-trip (64KB)', () => {
      const largeContent = 'x'.repeat(60000) // ~60KB content
      const originalPacket: BTPNIPsPacket = {
        header: { version: 1, messageType: NostrMessageType.EVENT, payloadLength: 0 },
        payload: {
          payment: { amount: '1000', currency: 'msat', purpose: 'test' },
          nostr: {
            id: 'test',
            pubkey: 'test',
            created_at: 123,
            kind: 1,
            tags: [],
            content: largeContent,
            sig: 'test',
          } as NostrEvent,
          metadata: { timestamp: 123, sender: 'g.dassie.alice' },
        },
      }

      const serialized = serializeBTPNIPsPacket(originalPacket)
      const parsed = parseBTPNIPsPacket(serialized)

      expect((parsed.payload.nostr as NostrEvent).content).toHaveLength(60000)
      expect(parsed.payload).toEqual(originalPacket.payload)
    })

    it('should ensure serialize(parse(buffer)) === buffer symmetry', () => {
      const originalPacket: BTPNIPsPacket = {
        header: { version: 1, messageType: NostrMessageType.EVENT, payloadLength: 0 },
        payload: {
          payment: { amount: '1000', currency: 'msat', purpose: 'test' },
          nostr: { id: 'test', pubkey: 'test', created_at: 123, kind: 1, tags: [], content: 'test', sig: 'test' } as NostrEvent,
          metadata: { timestamp: 123, sender: 'alice' },
        },
      }

      const buffer1 = serializeBTPNIPsPacket(originalPacket)
      const parsed = parseBTPNIPsPacket(buffer1)
      const buffer2 = serializeBTPNIPsPacket(parsed)

      expect(buffer2.equals(buffer1)).toBe(true)
    })
  })
})
