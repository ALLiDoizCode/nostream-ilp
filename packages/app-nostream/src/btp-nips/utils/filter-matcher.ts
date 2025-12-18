import type { NostrEvent, NostrFilter } from '../types/index'

/**
 * Filter Matcher Utility
 * Implements Nostr filter matching logic for event subscriptions
 *
 * Filter Matching Rules (NIP-01):
 * - Within a single filter: ALL conditions must match (AND logic)
 * - Between multiple filters: ANY filter can match (OR logic)
 *
 * Reference: NIP-01, docs/architecture/btp-nips-subscription-flow.md#Event Matching
 */

/**
 * Check if a Nostr event matches a filter
 *
 * Filter Matching Algorithm:
 * 1. Check event IDs (filter.ids)
 * 2. Check authors (filter.authors)
 * 3. Check kinds (filter.kinds)
 * 4. Check timestamp range (filter.since, filter.until)
 * 5. Check tag filters (#e, #p, etc.)
 *
 * All conditions within a filter are AND - event must match all specified conditions
 * If a filter property is undefined or empty, it's ignored (matches all)
 *
 * @param event - Nostr event to check
 * @param filter - Nostr filter to match against
 * @returns true if event matches filter, false otherwise
 *
 * @example
 * ```typescript
 * const _event = {
 *   id: 'abc123',
 *   pubkey: 'alice_pubkey',
 *   kind: 1,
 *   created_at: 1609459200,
 *   tags: [['e', 'event_id'], ['p', 'bob_pubkey']],
 *   content: 'Hello world',
 *   sig: 'signature'
 * };
 *
 * const filter = {
 *   authors: ['alice_pubkey'],
 *   kinds: [1],
 *   since: 1609459000
 * };
 *
 * const matches = eventMatchesFilter(event, filter); // true
 * ```
 */
export function eventMatchesFilter(
  event: NostrEvent,
  filter: NostrFilter
): boolean {
  // Check event IDs
  if (filter.ids && filter.ids.length > 0) {
    if (!filter.ids.includes(event.id)) {
      return false
    }
  }

  // Check authors (public keys)
  if (filter.authors && filter.authors.length > 0) {
    if (!filter.authors.includes(event.pubkey)) {
      return false
    }
  }

  // Check event kinds
  if (filter.kinds && filter.kinds.length > 0) {
    if (!filter.kinds.includes(event.kind)) {
      return false
    }
  }

  // Check timestamp range (since is inclusive)
  if (filter.since !== undefined && event.created_at < filter.since) {
    return false
  }

  // Check timestamp range (until is inclusive)
  if (filter.until !== undefined && event.created_at > filter.until) {
    return false
  }

  // Check tag filters (#e, #p, etc.)
  for (const [key, values] of Object.entries(filter)) {
    // Tag filters start with '#' (e.g., '#e', '#p')
    if (key.startsWith('#') && values && values.length > 0) {
      const tagName = key.slice(1) // Remove '#' prefix

      // Extract all tag values for this tag name from event
      const eventTagValues = event.tags
        .filter((tag) => tag[0] === tagName && tag.length >= 2)
        .map((tag) => tag[1])

      // At least one filter value must match at least one event tag value
      const hasMatch = values.some((filterValue) =>
        eventTagValues.includes(filterValue)
      )

      if (!hasMatch) {
        return false
      }
    }
  }

  // All conditions passed - event matches filter
  return true
}

/**
 * Check if a Nostr event matches any of multiple filters
 * Applies OR logic between filters
 *
 * @param event - Nostr event to check
 * @param filters - Array of Nostr filters
 * @returns true if event matches at least one filter, false otherwise
 *
 * @example
 * ```typescript
 * const filters = [
 *   { authors: ['alice'], kinds: [1] },  // Alice's short notes
 *   { authors: ['bob'], kinds: [30023] }  // Bob's long-form content
 * ];
 *
 * const matches = eventMatchesAnyFilter(aliceEvent, filters); // true (matches first filter)
 * const matches2 = eventMatchesAnyFilter(bobArticle, filters); // true (matches second filter)
 * const matches3 = eventMatchesAnyFilter(charlieEvent, filters); // false (matches neither)
 * ```
 */
export function eventMatchesAnyFilter(
  event: NostrEvent,
  filters: NostrFilter[]
): boolean {
  // Empty filter array matches no events
  if (filters.length === 0) {
    return false
  }

  // Check if event matches at least one filter (OR logic)
  return filters.some((filter) => eventMatchesFilter(event, filter))
}
