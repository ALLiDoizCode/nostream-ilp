import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  calculateExpirationStatus,
  formatTimeRemaining,
  formatWeiToETH,
  formatSatsToBTC,
  formatUaktToAKT,
  formatDropsToXRP,
  formatCurrency,
  calculateBalancePercentage,
  PaymentChannelBridge,
  type ChannelExpirationStatus,
} from '../../../src/peer-ui/services/payment-channel-bridge.js'

/**
 * Unit tests for Payment Channel Bridge Service
 * Reference: docs/stories/9.4.story.md#Task 1
 */

// Mock PaymentChannelManager
vi.mock('../../../src/btp-nips/peer-discovery/payment-channel-manager.js', () => ({
  getPaymentChannelManager: vi.fn(() => ({
    getChannelState: vi.fn().mockResolvedValue(null),
    queryAllChannels: vi.fn().mockResolvedValue([]),
  })),
}))

describe('PaymentChannelBridge - Status Calculation', () => {
  describe('calculateExpirationStatus', () => {
    it('should return "healthy" for >7 days remaining', () => {
      const eightDaysMs = 8 * 24 * 3600000
      expect(calculateExpirationStatus(eightDaysMs)).toBe('healthy')
    })

    it('should return "expiring_soon" for 1-7 days remaining', () => {
      const threeDaysMs = 3 * 24 * 3600000
      expect(calculateExpirationStatus(threeDaysMs)).toBe('expiring_soon')

      const oneDayMs = 24 * 3600000
      expect(calculateExpirationStatus(oneDayMs)).toBe('expiring_soon')
    })

    it('should return "expiring_critical" for <1 day remaining', () => {
      const twelveHoursMs = 12 * 3600000
      expect(calculateExpirationStatus(twelveHoursMs)).toBe('expiring_critical')

      const oneHourMs = 3600000
      expect(calculateExpirationStatus(oneHourMs)).toBe('expiring_critical')
    })

    it('should return "expired" for 0 or negative time', () => {
      expect(calculateExpirationStatus(0)).toBe('expired')
      expect(calculateExpirationStatus(-1000)).toBe('expired')
    })

    it('should handle edge cases at boundaries', () => {
      const sevenDaysExactMs = 7 * 24 * 3600000
      expect(calculateExpirationStatus(sevenDaysExactMs)).toBe('expiring_soon')

      const oneDayExactMs = 24 * 3600000
      expect(calculateExpirationStatus(oneDayExactMs)).toBe('expiring_soon')

      const oneDayMinusOneMs = 24 * 3600000 - 1
      expect(calculateExpirationStatus(oneDayMinusOneMs)).toBe('expiring_critical')
    })
  })
})

describe('PaymentChannelBridge - Time Formatting', () => {
  describe('formatTimeRemaining', () => {
    it('should format days correctly', () => {
      const threeDaysMs = 3 * 24 * 3600000
      expect(formatTimeRemaining(threeDaysMs)).toBe('3 days')

      const oneDayMs = 24 * 3600000
      expect(formatTimeRemaining(oneDayMs)).toBe('1 day')
    })

    it('should format days and hours correctly', () => {
      const twoDaysFiveHoursMs = 2 * 24 * 3600000 + 5 * 3600000
      expect(formatTimeRemaining(twoDaysFiveHoursMs)).toBe('2 days 5 hours')

      const oneDayOneHourMs = 24 * 3600000 + 3600000
      expect(formatTimeRemaining(oneDayOneHourMs)).toBe('1 day 1 hour')
    })

    it('should format hours correctly', () => {
      const fiveHoursMs = 5 * 3600000
      expect(formatTimeRemaining(fiveHoursMs)).toBe('5 hours')

      const oneHourMs = 3600000
      expect(formatTimeRemaining(oneHourMs)).toBe('1 hour')
    })

    it('should format hours and minutes correctly', () => {
      const twoHoursTenMinutesMs = 2 * 3600000 + 10 * 60000
      expect(formatTimeRemaining(twoHoursTenMinutesMs)).toBe('2 hours 10 minutes')

      const oneHourOneMinuteMs = 3600000 + 60000
      expect(formatTimeRemaining(oneHourOneMinuteMs)).toBe('1 hour 1 minute')
    })

    it('should format minutes correctly', () => {
      const tenMinutesMs = 10 * 60000
      expect(formatTimeRemaining(tenMinutesMs)).toBe('10 minutes')

      const oneMinuteMs = 60000
      expect(formatTimeRemaining(oneMinuteMs)).toBe('1 minute')
    })

    it('should format minutes and seconds correctly', () => {
      const fiveMinutesThirtySecondsMs = 5 * 60000 + 30000
      expect(formatTimeRemaining(fiveMinutesThirtySecondsMs)).toBe('5 minutes 30 seconds')

      const oneMinuteOneSecondMs = 60000 + 1000
      expect(formatTimeRemaining(oneMinuteOneSecondMs)).toBe('1 minute 1 second')
    })

    it('should format seconds correctly', () => {
      const thirtySecondsMs = 30000
      expect(formatTimeRemaining(thirtySecondsMs)).toBe('30 seconds')

      const oneSecondMs = 1000
      expect(formatTimeRemaining(oneSecondMs)).toBe('1 second')
    })

    it('should return "expired" for 0 or negative time', () => {
      expect(formatTimeRemaining(0)).toBe('expired')
      expect(formatTimeRemaining(-1000)).toBe('expired')
    })
  })
})

