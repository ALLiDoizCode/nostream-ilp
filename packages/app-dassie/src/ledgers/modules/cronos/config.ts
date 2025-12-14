/**
 * Configuration for Cronos settlement module.
 */
export interface CronosSettlementConfig {
  /** Enable/disable the Cronos settlement module */
  enabled: boolean

  /** Cronos testnet RPC endpoint URL */
  rpcUrl: string

  /** Cronos chain ID (338 for testnet, 25 for mainnet) */
  chainId: number

  /** Deployed CronosPaymentChannel contract address */
  contractAddress: string

  /** AKT ERC-20 token address (MockAKT for testnet) */
  aktTokenAddress: string

  /** Relay's Ethereum address (recipient) */
  relayAddress: string

  /** Relay's private key for signing transactions */
  privateKey: string

  /** Minimum claim amount to trigger settlement (in AKT smallest units, 6 decimals) */
  settlementThreshold: bigint

  /** Seconds between settlement batches */
  settlementInterval: number

  /** Maximum gas per transaction */
  gasLimit: number

  /** Maximum gas price (in wei) */
  maxFeePerGas: bigint

  /** Realm: 'test' for testnet, 'main' for mainnet */
  realm: "test" | "main"
}

/**
 * Load Cronos settlement configuration from environment variables.
 */
export function loadCronosConfig(): CronosSettlementConfig {
  return {
    enabled: process.env["CRONOS_ENABLED"] === "true",
    rpcUrl:
      process.env["CRONOS_TESTNET_RPC_URL"] ?? "https://evm-t3.cronos.org/",
    chainId: Number.parseInt(process.env["CRONOS_CHAIN_ID"] ?? "338"), // 338 for testnet
    contractAddress:
      process.env["CRONOS_PAYMENT_CHANNEL_ADDRESS"] ??
      "0x4b9e32389896C05A4CAfC41bE9dA6bB108a7dA72",
    aktTokenAddress:
      process.env["CRONOS_AKT_TOKEN_ADDRESS"] ??
      "0xf7e968d6f3bdFC504A434288Ea3f243e033e846F",
    relayAddress: process.env["CRONOS_RELAY_ADDRESS"] ?? "",
    privateKey: process.env["CRONOS_RELAY_PRIVATE_KEY"] ?? "",
    settlementThreshold: BigInt(
      process.env["CRONOS_SETTLEMENT_THRESHOLD"] ?? "100000000",
    ), // 100 AKT default (6 decimals)
    settlementInterval: Number.parseInt(
      process.env["CRONOS_SETTLEMENT_INTERVAL"] ?? "3600",
    ), // 1 hour
    gasLimit: Number.parseInt(process.env["CRONOS_GAS_LIMIT"] ?? "500000"),
    maxFeePerGas: BigInt(
      process.env["CRONOS_MAX_GAS_PRICE"] ?? "10000000000",
    ), // 10 gwei
    realm: "test",
  }
}

/**
 * Validate Cronos settlement configuration.
 */
export function validateCronosConfig(config: CronosSettlementConfig): void {
  if (!config.enabled) {
    return // Skip validation if disabled
  }

  if (!config.rpcUrl) {
    throw new Error("CRONOS_TESTNET_RPC_URL is required")
  }

  // Validate chainId (338 for testnet, 25 for mainnet)
  if (config.chainId !== 338 && config.chainId !== 25) {
    throw new Error("CRONOS_CHAIN_ID must be 338 (testnet) or 25 (mainnet)")
  }

  if (!config.contractAddress || config.contractAddress.length !== 42) {
    throw new Error(
      "CRONOS_PAYMENT_CHANNEL_ADDRESS must be a valid Ethereum address",
    )
  }

  // Validate AKT token address
  if (!config.aktTokenAddress || config.aktTokenAddress.length !== 42) {
    throw new Error(
      "CRONOS_AKT_TOKEN_ADDRESS must be a valid Ethereum address",
    )
  }

  if (!config.relayAddress || config.relayAddress.length !== 42) {
    throw new Error("CRONOS_RELAY_ADDRESS must be a valid Ethereum address")
  }

  if (!config.privateKey || config.privateKey.length !== 66) {
    throw new Error(
      "CRONOS_RELAY_PRIVATE_KEY must be a valid private key (0x + 64 hex chars)",
    )
  }

  if (config.settlementThreshold <= 0n) {
    throw new Error("CRONOS_SETTLEMENT_THRESHOLD must be positive")
  }

  if (config.settlementInterval <= 0) {
    throw new Error("CRONOS_SETTLEMENT_INTERVAL must be positive")
  }
}
