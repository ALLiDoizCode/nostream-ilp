import createDebug from 'debug'

const debug = createDebug('btp-nips:ttl')

/**
 * Configuration for TTL (Time-To-Live) management.
 * Controls how far events can propagate through the network.
 */
export interface TTLConfig {
  /**
   * Maximum number of hops an event can traverse.
   * Default: 5
   *
   * Example: Alice → Bob → Carol → Dave → Eve → Frank (5 hops)
   */
  maxHops: number;

  /**
   * Initial TTL value for new events.
   * Default: 5
   */
  initialTTL: number;

  /**
   * Whether to drop events when TTL reaches 0.
   * Default: true
   */
  dropOnZero: boolean;
}

/**
 * Packet metadata with TTL information.
 * Extended from base PacketMetadata with TTL fields.
 */
export interface PacketMetadata {
  timestamp: number;
  sender: string;
  ttl?: number; // Time-To-Live (hops remaining)
  hopCount?: number; // Number of hops traversed
}

/**
 * Default TTL configuration.
 */
export const DEFAULT_TTL_CONFIG: TTLConfig = {
  maxHops: 5,
  initialTTL: 5,
  dropOnZero: true,
}

/**
 * Decrement TTL value in packet metadata.
 *
 * @param metadata - Packet metadata with optional TTL
 * @param config - TTL configuration (optional, uses defaults if not provided)
 * @returns New TTL value after decrement
 *
 * @example
 * ```typescript
 * const metadata = { timestamp: Date.now(), sender: 'g.dassie.alice', ttl: 5 };
 * const newTTL = decrementTTL(metadata);
 * console.log(newTTL); // 4
 * ```
 */
export function decrementTTL(
  metadata: PacketMetadata,
  config: TTLConfig = DEFAULT_TTL_CONFIG
): number {
  const currentTTL = metadata.ttl ?? config.initialTTL
  const newTTL = currentTTL - 1

  debug('Decrementing TTL: %d → %d (sender: %s)', currentTTL, newTTL, metadata.sender)

  return newTTL
}

/**
 * Check if event should be dropped based on TTL.
 *
 * @param ttl - Current TTL value
 * @param config - TTL configuration (optional, uses defaults if not provided)
 * @returns true if event should be dropped (TTL <= 0), false otherwise
 *
 * @example
 * ```typescript
 * if (shouldDrop(0)) {
 *   console.log('Event dropped - TTL expired');
 *   return;
 * }
 * ```
 */
export function shouldDrop(
  ttl: number,
  config: TTLConfig = DEFAULT_TTL_CONFIG
): boolean {
  if (!config.dropOnZero) {
    return false // Never drop if dropOnZero is false
  }

  const drop = ttl <= 0

  if (drop) {
    debug('TTL expired: %d <= 0 - dropping event', ttl)
  }

  return drop
}

/**
 * Create updated metadata with decremented TTL and incremented hop count.
 *
 * @param metadata - Original packet metadata
 * @param newSender - ILP address of current node forwarding the event
 * @param config - TTL configuration (optional, uses defaults if not provided)
 * @returns Updated metadata with new TTL, hop count, and sender
 *
 * @example
 * ```typescript
 * const originalMetadata = {
 *   timestamp: Date.now(),
 *   sender: 'g.dassie.alice',
 *   ttl: 5,
 *   hopCount: 0
 * };
 *
 * const newMetadata = updateMetadataForForwarding(originalMetadata, 'g.dassie.bob');
 * console.log(newMetadata);
 * // {
 * //   timestamp: 1234567890,
 * //   sender: 'g.dassie.bob',
 * //   ttl: 4,
 * //   hopCount: 1
 * // }
 * ```
 */
export function updateMetadataForForwarding(
  metadata: PacketMetadata,
  newSender: string,
  config: TTLConfig = DEFAULT_TTL_CONFIG
): PacketMetadata {
  const newTTL = decrementTTL(metadata, config)
  const newHopCount = (metadata.hopCount ?? 0) + 1

  return {
    ...metadata,
    sender: newSender,
    ttl: newTTL,
    hopCount: newHopCount,
  }
}

/**
 * Check if metadata has valid TTL for forwarding.
 *
 * @param metadata - Packet metadata to check
 * @param config - TTL configuration (optional, uses defaults if not provided)
 * @returns true if event can be forwarded (TTL > 1), false otherwise
 *
 * @example
 * ```typescript
 * const metadata = { timestamp: Date.now(), sender: 'g.dassie.alice', ttl: 1 };
 * if (canForward(metadata)) {
 *   // After decrement, TTL will be 0 (can still process but not forward)
 * }
 * ```
 */
export function canForward(
  metadata: PacketMetadata,
  config: TTLConfig = DEFAULT_TTL_CONFIG
): boolean {
  const currentTTL = metadata.ttl ?? config.initialTTL
  return currentTTL > 1 // Need at least TTL=2 to forward (becomes TTL=1 after decrement)
}
