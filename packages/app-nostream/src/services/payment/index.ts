
/**
 * Payment services barrel export
 *
 * This module provides a clean import interface for all payment-related services.
 */

// Parser exports
export {
  extractPaymentClaim,
  validateClaimFormat,
  isValidChannelId,
  isValidAmount,
  isValidNonce,
  isValidSignature,
  isValidCurrency,
  type NostrEvent,
} from './payment-claim-parser'

// Dassie RPC client export
export { DassieClient } from './dassie-client'

// Pricing configuration and calculator exports (Story 1.5)
export { pricingConfig, loadPricingConfig, type PricingConfig } from './pricing-config'
export { calculateRequiredPayment } from './pricing-calculator'

// Free tier tracker exports (Story 1.6)
export { FreeTierTracker, type FreeTierStatus } from './free-tier-tracker'

// Type exports
export type { PaymentClaim, PaymentCurrency, ILPPaymentClaim } from '../../@types/payment-claim'
export { SUPPORTED_CURRENCIES } from '../../@types/payment-claim'
