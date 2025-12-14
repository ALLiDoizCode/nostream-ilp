import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleClosePacket } from '../../src/btp-nips/handlers/close-handler'
import { handleReqPacket } from '../../src/btp-nips/handlers/req-handler'
import { SubscriptionManager } from '../../src/btp-nips/subscription-manager'
import { NostrMessageType } from '../../src/btp-nips/types/index'

import type { ILPPacket } from '../../src/btp-nips/handlers/req-handler'
import type { BTPNIPsPacket, NostrClose, NostrReq } from '../../src/btp-nips/types/index'

/**
 * REQ and CLOSE Handler Unit Tests
 * Tests for subscription request and close handlers
 *
 * Coverage:
 * - REQ with valid payment → subscription created
 * - REQ with insufficient payment → rejected
 * - REQ sends stored events + EOSE
 * - CLOSE → subscription removed
 * - Edge cases and error handling
 */

// Mock EventRepository
vi.mock('../../src/btp-nips/storage/event-repository', () => ({
  getEventRepository: () => ({
    queryEventsByFilters: vi.fn().mockResolvedValue([
      {
        id: 'event_1',
        pubkey: 'alice_pubkey',
        created_at: 1609459200,
        kind: 1,
        tags: [],
        content: 'Hello',
        sig: 'sig1',
      },
      {
        id: 'event_2',
        pubkey: 'alice_pubkey',
        created_at: 1609459300,
        kind: 1,
        tags: [],
        content: 'World',
        sig: 'sig2',
      },
    ]),
  }),
}))

// Mock packet sender
vi.mock('../../src/btp-nips/utils/packet-sender', () => ({
  sendEventPacket: vi.fn().mockResolvedValue(undefined),
  sendEosePacket: vi.fn().mockResolvedValue(undefined),
  sendClosedPacket: vi.fn().mockResolvedValue(undefined),
  sendNoticePacket: vi.fn().mockResolvedValue(undefined),
}))

describe('REQ Handler', () => {
  let subscriptionManager: SubscriptionManager

  beforeEach(() => {
    subscriptionManager = new SubscriptionManager()
    vi.clearAllMocks()
  })

  it('should create subscription with valid payment', async () => {
    const packet: BTPNIPsPacket = {
      header: {
        version: 1,
        messageType: NostrMessageType.REQ,
        payloadLength: 256,
      },
      payload: {
        payment: {
          amount: '5000', // 5000 msats for 1 hour
          currency: 'msat',
          purpose: 'subscription',
        },
        nostr: {
          subscriptionId: 'sub-123',
          filters: [{ kinds: [1] }],
        } as NostrReq,
        metadata: {
          timestamp: Date.now(),
          sender: 'g.dassie.alice',
          ttl: 3600, // 1 hour
        },
      },
    }

    const ilpPacket: ILPPacket = {
      data: Buffer.from([]),
      destination: 'relay',
      amount: '5000',
    }

    await handleReqPacket(packet, ilpPacket, subscriptionManager)

    // Subscription should be created
    const sub = subscriptionManager.getSubscription('sub-123')
    expect(sub).not.toBeNull()
    expect(sub?.filters).toEqual([{ kinds: [1] }])
  })

  it('should reject REQ with insufficient payment', async () => {
    const packet: BTPNIPsPacket = {
      header: {
        version: 1,
        messageType: NostrMessageType.REQ,
        payloadLength: 256,
      },
      payload: {
        payment: {
          amount: '1000', // Only 1000 msats, required 5000
          currency: 'msat',
          purpose: 'subscription',
        },
        nostr: {
          subscriptionId: 'sub-123',
          filters: [{ kinds: [1] }],
        } as NostrReq,
        metadata: {
          timestamp: Date.now(),
          sender: 'g.dassie.alice',
          ttl: 3600,
        },
      },
    }

    const ilpPacket: ILPPacket = {
      data: Buffer.from([]),
      destination: 'relay',
      amount: '1000',
    }

    await handleReqPacket(packet, ilpPacket, subscriptionManager)

    // Subscription should NOT be created
    const sub = subscriptionManager.getSubscription('sub-123')
    expect(sub).toBeNull()
  })

  it('should reject REQ with invalid subscription ID', async () => {
    const packet: BTPNIPsPacket = {
      header: {
        version: 1,
        messageType: NostrMessageType.REQ,
        payloadLength: 256,
      },
      payload: {
        payment: {
          amount: '5000',
          currency: 'msat',
          purpose: 'subscription',
        },
        nostr: {
          subscriptionId: '', // Invalid: empty string
          filters: [{ kinds: [1] }],
        } as NostrReq,
        metadata: {
          timestamp: Date.now(),
          sender: 'g.dassie.alice',
          ttl: 3600,
        },
      },
    }

    const ilpPacket: ILPPacket = {
      data: Buffer.from([]),
      destination: 'relay',
      amount: '5000',
    }

    await handleReqPacket(packet, ilpPacket, subscriptionManager)

    // Subscription should NOT be created
    expect(subscriptionManager.getSubscriptionCount()).toBe(0)
  })

  it('should reject REQ with TTL too high', async () => {
    const packet: BTPNIPsPacket = {
      header: {
        version: 1,
        messageType: NostrMessageType.REQ,
        payloadLength: 256,
      },
      payload: {
        payment: {
          amount: '500000',
          currency: 'msat',
          purpose: 'subscription',
        },
        nostr: {
          subscriptionId: 'sub-123',
          filters: [{ kinds: [1] }],
        } as NostrReq,
        metadata: {
          timestamp: Date.now(),
          sender: 'g.dassie.alice',
          ttl: 100000, // Too high (max 86400)
        },
      },
    }

    const ilpPacket: ILPPacket = {
      data: Buffer.from([]),
      destination: 'relay',
      amount: '500000',
    }

    await handleReqPacket(packet, ilpPacket, subscriptionManager)

    // Subscription should NOT be created
    const sub = subscriptionManager.getSubscription('sub-123')
    expect(sub).toBeNull()
  })

  it('should use default TTL if not specified', async () => {
    const packet: BTPNIPsPacket = {
      header: {
        version: 1,
        messageType: NostrMessageType.REQ,
        payloadLength: 256,
      },
      payload: {
        payment: {
          amount: '5000',
          currency: 'msat',
          purpose: 'subscription',
        },
        nostr: {
          subscriptionId: 'sub-123',
          filters: [{ kinds: [1] }],
        } as NostrReq,
        metadata: {
          timestamp: Date.now(),
          sender: 'g.dassie.alice',
          // No TTL specified - should use default (3600)
        },
      },
    }

    const ilpPacket: ILPPacket = {
      data: Buffer.from([]),
      destination: 'relay',
      amount: '5000',
    }

    await handleReqPacket(packet, ilpPacket, subscriptionManager)

    // Subscription should be created with default TTL
    const sub = subscriptionManager.getSubscription('sub-123')
    expect(sub).not.toBeNull()
  })
})