describe('PaymentChannelBridge - Currency Formatting', () => {
  describe('formatWeiToETH', () => {
    it('should convert wei to ETH correctly', () => {
      const oneEth = 1000000000000000000n // 1 ETH = 10^18 wei
      expect(formatWeiToETH(oneEth)).toBe('1.0000 ETH')

      const halfEth = 500000000000000000n // 0.5 ETH
      expect(formatWeiToETH(halfEth)).toBe('0.5000 ETH')

      const zeroEth = 0n
      expect(formatWeiToETH(zeroEth)).toBe('0.0000 ETH')
    })

    it('should handle custom decimal places', () => {
      const oneEth = 1000000000000000000n
      expect(formatWeiToETH(oneEth, 2)).toBe('1.00 ETH')
      expect(formatWeiToETH(oneEth, 6)).toBe('1.000000 ETH')
    })

    it('should handle small amounts', () => {
      const oneWei = 1n
      expect(formatWeiToETH(oneWei, 18)).toBe('0.000000000000000001 ETH')
    })
  })

  describe('formatSatsToBTC', () => {
    it('should convert satoshis to BTC correctly', () => {
      const oneBtc = 100000000n // 1 BTC = 10^8 sats
      expect(formatSatsToBTC(oneBtc)).toBe('1.00000000 BTC')

      const halfBtc = 50000000n // 0.5 BTC
      expect(formatSatsToBTC(halfBtc)).toBe('0.50000000 BTC')

      const zeroBtc = 0n
      expect(formatSatsToBTC(zeroBtc)).toBe('0.00000000 BTC')
    })

    it('should handle custom decimal places', () => {
      const oneBtc = 100000000n
      expect(formatSatsToBTC(oneBtc, 4)).toBe('1.0000 BTC')
      expect(formatSatsToBTC(oneBtc, 2)).toBe('1.00 BTC')
    })
  })

  describe('formatUaktToAKT', () => {
    it('should convert uakt to AKT correctly', () => {
      const oneAkt = 1000000n // 1 AKT = 10^6 uakt
      expect(formatUaktToAKT(oneAkt)).toBe('1.000000 AKT')

      const halfAkt = 500000n // 0.5 AKT
      expect(formatUaktToAKT(halfAkt)).toBe('0.500000 AKT')

      const zeroAkt = 0n
      expect(formatUaktToAKT(zeroAkt)).toBe('0.000000 AKT')
    })

    it('should handle custom decimal places', () => {
      const oneAkt = 1000000n
      expect(formatUaktToAKT(oneAkt, 2)).toBe('1.00 AKT')
      expect(formatUaktToAKT(oneAkt, 4)).toBe('1.0000 AKT')
    })
  })

  describe('formatDropsToXRP', () => {
    it('should convert drops to XRP correctly', () => {
      const oneXrp = 1000000n // 1 XRP = 10^6 drops
      expect(formatDropsToXRP(oneXrp)).toBe('1.000000 XRP')

      const hundredXrp = 100000000n // 100 XRP
      expect(formatDropsToXRP(hundredXrp)).toBe('100.000000 XRP')

      const zeroXrp = 0n
      expect(formatDropsToXRP(zeroXrp)).toBe('0.000000 XRP')
    })

    it('should handle custom decimal places', () => {
      const oneXrp = 1000000n
      expect(formatDropsToXRP(oneXrp, 2)).toBe('1.00 XRP')
      expect(formatDropsToXRP(oneXrp, 4)).toBe('1.0000 XRP')
    })
  })

  describe('formatCurrency', () => {
    it('should format BASE blockchain amounts as ETH', () => {
      const oneEth = 1000000000000000000n
      expect(formatCurrency(oneEth, 'BASE')).toBe('1.0000 ETH')
      expect(formatCurrency(oneEth, 'base')).toBe('1.0000 ETH') // case-insensitive
    })

    it('should format BTC blockchain amounts as BTC', () => {
      const oneBtc = 100000000n
      expect(formatCurrency(oneBtc, 'BTC')).toBe('1.00000000 BTC')
      expect(formatCurrency(oneBtc, 'btc')).toBe('1.00000000 BTC')
    })

    it('should format AKT blockchain amounts as AKT', () => {
      const oneAkt = 1000000n
      expect(formatCurrency(oneAkt, 'AKT')).toBe('1.000000 AKT')
      expect(formatCurrency(oneAkt, 'akt')).toBe('1.000000 AKT')
    })

    it('should format XRP blockchain amounts as XRP', () => {
      const oneXrp = 1000000n
      expect(formatCurrency(oneXrp, 'XRP')).toBe('1.000000 XRP')
      expect(formatCurrency(oneXrp, 'xrp')).toBe('1.000000 XRP')
    })

    it('should handle unknown blockchain types', () => {
      const amount = 12345n
      expect(formatCurrency(amount, 'UNKNOWN')).toBe('12345 units')
    })
  })
})

