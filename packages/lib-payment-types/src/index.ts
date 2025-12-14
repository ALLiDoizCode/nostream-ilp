/**
 * Shared payment types for Nostream-ILP integration
 *
 * This package contains TypeScript types and interfaces used across both
 * the Nostream relay (@nostream-ilp/app-nostream) and Dassie ILP node
 * (@nostream-ilp/app-dassie) for payment processing.
 */

// ============================================================================
// Payment Claim Types
// ============================================================================

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

// ============================================================================
// Dassie tRPC Router Types
// ============================================================================

/**
 * Account balance response from Dassie ledger
 */
export interface BalanceResponse {
  balance: bigint
  accountPath: string
  lastUpdated: number
}

/**
 * Balance update from subscription
 */
export interface BalanceUpdate {
  balance: bigint
  delta: bigint
  timestamp: number
  reason: string
}

/**
 * Payment claim verification result
 */
export interface PaymentClaimVerification {
  valid: boolean
  error?: string
}

/**
 * Currency conversion result
 */
export interface ConversionResult {
  success: boolean
  amountAKT?: bigint
  exchangeRate?: number
  transactionId?: string
  error?: string
}

/**
 * Channel claim result
 */
export interface ClaimResult {
  channelId: string
  amountClaimed: bigint
  currency: string
  success: boolean
  error?: string
}

/**
 * Routing statistics
 */
export interface RoutingStats {
  totalPacketsRouted: number
  totalAmountRouted: bigint
  successRate: number
  averageLatencyMs: number
}

/**
 * Dassie tRPC AppRouter interface
 *
 * This interface defines the type contract for the Dassie RPC API
 * that Nostream uses to verify payments and interact with the ledger.
 */
export interface AppRouter {
  ledger: {
    getBalance: {
      query: (params: { accountPath: string }) => Promise<BalanceResponse>
    }
    subscribeToAccount: {
      subscribe: (params: { accountPath: string }) => {
        on: (event: 'data', callback: (data: BalanceUpdate) => void) => void
        off: (event: 'data', callback: (data: BalanceUpdate) => void) => void
        unsubscribe: () => void
      }
    }
  }
  payment: {
    verifyPaymentClaim: {
      query: (claim: PaymentClaim) => Promise<PaymentClaimVerification>
    }
    convertToAKT: {
      mutate: (
        params: { amount: bigint; fromCurrency: string; slippageTolerance?: number },
      ) => Promise<ConversionResult>
    }
    claimAllChannels: {
      mutate: (params: { currency?: string }) => Promise<ClaimResult[]>
    }
    getRoutingStats: {
      query: () => Promise<RoutingStats>
    }
  }
}

// ============================================================================
// Payment Channel State Types
// ============================================================================

/**
 * Payment channel state tracked in database
 *
 * This interface represents the state of a payment channel stored in the
 * Nostream PostgreSQL database for tracking user balances and nonces.
 */
export interface PaymentChannelState {
  channelId: string
  currency: PaymentCurrency
  balance: number
  lastNonce: number
  createdAt: Date
  updatedAt: Date
}
