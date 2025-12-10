import {
import { BTPNIPsPayload, NostrMessageType } from './types'

/**
 * BTP-NIPs Validation Utilities
 *
 * Runtime validation functions for BTP-NIPs protocol compliance.
 * Uses TypeScript type guards and assertion functions for type safety.
 */

  InvalidMessageTypeError,
  InvalidPayloadStructureError,
  InvalidVersionError,
  PayloadLengthMismatchError,
} from './errors'

/**
 * Validates protocol version is supported
 *
 * @param version - Version byte from header (byte 0)
 * @throws {InvalidVersionError} If version is not 1
 */
export function validateVersion(version: number): void {
  if (version !== 1) {
    throw new InvalidVersionError(version, 1)
  }
}

/**
 * Validates message type is in valid range
 *
 * @param messageType - Message type byte from header (byte 1)
 * @throws {InvalidMessageTypeError} If message type is not 0x01-0x07
 */
export function validateMessageType(messageType: number): void {
  const validTypes = [
    NostrMessageType.EVENT,
    NostrMessageType.REQ,
    NostrMessageType.CLOSE,
    NostrMessageType.NOTICE,
    NostrMessageType.EOSE,
    NostrMessageType.OK,
    NostrMessageType.AUTH,
  ]

  if (!validTypes.includes(messageType)) {
    throw new InvalidMessageTypeError(messageType)
  }
}

/**
 * Validates payload length matches header declaration
 *
 * @param buffer - Full packet buffer
 * @param expectedLength - Payload length from header (bytes 2-3)
 * @throws {PayloadLengthMismatchError} If buffer is too short/long
 */
export function validatePayloadLength(buffer: Buffer, expectedLength: number): void {
  const actualLength = buffer.length - 4 // Subtract 4-byte header

  if (actualLength !== expectedLength) {
    throw new PayloadLengthMismatchError(
      expectedLength,
      actualLength,
      buffer.toString('hex').substring(0, 100), // First 50 bytes for debugging
    )
  }
}

/**
 * Type guard to check if value is an object (not null, not array)
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validates payload structure has required fields
 *
 * @param payload - Parsed JSON payload
 * @throws {InvalidPayloadStructureError} If required fields are missing
 */
export function validatePayloadStructure(payload: unknown): asserts payload is BTPNIPsPayload {
  if (!isObject(payload)) {
    throw new InvalidPayloadStructureError(['payload must be an object'], payload)
  }

  const missingFields: string[] = []

  // Check top-level required fields
  if (!isObject(payload.payment)) {
    missingFields.push('payment')
  }
  if (!isObject(payload.nostr)) {
    missingFields.push('nostr')
  }
  if (!isObject(payload.metadata)) {
    missingFields.push('metadata')
  }

  if (missingFields.length > 0) {
    throw new InvalidPayloadStructureError(missingFields, payload)
  }

  // Validate payment structure
  const payment = payload.payment as Record<string, unknown>
  if (typeof payment.amount !== 'string') {
    missingFields.push('payment.amount')
  }
  if (typeof payment.currency !== 'string') {
    missingFields.push('payment.currency')
  }
  if (typeof payment.purpose !== 'string') {
    missingFields.push('payment.purpose')
  }

  // Validate metadata structure
  const metadata = payload.metadata as Record<string, unknown>
  if (typeof metadata.timestamp !== 'number') {
    missingFields.push('metadata.timestamp')
  }
  if (typeof metadata.sender !== 'string') {
    missingFields.push('metadata.sender')
  }

  // Note: nostr field structure varies by message type, so we only check it exists
  // Full validation of nostr message structure happens in message-specific handlers

  if (missingFields.length > 0) {
    throw new InvalidPayloadStructureError(missingFields, payload)
  }
}
