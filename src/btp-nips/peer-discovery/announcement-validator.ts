import { isAddress } from 'viem'

import {
  extractBaseAddress,
  extractEndpoint,
  extractFeatures,
  extractIlpAddress,
  extractSupportedTokens,
  extractVersion,
  ILP_NODE_D_TAG,
  ILP_NODE_KIND,
} from '../types/ilp-node-announcement.js'
import { verifyNostrSignature } from '../crypto.js'
import { isValidIlpAddress } from './ilp-address-generator.js'

import type { NostrEvent } from '../types/index.js'

/**
 * ILP Node Announcement Validator
 * Validates ILP node announcements (Kind 32001)
 *
 * Epic 6: Peer Networking & Social Graph Integration
 * Story 6.1: ILP Node Announcement
 *
 * Reference: docs/stories/6.1.story.md
 */
/**
 * Validation result with detailed errors
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean
  /** Array of error messages (empty if valid) */
  errors: string[]
}

/**
 * Validation error codes for programmatic handling
 */
export enum ValidationErrorCode {
  INVALID_KIND = 'INVALID_KIND',
  MISSING_D_TAG = 'MISSING_D_TAG',
  INVALID_D_TAG = 'INVALID_D_TAG',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  MISSING_ILP_ADDRESS = 'MISSING_ILP_ADDRESS',
  INVALID_ILP_ADDRESS = 'INVALID_ILP_ADDRESS',
  MISSING_ENDPOINT = 'MISSING_ENDPOINT',
  INVALID_ENDPOINT = 'INVALID_ENDPOINT',
  MISSING_BASE_ADDRESS = 'MISSING_BASE_ADDRESS',
  INVALID_BASE_ADDRESS = 'INVALID_BASE_ADDRESS',
  INVALID_SUPPORTED_TOKENS = 'INVALID_SUPPORTED_TOKENS',
  INVALID_VERSION = 'INVALID_VERSION',
}

/**
 * Detailed validation error
 */
export interface ValidationError {
  code: ValidationErrorCode
  message: string
  field?: string
}

/**
 * Enhanced validation result with error codes
 */
export interface DetailedValidationResult {
  valid: boolean
  errors: ValidationError[]
}

/**
 * Validate ILP node announcement event
 *
 * Performs comprehensive validation:
 * - Event kind must be 32001
 * - 'd' tag must be 'ilp-node-info'
 * - Nostr signature must be valid
 * - ILP address must match format g.btp-nips.*
 * - Endpoint must be valid HTTPS URL
 * - Base address must be valid Ethereum address
 * - Supported tokens must be comma-separated list
 * - Version must match semver pattern
 *
 * @param event - Nostr event to validate
 * @returns Validation result with error messages
 *
 * @example
 * ```typescript
 * const result = await validateNodeAnnouncement(event);
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 *   return;
 * }
 * console.log('Announcement is valid');
 * ```
 */
