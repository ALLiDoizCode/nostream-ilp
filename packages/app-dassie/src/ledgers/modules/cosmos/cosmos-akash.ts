import { castLedgerId } from "../../../accounting/utils/cast-ledger-id"
import { settlementCosmos as logger } from "../../../logger/instances"
import type { SettlementSchemeModule } from "../../types/settlement-scheme-module"
import { createCosmosClient } from "./client"
import { loadCosmosConfig, validateCosmosConfig } from "./config"
import { createCosmosSettlementEngine } from "./functions/settlement-engine"
import type { CosmosPeerState } from "./types/peer-state"

const LEDGER_ID = castLedgerId("akt+cosmos-akash+akt")

/**
 * Cosmos/Akash settlement module for Dassie.
 *
 * @remarks
 *
 * This module enables settlement via Cosmos SDK on Akash Network.
 * Uses direct IBC bank transfers instead of payment channels.
 *
 * **WARNING** This module is configured for testnet by default. Change realm to 'main' for production.
 */
const cosmosAkashModule = {
  name: "akt+cosmos-akash+akt",
  supportedVersions: [1],
  realm: "test" as const,

  ledger: LEDGER_ID,

  behavior: async ({ host }) => {
    logger.info("initializing Cosmos/Akash settlement module")

    // Load and validate configuration
    const config = loadCosmosConfig()

    try {
      validateCosmosConfig(config)
    } catch (error) {
      logger.error("Invalid Cosmos settlement configuration", { error })
      logger.warn(
        "Cosmos settlement will not work until configuration is corrected",
      )

      // Return stub implementation if configuration is invalid
      return createStubImplementation()
    }

    if (!config.enabled) {
      logger.info("Cosmos settlement module disabled in configuration")
      return createStubImplementation()
    }

    // Initialize Cosmos RPC client
    let cosmosClient
    try {
      cosmosClient = await createCosmosClient(config)

      logger.info("Cosmos RPC client connected", {
        relayAddress: cosmosClient.relayAddress,
        network: config.network,
      })
    } catch (error) {
      logger.error("Failed to connect to Cosmos RPC", { error })
      logger.warn("Cosmos settlement will not work until RPC is accessible")
      return createStubImplementation()
    }

    // Create and return the settlement engine
    return await createCosmosSettlementEngine({
      client: cosmosClient,
      host,
      ledgerId: LEDGER_ID,
      config,
    })
  },
} satisfies SettlementSchemeModule<CosmosPeerState>

/**
 * Create a stub implementation for when Cosmos RPC is unavailable.
 */
function createStubImplementation() {
  const stubPeerState: CosmosPeerState = {
    peerAddress: "",
    relayAddress: "",
    totalReceived: "0",
    denom: "uakt",
    lastSettlementTime: 0,
    settlementCount: 0,
  }

  /* eslint-disable @typescript-eslint/require-await */
  return {
    getPeeringInfo: async () => ({
      data: new Uint8Array(0),
    }),
    createPeeringRequest: async () => ({
      data: new Uint8Array(0),
    }),
    acceptPeeringRequest: async () => ({
      peeringResponseData: new Uint8Array(0),
      peerState: stubPeerState,
    }),
    finalizePeeringRequest: async () => ({
      peerState: stubPeerState,
    }),
    prepareSettlement: async () => ({
      message: new Uint8Array(0),
      settlementId: "stub",
      execute: async () => ({}),
    }),
    handleSettlement: async () => {},
    handleMessage: async () => {},
    handleDeposit: async () => {},
    getBalance: () => BigInt(0),
  }
  /* eslint-enable @typescript-eslint/require-await */
}

export default cosmosAkashModule
