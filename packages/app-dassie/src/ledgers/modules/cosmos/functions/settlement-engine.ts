import { settlementCosmos as logger } from "../../../../logger/instances"
import type { LedgerId } from "../../../../accounting/constants/ledgers"
import type {
  SettlementSchemeActorMethods,
  SettlementSchemeHostMethods,
} from "../../../types/settlement-scheme-module"
import type { NodeId } from "../../../../peer-protocol/types/node-id"
import type { CosmosConfig } from "../config"
import type { CosmosRpcClient } from "../client"
import type { CosmosPeerState } from "../types/peer-state"
import {
  sendPayment,
  verifyTransaction,
  updatePeerStateAfterSettlement,
} from "./channel-operations"

export interface SettlementClaim {
  /** Transaction hash of the settlement */
  txHash: string

  /** Amount claimed in standardized sats (will be converted to uakt) */
  amountSats: number

  /** Currency (must be 'AKT') */
  currency: "AKT"

  /** Optional metadata */
  nostrEventId?: string
  nostrEventKind?: number
  timestamp?: number
}

export interface VerifySettlementResult {
  /** Whether settlement is valid */
  valid: boolean

  /** Reason for rejection (if invalid) */
  reason?: string

  /** Amount in sats (if valid) */
  amountSats?: number

  /** Sender address (if valid) */
  sender?: string
}

/**
 * Verify a settlement claim by checking the on-chain transaction.
 *
 * This replaces the payment channel signature verification with direct
 * transaction verification on the Akash blockchain.
 *
 * @param claim - Settlement claim to verify
 * @param peerStateMap - Map of peer states
 * @param client - Cosmos RPC client
 * @param relayAddress - Expected recipient address (relay)
 * @returns Verification result
 */
export async function verifySettlementClaim(
  claim: SettlementClaim,
  peerStateMap: Map<string, CosmosPeerState>,
  client: CosmosRpcClient,
  relayAddress: string,
): Promise<VerifySettlementResult> {
  logger.info("verifying settlement claim", {
    txHash: claim.txHash,
    amountSats: claim.amountSats,
  })

  // Convert amountSats to uakt
  // TODO: Implement actual conversion rate (for MVP, assume 1:1 or use fixed rate)
  const minAmountUakt = claim.amountSats.toString()

  // Verify the transaction on-chain
  const verifyResult = await verifyTransaction(client, {
    txHash: claim.txHash,
    expectedRecipient: relayAddress,
    minAmount: minAmountUakt,
  })

  if (!verifyResult.valid) {
    return {
      valid: false,
      reason: verifyResult.reason,
    }
  }

  // Get or create peer state
  const sender = verifyResult.sender!
  let peerState = peerStateMap.get(sender)

  if (!peerState) {
    // Create new peer state
    peerState = {
      peerAddress: sender,
      relayAddress: relayAddress,
      totalReceived: "0",
      denom: "uakt",
      lastSettlementTime: 0,
      settlementCount: 0,
    }
  }

  // Update peer state
  const updatedState = updatePeerStateAfterSettlement(
    peerState,
    verifyResult.amount!,
  )
  peerStateMap.set(sender, updatedState)

  logger.info("settlement claim verified successfully", {
    txHash: claim.txHash,
    sender,
    amount: verifyResult.amount,
    totalReceived: updatedState.totalReceived,
  })

  return {
    valid: true,
    amountSats: claim.amountSats,
    sender,
  }
}

export interface CreateSettlementEngineParameters {
  client: CosmosRpcClient
  host: SettlementSchemeHostMethods
  ledgerId: LedgerId
  config: CosmosConfig
}

/**
 * Create the Cosmos/Akash settlement engine actor.
 *
 * @remarks
 * This implements the SettlementSchemeActorMethods interface for Cosmos/Akash.
 * Uses direct IBC bank transfers instead of payment channels.
 */
