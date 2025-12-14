import type { Reactor } from "@dassie/lib-reactive"

import { Database } from "../../database/open-database"

export const updateChannelNonce = (
  reactor: Reactor,
  channelId: string,
  newNonce: bigint,
): void => {
  const database = reactor.use(Database)

  database.executeSync(
    database.kysely
      .updateTable("payment_channels")
      .where("channel_id", "=", channelId)
      .set({
        highest_nonce: newNonce,
        updated_at: BigInt(Date.now()),
      })
      .compile(),
  )
}
