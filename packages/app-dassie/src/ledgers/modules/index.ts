import type { SettlementSchemeModule } from "../types/settlement-scheme-module"

const modules: Record<
  string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  () => Promise<{ default: SettlementSchemeModule<any> }>
> = {
  stub: () => import("./stub"),
  "btc+lightning-testnet+btc": () =>
    import("./lightning/lightning-testnet.js"),
  "eth+base-sepolia+eth": () => import("./base/base-sepolia.js"),
  "eth+base+eth": () => import("./base/base-mainnet.js"),
  "akt+cosmos-akash+akt": () => import("./cosmos/cosmos-akash.js"),
  "akt+cronos-testnet+akt": () => import("./cronos/cronos-testnet.js"),
  "xrpl-testnet": () => import("./xrpl/xrpl-testnet"),
}

export default modules
