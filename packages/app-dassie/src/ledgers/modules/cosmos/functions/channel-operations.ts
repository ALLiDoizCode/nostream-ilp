import { coin } from "@cosmjs/stargate"

import { settlementCosmos as logger } from "../../../../logger/instances"
import type { CosmosRpcClient } from "../client"
import type { CosmosPeerState } from "../types/peer-state"

export interface SendPaymentParams {
  /** Recipient Cosmos address */
  recipient: string

  /** Amount to send (uakt) */
  amount: string

  /** Optional memo for transaction */
  memo?: string
}

export interface SendPaymentResult {
  /** Transaction hash */
  txHash: string

  /** Block height */
  height: number

  /** Amount sent (uakt) */
  amount: string
}

export interface VerifyTransactionParams {
  /** Transaction hash to verify */
  txHash: string

  /** Expected recipient address (relay address) */
  expectedRecipient: string

  /** Minimum amount expected (uakt) */
  minAmount?: string
}

export interface VerifyTransactionResult {
  /** Whether transaction is valid */
  valid: boolean

  /** Sender address */
  sender?: string

  /** Amount received (uakt) */
  amount?: string

  /** Reason for rejection (if invalid) */
  reason?: string
}

/**
 * Send a direct bank transfer on Akash network.
 *
 * @param client - Cosmos RPC client
 * @param params - Payment parameters
 * @returns Transaction hash and details
 */
export async function sendPayment(
  client: CosmosRpcClient,
  params: SendPaymentParams,
): Promise<SendPaymentResult> {
  logger.info("sending direct Akash payment", {
    recipient: params.recipient,
    amount: params.amount,
  })

  // Create bank transfer message
  const amount = [coin(params.amount, "uakt")]

  // Send transaction
  const result = await client.client.sendTokens(
    client.relayAddress,
    params.recipient,
    amount,
    "auto", // Auto-calculate gas
    params.memo || "ILP settlement",
  )

  logger.info("payment sent successfully", {
    txHash: result.transactionHash,
    height: result.height,
  })

  return {
    txHash: result.transactionHash,
    height: result.height,
    amount: params.amount,
  }
}

/**
 * Verify that a transaction was received by the relay.
 *
 * This queries the transaction by hash and validates:
 * - Transaction succeeded
 * - Funds were sent to the expected recipient (relay address)
 * - Amount meets minimum threshold
 *
 * @param client - Cosmos RPC client
 * @param params - Verification parameters
 * @returns Verification result with sender and amount
 */
export async function verifyTransaction(
  client: CosmosRpcClient,
  params: VerifyTransactionParams,
): Promise<VerifyTransactionResult> {
  logger.info("verifying transaction", {
    txHash: params.txHash,
    expectedRecipient: params.expectedRecipient,
  })

  try {
    // Query transaction by hash
    const tx = await client.client.getTx(params.txHash)

    if (!tx) {
      return {
        valid: false,
        reason: "Transaction not found",
      }
    }

    // Check if transaction succeeded
    if (tx.code !== 0) {
      return {
        valid: false,
        reason: `Transaction failed with code ${tx.code}`,
      }
    }

    // Parse transaction to find bank send message
    let sender: string | undefined
    let recipient: string | undefined
    let amount: string | undefined

    // Look for transfer events in transaction logs
    for (const event of tx.events) {
      if (event.type === "transfer" || event.type === "coin_received") {
        // Extract recipient and amount from attributes
        for (const attr of event.attributes) {
          if (attr.key === "recipient" || attr.key === "receiver") {
            recipient = attr.value
          }
          if (attr.key === "amount") {
            // Amount format: "1000000uakt"
            const amountMatch = attr.value.match(/^(\d+)uakt$/)
            if (amountMatch) {
              amount = amountMatch[1]
            }
          }
          if (attr.key === "sender") {
            sender = attr.value
          }
        }
      }
    }

    if (!recipient || !amount) {
      return {
        valid: false,
        reason: "Could not parse transaction recipient or amount",
      }
    }

    // Verify recipient matches expected relay address
    if (recipient !== params.expectedRecipient) {
      return {
        valid: false,
        reason: `Recipient mismatch: expected ${params.expectedRecipient}, got ${recipient}`,
      }
    }

    // Verify amount meets minimum threshold (if specified)
    if (params.minAmount) {
      const amountBigInt = BigInt(amount)
      const minAmountBigInt = BigInt(params.minAmount)

      if (amountBigInt < minAmountBigInt) {
        return {
          valid: false,
          reason: `Amount ${amount} is less than minimum ${params.minAmount}`,
        }
      }
    }

    logger.info("transaction verified successfully", {
      txHash: params.txHash,
      sender,
      amount,
    })

    return {
      valid: true,
      sender: sender!,
      amount: amount!,
    }
  } catch (error) {
    logger.error("transaction verification failed", { error })
    return {
      valid: false,
      reason: `Verification error: ${error}`,
    }
  }
}

/**
 * Update peer state after receiving a verified settlement.
 *
 * @param peerState - Peer state to update
 * @param amount - Amount received (uakt)
 * @returns Updated peer state
 */
export function updatePeerStateAfterSettlement(
  peerState: CosmosPeerState,
  amount: string,
): CosmosPeerState {
  const currentTotal = BigInt(peerState.totalReceived)
  const newAmount = BigInt(amount)
  const newTotal = currentTotal + newAmount

  return {
    ...peerState,
    totalReceived: newTotal.toString(),
    lastSettlementTime: Math.floor(Date.now() / 1000),
    settlementCount: peerState.settlementCount + 1,
  }
}
