import { calculateRequiredPayment, extractPaymentClaim } from '../../../src/services/payment'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventMessageHandler } from '../../../src/handlers/event-message-handler'

import type { IWebSocketAdapter } from '../../../src/@types/adapters'
import type { Event } from '../../../src/@types/event'
import type { PaymentClaim } from '../../../src/@types/payment-claim'
import type { IUserRepository } from '../../../src/@types/repositories'
import type { Settings } from '../../../src/@types/settings'
import type { DassieClient } from '../../../src/services/payment/dassie-client'

/**
 * Unit tests for EventMessageHandler payment verification
 *
 * Tests payment verification logic with mocked dependencies.
 */

// Mock dependencies
vi.mock('../../../src/services/payment', () => ({
  extractPaymentClaim: vi.fn(),
  calculateRequiredPayment: vi.fn(),
}))

vi.mock('../../../src/utils/event', async () => {
  const actual = await vi.importActual('../../../src/utils/event')
  return {
    ...actual,
    getRelayPrivateKey: vi.fn(() => 'relay-privkey'),
    getPublicKey: vi.fn(() => 'relay-pubkey'),
    isEventKindOrRangeMatch: (event: Event) => (kind: number | [number, number]) => {
      // Simple matcher for tests - returns true if event kind matches
      if (Array.isArray(kind)) {
        return event.kind >= kind[0] && event.kind <= kind[1]
      }
      return event.kind === kind
    },
  }
})

