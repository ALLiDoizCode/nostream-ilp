import { CacheClient } from '../../@types/cache'

/**
 * Exchange rates for supported cryptocurrencies
 *
 * All rates are denominated in USD (e.g., ethToUsd = 3000 means 1 ETH = $3000 USD)
 */
export interface ExchangeRates {
  /** ETH/USD exchange rate */
  ethToUsd: number;
  /** USDC/USD exchange rate (typically ~1.00) */
  usdcToUsd: number;
  /** AKT/USD exchange rate */
  aktToUsd: number;
  /** Unix timestamp (milliseconds) when rates were last updated */
  lastUpdated: number;
}

/**
 * CoinGecko API response structure
 *
 * @see https://api.coingecko.com/api/v3/simple/price
 */
interface PriceApiResponse {
  ethereum?: { usd: number };
  'usd-coin'?: { usd: number };
  'akash-network'?: { usd: number };
}

/**
 * Supported currencies for conversion
 */
type Currency = 'ETH' | 'USDC' | 'AKT';

/**
 * Exchange rate service for cryptocurrency price tracking
 *
 * Fetches real-time exchange rates from CoinGecko API with Redis caching
 * to avoid rate limiting. Implements retry logic and graceful fallback to
 * cached rates on API failures.
 *
 * **Features:**
 * - CoinGecko API integration
 * - Redis caching with configurable TTL
 * - Automatic retry with exponential backoff
 * - Graceful degradation to cached rates
 * - Currency conversion helpers
 */
export class ExchangeRateService {
  private readonly CACHE_KEY = 'exchange_rates'
  private readonly COINGECKO_API_URL =
    'https://api.coingecko.com/api/v3/simple/price'
  private readonly MAX_RETRIES = 3
  private readonly RETRY_DELAY_MS = 1000 // Initial delay, doubles each retry

  /**
   * Creates a new ExchangeRateService
   *
   * @param redisClient - Redis client for caching rates
   * @param cacheTtlMs - Cache time-to-live in milliseconds (default: 5 minutes)
   */
  constructor(
    private redisClient: CacheClient,
    private cacheTtlMs: number = 300000 // 5 minutes
  ) {}

  /**
   * Gets current exchange rates with caching
   *
   * Checks Redis cache first. If cache miss or expired, fetches from CoinGecko
   * and updates cache. On API failure, falls back to cached rates.
   *
   * @returns Current exchange rates
   * @throws {Error} If API fails and no cached rates available
   */
  async getCurrentRates(): Promise<ExchangeRates> {
    // Check cache first
    const cached = await this.getCachedRates()
    if (cached && Date.now() - cached.lastUpdated < this.cacheTtlMs) {
      return cached
    }

    // Cache miss or expired, fetch from API
    try {
      const rates = await this.fetchRatesFromCoinGecko()
      await this.cacheRates(rates)
      return rates
    } catch (error) {
      // API failure, use cached rates if available
      if (cached) {
        console.warn(
          'CoinGecko API failed, using cached rates:',
          error instanceof Error ? error.message : String(error)
        )
        return cached
      }
      throw new Error(
        `Failed to fetch exchange rates and no cached rates available: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Fetches exchange rates from CoinGecko API with retry logic
   *
   * Implements exponential backoff: retries up to 3 times with delays of
   * 1s, 2s, 4s between attempts.
   *
   * @returns Fresh exchange rates from CoinGecko
   * @throws {Error} If all retries fail
   */
  async fetchRatesFromCoinGecko(): Promise<ExchangeRates> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(
          `${this.COINGECKO_API_URL}?ids=ethereum,usd-coin,akash-network&vs_currencies=usd`
        )

        if (!response.ok) {
          throw new Error(
            `CoinGecko API returned ${response.status}: ${response.statusText}`
          )
        }

        const data = (await response.json()) as PriceApiResponse

        // Validate response structure
        if (
          !data.ethereum?.usd ||
          !data['usd-coin']?.usd ||
          !data['akash-network']?.usd
        ) {
          throw new Error('Incomplete price data from CoinGecko API')
        }

        return {
          ethToUsd: data.ethereum.usd,
          usdcToUsd: data['usd-coin'].usd,
          aktToUsd: data['akash-network'].usd,
          lastUpdated: Date.now(),
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Exponential backoff: wait before retry
        if (attempt < this.MAX_RETRIES - 1) {
          const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt)
          console.warn(
            `CoinGecko API attempt ${attempt + 1} failed, retrying in ${delay}ms...`
          )
          await this.sleep(delay)
        }
      }
    }

    throw new Error(
      `CoinGecko API failed after ${this.MAX_RETRIES} attempts: ${lastError?.message}`
    )
  }

  /**
   * Converts cryptocurrency amount to USD
   *
   * Handles decimal conversions:
   * - ETH: 18 decimals (1 ETH = 10^18 wei)
   * - USDC: 6 decimals (1 USDC = 10^6 base units)
   * - AKT: 6 decimals (1 AKT = 10^6 uakt)
   *
   * @param amount - Amount in smallest unit (wei, base units, uakt)
   * @param currency - Currency type
   * @returns USD value (e.g., 125.50)
   * @throws {Error} If exchange rates unavailable
   *
   * @example
   * // Convert 5 ETH (5 * 10^18 wei) to USD at $3000/ETH
   * const usdValue = await service.convertToUsd(5000000000000000000n, 'ETH');
   * // Returns: 15000.00
   */
  async convertToUsd(amount: bigint, currency: Currency): Promise<number> {
    const rates = await this.getCurrentRates()

    // Determine decimals and rate based on currency
    let decimals: number
    let rate: number

    switch (currency) {
      case 'ETH':
        decimals = 18
        rate = rates.ethToUsd
        break
      case 'USDC':
        decimals = 6
        rate = rates.usdcToUsd
        break
      case 'AKT':
        decimals = 6
        rate = rates.aktToUsd
        break
    }

    // Convert: (amount / 10^decimals) * rate
    const amountInCurrency = Number(amount) / Math.pow(10, decimals)
    return amountInCurrency * rate
  }

  /**
   * Retrieves cached exchange rates from Redis
   *
   * @returns Cached rates or null if not found
   */
  private async getCachedRates(): Promise<ExchangeRates | null> {
    try {
      const cached = await this.redisClient.get(this.CACHE_KEY)
      if (!cached) {
        return null
      }
      return JSON.parse(cached) as ExchangeRates
    } catch (error) {
      console.error('Failed to read cached exchange rates:', error)
      return null
    }
  }

  /**
   * Stores exchange rates in Redis cache
   *
   * @param rates - Rates to cache
   */
  private async cacheRates(rates: ExchangeRates): Promise<void> {
    try {
      const ttlSeconds = Math.floor(this.cacheTtlMs / 1000)
      await this.redisClient.setEx(
        this.CACHE_KEY,
        ttlSeconds,
        JSON.stringify(rates)
      )
    } catch (error) {
      console.error('Failed to cache exchange rates:', error)
      // Non-fatal: continue without caching
    }
  }

  /**
   * Sleep helper for exponential backoff
   *
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
