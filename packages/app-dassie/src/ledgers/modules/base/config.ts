/**
 * Configuration for Base L2 settlement module.
 */
export interface BaseSettlementConfig {
  /** Enable/disable the Base settlement module */
  enabled: boolean

  /** Base Sepolia RPC endpoint URL */
  rpcUrl: string

  /** Deployed MultiTokenPaymentChannelFactory contract address */
  contractAddress: string

  /** Relay's Ethereum address (recipient) */
  relayAddress: string

  /** Relay's private key for signing transactions */
  privateKey: string

  /** Minimum claim amount to trigger settlement (in wei) */
  settlementThreshold: bigint

  /** Seconds between settlement batches */
  settlementInterval: number

  /** Maximum gas per transaction */
  gasLimit: number

  /** Maximum gas price (in wei) */
  maxFeePerGas: bigint

  /** Realm: 'test' for testnet, 'live' for mainnet */
  realm: "test" | "live"

  /** Supported token addresses (address(0) for native ETH, ERC-20 addresses for tokens) */
  supportedTokens: {
    eth: string // address(0)
    usdc?: string // Optional USDC address
  }
}

/**
 * Load Base settlement configuration from environment variables.
 */
export function loadBaseConfig(): BaseSettlementConfig {
  return {
    enabled: process.env["BASE_ENABLED"] === "true",
    rpcUrl: process.env["BASE_SEPOLIA_RPC_URL"] ?? "https://sepolia.base.org",
    contractAddress:
      process.env["BASE_PAYMENT_CHANNEL_ADDRESS"] ??
      "0xBe140c80d39A94543e21458F9C1382EccBEC36Ee",
    relayAddress: process.env["BASE_RELAY_ADDRESS"] ?? "",
    privateKey: process.env["BASE_RELAY_PRIVATE_KEY"] ?? "",
    settlementThreshold: BigInt(
      process.env["BASE_SETTLEMENT_THRESHOLD"] ?? "100000000000000000",
    ), // 0.1 ETH default
    settlementInterval: Number.parseInt(
      process.env["BASE_SETTLEMENT_INTERVAL"] ?? "3600",
    ), // 1 hour
    gasLimit: Number.parseInt(process.env["BASE_GAS_LIMIT"] ?? "500000"),
    maxFeePerGas: BigInt(process.env["BASE_MAX_GAS_PRICE"] ?? "10000000000"), // 10 gwei
    realm: "test",
    supportedTokens: {
      eth: "0x0000000000000000000000000000000000000000", // Native ETH
      usdc: process.env["BASE_SEPOLIA_USDC_ADDRESS"], // Optional USDC on Sepolia
    },
  }
}

/**
 * Load Base mainnet settlement configuration from environment variables.
 */
export function loadBaseMainnetConfig(): BaseSettlementConfig {
  return {
    enabled: process.env["BASE_MAINNET_ENABLED"] === "true",
    rpcUrl: process.env["BASE_MAINNET_RPC_URL"] ?? "https://mainnet.base.org",
    contractAddress:
      process.env["BASE_MAINNET_FACTORY_ADDRESS"] ??
      "0xf7e968d6f3bdFC504A434288Ea3f243e033e846F",
    relayAddress: process.env["BASE_MAINNET_RELAY_ADDRESS"] ?? "",
    privateKey: process.env["BASE_MAINNET_RELAY_PRIVATE_KEY"] ?? "",
    settlementThreshold: BigInt(
      process.env["BASE_SETTLEMENT_THRESHOLD"] ?? "100000000000000000",
    ), // 0.1 ETH default
    settlementInterval: Number.parseInt(
      process.env["BASE_SETTLEMENT_INTERVAL"] ?? "3600",
    ), // 1 hour
    gasLimit: Number.parseInt(process.env["BASE_GAS_LIMIT"] ?? "500000"),
    maxFeePerGas: BigInt(process.env["BASE_MAX_GAS_PRICE"] ?? "10000000000"), // 10 gwei
    realm: "live",
    supportedTokens: {
      eth: "0x0000000000000000000000000000000000000000", // Native ETH
      usdc: process.env["BASE_MAINNET_USDC_ADDRESS"] ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base mainnet USDC
    },
  }
}

/**
 * Validate Base settlement configuration.
 */
export function validateBaseConfig(config: BaseSettlementConfig): void {
  if (!config.enabled) {
    return // Skip validation if disabled
  }

  if (!config.rpcUrl) {
    throw new Error("BASE_SEPOLIA_RPC_URL is required")
  }

  if (!config.contractAddress || config.contractAddress.length !== 42) {
    throw new Error(
      "BASE_PAYMENT_CHANNEL_ADDRESS must be a valid Ethereum address",
    )
  }

  if (!config.relayAddress || config.relayAddress.length !== 42) {
    throw new Error("BASE_RELAY_ADDRESS must be a valid Ethereum address")
  }

  if (!config.privateKey || config.privateKey.length !== 66) {
    throw new Error(
      "BASE_RELAY_PRIVATE_KEY must be a valid private key (0x + 64 hex chars)",
    )
  }

  if (config.settlementThreshold <= 0n) {
    throw new Error("BASE_SETTLEMENT_THRESHOLD must be positive")
  }

  if (config.settlementInterval <= 0) {
    throw new Error("BASE_SETTLEMENT_INTERVAL must be positive")
  }
}
