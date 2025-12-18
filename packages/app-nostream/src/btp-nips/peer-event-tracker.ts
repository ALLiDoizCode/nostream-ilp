import createDebug from 'debug'

import type { PacketMetadata } from './utils/ttl-manager'

const debug = createDebug('btp-nips:peer-tracker')

/**
 * Tracks which events have been sent to which peers.
 *
 * Used for routing optimization:
 * 1. Don't send event back to source peer
 * 2. Don't send event to peer who already has it
 *
 * Memory usage: ~10 KB per peer (10,000 events × 32 bytes per event ID)
 * With 100 peers: ~1 MB total
 *
 * @example
 * ```typescript
 * const tracker = new PeerEventTracker();
 *
 * // Mark event sent to Bob
 * tracker.markEventSent('g.dassie.bob', 'event123');
 *
 * // Check if already sent
 * if (tracker.hasSent('g.dassie.bob', 'event123')) {
 *   console.log('Already sent to Bob - skip');
 * }
 *
 * // Get source peer from metadata
 * const sourcePeer = tracker.getSourcePeer(metadata);
 * ```
 */
export class PeerEventTracker {
  /**
   * Maps peer ILP address → Set of event IDs sent to that peer.
   * Example: 'g.dassie.bob' → Set('event1', 'event2', 'event3')
   */
  private peerEvents: Map<string, Set<string>> = new Map()

  /**
   * Maximum events tracked per peer.
   * Prevents unbounded memory growth.
   * Default: 10,000 events per peer
   */
  private readonly maxEventsPerPeer = 10000

  /**
   * Mark event as sent to a peer.
   *
   * @param peerAddress - ILP address of peer (e.g., 'g.dassie.bob')
   * @param eventId - Nostr event ID
   */
  markEventSent(peerAddress: string, eventId: string): void {
    let events = this.peerEvents.get(peerAddress)

    if (!events) {
      events = new Set()
      this.peerEvents.set(peerAddress, events)
    }

    events.add(eventId)

    debug('Marked event %s sent to %s (total: %d events)', eventId.slice(0, 8), peerAddress, events.size)

    // Enforce limit (LRU eviction)
    if (events.size > this.maxEventsPerPeer) {
      this.evictOldestEvent(peerAddress, events)
    }
  }

  /**
   * Check if event has been sent to a peer.
   *
   * @param peerAddress - ILP address of peer
   * @param eventId - Nostr event ID
   * @returns true if event was sent to peer, false otherwise
   */
  hasSent(peerAddress: string, eventId: string): boolean {
    const events = this.peerEvents.get(peerAddress)

    if (!events) {
      return false // Peer not tracked
    }

    return events.has(eventId)
  }

  /**
   * Extract source peer ILP address from packet metadata.
   *
   * Used to prevent sending event back to the peer who sent it.
   *
   * @param metadata - Packet metadata with sender field
   * @returns ILP address of source peer, or null if not present
   */
  getSourcePeer(metadata: PacketMetadata): string | null {
    return metadata.sender || null
  }

  /**
   * Get number of events tracked for a peer.
   *
   * @param peerAddress - ILP address of peer
   * @returns Number of events tracked for peer
   */
  getEventCount(peerAddress: string): number {
    const events = this.peerEvents.get(peerAddress)
    return events ? events.size : 0
  }

  /**
   * Get total number of peers being tracked.
   *
   * @returns Number of peers
   */
  getPeerCount(): number {
    return this.peerEvents.size
  }

  /**
   * Clear all tracking data for a peer.
   * Useful when peer disconnects.
   *
   * @param peerAddress - ILP address of peer
   */
  clearPeer(peerAddress: string): void {
    const deleted = this.peerEvents.delete(peerAddress)

    if (deleted) {
      debug('Cleared tracking data for peer %s', peerAddress)
    }
  }

  /**
   * Clear all tracking data.
   * Useful for testing.
   */
  clear(): void {
    this.peerEvents.clear()
    debug('Cleared all peer tracking data')
  }

  /**
   * Evict oldest event from peer's event set (LRU eviction).
   * Called when maxEventsPerPeer limit is exceeded.
   *
   * Note: Sets don't have a concept of "oldest", so we evict the first item
   * returned by the iterator. For true LRU, we'd need a more complex data structure.
   * This is a simple approximation that works well in practice.
   *
   * @param peerAddress - ILP address of peer
   * @param events - Set of event IDs for peer
   */
  private evictOldestEvent(peerAddress: string, events: Set<string>): void {
    // Get first item (approximation of "oldest")
    const firstEventId = events.values().next().value

    if (firstEventId) {
      events.delete(firstEventId)
      debug('Evicted event %s from peer %s (limit: %d)', firstEventId.slice(0, 8), peerAddress, this.maxEventsPerPeer)
    }
  }

  /**
   * Cleanup tracking data to prevent memory leaks.
   * Removes peers with no events tracked.
   */
  cleanup(): void {
    let removedPeers = 0

    for (const [peerAddress, events] of this.peerEvents.entries()) {
      if (events.size === 0) {
        this.peerEvents.delete(peerAddress)
        removedPeers++
      }
    }

    if (removedPeers > 0) {
      debug('Cleanup removed %d peers with no events', removedPeers)
    }
  }
}
