import {
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectionLifecycleManager } from '../../../src/btp-nips/peer-discovery/connection-lifecycle.js'

import type { AddressResolver } from '../../../src/btp-nips/peer-discovery/address-resolver.js'
import type { ConnectionStore } from '../../../src/btp-nips/peer-discovery/connection-store.js'
import type { DassieClient } from '../../../src/services/payment/dassie-client.js'
import type { ILPPeerInfo } from '../../../src/btp-nips/types/ilp-peer-info.js'
import type { PaymentChannelManager } from '../../../src/btp-nips/peer-discovery/payment-channel-manager.js'

/**
 * Unit Tests for ConnectionLifecycleManager
 * Story 6.5: Peer Connection Lifecycle (Task 9)
 */


  type ChannelNeededEvent,
  type ConnectionStateChangeEvent,
  type PeerConnection,
  PeerConnectionState,
} from '../../../src/btp-nips/types/peer-connection.js'

// Test pubkeys (64 characters each)
const ALICE_PUBKEY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const BOB_PUBKEY = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

describe('ConnectionLifecycleManager', () => {
  let manager: ConnectionLifecycleManager
  let mockAddressResolver: AddressResolver
  let mockConnectionStore: ConnectionStore
  let mockChannelManager: PaymentChannelManager
  let mockDassieClient: DassieClient

  // In-memory connection storage for tests
  const connections = new Map<string, PeerConnection>()

  beforeEach(() => {
    connections.clear()

    // Mock AddressResolver
    mockAddressResolver = {
      resolveIlpAddress: vi.fn(),
    } as unknown as AddressResolver

    // Mock ConnectionStore
    mockConnectionStore = {
      createConnection: vi.fn(async (conn: PeerConnection) => {
        connections.set(conn.nostrPubkey, conn)
      }),
      getConnection: vi.fn(async (pubkey: string) => {
        return connections.get(pubkey) ?? null
      }),
      updateConnectionState: vi.fn(async (pubkey: string, state: PeerConnectionState) => {
        const conn = connections.get(pubkey)
        if (conn) {
          conn.state = state
          conn.updatedAt = Date.now()
          connections.set(pubkey, conn)
        }
      }),
      updateConnection: vi.fn(async (pubkey: string, updates: Partial<PeerConnection>) => {
        const conn = connections.get(pubkey)
        if (conn) {
          Object.assign(conn, updates)
          conn.updatedAt = Date.now()
          connections.set(pubkey, conn)
        }
      }),
      resetReconnectAttempts: vi.fn(async (pubkey: string) => {
        const conn = connections.get(pubkey)
        if (conn) {
          conn.reconnectAttempts = 0
          connections.set(pubkey, conn)
        }
      }),
    } as unknown as ConnectionStore

    // Mock PaymentChannelManager
    mockChannelManager = {
      hasChannel: vi.fn(),
      getChannelByPeer: vi.fn(),
      getChannelState: vi.fn(),
    } as unknown as PaymentChannelManager

    // Mock DassieClient
    mockDassieClient = {} as DassieClient

    manager = new ConnectionLifecycleManager(
      mockAddressResolver,
      mockConnectionStore,
      mockChannelManager,
      mockDassieClient
    )
  })

  describe('connect', () => {
    it('should create connection in DISCOVERING state', async () => {
      // Mock peer not found to prevent automatic state transitions
      vi.mocked(mockAddressResolver.resolveIlpAddress).mockResolvedValue(null)

      await manager.connect(ALICE_PUBKEY, 1)

      // Verify connection created
      const conn = connections.get(ALICE_PUBKEY)
      expect(conn).toBeDefined()
      expect(conn!.state).toBe(PeerConnectionState.DISCOVERING)
      expect(conn!.priority).toBe(1)
      expect(conn!.nostrPubkey).toBe(ALICE_PUBKEY)
    })

    it('should skip if connection already exists', async () => {
      // Create existing connection
      const existing: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: null,
        state: PeerConnectionState.CONNECTED,
        endpoint: null,
        baseAddress: null,
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, existing)

      const createSpy = vi.mocked(mockConnectionStore.createConnection)

      await manager.connect(ALICE_PUBKEY, 1)

      // Should not create new connection
      expect(createSpy).not.toHaveBeenCalled()
    })

    it('should transition to CONNECTING when peer found', async () => {
      const peerInfo: ILPPeerInfo = {
        ilpAddress: 'g.btp-nips.alice',
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        minChannelSize: '0.01',
        subscriberCount: 100,
        avgLatencyMs: 50,
        lastAnnouncement: Date.now(),
      }

      vi.mocked(mockAddressResolver.resolveIlpAddress).mockResolvedValue(peerInfo)
      vi.mocked(mockChannelManager.hasChannel).mockResolvedValue(false)

      await manager.connect(ALICE_PUBKEY, 1)

      // Wait for async state transitions
      await new Promise(resolve => setTimeout(resolve, 100))

      const conn = connections.get(ALICE_PUBKEY)
      expect(conn!.state).toBe(PeerConnectionState.CHANNEL_NEEDED)
      expect(conn!.ilpAddress).toBe('g.btp-nips.alice')
      expect(conn!.endpoint).toBe('https://alice.example.com')
      expect(conn!.baseAddress).toBe('0xAlice')
    })

    it('should transition to CONNECTED when peer found with channel', async () => {
      const peerInfo: ILPPeerInfo = {
        ilpAddress: 'g.btp-nips.alice',
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        minChannelSize: '0.01',
        subscriberCount: 100,
        avgLatencyMs: 50,
        lastAnnouncement: Date.now(),
      }

      vi.mocked(mockAddressResolver.resolveIlpAddress).mockResolvedValue(peerInfo)
      vi.mocked(mockChannelManager.hasChannel).mockResolvedValue(true)
      vi.mocked(mockChannelManager.getChannelByPeer).mockResolvedValue({
        channelId: 'channel-123',
        balance: '1.0',
        status: 'open',
      })

      await manager.connect(ALICE_PUBKEY, 1)

      // Wait for async state transitions
      await new Promise(resolve => setTimeout(resolve, 100))

      const conn = connections.get(ALICE_PUBKEY)
      expect(conn!.state).toBe(PeerConnectionState.CONNECTED)
      expect(conn!.channelId).toBe('channel-123')
    })
  })

  describe('transitionTo', () => {
    it('should transition to valid state', async () => {
      // Create connection in DISCOVERING state
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: null,
        state: PeerConnectionState.DISCOVERING,
        endpoint: null,
        baseAddress: null,
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      const stateChangePromise = new Promise<ConnectionStateChangeEvent>((resolve) => {
        manager.once('stateChange', resolve)
      })

      await manager.transitionTo(ALICE_PUBKEY, PeerConnectionState.CONNECTING)

      // Verify state changed
      const conn = connections.get(ALICE_PUBKEY)
      expect(conn!.state).toBe(PeerConnectionState.CONNECTING)

      // Verify event emitted
      const _event = await stateChangePromise
      expect(event.pubkey).toBe(ALICE_PUBKEY)
      expect(event.oldState).toBe(PeerConnectionState.DISCOVERING)
      expect(event.newState).toBe(PeerConnectionState.CONNECTING)
    })

    it('should throw error on invalid transition', async () => {
      // Create connection in DISCOVERING state
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: null,
        state: PeerConnectionState.DISCOVERING,
        endpoint: null,
        baseAddress: null,
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      // DISCOVERING -> CONNECTED is invalid (must go through CONNECTING)
      await expect(
        manager.transitionTo(ALICE_PUBKEY, PeerConnectionState.CONNECTED)
      ).rejects.toThrow('Invalid state transition')
    })

    it('should throw error if connection not found', async () => {
      await expect(
        manager.transitionTo(BOB_PUBKEY, PeerConnectionState.CONNECTED)
      ).rejects.toThrow('Connection not found')
    })
  })

  describe('handleDiscovering', () => {
    it('should transition to FAILED when peer not found', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: null,
        state: PeerConnectionState.DISCOVERING,
        endpoint: null,
        baseAddress: null,
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      vi.mocked(mockAddressResolver.resolveIlpAddress).mockResolvedValue(null)

      await manager.handleDiscovering(connection)

      const conn = connections.get(ALICE_PUBKEY)
      expect(conn!.state).toBe(PeerConnectionState.FAILED)
    })

    it('should update connection with peer info and transition to CONNECTING', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: null,
        state: PeerConnectionState.DISCOVERING,
        endpoint: null,
        baseAddress: null,
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      const peerInfo: ILPPeerInfo = {
        ilpAddress: 'g.btp-nips.alice',
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        minChannelSize: '0.01',
        subscriberCount: 100,
        avgLatencyMs: 50,
        lastAnnouncement: Date.now(),
      }

      vi.mocked(mockAddressResolver.resolveIlpAddress).mockResolvedValue(peerInfo)
      vi.mocked(mockChannelManager.hasChannel).mockResolvedValue(false)

      await manager.handleDiscovering(connection)

      // Wait for async state transitions
      await new Promise(resolve => setTimeout(resolve, 100))

      const conn = connections.get(ALICE_PUBKEY)
      expect(conn!.ilpAddress).toBe('g.btp-nips.alice')
      expect(conn!.endpoint).toBe('https://alice.example.com')
      expect(conn!.baseAddress).toBe('0xAlice')
      expect(conn!.state).toBe(PeerConnectionState.CHANNEL_NEEDED)
    })
  })

  describe('handleConnecting', () => {
    it('should transition to CONNECTED when channel exists', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTING,
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

      vi.mocked(mockChannelManager.hasChannel).mockResolvedValue(true)
      vi.mocked(mockChannelManager.getChannelByPeer).mockResolvedValue({
        channelId: 'channel-123',
        balance: '1.0',
        status: 'open',
      })

      await manager.handleConnecting(connection)

      // Wait for async state transitions
      await new Promise(resolve => setTimeout(resolve, 100))

      const conn = connections.get(ALICE_PUBKEY)
      expect(conn!.state).toBe(PeerConnectionState.CONNECTED)
      expect(conn!.channelId).toBe('channel-123')
      expect(conn!.reconnectAttempts).toBe(0) // Should be reset
    })

    it('should transition to CHANNEL_NEEDED when no channel', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTING,
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

      vi.mocked(mockChannelManager.hasChannel).mockResolvedValue(false)

      await manager.handleConnecting(connection)

      // Wait for async state transitions
      await new Promise(resolve => setTimeout(resolve, 100))

      const conn = connections.get(ALICE_PUBKEY)
      expect(conn!.state).toBe(PeerConnectionState.CHANNEL_NEEDED)
    })

    it('should throw error if ILP address not set', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: null, // Missing
        state: PeerConnectionState.CONNECTING,
        endpoint: null,
        baseAddress: null,
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      await manager.handleConnecting(connection)

      // Should transition to FAILED on error
      const conn = connections.get(ALICE_PUBKEY)
      expect(conn!.state).toBe(PeerConnectionState.FAILED)
    })
  })

  describe('handleChannelNeeded', () => {
    it('should emit channelNeeded event', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CHANNEL_NEEDED,
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

      const channelNeededPromise = new Promise<ChannelNeededEvent>((resolve) => {
        manager.once('channelNeeded', resolve)
      })

      await manager.handleChannelNeeded(connection)

      const _event = await channelNeededPromise
      expect(event.pubkey).toBe(ALICE_PUBKEY)
      expect(event.baseAddress).toBe('0xAlice')
      expect(event.estimatedCost).toBeDefined()
    })

    it('should throw error if baseAddress not set', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CHANNEL_NEEDED,
        endpoint: 'https://alice.example.com',
        baseAddress: null, // Missing
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      await manager.handleChannelNeeded(connection)

      // Should transition to FAILED on error
      const conn = connections.get(ALICE_PUBKEY)
      expect(conn!.state).toBe(PeerConnectionState.FAILED)
    })
  })

  describe('handleConnected', () => {
    it('should reset reconnection attempts and emit connected event', async () => {
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
        reconnectAttempts: 5, // Should be reset
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      const connectedPromise = new Promise<any>((resolve) => {
        manager.once('connected', resolve)
      })

      await manager.handleConnected(connection)

      // Verify reconnect attempts reset
      expect(vi.mocked(mockConnectionStore.resetReconnectAttempts)).toHaveBeenCalledWith(ALICE_PUBKEY)

      // Verify event emitted
      const _event = await connectedPromise
      expect(event.pubkey).toBe(ALICE_PUBKEY)
      expect(event.timestamp).toBeDefined()
    })
  })

  describe('disconnect', () => {
    it('should transition to DISCONNECTED', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: 'g.btp-nips.alice',
        state: PeerConnectionState.CONNECTED,
        endpoint: 'https://alice.example.com',
        baseAddress: '0xAlice',
        channelId: 'channel-123',
        priority: 1,
        lastHeartbeat: Date.now(),
        reconnectAttempts: 0,
        subscriptionIds: ['sub-1', 'sub-2'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      connections.set(ALICE_PUBKEY, connection)

      await manager.disconnect(ALICE_PUBKEY)

      const conn = connections.get(ALICE_PUBKEY)
      expect(conn!.state).toBe(PeerConnectionState.DISCONNECTED)
    })
  })
})