describe('PaymentChannelBridge - Balance Calculation', () => {
  describe('calculateBalancePercentage', () => {
    it('should calculate percentage correctly', () => {
      const capacity = 1000000n
      const balance = 850000n
      expect(calculateBalancePercentage(balance, capacity)).toBe(85)
    })

    it('should handle 100% balance', () => {
      const capacity = 1000000n
      const balance = 1000000n
      expect(calculateBalancePercentage(balance, capacity)).toBe(100)
    })

    it('should handle 0% balance', () => {
      const capacity = 1000000n
      const balance = 0n
      expect(calculateBalancePercentage(balance, capacity)).toBe(0)
    })

    it('should handle 0 capacity', () => {
      const capacity = 0n
      const balance = 100n
      expect(calculateBalancePercentage(balance, capacity)).toBe(0)
    })

    it('should clamp values to 0-100 range', () => {
      // This shouldn't happen in practice, but ensure robustness
      const capacity = 1000000n
      const overBalance = 1100000n
      const percentage = calculateBalancePercentage(overBalance, capacity)
      expect(percentage).toBeLessThanOrEqual(100)
      expect(percentage).toBeGreaterThanOrEqual(0)
    })

    it('should handle fractional percentages', () => {
      const capacity = 3n
      const balance = 1n
      const percentage = calculateBalancePercentage(balance, capacity)
      expect(percentage).toBeCloseTo(33.33, 1) // ~33.33%
    })
  })
})

describe('PaymentChannelBridge - Integration', () => {
  describe('PaymentChannelBridge class', () => {
    it('should instantiate without errors', () => {
      const bridge = new PaymentChannelBridge()
      expect(bridge).toBeDefined()
    })

    it('should return empty array when no channels exist', async () => {
      const bridge = new PaymentChannelBridge()
      const channels = await bridge.getAllChannels()
      expect(channels).toEqual([])
    })

    it('should return 0 for channel count when no channels exist', async () => {
      const bridge = new PaymentChannelBridge()
      const count = await bridge.getChannelCount()
      expect(count).toBe(0)
    })

    it('should return null when channel not found', async () => {
      const bridge = new PaymentChannelBridge()
      const channel = await bridge.getChannelState('non_existent_channel')
      expect(channel).toBeNull()
    })

    it('should filter channels by blockchain', async () => {
      const bridge = new PaymentChannelBridge()
      const baseChannels = await bridge.getChannelsByBlockchain('BASE')
      expect(Array.isArray(baseChannels)).toBe(true)
    })

    it('should filter channels by status', async () => {
      const bridge = new PaymentChannelBridge()
      const openChannels = await bridge.getChannelsByStatus('open')
      expect(Array.isArray(openChannels)).toBe(true)
    })

    it('should filter channels by recipient', async () => {
      const bridge = new PaymentChannelBridge()
      const recipientChannels = await bridge.getChannelsByRecipient('g.dassie.alice')
      expect(Array.isArray(recipientChannels)).toBe(true)
    })
  })
})
