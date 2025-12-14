import {
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  getContract,
  http,
} from "viem"
import { base, baseSepolia } from "viem/chains"
import { privateKeyToAccount } from "viem/accounts"

import { settlementBase as logger } from "../../../logger/instances"
import type { BaseSettlementConfig } from "./config"
import multiTokenFactoryAbi from "./abi/MultiTokenPaymentChannelFactory.json"

export interface BaseRpcClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient: any // PublicClient with Base Sepolia chain has viem type compatibility issues
  contract: {
    address: Address
    abi: typeof multiTokenFactoryAbi
    write: {
      openChannel: (
        arguments_: [Address, Address, bigint, bigint], // [tokenAddress, recipient, amount, expiration]
        options: { value?: bigint; gas: bigint },
      ) => Promise<Hex>
      topUpChannel: (
        arguments_: [Hex, bigint], // [channelId, amount]
        options: { value?: bigint; gas: bigint },
      ) => Promise<Hex>
      closeChannel: (
        arguments_: [Hex, bigint, bigint, Hex], // [channelId, claimAmount, nonce, signature]
        options: { gas: bigint },
      ) => Promise<Hex>
    }
    read: {
      getChannel: (arguments_: [Hex]) => Promise<readonly [Address, Address, Address, bigint, bigint, bigint, boolean]>
    }
  }
  relayAddress: Address
  checkHealth: () => Promise<boolean>
}

/**
 * Create a Base L2 RPC client for interacting with the MultiTokenPaymentChannelFactory contract.
 *
 * @param config - Base settlement configuration
 * @returns Base RPC client with public/wallet clients and contract instance
 */
export async function createBaseClient(
  config: BaseSettlementConfig,
): Promise<BaseRpcClient> {
  logger.info("initializing Base RPC client", {
    rpcUrl: config.rpcUrl,
    contractAddress: config.contractAddress,
    realm: config.realm,
  })

  // Select chain based on realm (mainnet vs testnet)
  const chain = config.realm === "live" ? base : baseSepolia

  // Create public client for reading blockchain state
  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl, {
      timeout: 30_000, // 30 second timeout
      retryCount: 3,
      retryDelay: 1000, // Exponential backoff handled by viem
    }),
  })

  // Create account from private key
  const account = privateKeyToAccount(config.privateKey as Address)

  logger.info("relay account initialized", {
    address: account.address,
  })

  // Create wallet client for sending transactions
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(config.rpcUrl, {
      timeout: 30_000,
      retryCount: 3,
      retryDelay: 1000,
    }),
  })

  // Create contract instance
  // @ts-expect-error viem getContract return type complexity
  const contract = getContract({
    address: config.contractAddress as Address,
    abi: multiTokenFactoryAbi,
    client: { public: publicClient, wallet: walletClient },
  }) as BaseRpcClient["contract"]

  /**
   * Check RPC connection health by querying the latest block number.
   */
  async function checkHealth(): Promise<boolean> {
    try {
      const blockNumber = await publicClient.getBlockNumber()
      logger.info("Base RPC health check successful", {
        blockNumber: blockNumber.toString(),
      })
      return true
    } catch (error) {
      logger.error("Base RPC health check failed", { error })
      return false
    }
  }

  // Perform initial health check
  const isHealthy = await checkHealth()

  if (!isHealthy) {
    throw new Error("Failed to connect to Base RPC endpoint")
  }

  logger.info("Base RPC client initialized successfully", {
    chainId: chain.id,
    network: chain.name,
    relayAddress: account.address,
  })

  return {
    publicClient,
    contract,
    relayAddress: account.address,
    checkHealth,
  }
}

/**
 * Retry a function with exponential backoff.
 *
 * @param fn - Function to retry
 * @param maxRetries - Maximum number of retries
 * @param baseDelay - Base delay in milliseconds
 * @returns Result of the function
 */
export async function withRetry<T>(
  function_: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await function_()
    } catch (error) {
      lastError = error as Error
      if (attempt < maxRetries) {
        const delay = baseDelay * 2 ** attempt
        logger.warn("retrying after error", {
          attempt: attempt + 1,
          maxRetries,
          delay,
          error: lastError.message,
        })
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError ?? new Error("Unknown error in withRetry")
}
