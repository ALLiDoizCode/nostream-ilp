/**
 * TestNode interface and implementation for N-peer test framework
 */

import type { EventRepository } from '../../../src/btp-nips/storage/event-repository'
import type { EventCache } from '../../../src/btp-nips/storage/event-cache'
import type { SubscriptionManager } from '../../../src/btp-nips/subscription-manager'
import type {
  PerformanceMetrics,
  ResourceMetrics,
  PeerInfo,
  PaymentOpts,
  Payment,
  LedgerState,
} from './config'

// Temporary type definitions (until @types/nostr is properly configured)
export interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  kind: number
  tags: string[][]
  content: string
  sig: string
}

export interface NostrFilter {
  ids?: string[]
  authors?: string[]
  kinds?: number[]
  since?: number
  until?: number
  limit?: number
  [key: string]: any
}

// Optional testcontainers types (may not be installed)
type StartedPostgreSqlContainer = any
type StartedRedisContainer = any

/**
 * Mock ILP STREAM connection for testing (in-process mode)
 */
export interface MockStreamConnection {
  /** Connection type */
  type: 'mock';

  /** ILP destination address */
  destination: string;

  /** Send ILP packet */
  send(packet: Buffer): Promise<void>;

  /** Close connection */
  close(): Promise<void>;

  /** Get active connection count */
  getActiveConnectionCount(): number;

  /** Simulated network delay (for testing) */
  simulatedLatency?: number;

  /** Simulated packet loss rate (0.0 to 1.0) */
  simulatedPacketLoss?: number;
}

/**
 * Real Dassie ILP STREAM connection (Docker mode)
 * Story 11.4: Real Dassie Integration
 */
export interface RealDassieConnection {
  /** Connection type */
  type: 'real';

  /** ILP destination address */
  destination: string;

  /** Docker container name */
  containerName: string;

  /** RPC endpoint (e.g., http://dassie-node-0:7768) */
  rpcEndpoint: string;

  /** RPC auth token */
  authToken: string;

  /** Send ILP packet to real Dassie node */
  send(packet: Buffer): Promise<void>;

  /** Close connection */
  close(): Promise<void>;

  /** Get active connection count from Dassie */
  getActiveConnectionCount(): Promise<number>;

  /** Get peer information */
  getPeers(): Promise<PeerInfo[]>;

  /** Send ILP payment */
  sendPayment(opts: PaymentOpts): Promise<Payment>;

  /** Get internal ledger state */
  getInternalLedger(): Promise<LedgerState>;
}

/** Union type for stream connections */
export type StreamConnection = MockStreamConnection | RealDassieConnection;

/**
 * TestNode represents a single node in the N-peer test network
 */
export interface TestNode {
  /** Unique node identifier */
  id: string;

  /** ILP address for this node */
  ilpAddress: string;

  /** Nostr public key (hex) */
  pubkey: string;

  /** Nostr private key (Buffer) */
  privkey: Buffer;

  // Core BTP-NIPs components (isolated per node)
  /** Event repository (PostgreSQL) */
  repository: EventRepository;

  /** Event cache (Redis) */
  cache: EventCache;

  /** Subscription manager */
  subscriptionManager: SubscriptionManager;

  /** Peer discovery service */
  peerDiscovery: any; // PeerDiscoveryService type not exported yet

  /** ILP STREAM connection (mock or real Dassie) */
  streamConnection: StreamConnection;

  // Performance monitoring
  /** Performance metrics for this node */
  metrics: PerformanceMetrics;

  // Helper methods
  /** Publish a Nostr event from this node */
  publishEvent(event: NostrEvent): Promise<void>;

  /** Subscribe to events matching filters */
  subscribe(filters: NostrFilter[]): Promise<string>;

  /** Get events received by this node */
  getReceivedEvents(eventId?: string): NostrEvent[];

  /** Get routing revenue earned by this node */
  getRoutingRevenue(): number;

  /** Measure latency of an operation */
  measureLatency(operation: () => Promise<void>): Promise<number>;

  /** Get current resource usage */
  getResourceUsage(): ResourceMetrics;

  // Docker mode methods (Story 11.4)
  /** Get peer information from Dassie node (Docker mode only) */
  getPeers(): Promise<PeerInfo[]>;

  /** Send ILP payment (Docker mode only) */
  sendILPPayment(opts: PaymentOpts): Promise<Payment>;

  /** Get internal ledger state (Docker mode only) */
  getInternalLedger(): Promise<LedgerState>;

  // Cleanup
  /** Cleanup this node's resources */
  cleanup(): Promise<void>;

  // Internal state (for testing)
  /** PostgreSQL container (for cleanup) */
  _pgContainer?: StartedPostgreSqlContainer;

  /** Redis container (for cleanup) */
  _redisContainer?: StartedRedisContainer;

  /** Received events buffer */
  _receivedEvents: NostrEvent[];

  /** Active subscriptions */
  _subscriptions: Map<string, NostrFilter[]>;

  /** Routing revenue counter (msats) */
  _routingRevenue: number;

  /** Node running state */
  _running: boolean;
}

/**
 * Create a mock STREAM connection with simulated network conditions
 */
