/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest"
import { loadCronosConfig, validateCronosConfig } from "./config"
import { shouldSettleChannel } from "./functions/channel-operations"
import type { CronosChannelState } from "./types/peer-state"
import cronosTestnetModule from "./cronos-testnet"

describe("Cronos Settlement Module", () => {
  describe("Configuration", () => {
    it("should load configuration from environment", () => {
      const config = loadCronosConfig()

      expect(config).toBeDefined()
      expect(config.realm).toBe("test")
      expect(config.contractAddress).toBeDefined()
      expect(config.aktTokenAddress).toBeDefined()
    })

    it("should validate correct configuration", () => {
      const validConfig = {
        enabled: true,
        rpcUrl: "https://evm-t3.cronos.org/",
        chainId: 338,
        contractAddress: "0x" + "1".repeat(40),
        aktTokenAddress: "0x" + "a".repeat(40),
        relayAddress: "0x" + "2".repeat(40),
        privateKey: "0x" + "3".repeat(64),
        settlementThreshold: 100_000_000n, // 100 AKT (6 decimals)
        settlementInterval: 3600,
        gasLimit: 500_000,
        maxFeePerGas: 10_000_000_000n,
        realm: "test" as const,
      }

      expect(() => validateCronosConfig(validConfig)).not.toThrow()
    })

    it("should reject invalid chain ID", () => {
      const invalidConfig = {
        enabled: true,
        rpcUrl: "https://evm-t3.cronos.org/",
        chainId: 999, // Invalid
        contractAddress: "0x" + "1".repeat(40),
        aktTokenAddress: "0x" + "a".repeat(40),
        relayAddress: "0x" + "2".repeat(40),
        privateKey: "0x" + "3".repeat(64),
        settlementThreshold: 100_000_000n,
        settlementInterval: 3600,
        gasLimit: 500_000,
        maxFeePerGas: 10_000_000_000n,
        realm: "test" as const,
      }

      expect(() => validateCronosConfig(invalidConfig)).toThrow(
        "CRONOS_CHAIN_ID must be 338 (testnet) or 25 (mainnet)",
      )
    })

    it("should reject invalid AKT token address", () => {
      const invalidConfig = {
        enabled: true,
        rpcUrl: "https://evm-t3.cronos.org/",
        chainId: 338,
        contractAddress: "0x" + "1".repeat(40),
        aktTokenAddress: "invalid",
        relayAddress: "0x" + "2".repeat(40),
        privateKey: "0x" + "3".repeat(64),
        settlementThreshold: 100_000_000n,
        settlementInterval: 3600,
        gasLimit: 500_000,
        maxFeePerGas: 10_000_000_000n,
        realm: "test" as const,
      }

      expect(() => validateCronosConfig(invalidConfig)).toThrow(
        "CRONOS_AKT_TOKEN_ADDRESS must be a valid Ethereum address",
      )
    })
  })

  describe("Settlement Strategy", () => {
    let cronosChannel: CronosChannelState

    beforeEach(() => {
      cronosChannel = {
        channelId: "0x" + "1".repeat(64),
        sender: "0x" + "a".repeat(40),
        recipient: "0x" + "b".repeat(40),
        balance: 1_000_000_000n, // 1000 AKT (6 decimals)
        highestNonce: 0,
        highestClaimAmount: 0n,
        expiration: Math.floor(Date.now() / 1000) + 86_400, // 24 hours
        isClosed: false,
        lastClaimTime: Date.now(),
        totalClaims: 0,
        createdAt: Date.now(),
      }
    })

    it("should trigger settlement when threshold reached (AKT 6 decimals)", () => {
      const config = {
        settlementThreshold: 100_000_000n, // 100 AKT (6 decimals)
        settlementInterval: 3600,
      } as any

      cronosChannel.highestClaimAmount = 150_000_000n // 150 AKT

      expect(shouldSettleChannel(cronosChannel, config)).toBe(true)
    })

    it("should not trigger settlement when threshold not reached", () => {
      const config = {
        settlementThreshold: 100_000_000n, // 100 AKT
        settlementInterval: 3600,
      } as any

      cronosChannel.highestClaimAmount = 50_000_000n // 50 AKT

      expect(shouldSettleChannel(cronosChannel, config)).toBe(false)
    })

    it("should trigger settlement when near expiration", () => {
      const config = {
        settlementThreshold: 100_000_000n,
        settlementInterval: 3600,
      } as any

      cronosChannel.expiration = Math.floor(Date.now() / 1000) + 3600 // 1 hour left

      expect(shouldSettleChannel(cronosChannel, config)).toBe(true)
    })
  })

  describe("Module Interface", () => {
    it("should export correct module name", () => {
      expect(cronosTestnetModule.name).toBe("akt+cronos-testnet+akt")
    })

    it("should be test realm", () => {
      expect(cronosTestnetModule.realm).toBe("test")
    })

    it("should support version 1", () => {
      expect(cronosTestnetModule.supportedVersions).toContain(1)
    })
  })
})
