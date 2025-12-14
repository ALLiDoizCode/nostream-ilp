import { getMasterDbClient, getReadReplicaDbClient } from '../../database/client.js'
import { PeerConnection, PeerConnectionState } from '../types/peer-connection.js'
import { getCacheClient } from '../../cache/client.js'
import { createLogger } from '../../factories/logger-factory.js'

import type { CacheClient } from '../../@types/cache.js'
import type { Knex } from 'knex'

/**
 * Connection Store Module
 *
 * Provides storage for peer connection state with PostgreSQL persistence
 * and optional Redis caching for performance.
 *
 * @module btp-nips/peer-discovery/connection-store
 */



const debug = createLogger('btp-nips:connection-store')

/**
 * Database row representation of peer connection
 */
interface PeerConnectionRow {
  id: string
  nostr_pubkey: string
  ilp_address: string | null
  endpoint: string | null
  base_address: string | null
  channel_id: string | null
  state: PeerConnectionState
  priority: number
  last_heartbeat: string | null  // PostgreSQL bigint as string
  reconnect_attempts: number
  subscription_ids: string  // JSON string
  created_at: string  // PostgreSQL bigint as string
  updated_at: string  // PostgreSQL bigint as string
}

/**
 * Connection Store
 *
 * Manages storage and retrieval of peer connection state.
 * Uses PostgreSQL for persistence and optional Redis for caching.
 *
 * Cache Strategy:
 * - 5-minute TTL for connection state (frequently changing)
 * - Cache key format: `peer_connection:{pubkey}`
 * - Write-through cache (update DB and cache together)
 *
 * Usage:
 * ```typescript
 * const store = new ConnectionStore();
 *
 * // Create connection
 * await store.createConnection({
 *   id: uuid(),
 *   nostrPubkey: 'alice_pubkey',
 *   ilpAddress: null,
 *   state: PeerConnectionState.DISCOVERING,
 *   // ... other fields
 * });
 *
 * // Get connection
 * const conn = await store.getConnection('alice_pubkey');
 *
 * // Update state
 * await store.updateConnectionState('alice_pubkey', PeerConnectionState.CONNECTED);
 * ```
 */
export class ConnectionStore {
  private writeDb: Knex
  private readDb: Knex
  private cache: CacheClient
  private readonly CACHE_TTL_SECONDS = 300 // 5 minutes in seconds

  /**
   * Create a ConnectionStore instance
   *
   * @param writeDb - Master database client (optional, defaults to getMasterDbClient())
   * @param readDb - Read replica client (optional, defaults to getReadReplicaDbClient())
   * @param cache - Redis client (optional, defaults to getCacheClient())
   */
  constructor(writeDb?: Knex, readDb?: Knex, cache?: CacheClient) {
    this.writeDb = writeDb ?? getMasterDbClient()
    this.readDb = readDb ?? getReadReplicaDbClient()
    this.cache = cache ?? getCacheClient()
  }

  /**
   * Create a new peer connection
   *
   * @param connection - The connection to create
   * @throws {Error} If connection with same pubkey already exists
   *
   * @example
   * ```typescript
   * await store.createConnection({
   *   id: '550e8400-e29b-41d4-a716-446655440000',
   *   nostrPubkey: 'alice_pubkey',
   *   ilpAddress: null,
   *   state: PeerConnectionState.DISCOVERING,
   *   endpoint: null,
   *   baseAddress: null,
   *   channelId: null,
   *   priority: 1,
   *   lastHeartbeat: null,
   *   reconnectAttempts: 0,
   *   subscriptionIds: [],
   *   createdAt: Date.now(),
   *   updatedAt: Date.now()
   * });
   * ```
   */
  async createConnection(connection: PeerConnection): Promise<void> {
    try {
      const row = this.toRow(connection)

      await this.writeDb('peer_connections').insert(row)

      // Cache the new connection
      const cacheKey = this.getCacheKey(connection.nostrPubkey)
      await this.cache.set(cacheKey, JSON.stringify(connection), { EX: this.CACHE_TTL_SECONDS })

      debug('Created connection for peer: %s (state: %s)', connection.nostrPubkey.substring(0, 8), connection.state)
    } catch (error) {
      if (error instanceof Error && error.message.includes('unique constraint')) {
        throw new Error(`Connection already exists for pubkey: ${connection.nostrPubkey}`)
      }
      throw error
    }
  }

