import type { DatabaseInstance, NostrEvent } from './types'

/**
 * Repository for storing and querying Nostr events
 */
export class EventRepository {
  constructor(private readonly database: DatabaseInstance) {}

  /**
   * Store a Nostr event
   * @param event - Nostr event to store
   * @param sourcePeer - ILP address of the peer who sent this event
   * @returns true if event was inserted, false if duplicate
   */
  store(event: NostrEvent, sourcePeer: string): boolean {
    try {
      const stmt = this.database.raw.prepare(`
        INSERT INTO nostr_events (
          id, pubkey, created_at, kind, tags, content, sig, received_at, source_peer
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      stmt.run(
        event.id,
        event.pubkey,
        event.created_at,
        event.kind,
        JSON.stringify(event.tags),
        event.content,
        event.sig,
        Math.floor(Date.now() / 1000), // received_at (unix timestamp)
        sourcePeer,
      )

      return true
    } catch (error) {
      // SQLite unique constraint violation (duplicate event ID)
      if (
        error instanceof Error &&
        error.message.includes('UNIQUE constraint failed')
      ) {
        return false
      }
      throw error
    }
  }

  /**
   * Check if an event exists by ID
   * @param eventId - Event ID to check
   * @returns true if event exists
   */
  exists(eventId: string): boolean {
    const stmt = this.database.raw.prepare(`
      SELECT 1 FROM nostr_events WHERE id = ? LIMIT 1
    `)
    const row = stmt.get(eventId)
    return row !== undefined
  }

  /**
   * Get an event by ID
   * @param eventId - Event ID to fetch
   * @returns Nostr event or undefined if not found
   */
  getById(eventId: string): NostrEvent | undefined {
    const stmt = this.database.raw.prepare(`
      SELECT id, pubkey, created_at, kind, tags, content, sig
      FROM nostr_events
      WHERE id = ?
    `)
    const row = stmt.get(eventId) as
      | {
          id: string
          pubkey: string
          created_at: number
          kind: number
          tags: string
          content: string
          sig: string
        }
      | undefined

    if (!row) {
      return undefined
    }

    return {
      id: row.id,
      pubkey: row.pubkey,
      created_at: row.created_at,
      kind: row.kind,
      tags: JSON.parse(row.tags) as string[][],
      content: row.content,
      sig: row.sig,
    }
  }

  /**
   * Delete an event by ID (for NIP-09 event deletion)
   * @param eventId - Event ID to delete
   * @returns true if event was deleted, false if not found
   */
  delete(eventId: string): boolean {
    const stmt = this.database.raw.prepare(`
      DELETE FROM nostr_events WHERE id = ?
    `)
    const info = stmt.run(eventId)
    return info.changes > 0
  }

  /**
   * Count total number of events stored
   * @returns Total event count
   */
  count(): number {
    const stmt = this.database.raw.prepare(`
      SELECT COUNT(*) as count FROM nostr_events
    `)
    const row = stmt.get() as { count: number }
    return row.count
  }

  /**
   * Query events by Nostr filter
   * @param filter - Nostr filter (NIP-01)
   * @returns Array of matching Nostr events
   */
  query(filter: import('./types').NostrFilter): NostrEvent[] {
    const conditions: string[] = []
    const params: unknown[] = []

    // Filter by event IDs
    if (filter.ids && filter.ids.length > 0) {
      conditions.push(`id IN (${filter.ids.map(() => '?').join(',')})`)
      params.push(...filter.ids)
    }

    // Filter by authors
    if (filter.authors && filter.authors.length > 0) {
      conditions.push(`pubkey IN (${filter.authors.map(() => '?').join(',')})`)
      params.push(...filter.authors)
    }

    // Filter by kinds
    if (filter.kinds && filter.kinds.length > 0) {
      conditions.push(`kind IN (${filter.kinds.map(() => '?').join(',')})`)
      params.push(...filter.kinds)
    }

    // Filter by since (timestamp >=)
    if (filter.since !== undefined) {
      conditions.push('created_at >= ?')
      params.push(filter.since)
    }

    // Filter by until (timestamp <=)
    if (filter.until !== undefined) {
      conditions.push('created_at <= ?')
      params.push(filter.until)
    }

    // Build WHERE clause
    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    // Build ORDER BY and LIMIT
    const orderBy = 'ORDER BY created_at DESC'
    const limit = filter.limit !== undefined ? `LIMIT ${filter.limit}` : ''

    // Execute query
    const sql = `
      SELECT id, pubkey, created_at, kind, tags, content, sig
      FROM nostr_events
      ${whereClause}
      ${orderBy}
      ${limit}
    `

    const stmt = this.database.raw.prepare(sql)
    const rows = stmt.all(...params) as Array<{
      id: string
      pubkey: string
      created_at: number
      kind: number
      tags: string
      content: string
      sig: string
    }>

    // Parse tags JSON and filter by tag filters
    const events = rows.map((row) => ({
      id: row.id,
      pubkey: row.pubkey,
      created_at: row.created_at,
      kind: row.kind,
      tags: JSON.parse(row.tags) as string[][],
      content: row.content,
      sig: row.sig,
    }))

    // Apply tag filters (e.g., #e, #p)
    return events.filter((event) => {
      for (const [key, value] of Object.entries(filter)) {
        if (key.startsWith('#') && Array.isArray(value)) {
          const tagName = key.slice(1)
          const eventTagValues = event.tags
            .filter((tag) => tag[0] === tagName)
            .map((tag) => tag[1])

          // Check if any of the filter values match
          const hasMatch = value.some((filterValue) =>
            eventTagValues.includes(filterValue),
          )
          if (!hasMatch) {
            return false
          }
        }
      }
      return true
    })
  }
}
