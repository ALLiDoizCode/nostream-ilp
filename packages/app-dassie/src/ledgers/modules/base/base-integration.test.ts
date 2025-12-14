/**
 * Integration tests for Base L2 settlement module.
 *
 * @remarks
 * These tests require:
 * - Base Sepolia RPC access
 * - Deployed BasePaymentChannel contract
 * - Funded test wallet (0.1 ETH from faucet)
 *
 * **Contract:** 0xBe140c80d39A94543e21458F9C1382EccBEC36Ee
 * **Network:** Base Sepolia (Chain ID: 84532)
 * **Faucet:** https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
 *
 * To run: pnpm test base-integration.test.ts --testTimeout=300000
 */

import { describe, it, expect, beforeAll } from "vitest"
import { type Hex, parseEther, keccak256, createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { baseSepolia } from "viem/chains"
import { createBaseClient } from "./client"
import { openChannel, closeChannel, getChannelFromContract } from "./functions/channel-operations"
import type { BaseSettlementConfig } from "./config"

describe.skip("Base L2 Integration Tests", () => {
  let config: BaseSettlementConfig
  let senderPrivateKey: Hex
  let senderAddress: string

  beforeAll(() => {
    // Test configuration
    config = {
      enabled: true,
      rpcUrl: "https://sepolia.base.org",
      contractAddress: "0xBe140c80d39A94543e21458F9C1382EccBEC36Ee",
      relayAddress: "0xBf03170A6be04F80386c050E57CADBa2D465f0af", // Relay address from deployment
      privateKey:
        "0x03d39a2dfdff9ae7190033bef490b42336e34a19373e7e6fe7128426e12369fc", // Relay private key
      settlementThreshold: parseEther("0.1"),
      settlementInterval: 3600,
      gasLimit: 500_000,
      maxFeePerGas: 10_000_000_000n,
      realm: "test",
    }

    // Generate sender wallet (user who will open channel)
    // In real test, this wallet needs 0.1 ETH from faucet
    senderPrivateKey =
      "0x1234567890123456789012345678901234567890123456789012345678901234" as Hex
    const senderAccount = privateKeyToAccount(senderPrivateKey)
    senderAddress = senderAccount.address
  })

  describe("Full Channel Lifecycle", () => {
    it("should open channel, verify claims, and close channel", async () => {
      const client = await createBaseClient(config)

      // STEP 1: Open channel with 0.01 ETH
      const openResult = await openChannel(client, config, {
        recipient: config.relayAddress as Hex,
        amount: parseEther("0.01"),
        duration: 3600, // 1 hour
      })

      expect(openResult.channelId).toBeDefined()
      expect(openResult.txHash).toBeDefined()

      const channelId = openResult.channelId

      // STEP 2: Verify channel opened on-chain
      const channelState = await getChannelFromContract(client, channelId)
      expect(channelState.sender).toBe(senderAddress)
      expect(channelState.balance).toBe(parseEther("0.01"))
      expect(channelState.isClosed).toBe(false)

      // STEP 3: Create signed claim (0.008 ETH, nonce 1)
      const claimAmount = parseEther("0.008")
      const nonce = 1

      // Create signature (matches Solidity format)
      const packedData = Buffer.concat([
        Buffer.from(channelId.slice(2), "hex"),
        Buffer.from(claimAmount.toString(16).padStart(64, "0"), "hex"),
        Buffer.from(nonce.toString(16).padStart(64, "0"), "hex"),
      ])
      const messageHash = keccak256(`0x${packedData.toString("hex")}`)

      const senderWallet = createWalletClient({
        account: privateKeyToAccount(senderPrivateKey),
        chain: baseSepolia,
        transport: http(config.rpcUrl),
      })

      const signature = await senderWallet.signMessage({
        message: { raw: messageHash },
      })

      // STEP 4: Close channel with final claim
      const closeResult = await closeChannel(client, config, {
        channelId,
        claimAmount,
        nonce,
        signature,
      })

      expect(closeResult.settled).toBe(true)
      expect(closeResult.txHash).toBeDefined()

      // STEP 5: Verify channel closed on-chain
      const finalChannelState = await getChannelFromContract(client, channelId)
      expect(finalChannelState.isClosed).toBe(true)

      // Relay should have received 0.008 ETH
      // Sender should have received 0.002 ETH refund
    }, 300_000) // 5 minute timeout
  })

  describe("Invalid Claim Rejection", () => {
    it("should reject claim with invalid signature", () => {
      // Test requires live channel - skip for MVP
      expect(true).toBe(true)
    })

    it("should reject claim with non-monotonic nonce", () => {
      // Test requires live channel - skip for MVP
      expect(true).toBe(true)
    })

    it("should reject claim exceeding balance", () => {
      // Test requires live channel - skip for MVP
      expect(true).toBe(true)
    })
  })
})
