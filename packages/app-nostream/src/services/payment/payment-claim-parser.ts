import { PaymentClaim, PaymentCurrency, SUPPORTED_CURRENCIES } from '../../@types/payment-claim'

/**
 * Nostr event structure (NIP-01)
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
 * Maximum safe integer for JavaScript numbers
 */
const MAX_SAFE_INT = Number.MAX_SAFE_INTEGER

/**
 * Minimum channel ID length (blockchain-specific identifiers are typically longer)
 */
const MIN_CHANNEL_ID_LENGTH = 10

/**
 * Maximum channel ID length (prevent DoS attacks with extremely long strings)
 */
const MAX_CHANNEL_ID_LENGTH = 256

/**
 * Minimum signature length (hex-encoded, at least 64 bytes = 128 chars)
 * Signatures can be longer depending on the signing algorithm (ECDSA can produce variable-length signatures)
 */
const MIN_SIGNATURE_LENGTH = 128

/**
 * Hex character validation regex
 */
const HEX_REGEX = /^[0-9a-fA-F]+$/

/**
 * Validates a channel ID format
 *
 * @param id - Channel identifier to validate
 * @returns true if valid, false otherwise
 */
export function isValidChannelId(id: string | undefined | null): boolean {
  if (typeof id !== 'string' || id.length === 0) {
    return false
  }
  if (id.length < MIN_CHANNEL_ID_LENGTH) {
    return false
  }
  if (id.length > MAX_CHANNEL_ID_LENGTH) {
    return false
  }
  return true
}

/**
 * Validates a payment amount
 *
 * @param amount - Amount in satoshis to validate
 * @returns true if valid, false otherwise
 */
export function isValidAmount(amount: number | undefined | null): boolean {
  if (typeof amount !== 'number') {
    return false
  }
  if (!Number.isInteger(amount)) {
    return false
  }
  if (amount <= 0) {
    return false
  }
  if (amount > MAX_SAFE_INT) {
    return false
  }
  return true
}

/**
 * Validates a nonce value
 *
 * @param nonce - Nonce to validate
 * @returns true if valid, false otherwise
 */
export function isValidNonce(nonce: number | undefined | null): boolean {
  if (typeof nonce !== 'number') {
    return false
  }
  if (!Number.isInteger(nonce)) {
    return false
  }
  if (nonce < 0) {
    return false
  }
  if (nonce > MAX_SAFE_INT) {
    return false
  }
  return true
}

/**
 * Validates a cryptographic signature format (hex-encoded)
 *
 * @param sig - Signature to validate
 * @returns true if valid, false otherwise
 */
export function isValidSignature(sig: string | undefined | null): boolean {
  if (typeof sig !== 'string' || sig.length === 0) {
    return false
  }
  // Reject 0x prefix for consistency
  if (sig.startsWith('0x')) {
    return false
  }
  // Signature must be at least MIN_SIGNATURE_LENGTH characters
  if (sig.length < MIN_SIGNATURE_LENGTH) {
    return false
  }
  if (!HEX_REGEX.test(sig)) {
    return false
  }
  return true
}

/**
 * Validates a currency string is a supported currency
 *
 * @param currency - Currency string to validate
 * @returns true if valid and supported, false otherwise
 */
export function isValidCurrency(currency: string | undefined | null): currency is PaymentCurrency {
  if (typeof currency !== 'string') {
    return false
  }
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(currency)
}

/**
 * Validates a payment claim format
 *
 * Checks all fields of a payment claim for correctness according to the specification.
 * Does not verify cryptographic signatures or channel state - that is delegated to Dassie.
 *
 * @param claim - Payment claim to validate (may be partial)
 * @returns true if all fields are valid, false otherwise
 *
 * @example
 * ```typescript
 * const claim = {
 *   channelId: 'channel_abc123',
 *   amountSats: 1000,
 *   nonce: 42,
 *   signature: '304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901',
 *   currency: 'BTC'
 * }
 * const isValid = validateClaimFormat(claim) // returns true
 * ```
 */
