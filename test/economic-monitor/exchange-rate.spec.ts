import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ExchangeRateService } from '../../src/services/economic-monitor/exchange-rate'

import type { CacheClient } from '../../src/@types/cache'

/**
 * Unit Tests for Exchange Rate Service
 *
 * Tests CoinGecko API integration, Redis caching, and USD conversion logic.
 *
 * @see src/services/economic-monitor/exchange-rate.ts
 * @see Story 7.1 - Task 7
 */


// Mock Redis client
const createMockRedisClient = (): CacheClient => {
  const store = new Map<string, { value: string; expiry: number }>()

  return {
    get: vi.fn(async (key: string) => {
      const item = store.get(key)
      if (!item) return null
      if (Date.now() > item.expiry) {
        store.delete(key)
        return null
      }
      return item.value
    }),
    setEx: vi.fn(async (key: string, seconds: number, value: string) => {
      store.set(key, {
        value,
        expiry: Date.now() + seconds * 1000,
      })
      return 'OK'
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key)
      return 1
    }),
    // Add other required methods as no-ops
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    quit: vi.fn(async () => {}),
  } as any
}

// Mock CoinGecko API response
const mockCoinGeckoResponse = {
  ethereum: { usd: 3000.0 },
  'usd-coin': { usd: 1.0 },
  'akash-network': { usd: 2.5 },
}

