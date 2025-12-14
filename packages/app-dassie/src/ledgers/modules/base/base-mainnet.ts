import { castLedgerId } from "../../../accounting/utils/cast-ledger-id"
import { settlementBaseMainnet as logger } from "../../../logger/instances"
import type { SettlementSchemeModule } from "../../types/settlement-scheme-module"
import { createBaseClient } from "./client"
import { loadBaseMainnetConfig, validateBaseConfig } from "./config"
import { createBaseSettlementEngine } from "./functions/settlement-engine"
import type { BaseChannelState } from "./types/peer-state"

const LEDGER_ID = castLedgerId("eth+base+eth")

/**
 * Base L2 (mainnet) settlement module for Dassie.
 *
 * @remarks
 *
 * This module enables settlement via Ethereum Base L2 on mainnet.
 * Uses payment channels for off-chain claims with on-chain settlement.
 * Supports both native ETH and ERC-20 tokens (USDC).
 *
 * **WARNING** This module handles real money. Ensure proper security practices.
 */
const baseMainnetModule = {
  name: "eth+base+eth",
  supportedVersions: [1],
  realm: "live" as const,

  ledger: LEDGER_ID,

  behavior: async ({ host }) => {
    logger.info("initializing Base L2 mainnet settlement module")

    // Load and validate configuration
    const config = loadBaseMainnetConfig()

    try {
      validateBaseConfig(config)
    } catch (error) {
      logger.error("Invalid Base mainnet settlement configuration", { error })
      logger.warn(
        "Base mainnet settlement will not work until configuration is corrected",
      )

      // Return stub implementation if configuration is invalid
      return createStubImplementation()
    }

    if (!config.enabled) {
      logger.info("Base mainnet settlement module disabled in configuration")
      return createStubImplementation()
    }

    // Initialize Base RPC client
    let baseClient
    try {
      baseClient = await createBaseClient(config)

      logger.info("Base mainnet RPC client connected", {
        contractAddress: config.contractAddress,
        relayAddress: baseClient.relayAddress,
        network: "Base Mainnet",
      })

      // Check initial balance if relay has any funds in the contract
      // (This would only happen if operator deposited funds for outgoing settlements)
      // For MVP, we focus on incoming settlements only
    } catch (error) {
      logger.error("Failed to connect to Base mainnet RPC", { error })
      logger.warn(
        "Base mainnet settlement will not work until RPC is accessible",
      )
      return createStubImplementation()
    }

    // Create and return the settlement engine
    return await createBaseSettlementEngine({
      client: baseClient,
      host,
      ledgerId: LEDGER_ID,
      config,
    })
  },
} satisfies SettlementSchemeModule<BaseChannelState>

/**
 * Create a stub implementation for when Base mainnet RPC is unavailable.
 */
function createStubImplementation() {
  const stubPeerState: BaseChannelState = {
    channelId: "",
    sender: "",
    recipient: "",
    tokenAddress: "",
    balance: 0n,
    highestNonce: 0,
    highestClaimAmount: 0n,
    expiration: 0,
    isClosed: true,
    lastClaimTime: 0,
    totalClaims: 0,
    createdAt: 0,
  }

  /* eslint-disable @typescript-eslint/require-await */
  return {
    getPeeringInfo: async () => ({ data: new Uint8Array(42) }), // Ethereum address size
    createPeeringRequest: async () => ({ data: new Uint8Array(0) }),
    acceptPeeringRequest: async () => false as const,
    finalizePeeringRequest: async () => ({ peerState: stubPeerState }),
    prepareSettlement: async () => ({
      message: new Uint8Array(0),
      settlementId: "",
      execute: async () => ({}),
    }),
    handleSettlement: async () => {
      // Stub: no-op when Base mainnet RPC unavailable
    },
    handleMessage: async () => {
      // Stub: no-op when Base mainnet RPC unavailable
    },
    handleDeposit: async () => {
      // Stub: no-op when Base mainnet RPC unavailable
    },
    getBalance: () => 0n,
  }
  /* eslint-enable @typescript-eslint/require-await */
}

export default baseMainnetModule
