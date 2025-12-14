import type { Client, PaymentChannelClaim, Wallet } from "xrpl"

import { settlementXrpl as logger } from "../../../../logger/instances"
import type { XrplPaymentChannelConfig } from "../config"
import type { XrplPaymentChannelState } from "../types/payment-channel-state"

/**
 * Determine if a payment channel should be settled
 *
 * @remarks
 *
 * Settlement is triggered by any of these conditions:
 * 1. Threshold reached: claim amount >= settlementThreshold
 * 2. Time-based: time since last claim >= settlementInterval
 * 3. Near expiration: expiration approaching (within settleDelay + 1 hour)
 * 4. High claim count: totalClaims >= 100 (batching efficiency)
 * 5. Channel balance low: remaining balance < minChannelBalance
 *
 * @param channel - Current channel state
 * @param config - Payment channel configuration
 * @returns True if channel should be settled now
 */
export function shouldSettleChannel(
  channel: XrplPaymentChannelState,
  config: XrplPaymentChannelConfig,
): boolean {
  const now = Math.floor(Date.now() / 1000) // Unix seconds

  // 1. Threshold reached
  const thresholdReached =
    BigInt(channel.highestClaimAmount) >= BigInt(config.settlementThreshold)

  if (thresholdReached) {
    logger.debug?.("settlement trigger: threshold reached", {
      channelId: channel.channelId,
      highestClaim: channel.highestClaimAmount,
      threshold: config.settlementThreshold,
    })
    return true
  }

  // 2. Time-based settlement
  const lastClaimSeconds = Math.floor(channel.lastClaimTime / 1000)
  const timeSinceLastClaim = now - lastClaimSeconds
  const intervalReached = timeSinceLastClaim >= config.settlementInterval

  if (intervalReached && BigInt(channel.highestClaimAmount) > 0n) {
    logger.debug?.("settlement trigger: time interval reached", {
      channelId: channel.channelId,
      timeSinceLastClaim,
      interval: config.settlementInterval,
    })
    return true
  }

  // 3. Near expiration
  if (channel.expiration !== undefined) {
    // Ripple epoch: seconds since 2000-01-01T00:00:00Z
    const RIPPLE_EPOCH_OFFSET = 946_684_800
    const nowRippleEpoch = now - RIPPLE_EPOCH_OFFSET

    // Settle if expiration is within (settleDelay + 1 hour)
    const timeUntilExpiration = channel.expiration - nowRippleEpoch
    const nearExpiration =
      timeUntilExpiration < channel.settleDelay + 3600 &&
      timeUntilExpiration > 0

    if (nearExpiration && BigInt(channel.highestClaimAmount) > 0n) {
      logger.debug?.("settlement trigger: near expiration", {
        channelId: channel.channelId,
        timeUntilExpiration,
        settleDelay: channel.settleDelay,
      })
      return true
    }
  }

  // 4. High claim count (batching efficiency)
  const highClaimCount = channel.totalClaims >= 100

  if (highClaimCount) {
    logger.debug?.("settlement trigger: high claim count", {
      channelId: channel.channelId,
      totalClaims: channel.totalClaims,
    })
    return true
  }

  // 5. Channel balance low
  const remainingBalance =
    BigInt(channel.balance) - BigInt(channel.highestClaimAmount)
  const balanceLow = remainingBalance < BigInt(config.minChannelBalance)

  if (balanceLow && BigInt(channel.highestClaimAmount) > 0n) {
    logger.debug?.("settlement trigger: low balance", {
      channelId: channel.channelId,
      remainingBalance: remainingBalance.toString(),
      minBalance: config.minChannelBalance,
    })
    return true
  }

  return false
}

export interface SettlePaymentChannelParameters {
  /**
   * XRPL client instance
   */
  client: Client

  /**
   * Relay's wallet (recipient of the payment channel)
   */
  wallet: Wallet

  /**
   * Payment channel state
   */
  channelState: XrplPaymentChannelState

  /**
   * Claim signature from sender (hex string)
   */
  claimSignature: string
}

export interface SettlePaymentChannelResult {
  /**
   * Transaction hash
   */
  txHash: string

  /**
   * Ledger index where settlement was confirmed
   */
  ledgerIndex: number

  /**
   * Amount claimed in drops
   */
  amountClaimed: string

