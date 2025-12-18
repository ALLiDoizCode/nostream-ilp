import type { NostrFilter } from './types'

/**
 * Active subscription tracking
 */
export interface ActiveSubscription {
  /** Subscription ID */
  subId: string
  /** ILP address of subscriber */
  subscriber: string
  /** Nostr filters for this subscription */
  filters: NostrFilter[]
  /** Timestamp when subscription was created */
  createdAt: number
}

/**
 * Subscription manager for tracking active REQ subscriptions
 */
export class SubscriptionManager {
  private subscriptions = new Map<string, ActiveSubscription>()

  /**
   * Register a new subscription
   * @param subId - Subscription ID
   * @param subscriber - ILP address of subscriber
   * @param filters - Nostr filters for this subscription
   */
  register(
    subId: string,
    subscriber: string,
    filters: NostrFilter[],
  ): void {
    const key = this.getKey(subscriber, subId)
    this.subscriptions.set(key, {
      subId,
      subscriber,
      filters,
      createdAt: Date.now(),
    })
  }

  /**
   * Unregister a subscription (CLOSE)
   * @param subId - Subscription ID
   * @param subscriber - ILP address of subscriber
   * @returns true if subscription was removed, false if not found
   */
  unregister(subId: string, subscriber: string): boolean {
    const key = this.getKey(subscriber, subId)
    return this.subscriptions.delete(key)
  }

  /**
   * Get a subscription by ID and subscriber
   * @param subId - Subscription ID
   * @param subscriber - ILP address of subscriber
   * @returns Subscription or undefined
   */
  get(subId: string, subscriber: string): ActiveSubscription | undefined {
    const key = this.getKey(subscriber, subId)
    return this.subscriptions.get(key)
  }

  /**
   * Check if a subscription exists
   * @param subId - Subscription ID
   * @param subscriber - ILP address of subscriber
   * @returns true if subscription exists
   */
  has(subId: string, subscriber: string): boolean {
    const key = this.getKey(subscriber, subId)
    return this.subscriptions.has(key)
  }

  /**
   * Get all subscriptions for a given subscriber
   * @param subscriber - ILP address of subscriber
   * @returns Array of subscriptions
   */
  getBySubscriber(subscriber: string): ActiveSubscription[] {
    return Array.from(this.subscriptions.values()).filter(
      (sub) => sub.subscriber === subscriber,
    )
  }

  /**
   * Get total subscription count
   * @returns Number of active subscriptions
   */
  count(): number {
    return this.subscriptions.size
  }

  /**
   * Clear all subscriptions (for testing)
   */
  clear(): void {
    this.subscriptions.clear()
  }

  /**
   * Generate unique key for subscription storage
   * @param subscriber - ILP address
   * @param subId - Subscription ID
   * @returns Unique key
   */
  private getKey(subscriber: string, subId: string): string {
    return `${subscriber}:${subId}`
  }
}
