/**
 * Example: Integrating Dassie Routing Statistics with Nostream
 *
 * This file demonstrates how to use the Dassie routing stats RPC endpoint
 * from a Nostream relay to track ILP connector revenue and fees.
 *
 * Prerequisites:
 * - Dassie node running with Stories 2.4-2.8 complete (all settlement modules)
 * - Dassie RPC server accessible at ws://localhost:5000/rpc
 * - RPC authentication configured (Story 2.2)
 */

import { createRpcClient } from "@dassie/lib-rpc/client"
import type { AppRouter } from "packages/app-dassie/src/rpc-server/app-router"

// ============================================================================
// Configuration
// ============================================================================

const DASSIE_RPC_URL = process.env.DASSIE_RPC_URL || "ws://localhost:5000/rpc"
const POLL_INTERVAL_MS = 60000 // Poll every 60 seconds

// ============================================================================
// Type Definitions (from Dassie)
// ============================================================================

interface RoutingStatsOutput {
  paymentsRouted24h: number // ILP packets forwarded in last 24h
  routingFeesEarned: Record<string, bigint> // Fees per settlement scheme
  connectorRevenue: Record<string, bigint> // Total revenue per settlement scheme
  activePeers: number // Connected Dassie peers
  timestamp: number // Unix timestamp (seconds)
}

// ============================================================================
// Create RPC Client
// ============================================================================

const dassieClient = createRpcClient<AppRouter>({
  url: DASSIE_RPC_URL,
})

// ============================================================================
// Query Routing Stats
// ============================================================================

async function fetchRoutingStats(): Promise<RoutingStatsOutput> {
  try {
    const stats = await dassieClient.ledgers.getRoutingStats.query()

    console.log("Routing Statistics Retrieved:")
    console.log(`  Timestamp: ${new Date(stats.timestamp * 1000).toISOString()}`)
    console.log(`  Active Peers: ${stats.activePeers}`)
    console.log(`  Payments Routed (24h): ${stats.paymentsRouted24h}`)

    console.log("\nRouting Fees Earned:")
    for (const [ledgerId, fees] of Object.entries(stats.routingFeesEarned)) {
      console.log(`  ${ledgerId}: ${fees} (smallest unit)`)
    }

    console.log("\nConnector Revenue:")
    for (const [ledgerId, revenue] of Object.entries(
      stats.connectorRevenue,
    )) {
      console.log(`  ${ledgerId}: ${revenue} (smallest unit)`)
    }

    return stats
  } catch (error) {
    console.error("Failed to fetch routing stats:", error)
    throw error
  }
}

// ============================================================================
// Store Stats in Nostream Database (Example)
// ============================================================================

interface EconomicSnapshot {
  timestamp: Date
  routingFeesXrp: bigint
  routingFeesBtc: bigint
  routingFeesEth: bigint
  routingFeesAkt: bigint
  activePeers: number
  paymentsRouted24h: number
}

async function storeStatsInDatabase(
  stats: RoutingStatsOutput,
): Promise<void> {
  // Example: Store in Nostream's economic_snapshots table
  const snapshot: EconomicSnapshot = {
    timestamp: new Date(stats.timestamp * 1000),
    routingFeesXrp: stats.routingFeesEarned["xrpl+xrp"] ?? 0n,
    routingFeesBtc: stats.routingFeesEarned["btc+lightning-testnet+btc"] ?? 0n,
    routingFeesEth: stats.routingFeesEarned["eth+base-sepolia+eth"] ?? 0n,
    routingFeesAkt: stats.routingFeesEarned["akt+cosmos-akash+akt"] ?? 0n,
    activePeers: stats.activePeers,
    paymentsRouted24h: stats.paymentsRouted24h,
  }

  // In a real implementation, insert into PostgreSQL:
  // await db.economicSnapshots.create(snapshot)
  console.log("\nStored snapshot in database:", snapshot)
}

// ============================================================================
// Dashboard API Endpoint (Example)
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"

function registerDashboardRoutes(fastify: FastifyInstance): void {
  // GET /dashboard/routing-stats - Current routing statistics
  fastify.get(
    "/dashboard/routing-stats",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const stats = await fetchRoutingStats()
        return reply.status(200).send(stats)
      } catch (error) {
        return reply.status(500).send({
          error: "Failed to fetch routing stats",
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },
  )

  // GET /dashboard/routing-stats/history - Historical data (example)
  fastify.get(
    "/dashboard/routing-stats/history",
    async (
      request: FastifyRequest<{
        Querystring: { days?: number }
      }>,
      reply: FastifyReply,
    ) => {
      const days = request.query.days ?? 7

      // In a real implementation, query from database:
      // const history = await db.economicSnapshots.findAll({
      //   where: { timestamp: { $gte: new Date(Date.now() - days * 86400000) } }
      // })

      return reply.status(200).send({
        days,
        snapshots: [], // Replace with actual data
      })
    },
  )
}

// ============================================================================
// Background Polling Service
// ============================================================================

class RoutingStatsPoller {
  private intervalId: NodeJS.Timeout | null = null

  start(): void {
    console.log(
      `Starting routing stats poller (interval: ${POLL_INTERVAL_MS}ms)`,
    )

    this.intervalId = setInterval(async () => {
      try {
        const stats = await fetchRoutingStats()
        await storeStatsInDatabase(stats)
      } catch (error) {
        console.error("Polling error:", error)
      }
    }, POLL_INTERVAL_MS)

    // Fetch immediately on start
    void fetchRoutingStats().then(storeStatsInDatabase).catch(console.error)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log("Routing stats poller stopped")
    }
  }
}

// ============================================================================
// Main Execution
// ============================================================================

async function main(): Promise<void> {
  console.log("=".repeat(70))
  console.log("Dassie Routing Statistics Integration Example")
  console.log("=".repeat(70))

  try {
    // Fetch stats once
    const stats = await fetchRoutingStats()

    // Store in database (example)
    await storeStatsInDatabase(stats)

    // Start background poller
    const poller = new RoutingStatsPoller()
    poller.start()

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("\nShutting down...")
      poller.stop()
      process.exit(0)
    })
  } catch (error) {
    console.error("Fatal error:", error)
    process.exit(1)
  }
}

// Run if executed directly
if (require.main === module) {
  void main()
}

// ============================================================================
// Exports for Integration
// ============================================================================

export {
  fetchRoutingStats,
  storeStatsInDatabase,
  registerDashboardRoutes,
  RoutingStatsPoller,
  type RoutingStatsOutput,
  type EconomicSnapshot,
}
