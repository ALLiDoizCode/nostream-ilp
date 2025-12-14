import { keccak256, recoverMessageAddress, type Hex } from "viem"
import { settlementCronos as logger } from "../../../../logger/instances"
import type { LedgerId } from "../../../../accounting/constants/ledgers"
import type {
  SettlementSchemeActorMethods,
  SettlementSchemeHostMethods,
} from "../../../types/settlement-scheme-module"
import type { NodeId } from "../../../../peer-protocol/types/node-id"
import type { CronosRpcClient } from "../client"
import type { CronosSettlementConfig } from "../config"
import type { CronosChannelState } from "../types/peer-state"

export interface CreateSettlementEngineParameters {
  client: CronosRpcClient
  host: SettlementSchemeHostMethods
  ledgerId: LedgerId
  config: CronosSettlementConfig
}

/**
 * Create the Cronos settlement engine actor.
 *
 * @remarks
 * This implements the SettlementSchemeActorMethods interface for Cronos with AKT tokens.
 * CRITICAL: AKT uses 6 decimals, claim amounts must be converted appropriately.
 */
export async function createCronosSettlementEngine(
  parameters: CreateSettlementEngineParameters,
): Promise<SettlementSchemeActorMethods<CronosChannelState>> {
  const { client, host, ledgerId, config: _config } = parameters

  // In-memory peer state store (keyed by NodeId)
  const peerStates = new Map<string, CronosChannelState>()

  /**
   * Get peering info for this settlement scheme.
   */
  async function getPeeringInfo() {
    // Return the relay's Ethereum address as peering info
    const addressBytes = Buffer.from(
      client.relayAddress.slice(2), // Remove 0x prefix
      "hex",
    )

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

    // For now, we don't need to send additional data beyond the peering info
    // In a production system, this could include:
    // - Proof of relay's Ethereum address ownership
    // - Minimum channel capacity requirements
    // - Fee structure
    return {
      data: new Uint8Array(0),
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

    // For Cronos, we don't require the peer to open a channel immediately
    // They can do so later via openChannel RPC call
    // Create initial peer state
    const peerState: CronosChannelState = {
      channelId: "", // Will be set when channel is opened
      sender: "", // Will be set when channel is opened
      recipient: client.relayAddress,
      balance: 0n,
      highestNonce: 0,
      highestClaimAmount: 0n,
      expiration: 0,
      isClosed: false,
      lastClaimTime: Date.now(),
      totalClaims: 0,
      createdAt: Date.now(),
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

    // Create initial peer state
    const peerState: CronosChannelState = {
      channelId: "",
      sender: "",
      recipient: client.relayAddress,
      balance: 0n,
      highestNonce: 0,
      highestClaimAmount: 0n,
      expiration: 0,
      isClosed: false,
      lastClaimTime: Date.now(),
      totalClaims: 0,
      createdAt: Date.now(),
    }

    peerStates.set(parameters.peerId, peerState)

    return {
      peerState,
    }
  }

  /**
   * Prepare a settlement transaction (outgoing payment to peer).
   */
  async function prepareSettlement(parameters: {
    amount: bigint
    peerId: NodeId
    peerState: CronosChannelState
  }) {
    logger.info("preparing settlement", {
      amount: parameters.amount.toString(),
      peerId: parameters.peerId,
    })

    const settlementId = `cronos-settlement-${Date.now()}-${parameters.peerId}`

    // For Cronos, outgoing settlements would require us to open a channel to the peer
    // and send them payment claims. This is not implemented in the MVP.
    // For now, return a stub implementation.

    return {
      message: new Uint8Array(0),
      settlementId,
      execute: async () => {
        logger.warn("outgoing settlements not yet implemented for Cronos")
        return {}
      },
    }
  }

  /**
   * Handle an incoming settlement (payment from peer).
   */
  async function handleSettlement(parameters: {
    amount: bigint
    peerId: NodeId
    settlementSchemeData: Uint8Array
    peerState: CronosChannelState
  }) {
    logger.info("handling incoming settlement", {
      amount: parameters.amount.toString(),
      peerId: parameters.peerId,
    })

    // Incoming settlement means the peer is closing their channel
    // and we're receiving the final claim amount on-chain

    // Report the incoming settlement to Dassie
    host.reportIncomingSettlement({
      ledgerId,
      peerId: parameters.peerId,
      amount: parameters.amount,
    })

    // Mark channel as closed
    const updatedState = { ...parameters.peerState, isClosed: true }
    peerStates.set(parameters.peerId, updatedState)
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

    // Messages could include:
    // - Payment claims (off-chain)
    // - Channel state updates
    // - Settlement negotiations
    // For MVP, we handle claims via RPC instead
  }

  /**
   * Handle a deposit by the relay operator.
   */
  async function handleDeposit(parameters: { amount: bigint }) {
    logger.info("handling deposit", { amount: parameters.amount.toString() })

    // Report deposit to Dassie's internal ledger
    host.reportDeposit({
      ledgerId,
      amount: parameters.amount,
    })
  }

  /**
   * Get the current balance available for settlement.
   */
  function getBalance(): bigint {
    // Sum up all unclaimed balances from open channels
    let totalBalance = 0n

    for (const peerState of peerStates.values()) {
      if (!peerState.isClosed && peerState.balance > 0n) {
        // Balance minus highest claim is the unclaimed amount
        totalBalance += peerState.balance - peerState.highestClaimAmount
      }
    }

    return totalBalance
  }

  /**
   * Verify a payment claim from a peer (off-chain signature verification).
   *
   * @remarks
   * This is the core claim verification logic that matches the Solidity contract.
   */
  async function verifyPaymentClaim(parameters: {
    peerId: NodeId
    channelId: Hex
    claimAmount: bigint
    nonce: number
    signature: Hex
  }): Promise<{ valid: boolean; reason?: string }> {
    const peerState = peerStates.get(parameters.peerId)

    if (!peerState) {
      return { valid: false, reason: "peer-not-found" }
    }

    if (peerState.channelId !== parameters.channelId) {
      return { valid: false, reason: "channel-id-mismatch" }
    }

    if (peerState.isClosed) {
      return { valid: false, reason: "channel-closed" }
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (now > peerState.expiration) {
      return { valid: false, reason: "channel-expired" }
    }

    // Check nonce monotonicity
    if (parameters.nonce <= peerState.highestNonce) {
      return { valid: false, reason: "nonce-not-monotonic" }
    }

    // Check claim amount doesn't exceed balance
    if (parameters.claimAmount > peerState.balance) {
      return { valid: false, reason: "insufficient-balance" }
    }

    // Verify signature (matches Solidity signature format)
    try {
      // Reconstruct message hash (same as Solidity)
      const packedData = Buffer.concat([
        Buffer.from(parameters.channelId.slice(2), "hex"), // bytes32
        Buffer.from(parameters.claimAmount.toString(16).padStart(64, "0"), "hex"), // uint256
        Buffer.from(parameters.nonce.toString(16).padStart(64, "0"), "hex"), // uint256
      ])
      const messageHash = keccak256(
        `0x${packedData.toString("hex")}` as Hex,
      )

      // Recover signer address from signature
      const recoveredAddress = await recoverMessageAddress({
        message: { raw: messageHash },
        signature: parameters.signature,
      })

      // Verify signer matches channel sender
      if (
        recoveredAddress.toLowerCase() !== peerState.sender.toLowerCase()
      ) {
        return { valid: false, reason: "invalid-signature" }
      }

      // Claim is valid! Update peer state
      const updatedState: CronosChannelState = {
        ...peerState,
        highestNonce: parameters.nonce,
        highestClaimAmount: parameters.claimAmount,
        lastClaimTime: Date.now(),
        totalClaims: peerState.totalClaims + 1,
      }

      peerStates.set(parameters.peerId, updatedState)

      logger.info("claim verified successfully", {
        peerId: parameters.peerId,
        channelId: parameters.channelId,
        claimAmount: parameters.claimAmount.toString(),
        nonce: parameters.nonce,
      })

      // Report revenue to Dassie's internal ledger
      // CRITICAL: claimAmount is in AKT (6 decimals), not ETH (18 decimals)
      host.reportIncomingSettlement({
        ledgerId,
        peerId: parameters.peerId,
        amount: parameters.claimAmount - peerState.highestClaimAmount,
      })

      return { valid: true }
    } catch (error) {
      logger.error("signature verification failed", { error })
      return { valid: false, reason: "signature-verification-error" }
    }
  }

  // Return the settlement engine actor methods
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
    // Export the verification function for RPC use
    verifyPaymentClaim,
  } as SettlementSchemeActorMethods<CronosChannelState> & {
    verifyPaymentClaim: typeof verifyPaymentClaim
  }
}
