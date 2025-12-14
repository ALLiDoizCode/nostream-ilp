import { castLedgerId } from "../../../accounting/utils/cast-ledger-id"
import { settlementCronos as logger } from "../../../logger/instances"
import type { SettlementSchemeModule } from "../../types/settlement-scheme-module"
import { createCronosClient } from "./client"
import { loadCronosConfig, validateCronosConfig } from "./config"
import { createCronosSettlementEngine } from "./functions/settlement-engine"
import type { CronosChannelState } from "./types/peer-state"

const LEDGER_ID = castLedgerId("akt+cronos-testnet+akt")

/**
 * Cronos testnet settlement module for Dassie.
 *
 * @remarks
 *
 * This module enables settlement via Cronos testnet using AKT ERC-20 tokens.
 * Uses payment channels for off-chain claims with on-chain settlement.
 *
 * **CRITICAL:** AKT uses 6 decimals, not 18 like ETH. All amounts must be converted correctly.
 *
 * **WARNING** This module is for testing only. Do NOT use with mainnet funds.
 */
const cronosTestnetModule = {
  name: "akt+cronos-testnet+akt",
  supportedVersions: [1],
  realm: "test",

  ledger: LEDGER_ID,

  behavior: async ({ host }) => {
    logger.info("initializing Cronos testnet settlement module")

    // Load and validate configuration
    const config = loadCronosConfig()

    try {
      validateCronosConfig(config)
    } catch (error) {
      logger.error("Invalid Cronos settlement configuration", { error })
      logger.warn(
        "Cronos settlement will not work until configuration is corrected",
      )

      // Return stub implementation if configuration is invalid
      return createStubImplementation()
    }

    if (!config.enabled) {
      logger.info("Cronos settlement module disabled in configuration")
      return createStubImplementation()
    }

    // Initialize Cronos RPC client
    let cronosClient
    try {
      cronosClient = await createCronosClient(config)

      logger.info("Cronos RPC client connected", {
        contractAddress: config.contractAddress,
        aktTokenAddress: config.aktTokenAddress,
        relayAddress: cronosClient.relayAddress,
        network: "Cronos Testnet",
        chainId: config.chainId,
      })

      // Check AKT token balance if relay has any funds
      // (This would only happen if operator deposited funds for outgoing settlements)
      // For MVP, we focus on incoming settlements only
    } catch (error) {
      logger.error("Failed to connect to Cronos RPC", { error })
      logger.warn("Cronos settlement will not work until RPC is accessible")
      return createStubImplementation()
    }

    // Create and return the settlement engine
    return await createCronosSettlementEngine({
      client: cronosClient,
      host,
      ledgerId: LEDGER_ID,
      config,
    })
  },
} satisfies SettlementSchemeModule<CronosChannelState>

/**
 * Create a stub implementation for when Cronos RPC is unavailable.
 */
function createStubImplementation() {
  const stubPeerState: CronosChannelState = {
    channelId: "",
    sender: "",
    recipient: "",
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
      // Stub: no-op when Cronos RPC unavailable
    },
    handleMessage: async () => {
      // Stub: no-op when Cronos RPC unavailable
    },
    handleDeposit: async () => {
      // Stub: no-op when Cronos RPC unavailable
    },
    getBalance: () => 0n,
  }
  /* eslint-enable @typescript-eslint/require-await */
}

export default cronosTestnetModule
