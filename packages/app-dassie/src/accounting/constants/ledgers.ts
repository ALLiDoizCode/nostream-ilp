import type { Tagged } from "type-fest"

import type { CurrencyId } from "../../exchange/constants/currencies"

export const LEDGERS = {
  "stub+usd": {
    currency: "USD",
  },
  "xrpl+xrp": {
    currency: "XRP",
  },
  "xrpl-testnet+xrp": {
    currency: "XRP",
  },
  "btc+lightning-testnet+btc": {
    currency: "BTC",
  },
  "eth+base-sepolia+eth": {
    currency: "ETH",
  },
  "akt+cosmos-akash+akt": {
    currency: "AKT",
  },
  "akt+cronos-testnet+akt": {
    currency: "AKT",
  },
} as const satisfies Record<string, LedgerDefinition>

export interface LedgerDefinition {
  currency: CurrencyId
}

export type LedgerId = Tagged<keyof typeof LEDGERS, "LedgerId">