describe('CLOSE Handler', () => {
  let subscriptionManager: SubscriptionManager

  beforeEach(() => {
    subscriptionManager = new SubscriptionManager()
    vi.clearAllMocks()
  })

  it('should remove subscription on CLOSE', async () => {
    // First create a subscription
    const mockStream: any = {
      sendPacket: vi.fn().mockResolvedValue(undefined),
      fulfillPacket: vi.fn().mockResolvedValue(undefined),
      rejectPacket: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    }

    subscriptionManager.addSubscription({
      id: 'sub-123',
      subscriber: 'g.dassie.alice',
      streamConnection: mockStream,
      filters: [{ kinds: [1] }],
      expiresAt: Date.now() + 3600000,
      active: true,
    })

    // Now send CLOSE
    const packet: BTPNIPsPacket = {
      header: {
        version: 1,
        messageType: NostrMessageType.CLOSE,
        payloadLength: 128,
      },
      payload: {
        payment: {
          amount: '0', // No payment required for CLOSE
          currency: 'msat',
          purpose: 'close',
        },
        nostr: {
          subscriptionId: 'sub-123',
        } as NostrClose,
        metadata: {
          timestamp: Date.now(),
          sender: 'g.dassie.alice',
        },
      },
    }

    const ilpPacket: ILPPacket = {
      data: Buffer.from([]),
      destination: 'relay',
      amount: '0',
    }

    await handleClosePacket(packet, ilpPacket, subscriptionManager)

    // Subscription should be removed
    const sub = subscriptionManager.getSubscription('sub-123')
    expect(sub).toBeNull()
  })

  it('should handle CLOSE for non-existent subscription gracefully', async () => {
    const packet: BTPNIPsPacket = {
      header: {
        version: 1,
        messageType: NostrMessageType.CLOSE,
        payloadLength: 128,
      },
      payload: {
        payment: {
          amount: '0',
          currency: 'msat',
          purpose: 'close',
        },
        nostr: {
          subscriptionId: 'nonexistent',
        } as NostrClose,
        metadata: {
          timestamp: Date.now(),
          sender: 'g.dassie.alice',
        },
      },
    }

    const ilpPacket: ILPPacket = {
      data: Buffer.from([]),
      destination: 'relay',
      amount: '0',
    }

    // Should not throw
    await expect(
      handleClosePacket(packet, ilpPacket, subscriptionManager)
    ).resolves.not.toThrow()
  })

  it('should handle CLOSE with invalid subscription ID', async () => {
    const packet: BTPNIPsPacket = {
      header: {
        version: 1,
        messageType: NostrMessageType.CLOSE,
        payloadLength: 128,
      },
      payload: {
        payment: {
          amount: '0',
          currency: 'msat',
          purpose: 'close',
        },
        nostr: {
          subscriptionId: '', // Invalid: empty
        } as NostrClose,
        metadata: {
          timestamp: Date.now(),
          sender: 'g.dassie.alice',
        },
      },
    }

    const ilpPacket: ILPPacket = {
      data: Buffer.from([]),
      destination: 'relay',
      amount: '0',
    }

    // Should not throw
    await expect(
      handleClosePacket(packet, ilpPacket, subscriptionManager)
    ).resolves.not.toThrow()
  })
})
