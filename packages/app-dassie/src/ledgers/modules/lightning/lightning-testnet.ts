import { castLedgerId } from "../../../accounting/utils/cast-ledger-id"
import { settlementLightning as logger } from "../../../logger/instances"
import type { SettlementSchemeModule } from "../../types/settlement-scheme-module"
import { createLightningClient } from "./client"
import { CreateLightningSettlementEngine } from "./functions/create-settlement-engine"
import type { LightningPeerState } from "./types/peer-state"

const LEDGER_ID = castLedgerId("btc+lightning-testnet+btc")

/**
 * Lightning Network testnet settlement module for Dassie.
 *
 * @remarks
 *
 * This module enables settlement via Bitcoin Lightning Network on testnet.
 * Uses Core Lightning (CLN) for channel management and payments.
 *
 * **WARNING** This module is for testing only. Do NOT use with mainnet funds.
 */
const lightningTestnet = {
  name: "btc+lightning-testnet+btc",
  supportedVersions: [1],
  realm: "test",

  ledger: LEDGER_ID,

  behavior: async ({ sig, host }) => {
    logger.info("initializing lightning testnet settlement module")

    const createSettlementEngine = sig.reactor.use(CreateLightningSettlementEngine)

    // Initialize Lightning client
    let lightningClient
    try {
      lightningClient = await createLightningClient({ network: "testnet" })

      const nodeInfo = await lightningClient.getInfo()
      logger.info("Lightning node connected", {
        nodeId: nodeInfo.id,
        alias: nodeInfo.alias,
        network: nodeInfo.network,
        channels: nodeInfo.numActiveChannels,
      })

      // Report initial balance
      const initialBalance = await lightningClient.getBalance()
      if (initialBalance > 0n) {
        // Convert sats to internal units (scale 9)
        const balanceInternal = initialBalance * 10n
        host.reportDeposit({ ledgerId: LEDGER_ID, amount: balanceInternal })
      }
    } catch (error) {
      logger.error("Failed to connect to Lightning node", { error })
      logger.warn(
        "Lightning settlement will not work until CLN is running and synced",
      )

      // Return stub implementation if CLN is not available
      const stubPeerState: LightningPeerState = {
        channelId: "",
        peerPubkey: "",
        capacity: 0n,
        localBalance: 0n,
        remoteBalance: 0n,
        status: "pending" as const,
      }

      /* eslint-disable @typescript-eslint/require-await */
      return {
        getPeeringInfo: async () => ({ data: new Uint8Array(33) }),
        createPeeringRequest: async () => ({ data: new Uint8Array(0) }),
        acceptPeeringRequest: async () => false as const,
        finalizePeeringRequest: async () => ({
          peerState: stubPeerState,
        }),
        prepareSettlement: async () => ({
          message: new Uint8Array(0),
          settlementId: "",
          execute: async () => ({}),
        }),
        handleSettlement: async () => {
          // Stub: no-op when CLN unavailable
        },
        handleMessage: async () => {
          // Stub: no-op when CLN unavailable
        },
        handleDeposit: async () => {
          // Stub: no-op when CLN unavailable
        },
        getBalance: () => 0n,
      }
      /* eslint-enable @typescript-eslint/require-await */
    }

    // Create and return the settlement engine
    return await createSettlementEngine({
      client: lightningClient,
      host,
      ledgerId: LEDGER_ID,
    })
  },
} satisfies SettlementSchemeModule<LightningPeerState>

export default lightningTestnet
