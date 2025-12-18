/**
 * BTP-NIPs packet parser
 * Deserializes BTP-NIPs packets and verifies Nostr event signatures
 */

import { schnorr } from '@noble/curves/secp256k1'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'

import {
  BtpNipsMessageType,
  type BtpNipsClosePayload,
  type BtpNipsEventPayload,
  type BtpNipsHeader,
  type BtpNipsPacket,
  type BtpNipsPayload,
  type BtpNipsReqPayload,
  type NostrEvent,
} from './types.js'

/**
 * Parse BTP-NIPs packet header (4 bytes)
 *
 * @param data Packet data
 * @returns Parsed header
 * @throws Error if header is invalid
 */
export function parseHeader(data: Uint8Array): BtpNipsHeader {
  if (data.length < 4) {
    throw new Error('Packet too short: minimum 4 bytes required for header')
  }

  const version = data[0]!
  const messageType = data[1]!
  const payloadLength = (data[2]! << 8) | data[3]!

  if (version !== 0x01) {
    throw new Error(`Invalid protocol version: expected 0x01, got 0x${version.toString(16).padStart(2, '0')}`)
  }

  if (messageType < 0x01 || messageType > 0x07) {
    throw new Error(`Invalid message type: 0x${messageType.toString(16).padStart(2, '0')} (must be 0x01-0x07)`)
  }

  if (data.length !== 4 + payloadLength) {
    throw new Error(
      `Payload length mismatch: header claims ${payloadLength} bytes, but ${data.length - 4} bytes available`,
    )
  }

  return {
    version,
    messageType,
    payloadLength,
  }
}

/**
 * Parse BTP-NIPs payload (JSON)
 *
 * @param data Packet data (full packet including header)
 * @param header Parsed header
 * @returns Parsed payload
 * @throws Error if payload is invalid JSON or missing required fields
 */
export function parsePayload(
  data: Uint8Array,
  header: BtpNipsHeader,
): BtpNipsPayload {
  const payloadBytes = data.slice(4, 4 + header.payloadLength)
  const payloadText = new TextDecoder().decode(payloadBytes)

  let json: unknown
  try {
    json = JSON.parse(payloadText)
  } catch (error) {
    throw new Error(
      `Invalid JSON payload: ${error instanceof Error ? error.message : 'unknown error'}`,
    )
  }

  if (typeof json !== 'object' || json === null) {
    throw new Error('Payload must be a JSON object')
  }

  const payload = json as Record<string, unknown>

  // Validate required fields
  if (!payload.payment || typeof payload.payment !== 'object') {
    throw new Error('Missing or invalid "payment" field')
  }

  if (!payload.nostr) {
    throw new Error('Missing "nostr" field')
  }

  if (!payload.metadata || typeof payload.metadata !== 'object') {
    throw new Error('Missing or invalid "metadata" field')
  }

  // Validate payment structure
  const payment = payload.payment as Record<string, unknown>
  if (typeof payment.amount !== 'string') {
    throw new Error('payment.amount must be a string')
  }
  if (typeof payment.currency !== 'string') {
    throw new Error('payment.currency must be a string')
  }

  // Validate metadata structure
  const metadata = payload.metadata as Record<string, unknown>
  if (typeof metadata.timestamp !== 'number') {
    throw new Error('metadata.timestamp must be a number')
  }
  if (typeof metadata.sender !== 'string') {
    throw new Error('metadata.sender must be a string')
  }

  // Type-specific validation
  switch (header.messageType) {
    case BtpNipsMessageType.EVENT: {
      if (typeof payload.nostr !== 'object' || payload.nostr === null) {
        throw new Error('EVENT packet: nostr field must be an object')
      }
      const event = payload.nostr as Record<string, unknown>
      if (
        typeof event.id !== 'string' ||
        typeof event.pubkey !== 'string' ||
        typeof event.created_at !== 'number' ||
        typeof event.kind !== 'number' ||
        !Array.isArray(event.tags) ||
        typeof event.content !== 'string' ||
        typeof event.sig !== 'string'
      ) {
        throw new Error('EVENT packet: invalid Nostr event structure')
      }
      return payload as BtpNipsEventPayload
    }

    case BtpNipsMessageType.REQ: {
      if (!Array.isArray(payload.nostr)) {
        throw new Error('REQ packet: nostr field must be an array of filters')
      }
      return payload as BtpNipsReqPayload
    }

    case BtpNipsMessageType.CLOSE: {
      if (
        typeof payload.nostr !== 'object' ||
        payload.nostr === null ||
        typeof (payload.nostr as Record<string, unknown>).subId !== 'string'
      ) {
        throw new Error('CLOSE packet: nostr field must have subId string')
      }
      return payload as BtpNipsClosePayload
    }

    default:
      // For other message types, return as-is
      return payload as BtpNipsPayload
  }
}

