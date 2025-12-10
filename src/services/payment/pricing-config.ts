
/**
 * Pricing Configuration Module
 *
 * Loads and manages relay pricing configuration from environment variables.
 * Supports per-operation pricing and per-kind overrides for specialized content.
 *
 * @module services/payment/pricing-config
 */

/**
 * Pricing configuration interface
 *
 * @interface PricingConfig
 * @property {bigint} storeEvent - Default cost to store an event (satoshis)
 * @property {bigint} deliverEvent - Cost per event delivered via REQ (satoshis)
 * @property {bigint} query - Cost per REQ subscription (satoshis)
 * @property {number} freeTierEvents - Free events per pubkey (0=disabled, implemented in Story 1.6)
 * @property {Map<number, bigint>} kindOverrides - Per-kind pricing overrides
 *
 * @example
 * ```typescript
 * const config: PricingConfig = {
 *   storeEvent: 10n,
 *   deliverEvent: 1n,
 *   query: 5n,
 *   freeTierEvents: 100,
 *   kindOverrides: new Map([
 *     [1, 10n],      // Kind 1 (note): 10 sats
 *     [30023, 100n], // Kind 30023 (article): 100 sats
 *     [1063, 500n]   // Kind 1063 (file): 500 sats
 *   ])
 * }
 * ```
 */
export interface PricingConfig {
  storeEvent: bigint
  deliverEvent: bigint
  query: bigint
  freeTierEvents: number
  kindOverrides: Map<number, bigint>
}

/**
 * Parse bigint from environment variable with validation
 *
 * @param {string | undefined} value - Environment variable value
 * @param {bigint} defaultValue - Fallback value if parsing fails
 * @returns {bigint} Parsed value or default
 *
 * @private
 */
function parseBigInt(value: string | undefined, defaultValue: bigint): bigint {
  if (!value) return defaultValue

  try {
    const parsed = BigInt(value)
    if (parsed < 0n) {
      console.warn(
        `Invalid pricing value: ${value} (must be non-negative), using default: ${defaultValue}`
      )
      return defaultValue
    }
    return parsed
  } catch (error) {
    console.warn(
      `Failed to parse pricing value: ${value}, using default: ${defaultValue}`
    )
    return defaultValue
  }
}

/**
 * Parse kind overrides from environment variable
 *
 * Format: "kind:amount,kind:amount" (e.g., "1:10,30023:100,1063:500")
 *
 * @param {string | undefined} value - Comma-separated kind:amount pairs
 * @returns {Map<number, bigint>} Map of kind to pricing amount
 *
 * @example
 * ```typescript
 * parseKindOverrides("1:10,30023:100") // Map([[1, 10n], [30023, 100n]])
 * parseKindOverrides("") // Map()
 * parseKindOverrides("invalid") // Map() + warning logged
 * ```
 *
 * @private
 */
function parseKindOverrides(value: string | undefined): Map<number, bigint> {
  const overrides = new Map<number, bigint>()

  if (!value || value.trim() === '') {
    return overrides
  }

  const pairs = value.split(',')
  for (const pair of pairs) {
    const [kindStr, amountStr] = pair.split(':')

    if (!kindStr || !amountStr) {
      console.warn(`Invalid kind override format: ${pair}, skipping`)
      continue
    }

    try {
      const kind = parseInt(kindStr.trim(), 10)
      const amount = BigInt(amountStr.trim())

      if (isNaN(kind) || amount < 0n) {
        console.warn(`Invalid kind override: ${pair}, skipping`)
        continue
      }

      overrides.set(kind, amount)
    } catch (error) {
      console.warn(`Failed to parse kind override: ${pair}, skipping`)
      continue
    }
  }

  return overrides
}

/**
 * Load pricing configuration from environment variables
 *
 * Reads pricing settings from process.env with fallback to defaults:
 * - PRICING_STORE_EVENT (default: 10 sats)
 * - PRICING_DELIVER_EVENT (default: 1 sat)
 * - PRICING_QUERY (default: 5 sats)
 * - PRICING_FREE_TIER_EVENTS (default: 0, disabled)
 * - PRICING_KIND_OVERRIDES (default: empty, format: "kind:amount,...")
 *
 * @returns {PricingConfig} Validated pricing configuration
 *
 * @throws Never - Always returns valid configuration with defaults on error
 *
 * @example
 * ```typescript
 * // Load configuration
 * const config = loadPricingConfig()
 *
 * // Check default pricing
 * console.log(config.storeEvent) // 10n
 *
 * // Check kind overrides
 * if (config.kindOverrides.has(30023)) {
 *   console.log('Article pricing:', config.kindOverrides.get(30023))
 * }
 * ```
 */
export function loadPricingConfig(): PricingConfig {
  const config: PricingConfig = {
    storeEvent: parseBigInt(process.env.PRICING_STORE_EVENT, 10n),
    deliverEvent: parseBigInt(process.env.PRICING_DELIVER_EVENT, 1n),
    query: parseBigInt(process.env.PRICING_QUERY, 5n),
    freeTierEvents: parseInt(process.env.PRICING_FREE_TIER_EVENTS || '0', 10),
    kindOverrides: parseKindOverrides(process.env.PRICING_KIND_OVERRIDES),
  }

  // Log configuration for operator visibility
  console.info('Pricing configuration loaded:', {
    storeEvent: config.storeEvent.toString(),
    deliverEvent: config.deliverEvent.toString(),
    query: config.query.toString(),
    freeTierEvents: config.freeTierEvents,
    kindOverrides: Array.from(config.kindOverrides.entries()).map(([kind, amount]) => ({
      kind,
      amount: amount.toString(),
    })),
  })

  return config
}

/**
 * Singleton pricing configuration instance
 *
 * Loaded once at module initialization. Configuration changes require
 * application restart.
 *
 * @constant
 * @type {PricingConfig}
 */
export const pricingConfig = loadPricingConfig()
