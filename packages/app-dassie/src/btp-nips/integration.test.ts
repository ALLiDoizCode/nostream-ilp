/**
 * Integration tests for BTP-NIPs packet processing
 * Tests end-to-end flow: detection → parsing → handler routing → fulfillment/rejection
 * Focuses on component integration without heavy database mocking
 */

import { describe, it, expect } from 'vitest'
import { isBtpNipsPacket, extractBtpNipsPacket } from './detector.js'
import { deserializeBtpNipsPacket } from './parser.js'
import { HandlerRegistry } from './handler-registry.js'
import { createFulfillment, createRejection } from './fulfillment.js'
import { BtpNipsErrorHandler, BtpNipsErrorType } from './error-handler.js'
import { createTestEvent } from './test-utils.js'
import type { IlpContext, BtpNipsHandler } from './handler-registry.js'
import type { BtpNipsPacket, BtpNipsResponse } from './types.js'

/**
 * Create test ILP packet containing BTP-NIPs data
 */
function createTestIlpPacket(btpNipsData: Uint8Array) {
  // Simulate ILP packet data field containing BTP-NIPs packet
  return {
    data: Buffer.from(btpNipsData),
    condition: Buffer.alloc(32),
    sender: 'g.dassie.peer1',
    amount: '1000',
  }
}

/**
 * Serialize BTP-NIPs packet (4-byte header + JSON payload)
 */
function serializeBtpNipsPacket(payload: unknown, messageType: number): Uint8Array {
  const payloadJson = JSON.stringify(payload)
  const payloadBytes = new TextEncoder().encode(payloadJson)
  const header = new Uint8Array(4)

  header[0] = 0x01 // version
  header[1] = messageType // messageType
  header[2] = (payloadBytes.length >> 8) & 0xff // payloadLength high byte
  header[3] = payloadBytes.length & 0xff // payloadLength low byte

  const packet = new Uint8Array(4 + payloadBytes.length)
  packet.set(header)
  packet.set(payloadBytes, 4)

  return packet
}

/**
 * Mock handler for testing
 */
class MockEventHandler implements BtpNipsHandler {
  type = 'EVENT' as const
  handledPackets: BtpNipsPacket[] = []

  async handle(packet: BtpNipsPacket, _ilpContext: IlpContext): Promise<BtpNipsResponse> {
    this.handledPackets.push(packet)
    const event = packet.payload.nostr as {id: string}
    return {
      type: 'OK',
      eventId: event.id,
      accepted: true,
      message: '',
    }
  }
}