/**
 * Serialize Nostr event for ID calculation (NIP-01)
 *
 * @param event Nostr event
 * @returns Serialized event string
 */
function serializeEventForId(event: NostrEvent): string {
  return JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ])
}

/**
 * Calculate Nostr event ID
 *
 * @param event Nostr event
 * @returns Event ID (hex string)
 */
export function calculateEventId(event: NostrEvent): string {
  const serialized = serializeEventForId(event)
  const hash = sha256(new TextEncoder().encode(serialized))
  return bytesToHex(hash)
}

/**
 * Verify Nostr event signature (schnorr on secp256k1)
 *
 * @param event Nostr event
 * @returns true if signature is valid, false otherwise
 */
export function verifyEventSignature(event: NostrEvent): boolean {
  try {
    // Calculate expected event ID
    const expectedId = calculateEventId(event)

    // Verify ID matches
    if (event.id !== expectedId) {
      return false
    }

    // Verify schnorr signature
    const signature = hexToBytes(event.sig)
    const publicKey = hexToBytes(event.pubkey)
    const messageHash = hexToBytes(event.id)

    return schnorr.verify(signature, messageHash, publicKey)
  } catch {
    return false
  }
}

/**
 * Convert message type byte to string type
 */
function messageTypeToString(messageType: BtpNipsMessageType): BtpNipsPacket['type'] {
  switch (messageType) {
    case BtpNipsMessageType.EVENT:
      return 'EVENT'
    case BtpNipsMessageType.REQ:
      return 'REQ'
    case BtpNipsMessageType.CLOSE:
      return 'CLOSE'
    case BtpNipsMessageType.NOTICE:
      return 'NOTICE'
    case BtpNipsMessageType.EOSE:
      return 'EOSE'
    case BtpNipsMessageType.OK:
      return 'OK'
    case BtpNipsMessageType.AUTH:
      return 'AUTH'
    default:
      throw new Error(`Unknown message type: 0x${messageType.toString(16)}`)
  }
}

/**
 * Deserialize BTP-NIPs packet
 *
 * @param data Packet data (full packet including header)
 * @returns Parsed packet
 * @throws Error if packet is invalid
 */
export function deserializeBtpNipsPacket(data: Uint8Array): BtpNipsPacket {
  const header = parseHeader(data)
  const payload = parsePayload(data, header)
  const type = messageTypeToString(header.messageType)

  return {
    type,
    header,
    payload,
  }
}

/**
 * Deserialize and verify BTP-NIPs packet
 * For EVENT packets, also verifies Nostr event signature
 *
 * @param data Packet data
 * @returns Parsed packet
 * @throws Error if packet is invalid or signature verification fails
 */
export function deserializeAndVerifyBtpNipsPacket(
  data: Uint8Array,
): BtpNipsPacket {
  const packet = deserializeBtpNipsPacket(data)

  // For EVENT packets, verify signature
  if (packet.header.messageType === BtpNipsMessageType.EVENT) {
    const eventPayload = packet.payload as BtpNipsEventPayload
    if (!verifyEventSignature(eventPayload.nostr)) {
      throw new Error('Invalid Nostr event signature')
    }
  }

  return packet
}
