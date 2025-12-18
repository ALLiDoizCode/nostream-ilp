import { describe, it, expect } from 'vitest'
import { calculateEventCost } from '../../../src/peer-ui/routes/cost-calculator'

describe('Cost Calculator', () => {
  describe('calculateEventCost', () => {
    it('should calculate cost for kind 1 (short note) with small content', () => {
      const result = calculateEventCost(1, 100) // 100 bytes

      expect(result.costMsats).toBe(10) // 100 * 0.1 = 10 msats
      expect(result.breakdown.relayFee).toBe(10)
      expect(result.breakdown.sizeFee).toBe(0) // Under 1MB
      expect(result.breakdown.arweaveCost).toBe(0) // Kind 1 doesn't require Arweave
    })

    it('should calculate cost for kind 30023 (long-form) with medium content', () => {
      const result = calculateEventCost(30023, 500000) // 500KB

      expect(result.breakdown.relayFee).toBe(200) // 100 * 2.0 = 200 msats
      expect(result.breakdown.sizeFee).toBe(0) // Under 1MB
      expect(result.breakdown.arweaveCost).toBeGreaterThan(0) // Should include Arweave cost
    })

    it('should calculate size fee for content over 1MB', () => {
      const size = 2 * 1024 * 1024 // 2MB
      const result = calculateEventCost(1, size)

      expect(result.breakdown.sizeFee).toBe(1000) // (2 - 1) * 1000 = 1000 msats
    })

    it('should calculate Arweave cost for kind 30023', () => {
      const size = 1024 * 1024 // 1MB
      const result = calculateEventCost(30023, size)

      expect(result.breakdown.arweaveCost).toBe(5000) // 1MB * 5000 msats/MB
    })

    it('should not charge Arweave for kind 1', () => {
      const size = 1024 * 1024 // 1MB
      const result = calculateEventCost(1, size)

      expect(result.breakdown.arweaveCost).toBe(0)
    })

    it('should handle zero-size content', () => {
      const result = calculateEventCost(1, 0)

      expect(result.costMsats).toBeGreaterThanOrEqual(0)
      expect(result.breakdown.sizeFee).toBe(0)
    })

    it('should apply correct multiplier for different kinds', () => {
      const size = 100

      const kind1 = calculateEventCost(1, size)
      const kind30023 = calculateEventCost(30023, size)
      const kind1063 = calculateEventCost(1063, size)
      const kind71 = calculateEventCost(71, size)

      // Relay fees should differ based on multipliers
      expect(kind1.breakdown.relayFee).toBe(10) // 100 * 0.1
      expect(kind30023.breakdown.relayFee).toBe(200) // 100 * 2.0
      expect(kind1063.breakdown.relayFee).toBe(300) // 100 * 3.0
      expect(kind71.breakdown.relayFee).toBe(500) // 100 * 5.0
    })

    it('should use default multiplier for unknown kinds', () => {
      const result = calculateEventCost(99999, 100)

      expect(result.breakdown.relayFee).toBe(100) // 100 * 1.0 (default)
    })
  })
})