  /**
   * Updated channel state
   */
  updatedChannelState: XrplPaymentChannelState
}

/**
 * Settle an XRP payment channel by submitting a PaymentChannelClaim transaction
 *
 * @remarks
 *
 * This function:
 * 1. Creates a PaymentChannelClaim transaction with the highest verified claim
 * 2. Submits the transaction to XRPL
 * 3. Waits for confirmation
 * 4. Updates channel state to CLOSING or CLOSED
 *
 * After settlement, the channel enters a settle delay period before it can be fully closed.
 *
 * @param parameters - Settlement parameters
 * @returns Transaction hash, ledger index, and updated channel state
 * @throws Error if transaction fails
 */
export async function settlePaymentChannel(
  parameters: SettlePaymentChannelParameters,
): Promise<SettlePaymentChannelResult> {
  const { client, wallet, channelState, claimSignature } = parameters

  logger.info("settling payment channel", {
    channelId: channelState.channelId,
    highestClaimAmount: channelState.highestClaimAmount,
    totalClaims: channelState.totalClaims,
  })

  // Validate claim amount is positive
  if (BigInt(channelState.highestClaimAmount) <= 0n) {
    throw new Error(
      `Cannot settle channel with zero claim amount: ${channelState.channelId}`,
    )
  }

  // Create PaymentChannelClaim transaction
  const transaction: PaymentChannelClaim = {
    TransactionType: "PaymentChannelClaim",
    Account: wallet.address,
    Channel: channelState.channelId,
    Amount: channelState.highestClaimAmount,
    Signature: claimSignature.toUpperCase(), // XRPL expects uppercase hex
    PublicKey: channelState.publicKey.toUpperCase(),
  }

  logger.debug?.("autofilling payment channel claim transaction", {
    transaction,
  })

  // Autofill transaction (add Fee, Sequence, LastLedgerSequence)
  const prepared = await client.autofill(transaction)

  logger.debug?.("signing payment channel claim transaction", {
    prepared,
  })

  // Sign transaction
  const signed = wallet.sign(prepared)

  logger.debug?.("submitting payment channel claim transaction", {
    hash: signed.hash,
  })

  // Submit and wait for confirmation
  const submitResult = await client.submitAndWait(signed.tx_blob)

  logger.info("payment channel claim transaction confirmed", {
    hash: signed.hash,
    result: submitResult.result.meta,
  })

  // Check if transaction succeeded
  if (submitResult.result.meta && typeof submitResult.result.meta === "object") {
    if ("TransactionResult" in submitResult.result.meta) {
      const result = submitResult.result.meta.TransactionResult
      if (result !== "tesSUCCESS") {
        throw new Error(
          `PaymentChannelClaim transaction failed: ${result as string}`,
        )
      }
    }
  }

  // Get ledger index
  const ledgerIndex =
    typeof submitResult.result.ledger_index === "number" ?
      submitResult.result.ledger_index
    : 0

  // Update channel state to CLOSING
  const updatedChannelState: XrplPaymentChannelState = {
    ...channelState,
    status: "CLOSING",
    lastClaimTime: Date.now(),
  }

  logger.info("payment channel settlement successful", {
    channelId: channelState.channelId,
    txHash: signed.hash,
    ledgerIndex,
    amountClaimed: channelState.highestClaimAmount,
  })

  return {
    txHash: signed.hash,
    ledgerIndex,
    amountClaimed: channelState.highestClaimAmount,
    updatedChannelState,
  }
}

/**
 * Handle channel expiration
 *
 * @remarks
 *
 * This function checks if a channel has expired. If expired:
 * - Status should be updated to EXPIRED
 * - No further claims can be verified
 * - Sender can recover unclaimed funds
 *
 * @param channelState - Current channel state
 * @returns True if channel is expired
 */
export function isChannelExpired(
  channelState: XrplPaymentChannelState,
): boolean {
  if (channelState.expiration === undefined) {
    return false
  }

  // Ripple epoch: seconds since 2000-01-01T00:00:00Z
  const RIPPLE_EPOCH_OFFSET = 946_684_800
  const nowRippleEpoch = Math.floor(Date.now() / 1000) - RIPPLE_EPOCH_OFFSET

  return nowRippleEpoch >= channelState.expiration
}
