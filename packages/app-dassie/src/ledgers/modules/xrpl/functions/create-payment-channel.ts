import type { Client, PaymentChannelCreate, Wallet } from "xrpl"

import { settlementXrpl as logger } from "../../../../logger/instances"
import type { XrplPaymentChannelState } from "../types/payment-channel-state"

export interface CreatePaymentChannelParameters {
  /**
   * XRPL client instance
   */
  client: Client

  /**
   * Sender's wallet (who is creating the channel)
   */
  wallet: Wallet

  /**
   * Recipient's XRP address (starts with 'r')
   */
  recipientAddress: string

  /**
   * Amount to lock in channel (in drops: 1 XRP = 1,000,000 drops)
   */
  amountDrops: string

  /**
   * Settle delay in seconds (time before channel can close after claim)
   */
  settleDelay: number

  /**
   * Optional expiration time (Ripple epoch seconds)
   *
   * @remarks
   *
   * Ripple epoch starts at 2000-01-01T00:00:00Z (946684800 Unix time).
   * If set, channel automatically closes at this time.
   */
  expiration?: number
}

export interface CreatePaymentChannelResult {
  /**
   * Payment channel ID (64-character hex string)
   */
  channelId: string

  /**
   * Transaction hash
   */
  txHash: string

  /**
   * Ledger index where transaction was confirmed
   */
  ledgerIndex: number

  /**
   * Initial channel state for tracking
   */
  channelState: XrplPaymentChannelState
}

/**
 * Create an XRP payment channel
 *
 * @remarks
 *
 * This function creates a PaymentChannelCreate transaction on the XRP Ledger,
 * submits it, waits for confirmation, and extracts the channel ID from the
 * transaction metadata.
 *
 * @param parameters - Channel creation parameters
 * @returns Channel ID, transaction hash, and initial channel state
 * @throws Error if transaction fails or channel ID cannot be extracted
 */
export async function createPaymentChannel(
  parameters: CreatePaymentChannelParameters,
): Promise<CreatePaymentChannelResult> {
  const {
    client,
    wallet,
    recipientAddress,
    amountDrops,
    settleDelay,
    expiration,
  } = parameters

  logger.info("creating payment channel", {
    sender: wallet.address,
    recipient: recipientAddress,
    amount: amountDrops,
    settleDelay,
    expiration,
  })

  // Validate recipient address
  if (!recipientAddress.startsWith("r")) {
    throw new Error(
      `Invalid recipient address: ${recipientAddress} (must start with 'r')`,
    )
  }

  // Validate amount (must be positive)
  if (BigInt(amountDrops) <= 0n) {
    throw new Error(`Invalid amount: ${amountDrops} (must be positive)`)
  }

  // Validate settle delay (must be non-negative)
  if (settleDelay < 0) {
    throw new Error(`Invalid settle delay: ${settleDelay} (must be >= 0)`)
  }

  // Create PaymentChannelCreate transaction
  const transaction: PaymentChannelCreate = {
    TransactionType: "PaymentChannelCreate",
    Account: wallet.address,
    Destination: recipientAddress,
    Amount: amountDrops,
    SettleDelay: settleDelay,
    PublicKey: wallet.publicKey,
  }

  // Add optional expiration
  if (expiration !== undefined) {
    transaction.Expiration = expiration
  }

  logger.debug?.("autofilling payment channel create transaction", {
    transaction,
  })

  // Autofill transaction (add Fee, Sequence, LastLedgerSequence)
  const prepared = await client.autofill(transaction)

  logger.debug?.("signing payment channel create transaction", {
    prepared,
  })

  // Sign transaction
  const signed = wallet.sign(prepared)

  logger.debug?.("submitting payment channel create transaction", {
    hash: signed.hash,
  })

  // Submit and wait for confirmation
  const submitResult = await client.submitAndWait(signed.tx_blob)

  logger.info("payment channel create transaction confirmed", {
    hash: signed.hash,
    result: submitResult.result.meta,
  })

  // Check if transaction succeeded
  if (submitResult.result.meta && typeof submitResult.result.meta === "object") {
    if ("TransactionResult" in submitResult.result.meta) {
      const result = submitResult.result.meta.TransactionResult
      if (result !== "tesSUCCESS") {
        throw new Error(
          `PaymentChannelCreate transaction failed: ${result as string}`,
        )
      }
    }
  }

  // Extract channel ID from CreatedNode in metadata
  let channelId: string | undefined

  if (
    submitResult.result.meta &&
    typeof submitResult.result.meta === "object" &&
    "AffectedNodes" in submitResult.result.meta &&
    Array.isArray(submitResult.result.meta.AffectedNodes)
  ) {
    for (const node of submitResult.result.meta.AffectedNodes) {
      if (
        "CreatedNode" in node &&
        node.CreatedNode.LedgerEntryType === "PayChannel"
      ) {
        // Channel ID is the LedgerIndex of the created PayChannel entry
        if ("LedgerIndex" in node.CreatedNode) {
          channelId = node.CreatedNode.LedgerIndex as string
          break
        }
      }
    }
  }

  if (!channelId) {
    throw new Error(
      "Failed to extract channel ID from transaction metadata. Transaction succeeded but channel ID not found.",
    )
  }

  // Get ledger index
  const ledgerIndex =
    typeof submitResult.result.ledger_index === "number" ?
      submitResult.result.ledger_index
    : 0

  // Create initial channel state
  const now = Date.now()
  const channelState: XrplPaymentChannelState = {
    channelId,
    sender: wallet.address,
    recipient: recipientAddress,
    amount: amountDrops,
    balance: amountDrops, // Initially, balance equals amount
    settleDelay,
    expiration,
    publicKey: wallet.publicKey,
    highestClaimAmount: "0",
    highestNonce: 0,
    status: "OPEN",
    lastClaimTime: now,
    totalClaims: 0,
    createdAt: now,
  }

  logger.info("payment channel created successfully", {
    channelId,
    txHash: signed.hash,
    ledgerIndex,
  })

  return {
    channelId,
    txHash: signed.hash,
    ledgerIndex,
    channelState,
  }
}