  /**
   * Get a peer connection by pubkey
   *
   * Implements cache-aside pattern:
   * 1. Check Redis cache
   * 2. If cache miss, query PostgreSQL
   * 3. Cache the result
   * 4. Return connection
   *
   * @param pubkey - The peer's public key
   * @returns The connection or null if not found
   *
   * @example
   * ```typescript
   * const conn = await store.getConnection('alice_pubkey');
   * if (conn) {
   *   console.log('Connection state:', conn.state);
   * }
   * ```
   */
  async getConnection(pubkey: string): Promise<PeerConnection | null> {
    try {
      const cacheKey = this.getCacheKey(pubkey)

      // Check cache first
      const cachedConn = await this.cache.get(cacheKey)
      if (cachedConn) {
        debug('Cache hit for connection: %s', pubkey.substring(0, 8))
        return JSON.parse(cachedConn)
      }

      // Cache miss - query database
      debug('Cache miss for connection: %s', pubkey.substring(0, 8))

      const row = await this.readDb('peer_connections')
        .where({ nostr_pubkey: pubkey })
        .first<PeerConnectionRow>()

      if (!row) {
        return null
      }

      const connection = this.fromRow(row)

      // Cache the result
      await this.cache.set(cacheKey, JSON.stringify(connection), { EX: this.CACHE_TTL_SECONDS })

      return connection
    } catch (error) {
      debug('Error getting connection for %s: %O', pubkey.substring(0, 8), error)
      throw error
    }
  }

  /**
   * Update the state of a peer connection
   *
   * @param pubkey - The peer's public key
   * @param state - The new connection state
   * @throws {Error} If connection not found
   *
   * @example
   * ```typescript
   * await store.updateConnectionState('alice_pubkey', PeerConnectionState.CONNECTED);
   * ```
   */
  async updateConnectionState(pubkey: string, state: PeerConnectionState): Promise<void> {
    try {
      const updated = await this.writeDb('peer_connections')
        .where({ nostr_pubkey: pubkey })
        .update({ state })

      if (updated === 0) {
        throw new Error(`Connection not found for pubkey: ${pubkey}`)
      }

      // Invalidate cache
      const cacheKey = this.getCacheKey(pubkey)
      await this.cache.del(cacheKey)

      debug('Updated connection state for %s: %s', pubkey.substring(0, 8), state)
    } catch (error) {
      debug('Error updating connection state for %s: %O', pubkey.substring(0, 8), error)
      throw error
    }
  }

  /**
   * Update the last heartbeat timestamp
   *
   * @param pubkey - The peer's public key
   * @throws {Error} If connection not found
   *
   * @example
   * ```typescript
   * await store.updateLastHeartbeat('alice_pubkey');
   * ```
   */
  async updateLastHeartbeat(pubkey: string): Promise<void> {
    try {
      const now = Date.now()

      const updated = await this.writeDb('peer_connections')
        .where({ nostr_pubkey: pubkey })
        .update({ last_heartbeat: now.toString() })

      if (updated === 0) {
        throw new Error(`Connection not found for pubkey: ${pubkey}`)
      }

      // Invalidate cache
      const cacheKey = this.getCacheKey(pubkey)
      await this.cache.del(cacheKey)

      debug('Updated last heartbeat for %s: %d', pubkey.substring(0, 8), now)
    } catch (error) {
      debug('Error updating last heartbeat for %s: %O', pubkey.substring(0, 8), error)
      throw error
    }
  }

  /**
   * Get all peer connections
   *
   * @returns Array of all connections
   *
   * @example
   * ```typescript
   * const allConnections = await store.getAllConnections();
   * console.log('Total connections:', allConnections.length);
   * ```
   */
  async getAllConnections(): Promise<PeerConnection[]> {
    try {
      const rows = await this.readDb('peer_connections')
        .select<PeerConnectionRow[]>('*')

      return rows.map(row => this.fromRow(row))
    } catch (error) {
      debug('Error getting all connections: %O', error)
      throw error
    }
  }

