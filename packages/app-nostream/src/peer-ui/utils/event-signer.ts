import { createHash } from 'crypto'
import { schnorr } from '@noble/curves/secp256k1'

// Utility functions for hex/byte conversions
function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

function hexToBytes(hex: string): Uint8Array {
  return new Uint8Array(Buffer.from(hex, 'hex'))
}

/**
 * Nostr event structure
 */
export interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

/**
 * Calculate event ID (SHA-256 hash of serialized event)
 * Per NIP-01: https://github.com/nostr-protocol/nips/blob/master/01.md
 *
 * @param event - Unsigned Nostr event
 * @returns Event ID (hex string)
 */
export function calculateEventId(event: Omit<NostrEvent, 'id' | 'sig'>): string {
  // Serialize event per NIP-01 spec
  const serialized = JSON.stringify([
    0, // Reserved for future use
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ])

  // Calculate SHA-256 hash
  const hash = createHash('sha256').update(serialized).digest()
  return bytesToHex(hash)
}

/**
 * Sign a Nostr event with a private key
 * @param event - Unsigned event
 * @param privateKeyHex - Private key (hex string, 64 characters)
 * @returns Signed event
 */
export function signEvent(
  event: Omit<NostrEvent, 'id' | 'sig'>,
  privateKeyHex: string
): NostrEvent {
  // Calculate event ID
  const id = calculateEventId(event)

  // Sign the ID with Schnorr signature
  const messageHash = hexToBytes(id)
  const privateKey = hexToBytes(privateKeyHex)

  const signature = schnorr.sign(messageHash, privateKey)
  const sig = bytesToHex(signature)

  return {
    ...event,
    id,
    sig,
  }
}

/**
 * Verify a Nostr event signature
 * @param event - Signed event
 * @returns True if signature is valid
 */
export function verifyEventSignature(event: NostrEvent): boolean {
  try {
    // Recalculate event ID
    const calculatedId = calculateEventId(event)

    // Verify ID matches
    if (calculatedId !== event.id) {
      return false
    }

    // Verify signature
    const messageHash = hexToBytes(event.id)
    const publicKey = hexToBytes(event.pubkey)
    const signature = hexToBytes(event.sig)

    return schnorr.verify(signature, messageHash, publicKey)
  } catch (error) {
    console.error('Signature verification error:', error)
    return false
  }
}

/**
 * Convert nsec (bech32) to hex private key
 * @param nsec - Private key in nsec format
 * @returns Hex private key
 */
export function nsecToHex(nsec: string): string {
  // TODO: Implement bech32 decoding
  // For now, assume input is already hex if it doesn't start with 'nsec'
  if (!nsec.startsWith('nsec')) {
    return nsec
  }

  // This is a placeholder - actual implementation would use a bech32 library
  throw new Error('nsec decoding not yet implemented. Please provide hex private key.')
}

/**
 * Convert hex public key to npub (bech32)
 * @param hexPubkey - Public key in hex format
 * @returns npub public key
 */
export function hexToNpub(hexPubkey: string): string {
  // TODO: Implement bech32 encoding
  // For now, return hex
  return hexPubkey
}
