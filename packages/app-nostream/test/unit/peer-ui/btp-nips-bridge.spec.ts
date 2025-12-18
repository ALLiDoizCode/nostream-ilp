import { expect } from 'chai'
import {
  BTPNIPsBridge,
  calculateSubscriptionStatus,
  formatTimeRemaining,
  generateFilterSummary,
} from '../../../src/peer-ui/services/btp-nips-bridge'
import type {
  Subscription,
  SubscriptionManager,
} from '../../../src/btp-nips/subscription-manager'
import type { NostrFilter } from '../../../src/btp-nips/types/index'

describe('BTP-NIPs Bridge Service - Unit Tests', () => {
  describe('calculateSubscriptionStatus', () => {
    it('should return "healthy" for time remaining > 1 hour', () => {
      const twoHoursMs = 2 * 3600 * 1000
      expect(calculateSubscriptionStatus(twoHoursMs)).to.equal('healthy')
    })

    it('should return "expiring_soon" for time remaining < 1 hour but > 5 minutes', () => {
      const thirtyMinutesMs = 30 * 60 * 1000
      expect(calculateSubscriptionStatus(thirtyMinutesMs)).to.equal(
        'expiring_soon'
      )
    })

    it('should return "expiring_critical" for time remaining < 5 minutes but > 0', () => {
      const twoMinutesMs = 2 * 60 * 1000
      expect(calculateSubscriptionStatus(twoMinutesMs)).to.equal(
        'expiring_critical'
      )
    })

    it('should return "expired" for time remaining <= 0', () => {
      expect(calculateSubscriptionStatus(0)).to.equal('expired')
      expect(calculateSubscriptionStatus(-1000)).to.equal('expired')
    })

    it('should handle boundary at exactly 1 hour', () => {
      const oneHourMs = 3600 * 1000
      expect(calculateSubscriptionStatus(oneHourMs)).to.equal('healthy')
      expect(calculateSubscriptionStatus(oneHourMs - 1)).to.equal(
        'expiring_soon'
      )
    })

    it('should handle boundary at exactly 5 minutes', () => {
      const fiveMinutesMs = 5 * 60 * 1000
      expect(calculateSubscriptionStatus(fiveMinutesMs)).to.equal(
        'expiring_soon'
      )
      expect(calculateSubscriptionStatus(fiveMinutesMs - 1)).to.equal(
        'expiring_critical'
      )
    })
  })

  describe('formatTimeRemaining', () => {
    it('should format days and hours', () => {
      const twoDays = 2 * 24 * 3600 * 1000 + 3 * 3600 * 1000
      expect(formatTimeRemaining(twoDays)).to.equal('2 days 3 hours')
    })

    it('should format days only', () => {
      const threeDays = 3 * 24 * 3600 * 1000
      expect(formatTimeRemaining(threeDays)).to.equal('3 days')
    })

    it('should format hours and minutes', () => {
      const oneHourThirtyMinutes = 3600 * 1000 + 30 * 60 * 1000
      expect(formatTimeRemaining(oneHourThirtyMinutes)).to.equal(
        '1 hour 30 minutes'
      )
    })

    it('should format hours only', () => {
      const twoHours = 2 * 3600 * 1000
      expect(formatTimeRemaining(twoHours)).to.equal('2 hours')
    })

    it('should format minutes and seconds', () => {
      const twoMinutes = 2 * 60 * 1000 + 5 * 1000
      expect(formatTimeRemaining(twoMinutes)).to.equal('2 minutes 5 seconds')
    })

    it('should format minutes only', () => {
      const fiveMinutes = 5 * 60 * 1000
      expect(formatTimeRemaining(fiveMinutes)).to.equal('5 minutes')
    })

    it('should format seconds only', () => {
      const fortyFiveSeconds = 45 * 1000
      expect(formatTimeRemaining(fortyFiveSeconds)).to.equal('45 seconds')
    })

    it('should return "expired" for time <= 0', () => {
      expect(formatTimeRemaining(0)).to.equal('expired')
      expect(formatTimeRemaining(-1000)).to.equal('expired')
    })

    it('should handle singular forms correctly', () => {
      const oneDay = 24 * 3600 * 1000
      expect(formatTimeRemaining(oneDay)).to.equal('1 day')

      const oneHour = 3600 * 1000
      expect(formatTimeRemaining(oneHour)).to.equal('1 hour')

      const oneMinute = 60 * 1000
      expect(formatTimeRemaining(oneMinute)).to.equal('1 minute')

      const oneSecond = 1000
      expect(formatTimeRemaining(oneSecond)).to.equal('1 second')
    })
  })

  describe('generateFilterSummary', () => {
    it('should handle empty filters array', () => {
      expect(generateFilterSummary([])).to.equal('No filters (all events)')
    })

    it('should handle filter with authors only', () => {
      const filters: NostrFilter[] = [
        { authors: ['abc123', 'def456'] },
      ]
      expect(generateFilterSummary(filters)).to.equal('2 authors')
    })

    it('should handle filter with kinds only', () => {
      const filters: NostrFilter[] = [{ kinds: [1, 30023] }]
      expect(generateFilterSummary(filters)).to.equal('kinds: [1, 30023]')
    })

    it('should handle filter with authors and kinds', () => {
      const filters: NostrFilter[] = [
        { authors: ['abc123'], kinds: [1, 7, 30023] },
      ]
      expect(generateFilterSummary(filters)).to.include('1 author')
      expect(generateFilterSummary(filters)).to.include('kinds: [1, 7, 30023]')
    })

    it('should aggregate across multiple filters', () => {
      const filters: NostrFilter[] = [
        { authors: ['abc123'], kinds: [1] },
        { authors: ['def456'], kinds: [30023] },
      ]
      const summary = generateFilterSummary(filters)
      expect(summary).to.include('2 authors')
      expect(summary).to.include('kinds: [1, 30023]')
    })

    it('should handle filters with since/until/limit', () => {
      const filters: NostrFilter[] = [
        { kinds: [1], since: 1234567890, until: 1234567900, limit: 100 },
      ]
      const summary = generateFilterSummary(filters)
      expect(summary).to.include('kinds: [1]')
      expect(summary).to.include('with since filter')
      expect(summary).to.include('with until filter')
      expect(summary).to.include('with limit')
    })

    it('should handle catch-all filter (no criteria)', () => {
      const filters: NostrFilter[] = [{}]
      expect(generateFilterSummary(filters)).to.equal('All events')
    })

    it('should truncate long kinds lists', () => {
      const filters: NostrFilter[] = [
        { kinds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
      ]
      const summary = generateFilterSummary(filters)
      expect(summary).to.include('kinds: [1, 2, 3, 4, 5, +5 more]')
    })

    it('should handle duplicate authors/kinds across filters', () => {
      const filters: NostrFilter[] = [
        { authors: ['abc123'], kinds: [1] },
        { authors: ['abc123'], kinds: [1] }, // Duplicate
      ]
      const summary = generateFilterSummary(filters)
      expect(summary).to.include('1 author') // Not "2 authors"
      expect(summary).to.include('kinds: [1]')
    })
  })

  describe('BTPNIPsBridge', () => {
    let mockSubscriptionManager: SubscriptionManager
    let bridge: BTPNIPsBridge

    beforeEach(() => {
      // Create mock SubscriptionManager
      const now = Date.now()

      const mockSubscriptions: Subscription[] = [
        {
          id: 'sub-healthy',
          subscriber: 'g.dassie.alice',
          streamConnection: {} as any,
          filters: [{ authors: ['abc123'], kinds: [1, 30023] }],
          expiresAt: now + 2 * 3600 * 1000, // 2 hours from now
          active: true,
        },
        {
          id: 'sub-expiring-soon',
          subscriber: 'g.dassie.bob',
          streamConnection: {} as any,
          filters: [{ kinds: [1] }],
          expiresAt: now + 30 * 60 * 1000, // 30 minutes from now
          active: true,
        },
        {
          id: 'sub-critical',
          subscriber: 'g.dassie.charlie',
          streamConnection: {} as any,
          filters: [{}],
          expiresAt: now + 2 * 60 * 1000, // 2 minutes from now
          active: true,
        },
      ]

      mockSubscriptionManager = {
        getActiveSubscriptions: () => mockSubscriptions,
        getSubscription: (id: string) =>
          mockSubscriptions.find((s) => s.id === id) || null,
        getSubscriptionCount: () => mockSubscriptions.length,
        getActiveSubscriptionCount: () =>
          mockSubscriptions.filter((s) => s.active).length,
      } as any

      bridge = new BTPNIPsBridge(mockSubscriptionManager)
    })

    describe('initialization', () => {
      it('should initialize with provided SubscriptionManager', () => {
        expect(bridge.isInitialized()).to.be.true
      })

      it('should allow setting SubscriptionManager after initialization', () => {
        const uninitializedBridge = new BTPNIPsBridge()
        expect(uninitializedBridge.isInitialized()).to.be.false

        uninitializedBridge.setSubscriptionManager(mockSubscriptionManager)
        expect(uninitializedBridge.isInitialized()).to.be.true
      })

      it('should throw error when accessing methods without initialization', () => {
        const uninitializedBridge = new BTPNIPsBridge()
        expect(() => uninitializedBridge.getActiveSubscriptions()).to.throw(
          'SubscriptionManager not initialized'
        )
      })
    })

    describe('getActiveSubscriptions', () => {
      it('should return formatted subscriptions with status', () => {
        const subs = bridge.getActiveSubscriptions()

        expect(subs).to.have.lengthOf(3)

        // Check first subscription (healthy)
        const healthySub = subs.find((s) => s.id === 'sub-healthy')
        expect(healthySub).to.exist
        expect(healthySub!.status).to.equal('healthy')
        expect(healthySub!.subscriber).to.equal('g.dassie.alice')
        expect(healthySub!.filterSummary).to.include('1 author')
        expect(healthySub!.filterSummary).to.include('kinds: [1, 30023]')
        expect(healthySub!.timeRemainingHuman).to.include('hour')

        // Check second subscription (expiring soon)
        const expiringSub = subs.find((s) => s.id === 'sub-expiring-soon')
        expect(expiringSub).to.exist
        expect(expiringSub!.status).to.equal('expiring_soon')
        expect(expiringSub!.timeRemainingHuman).to.include('minute')

        // Check third subscription (critical)
        const criticalSub = subs.find((s) => s.id === 'sub-critical')
        expect(criticalSub).to.exist
        expect(criticalSub!.status).to.equal('expiring_critical')
        expect(criticalSub!.filterSummary).to.equal('All events')
      })

      it('should include ISO timestamp', () => {
        const subs = bridge.getActiveSubscriptions()
        const sub = subs[0]

        expect(sub.expiresAtISO).to.be.a('string')
        expect(new Date(sub.expiresAtISO).getTime()).to.equal(sub.expiresAt)
      })
    })

    describe('getSubscription', () => {
      it('should return formatted subscription by ID', () => {
        const sub = bridge.getSubscription('sub-healthy')

        expect(sub).to.exist
        expect(sub!.id).to.equal('sub-healthy')
        expect(sub!.status).to.equal('healthy')
      })

      it('should return null for non-existent subscription', () => {
        const sub = bridge.getSubscription('non-existent')
        expect(sub).to.be.null
      })
    })

    describe('getSubscriptionsBySubscriber', () => {
      it('should filter subscriptions by subscriber ILP address', () => {
        const subs = bridge.getSubscriptionsBySubscriber('g.dassie.alice')

        expect(subs).to.have.lengthOf(1)
        expect(subs[0].id).to.equal('sub-healthy')
        expect(subs[0].subscriber).to.equal('g.dassie.alice')
      })

      it('should return empty array for subscriber with no subscriptions', () => {
        const subs = bridge.getSubscriptionsBySubscriber('g.dassie.unknown')
        expect(subs).to.have.lengthOf(0)
      })
    })

    describe('getSubscriptionCount', () => {
      it('should return total subscription count', () => {
        expect(bridge.getSubscriptionCount()).to.equal(3)
      })
    })

    describe('getActiveSubscriptionCount', () => {
      it('should return active subscription count', () => {
        expect(bridge.getActiveSubscriptionCount()).to.equal(3)
      })
    })

    describe('error handling', () => {
      it('should handle SubscriptionManager errors gracefully', () => {
        const errorManager = {
          getActiveSubscriptions: () => {
            throw new Error('Database error')
          },
        } as any

        const errorBridge = new BTPNIPsBridge(errorManager)

        expect(() => errorBridge.getActiveSubscriptions()).to.throw(
          'Database error'
        )
      })
    })
  })
})
