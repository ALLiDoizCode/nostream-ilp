import { ed25519 } from "@noble/curves/ed25519"

import { settlementXrpl as logger } from "../../../../logger/instances"
import type {
  XrpPaymentClaim,
  XrplPaymentChannelState,
} from "../types/payment-channel-state"

export interface VerifyPaymentClaimResult {
  /**
   * Whether the claim is valid
   */
  valid: boolean

  /**
   * Reason for rejection (if invalid)
   */
  reason?: string

  /**
   * Verified amount in sats (if valid)
   */
  amountSats?: number

  /**
   * Updated channel state (if valid)
   */
  updatedChannelState?: XrplPaymentChannelState
}

/**
 * Convert sats to XRP drops (MVP: 1:1 conversion)
 *
 * @remarks
 *
 * For MVP (Story 2.8), we use a simplified 1:1 conversion.
 * Accurate conversion with exchange rate oracle deferred to Story 2.9.
 *
 * @param amountSats - Amount in sats
 * @returns Amount in drops (1 XRP = 1,000,000 drops)
 */
function convertSatsToDrops(amountSats: number): bigint {
  // MVP: 1 sat = 1 drop (simplified conversion)
  return BigInt(amountSats)
}

/**
 * Create claim message for Ed25519 signature verification
 *
 * @remarks
 *
 * XRPL payment channel claim signature format:
 * - Magic bytes: 'CLM\0' (0x43 0x4C 0x4D 0x00)
 * - Channel ID: 32 bytes (hex string to buffer)
 * - Amount: 64-bit unsigned integer, big-endian
 *
 * @param channelId - Payment channel ID (64-character hex string)
 * @param amountDrops - Claim amount in drops
 * @returns Signature message as Uint8Array
 */
function createClaimMessage(
  channelId: string,
  amountDrops: bigint,
): Uint8Array {
  // Magic bytes for claim: 'CLM\0'
  const CLM_PREFIX = new Uint8Array([0x43, 0x4c, 0x4d, 0x00])

  // Channel ID as 32-byte buffer (hex string to bytes)
  if (channelId.length !== 64) {
    throw new Error(
      `Invalid channel ID length: ${channelId.length} (expected 64 hex characters)`,
    )
  }
  const channelIdBuffer = new Uint8Array(
    Buffer.from(channelId, "hex").subarray(0, 32),
  )

  // Amount as 64-bit unsigned integer, big-endian
  const amountBuffer = new Uint8Array(8)
  const amountView = new DataView(amountBuffer.buffer)
  amountView.setBigUint64(0, amountDrops, false) // false = big-endian

  // Concatenate: CLM\0 + channelId + amount
  const message = new Uint8Array(
    CLM_PREFIX.length + channelIdBuffer.length + amountBuffer.length,
  )
  message.set(CLM_PREFIX, 0)
  message.set(channelIdBuffer, CLM_PREFIX.length)
  message.set(amountBuffer, CLM_PREFIX.length + channelIdBuffer.length)

  return message
}

/**
 * Verify XRP payment claim off-chain
 *
 * @remarks
 *
 * This function performs off-chain verification of a payment claim:
 * 1. Converts amountSats to drops (MVP: 1:1 conversion)
 * 2. Reconstructs signature message (XRPL format)
 * 3. Verifies Ed25519 signature using sender's public key
 * 4. Validates claim constraints (monotonic, within balance, channel open)
 * 5. Updates channel state with new highest claim
 *
 * @param claim - Payment claim from Nostream relay
 * @param channelState - Current channel state
 * @returns Verification result with updated state if valid
 */
