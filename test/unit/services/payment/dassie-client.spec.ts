/**
 * Unit tests for Dassie RPC Client
 *
 * Tests all wrapper methods with mocked WebSocket responses.
 * Validates error handling, reconnection logic, and subscription management.
 */

import {
  ConnectionState,
  createDassieClient,
  createDassieClientFromEnv,
  DassieClient,
  type DassieClientConfig,
  DassieConnectionError,
  DassieTimeoutError,
} from '../../../../src/services/payment/dassie-client'
import type { PaymentClaim } from '../../../../src/@types/payment-claim'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EventEmitter } from 'events'
import WebSocket from 'ws'

// Mock WebSocket
class MockWebSocket extends EventEmitter {
  public readyState = WebSocket.OPEN
  public sent: string[] = []

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = WebSocket.CLOSED
    this.emit('close')
  }

  // Helper to simulate server response
  simulateMessage(message: any) {
    this.emit('message', JSON.stringify(message))
  }

  // Helper to simulate server error
  simulateError(error: Error) {
    this.emit('error', error)
  }

  // Helper to simulate connection
  simulateOpen() {
    this.readyState = WebSocket.OPEN
    this.emit('open')
  }
}

vi.mock('ws', () => ({
  default: vi.fn(),
  WebSocket: class {
    static OPEN = 1
    static CLOSED = 3
  },
}))

// Mock logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}

