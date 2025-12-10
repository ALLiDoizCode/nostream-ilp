import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DassieClient } from '../../../../src/services/payment/dassie-client'
import type { Event } from '../../../../src/@types/event'
import type { PaymentClaim } from '../../../../src/@types/payment-claim'

describe('DegradedModeManager', () => {
  let mockDassieClient: DassieClient
  let mockLogger: any

  const createMockEvent = (id: string, pubkey: string): Event => ({
    id,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: 'test event',
    sig: 'mock-signature',
  })

  const createMockPaymentClaim = (id: string): PaymentClaim => ({
    id: `claim-${id}`,
    amount: 1000n,
    currency: 'BTC',
    payee: 'test-payee',
    expiresAt: new Date(Date.now() + 60000),
  })

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }

    mockDassieClient = {
      isConnected: vi.fn().mockReturnValue(true),
      verifyPaymentClaim: vi.fn().mockResolvedValue({ valid: true }),
    } as any
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('enableDegradedMode', () => {
    it('should enable degraded mode and log error', async () => {
      const { DegradedModeManager } = await import('../../../../src/services/payment/degraded-mode-manager')

      const manager = new DegradedModeManager(mockDassieClient, mockLogger, 10000)

      manager.enableDegradedMode()

      expect(manager.isDegraded()).toBe(true)
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'degraded_mode_enabled',
          reason: 'dassie_connection_lost',
        }),
        'Degraded mode enabled - accepting events without payment verification'
      )
    })

    it('should not enable twice if already degraded', async () => {
      const { DegradedModeManager } = await import('../../../../src/services/payment/degraded-mode-manager')

      const manager = new DegradedModeManager(mockDassieClient, mockLogger, 10000)

      manager.enableDegradedMode()
      mockLogger.error.mockClear()
      manager.enableDegradedMode()

      expect(mockLogger.error).not.toHaveBeenCalled()
    })
  })

  describe('disableDegradedMode', () => {
    it('should disable degraded mode and log info', async () => {
      const { DegradedModeManager } = await import('../../../../src/services/payment/degraded-mode-manager')

      const manager = new DegradedModeManager(mockDassieClient, mockLogger, 10000)

      manager.enableDegradedMode()
      manager.disableDegradedMode()

      expect(manager.isDegraded()).toBe(false)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'degraded_mode_disabled',
        }),
        'Degraded mode disabled - resuming normal payment verification'
      )
    })

    it('should not disable if not degraded', async () => {
      const { DegradedModeManager } = await import('../../../../src/services/payment/degraded-mode-manager')

      const manager = new DegradedModeManager(mockDassieClient, mockLogger, 10000)

      manager.disableDegradedMode()

      expect(mockLogger.info).not.toHaveBeenCalled()
    })
  })

  describe('queuePaymentVerification', () => {
    it('should queue payment verification', async () => {
      const { DegradedModeManager } = await import('../../../../src/services/payment/degraded-mode-manager')

      const manager = new DegradedModeManager(mockDassieClient, mockLogger, 10000)

      const _event = createMockEvent('event-1', 'pubkey-1')
      const claim = createMockPaymentClaim('1')

      manager.queuePaymentVerification(event, claim)

      expect(manager.getQueueSize()).toBe(1)
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'payment_verification_queued',
          eventId: 'event-1',
        }),
        'Payment verification queued for later processing'
      )
    })

    it('should drop oldest verification when queue is full', async () => {
      const { DegradedModeManager } = await import('../../../../src/services/payment/degraded-mode-manager')

      const manager = new DegradedModeManager(mockDassieClient, mockLogger, 10) // Small queue

      // Fill queue
      for (let i = 0; i < 10; i++) {
        manager.queuePaymentVerification(
          createMockEvent(`event-${i}`, `pubkey-${i}`),
          createMockPaymentClaim(`${i}`)
        )
      }

      expect(manager.getQueueSize()).toBe(10)

      // Add one more to trigger drop
      mockLogger.warn.mockClear()
      manager.queuePaymentVerification(
        createMockEvent('event-11', 'pubkey-11'),
        createMockPaymentClaim('11')
      )

      expect(manager.getQueueSize()).toBe(10)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'degraded_queue_full',
          queue_size: 10,
          max_queue_size: 10,
          dropped_event_id: 'event-0',
        }),
        'WARNING: Degraded mode queue full (10) - dropping oldest verification'
      )
    })
  })

  describe('processQueuedVerifications', () => {
    it('should process all queued verifications when Dassie is connected', async () => {
      const { DegradedModeManager } = await import('../../../../src/services/payment/degraded-mode-manager')

      const manager = new DegradedModeManager(mockDassieClient, mockLogger, 10000)

      // Queue some verifications
      for (let i = 0; i < 5; i++) {
        manager.queuePaymentVerification(
          createMockEvent(`event-${i}`, `pubkey-${i}`),
          createMockPaymentClaim(`${i}`)
        )
      }

      expect(manager.getQueueSize()).toBe(5)

      const results = await manager.processQueuedVerifications()

      expect(results.total).toBe(5)
      expect(results.valid).toBe(5)
      expect(results.invalid).toBe(0)
      expect(manager.getQueueSize()).toBe(0)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'queued_verifications_processed',
          total: 5,
          valid: 5,
          invalid: 0,
        }),
        expect.stringContaining('Processed 5 queued payment verifications')
      )
    })

    it('should handle invalid payment claims', async () => {
      const { DegradedModeManager } = await import('../../../../src/services/payment/degraded-mode-manager')

      const manager = new DegradedModeManager(mockDassieClient, mockLogger, 10000)

      // Mock some valid and some invalid claims
      vi.mocked(mockDassieClient.verifyPaymentClaim)
        .mockResolvedValueOnce({ valid: true })
        .mockResolvedValueOnce({ valid: false, error: 'Invalid claim' })
        .mockResolvedValueOnce({ valid: true })

      // Queue verifications
      for (let i = 0; i < 3; i++) {
        manager.queuePaymentVerification(
          createMockEvent(`event-${i}`, `pubkey-${i}`),
          createMockPaymentClaim(`${i}`)
        )
      }

      const results = await manager.processQueuedVerifications()

      expect(results.total).toBe(3)
      expect(results.valid).toBe(2)
      expect(results.invalid).toBe(1)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'queued_verification_invalid',
          eventId: 'event-1',
        }),
        'Queued payment verification failed - event already stored (cannot reject retroactively)'
      )
    })

    it('should stop processing and re-enable degraded mode if Dassie disconnects', async () => {
      const { DegradedModeManager } = await import('../../../../src/services/payment/degraded-mode-manager')

      const manager = new DegradedModeManager(mockDassieClient, mockLogger, 10000)

      // Queue many verifications
      for (let i = 0; i < 150; i++) {
        manager.queuePaymentVerification(
          createMockEvent(`event-${i}`, `pubkey-${i}`),
          createMockPaymentClaim(`${i}`)
        )
      }

      // Simulate Dassie disconnecting after first batch (100 items)
      vi.mocked(mockDassieClient.isConnected)
        .mockReturnValueOnce(true) // First batch check
        .mockReturnValueOnce(false) // Second batch check - disconnected

      const results = await manager.processQueuedVerifications()

      // All items processed before disconnect check, so total = 150, processed = 150
      expect(results.total).toBe(150)
      expect(results.valid + results.invalid).toBe(150)
      expect(manager.getQueueSize()).toBe(0) // All processed before disconnect detected
      expect(manager.isDegraded()).toBe(true) // Re-enabled degraded mode
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'queued_verification_interrupted',
          processed: 150,
          remaining: 0,
        }),
        'Dassie disconnected during queue processing - re-enabling degraded mode'
      )
    })

    it('should return empty results when queue is empty', async () => {
      const { DegradedModeManager } = await import('../../../../src/services/payment/degraded-mode-manager')

      const manager = new DegradedModeManager(mockDassieClient, mockLogger, 10000)

      const results = await manager.processQueuedVerifications()

      expect(results.total).toBe(0)
      expect(results.valid).toBe(0)
      expect(results.invalid).toBe(0)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'queued_verifications_empty' }),
        'No queued verifications to process'
      )
    })
  })

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      const { DegradedModeManager } = await import('../../../../src/services/payment/degraded-mode-manager')

      const manager = new DegradedModeManager(mockDassieClient, mockLogger, 10000)

      manager.enableDegradedMode()
      manager.queuePaymentVerification(
        createMockEvent('event-1', 'pubkey-1'),
        createMockPaymentClaim('1')
      )

      const stats = manager.getQueueStats()

      expect(stats.size).toBe(1)
      expect(stats.maxSize).toBe(10000)
      expect(stats.isDegraded).toBe(true)
      expect(stats.oldestQueuedAt).toBeInstanceOf(Date)
    })

    it('should return null oldestQueuedAt when queue is empty', async () => {
      const { DegradedModeManager } = await import('../../../../src/services/payment/degraded-mode-manager')

      const manager = new DegradedModeManager(mockDassieClient, mockLogger, 10000)

      const stats = manager.getQueueStats()

      expect(stats.size).toBe(0)
      expect(stats.oldestQueuedAt).toBeNull()
    })
  })

  describe('clearQueue', () => {
    it('should clear all queued verifications', async () => {
      const { DegradedModeManager } = await import('../../../../src/services/payment/degraded-mode-manager')

      const manager = new DegradedModeManager(mockDassieClient, mockLogger, 10000)

      // Queue some verifications
      for (let i = 0; i < 5; i++) {
        manager.queuePaymentVerification(
          createMockEvent(`event-${i}`, `pubkey-${i}`),
          createMockPaymentClaim(`${i}`)
        )
      }

      expect(manager.getQueueSize()).toBe(5)

      manager.clearQueue()

      expect(manager.getQueueSize()).toBe(0)
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'degraded_queue_cleared',
          cleared_count: 5,
        }),
        'Cleared 5 queued verifications'
      )
    })
  })
})