  /**
   * Get connections by state
   *
   * @param state - The connection state to filter by
   * @returns Array of connections in the specified state
   *
   * @example
   * ```typescript
   * const disconnected = await store.getConnectionsByState(PeerConnectionState.DISCONNECTED);
   * console.log('Disconnected peers:', disconnected.length);
   * ```
   */
  async getConnectionsByState(state: PeerConnectionState): Promise<PeerConnection[]> {
    try {
      const rows = await this.readDb('peer_connections')
        .where({ state })
        .select<PeerConnectionRow[]>('*')

      return rows.map(row => this.fromRow(row))
    } catch (error) {
      debug('Error getting connections by state %s: %O', state, error)
      throw error
    }
  }

  /**
   * Update connection priority
   *
   * @param pubkey - The peer's public key
   * @param priority - The new priority (1-10)
   * @throws {Error} If connection not found
   *
   * @example
   * ```typescript
   * await store.updatePriority('alice_pubkey', 1); // Highest priority
   * ```
   */
  async updatePriority(pubkey: string, priority: number): Promise<void> {
    try {
      const updated = await this.writeDb('peer_connections')
        .where({ nostr_pubkey: pubkey })
        .update({ priority })

      if (updated === 0) {
        throw new Error(`Connection not found for pubkey: ${pubkey}`)
      }

      // Invalidate cache
      const cacheKey = this.getCacheKey(pubkey)
      await this.cache.del(cacheKey)

      debug('Updated priority for %s: %d', pubkey.substring(0, 8), priority)
    } catch (error) {
      debug('Error updating priority for %s: %O', pubkey.substring(0, 8), error)
      throw error
    }
  }

  /**
   * Increment reconnection attempts counter
   *
   * @param pubkey - The peer's public key
   * @returns The new reconnection attempts count
   * @throws {Error} If connection not found
   *
   * @example
   * ```typescript
   * const attempts = await store.incrementReconnectAttempts('alice_pubkey');
   * if (attempts >= 10) {
   *   console.log('Max reconnection attempts reached');
   * }
   * ```
   */
  async incrementReconnectAttempts(pubkey: string): Promise<number> {
    try {
      const connection = await this.getConnection(pubkey)
      if (!connection) {
        throw new Error(`Connection not found for pubkey: ${pubkey}`)
      }

      const newAttempts = connection.reconnectAttempts + 1

      await this.writeDb('peer_connections')
        .where({ nostr_pubkey: pubkey })
        .update({ reconnect_attempts: newAttempts })

      // Invalidate cache
      const cacheKey = this.getCacheKey(pubkey)
      await this.cache.del(cacheKey)

      debug('Incremented reconnect attempts for %s: %d', pubkey.substring(0, 8), newAttempts)

      return newAttempts
    } catch (error) {
      debug('Error incrementing reconnect attempts for %s: %O', pubkey.substring(0, 8), error)
      throw error
    }
  }

  /**
   * Reset reconnection attempts counter to 0
   *
   * @param pubkey - The peer's public key
   * @throws {Error} If connection not found
   *
   * @example
   * ```typescript
   * await store.resetReconnectAttempts('alice_pubkey');
   * ```
   */
  async resetReconnectAttempts(pubkey: string): Promise<void> {
    try {
      const updated = await this.writeDb('peer_connections')
        .where({ nostr_pubkey: pubkey })
        .update({ reconnect_attempts: 0 })

      if (updated === 0) {
        throw new Error(`Connection not found for pubkey: ${pubkey}`)
      }

      // Invalidate cache
      const cacheKey = this.getCacheKey(pubkey)
      await this.cache.del(cacheKey)

      debug('Reset reconnect attempts for %s', pubkey.substring(0, 8))
    } catch (error) {
      debug('Error resetting reconnect attempts for %s: %O', pubkey.substring(0, 8), error)
      throw error
    }
  }

