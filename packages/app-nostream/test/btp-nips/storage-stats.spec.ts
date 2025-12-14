import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventCache } from '../../src/btp-nips/storage/event-cache'
import { StorageStats } from '../../src/btp-nips/storage/storage-stats'

/**
 * Storage Statistics Unit Tests
 *
 * Tests for BTP-NIPs storage statistics module.
 */

// Mock dependencies
const mockReadDb = vi.fn()

vi.mock('../../src/database/client', () => ({
  getMasterDbClient: vi.fn(() => mockReadDb),
  getReadReplicaDbClient: vi.fn(() => mockReadDb),
}))

vi.mock('../../src/factories/logger-factory', () => ({
  createLogger: vi.fn(() => vi.fn()),
}))

vi.mock('../../src/btp-nips/storage/event-cache', () => {
  const EventCache = vi.fn()
  const getEventCache = vi.fn()
  return { EventCache, getEventCache }
})

describe('StorageStats', () => {
  let mockCache: EventCache
  let stats: StorageStats
  let createMockQueryBuilder: any

  beforeEach(() => {
    // Mock Knex query builder
    createMockQueryBuilder = () => ({
      where: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      count: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      first: vi.fn(),
      then: vi.fn(),
      raw: vi.fn(),
    })

    // Reset and configure mockReadDb to return query builder
    mockReadDb.mockImplementation(() => createMockQueryBuilder())
    mockReadDb.raw = vi.fn((sql) => sql) // Mock the raw function on the database client

    // Mock EventCache
    mockCache = {
      getCacheHitRate: vi.fn(),
      waitForInitialization: vi.fn().mockResolvedValue(undefined),
    } as any

    stats = new StorageStats(mockCache)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getTotalEventCount', () => {
    it('should return total count of non-deleted events', async () => {
      const mockQueryBuilder = createMockQueryBuilder()
      mockQueryBuilder.first.mockResolvedValue({ count: '1500' })
      mockReadDb.mockReturnValue(mockQueryBuilder)

      const count = await stats.getTotalEventCount()

      expect(count).toBe(1500)
      expect(mockReadDb).toHaveBeenCalledWith('btp_nips_events')
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('is_deleted', false)
    })

    it('should return 0 if no events exist', async () => {
      const mockQueryBuilder = createMockQueryBuilder()
      mockQueryBuilder.first.mockResolvedValue(null)
      mockReadDb.mockReturnValue(mockQueryBuilder)

      const count = await stats.getTotalEventCount()

      expect(count).toBe(0)
    })

    it('should throw error if database query fails', async () => {
      const mockQueryBuilder = createMockQueryBuilder()
      mockQueryBuilder.first.mockRejectedValue(new Error('Database error'))
      mockReadDb.mockReturnValue(mockQueryBuilder)

      await expect(stats.getTotalEventCount()).rejects.toThrow('Database error')
    })
  })

  describe('getEventCountByKind', () => {
    it('should return event counts grouped by kind', async () => {
      const mockQueryBuilder = createMockQueryBuilder()
      mockQueryBuilder.groupBy.mockResolvedValue([
        { kind: 1, count: '5000' },
        { kind: 30023, count: '150' },
        { kind: 7, count: '12000' },
      ])
      mockReadDb.mockReturnValue(mockQueryBuilder)

      const countsByKind = await stats.getEventCountByKind()

      expect(countsByKind).toEqual({
        1: 5000,
        30023: 150,
        7: 12000,
      })
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('is_deleted', false)
      expect(mockQueryBuilder.groupBy).toHaveBeenCalledWith('kind')
    })

    it('should return empty object if no events exist', async () => {
      const mockQueryBuilder = createMockQueryBuilder()
      mockQueryBuilder.groupBy.mockResolvedValue([])
      mockReadDb.mockReturnValue(mockQueryBuilder)

      const countsByKind = await stats.getEventCountByKind()

      expect(countsByKind).toEqual({})
    })
  })

  describe('getStorageSizeEstimate', () => {
    it('should calculate total storage size in bytes', async () => {
      const mockQueryBuilder = createMockQueryBuilder()
      mockQueryBuilder.first.mockResolvedValue({ total_size: '52428800' })
      mockReadDb.mockReturnValue(mockQueryBuilder)

      const sizeBytes = await stats.getStorageSizeEstimate()

      expect(sizeBytes).toBe(52428800) // 50 MB
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('is_deleted', false)
    })

    it('should return 0 if no events exist', async () => {
      const mockQueryBuilder = createMockQueryBuilder()
      mockQueryBuilder.first.mockResolvedValue({ total_size: null })
      mockReadDb.mockReturnValue(mockQueryBuilder)

      const sizeBytes = await stats.getStorageSizeEstimate()

      expect(sizeBytes).toBe(0)
    })

    it('should handle null result', async () => {
      const mockQueryBuilder = createMockQueryBuilder()
      mockQueryBuilder.first.mockResolvedValue(null)
      mockReadDb.mockReturnValue(mockQueryBuilder)

      const sizeBytes = await stats.getStorageSizeEstimate()

      expect(sizeBytes).toBe(0)
    })
  })

  describe('getDeletedEventCount', () => {
    it('should return count of deleted events', async () => {
      const mockQueryBuilder = createMockQueryBuilder()
      mockQueryBuilder.first.mockResolvedValue({ count: '100' })
      mockReadDb.mockReturnValue(mockQueryBuilder)

      const count = await stats.getDeletedEventCount()

      expect(count).toBe(100)
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('is_deleted', true)
    })

    it('should return 0 if no deleted events exist', async () => {
      const mockQueryBuilder = createMockQueryBuilder()
      mockQueryBuilder.first.mockResolvedValue(null)
      mockReadDb.mockReturnValue(mockQueryBuilder)

      const count = await stats.getDeletedEventCount()

      expect(count).toBe(0)
    })
  })

  describe('getCacheHitRate', () => {
    it('should retrieve cache hit rate from EventCache', async () => {
      vi.mocked(mockCache.getCacheHitRate).mockReturnValue(0.87)

      const hitRate = await stats.getCacheHitRate()

      expect(hitRate).toBe(0.87)
      expect(mockCache.waitForInitialization).toHaveBeenCalled()
      expect(mockCache.getCacheHitRate).toHaveBeenCalled()
    })

    it('should return 0 if cache initialization fails', async () => {
      vi.mocked(mockCache.waitForInitialization).mockRejectedValue(
        new Error('Cache unavailable')
      )

      const hitRate = await stats.getCacheHitRate()

      expect(hitRate).toBe(0)
    })
  })

  describe('getQueryPerformanceMetrics', () => {
    it('should calculate percentiles from query durations', async () => {
      // Record some query durations
      const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
      durations.forEach((d) => stats.recordQueryDuration(d))

      const metrics = await stats.getQueryPerformanceMetrics()

      expect(metrics.p50).toBeCloseTo(55, 1)
      expect(metrics.p95).toBeCloseTo(95.5, 1)
      expect(metrics.p99).toBeCloseTo(99.1, 1)
    })

    it('should return zeros if no query durations recorded', async () => {
      const metrics = await stats.getQueryPerformanceMetrics()

      expect(metrics).toEqual({ p50: 0, p95: 0, p99: 0 })
    })

    it('should handle single value', async () => {
      stats.recordQueryDuration(42)

      const metrics = await stats.getQueryPerformanceMetrics()

      expect(metrics.p50).toBe(42)
      expect(metrics.p95).toBe(42)
      expect(metrics.p99).toBe(42)
    })
  })

  describe('Ring Buffer Behavior', () => {
    it('should maintain last 1000 query durations', async () => {
      // Record 1500 durations
      for (let i = 0; i < 1500; i++) {
        stats.recordQueryDuration(i)
      }

      // Buffer should only have 1000 entries
      expect(stats.getQueryStatsCount()).toBe(1000)

      // Oldest 500 should be overwritten
      const metrics = await stats.getQueryPerformanceMetrics()

      // p50 should be around 999 (midpoint of 500-1499)
      expect(metrics.p50).toBeGreaterThan(900)
    })

    it('should handle circular overwrite correctly', async () => {
      // Record exactly 1000 durations
      for (let i = 0; i < 1000; i++) {
        stats.recordQueryDuration(i)
      }

      expect(stats.getQueryStatsCount()).toBe(1000)

      // Record 100 more to test overwrite
      for (let i = 1000; i < 1100; i++) {
        stats.recordQueryDuration(i)
      }

      expect(stats.getQueryStatsCount()).toBe(1000)

      const metrics = await stats.getQueryPerformanceMetrics()

      // Values should be from 100-1099 (oldest 100 overwritten)
      expect(metrics.p50).toBeGreaterThan(500)
    })

    it('should clear buffer with resetQueryStats', async () => {
      stats.recordQueryDuration(10)
      stats.recordQueryDuration(20)
      stats.recordQueryDuration(30)

      expect(stats.getQueryStatsCount()).toBe(3)

      stats.resetQueryStats()

      expect(stats.getQueryStatsCount()).toBe(0)

      const metrics = await stats.getQueryPerformanceMetrics()
      expect(metrics).toEqual({ p50: 0, p95: 0, p99: 0 })
    })
  })

  describe('Percentile Calculation Accuracy', () => {
    it('should calculate p50 correctly (median)', async () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      values.forEach((v) => stats.recordQueryDuration(v))

      const metrics = await stats.getQueryPerformanceMetrics()

      // p50 of [1-10] is 5.5 (midpoint between 5 and 6)
      expect(metrics.p50).toBeCloseTo(5.5, 1)
    })

    it('should calculate p95 correctly', async () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1)
      values.forEach((v) => stats.recordQueryDuration(v))

      const metrics = await stats.getQueryPerformanceMetrics()

      // p95 of [1-100] is 95.05 (linear interpolation)
      expect(metrics.p95).toBeCloseTo(95.05, 1)
    })

    it('should calculate p99 correctly', async () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1)
      values.forEach((v) => stats.recordQueryDuration(v))

      const metrics = await stats.getQueryPerformanceMetrics()

      // p99 of [1-100] is 99.01
      expect(metrics.p99).toBeCloseTo(99.01, 1)
    })

    it('should handle non-uniform distributions', async () => {
      // Most values are low, with a few high outliers
      const values = [
        ...Array(90).fill(10),
        ...Array(9).fill(100),
        200, // p99 outlier
      ]
      values.forEach((v) => stats.recordQueryDuration(v))

      const metrics = await stats.getQueryPerformanceMetrics()

      expect(metrics.p50).toBeCloseTo(10, 1) // Median
      expect(metrics.p95).toBeCloseTo(100, 1) // 95th percentile
      // With 100 values, p99 is at index 99 (the last value), which is 200
      // But linear interpolation between indices 98 (100) and 99 (200)
      // p99 index = 0.99 * (100 - 1) = 98.01
      // Result = 100 * (1 - 0.01) + 200 * 0.01 = 99 + 2 = 101
      expect(metrics.p99).toBeCloseTo(101, 1) // 99th percentile (interpolated)
    })
  })
})
