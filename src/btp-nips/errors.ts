
/**
 * BTP-NIPs Protocol Error Classes
 *
 * Custom error types for BTP-NIPs packet parsing and validation.
 * All errors extend the base BTPNIPsError class for consistent error handling.
 */

/**
 * Base error class for all BTP-NIPs protocol errors
 */
export class BTPNIPsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BTPNIPsError'
    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}

/**
 * Error thrown when protocol version is not supported
 *
 * Expected: version === 1
 * Thrown when: version byte is not 1
 */
export class InvalidVersionError extends BTPNIPsError {
  constructor(
    public readonly receivedVersion: number,
    public readonly expectedVersion: number = 1,
    public readonly bufferHex?: string,
  ) {
    super(
      `Invalid BTP-NIPs protocol version. Expected ${expectedVersion}, got ${receivedVersion}.` +
        (bufferHex ? ` Buffer: ${bufferHex}` : ''),
    )
    this.name = 'InvalidVersionError'
  }
}

/**
 * Error thrown when message type is not in valid range
 *
 * Expected: 0x01-0x07 (EVENT, REQ, CLOSE, NOTICE, EOSE, OK, AUTH)
 * Thrown when: message type byte is outside this range
 */
export class InvalidMessageTypeError extends BTPNIPsError {
  constructor(
    public readonly receivedType: number,
    public readonly bufferHex?: string,
  ) {
    super(
      `Invalid BTP-NIPs message type. Expected 0x01-0x07, got 0x${receivedType.toString(16).padStart(2, '0')}.` +
        (bufferHex ? ` Buffer: ${bufferHex}` : ''),
    )
    this.name = 'InvalidMessageTypeError'
  }
}

/**
 * Error thrown when payload length in header doesn't match actual payload size
 *
 * Expected: header.payloadLength === actualPayloadLength
 * Thrown when: buffer is shorter/longer than header claims
 */
export class PayloadLengthMismatchError extends BTPNIPsError {
  constructor(
    public readonly expectedLength: number,
    public readonly actualLength: number,
    public readonly bufferHex?: string,
  ) {
    super(
      `Payload length mismatch. Header claims ${expectedLength} bytes, but buffer contains ${actualLength} bytes.` +
        (bufferHex ? ` Buffer: ${bufferHex}` : ''),
    )
    this.name = 'PayloadLengthMismatchError'
  }
}

/**
 * Error thrown when JSON payload is malformed or cannot be parsed
 *
 * Thrown when:
 * - JSON.parse() fails (invalid JSON syntax)
 * - Payload is not valid UTF-8
 */
export class MalformedPayloadError extends BTPNIPsError {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly bufferHex?: string,
  ) {
    super(
      `Malformed BTP-NIPs payload: ${message}` +
        (cause ? `. Cause: ${cause.message}` : '') +
        (bufferHex ? `. Buffer: ${bufferHex}` : ''),
    )
    this.name = 'MalformedPayloadError'
  }
}

/**
 * Error thrown when payload structure is missing required fields
 *
 * Expected: payload has { payment, nostr, metadata } fields
 * Thrown when: one or more required fields are missing
 */
export class InvalidPayloadStructureError extends BTPNIPsError {
  constructor(
    public readonly missingFields: string[],
    public readonly payload?: unknown,
  ) {
    super(
      `Invalid BTP-NIPs payload structure. Missing required fields: ${missingFields.join(', ')}.` +
        (payload ? ` Payload: ${JSON.stringify(payload)}` : ''),
    )
    this.name = 'InvalidPayloadStructureError'
  }
}

/**
 * Error thrown when buffer is shorter than expected
 *
 * Expected: buffer length >= 4 (minimum header size)
 * Thrown when: buffer is too short to contain valid header/payload
 */
export class TruncatedPacketError extends BTPNIPsError {
  constructor(
    public readonly requiredLength: number,
    public readonly actualLength: number,
    public readonly bufferHex?: string,
  ) {
    super(
      `Truncated BTP-NIPs packet. Expected at least ${requiredLength} bytes, got ${actualLength} bytes.` +
        (bufferHex ? ` Buffer: ${bufferHex}` : ''),
    )
    this.name = 'TruncatedPacketError'
  }
}

/**
 * Error thrown when payment amount is insufficient
 *
 * Expected: payment amount >= required amount (based on event kind pricing)
 * Thrown when: sender didn't pay enough for the requested operation
 *
 * Action: Reject ILP packet (sender should retry with higher payment)
 */
export class InsufficientPaymentError extends BTPNIPsError {
  constructor(
    public readonly requiredAmount: number,
    public readonly paidAmount: number,
    public readonly eventId?: string,
  ) {
    super(
      `Insufficient payment. Required ${requiredAmount} msats, got ${paidAmount} msats.` +
        (eventId ? ` Event ID: ${eventId}` : ''),
    )
    this.name = 'InsufficientPaymentError'
  }
}

/**
 * Error thrown when Nostr event signature is invalid
 *
 * Expected: schnorr signature verification passes
 * Thrown when:
 * - Event ID doesn't match SHA-256 hash of serialized event
 * - Schnorr signature verification fails
 * - Signature format is malformed
 *
 * Action: Fulfill ILP packet (accept payment), log error, don't store event
 */
export class InvalidSignatureError extends BTPNIPsError {
  constructor(
    public readonly eventId: string,
    public readonly pubkey: string,
    public readonly reason?: string,
  ) {
    super(
      `Invalid Nostr signature for event ${eventId} from pubkey ${pubkey.substring(0, 8)}...` +
        (reason ? `. Reason: ${reason}` : ''),
    )
    this.name = 'InvalidSignatureError'
  }
}

/**
 * Error thrown when event ID doesn't match SHA-256 hash
 *
 * Expected: event.id === sha256(serialized event)
 * Thrown when: event ID field doesn't match computed hash
 *
 * Action: Fulfill ILP packet (accept payment), log error, don't store event
 */
export class InvalidEventIdError extends BTPNIPsError {
  constructor(
    public readonly claimedId: string,
    public readonly computedId: string,
    public readonly pubkey?: string,
  ) {
    super(
      `Invalid event ID. Claimed: ${claimedId}, Computed: ${computedId}` +
        (pubkey ? `. Pubkey: ${pubkey.substring(0, 8)}...` : ''),
    )
    this.name = 'InvalidEventIdError'
  }
}

/**
 * Error thrown when attempting to store a duplicate event
 *
 * Expected: event ID is unique (first time seeing this event)
 * Thrown when: event ID already exists in database
 *
 * Action: Fulfill ILP packet (idempotent), log info, return early
 */
export class DuplicateEventError extends BTPNIPsError {
  constructor(
    public readonly eventId: string,
    public readonly pubkey: string,
  ) {
    super(
      `Duplicate event ${eventId} from pubkey ${pubkey.substring(0, 8)}...`,
    )
    this.name = 'DuplicateEventError'
  }
}
