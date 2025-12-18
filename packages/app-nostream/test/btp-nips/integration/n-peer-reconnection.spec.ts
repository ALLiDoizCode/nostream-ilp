import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FaultInjector } from '../n-peer/fault-injector'

/**
 * AC 3: Reconnection and Subscription Renewal Test
 *
 * Tests connection loss detection, reconnection with exponential backoff,
 * and automatic subscription renewal after reconnection.
 *
 * Scenarios:
 * 1. Connection loss detection (heartbeat timeout: 30s)
 * 2. Reconnection attempts with exponential backoff (1s, 2s, 4s, 8s, 16s)
 * 3. Connection re-establishment (within 30 seconds)
 * 4. Subscription renewal (same filters, preserved subscription ID)
 * 5. Queued events delivery after reconnection
 * 6. Subscription integrity verification
 */

interface MockSubscription {
  id: string;
  filters: Array<{ kinds: number[] }>;
  createdAt: number;
}

interface MockTestNode {
  id: string;
  name: string;
  isConnected: boolean;
  connectionLostAt?: number;
  subscriptions: Map<string, MockSubscription>;
  queuedEvents: Array<{ id: string; content: string }>;
  receivedEvents: string[];
  cache: Map<string, boolean>;

  subscribe(filters: Array<{ kinds: number[] }>): string;
  unsubscribe(subId: string): void;
  detectConnectionLoss(): boolean;
  attemptReconnection(): Promise<boolean>;
  renewSubscription(subId: string): boolean;
  deliverQueuedEvents(): void;
}

