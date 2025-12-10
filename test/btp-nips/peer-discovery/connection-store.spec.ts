import { beforeEach, describe, expect, it } from 'vitest'
import { ConnectionStore } from '../../../src/btp-nips/peer-discovery/connection-store.js'
import { type PeerConnection, PeerConnectionState } from '../../../src/btp-nips/types/peer-connection.js'

import type { Knex } from 'knex'
import type { CacheClient } from '../../../src/@types/cache.js'

/**
 * Unit Tests for ConnectionStore
 * Story 6.5: Peer Connection Lifecycle (Task 8)
 */



// Test pubkeys (64 characters each)
const ALICE_PUBKEY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const BOB_PUBKEY = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

// Mock cache client
class MockCacheClient implements CacheClient {
  private data = new Map<string, { value: string; expiresAt: number }>()

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000
    this.data.set(key, { value, expiresAt })
  }

  async get(key: string): Promise<string | null> {
    const entry = this.data.get(key)
    if (!entry) return null
    if (entry.expiresAt < Date.now()) {
      this.data.delete(key)
      return null
    }
    return entry.value
  }

  async del(keys: string | string[]): Promise<number> {
    const keyArray = Array.isArray(keys) ? keys : [keys]
    let deleted = 0
    for (const key of keyArray) {
      if (this.data.delete(key)) {
        deleted++
      }
    }
    return deleted
  }

  // Method to clear all data for tests
  clear(): void {
    this.data.clear()
  }
}

// Mock Knex database
class MockKnex {
  private tables = new Map<string, Map<string, any>>()

  constructor() {
    this.tables.set('peer_connections', new Map())
  }

  // Get table for operations
  private getTable(tableName: string): Map<string, any> {
    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, new Map())
    }
    return this.tables.get(tableName)!
  }

  // Clear all tables
  clear(): void {
    this.tables.forEach(table => table.clear())
  }

  // Table accessor
  call(tableName: string): any {
    const table = this.getTable(tableName)
    const filters: any = { table }

    const createQueryChain = (currentFilters: any): any => ({
      insert: async (data: any) => {
        const table = currentFilters.table
        // Check for unique constraint on nostr_pubkey
        for (const [, row] of table) {
          if (row.nostr_pubkey === data.nostr_pubkey) {
            throw new Error('duplicate key value violates unique constraint')
          }
        }
        table.set(data.id, data)
        return [data.id]
      },

      where: (conditions: any) => {
        currentFilters.where = conditions
        return createQueryChain(currentFilters)
      },

      first: async () => {
        const table = currentFilters.table
        const where = currentFilters.where

        if (!where) {
          // Return first row if no conditions
          const firstEntry = table.values().next()
          return firstEntry.done ? null : firstEntry.value
        }

        // Apply where conditions
        for (const [, row] of table) {
          let matches = true
          for (const [key, value] of Object.entries(where)) {
            if (row[key] !== value) {
              matches = false
              break
            }
          }
          if (matches) {
            return row
          }
        }
        return null
      },

      select: (...cols: string[]) => {
        currentFilters.selectCols = cols
        return createQueryChain(currentFilters)
      },

      update: async (data: any) => {
        const table = currentFilters.table
        const where = currentFilters.where
        let updated = 0

        for (const [id, row] of table) {
          let matches = true
          if (where) {
            for (const [key, value] of Object.entries(where)) {
              if (row[key] !== value) {
                matches = false
                break
              }
            }
          }
          if (matches) {
            Object.assign(row, data)
            table.set(id, row)
            updated++
          }
        }
        return updated
      },

      del: async () => {
        const table = currentFilters.table
        const where = currentFilters.where
        let deleted = 0

        const keysToDelete: string[] = []
        for (const [id, row] of table) {
          let matches = true
          if (where) {
            for (const [key, value] of Object.entries(where)) {
              if (row[key] !== value) {
                matches = false
                break
              }
            }
          }
          if (matches) {
            keysToDelete.push(id)
            deleted++
          }
        }

        keysToDelete.forEach(key => table.delete(key))
        return deleted
      },

      then: async (resolve: any) => {
        const table = currentFilters.table
        const where = currentFilters.where
        const results: any[] = []

        for (const [, row] of table) {
          let matches = true
          if (where) {
            for (const [key, value] of Object.entries(where)) {
              if (row[key] !== value) {
                matches = false
                break
              }
            }
          }
          if (matches) {
            results.push(row)
          }
        }

        resolve(results)
      },
    })

    return createQueryChain(filters)
  }
}

