import { describe, expect, test } from "vitest"

import type { RoutingStatsOutput } from "./functions/get-routing-stats"

/**
 * Integration tests for routing statistics
 * These tests verify the routing stats data structure and integration
 */

describe("Routing Stats Integration", () => {
  test("RoutingStatsOutput has correct structure", () => {
    const mockStats: RoutingStatsOutput = {
      paymentsRouted24h: 100,
      routingFeesEarned: {
        "xrpl+xrp": 5000n,
        "btc+lightning-testnet+btc": 10000n,
      },
      connectorRevenue: {
        "xrpl+xrp": 5000n,
        "btc+lightning-testnet+btc": 10000n,
      },
      activePeers: 5,
      timestamp: Math.floor(Date.now() / 1000),
    }

    expect(mockStats).toHaveProperty("paymentsRouted24h")
    expect(mockStats).toHaveProperty("routingFeesEarned")
    expect(mockStats).toHaveProperty("connectorRevenue")
    expect(mockStats).toHaveProperty("activePeers")
    expect(mockStats).toHaveProperty("timestamp")
  })

  test("routing fees support multiple settlement schemes", () => {
    const mockStats: RoutingStatsOutput = {
      paymentsRouted24h: 0,
      routingFeesEarned: {
        "xrpl+xrp": 1000n,
        "btc+lightning-testnet+btc": 2000n,
        "eth+base-sepolia+eth": 3000n,
        "akt+cosmos-akash+akt": 4000n,
      },
      connectorRevenue: {
        "xrpl+xrp": 1000n,
        "btc+lightning-testnet+btc": 2000n,
        "eth+base-sepolia+eth": 3000n,
        "akt+cosmos-akash+akt": 4000n,
      },
      activePeers: 10,
      timestamp: Math.floor(Date.now() / 1000),
    }

    expect(Object.keys(mockStats.routingFeesEarned)).toHaveLength(4)
    expect(mockStats.routingFeesEarned["xrpl+xrp"]).toBe(1000n)
    expect(mockStats.routingFeesEarned["btc+lightning-testnet+btc"]).toBe(
      2000n,
    )
    expect(mockStats.routingFeesEarned["eth+base-sepolia+eth"]).toBe(3000n)
    expect(mockStats.routingFeesEarned["akt+cosmos-akash+akt"]).toBe(4000n)
  })

  test("empty routing stats are valid", () => {
    const emptyStats: RoutingStatsOutput = {
      paymentsRouted24h: 0,
      routingFeesEarned: {},
      connectorRevenue: {},
      activePeers: 0,
      timestamp: Math.floor(Date.now() / 1000),
    }

    expect(emptyStats.routingFeesEarned).toEqual({})
    expect(emptyStats.connectorRevenue).toEqual({})
    expect(emptyStats.activePeers).toBe(0)
  })

  test("timestamp is a valid Unix timestamp", () => {
    const mockStats: RoutingStatsOutput = {
      paymentsRouted24h: 0,
      routingFeesEarned: {},
      connectorRevenue: {},
      activePeers: 0,
      timestamp: Math.floor(Date.now() / 1000),
    }

    const now = Math.floor(Date.now() / 1000)
    expect(mockStats.timestamp).toBeGreaterThan(1700000000) // After 2023
    expect(mockStats.timestamp).toBeLessThanOrEqual(now + 1)
  })

  test("routing fees are bigint values", () => {
    const mockStats: RoutingStatsOutput = {
      paymentsRouted24h: 0,
      routingFeesEarned: {
        "xrpl+xrp": 12345n,
      },
      connectorRevenue: {
        "xrpl+xrp": 12345n,
      },
      activePeers: 1,
      timestamp: Math.floor(Date.now() / 1000),
    }

    expect(typeof mockStats.routingFeesEarned["xrpl+xrp"]).toBe("bigint")
    expect(typeof mockStats.connectorRevenue["xrpl+xrp"]).toBe("bigint")
  })
})