describe('ExchangeRateService', () => {
  let service: ExchangeRateService
  let mockRedis: CacheClient

  beforeEach(() => {
    mockRedis = createMockRedisClient()
    service = new ExchangeRateService(mockRedis, 300000) // 5 min cache TTL

    // Mock global fetch
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('fetchRatesFromCoinGecko', () => {
    it('should fetch and parse exchange rates from CoinGecko API', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCoinGeckoResponse,
      })

      const rates = await service.fetchRatesFromCoinGecko()

      expect(rates).toEqual({
        ethToUsd: 3000.0,
        usdcToUsd: 1.0,
        aktToUsd: 2.5,
        lastUpdated: expect.any(Number),
      })

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,usd-coin,akash-network&vs_currencies=usd'
      )
    })

    it('should retry on API failure with exponential backoff', async () => {
      // Fail first 2 attempts, succeed on 3rd
      (global.fetch as any)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockCoinGeckoResponse,
        })

      const rates = await service.fetchRatesFromCoinGecko()

      expect(rates.ethToUsd).toBe(3000.0)
      expect(global.fetch).toHaveBeenCalledTimes(3)
    })

    it('should throw error if all retries fail', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'))

      await expect(service.fetchRatesFromCoinGecko()).rejects.toThrow(
        'CoinGecko API failed after 3 attempts'
      )

      expect(global.fetch).toHaveBeenCalledTimes(3)
    })

    it('should throw error if API returns non-OK status', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
      })

      await expect(service.fetchRatesFromCoinGecko()).rejects.toThrow(
        'CoinGecko API returned 500'
      )
    })

    it('should throw error if response data is incomplete', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ethereum: { usd: 3000.0 },
          // Missing usd-coin and akash-network
        }),
      })

      await expect(service.fetchRatesFromCoinGecko()).rejects.toThrow(
        'Incomplete price data from CoinGecko API'
      )
    })
  })

  describe('getCurrentRates with caching', () => {
    it('should fetch from API and cache on first call', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCoinGeckoResponse,
      })

      const rates = await service.getCurrentRates()

      expect(rates.ethToUsd).toBe(3000.0)
      expect(mockRedis.setEx).toHaveBeenCalledWith(
        'exchange_rates',
        300, // 5 minutes in seconds
        expect.stringContaining('"ethToUsd":3000')
      )
    })

    it('should return cached rates on second call without API fetch', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCoinGeckoResponse,
      })

      // First call - fetches from API
      await service.getCurrentRates()

      // Second call - should use cache
      const ratesCached = await service.getCurrentRates()

      expect(ratesCached.ethToUsd).toBe(3000.0)
      expect(global.fetch).toHaveBeenCalledTimes(1) // Only called once
    })

    it('should re-fetch after cache TTL expires', async () => {
      const shortTtlService = new ExchangeRateService(mockRedis, 100); // 100ms TTL

      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockCoinGeckoResponse,
      })

      // First call
      await shortTtlService.getCurrentRates()

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150))

      // Second call should re-fetch
      await shortTtlService.getCurrentRates()

      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should fallback to cached rates if API fails', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockCoinGeckoResponse,
        })
        .mockRejectedValue(new Error('API down'))

      // First call - succeeds, caches
      await service.getCurrentRates()

      // Manually expire cache by waiting
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Recreate service but with same Redis (has cached data)
      const serviceWithCache = new ExchangeRateService(mockRedis, 1)

      // Second call - API fails, but cached data available
      const ratesFallback = await serviceWithCache.getCurrentRates()

      expect(ratesFallback.ethToUsd).toBe(3000.0)
      // Note: We can't easily verify console.warn was called without more mocking
    })

    it('should throw error if API fails and no cached rates', async () => {
      (global.fetch as any).mockRejectedValue(new Error('API down'))

      await expect(service.getCurrentRates()).rejects.toThrow(
        'Failed to fetch exchange rates and no cached rates available'
      )
    })
  })

  describe('convertToUsd', () => {
    beforeEach(async () => {
      // Setup service with known rates
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCoinGeckoResponse,
      })
      await service.getCurrentRates() // Populate cache
    })

    it('should convert ETH (18 decimals) to USD correctly', async () => {
      // 1 ETH = 10^18 wei, at $3000/ETH = $3000
      const oneEthInWei = BigInt(10 ** 18)
      const usdValue = await service.convertToUsd(oneEthInWei, 'ETH')

      expect(usdValue).toBe(3000.0)
    })

    it('should convert 5 ETH to USD correctly', async () => {
      // 5 ETH = 5 * 10^18 wei, at $3000/ETH = $15000
      const fiveEthInWei = BigInt(5) * BigInt(10 ** 18)
      const usdValue = await service.convertToUsd(fiveEthInWei, 'ETH')

      expect(usdValue).toBe(15000.0)
    })

    it('should convert USDC (6 decimals) to USD correctly', async () => {
      // 100 USDC = 100 * 10^6 base units, at $1/USDC = $100
      const oneHundredUsdc = BigInt(100 * 10 ** 6)
      const usdValue = await service.convertToUsd(oneHundredUsdc, 'USDC')

      expect(usdValue).toBe(100.0)
    })

    it('should convert 1000 USDC to USD correctly', async () => {
      // 1000 USDC = 1000 * 10^6 base units, at $1/USDC = $1000
      const thousandUsdc = BigInt(1000 * 10 ** 6)
      const usdValue = await service.convertToUsd(thousandUsdc, 'USDC')

      expect(usdValue).toBe(1000.0)
    })

    it('should convert AKT (6 decimals) to USD correctly', async () => {
      // 40 AKT = 40 * 10^6 uakt, at $2.50/AKT = $100
      const fortyAkt = BigInt(40 * 10 ** 6)
      const usdValue = await service.convertToUsd(fortyAkt, 'AKT')

      expect(usdValue).toBe(100.0)
    })

    it('should convert 50 AKT to USD correctly', async () => {
      // 50 AKT = 50 * 10^6 uakt, at $2.50/AKT = $125
      const fiftyAkt = BigInt(50 * 10 ** 6)
      const usdValue = await service.convertToUsd(fiftyAkt, 'AKT')

      expect(usdValue).toBe(125.0)
    })

    it('should handle fractional amounts correctly', async () => {
      // 0.5 ETH = 0.5 * 10^18 wei, at $3000/ETH = $1500
      const halfEthInWei = BigInt(5) * BigInt(10 ** 17)
      const usdValue = await service.convertToUsd(halfEthInWei, 'ETH')

      expect(usdValue).toBe(1500.0)
    })

    it('should handle zero amounts', async () => {
      const usdValue = await service.convertToUsd(BigInt(0), 'ETH')
      expect(usdValue).toBe(0.0)
    })
  })

  describe('edge cases', () => {
    it('should handle Redis connection failures gracefully', async () => {
      const faultyRedis = {
        ...mockRedis,
        get: vi.fn().mockRejectedValue(new Error('Redis down')),
        setEx: vi.fn().mockRejectedValue(new Error('Redis down')),
      } as any

      const serviceWithFaultyRedis = new ExchangeRateService(
        faultyRedis,
        300000
      );

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCoinGeckoResponse,
      })

      // Should still work, just no caching
      const rates = await serviceWithFaultyRedis.getCurrentRates()
      expect(rates.ethToUsd).toBe(3000.0)
    })

    it('should handle very large amounts without precision loss', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCoinGeckoResponse,
      })

      // 1 million ETH
      const millionEthInWei = BigInt(1000000) * BigInt(10 ** 18)
      const usdValue = await service.convertToUsd(millionEthInWei, 'ETH')

      expect(usdValue).toBe(3000000000.0) // $3 billion
    })
  })
})