  /**
   * Update full connection record
   *
   * @param pubkey - The peer's public key
   * @param updates - Partial connection updates
   * @throws {Error} If connection not found
   *
   * @example
   * ```typescript
   * await store.updateConnection('alice_pubkey', {
   *   ilpAddress: 'g.btp-nips.alice.npub1abc',
   *   channelId: 'channel_123',
   *   state: PeerConnectionState.CONNECTED
   * });
   * ```
   */
  async updateConnection(pubkey: string, updates: Partial<PeerConnection>): Promise<void> {
    try {
      // Remove fields that shouldn't be updated
      const { id: _id, nostrPubkey: _nostrPubkey, createdAt: _createdAt, ...allowedUpdates } = updates

      const row: Partial<PeerConnectionRow> = {}

      if (allowedUpdates.ilpAddress !== undefined) row.ilp_address = allowedUpdates.ilpAddress
      if (allowedUpdates.endpoint !== undefined) row.endpoint = allowedUpdates.endpoint
      if (allowedUpdates.baseAddress !== undefined) row.base_address = allowedUpdates.baseAddress
      if (allowedUpdates.channelId !== undefined) row.channel_id = allowedUpdates.channelId
      if (allowedUpdates.state !== undefined) row.state = allowedUpdates.state
      if (allowedUpdates.priority !== undefined) row.priority = allowedUpdates.priority
      if (allowedUpdates.lastHeartbeat !== undefined) {
        row.last_heartbeat = allowedUpdates.lastHeartbeat?.toString() ?? null
      }
      if (allowedUpdates.reconnectAttempts !== undefined) {
        row.reconnect_attempts = allowedUpdates.reconnectAttempts
      }
      if (allowedUpdates.subscriptionIds !== undefined) {
        row.subscription_ids = JSON.stringify(allowedUpdates.subscriptionIds)
      }

      const updated = await this.writeDb('peer_connections')
        .where({ nostr_pubkey: pubkey })
        .update(row)

      if (updated === 0) {
        throw new Error(`Connection not found for pubkey: ${pubkey}`)
      }

      // Invalidate cache
      const cacheKey = this.getCacheKey(pubkey)
      await this.cache.del(cacheKey)

      debug('Updated connection for %s', pubkey.substring(0, 8))
    } catch (error) {
      debug('Error updating connection for %s: %O', pubkey.substring(0, 8), error)
      throw error
    }
  }

  /**
   * Delete a peer connection
   *
   * @param pubkey - The peer's public key
   * @throws {Error} If connection not found
   *
   * @example
   * ```typescript
   * await store.deleteConnection('alice_pubkey');
   * ```
   */
  async deleteConnection(pubkey: string): Promise<void> {
    try {
      const deleted = await this.writeDb('peer_connections')
        .where({ nostr_pubkey: pubkey })
        .del()

      if (deleted === 0) {
        throw new Error(`Connection not found for pubkey: ${pubkey}`)
      }

      // Invalidate cache
      const cacheKey = this.getCacheKey(pubkey)
      await this.cache.del(cacheKey)

      debug('Deleted connection for %s', pubkey.substring(0, 8))
    } catch (error) {
      debug('Error deleting connection for %s: %O', pubkey.substring(0, 8), error)
      throw error
    }
  }

  /**
   * Convert PeerConnection to database row
   */
  private toRow(connection: PeerConnection): PeerConnectionRow {
    return {
      id: connection.id,
      nostr_pubkey: connection.nostrPubkey,
      ilp_address: connection.ilpAddress,
      endpoint: connection.endpoint,
      base_address: connection.baseAddress,
      channel_id: connection.channelId,
      state: connection.state,
      priority: connection.priority,
      last_heartbeat: connection.lastHeartbeat?.toString() ?? null,
      reconnect_attempts: connection.reconnectAttempts,
      subscription_ids: JSON.stringify(connection.subscriptionIds),
      created_at: connection.createdAt.toString(),
      updated_at: connection.updatedAt.toString(),
    }
  }

  /**
   * Convert database row to PeerConnection
   */
  private fromRow(row: PeerConnectionRow): PeerConnection {
    return {
      id: row.id,
      nostrPubkey: row.nostr_pubkey,
      ilpAddress: row.ilp_address,
      endpoint: row.endpoint,
      baseAddress: row.base_address,
      channelId: row.channel_id,
      state: row.state,
      priority: row.priority,
      lastHeartbeat: row.last_heartbeat ? parseInt(row.last_heartbeat, 10) : null,
      reconnectAttempts: row.reconnect_attempts,
      subscriptionIds: JSON.parse(row.subscription_ids),
      createdAt: parseInt(row.created_at, 10),
      updatedAt: parseInt(row.updated_at, 10),
    }
  }

  /**
   * Get Redis cache key for a pubkey
   */
  private getCacheKey(pubkey: string): string {
    return `peer_connection:${pubkey}`
  }
}
