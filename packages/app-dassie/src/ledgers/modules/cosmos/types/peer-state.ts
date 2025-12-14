/**
 * Cosmos peer state tracked by Dassie.
 *
 * For Akash, we use direct IBC bank transfers instead of payment channels.
 * This tracks the peer's Cosmos address and settlement history.
 */
export interface CosmosPeerState {
  /** Cosmos address of the peer (akash1...) */
  peerAddress: string

  /** Relay's Cosmos address (akash1...) */
  relayAddress: string

  /** Total amount received from this peer (uakt) */
  totalReceived: string

  /** Token denomination (e.g., "uakt") */
  denom: string

  /** Timestamp of last settlement received */
  lastSettlementTime: number

  /** Count of settlements received */
  settlementCount: number
}