export function verifyPaymentClaim(
  claim: XrpPaymentClaim,
  channelState: XrplPaymentChannelState,
): VerifyPaymentClaimResult {
  logger.debug?.("verifying payment claim", {
    channelId: claim.channelId,
    amountSats: claim.amountSats,
    nonce: claim.nonce,
  })

  // 1. Validate channel ID matches
  if (claim.channelId !== channelState.channelId) {
    logger.warn("claim channel ID mismatch", {
      claimChannelId: claim.channelId,
      stateChannelId: channelState.channelId,
    })
    return { valid: false, reason: "channel-id-mismatch" }
  }

  // 2. Validate currency
  if (claim.currency !== "XRP") {
    logger.warn("invalid currency", { currency: claim.currency })
    return { valid: false, reason: "invalid-currency" }
  }

  // 3. Convert sats to drops
  const amountDrops = convertSatsToDrops(claim.amountSats)

  // 4. Validate channel is open
  if (channelState.status !== "OPEN") {
    logger.warn("channel not open", { status: channelState.status })
    return { valid: false, reason: "channel-not-open" }
  }

  // 5. Check if channel has expired
  if (channelState.expiration !== undefined) {
    // Ripple epoch: seconds since 2000-01-01T00:00:00Z
    const RIPPLE_EPOCH_OFFSET = 946_684_800 // Unix time for 2000-01-01
    const nowRippleEpoch = Math.floor(Date.now() / 1000) - RIPPLE_EPOCH_OFFSET

    if (nowRippleEpoch >= channelState.expiration) {
      logger.warn("channel expired", {
        expiration: channelState.expiration,
        now: nowRippleEpoch,
      })
      return { valid: false, reason: "channel-expired" }
    }
  }

  // 6. Validate claim is monotonically increasing
  const highestClaimAmountBigInt = BigInt(channelState.highestClaimAmount)
  if (amountDrops <= highestClaimAmountBigInt) {
    logger.warn("claim not monotonically increasing", {
      claimAmount: amountDrops.toString(),
      highestClaimAmount: channelState.highestClaimAmount,
    })
    return { valid: false, reason: "claim-not-monotonic" }
  }

  // 7. Validate claim does not exceed channel balance
  const channelBalanceBigInt = BigInt(channelState.balance)
  if (amountDrops > channelBalanceBigInt) {
    logger.warn("claim exceeds channel balance", {
      claimAmount: amountDrops.toString(),
      channelBalance: channelState.balance,
    })
    return { valid: false, reason: "insufficient-balance" }
  }

  // 8. Reconstruct signature message
  let claimMessage: Uint8Array
  try {
    claimMessage = createClaimMessage(claim.channelId, amountDrops)
  } catch (error) {
    logger.error("failed to create claim message", { error })
    return { valid: false, reason: "invalid-claim-format" }
  }

  // 9. Verify Ed25519 signature
  let signatureValid: boolean
  try {
    const signatureBytes = new Uint8Array(Buffer.from(claim.signature, "hex"))
    const publicKeyBytes = new Uint8Array(
      Buffer.from(channelState.publicKey, "hex"),
    )

    // Use constant-time verification to prevent timing attacks
    signatureValid = ed25519.verify(
      signatureBytes,
      claimMessage,
      publicKeyBytes,
    )
  } catch (error) {
    logger.error("signature verification error", { error })
    return { valid: false, reason: "signature-verification-error" }
  }

  if (!signatureValid) {
    logger.warn("invalid signature", {
      channelId: claim.channelId,
      claimAmount: amountDrops.toString(),
    })
    return { valid: false, reason: "invalid-signature" }
  }

  // 10. Update channel state with new highest claim
  const updatedChannelState: XrplPaymentChannelState = {
    ...channelState,
    highestClaimAmount: amountDrops.toString(),
    highestNonce: claim.nonce,
    lastClaimTime: Date.now(),
    totalClaims: channelState.totalClaims + 1,
  }

  logger.info("payment claim verified successfully", {
    channelId: claim.channelId,
    amountSats: claim.amountSats,
    amountDrops: amountDrops.toString(),
    nonce: claim.nonce,
    totalClaims: updatedChannelState.totalClaims,
  })

  return {
    valid: true,
    amountSats: claim.amountSats,
    updatedChannelState,
  }
}
