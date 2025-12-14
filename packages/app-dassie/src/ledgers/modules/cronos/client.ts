import {
  type Address,
  type Chain,
  type Hex,
  createPublicClient,
  createWalletClient,
  getContract,
  http,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"

import { settlementCronos as logger } from "../../../logger/instances"
import type { CronosSettlementConfig } from "./config"
import cronosPaymentChannelAbi from "./abi/CronosPaymentChannel.json"
import mockAktAbi from "./abi/MockAKT.json"

/**
 * Cronos testnet chain definition.
 * ChainID: 338 (testnet), 25 (mainnet)
 */
const cronosTestnet: Chain = {
  id: 338,
  name: "Cronos Testnet",
  nativeCurrency: {
    decimals: 18,
    name: "Cronos",
    symbol: "TCRO",
  },
  rpcUrls: {
    default: {
      http: ["https://evm-t3.cronos.org/"],
    },
    public: {
      http: ["https://evm-t3.cronos.org/"],
    },
  },
  blockExplorers: {
    default: {
      name: "Cronos Explorer",
      url: "https://cronos.org/explorer/testnet3",
    },
  },
  testnet: true,
}

const cronosMainnet: Chain = {
  id: 25,
  name: "Cronos Mainnet",
  nativeCurrency: {
    decimals: 18,
    name: "Cronos",
    symbol: "CRO",
  },
  rpcUrls: {
    default: {
      http: ["https://evm.cronos.org/"],
    },
    public: {
      http: ["https://evm.cronos.org/"],
    },
  },
  blockExplorers: {
    default: {
      name: "Cronos Explorer",
      url: "https://cronos.org/explorer",
    },
  },
  testnet: false,
}

export interface CronosRpcClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient: any // PublicClient with Cronos chain has viem type compatibility issues
  channelContract: {
    address: Address
    abi: typeof cronosPaymentChannelAbi
    write: {
      openChannel: (
        arguments_: [Address, bigint, bigint],
        options: { gas: bigint },
      ) => Promise<Hex>
      closeChannel: (
        arguments_: [Hex, bigint, bigint, Hex],
        options: { gas: bigint },
      ) => Promise<Hex>
    }
    read: {
      getChannel: (
        arguments_: [Hex],
      ) => Promise<
        readonly [Address, Address, bigint, bigint, bigint, boolean]
      >
    }
  }
  aktContract: {
    address: Address
    abi: typeof mockAktAbi
    write: {
      approve: (
        arguments_: [Address, bigint],
        options: { gas: bigint },
      ) => Promise<Hex>
      mint: (
        arguments_: [Address, bigint],
        options: { gas: bigint },
      ) => Promise<Hex>
    }
    read: {
      balanceOf: (arguments_: [Address]) => Promise<bigint>
      allowance: (arguments_: [Address, Address]) => Promise<bigint>
      decimals: () => Promise<number>
    }
  }
  relayAddress: Address
  checkHealth: () => Promise<boolean>
  checkAllowance: (amount: bigint) => Promise<boolean>
  ensureAllowance: (amount: bigint) => Promise<void>
}

/**
 * Create a Cronos RPC client for interacting with CronosPaymentChannel and AKT token.
 *
 * @param config - Cronos settlement configuration
 * @returns Cronos RPC client with public/wallet clients and contract instances
 */
export async function createCronosClient(
  config: CronosSettlementConfig,
): Promise<CronosRpcClient> {
  logger.info("initializing Cronos RPC client", {
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
    contractAddress: config.contractAddress,
    aktTokenAddress: config.aktTokenAddress,
  })

  // Select chain based on chainId
  const chain = config.chainId === 338 ? cronosTestnet : cronosMainnet

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

  // Create channel contract instance
  // @ts-expect-error viem getContract return type complexity
  const channelContract = getContract({
    address: config.contractAddress as Address,
    abi: cronosPaymentChannelAbi,
    client: { public: publicClient, wallet: walletClient },
  }) as CronosRpcClient["channelContract"]

  // Create AKT token contract instance
  // @ts-expect-error viem getContract return type complexity
  const aktContract = getContract({
    address: config.aktTokenAddress as Address,
    abi: mockAktAbi,
    client: { public: publicClient, wallet: walletClient },
  }) as CronosRpcClient["aktContract"]

  /**
   * Check RPC connection health by querying the latest block number.
   */
  async function checkHealth(): Promise<boolean> {
    try {
      const blockNumber = await publicClient.getBlockNumber()
      logger.info("Cronos RPC health check successful", {
        blockNumber: blockNumber.toString(),
      })
      return true
    } catch (error) {
      logger.error("Cronos RPC health check failed", { error })
      return false
    }
  }

  /**
   * Check if current allowance is sufficient for the given amount.
   *
   * @param amount - Amount to check allowance for (in AKT smallest units)
   * @returns True if allowance is sufficient
   */
  async function checkAllowance(amount: bigint): Promise<boolean> {
    try {
      const allowance = await aktContract.read.allowance([
        account.address,
        config.contractAddress as Address,
      ])
      logger.info("current AKT allowance", {
        allowance: allowance.toString(),
        required: amount.toString(),
      })
      return allowance >= amount
    } catch (error) {
      logger.error("failed to check allowance", { error })
      return false
    }
  }

  /**
   * Ensure sufficient allowance by approving if needed.
   *
   * @param amount - Amount to approve (in AKT smallest units)
   */
  async function ensureAllowance(amount: bigint): Promise<void> {
    const hasSufficientAllowance = await checkAllowance(amount)

    if (hasSufficientAllowance) {
      logger.info("sufficient allowance already exists", {
        amount: amount.toString(),
      })
      return
    }

    logger.info("approving AKT token spending", {
      spender: config.contractAddress,
      amount: amount.toString(),
    })

    try {
      const txHash = await aktContract.write.approve(
        [config.contractAddress as Address, amount],
        { gas: BigInt(config.gasLimit) },
      )

      logger.info("approval transaction submitted", { txHash })

      // Wait for approval transaction confirmation
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      })

      if (receipt.status !== "success") {
        throw new Error("Approval transaction failed")
      }

      logger.info("AKT approval confirmed", {
        txHash,
        blockNumber: receipt.blockNumber.toString(),
      })
    } catch (error) {
      logger.error("approval transaction failed", { error })
      throw new Error(`Failed to approve AKT spending: ${error}`)
    }
  }

  // Perform initial health check
  const isHealthy = await checkHealth()

  if (!isHealthy) {
    throw new Error("Failed to connect to Cronos RPC endpoint")
  }

  logger.info("Cronos RPC client initialized successfully", {
    chainId: chain.id,
    network: chain.name,
    relayAddress: account.address,
  })

  return {
    publicClient,
    channelContract,
    aktContract,
    relayAddress: account.address,
    checkHealth,
    checkAllowance,
    ensureAllowance,
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
