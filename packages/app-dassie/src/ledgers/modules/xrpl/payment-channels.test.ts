import { ed25519 } from "@noble/curves/ed25519"
import { describe, expect, it } from "vitest"

import type {
  XrpPaymentClaim,
  XrplPaymentChannelState,
} from "./types/payment-channel-state"
import { verifyPaymentClaim } from "./functions/verify-payment-claim"
import {
  shouldSettleChannel,
  isChannelExpired,
} from "./functions/settlement-strategy"
import type { XrplPaymentChannelConfig } from "./config"

describe("XRP Payment Channel - Claim Verification", () => {
  // Helper to create test channel state
  function createTestChannel(
    overrides?: Partial<XrplPaymentChannelState>,
  ): XrplPaymentChannelState {
    return {
      channelId:
        "5DB01B7FFED6B67E6B0414DED11E051D2EE2B7619CE0EAA6286D67A3A4D5BDB3",
      sender: "rN7n7otQDd6FczFgLdlqtyMVrn3z956G9U",
      recipient: "rLHzPsX6oXkzU9fYnJqYKCWbJh5fJJWB5j",
      amount: "10000000", // 10 XRP
      balance: "10000000",
      settleDelay: 3600,
      publicKey:
        "ED5F5AC8B98974A3CA843326D9B88CEBD0560177B973DC0B0AA8B048B0B0DDA7F1",
      highestClaimAmount: "0",
      highestNonce: 0,
      status: "OPEN",
      lastClaimTime: Date.now(),
      totalClaims: 0,
      createdAt: Date.now(),
      ...overrides,
    }
  }

  // Helper to create Ed25519 signature for testing
  function createTestSignature(
    channelId: string,
    amountDrops: bigint,
    privateKey: Uint8Array,
  ): string {
    const CLM_PREFIX = new Uint8Array([0x43, 0x4c, 0x4d, 0x00])
    const channelIdBuffer = new Uint8Array(
      Buffer.from(channelId, "hex").subarray(0, 32),
    )
    const amountBuffer = new Uint8Array(8)
    const amountView = new DataView(amountBuffer.buffer)
    amountView.setBigUint64(0, amountDrops, false)

    const message = new Uint8Array(
      CLM_PREFIX.length + channelIdBuffer.length + amountBuffer.length,
    )
    message.set(CLM_PREFIX, 0)
    message.set(channelIdBuffer, CLM_PREFIX.length)
    message.set(amountBuffer, CLM_PREFIX.length + channelIdBuffer.length)

    const signature = ed25519.sign(message, privateKey)
    return Buffer.from(signature).toString("hex")
  }

  it("accepts valid payment claim with correct signature", () => {
    // Generate test keypair
    const privateKey = ed25519.utils.randomPrivateKey()
    const publicKey = ed25519.getPublicKey(privateKey)

    const channelId =
      "5DB01B7FFED6B67E6B0414DED11E051D2EE2B7619CE0EAA6286D67A3A4D5BDB3"
    const amountDrops = 1000000n // 1 XRP
    const signature = createTestSignature(channelId, amountDrops, privateKey)

    const channelState = createTestChannel({
      channelId,
      publicKey: Buffer.from(publicKey).toString("hex").toUpperCase(),
    })

    const claim: XrpPaymentClaim = {
      channelId,
      amountSats: 1000000,
      nonce: 1,
      signature,
      currency: "XRP",
    }

    const result = verifyPaymentClaim(claim, channelState)

    expect(result.valid).toBe(true)
    expect(result.amountSats).toBe(1000000)
    expect(result.updatedChannelState?.highestClaimAmount).toBe("1000000")
    expect(result.updatedChannelState?.highestNonce).toBe(1)
    expect(result.updatedChannelState?.totalClaims).toBe(1)
  })

  it("rejects claim with invalid signature", () => {
    const privateKey = ed25519.utils.randomPrivateKey()
    const publicKey = ed25519.getPublicKey(privateKey)
    const wrongPrivateKey = ed25519.utils.randomPrivateKey()

    const channelId =
      "5DB01B7FFED6B67E6B0414DED11E051D2EE2B7619CE0EAA6286D67A3A4D5BDB3"
    const amountDrops = 1000000n
    const signature = createTestSignature(channelId, amountDrops, wrongPrivateKey) // Wrong key!

    const channelState = createTestChannel({
      channelId,
      publicKey: Buffer.from(publicKey).toString("hex").toUpperCase(),
    })

    const claim: XrpPaymentClaim = {
      channelId,
      amountSats: 1000000,
      nonce: 1,
      signature,
      currency: "XRP",
    }

    const result = verifyPaymentClaim(claim, channelState)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe("invalid-signature")
  })

  it("rejects non-monotonic claim (same amount)", () => {
    const privateKey = ed25519.utils.randomPrivateKey()
    const publicKey = ed25519.getPublicKey(privateKey)

    const channelId =
      "5DB01B7FFED6B67E6B0414DED11E051D2EE2B7619CE0EAA6286D67A3A4D5BDB3"
    const amountDrops = 1000000n
    const signature = createTestSignature(channelId, amountDrops, privateKey)

    const channelState = createTestChannel({
      channelId,
      publicKey: Buffer.from(publicKey).toString("hex").toUpperCase(),
      highestClaimAmount: "1000000", // Already claimed this amount
    })

    const claim: XrpPaymentClaim = {
      channelId,
      amountSats: 1000000, // Same amount
      nonce: 2,
      signature,
      currency: "XRP",
    }

    const result = verifyPaymentClaim(claim, channelState)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe("claim-not-monotonic")
  })

  it("rejects claim exceeding channel balance", () => {
    const privateKey = ed25519.utils.randomPrivateKey()
    const publicKey = ed25519.getPublicKey(privateKey)

    const channelId =
      "5DB01B7FFED6B67E6B0414DED11E051D2EE2B7619CE0EAA6286D67A3A4D5BDB3"
    const amountDrops = 20000000n // 20 XRP (more than balance)
    const signature = createTestSignature(channelId, amountDrops, privateKey)

    const channelState = createTestChannel({
      channelId,
      publicKey: Buffer.from(publicKey).toString("hex").toUpperCase(),
      balance: "10000000", // Only 10 XRP available
    })

    const claim: XrpPaymentClaim = {
      channelId,
      amountSats: 20000000,
      nonce: 1,
      signature,
      currency: "XRP",
    }

    const result = verifyPaymentClaim(claim, channelState)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe("insufficient-balance")
  })

  it("rejects claim on closed channel", () => {
    const privateKey = ed25519.utils.randomPrivateKey()
    const publicKey = ed25519.getPublicKey(privateKey)

    const channelId =
      "5DB01B7FFED6B67E6B0414DED11E051D2EE2B7619CE0EAA6286D67A3A4D5BDB3"
    const amountDrops = 1000000n
    const signature = createTestSignature(channelId, amountDrops, privateKey)

    const channelState = createTestChannel({
      channelId,
      publicKey: Buffer.from(publicKey).toString("hex").toUpperCase(),
      status: "CLOSED", // Channel is closed
    })

    const claim: XrpPaymentClaim = {
      channelId,
      amountSats: 1000000,
      nonce: 1,
      signature,
      currency: "XRP",
    }

    const result = verifyPaymentClaim(claim, channelState)

    expect(result.valid).toBe(false)
    expect(result.reason).toBe("channel-not-open")
  })
})

