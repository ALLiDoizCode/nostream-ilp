import { createHash } from 'crypto'
import { schnorr } from '@noble/secp256k1'

import type { NostrEvent } from './types/index'

/**
 * Nostr Cryptographic Utilities
 *
 * Provides signature verification and event ID validation for Nostr events
 * according to NIP-01 specification.
 *
 * @module btp-nips/crypto
 * @see {@link https://github.com/nostr-protocol/nips/blob/master/01.md NIP-01}
 */

/**
 * Serialize a Nostr event for ID calculation according to NIP-01.
 *
 * The event ID is the SHA-256 hash of the serialized event data,
 * which is a JSON array of [0, pubkey, created_at, kind, tags, content].
 *
 * @param event - The Nostr event to serialize
 * @returns JSON string representation of the event for hashing
 *
 * @example
 * ```typescript
 * const serialized = serializeEventForId(event);
 * const id = sha256(Buffer.from(serialized)).toString('hex');
 * ```
 *
 * @see {@link https://github.com/nostr-protocol/nips/blob/master/01.md#events-and-signatures NIP-01 Event ID}
 */
export function serializeEventForId(event: NostrEvent): string {
  return JSON.stringify([
    0,                  // Reserved for future use (NIP-01 spec)
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ])
}

/**
 * Calculate SHA-256 hash of data and return as hex string.
 *
 * @param data - Buffer to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/**
 * Calculate the event ID for a Nostr event.
 *
 * The event ID is the SHA-256 hash of the serialized event data.
 *
 * @param event - The Nostr event
 * @returns Hex-encoded SHA-256 hash (64 characters)
 *
 * @example
 * ```typescript
 * const computedId = calculateEventId(event);
 * if (computedId !== event.id) {
 *   throw new Error('Event ID mismatch');
 * }
 * ```
 */
export function calculateEventId(event: NostrEvent): string {
  const serialized = serializeEventForId(event)
  return sha256(Buffer.from(serialized))
}

/**
 * Verify that the event ID matches the SHA-256 hash of the serialized event.
 *
 * @param event - The Nostr event to verify
 * @returns true if the event ID is valid, false otherwise
 */
export function verifyEventId(event: NostrEvent): boolean {
  const computedId = calculateEventId(event)
  return computedId === event.id
}

/**
 * Verify a Nostr event's schnorr signature.
 *
 * This verifies both:
 * 1. The event ID matches the SHA-256 hash of the serialized event
 * 2. The schnorr signature is valid for the event ID and public key
 *
 * @param event - The Nostr event to verify
 * @returns true if both the event ID and signature are valid, false otherwise
 *
 * @example
 * ```typescript
 * const event: NostrEvent = {
 *   id: '...',
 *   pubkey: '...',
 *   created_at: 1234567890,
 *   kind: 1,
 *   tags: [],
 *   content: 'Hello, world!',
 *   sig: '...'
 * };
 *
 * if (verifyNostrSignature(event)) {
 *   console.log('Event signature is valid');
 * } else {
 *   console.log('Event signature is invalid');
 * }
 * ```
 *
 * @see {@link https://github.com/nostr-protocol/nips/blob/master/01.md#events-and-signatures NIP-01 Signatures}
 */
export async function verifyNostrSignature(event: NostrEvent): Promise<boolean> {
  // Step 1: Verify event ID matches SHA-256 hash
  if (!verifyEventId(event)) {
    return false
  }

  // Step 2: Verify schnorr signature
  try {
    const isValid = await schnorr.verify(
      event.sig,      // Signature (hex string, 128 characters)
      event.id,       // Message (event ID, hex string, 64 characters)
      event.pubkey    // Public key (hex string, 64 characters)
    )
    return isValid
  } catch (error) {
    // Signature verification can throw for malformed inputs
    // (invalid hex strings, wrong lengths, etc.)
    return false
  }
}

