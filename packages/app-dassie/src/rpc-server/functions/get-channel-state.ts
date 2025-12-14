import type { Reactor } from "@dassie/lib-reactive"

import { Database } from "../../database/open-database"

export interface ChannelState {
  channelId: string
  senderPubkey: string
  recipientPubkey: string
  currency: "BTC" | "BASE" | "AKT" | "XRP"
  capacitySats: bigint
  highestNonce: bigint
  expiration: bigint // Unix timestamp in milliseconds
  status: "open" | "closed" | "expired"
}

export const getChannelState = (
  reactor: Reactor,
  channelId: string,
): ChannelState | undefined => {
  const database = reactor.use(Database)

  const row = database.tables.paymentChannels.selectFirst({
    channel_id: channelId,
  })

  if (!row) {
    return undefined
  }

  return {
    channelId: row.channel_id,
    senderPubkey: row.sender_pubkey,
    recipientPubkey: row.recipient_pubkey,
    currency: row.currency,
    capacitySats: BigInt(row.capacity_sats),
    highestNonce: BigInt(row.highest_nonce),
    expiration: BigInt(row.expiration),
    status: row.status,
  }
}