describe('integration - BTP-NIPs packet flow', () => {

  describe('Packet detection and parsing', () => {
    it('should detect and extract BTP-NIPs packet from ILP data', () => {
      const event = createTestEvent({ kind: 1, content: 'Hello World' })
      const payload = {
        payment: { amount: '1000', currency: 'msat' },
        nostr: event,
        metadata: { timestamp: Date.now(), sender: 'g.dassie.peer1' },
      }
      const btpNipsData = serializeBtpNipsPacket(payload, 0x01)
      const ilpPacket = createTestIlpPacket(btpNipsData)

      // 1. Detect BTP-NIPs packet
      expect(isBtpNipsPacket(ilpPacket.data)).toBe(true)

      // 2. Extract BTP-NIPs data
      const extracted = extractBtpNipsPacket(ilpPacket.data)
      expect(extracted).toBeInstanceOf(Uint8Array)
      expect(extracted.length).toBe(btpNipsData.length)
    })

    it('should deserialize BTP-NIPs packet', () => {
      const event = createTestEvent({ kind: 1, content: 'Test event' })
      const payload = {
        payment: { amount: '1000', currency: 'msat' },
        nostr: event,
        metadata: { timestamp: Date.now(), sender: 'g.dassie.peer1' },
      }
      const btpNipsData = serializeBtpNipsPacket(payload, 0x01)

      const packet = deserializeBtpNipsPacket(btpNipsData)

      expect(packet.type).toBe('EVENT')
      expect(packet.header.version).toBe(1)
      expect(packet.header.messageType).toBe(0x01)
      expect(packet.payload.payment.amount).toBe('1000')
    })
  })

  describe('End-to-end packet flow with handlers', () => {
    it('should route EVENT packet through full pipeline', async () => {
      const event = createTestEvent({ kind: 1, content: 'Full pipeline test' })
      const payload = {
        payment: { amount: '1000', currency: 'msat' },
        nostr: event,
        metadata: { timestamp: Date.now(), sender: 'g.dassie.peer1' },
      }

      // 1. Serialize packet
      const btpNipsData = serializeBtpNipsPacket(payload, 0x01)

      // 2. Create ILP context
      const ilpContext: IlpContext = {
        sender: 'g.dassie.peer1',
        amount: '1000',
        condition: Buffer.alloc(32),
      }

      // 3. Deserialize
      const packet = deserializeBtpNipsPacket(btpNipsData)

      // 4. Route to handler
      const handlerRegistry = new HandlerRegistry()
      const mockHandler = new MockEventHandler()
      handlerRegistry.register(mockHandler)

      const response = await handlerRegistry.route(packet, ilpContext)

      // 5. Create fulfillment
      const fulfillment = createFulfillment(response, ilpContext.condition)

      // Verify pipeline
      expect(mockHandler.handledPackets.length).toBe(1)
      expect(response.type).toBe('OK')
      expect(response.eventId).toBe(event.id)
      expect(fulfillment.fulfillment.length).toBe(32)
      expect(fulfillment.data.toString('utf-8')).toContain('OK')
    })
  })

  describe('Error handling and rejection', () => {
    it('should handle malformed packet gracefully', () => {
      const malformedData = new Uint8Array([0x01, 0x01, 0x00, 0x05, 0xff, 0xff]) // Invalid payload length

      expect(() => {
        deserializeBtpNipsPacket(malformedData)
      }).toThrow() // Will throw "Payload length mismatch" or "Invalid JSON"
    })

    it('should create ILP rejection for errors', () => {
      const error = new Error('Invalid packet format')
      const rejection = createRejection(error, 'INVALID_PACKET')

      expect(rejection.code).toBe('F01')
      expect(rejection.message).toBe('Invalid packet format')
      expect(rejection.data.toString('utf-8')).toContain('NOTICE')
    })

    it('should track and rate limit errors per peer', () => {
      const errorHandler = new BtpNipsErrorHandler()
      const peer = 'g.dassie.peer1'

      // Generate errors up to limit (100)
      for (let i = 0; i < 100; i++) {
        const allowed = errorHandler.handle(new Error('Test error'), {
          errorType: BtpNipsErrorType.INVALID_PACKET,
          peerAddress: peer,
        })
        expect(allowed).toBe(true)
      }

      // Next error should be rate limited
      const rateLimited = errorHandler.handle(new Error('Test error'), {
        errorType: BtpNipsErrorType.INVALID_PACKET,
        peerAddress: peer,
      })
      expect(rateLimited).toBe(false)

      // Verify rate limit metric
      const rateLimitCount = errorHandler.getErrorCount(BtpNipsErrorType.RATE_LIMITED, peer)
      expect(rateLimitCount).toBeGreaterThan(0)
    })
  })

  describe('Performance benchmarks (AC 2)', () => {
    it('should route packets with latency < 100ms', async () => {
      const handlerRegistry = new HandlerRegistry()
      const mockHandler = new MockEventHandler()
      handlerRegistry.register(mockHandler)

      const event = createTestEvent({ kind: 1, content: 'Performance test' })
      const payload = {
        payment: { amount: '1000', currency: 'msat' },
        nostr: event,
        metadata: { timestamp: Date.now(), sender: 'g.dassie.peer1' },
      }
      const btpNipsData = serializeBtpNipsPacket(payload, 0x01)
      const packet = deserializeBtpNipsPacket(btpNipsData)
      const ilpContext: IlpContext = {
        sender: 'g.dassie.peer1',
        amount: '1000',
        condition: Buffer.alloc(32),
      }

      const startTime = Date.now()
      await handlerRegistry.route(packet, ilpContext)
      const endTime = Date.now()

      const latency = endTime - startTime
      expect(latency).toBeLessThan(100) // AC 2 requirement: <100ms
    })

    it('should measure packet throughput', async () => {
      const handlerRegistry = new HandlerRegistry()
      const mockHandler = new MockEventHandler()
      handlerRegistry.register(mockHandler)

      const packetCount = 100
      const events = Array.from({ length: packetCount }, (_, i) =>
        createTestEvent({ kind: 1, content: `Event ${i}` })
      )

      const ilpContext: IlpContext = {
        sender: 'g.dassie.peer1',
        amount: '1000',
        condition: Buffer.alloc(32),
      }

      const startTime = Date.now()

      for (const event of events) {
        const payload = {
          payment: { amount: '1000', currency: 'msat' },
          nostr: event,
          metadata: { timestamp: Date.now(), sender: 'g.dassie.peer1' },
        }
        const btpNipsData = serializeBtpNipsPacket(payload, 0x01)
        const packet = deserializeBtpNipsPacket(btpNipsData)
        await handlerRegistry.route(packet, ilpContext)
      }

      const endTime = Date.now()
      const duration = (endTime - startTime) / 1000 // seconds
      const throughput = packetCount / duration

      // Log throughput for monitoring
      console.log(`Throughput: ${throughput.toFixed(2)} packets/second`)
      expect(throughput).toBeGreaterThan(0)
      expect(mockHandler.handledPackets.length).toBe(packetCount)
    })
  })
})
