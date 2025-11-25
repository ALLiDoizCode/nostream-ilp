import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('pricing-config', () => {
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

  describe('loadPricingConfig', () => {
    it('should load configuration with valid environment variables', async () => {
      process.env.PRICING_STORE_EVENT = '20'
      process.env.PRICING_DELIVER_EVENT = '2'
      process.env.PRICING_QUERY = '10'
      process.env.PRICING_FREE_TIER_EVENTS = '100'
      process.env.PRICING_KIND_OVERRIDES = '1:10,30023:100'

      const { loadPricingConfig } = await import('../../../../src/services/payment/pricing-config')
      const config = loadPricingConfig()

      expect(config.storeEvent).toBe(20n)
      expect(config.deliverEvent).toBe(2n)
      expect(config.query).toBe(10n)
      expect(config.freeTierEvents).toBe(100)
      expect(config.kindOverrides.size).toBe(2)
      expect(config.kindOverrides.get(1)).toBe(10n)
      expect(config.kindOverrides.get(30023)).toBe(100n)
    })

    it('should use default values when environment variables not set', async () => {
      delete process.env.PRICING_STORE_EVENT
      delete process.env.PRICING_DELIVER_EVENT
      delete process.env.PRICING_QUERY
      delete process.env.PRICING_FREE_TIER_EVENTS
      delete process.env.PRICING_KIND_OVERRIDES

      const { loadPricingConfig } = await import('../../../../src/services/payment/pricing-config')
      const config = loadPricingConfig()

      expect(config.storeEvent).toBe(10n)
      expect(config.deliverEvent).toBe(1n)
      expect(config.query).toBe(5n)
      expect(config.freeTierEvents).toBe(0)
      expect(config.kindOverrides.size).toBe(0)
    })

    it('should reject negative values and use defaults', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      process.env.PRICING_STORE_EVENT = '-10'
      process.env.PRICING_DELIVER_EVENT = '-1'

      const { loadPricingConfig } = await import('../../../../src/services/payment/pricing-config')
      const config = loadPricingConfig()

      expect(config.storeEvent).toBe(10n) // Default
      expect(config.deliverEvent).toBe(1n) // Default
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid pricing value: -10')
      )

      consoleSpy.mockRestore()
    })

    it('should handle non-numeric strings and use defaults', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      process.env.PRICING_STORE_EVENT = 'invalid'
      process.env.PRICING_QUERY = 'not-a-number'

      const { loadPricingConfig } = await import('../../../../src/services/payment/pricing-config')
      const config = loadPricingConfig()

      expect(config.storeEvent).toBe(10n) // Default
      expect(config.query).toBe(5n) // Default
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse pricing value')
      )

      consoleSpy.mockRestore()
    })

    it('should accept zero values', async () => {
      process.env.PRICING_STORE_EVENT = '0'
      process.env.PRICING_DELIVER_EVENT = '0'
      process.env.PRICING_QUERY = '0'

      const { loadPricingConfig } = await import('../../../../src/services/payment/pricing-config')
      const config = loadPricingConfig()

      expect(config.storeEvent).toBe(0n)
      expect(config.deliverEvent).toBe(0n)
      expect(config.query).toBe(0n)
    })

    it('should accept large values within bigint range', async () => {
      process.env.PRICING_STORE_EVENT = '1000000000000'

      const { loadPricingConfig } = await import('../../../../src/services/payment/pricing-config')
      const config = loadPricingConfig()

      expect(config.storeEvent).toBe(1000000000000n)
    })
  })

  describe('parseKindOverrides', () => {
    it('should parse valid kind overrides', async () => {
      process.env.PRICING_KIND_OVERRIDES = '1:10,30023:100,1063:500'

      const { loadPricingConfig } = await import('../../../../src/services/payment/pricing-config')
      const config = loadPricingConfig()

      expect(config.kindOverrides.size).toBe(3)
      expect(config.kindOverrides.get(1)).toBe(10n)
      expect(config.kindOverrides.get(30023)).toBe(100n)
      expect(config.kindOverrides.get(1063)).toBe(500n)
    })

    it('should handle empty string', async () => {
      process.env.PRICING_KIND_OVERRIDES = ''

      const { loadPricingConfig } = await import('../../../../src/services/payment/pricing-config')
      const config = loadPricingConfig()

      expect(config.kindOverrides.size).toBe(0)
    })

    it('should skip invalid format pairs', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      process.env.PRICING_KIND_OVERRIDES = 'invalid'

      const { loadPricingConfig } = await import('../../../../src/services/payment/pricing-config')
      const config = loadPricingConfig()

      expect(config.kindOverrides.size).toBe(0)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid kind override format')
      )

      consoleSpy.mockRestore()
    })

    it('should skip pairs with missing colon', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      process.env.PRICING_KIND_OVERRIDES = '1=10'

      const { loadPricingConfig } = await import('../../../../src/services/payment/pricing-config')
      const config = loadPricingConfig()

      expect(config.kindOverrides.size).toBe(0)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid kind override format')
      )

      consoleSpy.mockRestore()
    })

    it('should skip pairs with negative amount', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      process.env.PRICING_KIND_OVERRIDES = '1:-10'

      const { loadPricingConfig } = await import('../../../../src/services/payment/pricing-config')
      const config = loadPricingConfig()

      expect(config.kindOverrides.size).toBe(0)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid kind override')
      )

      consoleSpy.mockRestore()
    })

    it('should skip pairs with non-numeric kind', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      process.env.PRICING_KIND_OVERRIDES = 'invalid:10'

      const { loadPricingConfig } = await import('../../../../src/services/payment/pricing-config')
      const config = loadPricingConfig()

      expect(config.kindOverrides.size).toBe(0)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid kind override')
      )

      consoleSpy.mockRestore()
    })

    it('should parse mixed valid and invalid pairs', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      process.env.PRICING_KIND_OVERRIDES = '1:10,invalid,30023:100'

      const { loadPricingConfig } = await import('../../../../src/services/payment/pricing-config')
      const config = loadPricingConfig()

      expect(config.kindOverrides.size).toBe(2)
      expect(config.kindOverrides.get(1)).toBe(10n)
      expect(config.kindOverrides.get(30023)).toBe(100n)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid kind override format')
      )

      consoleSpy.mockRestore()
    })

    it('should handle whitespace in kind:amount pairs', async () => {
      process.env.PRICING_KIND_OVERRIDES = ' 1 : 10 , 30023 : 100 '

      const { loadPricingConfig } = await import('../../../../src/services/payment/pricing-config')
      const config = loadPricingConfig()

      expect(config.kindOverrides.size).toBe(2)
      expect(config.kindOverrides.get(1)).toBe(10n)
      expect(config.kindOverrides.get(30023)).toBe(100n)
    })

    it('should handle duplicate kinds (last one wins)', async () => {
      process.env.PRICING_KIND_OVERRIDES = '1:10,1:20'

      const { loadPricingConfig } = await import('../../../../src/services/payment/pricing-config')
      const config = loadPricingConfig()

      expect(config.kindOverrides.size).toBe(1)
      expect(config.kindOverrides.get(1)).toBe(20n) // Last value wins
    })
  })

  describe('pricingConfig singleton', () => {
    it('should export singleton instance', async () => {
      const { pricingConfig } = await import('../../../../src/services/payment/pricing-config')

      expect(pricingConfig).toBeDefined()
      expect(pricingConfig.storeEvent).toBeDefined()
      expect(pricingConfig.deliverEvent).toBeDefined()
      expect(pricingConfig.query).toBeDefined()
      expect(pricingConfig.freeTierEvents).toBeDefined()
      expect(pricingConfig.kindOverrides).toBeDefined()
    })

    it('should have Map instance for kindOverrides', async () => {
      const { pricingConfig } = await import('../../../../src/services/payment/pricing-config')

      expect(pricingConfig.kindOverrides).toBeInstanceOf(Map)
    })
  })
})
