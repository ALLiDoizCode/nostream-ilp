import { type InferRow, column, table } from "@dassie/lib-sqlite"

import type { LedgerId } from "../../accounting/constants/ledgers"

export const outgoingPaymentTable = table({
  name: "outgoing_payment",
  columns: {
    id: column().type("TEXT").notNull().primaryKey(),
    destination: column().type("TEXT").notNull(),
    ledger: column().type("TEXT").notNull().typescriptType<LedgerId>(),
    total_amount: column().type("INTEGER").notNull(),
    metadata: column().type("TEXT").notNull(),
    status: column()
      .type("TEXT")
      .notNull()
      .default("'pending'")
      .typescriptType<"pending" | "fulfilled" | "failed">(),
    sent_amount: column().type("INTEGER").notNull().default("0"),
    error: column().type("TEXT"),
  },
})

export type OutgoingPaymentRow = InferRow<typeof outgoingPaymentTable>