describe('ConnectionStore', () => {
  let store: ConnectionStore
  let mockDb: MockKnex
  let mockCache: MockCacheClient

  beforeEach(() => {
    mockDb = new MockKnex()
    mockCache = new MockCacheClient()

    // Create store with mock dependencies
    store = new ConnectionStore(
      mockDb.call.bind(mockDb) as unknown as Knex,
      mockDb.call.bind(mockDb) as unknown as Knex,
      mockCache as unknown as CacheClient
    )
  })

  describe('createConnection', () => {
    it('should create a connection and cache it', async () => {
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

      await store.createConnection(connection)

      // Verify connection is in database
      const retrieved = await store.getConnection(ALICE_PUBKEY)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.nostrPubkey).toBe(ALICE_PUBKEY)
      expect(retrieved!.state).toBe(PeerConnectionState.DISCOVERING)
      expect(retrieved!.priority).toBe(1)
    })

    it('should throw error on duplicate pubkey', async () => {
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

      await store.createConnection(connection)

      // Attempt to create duplicate
      const duplicate: PeerConnection = {
        ...connection,
        id: 'conn-456', // Different ID but same pubkey
      }

      await expect(store.createConnection(duplicate)).rejects.toThrow(
        `Connection already exists for pubkey: ${ALICE_PUBKEY}`
      )
    })
  })

  describe('getConnection', () => {
    it('should retrieve connection from database', async () => {
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

      await store.createConnection(connection)

      const retrieved = await store.getConnection(ALICE_PUBKEY)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.nostrPubkey).toBe(ALICE_PUBKEY)
      expect(retrieved!.ilpAddress).toBe('g.btp-nips.alice')
      expect(retrieved!.state).toBe(PeerConnectionState.CONNECTED)
      expect(retrieved!.subscriptionIds).toEqual(['sub-1', 'sub-2'])
    })

    it('should return null for non-existent connection', async () => {
      const retrieved = await store.getConnection(BOB_PUBKEY)
      expect(retrieved).toBeNull()
    })

    it('should use cache on second retrieval', async () => {
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

      await store.createConnection(connection)

      // First retrieval - should cache
      await store.getConnection(ALICE_PUBKEY)

      // Clear database to verify cache is used
      mockDb.clear()

      // Second retrieval - should use cache
      const retrieved = await store.getConnection(ALICE_PUBKEY)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.nostrPubkey).toBe(ALICE_PUBKEY)
    })
  })

  describe('updateConnectionState', () => {
    it('should update connection state and invalidate cache', async () => {
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

      await store.createConnection(connection)

      // Update state
      await store.updateConnectionState(ALICE_PUBKEY, PeerConnectionState.CONNECTED)

      // Verify state changed
      const retrieved = await store.getConnection(ALICE_PUBKEY)
      expect(retrieved!.state).toBe(PeerConnectionState.CONNECTED)
    })

    it('should throw error if connection not found', async () => {
      await expect(
        store.updateConnectionState(BOB_PUBKEY, PeerConnectionState.CONNECTED)
      ).rejects.toThrow(`Connection not found for pubkey: ${BOB_PUBKEY}`)
    })
  })

  describe('updateLastHeartbeat', () => {
    it('should update last heartbeat timestamp', async () => {
      const connection: PeerConnection = {
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

      await store.createConnection(connection)

      // Update heartbeat
      await store.updateLastHeartbeat(ALICE_PUBKEY)

      // Verify timestamp updated
      const retrieved = await store.getConnection(ALICE_PUBKEY)
      expect(retrieved!.lastHeartbeat).not.toBeNull()
      expect(retrieved!.lastHeartbeat).toBeGreaterThanOrEqual(connection.createdAt)
    })

    it('should throw error if connection not found', async () => {
      await expect(store.updateLastHeartbeat(BOB_PUBKEY)).rejects.toThrow(
        `Connection not found for pubkey: ${BOB_PUBKEY}`
      )
    })
  })

  describe('getAllConnections', () => {
    it('should return all connections', async () => {
      const conn1: PeerConnection = {
        id: 'conn-1',
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

      const conn2: PeerConnection = {
        id: 'conn-2',
        nostrPubkey: BOB_PUBKEY,
        ilpAddress: null,
        state: PeerConnectionState.DISCONNECTED,
        endpoint: null,
        baseAddress: null,
        channelId: null,
        priority: 5,
        lastHeartbeat: null,
        reconnectAttempts: 2,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      await store.createConnection(conn1)
      await store.createConnection(conn2)

      const all = await store.getAllConnections()
      expect(all).toHaveLength(2)
      expect(all.find(c => c.nostrPubkey === ALICE_PUBKEY)).toBeDefined()
      expect(all.find(c => c.nostrPubkey === BOB_PUBKEY)).toBeDefined()
    })

    it('should return empty array when no connections', async () => {
      const all = await store.getAllConnections()
      expect(all).toHaveLength(0)
    })
  })

  describe('getConnectionsByState', () => {
    it('should return connections filtered by state', async () => {
      const conn1: PeerConnection = {
        id: 'conn-1',
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

      const conn2: PeerConnection = {
        id: 'conn-2',
        nostrPubkey: BOB_PUBKEY,
        ilpAddress: null,
        state: PeerConnectionState.DISCONNECTED,
        endpoint: null,
        baseAddress: null,
        channelId: null,
        priority: 5,
        lastHeartbeat: null,
        reconnectAttempts: 2,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      await store.createConnection(conn1)
      await store.createConnection(conn2)

      const disconnected = await store.getConnectionsByState(PeerConnectionState.DISCONNECTED)
      expect(disconnected).toHaveLength(1)
      expect(disconnected[0].nostrPubkey).toBe(BOB_PUBKEY)

      const connected = await store.getConnectionsByState(PeerConnectionState.CONNECTED)
      expect(connected).toHaveLength(1)
      expect(connected[0].nostrPubkey).toBe(ALICE_PUBKEY)
    })
  })

  describe('updatePriority', () => {
    it('should update connection priority', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: null,
        state: PeerConnectionState.CONNECTED,
        endpoint: null,
        baseAddress: null,
        channelId: null,
        priority: 10,
        lastHeartbeat: null,
        reconnectAttempts: 0,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      await store.createConnection(connection)

      // Update priority
      await store.updatePriority(ALICE_PUBKEY, 1)

      // Verify priority changed
      const retrieved = await store.getConnection(ALICE_PUBKEY)
      expect(retrieved!.priority).toBe(1)
    })

    it('should throw error if connection not found', async () => {
      await expect(store.updatePriority(BOB_PUBKEY, 1)).rejects.toThrow(
        `Connection not found for pubkey: ${BOB_PUBKEY}`
      )
    })
  })

  describe('incrementReconnectAttempts', () => {
    it('should increment reconnection attempts counter', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: null,
        state: PeerConnectionState.DISCONNECTED,
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

      await store.createConnection(connection)

      // Increment attempts
      const attempts1 = await store.incrementReconnectAttempts(ALICE_PUBKEY)
      expect(attempts1).toBe(1)

      const attempts2 = await store.incrementReconnectAttempts(ALICE_PUBKEY)
      expect(attempts2).toBe(2)

      // Verify in database
      const retrieved = await store.getConnection(ALICE_PUBKEY)
      expect(retrieved!.reconnectAttempts).toBe(2)
    })

    it('should throw error if connection not found', async () => {
      await expect(store.incrementReconnectAttempts(BOB_PUBKEY)).rejects.toThrow(
        `Connection not found for pubkey: ${BOB_PUBKEY}`
      )
    })
  })

  describe('resetReconnectAttempts', () => {
    it('should reset reconnection attempts to 0', async () => {
      const connection: PeerConnection = {
        id: 'conn-123',
        nostrPubkey: ALICE_PUBKEY,
        ilpAddress: null,
        state: PeerConnectionState.DISCONNECTED,
        endpoint: null,
        baseAddress: null,
        channelId: null,
        priority: 1,
        lastHeartbeat: null,
        reconnectAttempts: 5,
        subscriptionIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }

      await store.createConnection(connection)

      // Reset attempts
      await store.resetReconnectAttempts(ALICE_PUBKEY)

      // Verify reset
      const retrieved = await store.getConnection(ALICE_PUBKEY)
      expect(retrieved!.reconnectAttempts).toBe(0)
    })

    it('should throw error if connection not found', async () => {
      await expect(store.resetReconnectAttempts(BOB_PUBKEY)).rejects.toThrow(
        `Connection not found for pubkey: ${BOB_PUBKEY}`
      )
    })
  })

  describe('updateConnection', () => {
    it('should update multiple connection fields', async () => {
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

      await store.createConnection(connection)

      // Update multiple fields
      await store.updateConnection(ALICE_PUBKEY, {
        ilpAddress: 'g.btp-nips.alice',
        channelId: 'channel-123',
        state: PeerConnectionState.CONNECTED,
        subscriptionIds: ['sub-1', 'sub-2'],
      })

      // Verify updates
      const retrieved = await store.getConnection(ALICE_PUBKEY)
      expect(retrieved!.ilpAddress).toBe('g.btp-nips.alice')
      expect(retrieved!.channelId).toBe('channel-123')
      expect(retrieved!.state).toBe(PeerConnectionState.CONNECTED)
      expect(retrieved!.subscriptionIds).toEqual(['sub-1', 'sub-2'])
    })

    it('should throw error if connection not found', async () => {
      await expect(
        store.updateConnection(BOB_PUBKEY, { state: PeerConnectionState.CONNECTED })
      ).rejects.toThrow(`Connection not found for pubkey: ${BOB_PUBKEY}`)
    })
  })

  describe('deleteConnection', () => {
    it('should delete connection and invalidate cache', async () => {
      const connection: PeerConnection = {
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

      await store.createConnection(connection)

      // Verify exists
      const beforeDelete = await store.getConnection(ALICE_PUBKEY)
      expect(beforeDelete).not.toBeNull()

      // Delete
      await store.deleteConnection(ALICE_PUBKEY)

      // Verify deleted
      const afterDelete = await store.getConnection(ALICE_PUBKEY)
      expect(afterDelete).toBeNull()
    })

    it('should throw error if connection not found', async () => {
      await expect(store.deleteConnection(BOB_PUBKEY)).rejects.toThrow(
        `Connection not found for pubkey: ${BOB_PUBKEY}`
      )
    })
  })
})
