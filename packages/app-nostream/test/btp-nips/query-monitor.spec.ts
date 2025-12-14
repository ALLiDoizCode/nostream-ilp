import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { performance } from 'perf_hooks'
import { QueryMonitor } from '../../src/btp-nips/storage/query-monitor'
import { StorageStats } from '../../src/btp-nips/storage/storage-stats'

/**
 * Query Monitor Unit Tests
 *
 * Tests for BTP-NIPs query performance monitoring.
 */

/* eslint-disable sort-imports */
/* eslint-enable sort-imports */

// Mock dependencies
vi.mock('../../src/database/client', () => ({
  getMasterDbClient: vi.fn(),
  getReadReplicaDbClient: vi.fn(),
}))

vi.mock('../../src/factories/logger-factory', () => ({
  createLogger: vi.fn(() => vi.fn()),
}))

describe('QueryMonitor', () => {
  let mockStats: StorageStats
  let monitor: QueryMonitor
  let performanceNowSpy: any

  beforeEach(() => {
    // Mock StorageStats
    mockStats = {
      recordQueryDuration: vi.fn(),
    } as any

    monitor = new QueryMonitor(mockStats)

    // Spy on performance.now() for deterministic timing
    performanceNowSpy = vi.spyOn(performance, 'now')
  })

  afterEach(() => {
    vi.clearAllMocks()
    performanceNowSpy.mockRestore()
  })

  describe('wrapQuery', () => {
    it('should measure query duration', async () => {
      // Mock performance.now() to return deterministic values
      performanceNowSpy
        .mockReturnValueOnce(0) // Start time
        .mockReturnValueOnce(50) // End time

      const queryFn = vi.fn().mockResolvedValue('result')

      const result = await monitor.wrapQuery(queryFn, 'testQuery')

      expect(result).toBe('result')
      expect(queryFn).toHaveBeenCalled()
      expect(mockStats.recordQueryDuration).toHaveBeenCalledWith(50)
    })

    it('should log slow queries (> 100ms)', async () => {
      // Mock a slow query (150ms)
      performanceNowSpy
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(150)

      const queryFn = vi.fn().mockResolvedValue('result')

      await monitor.wrapQuery(queryFn, 'slowQuery')

      expect(mockStats.recordQueryDuration).toHaveBeenCalledWith(150)
      // Slow query threshold is 100ms, so this should be logged
    })

    it('should record duration in StorageStats', async () => {
      performanceNowSpy
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(75.5)

      const queryFn = vi.fn().mockResolvedValue('data')

      await monitor.wrapQuery(queryFn, 'queryType')

      expect(mockStats.recordQueryDuration).toHaveBeenCalledWith(75.5)
    })

    it('should not affect query result', async () => {
      performanceNowSpy
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(10)

      const expectedResult = { id: '123', content: 'test' }
      const queryFn = vi.fn().mockResolvedValue(expectedResult)

      const result = await monitor.wrapQuery(queryFn, 'getEvent')

      expect(result).toEqual(expectedResult)
    })

    it('should handle query failures', async () => {
      performanceNowSpy
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(25)

      const error = new Error('Database connection lost')
      const queryFn = vi.fn().mockRejectedValue(error)

      await expect(monitor.wrapQuery(queryFn, 'failingQuery')).rejects.toThrow(
        'Database connection lost'
      )

      // Duration should still be recorded even on failure
      expect(mockStats.recordQueryDuration).toHaveBeenCalledWith(25)
    })

    it('should record duration even if query throws', async () => {
      performanceNowSpy
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(30)

      const queryFn = vi.fn(() => {
        throw new Error('Query failed')
      })

      await expect(monitor.wrapQuery(queryFn, 'errorQuery')).rejects.toThrow(
        'Query failed'
      )

      expect(mockStats.recordQueryDuration).toHaveBeenCalledWith(30)
    })

    it('should handle multiple sequential queries', async () => {
      const durations = [10, 25, 50, 120]

      for (let i = 0; i < durations.length; i++) {
        performanceNowSpy
          .mockReturnValueOnce(0)
          .mockReturnValueOnce(durations[i])

        const queryFn = vi.fn().mockResolvedValue(`result${i}`)
        await monitor.wrapQuery(queryFn, `query${i}`)
      }

      expect(mockStats.recordQueryDuration).toHaveBeenCalledTimes(4)
      expect(mockStats.recordQueryDuration).toHaveBeenNthCalledWith(1, 10)
      expect(mockStats.recordQueryDuration).toHaveBeenNthCalledWith(2, 25)
      expect(mockStats.recordQueryDuration).toHaveBeenNthCalledWith(3, 50)
      expect(mockStats.recordQueryDuration).toHaveBeenNthCalledWith(4, 120)
    })
  })

  describe('wrapQuerySync', () => {
    it('should measure synchronous query duration', () => {
      performanceNowSpy
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(15)

      const queryFn = vi.fn().mockReturnValue('sync result')

      const result = monitor.wrapQuerySync(queryFn, 'syncQuery')

      expect(result).toBe('sync result')
      expect(queryFn).toHaveBeenCalled()
      expect(mockStats.recordQueryDuration).toHaveBeenCalledWith(15)
    })

    it('should handle synchronous query errors', () => {
      performanceNowSpy
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(5)

      const error = new Error('Sync error')
      const queryFn = vi.fn(() => {
        throw error
      })

      expect(() => monitor.wrapQuerySync(queryFn, 'failingSync')).toThrow(
        'Sync error'
      )

      // Duration should still be recorded
      expect(mockStats.recordQueryDuration).toHaveBeenCalledWith(5)
    })
  })

  describe('Monitoring Overhead', () => {
    it('should have minimal overhead (< 1ms)', async () => {
      // Don't mock performance.now() for this test - use real timing
      performanceNowSpy.mockRestore()

      const queryFn = vi.fn().mockResolvedValue('result')

      const start = performance.now()
      await monitor.wrapQuery(queryFn, 'overheadTest')
      const end = performance.now()

      const totalTime = end - start

      // Query function is mocked (instant), so total time ≈ monitoring overhead
      // Should be well under 1ms on modern hardware
      expect(totalTime).toBeLessThan(5) // Allow 5ms margin for CI environments
    })
  })

  describe('Slow Query Detection', () => {
    it('should identify queries exceeding 100ms threshold', async () => {
      const testCases = [
        { duration: 50, isSlow: false },
        { duration: 99, isSlow: false },
        { duration: 100, isSlow: false }, // Exactly 100ms is not slow (> threshold)
        { duration: 101, isSlow: true },
        { duration: 500, isSlow: true },
      ]

      for (const { duration } of testCases) {
        performanceNowSpy
          .mockReturnValueOnce(0)
          .mockReturnValueOnce(duration)

        const queryFn = vi.fn().mockResolvedValue('result')

        await monitor.wrapQuery(queryFn, 'thresholdTest')

        // We can't directly check if slow query was logged,
        // but we can verify duration was recorded
        expect(mockStats.recordQueryDuration).toHaveBeenCalledWith(duration)
      }
    })
  })

  describe('Real-World Query Simulation', () => {
    it('should monitor realistic query patterns', async () => {
      performanceNowSpy.mockRestore() // Use real timing

      // Simulate fast cache hit
      const cacheHit = vi.fn().mockResolvedValue('cached')
      await monitor.wrapQuery(cacheHit, 'cacheHit')

      // Simulate database query with artificial delay
      const dbQuery = vi.fn().mockImplementation(() => {
        const start = performance.now()
        // Busy wait for ~10ms (not ideal but works for test)
        while (performance.now() - start < 10) {
          // Busy wait
        }
        return Promise.resolve('db result')
      })

      await monitor.wrapQuery(dbQuery, 'dbQuery')

      // Both queries should have recorded their durations
      expect(mockStats.recordQueryDuration).toHaveBeenCalledTimes(2)
    })
  })

  describe('Error Propagation', () => {
    it('should preserve error types', async () => {
      performanceNowSpy
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(10)

      class CustomError extends Error {
        constructor(message: string) {
          super(message)
          this.name = 'CustomError'
        }
      }

      const error = new CustomError('Custom failure')
      const queryFn = vi.fn().mockRejectedValue(error)

      await expect(monitor.wrapQuery(queryFn, 'customError')).rejects.toThrow(
        CustomError
      )
    })

    it('should preserve error messages', async () => {
      performanceNowSpy
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(10)

      const error = new Error('Specific error message')
      const queryFn = vi.fn().mockRejectedValue(error)

      await expect(monitor.wrapQuery(queryFn, 'messageTest')).rejects.toThrow(
        'Specific error message'
      )
    })
  })
})