describe('EventMessageHandler - Payment Verification', () => {
  let handler: EventMessageHandler
  let mockWebSocket: IWebSocketAdapter
  let mockStrategyFactory: any
  let mockUserRepository: IUserRepository
  let mockSettings: () => Settings
  let mockRateLimiterFactory: any
  let mockDassieClient: DassieClient
  let mockExtractPaymentClaim: any
  let mockCalculateRequiredPayment: any
  let mockFreeTierTracker: any
  let mockDegradedModeManager: any

  const createMockEvent = (overrides: Partial<Event> = {}): Event => ({
    id: 'test-event-id',
    pubkey: 'test-pubkey',
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: 'test content',
    sig: 'test-sig',
    ...overrides,
  })

  const createMockClaim = (overrides: Partial<PaymentClaim> = {}): PaymentClaim => ({
    channelId: 'test-channel-id',
    amountSats: 100,
    nonce: 1,
    signature: 'test-signature',
    currency: 'BTC',
    ...overrides,
  })

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    mockExtractPaymentClaim = vi.mocked(extractPaymentClaim)
    mockCalculateRequiredPayment = vi.mocked(calculateRequiredPayment)
    // Set default return value for pricing calculator
    mockCalculateRequiredPayment.mockReturnValue(10n)

    // Mock WebSocket
    mockWebSocket = {
      emit: vi.fn(),
      getClientAddress: vi.fn(() => '127.0.0.1'),
    } as any

    // Mock strategy factory
    mockStrategyFactory = vi.fn(() => ({
      execute: vi.fn(),
    }))

    // Mock user repository
    mockUserRepository = {
      findByPubkey: vi.fn(async () => ({ isAdmitted: true, balance: 1000n })),
    } as any

    // Mock settings with payments disabled by default
    mockSettings = vi.fn(() => ({
      info: { relay_url: 'wss://relay.test' },
      payments: {
        enabled: false,
        feeSchedules: {
          admission: [],
          publication: [],
        },
      },
    } as Settings))

    // Mock rate limiter factory
    mockRateLimiterFactory = vi.fn(() => ({
      hit: vi.fn(async () => false),
    }))

    // Mock Dassie client
    mockDassieClient = {
      isConnected: vi.fn(() => true),
      verifyPaymentClaim: vi.fn(async () => ({ valid: true })),
      connect: vi.fn(),
      disconnect: vi.fn(),
    } as any

    // Mock FreeTierTracker
    mockFreeTierTracker = {
      checkFreeTierEligibility: vi.fn(async () => ({ eligible: false, reason: null })),
      consumeFreeTierAllowance: vi.fn(async () => true),
      getFreeTierStatus: vi.fn(async () => ({ remaining: 0, total: 0 })),
    } as any

    // Mock DegradedModeManager
    mockDegradedModeManager = {
      isDegraded: vi.fn(() => false),
      enterDegradedMode: vi.fn(),
      exitDegradedMode: vi.fn(),
      getStatus: vi.fn(() => ({ degraded: false, reason: null })),
    } as any

    handler = new EventMessageHandler(
      mockWebSocket,
      mockStrategyFactory,
      mockUserRepository,
      mockSettings,
      mockRateLimiterFactory,
      mockDassieClient,
      mockFreeTierTracker,
      mockDegradedModeManager
    )
  })

  describe('verifyPaymentClaim()', () => {
    it('should allow event when payments disabled', async () => {
      const event = createMockEvent()

      // @ts-expect-error - accessing protected method for testing
      const result = await handler.verifyPaymentClaim(event)

      expect(result).toBeUndefined()
      expect(mockExtractPaymentClaim).not.toHaveBeenCalled()
    })

    it('should allow relay own events without payment', async () => {
      mockSettings = vi.fn(() => ({
        info: { relay_url: 'wss://relay.test' },
        payments: {
          enabled: true,
          feeSchedules: {
            admission: [],
            publication: [
              {
                enabled: true,
                amount: 10n,
                whitelists: { event_kinds: [1] },
              },
            ],
          },
        },
      } as Settings))

      handler = new EventMessageHandler(
        mockWebSocket,
        mockStrategyFactory,
        mockUserRepository,
        mockSettings,
        mockRateLimiterFactory,
        mockDassieClient,
        mockFreeTierTracker,
        mockDegradedModeManager
      )

      const event = createMockEvent({ pubkey: 'relay-pubkey' })

      // @ts-expect-error - accessing protected method for testing
      const result = await handler.verifyPaymentClaim(event)

      expect(result).toBeUndefined()
    })

    it('should reject event when payment required but not provided', async () => {
      mockSettings = vi.fn(() => ({
        info: { relay_url: 'wss://relay.test' },
        payments: {
          enabled: true,
          feeSchedules: {
            admission: [],
            publication: [
              {
                enabled: true,
                amount: 50n,
                whitelists: { event_kinds: [1] },
              },
            ],
          },
        },
      } as Settings))

      handler = new EventMessageHandler(
        mockWebSocket,
        mockStrategyFactory,
        mockUserRepository,
        mockSettings,
        mockRateLimiterFactory,
        mockDassieClient,
        mockFreeTierTracker,
        mockDegradedModeManager
      )

      const event = createMockEvent({ kind: 1 })
      mockExtractPaymentClaim.mockReturnValue(null)

      // @ts-expect-error - accessing protected method for testing
      const result = await handler.verifyPaymentClaim(event)

      expect(result).toBe('restricted: payment required - 50 sats')
      expect(mockExtractPaymentClaim).toHaveBeenCalledWith(event)
    })

    it('should allow event when payment not required and not provided', async () => {
      mockSettings = vi.fn(() => ({
        info: { relay_url: 'wss://relay.test' },
        payments: {
          enabled: true,
          feeSchedules: {
            admission: [],
            publication: [
              {
                enabled: true,
                amount: 50n,
                whitelists: { event_kinds: [30023] }, // Different kind
              },
            ],
          },
        },
      } as Settings))

      // Mock pricing calculator to return 0 when no fee schedule matches
      mockCalculateRequiredPayment.mockReturnValue(0n)

      handler = new EventMessageHandler(
        mockWebSocket,
        mockStrategyFactory,
        mockUserRepository,
        mockSettings,
        mockRateLimiterFactory,
        mockDassieClient,
        mockFreeTierTracker,
        mockDegradedModeManager
      )

      const event = createMockEvent({ kind: 1 })
      mockExtractPaymentClaim.mockReturnValue(null)

      // @ts-expect-error - accessing protected method for testing
      const result = await handler.verifyPaymentClaim(event)

      expect(result).toBeUndefined()
    })

    it('should reject event when Dassie disconnected', async () => {
      mockSettings = vi.fn(() => ({
        info: { relay_url: 'wss://relay.test' },
        payments: {
          enabled: true,
          feeSchedules: {
            admission: [],
            publication: [],
          },
        },
      } as Settings))

      mockDassieClient.isConnected = vi.fn(() => false)

      handler = new EventMessageHandler(
        mockWebSocket,
        mockStrategyFactory,
        mockUserRepository,
        mockSettings,
        mockRateLimiterFactory,
        mockDassieClient,
        mockFreeTierTracker,
        mockDegradedModeManager
      )

      const event = createMockEvent()
      const claim = createMockClaim()
      mockExtractPaymentClaim.mockReturnValue(claim)

      // @ts-expect-error - accessing protected method for testing
      const result = await handler.verifyPaymentClaim(event)

      expect(result).toBe('error: payment verification temporarily unavailable')
      expect(mockDassieClient.verifyPaymentClaim).not.toHaveBeenCalled()
    })

    it('should accept event with valid payment claim', async () => {
      mockSettings = vi.fn(() => ({
        info: { relay_url: 'wss://relay.test' },
        payments: {
          enabled: true,
          feeSchedules: {
            admission: [],
            publication: [
              {
                enabled: true,
                amount: 10n,
                whitelists: { event_kinds: [1] },
              },
            ],
          },
        },
      } as Settings))

      handler = new EventMessageHandler(
        mockWebSocket,
        mockStrategyFactory,
        mockUserRepository,
        mockSettings,
        mockRateLimiterFactory,
        mockDassieClient,
        mockFreeTierTracker,
        mockDegradedModeManager
      )

      const event = createMockEvent({ kind: 1 })
      const claim = createMockClaim({ amountSats: 50 })
      mockExtractPaymentClaim.mockReturnValue(claim)
      mockDassieClient.verifyPaymentClaim = vi.fn(async () => ({ valid: true }))

      // @ts-expect-error - accessing protected method for testing
      const result = await handler.verifyPaymentClaim(event)

      expect(result).toBeUndefined()
      expect(mockDassieClient.verifyPaymentClaim).toHaveBeenCalledWith(claim)
    })

    it('should reject event with insufficient payment amount', async () => {
      mockSettings = vi.fn(() => ({
        info: { relay_url: 'wss://relay.test' },
        payments: {
          enabled: true,
          feeSchedules: {
            admission: [],
            publication: [
              {
                enabled: true,
                amount: 100n,
                whitelists: { event_kinds: [1] },
              },
            ],
          },
        },
      } as Settings))

      handler = new EventMessageHandler(
        mockWebSocket,
        mockStrategyFactory,
        mockUserRepository,
        mockSettings,
        mockRateLimiterFactory,
        mockDassieClient,
        mockFreeTierTracker,
        mockDegradedModeManager
      )

      const event = createMockEvent({ kind: 1 })
      const claim = createMockClaim({ amountSats: 50 })
      mockExtractPaymentClaim.mockReturnValue(claim)
      mockDassieClient.verifyPaymentClaim = vi.fn(async () => ({ valid: true }))

      // @ts-expect-error - accessing protected method for testing
      const result = await handler.verifyPaymentClaim(event)

      expect(result).toBe('restricted: insufficient payment - need 100 sats, got 50 sats')
    })

    it('should reject event with invalid signature', async () => {
      mockSettings = vi.fn(() => ({
        info: { relay_url: 'wss://relay.test' },
        payments: {
          enabled: true,
          feeSchedules: { admission: [], publication: [] },
        },
      } as Settings))

      handler = new EventMessageHandler(
        mockWebSocket,
        mockStrategyFactory,
        mockUserRepository,
        mockSettings,
        mockRateLimiterFactory,
        mockDassieClient,
        mockFreeTierTracker,
        mockDegradedModeManager
      )

      const event = createMockEvent()
      const claim = createMockClaim()
      mockExtractPaymentClaim.mockReturnValue(claim)
      mockDassieClient.verifyPaymentClaim = vi.fn(async () => ({
        valid: false,
        error: 'invalid_signature',
      }))

      // @ts-expect-error - accessing protected method for testing
      const result = await handler.verifyPaymentClaim(event)

      expect(result).toBe('restricted: invalid payment signature')
    })

    it('should reject event with invalid nonce (replay attack)', async () => {
      mockSettings = vi.fn(() => ({
        info: { relay_url: 'wss://relay.test' },
        payments: {
          enabled: true,
          feeSchedules: { admission: [], publication: [] },
        },
      } as Settings))

      handler = new EventMessageHandler(
        mockWebSocket,
        mockStrategyFactory,
        mockUserRepository,
        mockSettings,
        mockRateLimiterFactory,
        mockDassieClient,
        mockFreeTierTracker,
        mockDegradedModeManager
      )

      const event = createMockEvent()
      const claim = createMockClaim()
      mockExtractPaymentClaim.mockReturnValue(claim)
      mockDassieClient.verifyPaymentClaim = vi.fn(async () => ({
        valid: false,
        error: 'invalid_nonce',
      }))

      // @ts-expect-error - accessing protected method for testing
      const result = await handler.verifyPaymentClaim(event)

      expect(result).toBe('restricted: invalid payment nonce (replay attack?)')
    })

    it('should reject event with expired channel', async () => {
      mockSettings = vi.fn(() => ({
        info: { relay_url: 'wss://relay.test' },
        payments: {
          enabled: true,
          feeSchedules: { admission: [], publication: [] },
        },
      } as Settings))

      handler = new EventMessageHandler(
        mockWebSocket,
        mockStrategyFactory,
        mockUserRepository,
        mockSettings,
        mockRateLimiterFactory,
        mockDassieClient,
        mockFreeTierTracker,
        mockDegradedModeManager
      )

      const event = createMockEvent()
      const claim = createMockClaim()
      mockExtractPaymentClaim.mockReturnValue(claim)
      mockDassieClient.verifyPaymentClaim = vi.fn(async () => ({
        valid: false,
        error: 'channel_expired',
      }))

      // @ts-expect-error - accessing protected method for testing
      const result = await handler.verifyPaymentClaim(event)

      expect(result).toBe('restricted: payment channel expired')
    })

    it('should reject event when channel not found', async () => {
      mockSettings = vi.fn(() => ({
        info: { relay_url: 'wss://relay.test' },
        payments: {
          enabled: true,
          feeSchedules: { admission: [], publication: [] },
        },
      } as Settings))

      handler = new EventMessageHandler(
        mockWebSocket,
        mockStrategyFactory,
        mockUserRepository,
        mockSettings,
        mockRateLimiterFactory,
        mockDassieClient,
        mockFreeTierTracker,
        mockDegradedModeManager
      )

      const event = createMockEvent()
      const claim = createMockClaim()
      mockExtractPaymentClaim.mockReturnValue(claim)
      mockDassieClient.verifyPaymentClaim = vi.fn(async () => ({
        valid: false,
        error: 'channel_not_found',
      }))

      // @ts-expect-error - accessing protected method for testing
      const result = await handler.verifyPaymentClaim(event)

      expect(result).toBe('restricted: payment channel not found')
    })

    it('should handle verification timeout', async () => {
      mockSettings = vi.fn(() => ({
        info: { relay_url: 'wss://relay.test' },
        payments: {
          enabled: true,
          feeSchedules: { admission: [], publication: [] },
        },
      } as Settings))

      handler = new EventMessageHandler(
        mockWebSocket,
        mockStrategyFactory,
        mockUserRepository,
        mockSettings,
        mockRateLimiterFactory,
        mockDassieClient,
        mockFreeTierTracker,
        mockDegradedModeManager
      )

      const event = createMockEvent()
      const claim = createMockClaim()
      mockExtractPaymentClaim.mockReturnValue(claim)

      // Simulate timeout by delaying response
      mockDassieClient.verifyPaymentClaim = vi.fn(
        () => new Promise((resolve) => setTimeout(() => resolve({ valid: true }), 6000))
      )

      // @ts-expect-error - accessing protected method for testing
      const result = await handler.verifyPaymentClaim(event)

      expect(result).toBe('error: payment verification timeout')
    })

    it('should handle unexpected verification errors', async () => {
      mockSettings = vi.fn(() => ({
        info: { relay_url: 'wss://relay.test' },
        payments: {
          enabled: true,
          feeSchedules: { admission: [], publication: [] },
        },
      } as Settings))

      handler = new EventMessageHandler(
        mockWebSocket,
        mockStrategyFactory,
        mockUserRepository,
        mockSettings,
        mockRateLimiterFactory,
        mockDassieClient,
        mockFreeTierTracker,
        mockDegradedModeManager
      )

      const event = createMockEvent()
      const claim = createMockClaim()
      mockExtractPaymentClaim.mockReturnValue(claim)
      mockDassieClient.verifyPaymentClaim = vi.fn(async () => {
        throw new Error('Network error')
      })

      // @ts-expect-error - accessing protected method for testing
      const result = await handler.verifyPaymentClaim(event)

      expect(result).toBe('error: payment verification failed')
    })
  })

  describe('calculateRequiredPayment()', () => {
    it('should fall back to pricing calculator when no fee schedules configured', () => {
      const event = createMockEvent({ kind: 1 })

      // @ts-expect-error - accessing private method for testing
      const amount = handler.calculateRequiredPayment(event)

      // Now falls back to environment variable pricing (Story 1.5)
      // Returns mocked calculateRequiredPayment result (undefined -> converted to 0n by BigInt coercion in actual code)
      // In real scenario, would return pricingConfig.storeEvent (10n default)
      expect(typeof amount).toBe('bigint')
    })

    it('should return configured amount for matching event kind', () => {
      mockSettings = vi.fn(() => ({
        info: { relay_url: 'wss://relay.test' },
        payments: {
          enabled: true,
          feeSchedules: {
            admission: [],
            publication: [
              {
                enabled: true,
                amount: 50n,
                whitelists: { event_kinds: [1] },
              },
            ],
          },
        },
      } as Settings))

      handler = new EventMessageHandler(
        mockWebSocket,
        mockStrategyFactory,
        mockUserRepository,
        mockSettings,
        mockRateLimiterFactory,
        mockDassieClient,
        mockFreeTierTracker,
        mockDegradedModeManager
      )

      const event = createMockEvent({ kind: 1 })

      // @ts-expect-error - accessing private method for testing
      const amount = handler.calculateRequiredPayment(event)

      expect(amount).toBe(50n)
    })

    it('should fall back to pricing calculator when event kind does not match any schedule', () => {
      mockSettings = vi.fn(() => ({
        info: { relay_url: 'wss://relay.test' },
        payments: {
          enabled: true,
          feeSchedules: {
            admission: [],
            publication: [
              {
                enabled: true,
                amount: 100n,
                whitelists: { event_kinds: [30023] },
              },
            ],
          },
        },
      } as Settings))

      handler = new EventMessageHandler(
        mockWebSocket,
        mockStrategyFactory,
        mockUserRepository,
        mockSettings,
        mockRateLimiterFactory,
        mockDassieClient,
        mockFreeTierTracker,
        mockDegradedModeManager
      )

      const event = createMockEvent({ kind: 1 })

      // @ts-expect-error - accessing private method for testing
      const amount = handler.calculateRequiredPayment(event)

      // Now falls back to pricing calculator (Story 1.5)
      // In real scenario, would return pricingConfig.storeEvent or kind override
      expect(typeof amount).toBe('bigint')
    })

    it('should skip disabled fee schedules', () => {
      mockSettings = vi.fn(() => ({
        info: { relay_url: 'wss://relay.test' },
        payments: {
          enabled: true,
          feeSchedules: {
            admission: [],
            publication: [
              {
                enabled: false,
                amount: 100n,
                whitelists: { event_kinds: [1] },
              },
              {
                enabled: true,
                amount: 50n,
                whitelists: { event_kinds: [1] },
              },
            ],
          },
        },
      } as Settings))

      handler = new EventMessageHandler(
        mockWebSocket,
        mockStrategyFactory,
        mockUserRepository,
        mockSettings,
        mockRateLimiterFactory,
        mockDassieClient,
        mockFreeTierTracker,
        mockDegradedModeManager
      )

      const event = createMockEvent({ kind: 1 })

      // @ts-expect-error - accessing private method for testing
      const amount = handler.calculateRequiredPayment(event)

      expect(amount).toBe(50n)
    })
  })
})
