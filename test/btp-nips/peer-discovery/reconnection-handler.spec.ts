import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReconnectionHandler } from '../../../src/btp-nips/peer-discovery/reconnection-handler.js'
import {
  type ConnectionConfig,
  DEFAULT_CONNECTION_CONFIG,
  type PeerConnection,
  PeerConnectionState,
} from '../../../src/btp-nips/types/peer-connection.js'

import type { ConnectionLifecycleManager } from '../../../src/btp-nips/peer-discovery/connection-lifecycle.js'
import type { ConnectionStore } from '../../../src/btp-nips/peer-discovery/connection-store.js'

/**
 * Unit Tests for ReconnectionHandler
 * Story 6.5: Peer Connection Lifecycle (Task 11)
 */

// Test pubkeys (64 characters each)
const ALICE_PUBKEY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const BOB_PUBKEY = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const CAROL_PUBKEY = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'

describe('ReconnectionHandler', () => {
  let handler: ReconnectionHandler
  let mockLifecycleManager: ConnectionLifecycleManager
  let mockConnectionStore: ConnectionStore
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
      reconnectInitialDelayMs: 100, // 100ms for tests
      reconnectMaxDelayMs: 1000, // 1s max for tests
      maxReconnectAttempts: 10,
      autoReconnectOnStartup: true,
    }

    // Mock ConnectionLifecycleManager
    mockLifecycleManager = {
      handleDiscovering: vi.fn(),
    } as unknown as ConnectionLifecycleManager

    // Mock ConnectionStore
    mockConnectionStore = {
      getConnection: vi.fn(async (pubkey: string) => {
        return connections.get(pubkey) ?? null
      }),
      updateConnectionState: vi.fn(async (pubkey: string, state: PeerConnectionState) => {
        const conn = connections.get(pubkey)
        if (conn) {
          conn.state = state
          connections.set(pubkey, conn)
        }
      }),
      incrementReconnectAttempts: vi.fn(async (pubkey: string) => {
        const conn = connections.get(pubkey)
        if (conn) {
          conn.reconnectAttempts++
          connections.set(pubkey, conn)
          return conn.reconnectAttempts
        }
        return 0
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
      getAllConnections: vi.fn(async () => {
        return Array.from(connections.values())
      }),
    } as unknown as ConnectionStore

    handler = new ReconnectionHandler(mockLifecycleManager, mockConnectionStore, config)
  })

  afterEach(() => {
    // Clean up all scheduled reconnections
    handler.cancelAll()
    vi.useRealTimers()
  })

  describe('calculateBackoffDelay', () => {
    it('should use exponential backoff', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.DISCONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      // Test exponential backoff sequence
      // Attempt 0: 2^0 * 100 = 100ms
      // Attempt 1: 2^1 * 100 = 200ms
      // Attempt 2: 2^2 * 100 = 400ms
      // Attempt 3: 2^3 * 100 = 800ms
      // Attempt 4: 2^4 * 100 = 1600ms (capped at 1000ms)

      const delays = []
      for (let i = 0; i < 5; i++) {
        connection.reconnectAttempts = i
        connections.set(ALICE_PUBKEY, connection)

        handler.scheduleReconnection(ALICE_PUBKEY)
        await Promise.resolve() // Let async operations complete

        const tasks = handler.getTasks()
        const task = tasks.get(ALICE_PUBKEY)
        if (task) {
          delays.push(task.scheduledTime - Date.now())
        }

        handler.cancelReconnection(ALICE_PUBKEY)
      }

      // Verify exponential growth (capped at maxDelay)
      expect(delays[0]).toBeGreaterThanOrEqual(90) // ~100ms
      expect(delays[1]).toBeGreaterThanOrEqual(190) // ~200ms
      expect(delays[2]).toBeGreaterThanOrEqual(390) // ~400ms
      expect(delays[3]).toBeGreaterThanOrEqual(790) // ~800ms
      expect(delays[4]).toBeLessThanOrEqual(1010) // Capped at 1000ms
    })
  })

  describe('reconnect', () => {
    it('should transition to DISCOVERING and call handleDiscovering', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.DISCONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      await handler.reconnect(ALICE_PUBKEY)

      // Verify state transitioned to DISCOVERING
      expect(mockConnectionStore.updateConnectionState).toHaveBeenCalledWith(
        ALICE_PUBKEY,
        PeerConnectionState.DISCOVERING
      )

      // Verify handleDiscovering called
      expect(mockLifecycleManager.handleDiscovering).toHaveBeenCalled()
    })

    it('should increment reconnect attempts', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.DISCONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 2,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      await handler.reconnect(ALICE_PUBKEY)

      // Verify attempts incremented
      expect(mockConnectionStore.incrementReconnectAttempts).toHaveBeenCalledWith(ALICE_PUBKEY)
      expect(connections.get(ALICE_PUBKEY)!.reconnectAttempts).toBe(3)
    })

    it('should mark as FAILED after max attempts', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.DISCONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 10, // At max
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      await handler.reconnect(ALICE_PUBKEY)

      // Should mark as FAILED
      expect(mockConnectionStore.updateConnectionState).toHaveBeenCalledWith(
        ALICE_PUBKEY,
        PeerConnectionState.FAILED
      )

      // Should NOT call handleDiscovering
      expect(mockLifecycleManager.handleDiscovering).not.toHaveBeenCalled()
    })

    it('should throw error if connection not found', async () => {
      await expect(handler.reconnect(BOB_PUBKEY)).rejects.toThrow('Connection not found')
    })
  })

  describe('reconnectAll', () => {
    it('should reconnect all disconnected peers in priority order', async () => {
      const conn1: PeerConnection = {
        id: 'conn-1',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.DISCONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: null,
        priority: 5, // Medium priority
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      const conn2: PeerConnection = {
        id: 'conn-2',
        nostrPubkey: BOB_PUBKEY,
        ilpAddress: 'g.btp-nips.bob',
        state: PeerConnectionState.DISCONNECTED,
        endpoint: 'https://bob.example.com',
        baseAddress: '0xBob',
        channelId: null,
        priority: 1, // High priority
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      const conn3: PeerConnection = {
        id: 'conn-3',
        nostrPubkey: CAROL_PUBKEY,
        ilpAddress: 'g.btp-nips.carol',
        state: PeerConnectionState.DISCONNECTED,
        endpoint: 'https://carol.example.com',
        baseAddress: '0xCarol',
        channelId: null,
        priority: 10, // Low priority
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      connections.set(ALICE_PUBKEY, conn1)
      connections.set(BOB_PUBKEY, conn2)
      connections.set(CAROL_PUBKEY, conn3)

      await handler.reconnectAll()

      // Verify all three have scheduled reconnections
      const tasks = handler.getTasks()
      expect(tasks.size).toBe(3)
      expect(tasks.has(ALICE_PUBKEY)).toBe(true)
      expect(tasks.has(BOB_PUBKEY)).toBe(true)
      expect(tasks.has(CAROL_PUBKEY)).toBe(true)
    })

    it('should not reconnect peers already scheduled', async () => {
      const conn: PeerConnection = {
        id: 'conn-1',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.DISCONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, conn)

      // First reconnectAll
      await handler.reconnectAll()

      const tasks1 = handler.getTasks()
      const task1 = tasks1.get(ALICE_PUBKEY)

      // Second reconnectAll
      await handler.reconnectAll()

      const tasks2 = handler.getTasks()
      const task2 = tasks2.get(ALICE_PUBKEY)

      // Should be the same task (not rescheduled)
      expect(task1).toBe(task2)
    })
  })

  describe('scheduleReconnection', () => {
    it('should schedule reconnection with correct delay', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.DISCONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 2, // Attempt 2: should be 2^2 * 100 = 400ms
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      handler.scheduleReconnection(ALICE_PUBKEY)

      // Wait for async operations
      await Promise.resolve()

      const tasks = handler.getTasks()
      const task = tasks.get(ALICE_PUBKEY)

      expect(task).toBeDefined()
      expect(task!.pubkey).toBe(ALICE_PUBKEY)
      expect(task!.attempt).toBe(3) // reconnectAttempts + 1
    })

    it('should cancel existing task before scheduling new one', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.DISCONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      // Schedule first
      handler.scheduleReconnection(ALICE_PUBKEY)
      await Promise.resolve()

      const tasks1 = handler.getTasks()
      const timeoutId1 = tasks1.get(ALICE_PUBKEY)?.timeoutId

      // Schedule again
      connection.reconnectAttempts = 1
      connections.set(ALICE_PUBKEY, connection)
      handler.scheduleReconnection(ALICE_PUBKEY)
      await Promise.resolve()

      const tasks2 = handler.getTasks()
      const timeoutId2 = tasks2.get(ALICE_PUBKEY)?.timeoutId

      // Should have different timeout IDs (old one cancelled, new one created)
      expect(timeoutId1).not.toBe(timeoutId2)
      expect(tasks2.size).toBe(1) // Still only one task
    })
  })

  describe('cancelReconnection', () => {
    it('should cancel scheduled reconnection', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.DISCONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      handler.scheduleReconnection(ALICE_PUBKEY)
      await Promise.resolve()

      const tasks1 = handler.getTasks()
      expect(tasks1.size).toBe(1)

      handler.cancelReconnection(ALICE_PUBKEY)

      const tasks2 = handler.getTasks()
      expect(tasks2.size).toBe(0)
    })

    it('should not throw error if task not found', () => {
      expect(() => handler.cancelReconnection(BOB_PUBKEY)).not.toThrow()
    })
  })

  describe('reconnectOnStartup', () => {
    it('should mark active connections as DISCONNECTED and schedule reconnection', async () => {
      const conn1: PeerConnection = {
        id: 'conn-1',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: 'channel-123',
        priority: 1,
        lastHeartbeat: Date.now(),
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      const conn2: PeerConnection = {
        id: 'conn-2',
        nostrPubkey: BOB_PUBKEY,
        ilpAddress: 'g.btp-nips.bob',
        state: PeerConnectionState.CONNECTING,
        endpoint: 'https://bob.example.com',
        baseAddress: '0xBob',
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      const conn3: PeerConnection = {
        id: 'conn-3',
        nostrPubkey: CAROL_PUBKEY,
        ilpAddress: 'g.btp-nips.carol',
        state: PeerConnectionState.FAILED, // Should NOT be reconnected
        endpoint: 'https://carol.example.com',
        baseAddress: '0xCarol',
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 10,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      connections.set(ALICE_PUBKEY, conn1)
      connections.set(BOB_PUBKEY, conn2)
      connections.set(CAROL_PUBKEY, conn3)

      await handler.reconnectOnStartup()

      // Verify CONNECTED and CONNECTING marked as DISCONNECTED
      expect(connections.get(ALICE_PUBKEY)!.state).toBe(PeerConnectionState.DISCONNECTED)
      expect(connections.get(BOB_PUBKEY)!.state).toBe(PeerConnectionState.DISCONNECTED)
      expect(connections.get(CAROL_PUBKEY)!.state).toBe(PeerConnectionState.FAILED) // Unchanged

      // Verify reconnections scheduled (only for Alice and Bob)
      await Promise.resolve()
      const tasks = handler.getTasks()
      expect(tasks.size).toBe(2)
      expect(tasks.has(ALICE_PUBKEY)).toBe(true)
      expect(tasks.has(BOB_PUBKEY)).toBe(true)
      expect(tasks.has(CAROL_PUBKEY)).toBe(false)
    })

    it('should skip if autoReconnectOnStartup disabled', async () => {
      const configDisabled = {
        ...config,
        autoReconnectOnStartup: false,
      }

      const handlerDisabled = new ReconnectionHandler(
        mockLifecycleManager,
        mockConnectionStore,
        configDisabled
      )

      const conn: PeerConnection = {
        id: 'conn-1',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: 'channel-123',
        priority: 1,
        lastHeartbeat: Date.now(),
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, conn)

      await handlerDisabled.reconnectOnStartup()

      // Should NOT change state or schedule reconnection
      expect(connections.get(ALICE_PUBKEY)!.state).toBe(PeerConnectionState.CONNECTED)

      const tasks = handlerDisabled.getTasks()
      expect(tasks.size).toBe(0)
    })
  })

  describe('cancelAll', () => {
    it('should cancel all scheduled reconnections', async () => {
      const conn1: PeerConnection = {
        id: 'conn-1',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.DISCONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      const conn2: PeerConnection = {
        id: 'conn-2',
        nostrPubkey: BOB_PUBKEY,
        ilpAddress: 'g.btp-nips.bob',
        state: PeerConnectionState.DISCONNECTED,
        endpoint: 'https://bob.example.com',
        baseAddress: '0xBob',
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      connections.set(ALICE_PUBKEY, conn1)
      connections.set(BOB_PUBKEY, conn2)

      handler.scheduleReconnection(ALICE_PUBKEY)
      handler.scheduleReconnection(BOB_PUBKEY)
      await Promise.resolve()

      const tasks1 = handler.getTasks()
      expect(tasks1.size).toBe(2)

      handler.cancelAll()

      const tasks2 = handler.getTasks()
      expect(tasks2.size).toBe(0)
    })
  })
})
