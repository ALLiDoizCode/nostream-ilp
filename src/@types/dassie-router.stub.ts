/**
 * Stub type for Dassie AppRouter until Epic 2 Dassie fork is complete
 *
 * TODO: Replace with real AppRouter from @dassie/app-dassie after Epic 2
 *
 * This stub defines the expected tRPC router interface for the Dassie ILP node.
 * The actual implementation will be added to the Dassie fork in Epic 2.
 */

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
 * Stub AppRouter interface matching expected Dassie RPC API
 *
 * This interface will be implemented in the Dassie fork during Epic 2.
 * For now, it serves as a type contract for the dassie-client.
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
      query: (claim: any) => Promise<PaymentClaimVerification>
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