export async function validateNodeAnnouncement(
  event: NostrEvent,
): Promise<ValidationResult> {
  const errors: string[] = []

  // Validate kind
  if (event.kind !== ILP_NODE_KIND) {
    errors.push(
      `Invalid event kind: expected ${ILP_NODE_KIND}, got ${event.kind}`,
    )
  }

  // Validate 'd' tag
  const dTag = event.tags.find((tag) => tag[0] === 'd')
  if (!dTag) {
    errors.push('Missing required \'d\' tag for NIP-33 parameterized replaceable event')
  } else if (dTag[1] !== ILP_NODE_D_TAG) {
    errors.push(
      `Invalid 'd' tag value: expected "${ILP_NODE_D_TAG}", got "${dTag[1]}"`,
    )
  }

  // Validate Nostr signature
  const signatureValid = await verifyNostrSignature(event)
  if (!signatureValid) {
    errors.push('Invalid Nostr signature (schnorr verification failed)')
  }

  // Validate ILP address
  const ilpAddress = extractIlpAddress(event)
  if (!ilpAddress) {
    errors.push('Missing required "ilp-address" tag')
  } else if (!isValidIlpAddress(ilpAddress)) {
    errors.push(
      `Invalid ILP address format: expected "g.btp-nips.*", got "${ilpAddress}"`,
    )
  }

  // Validate endpoint
  const endpoint = extractEndpoint(event)
  if (!endpoint) {
    errors.push('Missing required "ilp-endpoint" tag')
  } else if (!isValidHttpsUrl(endpoint)) {
    errors.push(`Invalid endpoint: must be HTTPS URL, got "${endpoint}"`)
  }

  // Validate Base address
  const baseAddress = extractBaseAddress(event)
  if (!baseAddress) {
    errors.push('Missing required "base-address" tag')
  } else if (!isAddress(baseAddress)) {
    errors.push(
      `Invalid Base address: must be valid Ethereum address (0x + 40 hex chars), got "${baseAddress}"`,
    )
  }

  // Validate supported tokens
  const supportedTokens = extractSupportedTokens(event)
  if (supportedTokens.length === 0) {
    errors.push(
      'Invalid "supported-tokens" tag: must be non-empty comma-separated list',
    )
  }

  // Validate version
  const version = extractVersion(event)
  if (!version) {
    errors.push('Missing required "version" tag')
  } else if (!isValidSemver(version)) {
    errors.push(`Invalid version: must match semver pattern (e.g., "1.0.0"), got "${version}"`)
  }

  // Validate features (optional, but if present must be valid)
  const features = extractFeatures(event)
  if (features.length > 0) {
    for (const feature of features) {
      if (feature.trim().length === 0) {
        errors.push('Invalid "features" tag: contains empty feature')
        break
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate ILP node announcement with detailed error codes
 *
 * Same as validateNodeAnnouncement() but returns structured error codes
 * for programmatic error handling.
 *
 * @param event - Nostr event to validate
 * @returns Detailed validation result with error codes
 *
 * @example
 * ```typescript
 * const result = await validateNodeAnnouncementDetailed(event);
 * if (!result.valid) {
 *   for (const error of result.errors) {
 *     if (error.code === ValidationErrorCode.INVALID_SIGNATURE) {
 *       console.error('Signature verification failed!');
 *     }
 *   }
 * }
 * ```
 */
export async function validateNodeAnnouncementDetailed(
  event: NostrEvent,
): Promise<DetailedValidationResult> {
  const errors: ValidationError[] = []

  // Validate kind
  if (event.kind !== ILP_NODE_KIND) {
    errors.push({
      code: ValidationErrorCode.INVALID_KIND,
      message: `Invalid event kind: expected ${ILP_NODE_KIND}, got ${event.kind}`,
      field: 'kind',
    })
  }

  // Validate 'd' tag
  const dTag = event.tags.find((tag) => tag[0] === 'd')
  if (!dTag) {
    errors.push({
      code: ValidationErrorCode.MISSING_D_TAG,
      message: 'Missing required \'d\' tag for NIP-33 parameterized replaceable event',
      field: 'd',
    })
  } else if (dTag[1] !== ILP_NODE_D_TAG) {
    errors.push({
      code: ValidationErrorCode.INVALID_D_TAG,
      message: `Invalid 'd' tag value: expected "${ILP_NODE_D_TAG}", got "${dTag[1]}"`,
      field: 'd',
    })
  }

  // Validate Nostr signature
  const signatureValid = await verifyNostrSignature(event)
  if (!signatureValid) {
    errors.push({
      code: ValidationErrorCode.INVALID_SIGNATURE,
      message: 'Invalid Nostr signature (schnorr verification failed)',
      field: 'sig',
    })
  }

  // Validate ILP address
  const ilpAddress = extractIlpAddress(event)
  if (!ilpAddress) {
    errors.push({
      code: ValidationErrorCode.MISSING_ILP_ADDRESS,
      message: 'Missing required "ilp-address" tag',
      field: 'ilp-address',
    })
  } else if (!isValidIlpAddress(ilpAddress)) {
    errors.push({
      code: ValidationErrorCode.INVALID_ILP_ADDRESS,
      message: `Invalid ILP address format: expected "g.btp-nips.*", got "${ilpAddress}"`,
      field: 'ilp-address',
    })
  }

  // Validate endpoint
  const endpoint = extractEndpoint(event)
  if (!endpoint) {
    errors.push({
      code: ValidationErrorCode.MISSING_ENDPOINT,
      message: 'Missing required "ilp-endpoint" tag',
      field: 'ilp-endpoint',
    })
  } else if (!isValidHttpsUrl(endpoint)) {
    errors.push({
      code: ValidationErrorCode.INVALID_ENDPOINT,
      message: `Invalid endpoint: must be HTTPS URL, got "${endpoint}"`,
      field: 'ilp-endpoint',
    })
  }

  // Validate Base address
  const baseAddress = extractBaseAddress(event)
  if (!baseAddress) {
    errors.push({
      code: ValidationErrorCode.MISSING_BASE_ADDRESS,
      message: 'Missing required "base-address" tag',
      field: 'base-address',
    })
  } else if (!isAddress(baseAddress)) {
    errors.push({
      code: ValidationErrorCode.INVALID_BASE_ADDRESS,
      message: `Invalid Base address: must be valid Ethereum address (0x + 40 hex chars), got "${baseAddress}"`,
      field: 'base-address',
    })
  }

  // Validate supported tokens
  const supportedTokens = extractSupportedTokens(event)
  if (supportedTokens.length === 0) {
    errors.push({
      code: ValidationErrorCode.INVALID_SUPPORTED_TOKENS,
      message: 'Invalid "supported-tokens" tag: must be non-empty comma-separated list',
      field: 'supported-tokens',
    })
  }

  // Validate version
  const version = extractVersion(event)
  if (!version) {
    errors.push({
      code: ValidationErrorCode.MISSING_D_TAG,
      message: 'Missing required "version" tag',
      field: 'version',
    })
  } else if (!isValidSemver(version)) {
    errors.push({
      code: ValidationErrorCode.INVALID_VERSION,
      message: `Invalid version: must match semver pattern (e.g., "1.0.0"), got "${version}"`,
      field: 'version',
    })
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate HTTPS URL format
 *
 * @param url - URL string to validate
 * @returns True if valid HTTPS URL
 *
 * @example
 * ```typescript
 * isValidHttpsUrl('https://example.com')  // true
 * isValidHttpsUrl('http://example.com')   // false (not HTTPS)
 * isValidHttpsUrl('not-a-url')            // false
 * ```
 */
function isValidHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Validate semver version format
 *
 * Accepts standard semver: MAJOR.MINOR.PATCH
 * Optionally with pre-release and build metadata.
 *
 * @param version - Version string to validate
 * @returns True if valid semver format
 *
 * @example
 * ```typescript
 * isValidSemver('1.0.0')           // true
 * isValidSemver('1.2.3-alpha.1')   // true
 * isValidSemver('v1.0.0')          // false (no 'v' prefix)
 * isValidSemver('1.0')             // false (incomplete)
 * ```
 */
function isValidSemver(version: string): boolean {
  // Semver regex pattern (simplified)
  // Matches: 1.0.0, 1.2.3-alpha.1, 1.0.0+build.123
  const semverRegex =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/

  return semverRegex.test(version)
}
