/**
 * State for a Cronos payment channel peer.
 * CRITICAL: AKT uses 6 decimals, not 18 like ETH.
 */
export interface CronosChannelState {
  /** Unique channel ID (bytes32 from contract) */
  channelId: string

  /** Ethereum address of the payer (sender) */
  sender: string

  /** Relay's Ethereum address (recipient) */
  recipient: string

  /** Total locked AKT in channel (6 decimals) */
  balance: bigint

  /** Last verified nonce */
  highestNonce: number

  /** Largest verified claim amount (AKT with 6 decimals) */
  highestClaimAmount: bigint

  /** Unix timestamp when channel expires */
  expiration: number

  /** Channel status */
  isClosed: boolean

  /** Last claim timestamp (for settlement timing) */
  lastClaimTime: number

  /** Count of verified claims (for batching) */
  totalClaims: number

  /** Timestamp when channel was created */
  createdAt: number
}

/**
 * Payment claim structure for off-chain verification.
 */
export interface CronosPaymentClaim {
  /** Channel ID */
  channelId: string

  /** Claim amount in AKT (6 decimals) */
  claimAmount: bigint

  /** Monotonic nonce */
  nonce: number

  /** ECDSA signature from sender */
  signature: string

  /** Optional: Associated Nostr event ID */
  nostrEventId?: string

  /** Optional: Nostr event kind */
  nostrEventKind?: number

  /** Optional: Claim timestamp */
  timestamp?: number
}
