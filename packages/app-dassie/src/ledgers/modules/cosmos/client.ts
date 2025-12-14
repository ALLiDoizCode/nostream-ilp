import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate"
import { GasPrice } from "@cosmjs/stargate"

import { settlementCosmos as logger } from "../../../logger/instances"
import type { CosmosConfig } from "./config"

export interface CosmosRpcClient {
  /** CosmWasm client for contract interactions */
  client: SigningCosmWasmClient

  /** Relay's Cosmos address */
  relayAddress: string

  /** Contract address */
  contractAddress: string

  /** Gas price configuration */
  gasPrice: GasPrice

  /** Check RPC connectivity */
  checkHealth: () => Promise<boolean>

  /** Get current block height */
  getHeight: () => Promise<number>
}

/**
 * Create a Cosmos/Akash RPC client for interacting with the PaymentChannel contract.
 *
 * @param config - Cosmos settlement configuration
 * @returns Cosmos RPC client with signing capability
 */
export async function createCosmosClient(
  config: CosmosConfig,
): Promise<CosmosRpcClient> {
  logger.info("initializing Cosmos RPC client", {
    rpcUrl: config.rpcUrl,
    contractAddress: config.contractAddress,
    network: config.network,
  })

  // Create wallet from private key
  const privateKeyBytes = Buffer.from(config.relayPrivateKey, "hex")
  const { DirectSecp256k1Wallet: WalletClass } = await import(
    "@cosmjs/proto-signing"
  )
  const wallet = await WalletClass.fromKey(
    privateKeyBytes,
    config.network === "mainnet" ? "akash" : "akash", // Prefix is same for both
  )

  // Get relay address from wallet
  const [account] = await wallet.getAccounts()
  if (!account) {
    throw new Error("Failed to get account from wallet")
  }
  const relayAddress = account.address

  logger.info("relay account initialized", {
    address: relayAddress,
  })

  // Parse gas price
  const gasPrice = GasPrice.fromString(config.gasPrice)

  // Connect to Cosmos RPC with signing capability
  const client = await SigningCosmWasmClient.connectWithSigner(
    config.rpcUrl,
    wallet,
    { gasPrice },
  )

  logger.info("CosmWasm client connected", {
    relayAddress,
    contractAddress: config.contractAddress,
  })

  // Health check helper
  const checkHealth = async (): Promise<boolean> => {
    try {
      const height = await client.getHeight()
      logger.info("RPC health check passed", { height })
      return true
    } catch (error) {
      logger.error("RPC health check failed", { error })
      return false
    }
  }

  // Get block height helper
  const getHeight = async (): Promise<number> => {
    return client.getHeight()
  }

  // Verify connectivity on initialization
  const isHealthy = await checkHealth()
  if (!isHealthy) {
    logger.warn("Initial RPC health check failed - retrying...")

    // Retry with exponential backoff
    for (let attempt = 1; attempt <= 3; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))

      const retryHealthy = await checkHealth()
      if (retryHealthy) {
        logger.info("RPC connection established after retry", { attempt })
        break
      }

      if (attempt === 3) {
        throw new Error(
          "Failed to connect to Cosmos RPC after 3 attempts - check COSMOS_AKASH_RPC_URL",
        )
      }
    }
  }

  return {
    client,
    relayAddress,
    contractAddress: config.contractAddress,
    gasPrice,
    checkHealth,
    getHeight,
  }
}
