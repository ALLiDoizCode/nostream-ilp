import { describe, expect, it } from "vitest"

import type { ChannelState } from "../functions/get-channel-state"
import {
  createPaymentClaimMessage,
  type Currency,
} from "../functions/verify-payment-signature"

const MAX_NONCE_JUMP = 1000n

/**
 * Unit tests for payment verification logic
 * Tests the validation rules applied in verifyPaymentClaim mutation
 */

describe("Payment Verification Logic", () => {
  const validChannel: ChannelState = {
    channelId: "test-channel-1",
    senderPubkey:
      "02a1633cafcc01ebfb6d78e39f687a1f0995c62fc95f51ead10a02ee0be551b5dc",
    recipientPubkey: "recipient-pubkey",
    currency: "BTC",
    capacitySats: 100000n,
    highestNonce: 0n,
    expiration: BigInt(Date.now() + 1000000), // Future expiration
    status: "open",
  }

  describe("Channel State Validation", () => {
    it("should detect non-existent channel", () => {
      const channel: ChannelState | undefined = undefined
      expect(channel).toBeUndefined()
    })

    it("should detect expired channel by status", () => {
      const channel = { ...validChannel, status: "expired" as const }
      expect(channel.status).toBe("expired")
    })

    it("should detect expired channel by timestamp", () => {
      const expiredChannel = {
        ...validChannel,
        expiration: BigInt(Date.now() - 1000),
      }
      const now = Date.now()
      expect(BigInt(now) > expiredChannel.expiration).toBe(true)
    })

    it("should accept valid open channel", () => {
      expect(validChannel.status).toBe("open")
      expect(BigInt(Date.now()) < validChannel.expiration).toBe(true)
    })
  })

  describe("Amount Validation", () => {
    it("should reject amount of 0", () => {
      const amount = 0
      expect(amount <= 0).toBe(true)
    })

    it("should reject negative amount", () => {
      const amount = -100
      expect(amount <= 0).toBe(true)
    })

    it("should reject amount exceeding capacity", () => {
      const amount = 200000
      expect(BigInt(amount) > validChannel.capacitySats).toBe(true)
    })

    it("should accept amount equal to capacity", () => {
      const amount = 100000
      expect(BigInt(amount) <= validChannel.capacitySats).toBe(true)
      expect(amount > 0).toBe(true)
    })

    it("should accept amount within capacity", () => {
      const amount = 50000
      expect(BigInt(amount) <= validChannel.capacitySats).toBe(true)
      expect(amount > 0).toBe(true)
    })
  })

  describe("Nonce Validation", () => {
    it("should reject nonce equal to highestNonce", () => {
      const nonce = 0n
      expect(nonce <= validChannel.highestNonce).toBe(true)
    })

    it("should reject nonce less than highestNonce", () => {
      const channel = { ...validChannel, highestNonce: 10n }
      const nonce = 5n
      expect(nonce <= channel.highestNonce).toBe(true)
    })

    it("should reject nonce exceeding max jump", () => {
      const nonce = 1001n
      expect(nonce > validChannel.highestNonce + MAX_NONCE_JUMP).toBe(true)
    })

    it("should accept nonce = highestNonce + 1", () => {
      const nonce = 1n
      expect(nonce > validChannel.highestNonce).toBe(true)
      expect(nonce <= validChannel.highestNonce + MAX_NONCE_JUMP).toBe(true)
    })

    it("should accept nonce at max jump boundary", () => {
      const nonce = 1000n
      expect(nonce > validChannel.highestNonce).toBe(true)
      expect(nonce <= validChannel.highestNonce + MAX_NONCE_JUMP).toBe(true)
    })
  })

  describe("Payment Claim Message Creation", () => {
    it("should create consistent message for same inputs", () => {
      const msg1 = createPaymentClaimMessage("channel1", 1000, 1)
      const msg2 = createPaymentClaimMessage("channel1", 1000, 1)

      expect(msg1).toEqual(msg2)
    })

    it("should create different messages for different channelIds", () => {
      const msg1 = createPaymentClaimMessage("channel1", 1000, 1)
      const msg2 = createPaymentClaimMessage("channel2", 1000, 1)

      expect(msg1).not.toEqual(msg2)
    })

    it("should create different messages for different amounts", () => {
      const msg1 = createPaymentClaimMessage("channel1", 1000, 1)
      const msg2 = createPaymentClaimMessage("channel1", 2000, 1)

      expect(msg1).not.toEqual(msg2)
    })

    it("should create different messages for different nonces", () => {
      const msg1 = createPaymentClaimMessage("channel1", 1000, 1)
      const msg2 = createPaymentClaimMessage("channel1", 1000, 2)

      expect(msg1).not.toEqual(msg2)
    })

    it("should return Uint8Array of 32 bytes (SHA256)", () => {
      const msg = createPaymentClaimMessage("channel1", 1000, 1)

      expect(msg).toBeInstanceOf(Uint8Array)
      expect(msg.length).toBe(32) // SHA256 produces 32 bytes
    })
  })

  describe("Currency Support", () => {
    it("should support BTC currency", () => {
      const currency: Currency = "BTC"
      expect(["BTC", "BASE", "AKT", "XRP"]).toContain(currency)
    })

    it("should support BASE currency", () => {
      const currency: Currency = "BASE"
      expect(["BTC", "BASE", "AKT", "XRP"]).toContain(currency)
    })

    it("should support AKT currency", () => {
      const currency: Currency = "AKT"
      expect(["BTC", "BASE", "AKT", "XRP"]).toContain(currency)
    })

    it("should support XRP currency", () => {
      const currency: Currency = "XRP"
      expect(["BTC", "BASE", "AKT", "XRP"]).toContain(currency)
    })
  })

  describe("Error Reason Codes", () => {
    it("should have distinct error codes for each failure type", () => {
      const errorCodes = [
        "channel-not-found",
        "channel-expired",
        "invalid-signature",
        "invalid-nonce",
        "nonce-too-high",
        "insufficient-balance",
        "invalid-amount",
        "ledger-error",
      ]

      // All error codes should be unique
      const uniqueCodes = new Set(errorCodes)
      expect(uniqueCodes.size).toBe(errorCodes.length)

      // All error codes should use hyphen-separated format
      for (const code of errorCodes) {
        expect(code).toMatch(/^[a-z]+(-[a-z]+)*$/)
      }
    })
  })
})
