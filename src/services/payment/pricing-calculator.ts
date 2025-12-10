import { Event } from '../../@types/event'
import { pricingConfig } from './pricing-config'

/**
 * Pricing Calculator Module
 *
 * Calculates required payment amounts for relay operations based on
 * configured pricing and event characteristics.
 *
 * @module services/payment/pricing-calculator
 */

/**
 * Calculate required payment for a relay operation
 *
 * Determines the payment amount (in satoshis) required for a given operation,
 * with support for per-kind pricing overrides for specialized content.
 *
 * @param {string} operation - Operation type: 'store', 'deliver', or 'query'
 * @param {Event} [event] - Optional event for kind-based pricing (used for 'store' operation)
 * @returns {bigint} Required payment amount in satoshis
 *
 * @example
 * ```typescript
 * // Store operation with default pricing
 * const price = calculateRequiredPayment('store', event)
 * // Returns 10n (default storeEvent price)
 *
 * // Store operation with kind override
 * const articleEvent = { kind: 30023, ... }
 * const price = calculateRequiredPayment('store', articleEvent)
 * // Returns 100n (if PRICING_KIND_OVERRIDES="30023:100")
 *
 * // Deliver operation (event parameter ignored)
 * const price = calculateRequiredPayment('deliver')
 * // Returns 1n (default deliverEvent price)
 *
 * // Query operation
 * const price = calculateRequiredPayment('query')
 * // Returns 5n (default query price)
 *
 * // Unknown operation (graceful degradation)
 * const price = calculateRequiredPayment('unknown')
 * // Returns 0n (no charge)
 * ```
 */
export function calculateRequiredPayment(operation: string, event?: Event): bigint {
  // Store operation: check for kind-based pricing override
  if (operation === 'store') {
    if (event && pricingConfig.kindOverrides.has(event.kind)) {
      return pricingConfig.kindOverrides.get(event.kind)!
    }
    return pricingConfig.storeEvent
  }

  // Deliver operation: cost per event delivered
  if (operation === 'deliver') {
    return pricingConfig.deliverEvent
  }

  // Query operation: cost per REQ subscription
  if (operation === 'query') {
    return pricingConfig.query
  }

  // Unknown operation: no charge (graceful degradation)
  return 0n
}
