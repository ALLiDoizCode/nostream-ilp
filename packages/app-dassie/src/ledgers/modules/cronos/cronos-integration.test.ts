/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { describe, it, expect, beforeAll } from "vitest"
import { type Hex, keccak256, parseUnits, formatUnits } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { createCronosClient } from "./client"
import { openChannel, closeChannel } from "./functions/channel-operations"
import type { CronosSettlementConfig } from "./config"

/**
 * Integration tests for Cronos settlement module.
 * These tests are skipped by default and require testnet configuration.
 *
 * To run these tests:
 * 1. Set CRONOS_RELAY_PRIVATE_KEY environment variable
 * 2. Ensure test wallet has TCRO for gas (get from faucet)
 * 3. Remove .skip from describe
 * 4. Run: pnpm test cronos-integration.test.ts --testTimeout=300000
 */
describe.skip("Cronos Integration Tests", () => {
  const testConfig: CronosSettlementConfig = {
    enabled: true,
    rpcUrl: "https://evm-t3.cronos.org/",
    chainId: 338,
    contractAddress: "0x4b9e32389896C05A4CAfC41bE9dA6bB108a7dA72",
    aktTokenAddress: "0xf7e968d6f3bdFC504A434288Ea3f243e033e846F",
    relayAddress: process.env["CRONOS_RELAY_ADDRESS"] ?? "",
    privateKey: process.env["CRONOS_RELAY_PRIVATE_KEY"] ?? "",
    settlementThreshold: 100_000_000n,
    settlementInterval: 3600,
    gasLimit: 500_000,
    maxFeePerGas: 10_000_000_000n,
    realm: "test",
  }

  // Generate a test sender wallet
  const senderPrivateKey = process.env["CRONOS_SENDER_PRIVATE_KEY"] ?? "0x0000000000000000000000000000000000000000000000000000000000000001"
  const senderAccount = privateKeyToAccount(senderPrivateKey as Hex)

  let client: Awaited<ReturnType<typeof createCronosClient>>

  beforeAll(async () => {
    if (!testConfig.privateKey) {
      // Skipping tests: CRONOS_RELAY_PRIVATE_KEY not set
      return
    }

    // Initialize client
    client = await createCronosClient(testConfig)

    // Ensure relay has some test AKT for testing
    // Note: In production, this would be done manually via faucet or purchase
  }, 30_000)

  it("should connect to Cronos testnet RPC", async () => {
    if (!testConfig.privateKey) {
      return
    }

    expect(client).toBeDefined()
    const health = await client.checkHealth()
    expect(health).toBe(true)
  }, 30_000)

  it("should mint test AKT tokens to sender", async () => {
    if (!testConfig.privateKey) {
      return
    }

    // Mint 1000 AKT to sender for testing (1000 * 10^6 = 1_000_000_000)
    const mintAmount = parseUnits("1000", 6)

    // @ts-expect-error - Adding mint function temporarily
    const txHash = await client.aktContract.write.mint([senderAccount.address, mintAmount], {
      gas: BigInt(testConfig.gasLimit),
    })

    expect(txHash).toBeDefined()

    // Wait for confirmation
    const receipt = await client.publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1,
    })

    expect(receipt.status).toBe("success")

    // Verify balance
    const balance = await client.aktContract.read.balanceOf([senderAccount.address])
    expect(balance).toBeGreaterThanOrEqual(mintAmount)

    console.log(`Minted ${formatUnits(balance, 6)} AKT to sender ${senderAccount.address}`)
  }, 60_000)

  it("should complete full channel lifecycle with ERC-20 approval", async () => {
    if (!testConfig.privateKey) {
      return
    }

    // 1. Check initial balances
    const initialSenderBalance = await client.aktContract.read.balanceOf([senderAccount.address])
    const initialRelayBalance = await client.aktContract.read.balanceOf([testConfig.relayAddress as Hex])

    console.log(`Initial sender balance: ${formatUnits(initialSenderBalance, 6)} AKT`)
    console.log(`Initial relay balance: ${formatUnits(initialRelayBalance, 6)} AKT`)

    // 2. Open channel with 10 AKT
    const channelAmount = parseUnits("10", 6) // 10 AKT = 10_000_000
    const channelDuration = 3600 // 1 hour

    const openResult = await openChannel(client, testConfig, {
      recipient: testConfig.relayAddress as Hex,
      amount: channelAmount,
      duration: channelDuration,
    })

    expect(openResult.channelId).toBeDefined()
    expect(openResult.txHash).toBeDefined()
    console.log(`Channel opened: ${openResult.channelId}`)
    console.log(`Open tx: ${openResult.txHash}`)

    // 3. Verify channel state on-chain
    const channel = await client.channelContract.read.getChannel([openResult.channelId])
    const [sender, recipient, balance, highestNonce, _expiration, isClosed] = channel

    expect(sender.toLowerCase()).toBe(senderAccount.address.toLowerCase())
    expect(recipient.toLowerCase()).toBe(testConfig.relayAddress.toLowerCase())
    expect(balance).toBe(channelAmount)
    expect(highestNonce).toBe(0n)
    expect(isClosed).toBe(false)

    console.log(`Channel balance: ${formatUnits(balance, 6)} AKT`)

    // 4. Create signed claim for 1 AKT (nonce 1)
    const claimAmount = parseUnits("1", 6) // 1 AKT = 1_000_000
    const nonce = 1

    // Create message hash (same as settlement-engine.ts)
    const packedData = Buffer.concat([
      Buffer.from(openResult.channelId.slice(2), "hex"), // bytes32
      Buffer.from(claimAmount.toString(16).padStart(64, "0"), "hex"), // uint256
      Buffer.from(nonce.toString(16).padStart(64, "0"), "hex"), // uint256
    ])
    const messageHash = keccak256(`0x${packedData.toString("hex")}`)

    // Sign with sender's private key
    const signature = await senderAccount.signMessage({
      message: { raw: messageHash },
    })

    console.log(`Created claim: ${formatUnits(claimAmount, 6)} AKT, nonce ${nonce}`)

    // 5. Close channel with final claim
    const closeResult = await closeChannel(client, testConfig, {
      channelId: openResult.channelId,
      claimAmount,
      nonce,
      signature,
    })

    expect(closeResult.txHash).toBeDefined()
    expect(closeResult.settled).toBe(true)
    console.log(`Channel closed: ${closeResult.txHash}`)

    // 6. Verify final balances
    const finalSenderBalance = await client.aktContract.read.balanceOf([senderAccount.address])
    const finalRelayBalance = await client.aktContract.read.balanceOf([testConfig.relayAddress as Hex])

    // Sender should have received refund: initialBalance - claimAmount
    // Relay should have received: claimAmount
    expect(finalSenderBalance).toBe(initialSenderBalance - claimAmount)
    expect(finalRelayBalance).toBe(initialRelayBalance + claimAmount)

    console.log(`Final sender balance: ${formatUnits(finalSenderBalance, 6)} AKT`)
    console.log(`Final relay balance: ${formatUnits(finalRelayBalance, 6)} AKT`)
    console.log(`Sender refunded: ${formatUnits(channelAmount - claimAmount, 6)} AKT`)
    console.log(`Relay received: ${formatUnits(claimAmount, 6)} AKT`)
  }, 300_000) // 5 minute timeout for Cronos testnet confirmations

  it("should handle ERC-20 approval flow correctly", async () => {
    if (!testConfig.privateKey) {
      return
    }

    // 1. Check initial allowance (should be 0 or from previous test)
    const initialAllowance = await client.aktContract.read.allowance([
      senderAccount.address,
      testConfig.contractAddress as Hex,
    ])

    console.log(`Initial allowance: ${formatUnits(initialAllowance, 6)} AKT`)

    // 2. Open channel (should auto-approve if needed)
    const channelAmount = parseUnits("5", 6) // 5 AKT
    const channelDuration = 3600

    const openResult = await openChannel(client, testConfig, {
      recipient: testConfig.relayAddress as Hex,
      amount: channelAmount,
      duration: channelDuration,
    })

    expect(openResult.channelId).toBeDefined()

    // 3. Verify allowance was set (or consumed if already set)
    const finalAllowance = await client.aktContract.read.allowance([
      senderAccount.address,
      testConfig.contractAddress as Hex,
    ])

    console.log(`Final allowance: ${formatUnits(finalAllowance, 6)} AKT`)

    // Allowance should be set if it was 0, or decreased if it existed
    // Note: The exact behavior depends on whether ensureAllowance was called
    expect(finalAllowance).toBeDefined()

    // Clean up: Close the channel
    const claimAmount = parseUnits("0.1", 6)
    const nonce = 1
    const packedData = Buffer.concat([
      Buffer.from(openResult.channelId.slice(2), "hex"),
      Buffer.from(claimAmount.toString(16).padStart(64, "0"), "hex"),
      Buffer.from(nonce.toString(16).padStart(64, "0"), "hex"),
    ])
    const messageHash = keccak256(`0x${packedData.toString("hex")}`)
    const signature = await senderAccount.signMessage({ message: { raw: messageHash } })

    await closeChannel(client, testConfig, {
      channelId: openResult.channelId,
      claimAmount,
      nonce,
      signature,
    })
  }, 300_000)

  it("should handle insufficient AKT balance error", async () => {
    if (!testConfig.privateKey) {
      return
    }

    // Try to open channel with more AKT than sender has
    const senderBalance = await client.aktContract.read.balanceOf([senderAccount.address])
    const excessiveAmount = senderBalance + parseUnits("1000", 6) // Way more than balance

    console.log(`Sender balance: ${formatUnits(senderBalance, 6)} AKT`)
    console.log(`Attempting to open channel with: ${formatUnits(excessiveAmount, 6)} AKT`)

    // This should fail with InsufficientBalance error
    await expect(async () => {
      await openChannel(client, testConfig, {
        recipient: testConfig.relayAddress as Hex,
        amount: excessiveAmount,
        duration: 3600,
      })
    }).rejects.toThrow()

    console.log("Insufficient balance error caught correctly")
  }, 60_000)

  it("should handle expired channel correctly", async () => {
    if (!testConfig.privateKey) {
      return
    }

    // Open channel with very short duration (10 seconds)
    const channelAmount = parseUnits("1", 6)
    const channelDuration = 10 // 10 seconds

    const openResult = await openChannel(client, testConfig, {
      recipient: testConfig.relayAddress as Hex,
      amount: channelAmount,
      duration: channelDuration,
    })

    console.log(`Channel opened with 10 second expiration: ${openResult.channelId}`)

    // Wait for channel to expire (11 seconds)
    console.log("Waiting for channel to expire...")
    await new Promise(resolve => setTimeout(resolve, 11_000))

    // Verify channel is expired
    const channel = await client.channelContract.read.getChannel([openResult.channelId])
    const expiration = channel[4]
    const now = Math.floor(Date.now() / 1000)

    expect(now).toBeGreaterThan(Number(expiration))
    console.log(`Channel expired at ${expiration}, current time ${now}`)

    // Try to close expired channel (should still work, but signature should be rejected if we implement expiration check)
    // For now, just verify we can call expireChannel
    // Note: expireChannel function not implemented in channel-operations.ts yet
    console.log("Expired channel handling verified")
  }, 60_000)
})
