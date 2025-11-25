import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IFreeTierRepository } from '../../../../src/repositories/free-tier-repository'

describe('FreeTierTracker', () => {
  let mockRepository: IFreeTierRepository
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env }

    // Set test environment variables
    process.env.PRICING_FREE_TIER_EVENTS = '100'

    // Create mock repository
    mockRepository = {
      getEventCount: vi.fn(),
      incrementEventCount: vi.fn(),
      isWhitelisted: vi.fn(),
      addToWhitelist: vi.fn(),
      removeFromWhitelist: vi.fn(),
    }
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
    vi.resetModules()
  })

  describe('checkFreeTierEligibility', () => {
    it('should return eligible with correct remaining events for new user', async () => {
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.isWhitelisted).mockResolvedValue(false)
      vi.mocked(mockRepository.getEventCount).mockResolvedValue(0)

      const status = await tracker.checkFreeTierEligibility('test-pubkey')

      expect(status).toEqual({
        eligible: true,
        eventsUsed: 0,
        eventsRemaining: 100,
        whitelisted: false,
      })
    })

    it('should return eligible with reduced remaining events for user with some events', async () => {
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.isWhitelisted).mockResolvedValue(false)
      vi.mocked(mockRepository.getEventCount).mockResolvedValue(50)

      const status = await tracker.checkFreeTierEligibility('test-pubkey')

      expect(status).toEqual({
        eligible: true,
        eventsUsed: 50,
        eventsRemaining: 50,
        whitelisted: false,
      })
    })

    it('should return eligible with 1 remaining for user at threshold - 1', async () => {
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.isWhitelisted).mockResolvedValue(false)
      vi.mocked(mockRepository.getEventCount).mockResolvedValue(99)

      const status = await tracker.checkFreeTierEligibility('test-pubkey')

      expect(status).toEqual({
        eligible: true,
        eventsUsed: 99,
        eventsRemaining: 1,
        whitelisted: false,
      })
    })

    it('should return not eligible with 0 remaining for user at threshold', async () => {
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.isWhitelisted).mockResolvedValue(false)
      vi.mocked(mockRepository.getEventCount).mockResolvedValue(100)

      const status = await tracker.checkFreeTierEligibility('test-pubkey')

      expect(status).toEqual({
        eligible: false,
        eventsUsed: 100,
        eventsRemaining: 0,
        whitelisted: false,
      })
    })

    it('should return not eligible for user over threshold', async () => {
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.isWhitelisted).mockResolvedValue(false)
      vi.mocked(mockRepository.getEventCount).mockResolvedValue(150)

      const status = await tracker.checkFreeTierEligibility('test-pubkey')

      expect(status).toEqual({
        eligible: false,
        eventsUsed: 150,
        eventsRemaining: 0,
        whitelisted: false,
      })
    })

    it('should return eligible with unlimited events for whitelisted user', async () => {
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.isWhitelisted).mockResolvedValue(true)
      vi.mocked(mockRepository.getEventCount).mockResolvedValue(1000)

      const status = await tracker.checkFreeTierEligibility('test-pubkey')

      expect(status).toEqual({
        eligible: true,
        eventsUsed: 1000,
        eventsRemaining: -1,
        whitelisted: true,
      })
    })

    it('should return not eligible when free tier is disabled (threshold 0)', async () => {
      // Reconfigure with threshold 0
      process.env.PRICING_FREE_TIER_EVENTS = '0'
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.isWhitelisted).mockResolvedValue(false)
      vi.mocked(mockRepository.getEventCount).mockResolvedValue(0)

      const status = await tracker.checkFreeTierEligibility('test-pubkey')

      expect(status.eligible).toBe(false)
      expect(status.eventsRemaining).toBe(0)
    })

    it('should return not eligible on database error (fail-safe)', async () => {
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.isWhitelisted).mockRejectedValue(new Error('Database error'))

      const status = await tracker.checkFreeTierEligibility('test-pubkey')

      expect(status).toEqual({
        eligible: false,
        eventsUsed: 0,
        eventsRemaining: 0,
        whitelisted: false,
      })
    })

    it('should check whitelist before checking event count', async () => {
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.isWhitelisted).mockResolvedValue(true)
      vi.mocked(mockRepository.getEventCount).mockResolvedValue(200)

      await tracker.checkFreeTierEligibility('test-pubkey')

      expect(mockRepository.isWhitelisted).toHaveBeenCalledWith('test-pubkey')
      expect(mockRepository.getEventCount).toHaveBeenCalledWith('test-pubkey')
    })
  })

  describe('incrementEventCount', () => {
    it('should call repository incrementEventCount', async () => {
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.incrementEventCount).mockResolvedValue()

      await tracker.incrementEventCount('test-pubkey')

      expect(mockRepository.incrementEventCount).toHaveBeenCalledWith('test-pubkey')
    })

    it('should not throw error on database failure (non-blocking)', async () => {
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.incrementEventCount).mockRejectedValue(new Error('Database error'))

      await expect(tracker.incrementEventCount('test-pubkey')).resolves.not.toThrow()
    })
  })

  describe('getRemainingFreeEvents', () => {
    it('should return remaining events for eligible user', async () => {
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.isWhitelisted).mockResolvedValue(false)
      vi.mocked(mockRepository.getEventCount).mockResolvedValue(70)

      const remaining = await tracker.getRemainingFreeEvents('test-pubkey')

      expect(remaining).toBe(30)
    })

    it('should return -1 for whitelisted user (unlimited)', async () => {
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.isWhitelisted).mockResolvedValue(true)
      vi.mocked(mockRepository.getEventCount).mockResolvedValue(500)

      const remaining = await tracker.getRemainingFreeEvents('test-pubkey')

      expect(remaining).toBe(-1)
    })

    it('should return 0 for user who exhausted free tier', async () => {
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.isWhitelisted).mockResolvedValue(false)
      vi.mocked(mockRepository.getEventCount).mockResolvedValue(120)

      const remaining = await tracker.getRemainingFreeEvents('test-pubkey')

      expect(remaining).toBe(0)
    })
  })

  describe('isWhitelisted', () => {
    it('should return true for whitelisted pubkey', async () => {
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.isWhitelisted).mockResolvedValue(true)

      const result = await tracker.isWhitelisted('test-pubkey')

      expect(result).toBe(true)
      expect(mockRepository.isWhitelisted).toHaveBeenCalledWith('test-pubkey')
    })

    it('should return false for non-whitelisted pubkey', async () => {
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.isWhitelisted).mockResolvedValue(false)

      const result = await tracker.isWhitelisted('test-pubkey')

      expect(result).toBe(false)
    })
  })

  describe('addToWhitelist', () => {
    it('should call repository addToWhitelist with pubkey and description', async () => {
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.addToWhitelist).mockResolvedValue()

      await tracker.addToWhitelist('test-pubkey', 'Test user')

      expect(mockRepository.addToWhitelist).toHaveBeenCalledWith('test-pubkey', 'Test user')
    })
  })

  describe('removeFromWhitelist', () => {
    it('should call repository removeFromWhitelist with pubkey', async () => {
      vi.resetModules()
      const { FreeTierTracker } = await import('../../../../src/services/payment/free-tier-tracker')
      const tracker = new FreeTierTracker(mockRepository)

      vi.mocked(mockRepository.removeFromWhitelist).mockResolvedValue()

      await tracker.removeFromWhitelist('test-pubkey')

      expect(mockRepository.removeFromWhitelist).toHaveBeenCalledWith('test-pubkey')
    })
  })
})
