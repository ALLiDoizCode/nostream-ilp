
/**
 * ILP Address Generator
 * Generates hierarchical ILP addresses from node ID and Nostr public key
 *
 * Epic 6: Peer Networking & Social Graph Integration
 * Story 6.1: ILP Node Announcement
 *
 * Reference: docs/stories/6.1.story.md
 * Reference: CLAUDE.md#interledger-protocol-ilp
 */

/**
 * ILP address format: g.btp-nips.{nodeId}.{pubkey_first_16_hex}
 *
 * Components:
 * - Prefix: "g." (global routing prefix)
 * - Network: "btp-nips" (BTP-NIPs network identifier)
 * - Node ID: User-chosen alphanumeric identifier (e.g., "alice")
 * - Pubkey Prefix: First 16 hex characters of Nostr public key
 *
 * Example: g.btp-nips.alice.npub1abc123def4567
 */

const ILP_GLOBAL_PREFIX = 'g'
const ILP_NETWORK_ID = 'btp-nips'
const PUBKEY_PREFIX_LENGTH = 16

/**
 * Parsed ILP address components
 */
export interface ParsedIlpAddress {
  /** Node identifier (e.g., "alice") */
  nodeId: string
  /** First 16 hex chars of pubkey */
  pubkeyPrefix: string
}

/**
 * Validation result for ILP address generation
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean
  /** Error message if validation failed */
  error?: string
}

/**
 * Validate node ID format
 *
 * Rules:
 * - Must be alphanumeric (lowercase letters and numbers only)
 * - Must be 1-32 characters long
 * - Cannot start with a number
 *
 * @param nodeId - Node identifier to validate
 * @returns Validation result
 *
 * @example
 * ```typescript
 * validateNodeId('alice')      // { valid: true }
 * validateNodeId('alice-123')  // { valid: false, error: '...' }
 * validateNodeId('123alice')   // { valid: false, error: '...' }
 * ```
 */
export function validateNodeId(nodeId: string): ValidationResult {
  if (!nodeId || nodeId.length === 0) {
    return { valid: false, error: 'Node ID cannot be empty' }
  }

  if (nodeId.length > 32) {
    return { valid: false, error: 'Node ID cannot exceed 32 characters' }
  }

  // Must be alphanumeric (lowercase letters and numbers)
  const alphanumericRegex = /^[a-z0-9]+$/
  if (!alphanumericRegex.test(nodeId)) {
    return {
      valid: false,
      error: 'Node ID must contain only lowercase letters and numbers',
    }
  }

  // Cannot start with a number
  if (/^[0-9]/.test(nodeId)) {
    return { valid: false, error: 'Node ID cannot start with a number' }
  }

  return { valid: true }
}

/**
 * Validate Nostr public key format
 *
 * Rules:
 * - Must be 64-character hex string (32 bytes)
 * - Must contain only hex characters (0-9, a-f)
 *
 * @param pubkey - Nostr public key (hex format)
 * @returns Validation result
 *
 * @example
 * ```typescript
 * validatePubkey('abc123...')  // { valid: true }
 * validatePubkey('xyz...')     // { valid: false, error: '...' }
 * validatePubkey('abc')        // { valid: false, error: '...' }
 * ```
 */
export function validatePubkey(pubkey: string): ValidationResult {
  if (!pubkey || pubkey.length === 0) {
    return { valid: false, error: 'Public key cannot be empty' }
  }

  if (pubkey.length !== 64) {
    return {
      valid: false,
      error: 'Public key must be 64 hex characters (32 bytes)',
    }
  }

  // Must be valid hex
  const hexRegex = /^[0-9a-f]+$/i
  if (!hexRegex.test(pubkey)) {
    return {
      valid: false,
      error: 'Public key must contain only hex characters (0-9, a-f)',
    }
  }

  return { valid: true }
}

/**
 * Generate ILP address from node ID and Nostr public key
 *
 * Format: g.btp-nips.{nodeId}.{pubkey_first_16_hex}
 *
 * @param nodeId - Unique node identifier (alphanumeric, lowercase)
 * @param pubkey - Nostr public key (64-char hex string)
 * @returns ILP address string
 * @throws Error if nodeId or pubkey is invalid
 *
 * @example
 * ```typescript
 * const address = generateIlpAddress(
 *   'alice',
 *   'abc123def456789012345678901234567890123456789012345678901234'
 * )
 * // Returns: 'g.btp-nips.alice.abc123def4567890'
 * ```
 */
export function generateIlpAddress(nodeId: string, pubkey: string): string {
  // Validate node ID
  const nodeIdValidation = validateNodeId(nodeId)
  if (!nodeIdValidation.valid) {
    throw new Error(`Invalid node ID: ${nodeIdValidation.error}`)
  }

  // Validate pubkey
  const pubkeyValidation = validatePubkey(pubkey)
  if (!pubkeyValidation.valid) {
    throw new Error(`Invalid public key: ${pubkeyValidation.error}`)
  }

  // Extract first 16 hex chars from pubkey
  const pubkeyPrefix = pubkey.slice(0, PUBKEY_PREFIX_LENGTH).toLowerCase()

  // Construct ILP address
  return `${ILP_GLOBAL_PREFIX}.${ILP_NETWORK_ID}.${nodeId}.${pubkeyPrefix}`
}

/**
 * Parse ILP address into components
 *
 * @param address - ILP address to parse
 * @returns Parsed components or null if invalid format
 *
 * @example
 * ```typescript
 * const parsed = parseIlpAddress('g.btp-nips.alice.abc123def4567890')
 * // Returns: { nodeId: 'alice', pubkeyPrefix: 'abc123def4567890' }
 *
 * const invalid = parseIlpAddress('invalid-address')
 * // Returns: null
 * ```
 */
export function parseIlpAddress(address: string): ParsedIlpAddress | null {
  if (!address || address.length === 0) {
    return null
  }

  // Split address into parts
  const parts = address.split('.')

  // Must have exactly 4 parts: g, btp-nips, nodeId, pubkeyPrefix
  if (parts.length !== 4) {
    return null
  }

  const [prefix, network, nodeId, pubkeyPrefix] = parts

  // Validate prefix and network
  if (prefix !== ILP_GLOBAL_PREFIX || network !== ILP_NETWORK_ID) {
    return null
  }

  // Validate node ID format
  const nodeIdValidation = validateNodeId(nodeId)
  if (!nodeIdValidation.valid) {
    return null
  }

  // Validate pubkey prefix (must be 16 hex chars)
  if (
    pubkeyPrefix.length !== PUBKEY_PREFIX_LENGTH ||
    !/^[0-9a-f]+$/i.test(pubkeyPrefix)
  ) {
    return null
  }

  return { nodeId, pubkeyPrefix }
}

/**
 * Check if string is a valid ILP address
 *
 * @param address - String to validate
 * @returns True if valid ILP address format
 *
 * @example
 * ```typescript
 * isValidIlpAddress('g.btp-nips.alice.abc123def4567890')  // true
 * isValidIlpAddress('invalid-address')                    // false
 * ```
 */
export function isValidIlpAddress(address: string): boolean {
  return parseIlpAddress(address) !== null
}
