/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, beforeEach } from "vitest"
import { loadBaseConfig, validateBaseConfig } from "./config"
import { shouldSettleChannel } from "./functions/channel-operations"
import type { BaseChannelState } from "./types/peer-state"

describe("Base L2 Settlement Module", () => {
  describe("Configuration", () => {
    it("should load configuration from environment", () => {
      const config = loadBaseConfig()

      expect(config).toBeDefined()
      expect(config.realm).toBe("test")
      expect(config.contractAddress).toBeDefined()
    })

    it("should validate correct configuration", () => {
      const validConfig = {
        enabled: true,
        rpcUrl: "https://sepolia.base.org",
        contractAddress: "0x" + "1".repeat(40),
        relayAddress: "0x" + "2".repeat(40),
        privateKey: "0x" + "3".repeat(64),
        settlementThreshold: 100_000_000_000_000_000n,
        settlementInterval: 3600,
        gasLimit: 500_000,
        maxFeePerGas: 10_000_000_000n,
        realm: "test" as const,
      }

      expect(() => validateBaseConfig(validConfig)).not.toThrow()
    })

    it("should reject invalid contract address", () => {
      const invalidConfig = {
        enabled: true,
        rpcUrl: "https://sepolia.base.org",
        contractAddress: "invalid",
        relayAddress: "0x" + "2".repeat(40),
        privateKey: "0x" + "3".repeat(64),
        settlementThreshold: 100_000_000_000_000_000n,
        settlementInterval: 3600,
        gasLimit: 500_000,
        maxFeePerGas: 10_000_000_000n,
        realm: "test" as const,
      }

      expect(() => validateBaseConfig(invalidConfig)).toThrow(
        "BASE_PAYMENT_CHANNEL_ADDRESS must be a valid Ethereum address",
      )
    })

    it("should reject invalid private key", () => {
      const invalidConfig = {
        enabled: true,
        rpcUrl: "https://sepolia.base.org",
        contractAddress: "0x" + "1".repeat(40),
        relayAddress: "0x" + "2".repeat(40),
        privateKey: "invalid",
        settlementThreshold: 100_000_000_000_000_000n,
        settlementInterval: 3600,
        gasLimit: 500_000,
        maxFeePerGas: 10_000_000_000n,
        realm: "test" as const,
      }

      expect(() => validateBaseConfig(invalidConfig)).toThrow(
        "BASE_RELAY_PRIVATE_KEY must be a valid private key",
      )
    })
  })

  describe("Settlement Strategy", () => {
    let baseChannel: BaseChannelState

    beforeEach(() => {
      baseChannel = {
        channelId: "0x" + "1".repeat(64),
        sender: "0x" + "a".repeat(40),
        recipient: "0x" + "b".repeat(40),
        balance: 1_000_000_000_000_000_000n, // 1 ETH
        highestNonce: 0,
        highestClaimAmount: 0n,
        expiration: Math.floor(Date.now() / 1000) + 86_400, // 24 hours
        isClosed: false,
        lastClaimTime: Date.now(),
        totalClaims: 0,
        createdAt: Date.now(),
      }
    })

    it("should trigger settlement when threshold reached", () => {
      const config = {
        settlementThreshold: 100_000_000_000_000_000n, // 0.1 ETH
        settlementInterval: 3600,
      } as any

      baseChannel.highestClaimAmount = 150_000_000_000_000_000n // 0.15 ETH

      expect(shouldSettleChannel(baseChannel, config)).toBe(true)
    })

    it("should trigger settlement when time interval exceeded", () => {
      const config = {
        settlementThreshold: 1_000_000_000_000_000_000n, // 1 ETH (won't hit threshold)
        settlementInterval: 3600, // 1 hour
      } as any

      baseChannel.lastClaimTime = Date.now() - 7200 * 1000 // 2 hours ago
      baseChannel.highestClaimAmount = 1_000_000_000_000_000n // 0.001 ETH (below threshold)

      expect(shouldSettleChannel(baseChannel, config)).toBe(true)
    })

    it("should trigger settlement when near expiration", () => {
      const config = {
        settlementThreshold: 1_000_000_000_000_000_000n,
        settlementInterval: 3600,
      } as any

      baseChannel.expiration = Math.floor(Date.now() / 1000) + 3600 // 1 hour (< 24 hours)
      baseChannel.highestClaimAmount = 1_000_000_000_000_000n // Below threshold

      expect(shouldSettleChannel(baseChannel, config)).toBe(true)
    })

    it("should trigger settlement when high claim count reached", () => {
      const config = {
        settlementThreshold: 1_000_000_000_000_000_000n,
        settlementInterval: 3600,
      } as any

      baseChannel.totalClaims = 100
      baseChannel.highestClaimAmount = 1_000_000_000_000_000n // Below threshold

      expect(shouldSettleChannel(baseChannel, config)).toBe(true)
    })

    it("should not trigger settlement when no criteria met", () => {
      const config = {
        settlementThreshold: 1_000_000_000_000_000_000n, // 1 ETH
        settlementInterval: 3600, // 1 hour
      } as any

      baseChannel.highestClaimAmount = 1_000_000_000_000_000n // 0.001 ETH
      baseChannel.totalClaims = 50
      baseChannel.lastClaimTime = Date.now() - 1800 * 1000 // 30 minutes ago
      baseChannel.expiration = Math.floor(Date.now() / 1000) + 86_400 * 7 // 7 days

      expect(shouldSettleChannel(baseChannel, config)).toBe(false)
    })
  })

  describe("Module Interface", () => {
    it("should export correct settlement scheme name", async () => {
      const module = await import("./base-sepolia")

      expect(module.default.name).toBe("eth+base-sepolia+eth")
    })

    it("should have test realm", async () => {
      const module = await import("./base-sepolia")

      expect(module.default.realm).toBe("test")
    })

    it("should support version 1", async () => {
      const module = await import("./base-sepolia")

      expect(module.default.supportedVersions).toContain(1)
    })

    it("should implement SettlementSchemeModule interface", async () => {
      const module = await import("./base-sepolia")

      expect(module.default.behavior).toBeTypeOf("function")
      expect(module.default.ledger).toBeDefined()
    })
  })
})
