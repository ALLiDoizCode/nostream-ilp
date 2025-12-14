import type { XrplPaymentChannelState } from "./payment-channel-state"

export interface XrplPeerState {
  /**
   * Peer's XRP address (for traditional settlement)
   */
  address: string

  /**
   * Active payment channels with this peer
   *
   * @remarks
   *
   * Keyed by channel ID. Only tracks channels where this node is the recipient.
   */
  paymentChannels?: Record<string, XrplPaymentChannelState>
}
