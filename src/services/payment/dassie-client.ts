/**
 * Dassie RPC Client for Nostream
 *
 * WebSocket-based RPC client for communicating with Dassie ILP node.
 * Provides wrappers for balance queries, payment verification,
 * and currency conversion operations.
 *
 * NOTE: This is a simplified implementation until Epic 2 completes the Dassie fork.
 * Once real Dassie tRPC endpoints are available, this will be refactored to use
 * @trpc/client properly with the actual AppRouter type.
 *
 * @module dassie-client
 */

import { EventEmitter } from 'events'

import type {
  BalanceResponse,
  BalanceUpdate,
  ClaimResult,
  ConversionResult,
  PaymentClaimVerification,
  RoutingStats,
} from '@/@types/dassie-router.stub'
import type { PaymentClaim } from '@/@types/payment-claim'

import WebSocket from 'ws'

import { connectionStateToValue, dassieConnectionState } from '../metrics'

/**
 * Configuration for Dassie RPC client
 */
export interface DassieClientConfig {
  /** WebSocket URL for Dassie RPC (default: ws://localhost:5000/trpc) */
  url: string
  /** Initial retry delay in milliseconds (default: 100) */
  retryDelayMs?: number
  /** Maximum retry delay in milliseconds (default: 30000) */
  maxDelayMs?: number
  /** Maximum number of retries for RPC calls (default: 3, Infinity for connection) */
  maxRetries?: number
  /** Feature flag: Are payment.* endpoints available in Dassie? (default: false) */
  paymentEndpointsAvailable?: boolean
  /** Jitter percentage for backoff randomization (default: 0.1 = 10%) */
  jitterPercent?: number
}

/**
 * Connection state for Dassie RPC client
 */
export enum ConnectionState {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  RECONNECTING = 'RECONNECTING',
}

/**
 * Currency balances aggregated from Dassie ledger
 */
export interface CurrencyBalances {
  btc_sats: bigint
  base_wei: bigint
  akt_uakt: bigint
  xrp_drops: bigint
}

/**
 * Custom error classes for Dassie client
 */
export class DassieConnectionError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message)
    this.name = 'DassieConnectionError'
  }
}

export class DassieRPCError extends Error {
  constructor(message: string, public readonly cause?: Error, public readonly method?: string) {
    super(message)
    this.name = 'DassieRPCError'
  }
}

export class DassieTimeoutError extends Error {
  constructor(message: string, public readonly method?: string) {
    super(message)
    this.name = 'DassieTimeoutError'
  }
}

/**
 * Subscription handle for balance updates
 */
export interface BalanceSubscription {
  unsubscribe: () => void
}

/**
 * Logger interface (compatible with Pino)
 */
interface Logger {
  info: (obj: any, msg?: string) => void
  warn: (obj: any, msg?: string) => void
  error: (obj: any, msg?: string) => void
  debug: (obj: any, msg?: string) => void
}

/**
 * RPC request ID generator
 */
let requestId = 0
function nextRequestId(): number {
  return ++requestId
}

/**
 * Dassie RPC Client
 *
 * Provides WebSocket RPC communication with Dassie ILP node.
 * Handles connection lifecycle, automatic reconnection, and error handling.
 *
 * @example
 * ```typescript
 * const client = new DassieClient({ url: 'ws://localhost:5000/trpc' }, logger)
 * await client.connect()
 *
 * const balances = await client.getBalances()
 * console.log('BTC Balance:', balances.btc_sats)
 *
 * const isValid = await client.verifyPaymentClaim(claim)
 * ```
 */
