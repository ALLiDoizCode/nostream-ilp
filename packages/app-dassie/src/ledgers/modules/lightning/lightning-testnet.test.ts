/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any */
// Test file: `any` types acceptable for mocking complex interfaces

import { describe, it, expect, vi, beforeEach } from "vitest"

import lightningTestnet from "./lightning-testnet"
import type { LightningPeerState } from "./types/peer-state"

// Mock the Lightning client
vi.mock("./client", () => ({
  createLightningClient: vi.fn().mockRejectedValue(new Error("CLN not available")),
  ClnClient: vi.fn(),
}))

// Mock logger
vi.mock("../../../logger/instances", () => ({
  settlementLightning: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe("Lightning Testnet Settlement Module", () => {
  it("exports correct module name", () => {
    expect(lightningTestnet.name).toBe("btc+lightning-testnet+btc")
  })

  it("exports supportedVersions: [1]", () => {
    expect(lightningTestnet.supportedVersions).toEqual([1])
  })

  it("exports realm: test", () => {
    expect(lightningTestnet.realm).toBe("test")
  })

  it("has correct ledger ID", () => {
    expect(lightningTestnet.ledger).toBe("btc+lightning-testnet+btc")
  })

  describe("Settlement Engine (stub mode when CLN unavailable)", () => {
    let engine: Awaited<ReturnType<typeof lightningTestnet.behavior>>

    beforeEach(async () => {
      // Mock reactor and host
      const mockReactor = {
        use: vi.fn().mockReturnValue(vi.fn()),
      }

      const mockHost = {
        sendMessage: vi.fn(),
        reportIncomingSettlement: vi.fn(),
        finalizeOutgoingSettlement: vi.fn(),
        cancelOutgoingSettlement: vi.fn(),
        reportDeposit: vi.fn(),
        reportWithdrawal: vi.fn(),
        getEntropy: vi.fn(),
      }

      engine = await lightningTestnet.behavior({
        sig: { reactor: mockReactor } as any,
        settlementSchemeId: "btc+lightning-testnet+btc" as any,
        host: mockHost,
      })
    })

    it("getPeeringInfo returns valid data", async () => {
      const result = await engine.getPeeringInfo()
      expect(result).toHaveProperty("data")
      expect(result.data).toBeInstanceOf(Uint8Array)
    })

    it("createPeeringRequest returns valid data", async () => {
      const result = await engine.createPeeringRequest({
        peerId: "test-peer" as any,
        peeringInfo: new Uint8Array(0),
      })
      expect(result).toHaveProperty("data")
      expect(result.data).toBeInstanceOf(Uint8Array)
    })

    it("acceptPeeringRequest returns false when stub", async () => {
      const result = await engine.acceptPeeringRequest({
        peerId: "test-peer" as any,
        data: new Uint8Array(0),
      })
      expect(result).toBe(false)
    })

    it("finalizePeeringRequest returns stub peer state", async () => {
      const result = await engine.finalizePeeringRequest({
        peerId: "test-peer" as any,
        peeringInfo: new Uint8Array(0),
        data: new Uint8Array(0),
      })
      expect(result).toHaveProperty("peerState")
      expect(result.peerState.status).toBe("pending")
    })

    it("prepareSettlement returns valid settlement instruction", async () => {
      const stubPeerState: LightningPeerState = {
        channelId: "test-channel",
        peerPubkey: "test-pubkey",
        capacity: 1_000_000n,
        localBalance: 500_000n,
        remoteBalance: 500_000n,
        status: "active",
      }

      const result = await engine.prepareSettlement({
        amount: 10_000n,
        peerId: "test-peer" as any,
        peerState: stubPeerState,
      })

      expect(result).toHaveProperty("message")
      expect(result).toHaveProperty("settlementId")
      expect(result).toHaveProperty("execute")
      expect(result.message).toBeInstanceOf(Uint8Array)
      expect(typeof result.settlementId).toBe("string")
      expect(typeof result.execute).toBe("function")
    })

    it("prepareSettlement execute completes", async () => {
      const stubPeerState: LightningPeerState = {
        channelId: "test-channel",
        peerPubkey: "test-pubkey",
        capacity: 1_000_000n,
        localBalance: 500_000n,
        remoteBalance: 500_000n,
        status: "active",
      }

      const result = await engine.prepareSettlement({
        amount: 10_000n,
        peerId: "test-peer" as any,
        peerState: stubPeerState,
      })

      const executeResult = await result.execute()
      expect(executeResult).toBeDefined()
    })

    it("handleSettlement completes without error", async () => {
      const stubPeerState: LightningPeerState = {
        channelId: "test-channel",
        peerPubkey: "test-pubkey",
        capacity: 1_000_000n,
        localBalance: 500_000n,
        remoteBalance: 500_000n,
        status: "active",
      }

      await expect(
        engine.handleSettlement({
          amount: 10_000n,
          peerId: "test-peer" as any,
          settlementSchemeData: new Uint8Array(0),
          peerState: stubPeerState,
        }),
      ).resolves.toBeUndefined()
    })

    it("handleMessage completes without error", async () => {
      await expect(
        engine.handleMessage({
          peerId: "test-peer" as any,
          message: new Uint8Array(0),
        }),
      ).resolves.toBeUndefined()
    })

    it("handleDeposit completes without error", async () => {
      await expect(
        engine.handleDeposit({
          amount: 100_000n,
        }),
      ).resolves.toBeUndefined()
    })

    it("getBalance returns bigint", () => {
      const balance = engine.getBalance()
      expect(typeof balance).toBe("bigint")
      expect(balance).toBe(0n)
    })
  })
})