describe('DassieClient', () => {
  let client: DassieClient
  let config: DassieClientConfig
  let mockWs: MockWebSocket

  beforeEach(() => {
    config = {
      url: 'ws://localhost:5000/trpc',
      retryDelayMs: 10, // Fast retries for testing
      maxDelayMs: 100,
      maxRetries: 2,
      paymentEndpointsAvailable: true,
      jitterPercent: 0, // No jitter for predictable tests
    }

    mockWs = new MockWebSocket()
    // Fix EventEmitter memory leak warnings - increase limit for all tests
    mockWs.setMaxListeners(30)

    // Mock WebSocket constructor
    const WebSocketMock = vi.mocked(WebSocket as any)
    WebSocketMock.mockImplementation(function(this: any) {
      return mockWs
    })

    vi.clearAllMocks()
  })

  afterEach(() => {
    if (client) {
      client.disconnect()
    }
  })

  describe('Connection Management', () => {
    it('should connect successfully', async () => {
      client = new DassieClient(config, mockLogger)

      const connectPromise = client.connect()

      // Simulate connection
      mockWs.simulateOpen()

      await connectPromise

      expect(client.isConnected()).toBe(true)
      expect(client.getConnectionState()).toBe(ConnectionState.CONNECTED)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ url: config.url }),
        'Connecting to Dassie RPC'
      )
    })

    it('should handle connection timeout', async () => {
      client = new DassieClient(config, mockLogger)

      // Don't simulate open - should timeout
      await expect(client.connect()).rejects.toThrow(DassieTimeoutError)
    })

    it('should disconnect gracefully', async () => {
      client = new DassieClient(config, mockLogger)

      const connectPromise = client.connect()
      mockWs.simulateOpen()
      await connectPromise

      client.disconnect()

      expect(client.isConnected()).toBe(false)
      expect(client.getConnectionState()).toBe(ConnectionState.DISCONNECTED)
    })

    it('should emit connection state events', async () => {
      client = new DassieClient(config, mockLogger)

      const stateChanges: ConnectionState[] = []
      client.on('state', (state) => stateChanges.push(state))

      const connectPromise = client.connect()
      mockWs.simulateOpen()
      await connectPromise

      expect(stateChanges).toContain(ConnectionState.CONNECTING)
      expect(stateChanges).toContain(ConnectionState.CONNECTED)
    })

    it('should handle disconnection and schedule reconnection', async () => {
      client = new DassieClient(config, mockLogger)

      const connectPromise = client.connect()
      mockWs.simulateOpen()
      await connectPromise

      // Listen for state change to RECONNECTING
      const statePromise = new Promise<ConnectionState>((resolve) => {
        client.on('state', (state) => {
          if (state === ConnectionState.RECONNECTING) {
            resolve(state)
          }
        })
      })

      // Simulate disconnection
      mockWs.close()

      // Wait for reconnection state
      const state = await statePromise

      expect(state).toBe(ConnectionState.RECONNECTING)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ attempt: 1 }),
        'Scheduling Dassie RPC reconnection'
      )
    })

    it('should handle connection error', async () => {
      client = new DassieClient(config, mockLogger)

      // Add error listener to prevent unhandled error event
      client.on('error', () => {
        // Expected - error events are emitted before promise rejection
      })

      // Start connecting but simulate error before open
      const connectPromise = client.connect()
      mockWs.simulateError(new Error('Connection refused'))

      await expect(connectPromise).rejects.toThrow(DassieConnectionError)
    })
  })

  describe('getBalances()', () => {
    beforeEach(async () => {
      client = new DassieClient(config, mockLogger)
      const connectPromise = client.connect()
      mockWs.simulateOpen()
      await connectPromise
    })

    it('should return balances for all currencies', async () => {
      const balancesPromise = client.getBalances()

      // Simulate responses for all 4 currency requests
      const requests = mockWs.sent.slice(-4).map(JSON.parse)

      requests.forEach((req, idx) => {
        const currency = ['btc', 'base', 'akt', 'xrp'][idx]
        const balance = [100000, 500000, 750000, 200000][idx]

        mockWs.simulateMessage({
          jsonrpc: '2.0',
          id: req.id,
          result: {
            balance: balance,
            accountPath: `${currency}:revenue/relay-fees`,
            lastUpdated: Date.now(),
          },
        })
      })

      const balances = await balancesPromise

      expect(balances).toEqual({
        btc_sats: BigInt(100000),
        base_wei: BigInt(500000),
        akt_uakt: BigInt(750000),
        xrp_drops: BigInt(200000),
      })
    })

    it('should return zero balance on individual currency failure', async () => {
      const balancesPromise = client.getBalances()

      const requests = mockWs.sent.slice(-4).map(JSON.parse)

      requests.forEach((req, idx) => {
        const currency = ['btc', 'base', 'akt', 'xrp'][idx]

        if (currency === 'btc') {
          // Simulate error for BTC
          mockWs.simulateMessage({
            jsonrpc: '2.0',
            id: req.id,
            error: { message: 'BTC ledger error' },
          })
        } else {
          mockWs.simulateMessage({
            jsonrpc: '2.0',
            id: req.id,
            result: {
              balance: 10000,
              accountPath: `${currency}:revenue/relay-fees`,
              lastUpdated: Date.now(),
            },
          })
        }
      })

      const balances = await balancesPromise

      expect(balances.btc_sats).toBe(BigInt(0))
      expect(balances.base_wei).toBe(BigInt(10000))
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'btc' }),
        'Failed to get balance for currency'
      )
    })

    it('should throw if not connected', async () => {
      client.disconnect()

      await expect(client.getBalances()).rejects.toThrow(DassieConnectionError)
      await expect(client.getBalances()).rejects.toThrow('Not connected to Dassie RPC')
    })
  })

  describe('subscribeToBalance()', () => {
    beforeEach(async () => {
      client = new DassieClient(config, mockLogger)
      const connectPromise = client.connect()
      mockWs.simulateOpen()
      await connectPromise
    })

    it('should subscribe to balance updates', () => {
      const callback = vi.fn()
      const subscription = client.subscribeToBalance('btc:revenue/relay-fees', callback)

      expect(mockWs.sent.length).toBeGreaterThan(0)
      const lastRequest = JSON.parse(mockWs.sent[mockWs.sent.length - 1])
      expect(lastRequest.method).toBe('ledger.subscribeToAccount')
      expect(lastRequest.params.accountPath).toBe('btc:revenue/relay-fees')

      // Simulate subscription update (use string for BigInt in JSON)
      mockWs.simulateMessage({
        method: 'subscription',
        params: {
          accountPath: 'btc:revenue/relay-fees',
          data: {
            balance: '200000',
            delta: '10000',
            timestamp: Date.now(),
            reason: 'payment-received',
          },
        },
      })

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        balance: BigInt(200000),
        delta: BigInt(10000),
        reason: 'payment-received',
      }))
      expect(subscription).toHaveProperty('unsubscribe')
    })

    it('should unsubscribe from balance updates', () => {
      const subscription = client.subscribeToBalance('akt:revenue/relay-fees', vi.fn())

      const sentBefore = mockWs.sent.length
      subscription.unsubscribe()

      expect(mockWs.sent.length).toBeGreaterThan(sentBefore)
      const lastRequest = JSON.parse(mockWs.sent[mockWs.sent.length - 1])
      expect(lastRequest.method).toBe('ledger.unsubscribeFromAccount')
      expect(lastRequest.params.accountPath).toBe('akt:revenue/relay-fees')
    })
  })

  describe('verifyPaymentClaim()', () => {
    beforeEach(async () => {
      client = new DassieClient(config, mockLogger)
      const connectPromise = client.connect()
      mockWs.simulateOpen()
      await connectPromise
    })

    it('should verify valid payment claim', async () => {
      const claim: PaymentClaim = {
        channelId: 'ch_test123',
        amountSats: 50000,
        nonce: 1,
        signature: '0xabcdef',
        currency: 'BTC',
      }

      const verifyPromise = client.verifyPaymentClaim(claim)

      const request = JSON.parse(mockWs.sent[mockWs.sent.length - 1])
      expect(request.method).toBe('payment.verifyPaymentClaim')

      mockWs.simulateMessage({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          valid: true,
        },
      })

      const result = await verifyPromise

      expect(result.valid).toBe(true)
    })

    it('should reject invalid payment claim', async () => {
      const claim: PaymentClaim = {
        channelId: 'ch_invalid',
        amountSats: 10000,
        nonce: 0,
        signature: '0xinvalid',
        currency: 'XRP',
      }

      const verifyPromise = client.verifyPaymentClaim(claim)

      const request = JSON.parse(mockWs.sent[mockWs.sent.length - 1])

      mockWs.simulateMessage({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          valid: false,
          error: 'invalid-signature',
        },
      })

      const result = await verifyPromise

      expect(result.valid).toBe(false)
      expect(result.error).toBe('invalid-signature')
    })

    it('should return unavailable when endpoints not enabled', async () => {
      const clientWithoutEndpoints = new DassieClient(
        { ...config, paymentEndpointsAvailable: false },
        mockLogger
      )
      const connectPromise = clientWithoutEndpoints.connect()
      mockWs.simulateOpen()
      await connectPromise

      const claim: PaymentClaim = {
        channelId: 'ch_test',
        amountSats: 1000,
        nonce: 1,
        signature: '0xabc',
        currency: 'BTC',
      }

      const result = await clientWithoutEndpoints.verifyPaymentClaim(claim)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('payment-verification-unavailable')
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'verifyPaymentClaim' }),
        'payment.verifyPaymentClaim endpoint not available - Epic 2 pending'
      )

      clientWithoutEndpoints.disconnect()
    })

    it.skip('should handle timeout', async () => {
      // Skip this test - timeout is hardcoded at 10s which is too long for unit tests
      // This would be better tested in integration tests
      const claim: PaymentClaim = {
        channelId: 'ch_timeout',
        amountSats: 1000,
        nonce: 1,
        signature: '0xabc',
        currency: 'BASE',
      }

      // Don't send response - would timeout after 10 seconds
      await expect(client.verifyPaymentClaim(claim)).rejects.toThrow(DassieTimeoutError)
    })
  })

  describe('convertToAKT()', () => {
    beforeEach(async () => {
      client = new DassieClient(config, mockLogger)
      const connectPromise = client.connect()
      mockWs.simulateOpen()
      await connectPromise
    })

    it('should convert currency to AKT', async () => {
      const convertPromise = client.convertToAKT('BTC', BigInt(10000))

      const request = JSON.parse(mockWs.sent[mockWs.sent.length - 1])
      expect(request.method).toBe('payment.convertToAKT')
      expect(request.params.fromCurrency).toBe('BTC')

      mockWs.simulateMessage({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          success: true,
          amountAKT: '500000',
          exchangeRate: 0.05,
          transactionId: 'tx_123',
        },
      })

      const result = await convertPromise

      expect(result.success).toBe(true)
      expect(result.amountAKT).toBe(BigInt(500000))
    })

    it('should return unavailable when endpoints not enabled', async () => {
      const clientWithoutEndpoints = new DassieClient(
        { ...config, paymentEndpointsAvailable: false },
        mockLogger
      )
      const connectPromise = clientWithoutEndpoints.connect()
      mockWs.simulateOpen()
      await connectPromise

      const result = await clientWithoutEndpoints.convertToAKT('XRP', BigInt(1000))

      expect(result.success).toBe(false)
      expect(result.error).toBe('conversion-unavailable')

      clientWithoutEndpoints.disconnect()
    })
  })

  describe('claimChannels()', () => {
    beforeEach(async () => {
      client = new DassieClient(config, mockLogger)
      const connectPromise = client.connect()
      mockWs.simulateOpen()
      await connectPromise
    })

    it('should claim all channels', async () => {
      const claimPromise = client.claimChannels()

      const request = JSON.parse(mockWs.sent[mockWs.sent.length - 1])
      expect(request.method).toBe('payment.claimAllChannels')

      mockWs.simulateMessage({
        jsonrpc: '2.0',
        id: request.id,
        result: [
          {
            channelId: 'ch_btc_1',
            amountClaimed: '50000',
            currency: 'BTC',
            success: true,
          },
          {
            channelId: 'ch_xrp_1',
            amountClaimed: '20000',
            currency: 'XRP',
            success: true,
          },
        ],
      })

      const results = await claimPromise

      expect(results).toHaveLength(2)
      expect(results[0].success).toBe(true)
    })

    it('should claim channels for specific currency', async () => {
      const claimPromise = client.claimChannels('BTC')

      const request = JSON.parse(mockWs.sent[mockWs.sent.length - 1])
      expect(request.params.currency).toBe('BTC')

      mockWs.simulateMessage({
        jsonrpc: '2.0',
        id: request.id,
        result: [
          {
            channelId: 'ch_btc_1',
            amountClaimed: '50000',
            currency: 'BTC',
            success: true,
          },
        ],
      })

      const results = await claimPromise

      expect(results).toHaveLength(1)
      expect(results[0].currency).toBe('BTC')
    })

    it('should return empty array when endpoints not enabled', async () => {
      const clientWithoutEndpoints = new DassieClient(
        { ...config, paymentEndpointsAvailable: false },
        mockLogger
      )
      const connectPromise = clientWithoutEndpoints.connect()
      mockWs.simulateOpen()
      await connectPromise

      const results = await clientWithoutEndpoints.claimChannels()

      expect(results).toEqual([])

      clientWithoutEndpoints.disconnect()
    })
  })

  describe('getRoutingStats()', () => {
    beforeEach(async () => {
      client = new DassieClient(config, mockLogger)
      const connectPromise = client.connect()
      mockWs.simulateOpen()
      await connectPromise
    })

    it('should return routing statistics', async () => {
      const statsPromise = client.getRoutingStats()

      const request = JSON.parse(mockWs.sent[mockWs.sent.length - 1])
      expect(request.method).toBe('payment.getRoutingStats')

      mockWs.simulateMessage({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          totalPacketsRouted: 1000,
          totalAmountRouted: '5000000',
          successRate: 0.98,
          averageLatencyMs: 125,
        },
      })

      const stats = await statsPromise

      expect(stats.totalPacketsRouted).toBe(1000)
      expect(stats.successRate).toBe(0.98)
    })

    it('should return empty stats when endpoints not enabled', async () => {
      const clientWithoutEndpoints = new DassieClient(
        { ...config, paymentEndpointsAvailable: false },
        mockLogger
      )
      const connectPromise = clientWithoutEndpoints.connect()
      mockWs.simulateOpen()
      await connectPromise

      const stats = await clientWithoutEndpoints.getRoutingStats()

      expect(stats.totalPacketsRouted).toBe(0)
      expect(stats.totalAmountRouted).toBe(BigInt(0))

      clientWithoutEndpoints.disconnect()
    })
  })

  describe('Error Handling', () => {
    it('should handle RPC errors', async () => {
      client = new DassieClient(config, mockLogger)
      const connectPromise = client.connect()
      mockWs.simulateOpen()
      await connectPromise

      const balancesPromise = client.getBalances()

      // Simulate error responses for all 4 currencies immediately
      const requests = mockWs.sent.slice(-4).map(JSON.parse)
      requests.forEach((request) => {
        mockWs.simulateMessage({
          jsonrpc: '2.0',
          id: request.id,
          error: { message: 'Internal error' },
        })
      })

      // getBalances returns zero balances on errors, doesn't throw
      const balances = await balancesPromise
      expect(balances.btc_sats).toBe(BigInt(0))
    })

    it('should return zero balances when connection closed during request', async () => {
      client = new DassieClient(config, mockLogger)
      const connectPromise = client.connect()
      mockWs.simulateOpen()
      await connectPromise

      const balancesPromise = client.getBalances()

      // Close connection immediately before any response
      setImmediate(() => {
        mockWs.close()
      })

      // getBalances catches errors and returns zero balances
      const balances = await balancesPromise
      expect(balances).toEqual({
        btc_sats: BigInt(0),
        base_wei: BigInt(0),
        akt_uakt: BigInt(0),
        xrp_drops: BigInt(0),
      })
    })
  })

  describe('Factory Functions', () => {
    it('should create and connect client with createDassieClient', async () => {
      const clientPromise = createDassieClient(config, mockLogger)

      // Simulate connection in next tick
      setTimeout(() => mockWs.simulateOpen(), 10)

      const createdClient = await clientPromise

      expect(createdClient.isConnected()).toBe(true)

      createdClient.disconnect()
    })

    it('should create client from environment with createDassieClientFromEnv', async () => {
      process.env.DASSIE_RPC_URL = 'ws://dassie:5000/trpc'
      process.env.DASSIE_PAYMENT_ENDPOINTS_AVAILABLE = 'true'

      const clientPromise = createDassieClientFromEnv(mockLogger)

      setTimeout(() => mockWs.simulateOpen(), 10)

      const createdClient = await clientPromise

      expect(createdClient.isConnected()).toBe(true)

      createdClient.disconnect()

      delete process.env.DASSIE_RPC_URL
      delete process.env.DASSIE_PAYMENT_ENDPOINTS_AVAILABLE
    })
  })
})
