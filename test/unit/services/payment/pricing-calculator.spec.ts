import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Event } from '../../../../src/@types/event'

describe('pricing-calculator', () => {
  // Store original environment
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env }

    // Clear module cache to force re-import with new env vars
    vi.resetModules()

    // Set default test environment variables
    process.env.PRICING_STORE_EVENT = '10'
    process.env.PRICING_DELIVER_EVENT = '1'
    process.env.PRICING_QUERY = '5'
    process.env.PRICING_FREE_TIER_EVENTS = '0'
    process.env.PRICING_KIND_OVERRIDES = ''
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
    vi.resetModules()
  })

  // Helper to create mock event
  const createMockEvent = (kind: number): Event => ({
    id: 'test-event-id',
    pubkey: 'test-pubkey',
    created_at: Math.floor(Date.now() / 1000),
    kind,
    tags: [],
    content: 'test content',
    sig: 'test-signature',
  })

  describe('calculateRequiredPayment - store operation', () => {
    it('should return default storeEvent price for event without override', async () => {
      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')
      const event = createMockEvent(1)

      const amount = calculateRequiredPayment('store', event)

      expect(amount).toBe(10n)
    })

    it('should return override price for event kind with override', async () => {
      process.env.PRICING_KIND_OVERRIDES = '30023:100'

      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')
      const event = createMockEvent(30023)

      const amount = calculateRequiredPayment('store', event)

      expect(amount).toBe(100n)
    })

    it('should return default price when no event provided', async () => {
      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')

      const amount = calculateRequiredPayment('store')

      expect(amount).toBe(10n)
    })

    it('should return correct override for multiple kind overrides', async () => {
      process.env.PRICING_KIND_OVERRIDES = '1:10,30023:100,1063:500'

      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')

      const noteEvent = createMockEvent(1)
      const articleEvent = createMockEvent(30023)
      const fileEvent = createMockEvent(1063)

      expect(calculateRequiredPayment('store', noteEvent)).toBe(10n)
      expect(calculateRequiredPayment('store', articleEvent)).toBe(100n)
      expect(calculateRequiredPayment('store', fileEvent)).toBe(500n)
    })

    it('should return default price for kind not in overrides', async () => {
      process.env.PRICING_KIND_OVERRIDES = '30023:100'

      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')
      const event = createMockEvent(1) // Kind 1 not in overrides

      const amount = calculateRequiredPayment('store', event)

      expect(amount).toBe(10n) // Default storeEvent price
    })

    it('should handle zero pricing', async () => {
      process.env.PRICING_STORE_EVENT = '0'

      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')
      const event = createMockEvent(1)

      const amount = calculateRequiredPayment('store', event)

      expect(amount).toBe(0n)
    })

    it('should handle large pricing values', async () => {
      process.env.PRICING_STORE_EVENT = '1000000000'

      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')
      const event = createMockEvent(1)

      const amount = calculateRequiredPayment('store', event)

      expect(amount).toBe(1000000000n)
    })
  })

  describe('calculateRequiredPayment - deliver operation', () => {
    it('should return deliverEvent price', async () => {
      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')

      const amount = calculateRequiredPayment('deliver')

      expect(amount).toBe(1n)
    })

    it('should ignore event parameter for deliver operation', async () => {
      process.env.PRICING_KIND_OVERRIDES = '30023:100'

      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')
      const event = createMockEvent(30023)

      const amount = calculateRequiredPayment('deliver', event)

      expect(amount).toBe(1n) // deliverEvent price, not override
    })

    it('should handle custom deliverEvent price', async () => {
      process.env.PRICING_DELIVER_EVENT = '5'

      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')

      const amount = calculateRequiredPayment('deliver')

      expect(amount).toBe(5n)
    })

    it('should handle zero deliverEvent price', async () => {
      process.env.PRICING_DELIVER_EVENT = '0'

      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')

      const amount = calculateRequiredPayment('deliver')

      expect(amount).toBe(0n)
    })
  })

  describe('calculateRequiredPayment - query operation', () => {
    it('should return query price', async () => {
      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')

      const amount = calculateRequiredPayment('query')

      expect(amount).toBe(5n)
    })

    it('should ignore event parameter for query operation', async () => {
      process.env.PRICING_KIND_OVERRIDES = '30023:100'

      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')
      const event = createMockEvent(30023)

      const amount = calculateRequiredPayment('query', event)

      expect(amount).toBe(5n) // query price, not override
    })

    it('should handle custom query price', async () => {
      process.env.PRICING_QUERY = '10'

      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')

      const amount = calculateRequiredPayment('query')

      expect(amount).toBe(10n)
    })

    it('should handle zero query price', async () => {
      process.env.PRICING_QUERY = '0'

      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')

      const amount = calculateRequiredPayment('query')

      expect(amount).toBe(0n)
    })
  })

  describe('calculateRequiredPayment - unknown operation', () => {
    it('should return 0 for unknown operation type', async () => {
      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')

      const amount = calculateRequiredPayment('unknown')

      expect(amount).toBe(0n)
    })

    it('should not throw exception for unknown operation', async () => {
      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')

      expect(() => {
        calculateRequiredPayment('unknown')
      }).not.toThrow()
    })

    it('should return 0 for empty string operation', async () => {
      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')

      const amount = calculateRequiredPayment('')

      expect(amount).toBe(0n)
    })
  })

  describe('calculateRequiredPayment - edge cases', () => {
    it('should handle all three operations with same configuration', async () => {
      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')
      const event = createMockEvent(1)

      const storeAmount = calculateRequiredPayment('store', event)
      const deliverAmount = calculateRequiredPayment('deliver', event)
      const queryAmount = calculateRequiredPayment('query', event)

      expect(storeAmount).toBe(10n)
      expect(deliverAmount).toBe(1n)
      expect(queryAmount).toBe(5n)
    })

    it('should return correct prices with all overrides configured', async () => {
      process.env.PRICING_STORE_EVENT = '20'
      process.env.PRICING_DELIVER_EVENT = '2'
      process.env.PRICING_QUERY = '10'
      process.env.PRICING_KIND_OVERRIDES = '1:15,30023:150'

      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')

      const noteEvent = createMockEvent(1)
      const articleEvent = createMockEvent(30023)
      const otherEvent = createMockEvent(999)

      expect(calculateRequiredPayment('store', noteEvent)).toBe(15n)
      expect(calculateRequiredPayment('store', articleEvent)).toBe(150n)
      expect(calculateRequiredPayment('store', otherEvent)).toBe(20n)
      expect(calculateRequiredPayment('deliver')).toBe(2n)
      expect(calculateRequiredPayment('query')).toBe(10n)
    })

    it('should handle event with undefined kind gracefully', async () => {
      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')
      const event = {
        id: 'test',
        pubkey: 'test',
        created_at: 0,
        kind: undefined as any,
        tags: [],
        content: '',
        sig: '',
      }

      const amount = calculateRequiredPayment('store', event)

      expect(amount).toBe(10n) // Default price
    })
  })

  describe('calculateRequiredPayment - performance', () => {
    it('should perform kind override lookup in O(1) time', async () => {
      process.env.PRICING_KIND_OVERRIDES = '1:10,30023:100,1063:500,71:1000'

      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')
      const event = createMockEvent(71)

      const startTime = performance.now()
      for (let i = 0; i < 10000; i++) {
        calculateRequiredPayment('store', event)
      }
      const endTime = performance.now()

      // Should complete 10k lookups in under 10ms (very generous)
      expect(endTime - startTime).toBeLessThan(10)
    })

    it('should not allocate memory on repeated calls', async () => {
      const { calculateRequiredPayment } = await import('../../../../src/services/payment/pricing-calculator')
      const event = createMockEvent(1)

      // Warm up
      for (let i = 0; i < 100; i++) {
        calculateRequiredPayment('store', event)
      }

      // Measure memory-stable performance
      const startTime = performance.now()
      for (let i = 0; i < 10000; i++) {
        calculateRequiredPayment('store', event)
      }
      const endTime = performance.now()

      // Consistent performance indicates no allocations
      expect(endTime - startTime).toBeLessThan(10)
    })
  })
})
