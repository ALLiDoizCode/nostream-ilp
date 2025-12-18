import { describe, expect, it } from 'vitest'

import {
  BTP_NIPS_VERSION,
  extractBtpNipsPacket,
  getBtpNipsMessageType,
  isBtpNipsPacket,
} from './detector.js'

describe('BTP-NIPs Detector', () => {
  describe('isBtpNipsPacket', () => {
    it('should return true for valid BTP-NIPs packet', () => {
      // BTP-NIPs packet: version=0x01, type=0x01 (EVENT), length=5, payload="hello"
      const packet = new Uint8Array([
        0x01, // version
        0x01, // message type (EVENT)
        0x00, 0x05, // payload length (5 bytes)
        0x68, 0x65, 0x6c, 0x6c, 0x6f, // "hello"
      ])

      expect(isBtpNipsPacket(packet)).toBe(true)
    })

    it('should return false for packet with wrong version', () => {
      const packet = new Uint8Array([
        0x02, // wrong version
        0x01, // message type
        0x00, 0x05, // payload length
        0x68, 0x65, 0x6c, 0x6c, 0x6f,
      ])

      expect(isBtpNipsPacket(packet)).toBe(false)
    })

    it('should return false for packet with invalid message type (too low)', () => {
      const packet = new Uint8Array([
        0x01, // version
        0x00, // invalid message type (must be 0x01-0x07)
        0x00, 0x05, // payload length
        0x68, 0x65, 0x6c, 0x6c, 0x6f,
      ])

      expect(isBtpNipsPacket(packet)).toBe(false)
    })

    it('should return false for packet with invalid message type (too high)', () => {
      const packet = new Uint8Array([
        0x01, // version
        0x08, // invalid message type (must be 0x01-0x07)
        0x00, 0x05, // payload length
        0x68, 0x65, 0x6c, 0x6c, 0x6f,
      ])

      expect(isBtpNipsPacket(packet)).toBe(false)
    })

    it('should return false for packet too short (less than 4 bytes)', () => {
      const packet = new Uint8Array([0x01, 0x01, 0x00])

      expect(isBtpNipsPacket(packet)).toBe(false)
    })

    it('should return false for packet with mismatched length', () => {
      const packet = new Uint8Array([
        0x01, // version
        0x01, // message type
        0x00, 0x10, // payload length claims 16 bytes
        0x68, 0x65, 0x6c, 0x6c, 0x6f, // but only 5 bytes present
      ])

      expect(isBtpNipsPacket(packet)).toBe(false)
    })

    it('should return true for all valid message types (0x01-0x07)', () => {
      for (let messageType = 0x01; messageType <= 0x07; messageType++) {
        const packet = new Uint8Array([
          0x01, // version
          messageType, // message type
          0x00, 0x05, // payload length
          0x68, 0x65, 0x6c, 0x6c, 0x6f,
        ])

        expect(isBtpNipsPacket(packet)).toBe(true)
      }
    })

    it('should return true for packet with large payload', () => {
      const payloadSize = 1000
      const packet = new Uint8Array(4 + payloadSize)
      packet[0] = 0x01 // version
      packet[1] = 0x01 // message type
      packet[2] = (payloadSize >> 8) & 0xff // payload length high byte
      packet[3] = payloadSize & 0xff // payload length low byte
      // Fill payload with dummy data
      for (let i = 4; i < packet.length; i++) {
        packet[i] = 0x61 // 'a'
      }

      expect(isBtpNipsPacket(packet)).toBe(true)
    })

    it('should return true for packet with empty payload', () => {
      const packet = new Uint8Array([
        0x01, // version
        0x01, // message type
        0x00, 0x00, // payload length (0 bytes)
      ])

      expect(isBtpNipsPacket(packet)).toBe(true)
    })
  })

  describe('extractBtpNipsPacket', () => {
    it('should extract valid BTP-NIPs packet', () => {
      const packet = new Uint8Array([
        0x01, 0x01, 0x00, 0x05, 0x68, 0x65, 0x6c, 0x6c, 0x6f,
      ])

      const extracted = extractBtpNipsPacket(packet)

      expect(extracted).toEqual(packet)
    })

    it('should throw error for invalid packet', () => {
      const invalidPacket = new Uint8Array([0x02, 0x01, 0x00, 0x05])

      expect(() => extractBtpNipsPacket(invalidPacket)).toThrow(
        'Not a valid BTP-NIPs packet',
      )
    })
  })

  describe('getBtpNipsMessageType', () => {
    it('should return correct message type', () => {
      const packet = new Uint8Array([
        0x01, 0x03, // version=0x01, type=0x03
        0x00, 0x00,
      ])

      expect(getBtpNipsMessageType(packet)).toBe(0x03)
    })

    it('should throw error for packet too short', () => {
      const packet = new Uint8Array([0x01])

      expect(() => getBtpNipsMessageType(packet)).toThrow(
        'Invalid BTP-NIPs packet: too short',
      )
    })

    it('should return all valid message types', () => {
      for (let messageType = 0x01; messageType <= 0x07; messageType++) {
        const packet = new Uint8Array([0x01, messageType, 0x00, 0x00])

        expect(getBtpNipsMessageType(packet)).toBe(messageType)
      }
    })
  })

  describe('BTP_NIPS_VERSION', () => {
    it('should be 0x01', () => {
      expect(BTP_NIPS_VERSION).toBe(0x01)
    })
  })
})
