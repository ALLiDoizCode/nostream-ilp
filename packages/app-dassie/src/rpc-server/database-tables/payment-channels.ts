import { column, table } from "@dassie/lib-sqlite"

export const paymentChannelsTable = table({
  name: "payment_channels",
  columns: {
    channel_id: column().type("TEXT").primaryKey(),
    sender_pubkey: column().type("TEXT").notNull(),
    recipient_pubkey: column().type("TEXT").notNull(),
    currency: column()
      .type("TEXT")
      .typescriptType<"BTC" | "BASE" | "AKT" | "XRP">()
      .notNull(),
    capacity_sats: column().type("INTEGER").notNull(),
    highest_nonce: column().type("INTEGER").notNull().default(0n),
    expiration: column().type("INTEGER").notNull(), // Unix timestamp
    status: column()
      .type("TEXT")
      .typescriptType<"open" | "closed" | "expired">()
      .notNull()
      .default("open"),
    created_at: column().type("INTEGER").notNull(),
    updated_at: column().type("INTEGER").notNull(),
  },
})