describe("XRP Payment Channel - Settlement Strategy", () => {
  function createTestConfig(
    overrides?: Partial<XrplPaymentChannelConfig>,
  ): XrplPaymentChannelConfig {
    return {
      enabled: true,
      network: "testnet",
      settlementThreshold: "1000000", // 1 XRP
      settlementInterval: 3600, // 1 hour
      defaultSettleDelay: 3600,
      defaultExpiration: 30,
      minChannelBalance: "100000", // 0.1 XRP
      ...overrides,
    }
  }

  function createTestChannel(
    overrides?: Partial<XrplPaymentChannelState>,
  ): XrplPaymentChannelState {
    return {
      channelId:
        "5DB01B7FFED6B67E6B0414DED11E051D2EE2B7619CE0EAA6286D67A3A4D5BDB3",
      sender: "rN7n7otQDd6FczFgLdlqtyMVrn3z956G9U",
      recipient: "rLHzPsX6oXkzU9fYnJqYKCWbJh5fJJWB5j",
      amount: "10000000",
      balance: "10000000",
      settleDelay: 3600,
      publicKey:
        "ED5F5AC8B98974A3CA843326D9B88CEBD0560177B973DC0B0AA8B048B0B0DDA7F1",
      highestClaimAmount: "0",
      highestNonce: 0,
      status: "OPEN",
      lastClaimTime: Date.now(),
      totalClaims: 0,
      createdAt: Date.now(),
      ...overrides,
    }
  }

  it("triggers settlement when threshold reached", () => {
    const config = createTestConfig({ settlementThreshold: "1000000" })
    const channel = createTestChannel({
      highestClaimAmount: "1500000", // 1.5 XRP (above threshold)
    })

    const result = shouldSettleChannel(channel, config)

    expect(result).toBe(true)
  })

  it("triggers settlement after time interval", () => {
    const config = createTestConfig({ settlementInterval: 3600 }) // 1 hour
    const oneHourAgo = Date.now() - 3600 * 1000
    const channel = createTestChannel({
      highestClaimAmount: "500000", // 0.5 XRP (below threshold)
      lastClaimTime: oneHourAgo,
    })

    const result = shouldSettleChannel(channel, config)

    expect(result).toBe(true)
  })

  it("triggers settlement near expiration", () => {
    const RIPPLE_EPOCH_OFFSET = 946_684_800
    const nowRippleEpoch = Math.floor(Date.now() / 1000) - RIPPLE_EPOCH_OFFSET
    const expirationSoon = nowRippleEpoch + 3000 // Expires in 50 minutes

    const config = createTestConfig()
    const channel = createTestChannel({
      highestClaimAmount: "500000", // Has some claim
      expiration: expirationSoon,
      settleDelay: 3600, // 1 hour settle delay
    })

    const result = shouldSettleChannel(channel, config)

    expect(result).toBe(true) // Should settle (expiration < settleDelay + 1 hour)
  })

  it("triggers settlement after high claim count", () => {
    const config = createTestConfig()
    const channel = createTestChannel({
      totalClaims: 100, // Exactly at threshold
    })

    const result = shouldSettleChannel(channel, config)

    expect(result).toBe(true)
  })

  it("triggers settlement when balance low", () => {
    const config = createTestConfig({ minChannelBalance: "100000" })
    const channel = createTestChannel({
      balance: "1000000", // 1 XRP
      highestClaimAmount: "950000", // 0.95 XRP claimed
      // Remaining: 50000 drops (< 100000 threshold)
    })

    const result = shouldSettleChannel(channel, config)

    expect(result).toBe(true)
  })

  it("does not trigger settlement when no conditions met", () => {
    const config = createTestConfig()
    const channel = createTestChannel({
      highestClaimAmount: "500000", // Below threshold
      lastClaimTime: Date.now(), // Recent claim
      totalClaims: 10, // Low claim count
      balance: "10000000",
    })

    const result = shouldSettleChannel(channel, config)

    expect(result).toBe(false)
  })
})

