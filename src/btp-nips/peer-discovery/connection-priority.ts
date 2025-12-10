import { PriorityContext } from '../types/peer-connection.js'

/**
 * Connection Priority Calculator
 *
 * Calculates connection priority for peers based on multiple factors:
 * - Follow list status (highest priority)
 * - Network connectivity (well-connected peers)
 * - Latency (low-latency peers)
 *
 * @module btp-nips/peer-discovery/connection-priority
 */

/**
 * Calculate connection priority for a peer
 *
 * Priority scale: 1 (highest) to 10 (lowest)
 *
 * Priority Tiers:
 * 1. Follow List + Low Latency (< 100ms): Priority 1
 * 2. Follow List + High Subscribers (> 100): Priority 2
 * 3. Follow List (other): Priority 3
 * 4. Well-Connected (> 1000 subscribers): Priority 4
 * 5. Low Latency (< 100ms): Priority 7
 * 6. Other: Priority 10
 *
 * @param pubkey - The peer's public key
 * @param context - Priority calculation context
 * @returns Priority value (1-10, lower = higher priority)
 *
 * @example
 * ```typescript
 * const priority = calculatePriority('alice_pubkey', {
 *   isFollowed: true,
 *   subscriberCount: 150,
 *   avgLatencyMs: 50
 * });
 * // Returns: 1 (followed + low latency)
 * ```
 */
export function calculatePriority(pubkey: string, context: PriorityContext): number {
  // Tier 1: Followed peers (priority 1-3)
  if (context.isFollowed) {
    // High priority: Followed + Low latency
    if (context.avgLatencyMs < 100) {
      return 1
    }

    // High priority: Followed + Well-connected
    if (context.subscriberCount > 100) {
      return 2
    }

    // Medium-high priority: Followed (other)
    return 3
  }

  // Tier 2: Well-connected peers (priority 4-6)
  if (context.subscriberCount > 1000) {
    // Very well-connected peers (good for routing)
    return 4
  }

  if (context.subscriberCount > 500) {
    return 5
  }

  if (context.subscriberCount > 100) {
    return 6
  }

  // Tier 3: Low-latency peers (priority 7-9)
  if (context.avgLatencyMs < 100) {
    return 7
  }

  if (context.avgLatencyMs < 200) {
    return 8
  }

  if (context.avgLatencyMs < 500) {
    return 9
  }

  // Tier 4: Other peers (priority 10)
  return 10
}

/**
 * Determine if priority should be recalculated
 *
 * Returns true if significant change in context warrants priority update.
 *
 * @param oldContext - Previous priority context
 * @param newContext - Current priority context
 * @returns True if priority should be recalculated
 *
 * @example
 * ```typescript
 * if (shouldRecalculatePriority(oldContext, newContext)) {
 *   const newPriority = calculatePriority(pubkey, newContext);
 *   await connectionStore.updatePriority(pubkey, newPriority);
 * }
 * ```
 */
export function shouldRecalculatePriority(
  oldContext: PriorityContext,
  newContext: PriorityContext
): boolean {
  // Follow status changed (most significant)
  if (oldContext.isFollowed !== newContext.isFollowed) {
    return true
  }

  // Subscriber count changed significantly (> 20%)
  const subscriberDelta = Math.abs(newContext.subscriberCount - oldContext.subscriberCount)
  const subscriberChangePercent = subscriberDelta / Math.max(oldContext.subscriberCount, 1)
  if (subscriberChangePercent > 0.2) {
    return true
  }

  // Latency changed significantly (> 50ms or crossed threshold)
  const latencyDelta = Math.abs(newContext.avgLatencyMs - oldContext.avgLatencyMs)
  if (latencyDelta > 50) {
    return true
  }

  // Check if latency crossed important thresholds
  const crossedThreshold =
    (oldContext.avgLatencyMs < 100 && newContext.avgLatencyMs >= 100) ||
    (oldContext.avgLatencyMs >= 100 && newContext.avgLatencyMs < 100) ||
    (oldContext.avgLatencyMs < 200 && newContext.avgLatencyMs >= 200) ||
    (oldContext.avgLatencyMs >= 200 && newContext.avgLatencyMs < 200)

  if (crossedThreshold) {
    return true
  }

  return false
}