export function createMockStreamConnection(
  destination: string,
  latency = 0,
  packetLoss = 0
): MockStreamConnection {
  let activeConnections = 0

  return {
    type: 'mock',
    destination,
    simulatedLatency: latency,
    simulatedPacketLoss: packetLoss,

    async send(_packet: Buffer): Promise<void> {
      // Simulate packet loss
      if (packetLoss > 0 && Math.random() < packetLoss) {
        throw new Error('Simulated packet loss')
      }

      // Simulate network latency
      if (latency > 0) {
        await new Promise((resolve) => setTimeout(resolve, latency))
      }

      // Mock: packet sent successfully
      activeConnections++
    },

    async close(): Promise<void> {
      activeConnections = 0
    },

    getActiveConnectionCount(): number {
      return activeConnections
    },
  }
}

/**
 * Create a real Dassie ILP STREAM connection (Docker mode)
 */
export function createRealDassieConnection(
  destination: string,
  containerName: string,
  rpcPort: number,
  authToken: string
): RealDassieConnection {
  const rpcEndpoint = `http://localhost:${rpcPort}`

  return {
    type: 'real',
    destination,
    containerName,
    rpcEndpoint,
    authToken,

    async send(packet: Buffer): Promise<void> {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // 5s timeout

        const response = await fetch(`${rpcEndpoint}/trpc/ilp.sendPacket`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            destination,
            data: packet.toString('base64'),
          }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`RPC call failed: ${response.status} ${response.statusText}`)
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('RPC call timed out after 5 seconds')
        }
        throw error
      }
    },

    async close(): Promise<void> {
      // Graceful shutdown of connection
      // In real Dassie, this would be a tRPC call
    },

    async getActiveConnectionCount(): Promise<number> {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        const response = await fetch(`${rpcEndpoint}/trpc/peers.count`, {
          headers: { Authorization: `Bearer ${authToken}` },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`RPC call failed: ${response.status} ${response.statusText}`)
        }

        const data = (await response.json()) as { result?: { data?: number } }
        if (typeof data.result?.data !== 'number') {
          throw new Error('Invalid response format: missing result.data')
        }
        return data.result.data
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('RPC call timed out after 5 seconds')
        }
        throw error
      }
    },

    async getPeers(): Promise<PeerInfo[]> {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        const response = await fetch(`${rpcEndpoint}/trpc/peers.list`, {
          headers: { Authorization: `Bearer ${authToken}` },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`RPC call failed: ${response.status} ${response.statusText}`)
        }

        const data = (await response.json()) as { result?: { data?: PeerInfo[] } }
        if (!Array.isArray(data.result?.data)) {
          throw new Error('Invalid response format: missing result.data array')
        }
        return data.result.data
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('RPC call timed out after 5 seconds')
        }
        throw error
      }
    },

    async sendPayment(opts: PaymentOpts): Promise<Payment> {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        const response = await fetch(`${rpcEndpoint}/trpc/ilp.sendPayment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(opts),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`RPC call failed: ${response.status} ${response.statusText}`)
        }

        const data = (await response.json()) as { result?: { data?: { id?: string } } }
        if (!data.result?.data?.id) {
          throw new Error('Invalid response format: missing result.data.id')
        }
        const paymentId = data.result.data.id

        return {
          id: paymentId,
          status: 'pending',
          hops: 0,

          async waitForFulfillment(timeout: number): Promise<void> {
            const startTime = Date.now()
            while (Date.now() - startTime < timeout) {
              try {
                const statusController = new AbortController()
                const statusTimeoutId = setTimeout(() => statusController.abort(), 5000)

                const statusResponse = await fetch(
                  `${rpcEndpoint}/trpc/ilp.getPaymentStatus?id=${paymentId}`,
                  {
                    headers: { Authorization: `Bearer ${authToken}` },
                    signal: statusController.signal,
                  }
                )

                clearTimeout(statusTimeoutId)

                if (!statusResponse.ok) {
                  throw new Error(
                    `RPC call failed: ${statusResponse.status} ${statusResponse.statusText}`
                  )
                }

                const statusData = (await statusResponse.json()) as {
                  result?: { data?: { status?: string } }
                }
                const status = statusData.result?.data?.status

                if (status === 'fulfilled') {
                  return
                }
                if (status === 'failed') {
                  throw new Error('Payment failed')
                }
              } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                  // Timeout on status check, retry
                  continue
                }
                throw error
              }

              await new Promise((resolve) => setTimeout(resolve, 100))
            }
            throw new Error('Payment timeout')
          },
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('RPC call timed out after 5 seconds')
        }
        throw error
      }
    },

    async getInternalLedger(): Promise<LedgerState> {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        const response = await fetch(`${rpcEndpoint}/trpc/ledger.getState`, {
          headers: { Authorization: `Bearer ${authToken}` },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          throw new Error(`RPC call failed: ${response.status} ${response.statusText}`)
        }

        const data = (await response.json()) as { result?: { data?: LedgerState } }
        if (!data.result?.data) {
          throw new Error('Invalid response format: missing result.data')
        }
        return data.result.data
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error('RPC call timed out after 5 seconds')
        }
        throw error
      }
    },
  }
}

/**
 * Initialize performance metrics for a new node
 */
export function initializeMetrics(): PerformanceMetrics {
  return {
    latency: {
      total: 0,
      serialization: 0,
      network: 0,
      deserialization: 0,
      crypto: 0,
      database: 0,
      subscription: 0,
    },
    throughput: {
      eventsPerSec: 0,
      bytesPerSec: 0,
    },
    resources: {
      memoryMB: 0,
      cpuPercent: 0,
      connections: 0,
    },
  }
}
