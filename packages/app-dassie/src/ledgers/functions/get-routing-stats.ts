import type { Reactor } from "@dassie/lib-reactive"

import { LedgerStore } from "../../accounting/stores/ledger"
import type { LedgerId } from "../../accounting/constants/ledgers"
import { settlement as logger } from "../../logger/instances"
import { PeersSignal } from "../../peer-protocol/computed/peers"

export interface RoutingStatsOutput {
  paymentsRouted24h: number
  routingFeesEarned: Record<string, bigint>
  connectorRevenue: Record<string, bigint>
  activePeers: number
  timestamp: number
}

export const GetRoutingStats = (reactor: Reactor) => {
  const ledgerStore = reactor.use(LedgerStore)
  const peersSignal = reactor.use(PeersSignal)

  return (): RoutingStatsOutput => {
    logger.debug("querying routing statistics")

    // Query all revenue/fees accounts from the ledger
    const revenueAccounts = ledgerStore.getAccounts("revenue/fees")

    // Aggregate routing fees by ledger ID (settlement scheme)
    const routingFeesEarned: Record<string, bigint> = {}
    const connectorRevenue: Record<string, bigint> = {}

    for (const account of revenueAccounts) {
      // Extract ledger ID from account path (format: "{ledgerId}:revenue/fees")
      const ledgerId = account.path.split(":")[0] as LedgerId

      // Calculate net fees: credits - debits
      const netFees = account.creditsPosted - account.debitsPosted

      routingFeesEarned[ledgerId] = netFees
      connectorRevenue[ledgerId] = netFees
    }

    // Count active peers
    const activePeers = peersSignal.read().size

    logger.debug("routing statistics calculated", {
      ledgerCount: Object.keys(routingFeesEarned).length,
      activePeers,
    })

    return {
      paymentsRouted24h: 0, // TODO: Implement packet counting in future
      routingFeesEarned,
      connectorRevenue,
      activePeers,
      timestamp: Math.floor(Date.now() / 1000),
    }
  }
}
