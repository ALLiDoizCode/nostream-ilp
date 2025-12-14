import { createLogger } from '../factories/logger-factory'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parse as parseYaml } from 'yaml'

import type { NostrEvent } from './types/index'

/**
 * BTP-NIPs Pricing Module
 *
 * Calculates event costs based on event kind and loaded configuration.
 * Pricing is loaded from .nostr/settings.yaml at startup.
 *
 * @module btp-nips/pricing
 */

const debug = createLogger('btp-nips:pricing')

/**
 * Pricing configuration structure
 */
export interface PricingConfig {
  /**
   * Per-kind pricing in millisatoshis
   *
   * Keys are event kind numbers (as strings or numbers)
   * Values are prices in msats
   */
  per_kind: {
    default: number
    [kind: number]: number
  }
}

/**
 * Full BTP-NIPs configuration structure
 */
interface BTPNIPsConfig {
  btp_nips?: {
    enabled?: boolean
    pricing?: PricingConfig
    storage?: {
      cache?: {
        enabled?: boolean
        ttl_seconds?: number
      }
      hot_storage?: {
        retention_days?: number
        cleanup_interval_hours?: number
      }
    }
    ilp?: {
      rpc_url?: string
      min_payment_msats?: number
      payment_timeout_seconds?: number
    }
  }
}

/**
 * Default pricing configuration (fallback if file not found)
 */
const DEFAULT_PRICING: PricingConfig = {
  per_kind: {
    default: 100,      // 100 msats default
    1: 50,             // Short notes
    7: 10,             // Reactions
    30023: 500,        // Long-form content
    1063: 1000,        // File metadata
    71: 2000,          // Video
  },
}

/**
 * Loaded pricing configuration (cached in memory)
 */
let loadedPricing: PricingConfig | null = null

/**
 * Load pricing configuration from .nostr/settings.yaml
 *
 * The configuration file is expected to be at the root of the project:
 * `.nostr/settings.yaml`
 *
 * If the file doesn't exist or parsing fails, uses DEFAULT_PRICING.
 *
 * @param configPath - Optional path to settings file (defaults to .nostr/settings.yaml)
 * @returns Loaded pricing configuration
 *
 * @example
 * ```typescript
 * const pricing = loadPricingConfig();
 * console.log('Default price:', pricing.per_kind.default);
 * ```
 */
export function loadPricingConfig(configPath?: string): PricingConfig {
  if (loadedPricing) {
    return loadedPricing
  }

  const path = configPath || join(process.cwd(), '.nostr', 'settings.yaml')

  try {
    const fileContent = readFileSync(path, 'utf-8')
    const config = parseYaml(fileContent) as BTPNIPsConfig

    if (config.btp_nips?.pricing) {
      loadedPricing = config.btp_nips.pricing
      debug('Loaded pricing config from %s', path)
      debug('Pricing: %o', loadedPricing)
      return loadedPricing
    } else {
      debug('No pricing config found in %s, using defaults', path)
      loadedPricing = DEFAULT_PRICING
      return loadedPricing
    }
  } catch (error) {
    debug('Failed to load pricing config from %s: %o', path, error)
    debug('Using default pricing')
    loadedPricing = DEFAULT_PRICING
    return loadedPricing
  }
}

/**
 * Get the cost for a specific event based on its kind.
 *
 * Looks up the event kind in the pricing configuration.
 * Falls back to 'default' price if kind not found.
 *
 * @param event - The Nostr event
 * @param config - Optional pricing config (loads from file if not provided)
 * @returns Cost in millisatoshis (msats)
 *
 * @example
 * ```typescript
 * const event: NostrEvent = {
 *   id: '...',
 *   kind: 1,  // Short note
 *   // ... other fields
 * };
 *
 * const cost = getEventCost(event);
 * console.log(`Cost: ${cost} msats`); // "Cost: 50 msats"
 * ```
 */
export function getEventCost(event: NostrEvent, config?: PricingConfig): number {
  const pricingConfig = config || loadPricingConfig()

  // Check if specific kind has custom pricing
  if (event.kind in pricingConfig.per_kind) {
    return pricingConfig.per_kind[event.kind]
  }

  // Fall back to default
  return pricingConfig.per_kind.default
}

/**
 * Get the cost for a specific event kind (without full event object).
 *
 * @param kind - Event kind number
 * @param config - Optional pricing config (loads from file if not provided)
 * @returns Cost in millisatoshis (msats)
 *
 * @example
 * ```typescript
 * const cost = getEventCostByKind(30023); // Long-form content
 * console.log(`Cost: ${cost} msats`); // "Cost: 500 msats"
 * ```
 */
export function getEventCostByKind(kind: number, config?: PricingConfig): number {
  const pricingConfig = config || loadPricingConfig()

  if (kind in pricingConfig.per_kind) {
    return pricingConfig.per_kind[kind]
  }

  return pricingConfig.per_kind.default
}

/**
 * Validate payment amount against required cost.
 *
 * @param paidAmount - Amount paid (in msats)
 * @param requiredAmount - Required amount (in msats)
 * @returns Object with validation result and error message if invalid
 *
 * @example
 * ```typescript
 * const result = validatePaymentAmount(100, 50);
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validatePaymentAmount(
  paidAmount: number,
  requiredAmount: number,
): { valid: boolean; error?: string } {
  if (paidAmount < requiredAmount) {
    return {
      valid: false,
      error: `Insufficient payment: required ${requiredAmount} msats, got ${paidAmount} msats`,
    }
  }

  return { valid: true }
}

/**
 * Load full BTP-NIPs configuration from settings file.
 *
 * This includes pricing, storage, and ILP settings.
 *
 * @param configPath - Optional path to settings file
 * @returns Full configuration object
 *
 * @example
 * ```typescript
 * const config = loadBTPNIPsConfig();
 * if (config.btp_nips?.enabled) {
 *   console.log('BTP-NIPs is enabled');
 * }
 * ```
 */
export function loadBTPNIPsConfig(configPath?: string): BTPNIPsConfig {
  const path = configPath || join(process.cwd(), '.nostr', 'settings.yaml')

  try {
    const fileContent = readFileSync(path, 'utf-8')
    const config = parseYaml(fileContent) as BTPNIPsConfig
    debug('Loaded BTP-NIPs config from %s', path)
    return config
  } catch (error) {
    debug('Failed to load BTP-NIPs config from %s: %o', path, error)
    return {}
  }
}

/**
 * Get configuration value with type safety.
 *
 * @param key - Configuration key path (e.g., 'btp_nips.storage.cache.ttl_seconds')
 * @param defaultValue - Default value if key not found
 * @returns Configuration value or default
 */
export function getConfigValue<T>(key: string, defaultValue: T): T {
  const config = loadBTPNIPsConfig()
  const keys = key.split('.')
  let value: any = config

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k]
    } else {
      return defaultValue
    }
  }

  return value ?? defaultValue
}

/**
 * Reset loaded pricing (for testing).
 *
 * Forces pricing to be reloaded from file on next access.
 *
 * @internal
 */
export function resetPricingConfig(): void {
  loadedPricing = null
}
