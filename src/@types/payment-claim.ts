/**
 * Payment claim structure for ILP payment verification
 *
 * This interface is used across Story 1.3+ for parsing payment claims from Nostr events
 * and verifying them against the Dassie ILP node.
 */

/**
 * Supported payment currencies
 */
export type PaymentCurrency = 'BTC' | 'BASE' | 'AKT' | 'XRP'

/**
 * Array of all supported currencies for runtime validation
 */
export const SUPPORTED_CURRENCIES: readonly PaymentCurrency[] = ['BTC', 'BASE', 'AKT', 'XRP'] as const

/**
 * Payment claim submitted by a client for verification
 *
 * A payment claim represents a request to verify that a payment has been made
 * through a payment channel on one of the supported blockchains.
 *
 * @property channelId - Blockchain-specific channel identifier (e.g., Bitcoin channel ID)
 * @property amountSats - Payment amount in satoshis (or equivalent smallest unit)
 * @property nonce - Monotonically increasing counter to prevent replay attacks
 * @property signature - Hex-encoded cryptographic signature proving channel ownership
 * @property currency - The blockchain currency used for payment
 */
export interface PaymentClaim {
  channelId: string
  amountSats: number
  nonce: number
  signature: string
  currency: PaymentCurrency
}

/**
 * Alias for PaymentClaim to match Epic PRD naming convention
 * @deprecated Use PaymentClaim instead
 */
export type ILPPaymentClaim = PaymentClaim