export class DassieClient extends EventEmitter {
  private ws: WebSocket | null = null
  private config: Required<DassieClientConfig>
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED
  private reconnectAttempts = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private logger: Logger
  private pendingRequests: Map<number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout
  }> = new Map()
  private subscriptions: Map<string, Set<(data: BalanceUpdate) => void>> = new Map()

  constructor(config: DassieClientConfig, logger: Logger) {
    super()
    this.config = {
      url: config.url,
      retryDelayMs: config.retryDelayMs ?? 100,
      maxDelayMs: config.maxDelayMs ?? 30000,
      maxRetries: config.maxRetries ?? 3,
      paymentEndpointsAvailable: config.paymentEndpointsAvailable ?? false,
      jitterPercent: config.jitterPercent ?? 0.1,
    }
    this.logger = logger
  }

  /**
   * Establish WebSocket connection to Dassie RPC
   *
   * Implements exponential backoff with jitter for reconnection attempts.
   * Connection state changes are emitted as events.
   *
   * @throws {DassieConnectionError} If connection fails after max retries
   */
  async connect(): Promise<void> {
    if (this.connectionState === ConnectionState.CONNECTED) {
      this.logger.warn({ method: 'connect' }, 'Already connected to Dassie RPC')
      return
    }

    this.setConnectionState(ConnectionState.CONNECTING)
    this.logger.info({ url: this.config.url }, 'Connecting to Dassie RPC')

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new DassieTimeoutError('Connection timeout'))
      }, 5000)

      try {
        this.ws = new WebSocket(this.config.url)

        this.ws.on('open', () => {
          clearTimeout(timeout)
          this.reconnectAttempts = 0
          this.setConnectionState(ConnectionState.CONNECTED)
          this.logger.info({ url: this.config.url }, 'Connected to Dassie RPC')
          resolve()
        })

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data)
        })

        this.ws.on('close', () => {
          this.logger.warn({}, 'Dassie RPC connection closed')
          this.handleDisconnect()
        })

        this.ws.on('error', (error: Error) => {
          clearTimeout(timeout)
          this.logger.error({ error }, 'Dassie RPC connection error')
          this.emit('error', new DassieConnectionError('WebSocket error', error))
          if (this.connectionState === ConnectionState.CONNECTING) {
            reject(new DassieConnectionError('Connection failed', error))
          }
        })
      } catch (error) {
        clearTimeout(timeout)
        this.setConnectionState(ConnectionState.DISCONNECTED)
        reject(new DassieConnectionError('Failed to create WebSocket', error as Error))
      }
    })
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString())

      // Handle RPC response
      if (message.id && this.pendingRequests.has(message.id)) {
        const { resolve, reject, timeout } = this.pendingRequests.get(message.id)!
        clearTimeout(timeout)
        this.pendingRequests.delete(message.id)

        if (message.error) {
          reject(new DassieRPCError(message.error.message || 'RPC error', undefined, message.method))
        } else {
          resolve(message.result)
        }
      }

      // Handle subscription update
      if (message.method === 'subscription' && message.params) {
        const { accountPath, data: updateData } = message.params
        const callbacks = this.subscriptions.get(accountPath)
        if (callbacks) {
          // Convert BigInt fields from string to BigInt
          const converted: BalanceUpdate = {
            ...updateData,
            balance: typeof updateData.balance === 'string' ? BigInt(updateData.balance) : updateData.balance,
            delta: typeof updateData.delta === 'string' ? BigInt(updateData.delta) : updateData.delta,
          }
          callbacks.forEach(cb => cb(converted))
        }
      }
    } catch (error) {
      this.logger.error({ error, data: data.toString() }, 'Failed to parse WebSocket message')
    }
  }

  /**
   * Send RPC request
   */
  private sendRequest<T>(method: string, params: any, timeoutMs: number = 10000): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        reject(new DassieConnectionError('Not connected to Dassie RPC'))
        return
      }

      const id = nextRequestId()
      const message = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      }

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new DassieTimeoutError('Request timeout', method))
      }, timeoutMs)

      this.pendingRequests.set(id, { resolve, reject, timeout })

      try {
        this.ws!.send(JSON.stringify(message))
        this.logger.debug({ method, id, params }, 'Sent RPC request')
      } catch (error) {
        this.pendingRequests.delete(id)
        clearTimeout(timeout)
        reject(new DassieRPCError('Failed to send request', error as Error, method))
      }
    })
  }

  /**
   * Handle disconnection and initiate reconnection
   */
  private handleDisconnect(): void {
    if (this.connectionState === ConnectionState.DISCONNECTED) {
      return // Already disconnected, no need to reconnect
    }

    // Reject all pending requests
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout)
      reject(new DassieConnectionError('Connection closed'))
    })
    this.pendingRequests.clear()

    this.setConnectionState(ConnectionState.RECONNECTING)
    this.scheduleReconnect()
  }

  /**
   * Schedule reconnection with exponential backoff and jitter
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return // Already scheduled
    }

    const delay = this.calculateBackoffDelay()
    this.logger.info(
      { attempt: this.reconnectAttempts + 1, delayMs: delay },
      'Scheduling Dassie RPC reconnection'
    )

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      this.reconnectAttempts++

      try {
        await this.connect()
      } catch (error) {
        this.logger.error({ error }, 'Reconnection failed')
        this.scheduleReconnect() // Try again
      }
    }, delay)
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoffDelay(): number {
    const exponentialDelay = this.config.retryDelayMs * Math.pow(2, this.reconnectAttempts)
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs)

    // Add jitter (±10% by default)
    const jitter = cappedDelay * this.config.jitterPercent * (Math.random() * 2 - 1)
    return Math.floor(cappedDelay + jitter)
  }

  /**
   * Update connection state and emit event
   */
  private setConnectionState(state: ConnectionState): void {
    const previousState = this.connectionState
    this.connectionState = state

    if (previousState !== state) {
      this.logger.debug({ from: previousState, to: state }, 'Connection state changed')
      this.emit('state', state)

      // Update Prometheus metric
      dassieConnectionState.set(connectionStateToValue(state))

      // Emit specific events for convenience
      switch (state) {
        case ConnectionState.CONNECTED:
          this.emit('connected')
          break
        case ConnectionState.DISCONNECTED:
          this.emit('disconnected')
          break
        case ConnectionState.RECONNECTING:
          this.emit('reconnecting')
          break
      }
    }
  }

  /**
   * Gracefully disconnect from Dassie RPC
   */
  disconnect(): void {
    this.logger.info('Disconnecting from Dassie RPC')

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.setConnectionState(ConnectionState.DISCONNECTED)
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED && this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * Get current connection state
   */
  getConnectionState(): ConnectionState {
    return this.connectionState
  }

  /**
   * Execute RPC call with retry logic
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    method: string,
    maxRetries: number = this.config.maxRetries
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const startTime = Date.now()
        const result = await fn()
        const duration = Date.now() - startTime

        this.logger.debug({ method, attempt, duration }, 'RPC call succeeded')
        return result
      } catch (error) {
        lastError = error as Error
        this.logger.warn(
          { method, attempt, maxRetries, error: lastError.message },
          'RPC call failed'
        )

        if (attempt < maxRetries) {
          const delay = this.calculateBackoffDelay()
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    throw new DassieRPCError(
      `RPC call failed after ${maxRetries + 1} attempts`,
      lastError!,
      method
    )
  }

  /**
   * Get balances for all supported currencies
   *
   * Queries Dassie ledger for balances across BTC, BASE, AKT, and XRP.
   *
   * @returns Promise<CurrencyBalances> Aggregated balances
   * @throws {DassieRPCError} If RPC call fails
   */
  async getBalances(): Promise<CurrencyBalances> {
    this.ensureConnected()

    return this.retryWithBackoff(async () => {
      const [btc, base, akt, xrp] = await Promise.all([
        this.getBalanceForCurrency('btc'),
        this.getBalanceForCurrency('base'),
        this.getBalanceForCurrency('akt'),
        this.getBalanceForCurrency('xrp'),
      ])

      return {
        btc_sats: btc,
        base_wei: base,
        akt_uakt: akt,
        xrp_drops: xrp,
      }
    }, 'getBalances')
  }

  /**
   * Get balance for a specific currency
   */
  private async getBalanceForCurrency(currency: string): Promise<bigint> {
    const accountPath = `${currency}:revenue/relay-fees`

    try {
      const response: BalanceResponse = await this.sendRequest('ledger.getBalance', {
        accountPath,
      })

      return BigInt(response.balance)
    } catch (error) {
      this.logger.warn(
        { currency, accountPath, error: (error as Error).message },
        'Failed to get balance for currency'
      )
      return BigInt(0) // Return 0 balance on error
    }
  }

  /**
   * Subscribe to balance updates for a specific account
   *
   * @param accountPath - Dassie account path (e.g., "btc:revenue/relay-fees")
   * @param callback - Callback function for balance updates
   * @returns BalanceSubscription handle for unsubscribing
   */
  subscribeToBalance(
    accountPath: string,
    callback: (update: BalanceUpdate) => void
  ): BalanceSubscription {
    this.ensureConnected()

    this.logger.info({ accountPath }, 'Subscribing to balance updates')

    if (!this.subscriptions.has(accountPath)) {
      this.subscriptions.set(accountPath, new Set())

      // Send subscription request
      this.sendRequest('ledger.subscribeToAccount', { accountPath }).catch(error => {
        this.logger.error({ error, accountPath }, 'Failed to subscribe to balance')
      })
    }

    this.subscriptions.get(accountPath)!.add(callback)

    return {
      unsubscribe: () => {
        this.logger.info({ accountPath }, 'Unsubscribing from balance updates')
        const callbacks = this.subscriptions.get(accountPath)
        if (callbacks) {
          callbacks.delete(callback)
          if (callbacks.size === 0) {
            this.subscriptions.delete(accountPath)
            // Send unsubscribe request
            this.sendRequest('ledger.unsubscribeFromAccount', { accountPath }).catch(error => {
              this.logger.error({ error, accountPath }, 'Failed to unsubscribe from balance')
            })
          }
        }
      },
    }
  }

  /**
   * Verify a payment claim against Dassie
   *
   * Calls Dassie's payment.verifyPaymentClaim endpoint to validate
   * that a payment has been made through a payment channel.
   *
   * @param claim - Payment claim to verify
   * @returns Promise<PaymentClaimVerification> Verification result
   * @throws {DassieRPCError} If endpoint not available or verification fails
   */
  async verifyPaymentClaim(claim: PaymentClaim): Promise<PaymentClaimVerification> {
    this.ensureConnected()

    // Check if payment endpoints are available (Epic 2)
    if (!this.config.paymentEndpointsAvailable) {
      this.logger.warn(
        { method: 'verifyPaymentClaim' },
        'payment.verifyPaymentClaim endpoint not available - Epic 2 pending'
      )
      return {
        valid: false,
        error: 'payment-verification-unavailable',
      }
    }

    return this.retryWithBackoff(async () => {
      return this.sendRequest<PaymentClaimVerification>('payment.verifyPaymentClaim', claim, 5000)
    }, 'verifyPaymentClaim')
  }

  /**
   * Convert payment to AKT tokens
   *
   * Converts received payment from any currency to AKT for Akash bill payment.
   *
   * @param currency - Source currency
   * @param amount - Amount to convert
   * @returns Promise<ConversionResult> Conversion result with AKT amount
   */
  async convertToAKT(currency: string, amount: bigint): Promise<ConversionResult> {
    this.ensureConnected()

    if (!this.config.paymentEndpointsAvailable) {
      this.logger.warn(
        { method: 'convertToAKT' },
        'payment.convertToAKT endpoint not available - Epic 2 pending'
      )
      return {
        success: false,
        error: 'conversion-unavailable',
      }
    }

    return this.retryWithBackoff(async () => {
      const result = await this.sendRequest<any>('payment.convertToAKT', {
        amount: amount.toString(),
        fromCurrency: currency,
      })
      // Convert amountAKT from string to BigInt if needed
      return {
        ...result,
        amountAKT: typeof result.amountAKT === 'string' ? BigInt(result.amountAKT) : result.amountAKT,
      }
    }, 'convertToAKT')
  }

  /**
   * Claim funds from all payment channels
   *
   * Settles payment channels and moves funds to Dassie ledger.
   *
   * @param currency - Optional currency filter (claim only specific currency channels)
   * @returns Promise<ClaimResult[]> Results for each channel claimed
   */
  async claimChannels(currency?: string): Promise<ClaimResult[]> {
    this.ensureConnected()

    if (!this.config.paymentEndpointsAvailable) {
      this.logger.warn(
        { method: 'claimChannels' },
        'payment.claimAllChannels endpoint not available - Epic 2 pending'
      )
      return []
    }

    return this.retryWithBackoff(async () => {
      return this.sendRequest<ClaimResult[]>('payment.claimAllChannels', { currency })
    }, 'claimChannels')
  }

  /**
   * Get ILP routing statistics
   *
   * Returns metrics about payment routing performance.
   *
   * @returns Promise<RoutingStats> Routing statistics
   */
  async getRoutingStats(): Promise<RoutingStats> {
    this.ensureConnected()

    if (!this.config.paymentEndpointsAvailable) {
      this.logger.warn(
        { method: 'getRoutingStats' },
        'payment.getRoutingStats endpoint not available - Epic 2 pending'
      )
      return {
        totalPacketsRouted: 0,
        totalAmountRouted: BigInt(0),
        successRate: 0,
        averageLatencyMs: 0,
      }
    }

    return this.retryWithBackoff(async () => {
      return this.sendRequest<RoutingStats>('payment.getRoutingStats', {})
    }, 'getRoutingStats')
  }

  /**
   * Ensure client is connected before making RPC calls
   */
  private ensureConnected(): void {
    if (!this.isConnected()) {
      throw new DassieConnectionError('Not connected to Dassie RPC')
    }
  }
}

/**
 * Create and connect a Dassie RPC client
 *
 * @param config - Client configuration
 * @param logger - Logger instance
 * @returns Promise<DassieClient> Connected client instance
 */
export async function createDassieClient(
  config: DassieClientConfig,
  logger: Logger
): Promise<DassieClient> {
  const client = new DassieClient(config, logger)
  await client.connect()
  return client
}

/**
 * Create Dassie client from environment variables
 *
 * @param logger - Logger instance
 * @returns Promise<DassieClient> Connected client instance
 */
export async function createDassieClientFromEnv(logger: Logger): Promise<DassieClient> {
  const config: DassieClientConfig = {
    url: process.env.DASSIE_RPC_URL || 'ws://localhost:5000/trpc',
    paymentEndpointsAvailable: process.env.DASSIE_PAYMENT_ENDPOINTS_AVAILABLE === 'true',
  }

  return createDassieClient(config, logger)
}
