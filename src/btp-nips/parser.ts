import {
import {
import {

/**
 * BTP-NIPs Packet Parser
 *
 * Parser and serializer for BTP-NIPs (Bitcoin Transfer Protocol for Nostr Implementation Possibilities).
 * Embeds Nostr protocol messages in ILP STREAM packet data fields.
 *
 * Protocol Structure:
 * - 4-byte header: [version][messageType][payloadLength (big-endian uint16)]
 * - Variable-length JSON payload: { payment, nostr, metadata }
 *
 * @module btp-nips/parser
 * @version 1.0.0
 */

  BTPNIPsHeader,
  BTPNIPsPacket,
  BTPNIPsPayload,
  NostrMessageType,
} from './types'
  MalformedPayloadError,
  TruncatedPacketError,
} from './errors'
  validateMessageType,
  validatePayloadLength,
  validatePayloadStructure,
  validateVersion,
} from './validation'

/**
 * Parses the 4-byte BTP-NIPs header from a buffer
 *
 * Header structure:
 * - Byte 0: Protocol version (1)
 * - Byte 1: Message type (0x01-0x07)
 * - Bytes 2-3: Payload length in bytes (uint16 big-endian, max 65,535)
 *
 * @param buffer - Buffer containing at least 4 bytes
 * @returns Parsed header object
 * @throws {TruncatedPacketError} If buffer is shorter than 4 bytes
 * @throws {InvalidVersionError} If version is not 1
 * @throws {InvalidMessageTypeError} If message type is invalid
 *
 * @example
 * ```typescript
 * const buffer = Buffer.from([0x01, 0x01, 0x00, 0x64, ...]);
 * const header = parseHeader(buffer);
 * // { version: 1, messageType: 1, payloadLength: 100 }
 * ```
 */
export function parseHeader(buffer: Buffer): BTPNIPsHeader {
  // Validate minimum buffer length
  if (buffer.length < 4) {
    throw new TruncatedPacketError(4, buffer.length, buffer.toString('hex'))
  }

  // Read header bytes
  const version = buffer.readUInt8(0)
  const messageType = buffer.readUInt8(1)
  const payloadLength = buffer.readUInt16BE(2)

  // Validate header values
  validateVersion(version)
  validateMessageType(messageType)

  return {
    version,
    messageType: messageType as NostrMessageType,
    payloadLength,
  }
}

/**
 * Parses the JSON payload from a BTP-NIPs packet
 *
 * Payload structure:
 * - payment: { amount, currency, purpose }
 * - nostr: Nostr protocol message (structure varies by message type)
 * - metadata: { timestamp, sender, ttl? }
 *
 * @param buffer - Full packet buffer (header + payload)
 * @param header - Parsed header (contains payload length)
 * @returns Parsed payload object
 * @throws {PayloadLengthMismatchError} If payload length doesn't match header
 * @throws {MalformedPayloadError} If JSON is invalid
 * @throws {InvalidPayloadStructureError} If required fields are missing
 *
 * @example
 * ```typescript
 * const header = parseHeader(buffer);
 * const payload = parsePayload(buffer, header);
 * // { payment: {...}, nostr: {...}, metadata: {...} }
 * ```
 */
export function parsePayload(buffer: Buffer, header: BTPNIPsHeader): BTPNIPsPayload {
  // Validate payload length matches header
  validatePayloadLength(buffer, header.payloadLength)

  // Extract payload bytes (skip 4-byte header)
  const payloadBytes = buffer.slice(4, 4 + header.payloadLength)

  // Parse JSON payload
  let payload: unknown
  try {
    const jsonString = payloadBytes.toString('utf-8')
    payload = JSON.parse(jsonString)
  } catch (error) {
    throw new MalformedPayloadError(
      'Invalid JSON in payload',
      error instanceof Error ? error : undefined,
      payloadBytes.toString('hex').substring(0, 100),
    )
  }

  // Validate payload structure
  validatePayloadStructure(payload)

  return payload
}

