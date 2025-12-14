export const CURRENCIES = {
  USD: {
    code: "USD",
    scale: 9,
  },
  XRP: {
    code: "XRP",
    scale: 9,
  },
  BTC: {
    code: "BTC",
    scale: 9,
  },
  ETH: {
    code: "ETH",
    scale: 9,
  },
  AKT: {
    code: "AKT",
    scale: 9,
  },
} as const

export type CurrencyId = keyof typeof CURRENCIES
