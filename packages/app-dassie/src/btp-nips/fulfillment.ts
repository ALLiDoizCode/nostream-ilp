/**
 * ILP Fulfillment/Rejection for BTP-NIPs packets
 * Creates ILP fulfillment and rejection responses containing BTP-NIPs data
 */

import { sha256 } from '@noble/hashes/sha2.js'
import type { BtpNipsResponse } from './types.js'

/**
 * ILP fulfillment packet
 */
export interface IlpFulfillment {
  fulfillment: Buffer // 32-byte SHA-256 preimage
  data: Buffer // Serialized BTP-NIPs response
}

/**
 * ILP rejection packet
 */
export interface IlpRejection {
  code: string // ILP error code (3 chars)
  message: string // Human-readable error
  data: Buffer // Optional error details
}

/**
 * ILP error codes
 */
export const ILP_ERROR_CODES = {
  /** Temporary failure - sender may retry */
  TEMPORARY_FAILURE: 'F99',
  /** Invalid packet format */
  INVALID_PACKET: 'F01',
  /** Application error */
  APPLICATION_ERROR: 'F02',
  /** Insufficient destination amount */
  INSUFFICIENT_DESTINATION: 'F03',
} as const

/**
 * Serialize BTP-NIPs response to NIP-01 format
 * Follows Nostr relay message format: ["TYPE", ...args]
 *
 * @param response BTP-NIPs response
 * @returns JSON array as string
 */
export function serializeResponse(response: BtpNipsResponse): string {
  switch (response.type) {
    case 'OK':
      // ["OK", eventId, accepted, message]
      return JSON.stringify(['OK', response.eventId, response.accepted, response.message])

    case 'EOSE':
      // ["EOSE", subId]
      return JSON.stringify(['EOSE', response.subId])

    case 'EVENT':
      // ["EVENT", subId, event]
      return JSON.stringify(['EVENT', response.subId, response.event])

    case 'NOTICE':
      // ["NOTICE", message]
      return JSON.stringify(['NOTICE', response.message])

    default: {
      // Exhaustive check
      const _exhaustive: never = response
      throw new Error(`Unknown response type: ${JSON.stringify(_exhaustive)}`)
    }
  }
}

/**
 * Create ILP fulfillment for successful BTP-NIPs processing
 *
 * @param response BTP-NIPs response
 * @param condition ILP execution condition (must match SHA-256(fulfillment))
 * @param providedFulfillment Optional pre-computed fulfillment (from IlpContext)
 * @returns ILP fulfillment packet
 * @throws Error if fulfillment verification fails
 */
export function createFulfillment(
  response: BtpNipsResponse,
  condition: Buffer,
  providedFulfillment?: Buffer,
): IlpFulfillment {
  // Serialize BTP-NIPs response
  const responseJson = serializeResponse(response)
  const data = Buffer.from(responseJson, 'utf-8')

  // Use provided fulfillment or generate a zero fulfillment as fallback
  // Note: For proper ILP payments, the fulfillment should be provided by the payment protocol
  // Zero fulfillment is used for testing or non-payment scenarios (similar to ILDCP)
  const fulfillment = providedFulfillment ?? Buffer.alloc(32)

  // Verify that SHA-256(fulfillment) === condition (unless using zero fulfillment)
  if (providedFulfillment) {
    const calculatedCondition = Buffer.from(sha256(fulfillment))
    if (!calculatedCondition.equals(condition)) {
      throw new Error(
        'Fulfillment verification failed: SHA-256(fulfillment) !== condition\n' +
        `Expected: ${condition.toString('hex')}\n` +
        `Got:      ${calculatedCondition.toString('hex')}`
      )
    }
  }

  return {
    fulfillment,
    data,
  }
}

/**
 * Create ILP rejection for failed BTP-NIPs processing
 *
 * @param error Error that caused the rejection
 * @param code ILP error code (defaults to F99 temporary failure)
 * @returns ILP rejection packet
 */
export function createRejection(
  error: Error,
  code: keyof typeof ILP_ERROR_CODES = 'TEMPORARY_FAILURE',
): IlpRejection {
  // Create error response as NOTICE
  const notice: BtpNipsResponse = {
    type: 'NOTICE',
    message: error.message,
  }

  // Serialize error response
  const responseJson = serializeResponse(notice)
  const data = Buffer.from(responseJson, 'utf-8')

  return {
    code: ILP_ERROR_CODES[code],
    message: error.message,
    data,
  }
}

/**
 * Verify that a fulfillment matches a condition
 *
 * @param fulfillment 32-byte fulfillment preimage
 * @param condition 32-byte execution condition
 * @returns true if SHA-256(fulfillment) === condition
 */
export function verifyFulfillment(fulfillment: Buffer, condition: Buffer): boolean {
  if (fulfillment.length !== 32) {
    return false
  }
  if (condition.length !== 32) {
    return false
  }

  const calculatedCondition = Buffer.from(sha256(fulfillment))
  return calculatedCondition.equals(condition)
}
