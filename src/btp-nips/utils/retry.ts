import { createLogger } from '../../factories/logger-factory'

/**
 * Retry Utilities
 *
 * Provides exponential backoff retry logic for transient failures
 * (database connection timeouts, Redis failures, etc.).
 *
 * @module btp-nips/utils/retry
 */

const debug = createLogger('btp-nips:retry')

/**
 * Retry options configuration
 */
export interface RetryOptions {
  /**
   * Maximum number of retry attempts (default: 3)
   */
  maxAttempts?: number

  /**
   * Initial delay in milliseconds before first retry (default: 100ms)
   */
  initialDelayMs?: number

  /**
   * Multiplier for exponential backoff (default: 2)
   *
   * Delay calculation: initialDelay * (multiplier ^ attempt)
   * Example with multiplier=2: 100ms, 200ms, 400ms, 800ms...
   */
  multiplier?: number

  /**
   * Maximum delay in milliseconds (default: 5000ms)
   */
  maxDelayMs?: number

  /**
   * Whether to add random jitter to delays (default: true)
   *
   * Jitter prevents thundering herd problem when many requests
   * retry simultaneously. Randomly adjusts delay ±25%.
   */
  jitter?: boolean
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 100,
  multiplier: 2,
  maxDelayMs: 5000,
  jitter: true,
}

/**
 * Retry an async operation with exponential backoff.
 *
 * Retries transient failures (database timeouts, network errors) while
 * propagating permanent failures immediately (validation errors, not found, etc.).
 *
 * @param operation - Async function to retry
 * @param options - Retry configuration
 * @returns Result of the operation
 * @throws The last error if all retry attempts fail
 *
 * @example
 * ```typescript
 * const result = await retryWithBackoff(
 *   async () => {
 *     return await database.query('SELECT * FROM events');
 *   },
 *   { maxAttempts: 3, initialDelayMs: 100 }
 * );
 * ```
 *
 * @example
 * ```typescript
 * // With error filtering (only retry specific errors)
 * const result = await retryWithBackoff(
 *   async () => {
 *     return await eventRepository.saveEvent(event);
 *   },
 *   {
 *     maxAttempts: 3,
 *     shouldRetry: (error) => {
 *       // Only retry connection errors, not validation errors
 *       return error.message.includes('connection') ||
 *              error.message.includes('timeout');
 *     }
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options }
  let lastError: Error | undefined

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      // Attempt the operation
      const result = await operation()

      // Success - return result
      if (attempt > 0) {
        debug('Operation succeeded after %d retries', attempt)
      }
      return result
    } catch (error) {
      lastError = error as Error

      // Last attempt - don't retry
      if (attempt >= opts.maxAttempts - 1) {
        debug('Operation failed after %d attempts: %s', opts.maxAttempts, lastError.message)
        throw lastError
      }

      // Calculate delay for next retry
      const delay = calculateDelay(attempt, opts)

      debug(
        'Operation failed (attempt %d/%d), retrying in %dms: %s',
        attempt + 1,
        opts.maxAttempts,
        delay,
        lastError.message,
      )

      // Wait before retrying
      await sleep(delay)
    }
  }

  // Should never reach here, but TypeScript requires this
  throw lastError || new Error('Retry failed with unknown error')
}

/**
 * Calculate delay for a given retry attempt with exponential backoff.
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param options - Retry options
 * @returns Delay in milliseconds
 */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  // Base delay with exponential backoff
  let delay = options.initialDelayMs * Math.pow(options.multiplier, attempt)

  // Cap at maximum delay
  delay = Math.min(delay, options.maxDelayMs)

  // Add jitter (±25% random variation)
  if (options.jitter) {
    const jitterRange = delay * 0.25
    const jitter = (Math.random() - 0.5) * 2 * jitterRange
    delay = delay + jitter
  }

  return Math.floor(delay)
}

/**
 * Sleep for a specified number of milliseconds.
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after delay
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retry an operation with a simple fixed delay (no exponential backoff).
 *
 * Useful for operations that should retry quickly with constant intervals.
 *
 * @param operation - Async function to retry
 * @param maxAttempts - Maximum retry attempts (default: 3)
 * @param delayMs - Fixed delay between retries in milliseconds (default: 1000)
 * @returns Result of the operation
 * @throws The last error if all retry attempts fail
 *
 * @example
 * ```typescript
 * const result = await retryWithFixedDelay(
 *   async () => await redisClient.get(key),
 *   3,    // max attempts
 *   500   // 500ms delay
 * );
 * ```
 */
export async function retryWithFixedDelay<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  delayMs: number = 1000,
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error

      if (attempt >= maxAttempts - 1) {
        throw lastError
      }

      debug(
        'Operation failed (attempt %d/%d), retrying in %dms: %s',
        attempt + 1,
        maxAttempts,
        delayMs,
        lastError.message,
      )

      await sleep(delayMs)
    }
  }

  throw lastError || new Error('Retry failed with unknown error')
}