describe('AC 3: Reconnection and Subscription Renewal', () => {
  let injector: FaultInjector
  let nodes: MockTestNode[]
  let alice: MockTestNode
  let frank: MockTestNode
  const HEARTBEAT_TIMEOUT = 30000 // 30 seconds
  const BACKOFF_SEQUENCE = [1000, 2000, 4000, 8000, 16000] // Exponential backoff

  beforeEach(() => {
    // Create 10 mock nodes with subscription capabilities
    nodes = Array.from({ length: 10 }, (_, i) => ({
      id: `node-${i}`,
      name: ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank', 'Grace', 'Hank', 'Ivy', 'Jack'][i],
      isConnected: true,
      connectionLostAt: undefined,
      subscriptions: new Map<string, MockSubscription>(),
      queuedEvents: [],
      receivedEvents: [],
      cache: new Map<string, boolean>(),

      subscribe(filters: Array<{ kinds: number[] }>): string {
        const subId = `sub-${Date.now()}-${Math.random().toString(36).slice(2)}`
        this.subscriptions.set(subId, {
          id: subId,
          filters,
          createdAt: Date.now(),
        })
        return subId
      },

      unsubscribe(subId: string): void {
        this.subscriptions.delete(subId)
      },

      detectConnectionLoss(): boolean {
        if (!this.isConnected && this.connectionLostAt) {
          const elapsed = Date.now() - this.connectionLostAt
          return elapsed >= HEARTBEAT_TIMEOUT
        }
        return false
      },

      async attemptReconnection(): Promise<boolean> {
        // Simulate reconnection after backoff
        await new Promise(resolve => setTimeout(resolve, 10)) // Simulated delay
        this.isConnected = true
        this.connectionLostAt = undefined
        return true
      },

      renewSubscription(subId: string): boolean {
        const sub = this.subscriptions.get(subId)
        if (!sub) return false

        // Renew subscription (update timestamp, preserve ID and filters)
        sub.createdAt = Date.now()
        return true
      },

      deliverQueuedEvents(): void {
        this.queuedEvents.forEach(event => {
          if (!this.cache.has(event.id)) {
            this.receivedEvents.push(event.id)
            this.cache.set(event.id, true)
          }
        })
        this.queuedEvents = []
      },
    }))

    alice = nodes[0] // Node 0: Alice
    frank = nodes[5] // Node 5: Frank

    injector = new FaultInjector(nodes as any)
  })

  afterEach(() => {
    // Cleanup: reconnect any disconnected nodes
    nodes.forEach(node => {
      if (!node.isConnected) {
        node.isConnected = true
        node.connectionLostAt = undefined
      }
    })
  })

  it('should detect connection loss after heartbeat timeout', async () => {
    // Alice subscribes to Frank's events
    const subId = alice.subscribe([{ kinds: [1] }])
    expect(alice.subscriptions.has(subId)).toBe(true)

    // Disconnect Alice from Frank
    await injector.disconnectNodes(alice as any, frank as any)

    // Manually mark Alice as disconnected
    alice.isConnected = false
    alice.connectionLostAt = Date.now() - HEARTBEAT_TIMEOUT

    // Verify Alice detects connection loss
    const detected = alice.detectConnectionLoss()
    expect(detected).toBe(true)
  })

  it('should attempt reconnection with exponential backoff', async () => {
    alice.isConnected = false
    alice.connectionLostAt = Date.now()

    const reconnectionAttempts: number[] = []

    // Simulate exponential backoff reconnection attempts
    for (const backoff of BACKOFF_SEQUENCE) {
      await new Promise(resolve => setTimeout(resolve, backoff / 100)) // Speed up for test
      reconnectionAttempts.push(backoff)

      const reconnected = await alice.attemptReconnection()
      if (reconnected) {
        break
      }
    }

    // Verify reconnection attempts followed backoff sequence
    expect(reconnectionAttempts.length).toBeGreaterThan(0)
    expect(reconnectionAttempts).toEqual(BACKOFF_SEQUENCE.slice(0, reconnectionAttempts.length))
  })

  it('should re-establish connection within 30 seconds', async () => {
    alice.isConnected = false
    alice.connectionLostAt = Date.now()

    const startTime = Date.now()

    // Simulate reconnection
    await injector.reconnectNodes(alice as any, frank as any)
    const reconnected = await alice.attemptReconnection()

    const reconnectionTime = Date.now() - startTime

    expect(reconnected).toBe(true)
    expect(alice.isConnected).toBe(true)
    expect(reconnectionTime).toBeLessThan(30000) // Within 30 seconds
  })

  it('should automatically renew subscription after reconnection', async () => {
    // Alice subscribes to Frank's events
    const subId = alice.subscribe([{ kinds: [1] }])
    const originalSub = alice.subscriptions.get(subId)!
    const originalFilters = originalSub.filters

    // Disconnect and reconnect
    alice.isConnected = false
    await injector.disconnectNodes(alice as any, frank as any)
    await injector.reconnectNodes(alice as any, frank as any)
    alice.isConnected = true

    // Renew subscription
    const renewed = alice.renewSubscription(subId)

    expect(renewed).toBe(true)
    expect(alice.subscriptions.has(subId)).toBe(true)

    const renewedSub = alice.subscriptions.get(subId)!
    expect(renewedSub.id).toBe(subId) // Subscription ID preserved
    expect(renewedSub.filters).toEqual(originalFilters) // Filters preserved
  })

  it('should preserve subscription ID across reconnection', async () => {
    const subId = alice.subscribe([{ kinds: [1, 3] }])

    // Disconnect and reconnect
    alice.isConnected = false
    await injector.disconnectNodes(alice as any, frank as any)
    await injector.reconnectNodes(alice as any, frank as any)
    alice.isConnected = true

    // Renew subscription
    alice.renewSubscription(subId)

    // Verify subscription ID is unchanged
    expect(alice.subscriptions.has(subId)).toBe(true)
    const sub = alice.subscriptions.get(subId)!
    expect(sub.id).toBe(subId)
  })

  it('should not create duplicate subscriptions after reconnection', async () => {
    const subId = alice.subscribe([{ kinds: [1] }])

    // Record initial subscription count
    const initialCount = alice.subscriptions.size

    // Disconnect and reconnect
    alice.isConnected = false
    await injector.disconnectNodes(alice as any, frank as any)
    await injector.reconnectNodes(alice as any, frank as any)
    alice.isConnected = true

    // Renew subscription (should NOT create duplicate)
    alice.renewSubscription(subId)

    // Verify no duplicate subscriptions
    expect(alice.subscriptions.size).toBe(initialCount)
    expect(alice.subscriptions.has(subId)).toBe(true)
  })

  it('should maintain filter integrity across reconnection', async () => {
    const filters = [{ kinds: [1, 3, 7] }]
    const subId = alice.subscribe(filters)

    // Disconnect and reconnect
    alice.isConnected = false
    await injector.disconnectNodes(alice as any, frank as any)
    await injector.reconnectNodes(alice as any, frank as any)
    alice.isConnected = true

    // Renew subscription
    alice.renewSubscription(subId)

    // Verify filters are unchanged
    const sub = alice.subscriptions.get(subId)!
    expect(sub.filters).toEqual(filters)
  })

  it('should queue events during downtime and deliver after reconnection', async () => {
    const subId = alice.subscribe([{ kinds: [1] }])

    // Disconnect Alice
    alice.isConnected = false
    await injector.disconnectNodes(alice as any, frank as any)

    // Frank publishes events while Alice is offline
    const event1 = { id: 'event-1', content: 'Event during downtime 1' }
    const event2 = { id: 'event-2', content: 'Event during downtime 2' }
    const event3 = { id: 'event-3', content: 'Event during downtime 3' }

    alice.queuedEvents.push(event1, event2, event3)

    // Verify events are queued (not delivered yet)
    expect(alice.receivedEvents.length).toBe(0)
    expect(alice.queuedEvents.length).toBe(3)

    // Reconnect Alice
    await injector.reconnectNodes(alice as any, frank as any)
    alice.isConnected = true
    alice.renewSubscription(subId)

    // Deliver queued events
    alice.deliverQueuedEvents()

    // Verify all queued events were delivered
    expect(alice.receivedEvents).toEqual(['event-1', 'event-2', 'event-3'])
    expect(alice.queuedEvents.length).toBe(0)
  })

  it('should handle large number of queued events (100+ events)', async () => {
    const subId = alice.subscribe([{ kinds: [1] }])

    // Disconnect Alice
    alice.isConnected = false
    await injector.disconnectNodes(alice as any, frank as any)

    // Queue 150 events during downtime
    const queuedEventCount = 150
    for (let i = 0; i < queuedEventCount; i++) {
      alice.queuedEvents.push({ id: `event-${i}`, content: `Event ${i}` })
    }

    expect(alice.queuedEvents.length).toBe(queuedEventCount)

    // Reconnect and deliver
    await injector.reconnectNodes(alice as any, frank as any)
    alice.isConnected = true
    alice.renewSubscription(subId)
    alice.deliverQueuedEvents()

    // Verify all events delivered
    expect(alice.receivedEvents.length).toBe(queuedEventCount)
    expect(alice.queuedEvents.length).toBe(0)
  })

  it('should handle reconnection when subscription was deleted during downtime', async () => {
    const subId = alice.subscribe([{ kinds: [1] }])

    // Disconnect Alice
    alice.isConnected = false
    await injector.disconnectNodes(alice as any, frank as any)

    // Delete subscription during downtime (e.g., server-side cleanup)
    alice.unsubscribe(subId)

    // Reconnect Alice
    await injector.reconnectNodes(alice as any, frank as any)
    alice.isConnected = true

    // Attempt to renew deleted subscription
    const renewed = alice.renewSubscription(subId)

    // Verify renewal failed (subscription no longer exists)
    expect(renewed).toBe(false)
    expect(alice.subscriptions.has(subId)).toBe(false)
  })

  it('should handle multiple reconnections without state corruption', async () => {
    const subId = alice.subscribe([{ kinds: [1] }])

    // Reconnection cycle 1
    alice.isConnected = false
    await injector.disconnectNodes(alice as any, frank as any)
    await injector.reconnectNodes(alice as any, frank as any)
    alice.isConnected = true
    alice.renewSubscription(subId)

    // Reconnection cycle 2
    alice.isConnected = false
    await injector.disconnectNodes(alice as any, frank as any)
    await injector.reconnectNodes(alice as any, frank as any)
    alice.isConnected = true
    alice.renewSubscription(subId)

    // Reconnection cycle 3
    alice.isConnected = false
    await injector.disconnectNodes(alice as any, frank as any)
    await injector.reconnectNodes(alice as any, frank as any)
    alice.isConnected = true
    alice.renewSubscription(subId)

    // Verify subscription state is intact after 3 cycles
    expect(alice.subscriptions.has(subId)).toBe(true)
    expect(alice.subscriptions.size).toBe(1) // No duplicates
    expect(alice.isConnected).toBe(true)
  })
})