/**
 * Get priority tier description
 *
 * Returns human-readable description of priority tier.
 *
 * @param priority - Priority value (1-10)
 * @returns Tier description
 *
 * @example
 * ```typescript
 * const description = getPriorityTierDescription(1);
 * // Returns: "Tier 1: Follow List + Low Latency"
 * ```
 */
export function getPriorityTierDescription(priority: number): string {
  switch (priority) {
    case 1:
      return 'Tier 1: Follow List + Low Latency'
    case 2:
      return 'Tier 1: Follow List + Well-Connected'
    case 3:
      return 'Tier 1: Follow List'
    case 4:
      return 'Tier 2: Very Well-Connected (>1000 subscribers)'
    case 5:
      return 'Tier 2: Well-Connected (>500 subscribers)'
    case 6:
      return 'Tier 2: Well-Connected (>100 subscribers)'
    case 7:
      return 'Tier 3: Low Latency (<100ms)'
    case 8:
      return 'Tier 3: Medium Latency (<200ms)'
    case 9:
      return 'Tier 3: Acceptable Latency (<500ms)'
    case 10:
      return 'Tier 4: Other'
    default:
      return 'Unknown Tier'
  }
}

/**
 * Sort connections by priority
 *
 * Utility function to sort an array of connections by priority.
 * Lower priority values come first (1 before 10).
 *
 * @param connections - Array of connections with priority field
 * @returns Sorted array (highest priority first)
 *
 * @example
 * ```typescript
 * const connections = await connectionStore.getAllConnections();
 * const sorted = sortByPriority(connections);
 * // sorted[0] has highest priority (lowest number)
 * ```
 */
export function sortByPriority<T extends { priority: number }>(connections: T[]): T[] {
  return connections.sort((a, b) => a.priority - b.priority)
}

/**
 * Priority update recommendation
 */
export interface PriorityUpdateRecommendation {
  /** Should priority be updated? */
  shouldUpdate: boolean
  /** Old priority value */
  oldPriority: number
  /** New priority value */
  newPriority: number
  /** Reason for update */
  reason: string
}

/**
 * Get priority update recommendation
 *
 * Analyzes contexts and returns recommendation for priority update.
 *
 * @param pubkey - The peer's public key
 * @param oldContext - Previous priority context
 * @param newContext - Current priority context
 * @returns Priority update recommendation
 *
 * @example
 * ```typescript
 * const recommendation = getPriorityUpdateRecommendation(
 *   'alice_pubkey',
 *   oldContext,
 *   newContext
 * );
 *
 * if (recommendation.shouldUpdate) {
 *   console.log(recommendation.reason);
 *   await connectionStore.updatePriority(pubkey, recommendation.newPriority);
 * }
 * ```
 */
export function getPriorityUpdateRecommendation(
  pubkey: string,
  oldContext: PriorityContext,
  newContext: PriorityContext
): PriorityUpdateRecommendation {
  const oldPriority = calculatePriority(pubkey, oldContext)
  const newPriority = calculatePriority(pubkey, newContext)

  // No change
  if (oldPriority === newPriority) {
    return {
      shouldUpdate: false,
      oldPriority,
      newPriority,
      reason: 'Priority unchanged',
    }
  }

  // Build reason
  let reason = ''

  if (oldContext.isFollowed !== newContext.isFollowed) {
    reason = newContext.isFollowed
      ? 'Peer added to follow list'
      : 'Peer removed from follow list'
  } else if (Math.abs(newContext.subscriberCount - oldContext.subscriberCount) > 100) {
    reason = `Subscriber count changed significantly (${oldContext.subscriberCount} → ${newContext.subscriberCount})`
  } else if (Math.abs(newContext.avgLatencyMs - oldContext.avgLatencyMs) > 50) {
    reason = `Latency changed significantly (${oldContext.avgLatencyMs}ms → ${newContext.avgLatencyMs}ms)`
  } else {
    reason = 'Priority tier changed'
  }

  return {
    shouldUpdate: true,
    oldPriority,
    newPriority,
    reason,
  }
}