/**
 * Validate that a Nostr event has the correct structure and field types.
 *
 * This performs basic type checking and field validation:
 * - All required fields are present
 * - Hex strings have correct lengths (id: 64, pubkey: 64, sig: 128)
 * - created_at is a valid Unix timestamp
 * - kind is a non-negative integer
 * - tags is an array of string arrays
 *
 * Note: This does NOT verify signatures. Use verifyNostrSignature() for that.
 *
 * @param event - The event to validate
 * @returns true if the event structure is valid, false otherwise
 */
export function validateEventStructure(event: unknown): event is NostrEvent {
  if (typeof event !== 'object' || event === null) {
    return false
  }

  const e = event as Record<string, unknown>

  // Check required fields exist
  if (
    typeof e.id !== 'string' ||
    typeof e.pubkey !== 'string' ||
    typeof e.created_at !== 'number' ||
    typeof e.kind !== 'number' ||
    !Array.isArray(e.tags) ||
    typeof e.content !== 'string' ||
    typeof e.sig !== 'string'
  ) {
    return false
  }

  // Validate hex string lengths
  if (e.id.length !== 64 || !/^[0-9a-f]{64}$/.test(e.id)) {
    return false
  }

  if (e.pubkey.length !== 64 || !/^[0-9a-f]{64}$/.test(e.pubkey)) {
    return false
  }

  if (e.sig.length !== 128 || !/^[0-9a-f]{128}$/.test(e.sig)) {
    return false
  }

  // Validate timestamp (must be positive)
  if (e.created_at < 0 || !Number.isInteger(e.created_at)) {
    return false
  }

  // Validate kind (must be non-negative integer)
  if (e.kind < 0 || !Number.isInteger(e.kind)) {
    return false
  }

  // Validate tags structure (array of string arrays)
  if (!e.tags.every((tag: unknown) => Array.isArray(tag) && tag.every((t: unknown) => typeof t === 'string'))) {
    return false
  }

  return true
}

/**
 * Derive Nostr public key from private key.
 *
 * @param privateKey - 32-byte private key (Buffer or Uint8Array)
 * @returns 64-character hex-encoded public key
 *
 * @example
 * ```typescript
 * const privateKey = Buffer.from('...', 'hex');
 * const pubkey = getPublicKey(privateKey);
 * ```
 */
export function getPublicKey(privateKey: Buffer | Uint8Array): string {
  const publicKey = schnorr.getPublicKey(privateKey)
  // schnorr.getPublicKey returns hex string
  return typeof publicKey === 'string' ? publicKey : Buffer.from(publicKey).toString('hex')
}

/**
 * Sign a Nostr event with a private key.
 *
 * This function:
 * 1. Calculates the event ID (SHA-256 hash)
 * 2. Signs the event ID with schnorr signature
 * 3. Returns the complete signed event
 *
 * @param event - Unsigned event (without id and sig fields)
 * @param privateKey - 32-byte private key (Buffer or Uint8Array)
 * @returns Complete signed event with id and sig fields
 *
 * @example
 * ```typescript
 * const unsignedEvent = {
 *   pubkey: '...',
 *   created_at: Math.floor(Date.now() / 1000),
 *   kind: 1,
 *   tags: [],
 *   content: 'Hello, world!'
 * };
 *
 * const privateKey = Buffer.from('...', 'hex');
 * const signedEvent = await signEvent(unsignedEvent, privateKey);
 * ```
 */
export async function signEvent(
  event: Omit<NostrEvent, 'id' | 'sig'>,
  privateKey: Buffer | Uint8Array,
): Promise<NostrEvent> {
  // Calculate event ID
  const eventId = calculateEventId(event as NostrEvent)

  // Sign the event ID
  const signatureResult = await schnorr.sign(eventId, privateKey)

  // Convert to hex string if needed
  const signature = typeof signatureResult === 'string'
    ? signatureResult
    : Buffer.from(signatureResult).toString('hex')

  // Return complete signed event
  return {
    ...event,
    id: eventId,
    sig: signature,
  } as NostrEvent
}
