import { describe, it, expect, beforeEach } from "vitest"
import { loadCosmosConfig, validateCosmosConfig } from "./config"
import {
  verifyPaymentClaim,
  shouldSettleChannel,
} from "./functions/settlement-engine"
import type { CosmosChannelState } from "./types/peer-state"
import type { PaymentClaim } from "./functions/settlement-engine"

describe("Cosmos/Akash Settlement Module", () => {
  describe("Module Structure", () => {
    it("exports correct module name", async () => {
      const module = await import("./cosmos-akash.js")
      expect(module.default.name).toBe("akt+cosmos-akash+akt")
    })

    it("has correct realm for testnet", async () => {
      const module = await import("./cosmos-akash.js")
      expect(module.default.realm).toBe("test")
    })

    it("has supported versions array", async () => {
      const module = await import("./cosmos-akash.js")
      expect(module.default.supportedVersions).toEqual([1])
    })
  })

  describe("Configuration Validation", () => {
    it("validates correct configuration", () => {
      const config = {
        enabled: true,
        rpcUrl: "https://rpc.sandbox-01.aksh.pw:443",
        contractAddress:
          "akash1abcdefghijklmnopqrstuvwxyz1234567890abcd",
        relayAddress: "akash1relayaddress1234567890abcdefghijklmnop",
        relayPrivateKey: "a".repeat(64),
        network: "testnet" as const,
        settlementThreshold: "1000000",
        settlementInterval: 3600,
        gasPrice: "0.025uakt",
        gasLimit: 200_000,
        realm: "test" as const,
      }

      expect(() => validateCosmosConfig(config)).not.toThrow()
    })

    it("rejects invalid contract address", () => {
      const config = {
        enabled: true,
        rpcUrl: "https://rpc.sandbox-01.aksh.pw:443",
        contractAddress: "invalid_address",
        relayAddress: "akash1relayaddress1234567890abcdefghijklmnop",
        relayPrivateKey: "a".repeat(64),
        network: "testnet" as const,
        settlementThreshold: "1000000",
        settlementInterval: 3600,
        gasPrice: "0.025uakt",
        gasLimit: 200_000,
        realm: "test" as const,
      }

      expect(() => validateCosmosConfig(config)).toThrow(
        /must be a valid Cosmos address/,
      )
    })

    it("rejects invalid private key length", () => {
      const config = {
        enabled: true,
        rpcUrl: "https://rpc.sandbox-01.aksh.pw:443",
        contractAddress:
          "akash1abcdefghijklmnopqrstuvwxyz1234567890abcd",
        relayAddress: "akash1relayaddress1234567890abcdefghijklmnop",
        relayPrivateKey: "tooshort",
        network: "testnet" as const,
        settlementThreshold: "1000000",
        settlementInterval: 3600,
        gasPrice: "0.025uakt",
        gasLimit: 200_000,
        realm: "test" as const,
      }

      expect(() => validateCosmosConfig(config)).toThrow(/64 hex characters/)
    })

    it("rejects invalid gas price format", () => {
      const config = {
        enabled: true,
        rpcUrl: "https://rpc.sandbox-01.aksh.pw:443",
        contractAddress:
          "akash1abcdefghijklmnopqrstuvwxyz1234567890abcd",
        relayAddress: "akash1relayaddress1234567890abcdefghijklmnop",
        relayPrivateKey: "a".repeat(64),
        network: "testnet" as const,
        settlementThreshold: "1000000",
        settlementInterval: 3600,
        gasPrice: "invalid",
        gasLimit: 200_000,
        realm: "test" as const,
      }

      expect(() => validateCosmosConfig(config)).toThrow(/format.*uakt/)
    })

    it("skips validation when disabled", () => {
      const config = {
        enabled: false,
        rpcUrl: "",
        contractAddress: "",
        relayAddress: "",
        relayPrivateKey: "",
        network: "testnet" as const,
        settlementThreshold: "0",
        settlementInterval: 0,
        gasPrice: "",
        gasLimit: 0,
        realm: "test" as const,
      }

      expect(() => validateCosmosConfig(config)).not.toThrow()
    })
  })

  describe("Configuration Loading", () => {
    beforeEach(() => {
      // Reset environment variables
      delete process.env["COSMOS_ENABLED"]
      delete process.env["COSMOS_AKASH_RPC_URL"]
      delete process.env["COSMOS_NETWORK"]
    })

    it("loads default configuration", () => {
      const config = loadCosmosConfig()

      expect(config.enabled).toBe(false) // Default is disabled
      expect(config.rpcUrl).toBe("https://rpc.sandbox-01.aksh.pw:443")
      expect(config.network).toBe("testnet")
      expect(config.settlementThreshold).toBe("1000000")
      expect(config.gasPrice).toBe("0.025uakt")
    })

    it("loads configuration from environment", () => {
      process.env["COSMOS_ENABLED"] = "true"
      process.env["COSMOS_AKASH_RPC_URL"] = "https://custom-rpc.example.com"
      process.env["COSMOS_NETWORK"] = "mainnet"

      const config = loadCosmosConfig()

      expect(config.enabled).toBe(true)
      expect(config.rpcUrl).toBe("https://custom-rpc.example.com")
      expect(config.network).toBe("mainnet")
      expect(config.realm).toBe("main") // Should auto-set realm based on network
    })
  })

  describe("Claim Verification", () => {
    it("rejects claim from wrong sender", async () => {
      const channelState: CosmosChannelState = {
        channelId: "channel_123",
        sender: "akash1sender1234567890abcdefghijklmnopqrstuvwx",
        recipient: "akash1relay1234567890abcdefghijklmnopqrstuvwxy",
        amount: "1000000",
        denom: "uakt",
        highestClaim: "0",
        highestNonce: 0,
        expiration: Math.floor(Date.now() / 1000) + 86400,
        status: "OPEN",
        lastClaimTime: Math.floor(Date.now() / 1000),
        totalClaims: 0,
      }

      const channelStateMap = new Map<string, CosmosChannelState>()
      channelStateMap.set("channel_123", channelState)

      const claim: PaymentClaim = {
        channelId: "channel_123",
        amountSats: 100_000,
        nonce: 1,
        signature: "invalid_signature_hex",
        currency: "AKT",
      }

      const result = await verifyPaymentClaim(claim, channelStateMap)

      expect(result.valid).toBe(false)
      expect(result.reason).toMatch(/signature|public key/i)
    })

    it("rejects non-monotonic nonce", async () => {
      const channelState: CosmosChannelState = {
        channelId: "channel_123",
        sender: "akash1sender1234567890abcdefghijklmnopqrstuvwx",
        recipient: "akash1relay1234567890abcdefghijklmnopqrstuvwxy",
        amount: "1000000",
        denom: "uakt",
        highestClaim: "50000",
        highestNonce: 5,
        expiration: Math.floor(Date.now() / 1000) + 86400,
        status: "OPEN",
        lastClaimTime: Math.floor(Date.now() / 1000),
        totalClaims: 5,
      }

      const channelStateMap = new Map<string, CosmosChannelState>()
      channelStateMap.set("channel_123", channelState)

      const claim: PaymentClaim = {
        channelId: "channel_123",
        amountSats: 60_000,
        nonce: 5, // Same as highestNonce (should be > 5)
        signature: "a".repeat(128),
        currency: "AKT",
      }

      const result = await verifyPaymentClaim(claim, channelStateMap)

      expect(result.valid).toBe(false)
      expect(result.reason).toMatch(/nonce not monotonic/i)
    })

    it("rejects excessive claim amount", async () => {
      const channelState: CosmosChannelState = {
        channelId: "channel_123",
        sender: "akash1sender1234567890abcdefghijklmnopqrstuvwx",
        recipient: "akash1relay1234567890abcdefghijklmnopqrstuvwxy",
        amount: "1000000",
        denom: "uakt",
        highestClaim: "0",
        highestNonce: 0,
        expiration: Math.floor(Date.now() / 1000) + 86400,
        status: "OPEN",
        lastClaimTime: Math.floor(Date.now() / 1000),
        totalClaims: 0,
      }

      const channelStateMap = new Map<string, CosmosChannelState>()
      channelStateMap.set("channel_123", channelState)

      const claim: PaymentClaim = {
        channelId: "channel_123",
        amountSats: 2_000_000, // Exceeds channel balance of 1000000
        nonce: 1,
        signature: "a".repeat(128),
        currency: "AKT",
      }

      const result = await verifyPaymentClaim(claim, channelStateMap)

      expect(result.valid).toBe(false)
      expect(result.reason).toMatch(/exceeds channel balance/i)
    })

    it("rejects claim on closed channel", async () => {
      const channelState: CosmosChannelState = {
        channelId: "channel_123",
        sender: "akash1sender1234567890abcdefghijklmnopqrstuvwx",
        recipient: "akash1relay1234567890abcdefghijklmnopqrstuvwxy",
        amount: "1000000",
        denom: "uakt",
        highestClaim: "1000000",
        highestNonce: 10,
        expiration: Math.floor(Date.now() / 1000) + 86400,
        status: "CLOSED",
        lastClaimTime: Math.floor(Date.now() / 1000),
        totalClaims: 10,
      }

      const channelStateMap = new Map<string, CosmosChannelState>()
      channelStateMap.set("channel_123", channelState)

      const claim: PaymentClaim = {
        channelId: "channel_123",
        amountSats: 100_000,
        nonce: 11,
        signature: "a".repeat(128),
        currency: "AKT",
      }

      const result = await verifyPaymentClaim(claim, channelStateMap)

      expect(result.valid).toBe(false)
      expect(result.reason).toMatch(/not open/i)
    })

    it("rejects claim on expired channel", async () => {
      const channelState: CosmosChannelState = {
        channelId: "channel_123",
        sender: "akash1sender1234567890abcdefghijklmnopqrstuvwx",
        recipient: "akash1relay1234567890abcdefghijklmnopqrstuvwxy",
        amount: "1000000",
        denom: "uakt",
        highestClaim: "0",
        highestNonce: 0,
        expiration: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
        status: "OPEN",
        lastClaimTime: Math.floor(Date.now() / 1000),
        totalClaims: 0,
      }

      const channelStateMap = new Map<string, CosmosChannelState>()
      channelStateMap.set("channel_123", channelState)

      const claim: PaymentClaim = {
        channelId: "channel_123",
        amountSats: 100_000,
        nonce: 1,
        signature: "a".repeat(128),
        currency: "AKT",
      }

      const result = await verifyPaymentClaim(claim, channelStateMap)

      expect(result.valid).toBe(false)
      expect(result.reason).toMatch(/expired/i)
    })

    it("rejects claim for non-existent channel", async () => {
      const channelStateMap = new Map<string, CosmosChannelState>()

      const claim: PaymentClaim = {
        channelId: "nonexistent_channel",
        amountSats: 100_000,
        nonce: 1,
        signature: "a".repeat(128),
        currency: "AKT",
      }

      const result = await verifyPaymentClaim(claim, channelStateMap)

      expect(result.valid).toBe(false)
      expect(result.reason).toMatch(/not found/i)
    })
  })

  describe("Settlement Strategy", () => {
    it("should settle when threshold reached", () => {
      const channelState: CosmosChannelState = {
        channelId: "channel_123",
        sender: "akash1sender",
        recipient: "akash1relay",
        amount: "10000000",
        denom: "uakt",
        highestClaim: "5000000", // 5 AKT
        highestNonce: 10,
        expiration: Math.floor(Date.now() / 1000) + 86400,
        status: "OPEN",
        lastClaimTime: Math.floor(Date.now() / 1000),
        totalClaims: 10,
      }

      const config = {
        settlementThreshold: "1000000", // 1 AKT
        settlementInterval: 3600,
      }

      expect(shouldSettleChannel(channelState, config)).toBe(true)
    })

    it("should settle after time interval", () => {
      const channelState: CosmosChannelState = {
        channelId: "channel_123",
        sender: "akash1sender",
        recipient: "akash1relay",
        amount: "10000000",
        denom: "uakt",
        highestClaim: "100000",
        highestNonce: 1,
        expiration: Math.floor(Date.now() / 1000) + 86400,
        status: "OPEN",
        lastClaimTime: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        totalClaims: 1,
      }

      const config = {
        settlementThreshold: "10000000", // 10 AKT (not reached)
        settlementInterval: 3600, // 1 hour (exceeded)
      }

      expect(shouldSettleChannel(channelState, config)).toBe(true)
    })

    it("should settle near expiration", () => {
      const now = Math.floor(Date.now() / 1000)

      const channelState: CosmosChannelState = {
        channelId: "channel_123",
        sender: "akash1sender",
        recipient: "akash1relay",
        amount: "10000000",
        denom: "uakt",
        highestClaim: "100000",
        highestNonce: 1,
        expiration: now + 3600, // Expires in 1 hour (< 24 hours)
        status: "OPEN",
        lastClaimTime: now,
        totalClaims: 1,
      }

      const config = {
        settlementThreshold: "10000000",
        settlementInterval: 86400,
      }

      expect(shouldSettleChannel(channelState, config)).toBe(true)
    })

    it("should settle after high claim count", () => {
      const channelState: CosmosChannelState = {
        channelId: "channel_123",
        sender: "akash1sender",
        recipient: "akash1relay",
        amount: "10000000",
        denom: "uakt",
        highestClaim: "100000",
        highestNonce: 100,
        expiration: Math.floor(Date.now() / 1000) + 86400,
        status: "OPEN",
        lastClaimTime: Math.floor(Date.now() / 1000),
        totalClaims: 100, // Exactly at threshold
      }

      const config = {
        settlementThreshold: "10000000",
        settlementInterval: 86400,
      }

      expect(shouldSettleChannel(channelState, config)).toBe(true)
    })

    it("should not settle when no criteria met", () => {
      const channelState: CosmosChannelState = {
        channelId: "channel_123",
        sender: "akash1sender",
        recipient: "akash1relay",
        amount: "10000000",
        denom: "uakt",
        highestClaim: "100000",
        highestNonce: 10,
        expiration: Math.floor(Date.now() / 1000) + 86400,
        status: "OPEN",
        lastClaimTime: Math.floor(Date.now() / 1000),
        totalClaims: 10,
      }

      const config = {
        settlementThreshold: "1000000",
        settlementInterval: 3600,
      }

      expect(shouldSettleChannel(channelState, config)).toBe(false)
    })
  })
})
