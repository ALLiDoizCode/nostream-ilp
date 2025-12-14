/**
 * XRP Ledger Payment Channel State
 *
 * @remarks
 *
 * This interface tracks the state of an XRP payment channel for Dassie's
 * internal accounting and claim verification. It mirrors the on-chain
 * payment channel structure from XRPL but adds Dassie-specific tracking.
 */
export interface XrplPaymentChannelState {
  /**
   * Payment channel ID (64-character hex string from XRPL)
   */
  channelId: string

  /**
   * XRP address of the payer (sender, starts with 'r')
   */
  sender: string

  /**
   * Relay's XRP address (recipient, starts with 'r')
   */
  recipient: string

  /**
   * Total XRP locked in the channel (in drops: 1 XRP = 1,000,000 drops)
   */
  amount: string

  /**
   * Remaining balance in the channel (in drops)
   */
  balance: string

  /**
   * Time delay before channel can close after claim submission (seconds)
   */
  settleDelay: number

  /**
   * Optional expiration time (Ripple epoch seconds)
   *
   * @remarks
   *
   * If set, the channel automatically closes at this time.
   * Ripple epoch starts at 2000-01-01T00:00:00Z (946684800 Unix time).
   */
  expiration?: number

  /**
   * Sender's public key for Ed25519 signature verification (hex string)
   */
  publicKey: string

  /**
   * Largest verified claim amount (in drops)
   *
   * @remarks
   *
   * Claims must be monotonically increasing. This tracks the highest
   * claim we've verified off-chain.
   */
  highestClaimAmount: string

  /**
   * Last verified nonce (for Nostr integration)
   *
   * @remarks
   *
   * Not used by XRPL payment channels natively, but tracked for
   * Nostr-ILP integration to prevent replay attacks.
   */
  highestNonce: number

  /**
   * Current channel status
   */
  status: "OPEN" | "CLOSING" | "CLOSED" | "EXPIRED"

  /**
   * Timestamp of last claim verification (Unix milliseconds)
   */
  lastClaimTime: number

  /**
   * Total number of verified claims (for settlement strategy)
   */
  totalClaims: number

  /**
   * Channel creation timestamp (Unix milliseconds)
   */
  createdAt: number
}

/**
 * Payment claim structure for Nostr-ILP integration
 *
 * @remarks
 *
 * This structure is used when verifying payment claims from Nostream relay.
 * The relay sends claims in this format via RPC to Dassie for verification.
 */
export interface XrpPaymentClaim {
  /**
   * Payment channel ID (64-character hex string)
   */
  channelId: string

  /**
   * Amount in standardized sats (converted to drops internally)
   *
   * @remarks
   *
   * For MVP (Story 2.8), we use 1:1 conversion (1 sat = 1 drop).
   * Accurate conversion deferred to Story 2.9 exchange rate oracle.
   */
  amountSats: number

  /**
   * Monotonic nonce counter (for Nostr integration)
   */
  nonce: number

  /**
   * Ed25519 signature from sender (hex string)
   *
   * @remarks
   *
   * Signature format must match XRPL payment channel claim spec:
   * sign(CLM\0 + channelId + amountDrops)
   */
  signature: string

  /**
   * Currency identifier (always 'XRP' for this module)
   */
  currency: "XRP"

  /**
   * Optional Nostr event ID (for tracking)
   */
  nostrEventId?: string

  /**
   * Optional Nostr event kind (for tracking)
   */
  nostrEventKind?: number

  /**
   * Optional timestamp (Unix milliseconds)
   */
  timestamp?: number
}
