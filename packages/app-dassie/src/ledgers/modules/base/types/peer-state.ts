/**
 * State for a Base L2 payment channel peer.
 */
export interface BaseChannelState {
  /** Unique channel ID (bytes32 from contract) */
  channelId: string

  /** Ethereum address of the payer (sender) */
  sender: string

  /** Relay's Ethereum address (recipient) */
  recipient: string

  /** Token address (address(0) for ETH, ERC-20 address for tokens) */
  tokenAddress: string

  /** Total locked funds in channel (wei or token units) */
  balance: bigint

  /** Last verified nonce */
  highestNonce: number

  /** Largest verified claim amount (wei or token units) */
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
export interface BasePaymentClaim {
  /** Channel ID */
  channelId: string

  /** Claim amount in wei */
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
