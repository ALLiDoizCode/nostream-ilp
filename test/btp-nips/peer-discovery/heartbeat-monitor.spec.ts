import {
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeartbeatMonitor } from '../../../src/btp-nips/peer-discovery/heartbeat-monitor.js'

import type { ConnectionStore } from '../../../src/btp-nips/peer-discovery/connection-store.js'
import type { DassieClient } from '../../../src/services/payment/dassie-client.js'

/**
 * Unit Tests for HeartbeatMonitor
 * Story 6.5: Peer Connection Lifecycle (Task 10)
 */


  type ConnectionConfig,
  DEFAULT_CONNECTION_CONFIG,
  type PeerConnection,
  PeerConnectionState,
} from '../../../src/btp-nips/types/peer-connection.js'

// Test pubkeys (64 characters each)
const ALICE_PUBKEY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const BOB_PUBKEY = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

describe('HeartbeatMonitor', () => {
  let monitor: HeartbeatMonitor
  let mockConnectionStore: ConnectionStore
  let mockDassieClient: DassieClient
  let config: ConnectionConfig

  // In-memory connection storage for tests
  const connections = new Map<string, PeerConnection>()

  beforeEach(() => {
    // Use fake timers for time-based tests
    vi.useFakeTimers()

    connections.clear()

    // Test configuration with shorter intervals for faster tests
    config = {
      ...DEFAULT_CONNECTION_CONFIG,
      heartbeatIntervalMs: 1000, // 1 second for tests
      heartbeatTimeoutMs: 500, // 500ms for tests
    }

    // Mock ConnectionStore
    mockConnectionStore = {
      getConnection: vi.fn(async (pubkey: string) => {
        return connections.get(pubkey) ?? null
      }),
      updateLastHeartbeat: vi.fn(async (pubkey: string) => {
        const conn = connections.get(pubkey)
        if (conn) {
          conn.lastHeartbeat = Date.now()
          connections.set(pubkey, conn)
        }
      }),
      updateConnectionState: vi.fn(async (pubkey: string, state: PeerConnectionState) => {
        const conn = connections.get(pubkey)
        if (conn) {
          conn.state = state
          connections.set(pubkey, conn)
        }
      }),
      getConnectionsByState: vi.fn(async (state: PeerConnectionState) => {
        const results: PeerConnection[] = []
        for (const conn of connections.values()) {
          if (conn.state === state) {
            results.push(conn)
          }
        }
        return results
      }),
    } as unknown as ConnectionStore

    // Mock DassieClient
    mockDassieClient = {} as DassieClient

    monitor = new HeartbeatMonitor(mockConnectionStore, mockDassieClient, config)
  })

  afterEach(() => {
    // Clean up all monitoring and timers
    monitor.stopAll()
    vi.useRealTimers()
  })

  describe('startMonitoring', () => {
    it('should send initial PING immediately', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: 'channel-123',
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      const mockStreamConnection = {}

      await monitor.startMonitoring(ALICE_PUBKEY, mockStreamConnection)

      // Verify getConnection was called to get ILP address
      expect(mockConnectionStore.getConnection).toHaveBeenCalledWith(ALICE_PUBKEY)
    })

    it('should send PING at configured interval', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: 'channel-123',
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      const mockStreamConnection = {}

      await monitor.startMonitoring(ALICE_PUBKEY, mockStreamConnection)

      // Clear initial getConnection call
      vi.mocked(mockConnectionStore.getConnection).mockClear()

      // Advance time by 1 interval (1000ms)
      await vi.advanceTimersByTimeAsync(1000)

      // Verify PING was sent (getConnection called to get ILP address)
      expect(mockConnectionStore.getConnection).toHaveBeenCalledWith(ALICE_PUBKEY)
    })

    it('should not start monitoring if already monitoring', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: 'channel-123',
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      const mockStreamConnection = {}

      await monitor.startMonitoring(ALICE_PUBKEY, mockStreamConnection)

      // Clear mock calls
      vi.mocked(mockConnectionStore.getConnection).mockClear()

      // Try to start again
      await monitor.startMonitoring(ALICE_PUBKEY, mockStreamConnection)

      // Should not call getConnection again (already monitoring)
      expect(mockConnectionStore.getConnection).not.toHaveBeenCalled()
    })
  })

  describe('handlePong', () => {
    it('should update last heartbeat timestamp on PONG', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: 'channel-123',
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      const mockStreamConnection = {}

      await monitor.startMonitoring(ALICE_PUBKEY, mockStreamConnection)

      // Handle PONG
      await monitor.handlePong(ALICE_PUBKEY)

      // Verify last heartbeat updated
      expect(mockConnectionStore.updateLastHeartbeat).toHaveBeenCalledWith(ALICE_PUBKEY)
    })

    it('should clear timeout on PONG', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: 'channel-123',
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      const mockStreamConnection = {}

      await monitor.startMonitoring(ALICE_PUBKEY, mockStreamConnection)

      // Handle PONG before timeout
      await monitor.handlePong(ALICE_PUBKEY)

      // Advance past timeout period
      await vi.advanceTimersByTimeAsync(600)

      // Should NOT mark as DISCONNECTED because PONG cleared timeout
      expect(mockConnectionStore.updateConnectionState).not.toHaveBeenCalledWith(
        ALICE_PUBKEY,
        PeerConnectionState.DISCONNECTED
      )
    })

    it('should ignore PONG from unmonitored peer', async () => {
      // Handle PONG for peer not being monitored
      await monitor.handlePong(BOB_PUBKEY)

      // Should not update heartbeat
      expect(mockConnectionStore.updateLastHeartbeat).not.toHaveBeenCalled()
    })
  })

  describe('timeout handling', () => {
    it('should mark connection as DISCONNECTED if no PONG after timeout', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: 'channel-123',
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      const mockStreamConnection = {}

      await monitor.startMonitoring(ALICE_PUBKEY, mockStreamConnection)

      // Clear initial calls
      vi.mocked(mockConnectionStore.updateConnectionState).mockClear()

      // Advance time past timeout (500ms)
      await vi.advanceTimersByTimeAsync(600)

      // Verify connection marked as DISCONNECTED
      expect(mockConnectionStore.updateConnectionState).toHaveBeenCalledWith(
        ALICE_PUBKEY,
        PeerConnectionState.DISCONNECTED
      )
    })

    it('should stop monitoring after timeout', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: 'channel-123',
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      const mockStreamConnection = {}

      await monitor.startMonitoring(ALICE_PUBKEY, mockStreamConnection)

      // Advance past timeout
      await vi.advanceTimersByTimeAsync(600)

      // Clear mock calls
      vi.mocked(mockConnectionStore.getConnection).mockClear()

      // Advance another interval
      await vi.advanceTimersByTimeAsync(1000)

      // Should not send more PINGs (monitoring stopped)
      expect(mockConnectionStore.getConnection).not.toHaveBeenCalled()
    })
  })

  describe('stopMonitoring', () => {
    it('should clear interval and timeout', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: 'channel-123',
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      const mockStreamConnection = {}

      await monitor.startMonitoring(ALICE_PUBKEY, mockStreamConnection)

      // Stop monitoring
      monitor.stopMonitoring(ALICE_PUBKEY)

      // Clear mock calls
      vi.mocked(mockConnectionStore.getConnection).mockClear()

      // Advance time
      await vi.advanceTimersByTimeAsync(2000)

      // Should not send more PINGs
      expect(mockConnectionStore.getConnection).not.toHaveBeenCalled()
    })

    it('should not throw error if timer not found', () => {
      // Should not throw
      expect(() => monitor.stopMonitoring(BOB_PUBKEY)).not.toThrow()
    })
  })

  describe('checkAllConnections', () => {
    it('should mark connections with stale heartbeats as DISCONNECTED', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: 'channel-123',
        priority: 1,
        lastHeartbeat: Date.now() - 100000, // Very old (100 seconds ago)
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      // Run cleanup check
      await monitor.checkAllConnections()

      // Verify connection marked as DISCONNECTED
      expect(mockConnectionStore.updateConnectionState).toHaveBeenCalledWith(
        ALICE_PUBKEY,
        PeerConnectionState.DISCONNECTED
      )
    })

    it('should not mark connections with recent heartbeats as DISCONNECTED', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: 'channel-123',
        priority: 1,
        lastHeartbeat: Date.now() - 500, // Recent (500ms ago)
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      // Run cleanup check
      await monitor.checkAllConnections()

      // Should NOT mark as DISCONNECTED
      expect(mockConnectionStore.updateConnectionState).not.toHaveBeenCalledWith(
        ALICE_PUBKEY,
        PeerConnectionState.DISCONNECTED
      )
    })

    it('should skip connections with no heartbeat timestamp', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: 'channel-123',
        priority: 1,
        lastHeartbeat: null, // No heartbeat yet
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      // Run cleanup check
      await monitor.checkAllConnections()

      // Should not mark as DISCONNECTED
      expect(mockConnectionStore.updateConnectionState).not.toHaveBeenCalledWith(
        ALICE_PUBKEY,
        PeerConnectionState.DISCONNECTED
      )
    })

    it('should run periodically via cleanup job', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: 'channel-123',
        priority: 1,
        lastHeartbeat: Date.now() - 100000, // Very old
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      // Clear initial calls
      vi.mocked(mockConnectionStore.getConnectionsByState).mockClear()

      // Advance time to trigger cleanup job (heartbeatIntervalMs = 1000ms)
      await vi.advanceTimersByTimeAsync(1000)

      // Verify cleanup job ran
      expect(mockConnectionStore.getConnectionsByState).toHaveBeenCalledWith(
        PeerConnectionState.CONNECTED
      )
    })
  })

  describe('stopCleanupJob', () => {
    it('should stop background cleanup job', async () => {
      // Stop cleanup job
      monitor.stopCleanupJob()

      // Clear mock calls
      vi.mocked(mockConnectionStore.getConnectionsByState).mockClear()

      // Advance time
      await vi.advanceTimersByTimeAsync(5000)

      // Cleanup job should not have run
      expect(mockConnectionStore.getConnectionsByState).not.toHaveBeenCalled()
    })
  })

  describe('stopAll', () => {
    it('should stop all monitoring and cleanup job', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: 'channel-123',
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      const mockStreamConnection = {}

      await monitor.startMonitoring(ALICE_PUBKEY, mockStreamConnection)

      // Stop all
      monitor.stopAll()

      // Clear mock calls
      vi.mocked(mockConnectionStore.getConnection).mockClear()
      vi.mocked(mockConnectionStore.getConnectionsByState).mockClear()

      // Advance time
      await vi.advanceTimersByTimeAsync(5000)

      // No monitoring should be active
      expect(mockConnectionStore.getConnection).not.toHaveBeenCalled()
      expect(mockConnectionStore.getConnectionsByState).not.toHaveBeenCalled()
    })
  })
})