/**
 * Parses a complete BTP-NIPs packet from a buffer
 *
 * Combines header and payload parsing into a single operation.
 * This is the main entry point for parsing BTP-NIPs packets from ILP STREAM data.
 *
 * @param buffer - Buffer containing complete BTP-NIPs packet
 * @returns Parsed packet with header and payload
 * @throws {TruncatedPacketError} If buffer is too short
 * @throws {InvalidVersionError} If protocol version is unsupported
 * @throws {InvalidMessageTypeError} If message type is invalid
 * @throws {PayloadLengthMismatchError} If payload length doesn't match
 * @throws {MalformedPayloadError} If JSON is invalid
 * @throws {InvalidPayloadStructureError} If required fields are missing
 *
 * @example
 * ```typescript
 * // Parse ILP STREAM packet data
 * const ilpPacket = await receiveILPPacket();
 * const _btpPacket = parseBTPNIPsPacket(ilpPacket.data);
 *
 * // Route based on message type
 * switch (btpPacket.header.messageType) {
 *   case NostrMessageType.EVENT:
 *     await handleEvent(btpPacket);
 *     break;
 *   case NostrMessageType.REQ:
 *     await handleReq(btpPacket);
 *     break;
 * }
 * ```
 */
export function parseBTPNIPsPacket(buffer: Buffer): BTPNIPsPacket {
  // Parse header first
  const header = parseHeader(buffer)

  // Parse payload using header information
  const payload = parsePayload(buffer, header)

  return {
    header,
    payload,
  }
}

/**
 * Serializes a BTP-NIPs header to a 4-byte buffer
 *
 * @param header - Header object to serialize
 * @returns 4-byte buffer with header data
 *
 * @example
 * ```typescript
 * const header = { version: 1, messageType: NostrMessageType.EVENT, payloadLength: 100 };
 * const buffer = serializeHeader(header);
 * // Buffer: [0x01, 0x01, 0x00, 0x64]
 * ```
 */
export function serializeHeader(header: BTPNIPsHeader): Buffer {
  // Allocate 4-byte buffer (no zeroing needed for performance)
  const buffer = Buffer.allocUnsafe(4)

  // Write header bytes
  buffer.writeUInt8(header.version, 0)
  buffer.writeUInt8(header.messageType, 1)
  buffer.writeUInt16BE(header.payloadLength, 2)

  return buffer
}

/**
 * Serializes a BTP-NIPs payload to a UTF-8 JSON buffer
 *
 * @param payload - Payload object to serialize
 * @returns Buffer containing UTF-8 encoded JSON
 *
 * @example
 * ```typescript
 * const payload = {
 *   payment: { amount: "1000", currency: "msat", purpose: "event_publish" },
 *   nostr: { id: "...", pubkey: "...", ... },
 *   metadata: { timestamp: Date.now(), sender: "g.dassie.alice" }
 * };
 * const buffer = serializePayload(payload);
 * ```
 */
export function serializePayload(payload: BTPNIPsPayload): Buffer {
  const jsonString = JSON.stringify(payload)
  return Buffer.from(jsonString, 'utf-8')
}

/**
 * Serializes a complete BTP-NIPs packet to a buffer
 *
 * This is the main entry point for creating BTP-NIPs packets to embed in ILP STREAM data.
 * The function automatically calculates the correct payload length.
 *
 * @param packet - Complete packet with header and payload
 * @returns Buffer ready to embed in ILP STREAM packet data field
 *
 * @example
 * ```typescript
 * // Create BTP-NIPs packet for EVENT message
 * const packet: BTPNIPsPacket = {
 *   header: {
 *     version: 1,
 *     messageType: NostrMessageType.EVENT,
 *     payloadLength: 0 // Will be calculated automatically
 *   },
 *   payload: {
 *     payment: { amount: "1000", currency: "msat", purpose: "event_publish" },
 *     nostr: {
 *       id: "...",
 *       pubkey: "...",
 *       created_at: Math.floor(Date.now() / 1000),
 *       kind: 1,
 *       tags: [],
 *       content: "Hello, BTP-NIPs!",
 *       sig: "..."
 *     },
 *     metadata: {
 *       timestamp: Math.floor(Date.now() / 1000),
 *       sender: "g.dassie.alice"
 *     }
 *   }
 * };
 *
 * const buffer = serializeBTPNIPsPacket(packet);
 *
 * // Embed in ILP STREAM packet
 * const ilpPacket = {
 *   amount: "1000",
 *   destination: "g.dassie.relay",
 *   data: buffer,
 *   // ... other ILP fields
 * };
 * ```
 */
export function serializeBTPNIPsPacket(packet: BTPNIPsPacket): Buffer {
  // Serialize payload first to get its length
  const payloadBuffer = serializePayload(packet.payload)

  // Create header with correct payload length
  const header: BTPNIPsHeader = {
    version: packet.header.version || 1,
    messageType: packet.header.messageType,
    payloadLength: payloadBuffer.length,
  }

  // Serialize header
  const headerBuffer = serializeHeader(header)

  // Concatenate header + payload
  return Buffer.concat([headerBuffer, payloadBuffer])
}
