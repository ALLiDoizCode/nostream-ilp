/**
 * Configuration for Cosmos/Akash settlement module.
 *
 * Uses direct IBC bank transfers instead of payment channels.
 */
export interface CosmosConfig {
  /** Enable/disable the Cosmos settlement module */
  enabled: boolean

  /** Akash RPC endpoint URL (testnet or mainnet) */
  rpcUrl: string

  /** Relay's Cosmos address (recipient, e.g., akash1...) */
  relayAddress: string

  /** Relay's private key for signing transactions (hex string) */
  relayPrivateKey: string

  /** Network selection: 'testnet' or 'mainnet' */
  network: "testnet" | "mainnet"

  /** Gas price for transactions (e.g., "0.025uakt") */
  gasPrice: string

  /** Maximum gas per transaction */
  gasLimit: number

  /** Realm: 'test' for testnet, 'main' for mainnet */
  realm: "test" | "main"
}

/**
 * Load Cosmos settlement configuration from environment variables.
 */
export function loadCosmosConfig(): CosmosConfig {
  const network =
    (process.env["COSMOS_NETWORK"] as "testnet" | "mainnet") ?? "testnet"

  return {
    enabled: process.env["COSMOS_ENABLED"] === "true",
    rpcUrl:
      process.env["COSMOS_AKASH_RPC_URL"] ??
      "https://rpc.sandbox-01.aksh.pw:443", // Default testnet
    relayAddress: process.env["COSMOS_RELAY_ADDRESS"] ?? "",
    relayPrivateKey: process.env["COSMOS_RELAY_PRIVATE_KEY"] ?? "",
    network,
    gasPrice: process.env["COSMOS_GAS_PRICE"] ?? "0.025uakt",
    gasLimit: Number.parseInt(process.env["COSMOS_GAS_LIMIT"] ?? "200000"),
    realm: network === "mainnet" ? "main" : "test",
  }
}

/**
 * Validate Cosmos settlement configuration.
 *
 * @throws Error if configuration is invalid
 */
export function validateCosmosConfig(config: CosmosConfig): void {
  if (!config.enabled) {
    return // Skip validation if disabled
  }

  if (!config.rpcUrl) {
    throw new Error("COSMOS_AKASH_RPC_URL is required")
  }

  // Validate relay address format
  if (
    !config.relayAddress ||
    (!config.relayAddress.startsWith("akash1") &&
      !config.relayAddress.startsWith("cosmos1"))
  ) {
    throw new Error(
      "COSMOS_RELAY_ADDRESS must be a valid Cosmos address (akash1... or cosmos1...)",
    )
  }

  // Validate private key (hex string, should be 64 characters)
  if (!config.relayPrivateKey || config.relayPrivateKey.length !== 64) {
    throw new Error(
      "COSMOS_RELAY_PRIVATE_KEY must be a valid private key (64 hex characters)",
    )
  }

  // Validate settlement threshold (must be numeric string)
  const threshold = Number.parseInt(config.settlementThreshold)
  if (Number.isNaN(threshold) || threshold <= 0) {
    throw new Error("COSMOS_SETTLEMENT_THRESHOLD must be a positive number")
  }

  if (config.settlementInterval <= 0) {
    throw new Error("COSMOS_SETTLEMENT_INTERVAL must be positive")
  }

  // Validate gas price format (e.g., "0.025uakt")
  if (!/^\d+(\.\d+)?uakt$/.test(config.gasPrice)) {
    throw new Error(
      'COSMOS_GAS_PRICE must be in format "0.025uakt" (number + "uakt")',
    )
  }

  if (config.gasLimit <= 0) {
    throw new Error("COSMOS_GAS_LIMIT must be positive")
  }
}