describe("XRP Payment Channel - Expiration", () => {
  function createTestChannel(
    overrides?: Partial<XrplPaymentChannelState>,
  ): XrplPaymentChannelState {
    return {
      channelId:
        "5DB01B7FFED6B67E6B0414DED11E051D2EE2B7619CE0EAA6286D67A3A4D5BDB3",
      sender: "rN7n7otQDd6FczFgLdlqtyMVrn3z956G9U",
      recipient: "rLHzPsX6oXkzU9fYnJqYKCWbJh5fJJWB5j",
      amount: "10000000",
      balance: "10000000",
      settleDelay: 3600,
      publicKey:
        "ED5F5AC8B98974A3CA843326D9B88CEBD0560177B973DC0B0AA8B048B0B0DDA7F1",
      highestClaimAmount: "0",
      highestNonce: 0,
      status: "OPEN",
      lastClaimTime: Date.now(),
      totalClaims: 0,
      createdAt: Date.now(),
      ...overrides,
    }
  }

  it("detects expired channel", () => {
    const RIPPLE_EPOCH_OFFSET = 946_684_800
    const nowRippleEpoch = Math.floor(Date.now() / 1000) - RIPPLE_EPOCH_OFFSET
    const expiredTime = nowRippleEpoch - 3600 // Expired 1 hour ago

    const channel = createTestChannel({
      expiration: expiredTime,
    })

    const result = isChannelExpired(channel)

    expect(result).toBe(true)
  })

  it("detects non-expired channel", () => {
    const RIPPLE_EPOCH_OFFSET = 946_684_800
    const nowRippleEpoch = Math.floor(Date.now() / 1000) - RIPPLE_EPOCH_OFFSET
    const futureExpiration = nowRippleEpoch + 86400 // Expires in 1 day

    const channel = createTestChannel({
      expiration: futureExpiration,
    })

    const result = isChannelExpired(channel)

    expect(result).toBe(false)
  })

  it("handles channel with no expiration", () => {
    const channel = createTestChannel({
      expiration: undefined,
    })

    const result = isChannelExpired(channel)

    expect(result).toBe(false)
  })
})