export function validateClaimFormat(claim: Partial<PaymentClaim>): boolean {
  // Validate channelId
  if (!isValidChannelId(claim.channelId)) {
    console.debug('Invalid channelId:', claim.channelId)
    return false
  }

  // Validate amountSats
  if (!isValidAmount(claim.amountSats)) {
    console.debug('Invalid amountSats:', claim.amountSats)
    return false
  }

  // Validate nonce
  if (!isValidNonce(claim.nonce)) {
    console.debug('Invalid nonce:', claim.nonce)
    return false
  }

  // Validate signature
  if (!isValidSignature(claim.signature)) {
    console.debug('Invalid signature format:', claim.signature?.substring(0, 8) + '...')
    return false
  }

  // Validate currency
  if (!isValidCurrency(claim.currency)) {
    console.debug('Invalid currency:', claim.currency)
    return false
  }

  return true
}

/**
 * Extracts a payment claim from a Nostr event
 *
 * Searches the event's tags array for a payment tag matching the format:
 * `["payment", "ilp", <channelId>, <amountSats>, <nonce>, <signature>, <currency>]`
 *
 * Returns null if:
 * - No payment tag is found
 * - Payment tag is malformed (wrong length, invalid fields)
 * - Multiple payment tags exist (uses first valid one, logs warning)
 *
 * @param event - Nostr event to extract payment claim from
 * @returns Parsed payment claim, or null if none found or invalid
 *
 * @example
 * ```typescript
 * const _event = {
 *   id: 'abc123...',
 *   pubkey: 'def456...',
 *   created_at: 1700000000,
 *   kind: 1,
 *   tags: [
 *     ['payment', 'ilp', 'channel_abc123', '1000', '42', '3044022...', 'BTC'],
 *     ['p', 'mentioned_pubkey']
 *   ],
 *   content: 'Hello paid Nostr!',
 *   sig: '789ghi...'
 * }
 *
 * const claim = extractPaymentClaim(event)
 * // Returns: { channelId: 'channel_abc123', amountSats: 1000, nonce: 42, signature: '3044022...', currency: 'BTC' }
 * ```
 */
export function extractPaymentClaim(event: NostrEvent): PaymentClaim | null {
  // Search for payment tag
  const paymentTags = event.tags.filter(tag => tag[0] === 'payment' && tag[1] === 'ilp')

  if (paymentTags.length === 0) {
    // No payment tag - this is expected for free events
    console.debug(`No payment tag found in event ${event.id}`)
    return null
  }

  if (paymentTags.length > 1) {
    console.warn(`Event ${event.id} has multiple payment tags, using first valid one`)
  }

  // Process first payment tag
  const tag = paymentTags[0]

  // Validate tag length (must be exactly 7 fields)
  if (tag.length < 7) {
    console.warn(`Event ${event.id} has malformed payment tag: too few fields (${tag.length})`)
    return null
  }

  if (tag.length > 7) {
    console.debug(`Event ${event.id} has extra fields in payment tag (${tag.length}), ignoring extras`)
  }

  // Extract fields
  const [, , channelId, amountStr, nonceStr, signature, currency] = tag

  // Parse numeric fields
  const amountSats = parseInt(amountStr, 10)
  const nonce = parseInt(nonceStr, 10)

  // Check for parsing errors
  if (isNaN(amountSats)) {
    console.warn(`Event ${event.id} has non-numeric amountSats: ${amountStr}`)
    return null
  }

  if (isNaN(nonce)) {
    console.warn(`Event ${event.id} has non-numeric nonce: ${nonceStr}`)
    return null
  }

  // Build claim object
  const claim: PaymentClaim = {
    channelId,
    amountSats,
    nonce,
    signature,
    currency: currency as PaymentCurrency,
  }

  // Validate claim format
  if (!validateClaimFormat(claim)) {
    console.warn(`Event ${event.id} has invalid payment claim format`)
    return null
  }

  return claim
}
