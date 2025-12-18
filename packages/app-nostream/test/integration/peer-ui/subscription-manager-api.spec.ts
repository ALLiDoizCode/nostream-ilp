import { expect } from 'chai'
import request from 'supertest'
import express from 'express'
import subscriptionRouter from '../../../src/peer-ui/routes/subscription-manager'
import { btpNipsBridge } from '../../../src/peer-ui/services/btp-nips-bridge'
import { SubscriptionManager } from '../../../src/btp-nips/subscription-manager'
import type { Subscription } from '../../../src/btp-nips/subscription-manager'

describe('Subscription Manager API - Integration Tests', () => {
  let app: express.Application
  let subscriptionManager: SubscriptionManager
  let authHeader: string

  beforeAll(() => {
    // Set environment variables for auth
    process.env.PEER_UI_USERNAME = 'testuser'
    process.env.PEER_UI_PASSWORD = 'testpass'

    // Create Basic Auth header
    const credentials = Buffer.from('testuser:testpass').toString('base64')
    authHeader = `Basic ${credentials}`

    // Create Express app with subscription routes
    app = express()
    app.use(express.json())
    app.use('/peer', subscriptionRouter)

    // Create mock subscription manager
    subscriptionManager = new SubscriptionManager()

    // Initialize bridge with mock manager
    btpNipsBridge.setSubscriptionManager(subscriptionManager)
  })

  beforeEach(() => {
    // Clear subscriptions before each test
    const allSubs = subscriptionManager.getAllSubscriptions()
    allSubs.forEach((sub) => {
      subscriptionManager.removeSubscription(sub.id)
    })
  })

  describe('GET /peer/api/subscriptions', () => {
    it('should return empty array when no subscriptions exist', async () => {
      const response = await request(app)
        .get('/peer/api/subscriptions')
        .set('Authorization', authHeader)
        .expect(200)

      expect(response.body).to.have.property('subscriptions')
      expect(response.body.subscriptions).to.be.an('array').that.is.empty
      expect(response.body.count).to.equal(0)
    })

    it('should return all active subscriptions', async () => {
      const now = Date.now()

      // Add mock subscriptions
      const sub1: Subscription = {
        id: 'sub-1',
        subscriber: 'g.dassie.alice',
        streamConnection: {} as any,
        filters: [{ kinds: [1] }],
        expiresAt: now + 3600000, // 1 hour
        active: true,
      }

      const sub2: Subscription = {
        id: 'sub-2',
        subscriber: 'g.dassie.bob',
        streamConnection: {} as any,
        filters: [{ authors: ['abc123'] }],
        expiresAt: now + 7200000, // 2 hours
        active: true,
      }

      subscriptionManager.addSubscription(sub1)
      subscriptionManager.addSubscription(sub2)

      const response = await request(app)
        .get('/peer/api/subscriptions')
        .set('Authorization', authHeader)
        .expect(200)

      expect(response.body.subscriptions).to.have.lengthOf(2)
      expect(response.body.count).to.equal(2)

      const ids = response.body.subscriptions.map((s: any) => s.id)
      expect(ids).to.include('sub-1')
      expect(ids).to.include('sub-2')
    })

    it('should filter subscriptions by subscriber ILP address', async () => {
      const now = Date.now()

      // Add subscriptions for different subscribers
      const sub1: Subscription = {
        id: 'sub-alice-1',
        subscriber: 'g.dassie.alice',
        streamConnection: {} as any,
        filters: [{ kinds: [1] }],
        expiresAt: now + 3600000,
        active: true,
      }

      const sub2: Subscription = {
        id: 'sub-bob-1',
        subscriber: 'g.dassie.bob',
        streamConnection: {} as any,
        filters: [{ kinds: [1] }],
        expiresAt: now + 3600000,
        active: true,
      }

      subscriptionManager.addSubscription(sub1)
      subscriptionManager.addSubscription(sub2)

      const response = await request(app)
        .get('/peer/api/subscriptions?subscriber=g.dassie.alice')
        .set('Authorization', authHeader)
        .expect(200)

      expect(response.body.subscriptions).to.have.lengthOf(1)
      expect(response.body.subscriptions[0].subscriber).to.equal('g.dassie.alice')
      expect(response.body.subscriptions[0].id).to.equal('sub-alice-1')
    })

    it('should return subscriptions with status and metadata', async () => {
      const now = Date.now()

      const sub: Subscription = {
        id: 'sub-test',
        subscriber: 'g.dassie.test',
        streamConnection: {} as any,
        filters: [{ kinds: [1, 30023], authors: ['abc123'] }],
        expiresAt: now + 3600000, // 1 hour
        active: true,
      }

      subscriptionManager.addSubscription(sub)

      const response = await request(app)
        .get('/peer/api/subscriptions')
        .set('Authorization', authHeader)
        .expect(200)

      const subscription = response.body.subscriptions[0]

      expect(subscription).to.have.property('id', 'sub-test')
      expect(subscription).to.have.property('subscriber', 'g.dassie.test')
      expect(subscription).to.have.property('status')
      expect(subscription).to.have.property('filterSummary')
      expect(subscription).to.have.property('expiresAt')
      expect(subscription).to.have.property('expiresAtISO')
      expect(subscription).to.have.property('timeRemainingMs')
      expect(subscription).to.have.property('timeRemainingHuman')

      expect(subscription.status).to.equal('healthy') // 1 hour > 1 hour threshold
      expect(subscription.filterSummary).to.include('1 author')
      expect(subscription.filterSummary).to.include('kinds: [1, 30023]')
      expect(subscription.timeRemainingHuman).to.include('hour')
    })
  })

  describe('GET /peer/api/subscriptions/:id', () => {
    it('should return 404 for non-existent subscription', async () => {
      const response = await request(app)
        .get('/peer/api/subscriptions/non-existent')
        .set('Authorization', authHeader)
        .expect(404)

      expect(response.body).to.have.property('error')
      expect(response.body.error).to.include('not found')
    })

    it('should return subscription details by ID', async () => {
      const now = Date.now()

      const sub: Subscription = {
        id: 'sub-specific',
        subscriber: 'g.dassie.charlie',
        streamConnection: {} as any,
        filters: [{ kinds: [1] }],
        expiresAt: now + 3600000,
        active: true,
      }

      subscriptionManager.addSubscription(sub)

      const response = await request(app)
        .get('/peer/api/subscriptions/sub-specific')
        .set('Authorization', authHeader)
        .expect(200)

      expect(response.body).to.have.property('subscription')
      expect(response.body.subscription.id).to.equal('sub-specific')
      expect(response.body.subscription.subscriber).to.equal('g.dassie.charlie')
    })
  })

  describe('POST /peer/api/subscriptions', () => {
    it('should validate missing subscriber', async () => {
      const response = await request(app)
        .post('/peer/api/subscriptions')
        .set('Authorization', authHeader)
        .send({
          filters: [{ kinds: [1] }],
          ttl: 3600,
        })
        .expect(400)

      expect(response.body.error).to.include('subscriber')
    })

    it('should validate invalid ILP address format', async () => {
      const response = await request(app)
        .post('/peer/api/subscriptions')
        .set('Authorization', authHeader)
        .send({
          subscriber: 'invalid-address', // Must start with "g."
          filters: [{ kinds: [1] }],
          ttl: 3600,
        })
        .expect(400)

      expect(response.body.error).to.include('ILP address')
    })

    it('should validate missing filters', async () => {
      const response = await request(app)
        .post('/peer/api/subscriptions')
        .set('Authorization', authHeader)
        .send({
          subscriber: 'g.dassie.alice',
          ttl: 3600,
        })
        .expect(400)

      expect(response.body.error).to.include('filters')
    })

    it('should validate invalid filters array', async () => {
      const response = await request(app)
        .post('/peer/api/subscriptions')
        .set('Authorization', authHeader)
        .send({
          subscriber: 'g.dassie.alice',
          filters: [], // Empty array
          ttl: 3600,
        })
        .expect(400)

      expect(response.body.error).to.include('filters')
    })

    it('should validate TTL (too low)', async () => {
      const response = await request(app)
        .post('/peer/api/subscriptions')
        .set('Authorization', authHeader)
        .send({
          subscriber: 'g.dassie.alice',
          filters: [{ kinds: [1] }],
          ttl: 30, // Below minimum (60 seconds)
        })
        .expect(400)

      expect(response.body.error).to.include('TTL')
      expect(response.body.details).to.include('minimum')
    })

    it('should validate TTL (too high)', async () => {
      const response = await request(app)
        .post('/peer/api/subscriptions')
        .set('Authorization', authHeader)
        .send({
          subscriber: 'g.dassie.alice',
          filters: [{ kinds: [1] }],
          ttl: 1000000, // Above maximum (86400 seconds = 1 day)
        })
        .expect(400)

      expect(response.body.error).to.include('TTL')
      expect(response.body.details).to.include('maximum')
    })

    it('should return 501 Not Implemented (pending StreamConnection integration)', async () => {
      const response = await request(app)
        .post('/peer/api/subscriptions')
        .set('Authorization', authHeader)
        .send({
          subscriber: 'g.dassie.alice',
          filters: [{ kinds: [1, 30023], authors: ['abc123'] }],
          ttl: 3600,
        })
        .expect(501)

      expect(response.body.error).to.equal('Not implemented')
      expect(response.body.details).to.include('StreamConnection')

      // Should still return cost estimate and subscription ID
      expect(response.body).to.have.property('cost')
      expect(response.body).to.have.property('subscriptionId')
      expect(response.body.cost).to.equal(5000) // 5000 msats for 1 hour
    })

    it('should calculate correct cost for different TTLs', async () => {
      // 1 hour = 5000 msats
      const response1 = await request(app)
        .post('/peer/api/subscriptions')
        .set('Authorization', authHeader)
        .send({
          subscriber: 'g.dassie.alice',
          filters: [{ kinds: [1] }],
          ttl: 3600,
        })
        .expect(501)

      expect(response1.body.cost).to.equal(5000)

      // 2 hours = 10000 msats
      const response2 = await request(app)
        .post('/peer/api/subscriptions')
        .set('Authorization', authHeader)
        .send({
          subscriber: 'g.dassie.alice',
          filters: [{ kinds: [1] }],
          ttl: 7200,
        })
        .expect(501)

      expect(response2.body.cost).to.equal(10000)

      // 30 minutes = 5000 msats (rounds up to 1 hour)
      const response3 = await request(app)
        .post('/peer/api/subscriptions')
        .set('Authorization', authHeader)
        .send({
          subscriber: 'g.dassie.alice',
          filters: [{ kinds: [1] }],
          ttl: 1800,
        })
        .expect(501)

      expect(response3.body.cost).to.equal(5000)
    })
  })

  describe('POST /peer/api/subscriptions/:id/renew', () => {
    it('should return 404 for non-existent subscription', async () => {
      const response = await request(app)
        .post('/peer/api/subscriptions/non-existent/renew')
        .set('Authorization', authHeader)
        .send({ ttl: 3600 })
        .expect(404)

      expect(response.body.error).to.include('not found')
    })

    it('should validate TTL', async () => {
      const now = Date.now()

      const sub: Subscription = {
        id: 'sub-renew',
        subscriber: 'g.dassie.alice',
        streamConnection: {} as any,
        filters: [{ kinds: [1] }],
        expiresAt: now + 3600000,
        active: true,
      }

      subscriptionManager.addSubscription(sub)

      const response = await request(app)
        .post('/peer/api/subscriptions/sub-renew/renew')
        .set('Authorization', authHeader)
        .send({ ttl: 30 }) // Too low
        .expect(400)

      expect(response.body.error).to.include('TTL')
    })

    it('should return 501 Not Implemented (pending StreamConnection integration)', async () => {
      const now = Date.now()

      const sub: Subscription = {
        id: 'sub-renew',
        subscriber: 'g.dassie.alice',
        streamConnection: {} as any,
        filters: [{ kinds: [1] }],
        expiresAt: now + 3600000,
        active: true,
      }

      subscriptionManager.addSubscription(sub)

      const response = await request(app)
        .post('/peer/api/subscriptions/sub-renew/renew')
        .set('Authorization', authHeader)
        .send({ ttl: 3600 })
        .expect(501)

      expect(response.body.error).to.equal('Not implemented')
      expect(response.body.details).to.include('StreamConnection')

      // Should still return cost and new expiration estimate
      expect(response.body).to.have.property('cost')
      expect(response.body).to.have.property('estimatedNewExpiresAt')
      expect(response.body.cost).to.equal(5000) // 5000 msats for 1 hour
    })
  })

  describe('DELETE /peer/api/subscriptions/:id', () => {
    it('should return 404 for non-existent subscription', async () => {
      const response = await request(app)
        .delete('/peer/api/subscriptions/non-existent')
        .set('Authorization', authHeader)
        .expect(404)

      expect(response.body.error).to.include('not found')
    })

    it('should return 501 Not Implemented (pending StreamConnection integration)', async () => {
      const now = Date.now()

      const sub: Subscription = {
        id: 'sub-delete',
        subscriber: 'g.dassie.alice',
        streamConnection: {} as any,
        filters: [{ kinds: [1] }],
        expiresAt: now + 3600000,
        active: true,
      }

      subscriptionManager.addSubscription(sub)

      const response = await request(app)
        .delete('/peer/api/subscriptions/sub-delete')
        .set('Authorization', authHeader)
        .expect(501)

      expect(response.body.error).to.equal('Not implemented')
      expect(response.body.details).to.include('StreamConnection')
    })
  })

  describe('Error handling', () => {
    it('should handle internal server errors gracefully', async () => {
      // Temporarily break the bridge to trigger error
      const originalManager = (btpNipsBridge as any).subscriptionManager
      ;(btpNipsBridge as any).subscriptionManager = null

      const response = await request(app)
        .get('/peer/api/subscriptions')
        .set('Authorization', authHeader)
        .expect(500)

      expect(response.body).to.have.property('error')
      expect(response.body.error).to.include('Internal server error')

      // Restore bridge
      ;(btpNipsBridge as any).subscriptionManager = originalManager
    })
  })
})
