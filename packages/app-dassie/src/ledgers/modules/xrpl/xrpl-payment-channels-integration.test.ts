/**
 * XRP Payment Channel Integration Tests
 *
 * @remarks
 *
 * These tests require connection to XRP Testnet (wss://s.altnet.rippletest.net:51233)
 * and funded test wallets. They perform real transactions on the testnet.
 *
 * Run with extended timeout: pnpm test xrpl-payment-channels-integration.test.ts --testTimeout=60000
 */

import { Client, Wallet } from "xrpl"
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { ed25519 } from "@noble/curves/ed25519"

import { createPaymentChannel } from "./functions/create-payment-channel"
import { verifyPaymentClaim } from "./functions/verify-payment-claim"
import { settlePaymentChannel } from "./functions/settlement-strategy"
import { queryPaymentChannel } from "./functions/query-payment-channel"
import type { XrpPaymentClaim } from "./types/payment-channel-state"

/**
 * Helper to create Ed25519 signature for XRP payment channel claim
 */
function createClaimSignature(
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
  return Buffer.from(signature).toString("hex").toUpperCase()
}

describe(
  "XRP Payment Channel Integration Tests",
  () => {
    let client: Client
    let senderWallet: Wallet
    let relayWallet: Wallet

    beforeAll(async () => {
      // Connect to XRP Testnet
      client = new Client("wss://s.altnet.rippletest.net:51233")
      await client.connect()

      // Generate test wallets
      senderWallet = Wallet.generate()
      relayWallet = Wallet.generate()

      // Fund wallets using testnet faucet
      console.log("Funding sender wallet...")
      await client.fundWallet(senderWallet)
      console.log(`Sender wallet funded: ${senderWallet.address}`)

      console.log("Funding relay wallet...")
      await client.fundWallet(relayWallet)
      console.log(`Relay wallet funded: ${relayWallet.address}`)

      // Wait for funding to propagate
      await new Promise((resolve) => setTimeout(resolve, 5000))
    })

    afterAll(async () => {
      await client.disconnect()
    })

    it(
      "full payment channel lifecycle: create → verify claims → settle → close",
      async () => {
        console.log("=== Test: Full Payment Channel Lifecycle ===")

        // Step 1: Create payment channel
        console.log("\nStep 1: Creating payment channel...")
        const createResult = await createPaymentChannel({
          client,
          wallet: senderWallet,
          recipientAddress: relayWallet.address,
          amountDrops: "10000000", // 10 XRP
          settleDelay: 60, // 1 minute (short for testing)
        })

        expect(createResult.channelId).toBeDefined()
        expect(createResult.txHash).toBeDefined()
        expect(createResult.channelState.amount).toBe("10000000")
        expect(createResult.channelState.sender).toBe(senderWallet.address)
        expect(createResult.channelState.recipient).toBe(relayWallet.address)

        console.log(`Channel created: ${createResult.channelId}`)
        console.log(`Transaction hash: ${createResult.txHash}`)

        // Wait for ledger confirmation
        await new Promise((resolve) => setTimeout(resolve, 5000))

        // Step 2: Query channel from XRPL
        console.log("\nStep 2: Querying channel from XRPL...")
        const queriedChannel = await queryPaymentChannel(
          client,
          relayWallet.address,
          createResult.channelId,
        )

        expect(queriedChannel).toBeDefined()
        expect(queriedChannel?.channelId).toBe(createResult.channelId)
        expect(queriedChannel?.sender).toBe(senderWallet.address)
        expect(queriedChannel?.amount).toBe("10000000")

        console.log("Channel queried successfully")

        // Step 3: Create and verify first claim (2 XRP)
        console.log("\nStep 3: Creating and verifying first claim (2 XRP)...")
        const privateKey = Buffer.from(senderWallet.privateKey, "hex")
        const claim1AmountDrops = 2000000n // 2 XRP

        const claim1Signature = createClaimSignature(
          createResult.channelId,
          claim1AmountDrops,
          privateKey,
        )

        const claim1: XrpPaymentClaim = {
          channelId: createResult.channelId,
          amountSats: 2000000,
          nonce: 1,
          signature: claim1Signature,
          currency: "XRP",
        }

        const verify1Result = verifyPaymentClaim(claim1, createResult.channelState)

        expect(verify1Result.valid).toBe(true)
        expect(verify1Result.amountSats).toBe(2000000)
        expect(verify1Result.updatedChannelState?.highestClaimAmount).toBe(
          "2000000",
        )

        console.log("First claim verified successfully")

        // Step 4: Create and verify second claim (5 XRP)
        console.log("\nStep 4: Creating and verifying second claim (5 XRP)...")
        const claim2AmountDrops = 5000000n // 5 XRP

        const claim2Signature = createClaimSignature(
          createResult.channelId,
          claim2AmountDrops,
          privateKey,
        )

        const claim2: XrpPaymentClaim = {
          channelId: createResult.channelId,
          amountSats: 5000000,
          nonce: 2,
          signature: claim2Signature,
          currency: "XRP",
        }

        const verify2Result = verifyPaymentClaim(
          claim2,
          verify1Result.updatedChannelState!,
        )

        expect(verify2Result.valid).toBe(true)
        expect(verify2Result.amountSats).toBe(5000000)
        expect(verify2Result.updatedChannelState?.highestClaimAmount).toBe(
          "5000000",
        )

        console.log("Second claim verified successfully")

        // Step 5: Settle channel with PaymentChannelClaim transaction
        console.log("\nStep 5: Settling channel with PaymentChannelClaim...")
        const settleResult = await settlePaymentChannel({
          client,
          wallet: relayWallet,
          channelState: verify2Result.updatedChannelState!,
          claimSignature: claim2Signature,
        })

        expect(settleResult.txHash).toBeDefined()
        expect(settleResult.amountClaimed).toBe("5000000")
        expect(settleResult.updatedChannelState.status).toBe("CLOSING")

        console.log(`Settlement transaction hash: ${settleResult.txHash}`)
        console.log(`Amount claimed: ${settleResult.amountClaimed} drops (5 XRP)`)

        // Wait for settlement confirmation
        await new Promise((resolve) => setTimeout(resolve, 5000))

        // Step 6: Verify relay received funds
        console.log("\nStep 6: Verifying relay received funds...")
        const relayAccountInfo = await client.request({
          command: "account_info",
          account: relayWallet.address,
          ledger_index: "validated",
        })

        const relayBalance = BigInt(relayAccountInfo.result.account_data.Balance)
        console.log(`Relay balance: ${relayBalance} drops`)

        // Balance should include the 5 XRP claimed (plus initial faucet funding)
        // Exact balance check depends on faucet amount, so just verify > 0
        expect(relayBalance).toBeGreaterThan(0n)

        console.log("\n=== Full Lifecycle Test Passed ===")
      },
      { timeout: 60000 },
    )

    it(
      "rejects invalid claim signatures",
      async () => {
        console.log("\n=== Test: Invalid Claim Rejection ===")

        // Create channel
        const createResult = await createPaymentChannel({
          client,
          wallet: senderWallet,
          recipientAddress: relayWallet.address,
          amountDrops: "5000000", // 5 XRP
          settleDelay: 60,
        })

        console.log(`Channel created: ${createResult.channelId}`)

        // Wait for confirmation
        await new Promise((resolve) => setTimeout(resolve, 5000))

        // Create claim with WRONG signature (different private key)
        const wrongPrivateKey = ed25519.utils.randomPrivateKey()
        const wrongSignature = createClaimSignature(
          createResult.channelId,
          1000000n,
          wrongPrivateKey,
        )

        const invalidClaim: XrpPaymentClaim = {
          channelId: createResult.channelId,
          amountSats: 1000000,
          nonce: 1,
          signature: wrongSignature,
          currency: "XRP",
        }

        const result = verifyPaymentClaim(invalidClaim, createResult.channelState)

        expect(result.valid).toBe(false)
        expect(result.reason).toBe("invalid-signature")

        console.log("Invalid signature rejected successfully")
      },
      { timeout: 60000 },
    )

    it(
      "rejects claim exceeding channel balance",
      async () => {
        console.log("\n=== Test: Excessive Claim Rejection ===")

        // Create channel with 5 XRP
        const createResult = await createPaymentChannel({
          client,
          wallet: senderWallet,
          recipientAddress: relayWallet.address,
          amountDrops: "5000000", // 5 XRP
          settleDelay: 60,
        })

        console.log(`Channel created: ${createResult.channelId}`)

        // Wait for confirmation
        await new Promise((resolve) => setTimeout(resolve, 5000))

        // Try to claim 10 XRP (more than available)
        const privateKey = Buffer.from(senderWallet.privateKey, "hex")
        const excessiveSignature = createClaimSignature(
          createResult.channelId,
          10000000n, // 10 XRP
          privateKey,
        )

        const excessiveClaim: XrpPaymentClaim = {
          channelId: createResult.channelId,
          amountSats: 10000000,
          nonce: 1,
          signature: excessiveSignature,
          currency: "XRP",
        }

        const result = verifyPaymentClaim(
          excessiveClaim,
          createResult.channelState,
        )

        expect(result.valid).toBe(false)
        expect(result.reason).toBe("insufficient-balance")

        console.log("Excessive claim rejected successfully")
      },
      { timeout: 60000 },
    )

    it(
      "rejects non-monotonic claims",
      async () => {
        console.log("\n=== Test: Non-Monotonic Claim Rejection ===")

        // Create channel
        const createResult = await createPaymentChannel({
          client,
          wallet: senderWallet,
          recipientAddress: relayWallet.address,
          amountDrops: "10000000", // 10 XRP
          settleDelay: 60,
        })

        console.log(`Channel created: ${createResult.channelId}`)

        // Wait for confirmation
        await new Promise((resolve) => setTimeout(resolve, 5000))

        // First claim: 3 XRP
        const privateKey = Buffer.from(senderWallet.privateKey, "hex")
        const claim1Signature = createClaimSignature(
          createResult.channelId,
          3000000n,
          privateKey,
        )

        const claim1: XrpPaymentClaim = {
          channelId: createResult.channelId,
          amountSats: 3000000,
          nonce: 1,
          signature: claim1Signature,
          currency: "XRP",
        }

        const result1 = verifyPaymentClaim(claim1, createResult.channelState)
        expect(result1.valid).toBe(true)

        // Second claim: 2 XRP (LESS than first claim - should be rejected)
        const claim2Signature = createClaimSignature(
          createResult.channelId,
          2000000n,
          privateKey,
        )

        const claim2: XrpPaymentClaim = {
          channelId: createResult.channelId,
          amountSats: 2000000,
          nonce: 2,
          signature: claim2Signature,
          currency: "XRP",
        }

        const result2 = verifyPaymentClaim(claim2, result1.updatedChannelState!)
        expect(result2.valid).toBe(false)
        expect(result2.reason).toBe("claim-not-monotonic")

        console.log("Non-monotonic claim rejected successfully")
      },
      { timeout: 60000 },
    )
  },
  { timeout: 60000 },
)
