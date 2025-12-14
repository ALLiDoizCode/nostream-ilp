export interface LightningPeerState {
  /** Lightning channel ID (funding transaction output) */
  channelId: string

  /** Short channel ID (after confirmations) */
  shortChannelId?: string | undefined

  /** Peer's Lightning node public key */
  peerPubkey: string

  /** Channel capacity in satoshis */
  capacity: bigint

  /** Our local balance in satoshis */
  localBalance: bigint

  /** Peer's remote balance in satoshis */
  remoteBalance: bigint

  /** Channel status */
  status: "pending" | "active" | "closing" | "closed"
}
