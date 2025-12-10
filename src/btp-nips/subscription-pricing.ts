import * as fs from 'node:fs'
import * as yaml from 'yaml'

/**
 * Subscription Pricing Module
 * Calculates subscription costs based on time-to-live (TTL)
 *
 * Pricing Model:
 * - Time-based pricing: Cost per hour subscription is active
 * - Formula: cost = ceil(ttl / 3600) * costPerHour
 * - Configurable via .nostr/settings.yaml
 *
 * Reference: docs/prd/epic-5-btp-nips-protocol.md#Story 5.3 AC 6
 */

/**
 * Subscription pricing configuration
 */
export interface SubscriptionPricingConfig {
  /** Cost per hour in millisatoshis (msats) */
  cost_per_hour: number
  /** Maximum TTL in seconds (default 24 hours) */
  max_ttl: number
  /** Default TTL in seconds (default 1 hour) */
  default_ttl: number
  /** Minimum TTL in seconds (default 60 seconds) */
  min_ttl: number
}

/**
 * Default subscription pricing configuration
 * Used if .nostr/settings.yaml doesn't have subscription_pricing section
 */
const DEFAULT_CONFIG: SubscriptionPricingConfig = {
  cost_per_hour: 5000, // 5000 msats per hour
  max_ttl: 86400, // 24 hours max
  default_ttl: 3600, // 1 hour default
  min_ttl: 60, // 1 minute minimum
}

/**
 * Load subscription pricing configuration from .nostr/settings.yaml
 *
 * @param configPath - Path to settings.yaml file
 * @returns Subscription pricing configuration
 * @throws Error if config file exists but is invalid
 */
export function loadSubscriptionPricingConfig(
  configPath = '.nostr/settings.yaml'
): SubscriptionPricingConfig {
  try {
    // Check if config file exists
    if (!fs.existsSync(configPath)) {
      console.warn(
        `Config file not found: ${configPath}, using default subscription pricing`
      )
      return DEFAULT_CONFIG
    }

    // Read and parse YAML
    const configFile = fs.readFileSync(configPath, 'utf8')
    const config = yaml.parse(configFile)

    // Extract subscription_pricing config
    const subConfig = config?.btp_nips?.subscription_pricing

    if (!subConfig) {
      console.warn(
        'No btp_nips.subscription_pricing in config, using defaults'
      )
      return DEFAULT_CONFIG
    }

    // Merge with defaults (allow partial config)
    return {
      cost_per_hour: subConfig.cost_per_hour ?? DEFAULT_CONFIG.cost_per_hour,
      max_ttl: subConfig.max_ttl ?? DEFAULT_CONFIG.max_ttl,
      default_ttl: subConfig.default_ttl ?? DEFAULT_CONFIG.default_ttl,
      min_ttl: subConfig.min_ttl ?? DEFAULT_CONFIG.min_ttl,
    }
  } catch (error) {
    console.error(
      `Failed to load subscription pricing config from ${configPath}:`,
      error
    )
    throw new Error(
      `Invalid subscription pricing configuration: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

// Singleton config instance (loaded once at startup)
let _cachedConfig: SubscriptionPricingConfig | null = null

/**
 * Get subscription pricing configuration (cached)
 * Loads config on first call, returns cached value on subsequent calls
 *
 * @returns Subscription pricing configuration
 */
export function getSubscriptionPricingConfig(): SubscriptionPricingConfig {
  if (!_cachedConfig) {
    _cachedConfig = loadSubscriptionPricingConfig()
  }
  return _cachedConfig
}

/**
 * Calculate subscription cost based on TTL
 *
 * Pricing Formula:
 * - hours = ceil(ttl / 3600) - rounds up to nearest hour
 * - cost = hours * costPerHour
 *
 * Examples:
 * - TTL = 3600 (1 hour) → cost = 5000 msats
 * - TTL = 7200 (2 hours) → cost = 10000 msats
 * - TTL = 1800 (30 minutes) → cost = 5000 msats (rounded up to 1 hour)
 * - TTL = 86400 (24 hours) → cost = 120000 msats
 *
 * @param ttl - Time-to-live in seconds
 * @param config - Optional pricing config (uses cached config if not provided)
 * @returns Cost in millisatoshis (msats)
 * @throws Error if TTL is invalid (< min_ttl or > max_ttl)
 *
 * @example
 * ```typescript
 * const cost = calculateSubscriptionCost(3600); // 5000 msats for 1 hour
 * const cost2 = calculateSubscriptionCost(7200); // 10000 msats for 2 hours
 * const cost3 = calculateSubscriptionCost(1800); // 5000 msats (rounds up to 1 hour)
 * ```
 */
export function calculateSubscriptionCost(
  ttl: number,
  config?: SubscriptionPricingConfig
): number {
  const pricingConfig = config ?? getSubscriptionPricingConfig()

  // Validate TTL
  if (ttl < pricingConfig.min_ttl) {
    throw new Error(
      `TTL too low: ${ttl} seconds (minimum: ${pricingConfig.min_ttl} seconds)`
    )
  }

  if (ttl > pricingConfig.max_ttl) {
    throw new Error(
      `TTL too high: ${ttl} seconds (maximum: ${pricingConfig.max_ttl} seconds)`
    )
  }

  // Calculate cost
  const hours = Math.ceil(ttl / 3600)
  const cost = hours * pricingConfig.cost_per_hour

  return cost
}

/**
 * Validate subscription TTL
 * Checks if TTL is within allowed range
 *
 * @param ttl - Time-to-live in seconds
 * @param config - Optional pricing config (uses cached config if not provided)
 * @returns Object with isValid flag and optional error message
 *
 * @example
 * ```typescript
 * const result = validateSubscriptionTTL(3600);
 * if (!result.isValid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateSubscriptionTTL(
  ttl: number,
  config?: SubscriptionPricingConfig
): { isValid: boolean; error?: string } {
  const pricingConfig = config ?? getSubscriptionPricingConfig()

  if (ttl < pricingConfig.min_ttl) {
    return {
      isValid: false,
      error: `TTL too low: ${ttl} seconds (minimum: ${pricingConfig.min_ttl} seconds)`,
    }
  }

  if (ttl > pricingConfig.max_ttl) {
    return {
      isValid: false,
      error: `TTL too high: ${ttl} seconds (maximum: ${pricingConfig.max_ttl} seconds)`,
    }
  }

  return { isValid: true }
}

/**
 * Clear cached configuration (for testing)
 * @internal
 */
export function _clearConfigCache(): void {
  _cachedConfig = null
}
