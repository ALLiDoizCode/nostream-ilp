import type { NostrEvent, DatabaseInstance } from './types'

/**
 * Generate random hex string
 */
function randomHex(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Generate a test Nostr event with mock signature
 * NOTE: This creates events with fake signatures for testing repository/handler logic.
 * For integration tests that validate actual Nostr signatures, use nostr-tools or
 * resolve the @noble/hashes vitest import issue.
 */
export function generateTestEvent(
  options: {
    kind?: number
    content?: string
    tags?: string[][]
    created_at?: number
  } = {},
): NostrEvent {
  const event = {
    id: randomHex(32), // Mock event ID (32 bytes = 64 hex chars)
    pubkey: randomHex(32), // Mock pubkey (32 bytes)
    created_at: options.created_at ?? Math.floor(Date.now() / 1000),
    kind: options.kind ?? 1,
    tags: options.tags ?? [],
    content: options.content ?? 'test event',
    sig: randomHex(64), // Mock signature (64 bytes = 128 hex chars)
  }

  return event
}

/**
 * Alias for generateTestEvent (for consistency with other test utilities)
 */
export const createTestEvent = generateTestEvent

/**
 * Create a test database with nostr_events table
 * Returns a mock DatabaseInstance for testing
 */
export function createTestDatabase(): DatabaseInstance {
  // Create mock database that implements the DatabaseInstance interface
  // For integration tests, this mocks the SQLite database
  const storage = new Map<string, NostrEvent>()

  const mockDb = {
    raw: {
      prepare: (_sql: string) => {
        return {
          run: (..._params: unknown[]) => {
            // Mock SQL execution
            // No-op for mock - actual storage handled in EventRepository
            return { changes: 1, lastInsertRowid: 1 }
          },
          get: (..._params: unknown[]) => {
            // Mock SELECT query - simplified mock without actual SQL parsing
            return undefined
          },
          all: (..._params: unknown[]) => {
            // Mock SELECT query for all events
            return Array.from(storage.values()).map((event) => ({
              id: event.id,
              pubkey: event.pubkey,
              created_at: event.created_at,
              kind: event.kind,
              tags: JSON.stringify(event.tags),
              content: event.content,
              sig: event.sig,
              received_at: Date.now(),
              source_peer: 'test',
            }))
          },
        }
      },
      exec: (_sql: string) => {
        // Mock table creation and other DDL
        return undefined
      },
    } as unknown,
    // Internal storage for mock (not part of DatabaseInstance interface)
    _storage: storage,
  } as DatabaseInstance & { _storage: Map<string, NostrEvent> }

  // Create table (no-op for mock)
  mockDb.raw.exec?.(`
    CREATE TABLE IF NOT EXISTS nostr_events (
      id TEXT PRIMARY KEY,
      pubkey TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      kind INTEGER NOT NULL,
      tags TEXT NOT NULL,
      content TEXT NOT NULL,
      sig TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      source_peer TEXT NOT NULL
    )
  `)

  return mockDb
}