export async function createCosmosSettlementEngine(
  parameters: CreateSettlementEngineParameters,
): Promise<SettlementSchemeActorMethods<CosmosPeerState>> {
  const { client, host, ledgerId } = parameters

  // In-memory peer state store (keyed by NodeId or Cosmos address)
  const peerStates = new Map<string, CosmosPeerState>()

  /**
   * Get peering info for this settlement scheme.
   */
  async function getPeeringInfo() {
    // Return the relay's Cosmos address as peering info
    const addressBytes = Buffer.from(client.relayAddress, "utf8")

    return {
      data: new Uint8Array(addressBytes),
    }
  }

  /**
   * Create a peering request to send to a peer.
   */
  async function createPeeringRequest(parameters: {
    peerId: NodeId
    peeringInfo: Uint8Array
  }) {
    logger.info("creating peering request", { peerId: parameters.peerId })

    // Extract peer's Cosmos address from peering info
    const peerAddress = Buffer.from(parameters.peeringInfo).toString("utf8")

    return {
      data: new Uint8Array(Buffer.from(peerAddress, "utf8")),
    }
  }

  /**
   * Accept an incoming peering request from another node.
   */
  async function acceptPeeringRequest(parameters: {
    peerId: NodeId
    data: Uint8Array
  }) {
    logger.info("accepting peering request", { peerId: parameters.peerId })

    // Extract peer's Cosmos address from data
    const peerAddress = Buffer.from(parameters.data).toString("utf8")

    // Create initial peer state
    const peerState: CosmosPeerState = {
      peerAddress,
      relayAddress: client.relayAddress,
      totalReceived: "0",
      denom: "uakt",
      lastSettlementTime: Math.floor(Date.now() / 1000),
      settlementCount: 0,
    }

    peerStates.set(parameters.peerId, peerState)

    return {
      peeringResponseData: new Uint8Array(0),
      peerState,
    }
  }

  /**
   * Finalize our peering request after the peer accepted it.
   */
  async function finalizePeeringRequest(parameters: {
    peerId: NodeId
    peeringInfo: Uint8Array
    data: Uint8Array
  }) {
    logger.info("finalizing peering request", { peerId: parameters.peerId })

    // Extract peer's Cosmos address from peering info
    const peerAddress = Buffer.from(parameters.peeringInfo).toString("utf8")

    const peerState: CosmosPeerState = {
      peerAddress,
      relayAddress: client.relayAddress,
      totalReceived: "0",
      denom: "uakt",
      lastSettlementTime: Math.floor(Date.now() / 1000),
      settlementCount: 0,
    }

    peerStates.set(parameters.peerId, peerState)

    return {
      peerState,
    }
  }

  /**
   * Prepare a settlement transaction (outgoing payment to peer).
   *
   * For Akash, this sends a direct bank transfer.
   */
  async function prepareSettlement(parameters: {
    amount: bigint
    peerId: NodeId
    peerState: CosmosPeerState
  }) {
    logger.info("preparing settlement", {
      amount: parameters.amount.toString(),
      peerId: parameters.peerId,
    })

    const settlementId = `cosmos-settlement-${Date.now()}-${parameters.peerId}`

    return {
      message: new Uint8Array(0),
      settlementId,
      execute: async () => {
        // Send direct bank transfer to peer
        const result = await sendPayment(client, {
          recipient: parameters.peerState.peerAddress,
          amount: parameters.amount.toString(),
          memo: `ILP settlement ${settlementId}`,
        })

        logger.info("settlement sent", {
          settlementId,
          txHash: result.txHash,
          amount: result.amount,
        })

        return {
          txHash: result.txHash,
        }
      },
    }
  }

  /**
   * Handle an incoming settlement (payment from peer).
   *
   * For Akash, this verifies the transaction and updates peer state.
   */
  async function handleSettlement(parameters: {
    amount: bigint
    peerId: NodeId
    settlementSchemeData: Uint8Array
    peerState: CosmosPeerState
  }) {
    logger.info("handling incoming settlement", {
      amount: parameters.amount.toString(),
      peerId: parameters.peerId,
    })

    // Extract transaction hash from settlement data
    const txHash = Buffer.from(parameters.settlementSchemeData).toString("utf8")

    // Verify the settlement claim
    const verifyResult = await verifySettlementClaim(
      {
        txHash,
        amountSats: Number(parameters.amount),
        currency: "AKT",
      },
      peerStates,
      client,
      client.relayAddress,
    )

    if (!verifyResult.valid) {
      logger.error("settlement verification failed", {
        reason: verifyResult.reason,
      })
      throw new Error(`Settlement verification failed: ${verifyResult.reason}`)
    }

    // Report the incoming settlement to Dassie
    host.reportIncomingSettlement({
      ledgerId,
      peerId: parameters.peerId,
      amount: parameters.amount,
    })

    logger.info("settlement processed successfully", {
      peerId: parameters.peerId,
      amount: parameters.amount.toString(),
    })
  }

  /**
   * Handle a message from a peer.
   */
  async function handleMessage(parameters: {
    peerId: NodeId
    message: Uint8Array
  }) {
    logger.info("handling message from peer", {
      peerId: parameters.peerId,
      messageLength: parameters.message.length,
    })

    // Messages handled via RPC in MVP
  }

  /**
   * Handle a deposit by the relay operator.
   */
  async function handleDeposit(parameters: { amount: bigint }) {
    logger.info("handling deposit", { amount: parameters.amount.toString() })

    host.reportDeposit({
      ledgerId,
      amount: parameters.amount,
    })
  }

  /**
   * Get the current balance available for settlement.
   *
   * For Akash, this queries the relay's on-chain balance.
   */
  function getBalance(): bigint {
    // TODO: Query actual on-chain balance
    // For now, return 0 as placeholder
    return 0n
  }

  return {
    getPeeringInfo,
    createPeeringRequest,
    acceptPeeringRequest,
    finalizePeeringRequest,
    prepareSettlement,
    handleSettlement,
    handleMessage,
    handleDeposit,
    getBalance,
  }
}
