import { describe, expect, test, vi } from "vitest"

import type { LedgerAccount } from "../../accounting/stores/ledger"
import type { LedgerId } from "../../accounting/constants/ledgers"
import type { NodeId } from "../../peer-protocol/types/node-id"
import { GetRoutingStats } from "./get-routing-stats"

/**
 * Unit tests for GetRoutingStats function
 * Tests routing statistics calculation logic with mocked dependencies
 */

describe("GetRoutingStats", () => {
  const createMockReactor = (
    accounts: LedgerAccount[],
    peerCount: number,
  ) => {
    const mockLedgerStore = {
      getAccounts: vi.fn((prefix: string) => {
        return accounts.filter((acc) => acc.path.includes(prefix))
      }),
    }

    const mockPeersSignal = {
      read: vi.fn(() => {
        const peers = new Set<NodeId>()
        for (let i = 0; i < peerCount; i++) {
          peers.add(`peer${i}` as NodeId)
        }
        return peers
      }),
    }

    return {
      use: vi.fn((factory: unknown) => {
        if (factory.name === "LedgerStore") return mockLedgerStore
        if (factory.name === "PeersSignal") return mockPeersSignal
        throw new Error(`Unknown factory: ${String(factory)}`)
      }),
    } as any
  }

  test("returns valid stats structure with all required fields", () => {
    const mockAccounts: LedgerAccount[] = [
      {
        path: "xrpl+xrp:revenue/fees" as any,
        creditsPosted: 5000n,
        debitsPosted: 0n,
        debitsPending: 0n,
        creditsPending: 0n,
        limit: "no_limit",
      },
    ]

    const reactor = createMockReactor(mockAccounts, 3)
    const getRoutingStats = GetRoutingStats(reactor)
    const result = getRoutingStats()

    expect(result).toHaveProperty("paymentsRouted24h")
    expect(result).toHaveProperty("routingFeesEarned")
    expect(result).toHaveProperty("connectorRevenue")
    expect(result).toHaveProperty("activePeers")
    expect(result).toHaveProperty("timestamp")
  })

  test("handles empty revenue accounts (no routing activity)", () => {
    const reactor = createMockReactor([], 0)
    const getRoutingStats = GetRoutingStats(reactor)
    const result = getRoutingStats()

    expect(result.routingFeesEarned).toEqual({})
    expect(result.connectorRevenue).toEqual({})
    expect(result.activePeers).toBe(0)
    expect(result.paymentsRouted24h).toBe(0)
  })

  test("aggregates routing fees correctly per settlement scheme", () => {
    const mockAccounts: LedgerAccount[] = [
      {
        path: "xrpl+xrp:revenue/fees" as any,
        creditsPosted: 5000n,
        debitsPosted: 0n,
        debitsPending: 0n,
        creditsPending: 0n,
        limit: "no_limit",
      },
      {
        path: "btc+lightning-testnet+btc:revenue/fees" as any,
        creditsPosted: 10000n,
        debitsPosted: 2000n,
        debitsPending: 0n,
        creditsPending: 0n,
        limit: "no_limit",
      },
      {
        path: "eth+base-sepolia+eth:revenue/fees" as any,
        creditsPosted: 3000n,
        debitsPosted: 500n,
        debitsPending: 0n,
        creditsPending: 0n,
        limit: "no_limit",
      },
    ]

    const reactor = createMockReactor(mockAccounts, 5)
    const getRoutingStats = GetRoutingStats(reactor)
    const result = getRoutingStats()

    expect(result.routingFeesEarned["xrpl+xrp"]).toBe(5000n)
    expect(result.routingFeesEarned["btc+lightning-testnet+btc"]).toBe(8000n)
    expect(result.routingFeesEarned["eth+base-sepolia+eth"]).toBe(2500n)
  })

  test("counts active peers correctly", () => {
    const mockAccounts: LedgerAccount[] = []
    const reactor = createMockReactor(mockAccounts, 8)
    const getRoutingStats = GetRoutingStats(reactor)
    const result = getRoutingStats()

    expect(result.activePeers).toBe(8)
  })

  test("includes valid timestamp (within last 5 seconds)", () => {
    const reactor = createMockReactor([], 0)
    const getRoutingStats = GetRoutingStats(reactor)
    const beforeCall = Math.floor(Date.now() / 1000)
    const result = getRoutingStats()
    const afterCall = Math.floor(Date.now() / 1000)

    expect(result.timestamp).toBeGreaterThanOrEqual(beforeCall)
    expect(result.timestamp).toBeLessThanOrEqual(afterCall + 1)
  })

  test("connectorRevenue equals routingFeesEarned", () => {
    const mockAccounts: LedgerAccount[] = [
      {
        path: "xrpl+xrp:revenue/fees" as any,
        creditsPosted: 12345n,
        debitsPosted: 0n,
        debitsPending: 0n,
        creditsPending: 0n,
        limit: "no_limit",
      },
    ]

    const reactor = createMockReactor(mockAccounts, 1)
    const getRoutingStats = GetRoutingStats(reactor)
    const result = getRoutingStats()

    expect(result.connectorRevenue).toEqual(result.routingFeesEarned)
  })

  test("handles multiple settlement schemes simultaneously", () => {
    const mockAccounts: LedgerAccount[] = [
      {
        path: "xrpl+xrp:revenue/fees" as any,
        creditsPosted: 1000n,
        debitsPosted: 0n,
        debitsPending: 0n,
        creditsPending: 0n,
        limit: "no_limit",
      },
      {
        path: "btc+lightning-testnet+btc:revenue/fees" as any,
        creditsPosted: 2000n,
        debitsPosted: 0n,
        debitsPending: 0n,
        creditsPending: 0n,
        limit: "no_limit",
      },
      {
        path: "eth+base-sepolia+eth:revenue/fees" as any,
        creditsPosted: 3000n,
        debitsPosted: 0n,
        debitsPending: 0n,
        creditsPending: 0n,
        limit: "no_limit",
      },
      {
        path: "akt+cosmos-akash+akt:revenue/fees" as any,
        creditsPosted: 4000n,
        debitsPosted: 0n,
        debitsPending: 0n,
        creditsPending: 0n,
        limit: "no_limit",
      },
    ]

    const reactor = createMockReactor(mockAccounts, 10)
    const getRoutingStats = GetRoutingStats(reactor)
    const result = getRoutingStats()

    expect(Object.keys(result.routingFeesEarned)).toHaveLength(4)
    expect(result.routingFeesEarned["xrpl+xrp"]).toBe(1000n)
    expect(result.routingFeesEarned["btc+lightning-testnet+btc"]).toBe(2000n)
    expect(result.routingFeesEarned["eth+base-sepolia+eth"]).toBe(3000n)
    expect(result.routingFeesEarned["akt+cosmos-akash+akt"]).toBe(4000n)
    expect(result.activePeers).toBe(10)
  })

  test("paymentsRouted24h is 0 (packet counting not yet implemented)", () => {
    const reactor = createMockReactor([], 0)
    const getRoutingStats = GetRoutingStats(reactor)
    const result = getRoutingStats()

    expect(result.paymentsRouted24h).toBe(0)
  })
})
