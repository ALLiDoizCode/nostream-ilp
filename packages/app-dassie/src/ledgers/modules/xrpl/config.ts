/**
 * XRP Payment Channel Configuration
 *
 * @remarks
 *
 * This module provides configuration for XRP payment channel support in Dassie.
 * Configuration is loaded from environment variables at startup.
 */

export interface XrplPaymentChannelConfig {
  /**
   * Whether payment channel mode is enabled
   *
   * @defaultValue false
   */
  enabled: boolean

  /**
   * XRPL network selection
   *
   * @defaultValue 'testnet'
   */
  network: "testnet" | "mainnet"

  /**
   * Minimum claim amount (in drops) to trigger settlement
   *
   * @remarks
   *
   * When a claim reaches this threshold, settlement is triggered automatically.
   * Default: 1,000,000 drops = 1 XRP
   *
   * @defaultValue '1000000'
   */
  settlementThreshold: string

  /**
   * Time interval (in seconds) between settlement batches
   *
   * @remarks
   *
   * If this much time has elapsed since the last claim, settlement is triggered.
   * Default: 3600 seconds = 1 hour
   *
   * @defaultValue 3600
   */
  settlementInterval: number

  /**
   * Default settle delay (in seconds) for new channels
   *
   * @remarks
   *
   * This is the time a channel must wait after claiming before it can close.
   * Protects the sender by giving them time to dispute fraudulent claims.
   * Default: 3600 seconds = 1 hour
   *
   * @defaultValue 3600
   */
  defaultSettleDelay: number

  /**
   * Default channel expiration (in days) for new channels
   *
   * @remarks
   *
   * Channels automatically close after this time. 0 = no expiration.
   * Default: 30 days
   *
   * @defaultValue 30
   */
  defaultExpiration: number

  /**
   * Minimum balance to maintain in channel (in drops)
   *
   * @remarks
   *
   * If remaining balance falls below this, settlement is triggered.
   * Default: 100,000 drops = 0.1 XRP
   *
   * @defaultValue '100000'
   */
  minChannelBalance: string
}

/**
 * Default XRP payment channel configuration
 */
const DEFAULT_CONFIG: XrplPaymentChannelConfig = {
  enabled: false,
  network: "testnet",
  settlementThreshold: "1000000", // 1 XRP
  settlementInterval: 3600, // 1 hour
  defaultSettleDelay: 3600, // 1 hour
  defaultExpiration: 30, // 30 days
  minChannelBalance: "100000", // 0.1 XRP
}

/**
 * Parse boolean from environment variable
 *
 * @param value - Environment variable value
 * @param defaultValue - Default value if not set
 * @returns Parsed boolean
 */
function parseBoolean(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined) return defaultValue
  return value.toLowerCase() === "true"
}

/**
 * Parse integer from environment variable
 *
 * @param value - Environment variable value
 * @param defaultValue - Default value if not set
 * @returns Parsed integer
 * @throws Error if value is not a valid integer
 */
function parseInteger(
  value: string | undefined,
  defaultValue: number,
): number {
  if (value === undefined) return defaultValue

  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer value: ${value}`)
  }

  return parsed
}

/**
 * Parse drops amount from environment variable
 *
 * @param value - Environment variable value
 * @param defaultValue - Default value if not set
 * @returns Parsed drops as string
 * @throws Error if value is not a valid positive integer
 */
function parseDrops(
  value: string | undefined,
  defaultValue: string,
): string {
  if (value === undefined) return defaultValue

  // Validate it's a positive integer
  const parsed = BigInt(value)
  if (parsed < 0n) {
    throw new Error(`Invalid drops amount (must be >= 0): ${value}`)
  }

  return value
}

/**
 * Load XRP payment channel configuration from environment variables
 *
 * @remarks
 *
 * Environment variables:
 * - XRPL_PAYMENT_CHANNELS_ENABLED: true/false
 * - XRPL_NETWORK: testnet/mainnet
 * - XRPL_SETTLEMENT_THRESHOLD: drops (e.g., '1000000' = 1 XRP)
 * - XRPL_SETTLEMENT_INTERVAL: seconds (e.g., '3600' = 1 hour)
 * - XRPL_SETTLE_DELAY: seconds (e.g., '3600' = 1 hour)
 * - XRPL_CHANNEL_EXPIRATION_DAYS: days (e.g., '30')
 * - XRPL_MIN_CHANNEL_BALANCE: drops (e.g., '100000' = 0.1 XRP)
 *
 * @returns Configuration object
 * @throws Error if configuration values are invalid
 */
export function loadXrplPaymentChannelConfig(): XrplPaymentChannelConfig {
  const enabled = parseBoolean(
    process.env["XRPL_PAYMENT_CHANNELS_ENABLED"],
    DEFAULT_CONFIG.enabled,
  )

  const network = process.env["XRPL_NETWORK"] as "testnet" | "mainnet" | undefined
  if (network && network !== "testnet" && network !== "mainnet") {
    throw new Error(
      `Invalid XRPL_NETWORK: ${network} (must be 'testnet' or 'mainnet')`,
    )
  }

  const settlementThreshold = parseDrops(
    process.env["XRPL_SETTLEMENT_THRESHOLD"],
    DEFAULT_CONFIG.settlementThreshold,
  )

  const settlementInterval = parseInteger(
    process.env["XRPL_SETTLEMENT_INTERVAL"],
    DEFAULT_CONFIG.settlementInterval,
  )

  if (settlementInterval < 0) {
    throw new Error(
      `Invalid XRPL_SETTLEMENT_INTERVAL: ${settlementInterval} (must be >= 0)`,
    )
  }

  const defaultSettleDelay = parseInteger(
    process.env["XRPL_SETTLE_DELAY"],
    DEFAULT_CONFIG.defaultSettleDelay,
  )

  if (defaultSettleDelay < 0) {
    throw new Error(
      `Invalid XRPL_SETTLE_DELAY: ${defaultSettleDelay} (must be >= 0)`,
    )
  }

  const defaultExpiration = parseInteger(
    process.env["XRPL_CHANNEL_EXPIRATION_DAYS"],
    DEFAULT_CONFIG.defaultExpiration,
  )

  if (defaultExpiration < 0) {
    throw new Error(
      `Invalid XRPL_CHANNEL_EXPIRATION_DAYS: ${defaultExpiration} (must be >= 0)`,
    )
  }

  const minChannelBalance = parseDrops(
    process.env["XRPL_MIN_CHANNEL_BALANCE"],
    DEFAULT_CONFIG.minChannelBalance,
  )

  return {
    enabled,
    network: network ?? DEFAULT_CONFIG.network,
    settlementThreshold,
    settlementInterval,
    defaultSettleDelay,
    defaultExpiration,
    minChannelBalance,
  }
}

/**
 * Global configuration instance (loaded lazily)
 */
let configInstance: XrplPaymentChannelConfig | undefined

/**
 * Get XRP payment channel configuration
 *
 * @remarks
 *
 * This function loads configuration on first call and caches it.
 * Configuration is loaded from environment variables.
 *
 * @returns Configuration object
 */
export function getXrplPaymentChannelConfig(): XrplPaymentChannelConfig {
  if (!configInstance) {
    configInstance = loadXrplPaymentChannelConfig()
  }
  return configInstance
}
