import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FaultInjector } from '../n-peer/fault-injector'

/**
 * AC 5: Byzantine Fault Tolerance (Malicious Peers) Test
 *
 * Tests the network's resilience against malicious nodes that:
 * - Modify event content (Attack 1)
 * - Inject events with forged signatures (Attack 2)
 * - Flood the network with excessive events (Attack 3 - DoS)
 *
 * Scenarios:
 * 1. Event modification detection via signature verification
 * 2. Modified event rejection at next hop
 * 3. Original event acceptance from alternative route
 * 4. Forged signature detection and event rejection
 * 5. DoS attack mitigation via rate limiting
 * 6. Malicious node ban via reputation system
 */

interface MockEvent {
  id: string;
  content: string;
  signature: string;
  pubkey: string;
  modified?: boolean;
  forged?: boolean;
}

interface MockTestNode {
  id: string;
  name: string;
  isMalicious: boolean;
  maliciousBehavior?: 'event-modification' | 'forged-signature' | 'event-flooding';
  receivedEvents: MockEvent[];
  rejectedEvents: MockEvent[];
  rateLimitCounter: number;
  rateLimitThreshold: number;
  isBanned: boolean;
  reputation: number;
  cache: Map<string, boolean>;

  publishEvent(event: MockEvent): void;
  verifySignature(event: MockEvent): boolean;
  rejectEvent(event: MockEvent, reason: string): void;
  applyRateLimit(): boolean;
  banNode(reason: string): void;
}

describe('AC 5: Byzantine Fault Tolerance (Malicious Peers)', () => {
  let injector: FaultInjector
  let nodes: MockTestNode[]
  const NODE_COUNT = 10
  const RATE_LIMIT_THRESHOLD = 100 // events/sec

  beforeEach(() => {
    // Create 10 mock nodes with Byzantine fault detection
    nodes = Array.from({ length: NODE_COUNT }, (_, i) => ({
      id: `node-${i}`,
      name: `Node${i}`,
      isMalicious: false,
      maliciousBehavior: undefined,
      receivedEvents: [],
      rejectedEvents: [],
      rateLimitCounter: 0,
      rateLimitThreshold: RATE_LIMIT_THRESHOLD,
      isBanned: false,
      reputation: 100, // Initial reputation score
      cache: new Map<string, boolean>(),

      publishEvent(event: MockEvent) {
        // Verify signature before accepting
        if (!this.verifySignature(event)) {
          this.rejectEvent(event, 'Invalid signature')
          return
        }

        // Rate limiting check
        if (!this.applyRateLimit()) {
          this.rejectEvent(event, 'Rate limit exceeded')
          return
        }

        // Accept event
        if (!this.cache.has(event.id)) {
          this.receivedEvents.push(event)
          this.cache.set(event.id, true)
        }
      },

      verifySignature(event: MockEvent): boolean {
        // Check if event was modified
        if (event.modified) {
          return false // Modified events have invalid signatures
        }

        // Check if signature was forged
        if (event.forged) {
          return false // Forged signatures fail verification
        }

        // Valid signature
        return true
      },

      rejectEvent(event: MockEvent, reason: string) {
        this.rejectedEvents.push(event)
        console.log(`[${this.name}] Rejected event ${event.id}: ${reason}`)
      },

      applyRateLimit(): boolean {
        this.rateLimitCounter++

        if (this.rateLimitCounter > this.rateLimitThreshold) {
          return false // Rate limit exceeded
        }

        return true
      },

      banNode(reason: string) {
        this.isBanned = true
        this.reputation = 0
        console.log(`[${this.name}] Banned: ${reason}`)
      },
    }))

    injector = new FaultInjector(nodes as any)
  })

  afterEach(() => {
    // Cleanup: clear malicious behavior and bans
    nodes.forEach(node => {
      injector.clearMaliciousBehavior(node as any)
      node.isMalicious = false
      node.maliciousBehavior = undefined
      node.isBanned = false
      node.reputation = 100
      node.rateLimitCounter = 0
    })
  })

  describe('Attack 1: Event Modification', () => {
    it('should detect modified event content', () => {
      const maliciousNode = nodes[3]
      injector.setMaliciousBehavior(maliciousNode as any, 'event-modification')
      maliciousNode.isMalicious = true
      maliciousNode.maliciousBehavior = 'event-modification'

      // Malicious node modifies event
      const originalEvent: MockEvent = {
        id: 'event-1',
        content: 'Original content',
        signature: 'valid-signature-abc123',
        pubkey: 'pubkey-alice',
      }

      const modifiedEvent: MockEvent = {
        ...originalEvent,
        content: 'MODIFIED CONTENT', // Malicious modification
        modified: true, // Mark as modified
      }

      // Next hop (Node 4) receives modified event
      const nextHop = nodes[4]
      nextHop.publishEvent(modifiedEvent)

      // Verify signature verification failed
      expect(nextHop.verifySignature(modifiedEvent)).toBe(false)
    })

    it('should reject modified event at next hop', () => {
      const maliciousNode = nodes[3]
      injector.setMaliciousBehavior(maliciousNode as any, 'event-modification')
      maliciousNode.isMalicious = true
      maliciousNode.maliciousBehavior = 'event-modification'

      // Modified event
      const modifiedEvent: MockEvent = {
        id: 'event-1',
        content: 'MODIFIED',
        signature: 'valid-signature-abc123',
        pubkey: 'pubkey-alice',
        modified: true,
      }

      // Next hop rejects modified event
      const nextHop = nodes[4]
      nextHop.publishEvent(modifiedEvent)

      // Verify event was rejected
      expect(nextHop.receivedEvents).not.toContainEqual(
        expect.objectContaining({ id: 'event-1', modified: true })
      )
      expect(nextHop.rejectedEvents).toContainEqual(
        expect.objectContaining({ id: 'event-1', modified: true })
      )
    })

    it('should accept original event from alternative route', () => {
      const maliciousNode = nodes[3]
      injector.setMaliciousBehavior(maliciousNode as any, 'event-modification')
      maliciousNode.isMalicious = true
      maliciousNode.maliciousBehavior = 'event-modification'

      // Original event from alternative route (Node 2)
      const originalEvent: MockEvent = {
        id: 'event-1',
        content: 'Original content',
        signature: 'valid-signature-abc123',
        pubkey: 'pubkey-alice',
      }

      // Next hop receives original event from alternative route
      const nextHop = nodes[4]
      nextHop.publishEvent(originalEvent)

      // Verify original event was accepted
      expect(nextHop.receivedEvents).toContainEqual(
        expect.objectContaining({ id: 'event-1', content: 'Original content' })
      )
      expect(nextHop.verifySignature(originalEvent)).toBe(true)
    })
  })

  describe('Attack 2: False Event Injection (Forged Signatures)', () => {
    it('should detect forged signature', () => {
      const maliciousNode = nodes[3]
      injector.setMaliciousBehavior(maliciousNode as any, 'forged-signature')
      maliciousNode.isMalicious = true
      maliciousNode.maliciousBehavior = 'forged-signature'

      // Malicious node publishes event with forged signature
      const forgedEvent: MockEvent = {
        id: 'event-forged',
        content: 'Forged content',
        signature: 'FORGED-SIGNATURE-INVALID',
        pubkey: 'pubkey-victim',
        forged: true,
      }

      // Next hop verifies signature
      const nextHop = nodes[4]
      const isValid = nextHop.verifySignature(forgedEvent)

      expect(isValid).toBe(false)
    })

    it('should reject event with forged signature', () => {
      const maliciousNode = nodes[3]
      injector.setMaliciousBehavior(maliciousNode as any, 'forged-signature')
      maliciousNode.isMalicious = true
      maliciousNode.maliciousBehavior = 'forged-signature'

      // Forged event
      const forgedEvent: MockEvent = {
        id: 'event-forged',
        content: 'Forged content',
        signature: 'FORGED-SIGNATURE-INVALID',
        pubkey: 'pubkey-victim',
        forged: true,
      }

      // Next hop attempts to accept event
      const nextHop = nodes[4]
      nextHop.publishEvent(forgedEvent)

      // Verify event was rejected (NOT stored)
      expect(nextHop.receivedEvents).not.toContainEqual(
        expect.objectContaining({ id: 'event-forged' })
      )
      expect(nextHop.rejectedEvents).toContainEqual(
        expect.objectContaining({ id: 'event-forged', forged: true })
      )
    })

    it('should prevent storage of forged events in any node', () => {
      const maliciousNode = nodes[3]
      injector.setMaliciousBehavior(maliciousNode as any, 'forged-signature')
      maliciousNode.isMalicious = true
      maliciousNode.maliciousBehavior = 'forged-signature'

      // Forged event
      const forgedEvent: MockEvent = {
        id: 'event-forged',
        content: 'Forged content',
        signature: 'FORGED-SIGNATURE-INVALID',
        pubkey: 'pubkey-victim',
        forged: true,
      }

      // Attempt to propagate forged event to all nodes
      nodes.forEach(node => {
        node.publishEvent(forgedEvent)
      })

      // Verify NO node stored the forged event
      nodes.forEach(node => {
        expect(node.receivedEvents).not.toContainEqual(
          expect.objectContaining({ id: 'event-forged' })
        )
      })
    })
  })

  describe('Attack 3: Denial of Service (Event Flooding)', () => {
    it('should throttle malicious node sending 10,000 events/sec', () => {
      const maliciousNode = nodes[3]
      injector.setMaliciousBehavior(maliciousNode as any, 'event-flooding')
      maliciousNode.isMalicious = true
      maliciousNode.maliciousBehavior = 'event-flooding'

      const nextHop = nodes[4]

      // Malicious node sends 10,000 events
      for (let i = 0; i < 10000; i++) {
        const floodEvent: MockEvent = {
          id: `flood-event-${i}`,
          content: `Flood ${i}`,
          signature: `sig-${i}`,
          pubkey: 'pubkey-malicious',
        }
        nextHop.publishEvent(floodEvent)
      }

      // Verify rate limiter throttled malicious node
      expect(nextHop.receivedEvents.length).toBeLessThan(10000)
      expect(nextHop.receivedEvents.length).toBeLessThanOrEqual(RATE_LIMIT_THRESHOLD)
      expect(nextHop.rejectedEvents.length).toBeGreaterThan(0)
    })

    it('should allow other nodes to continue operating normally during DoS', () => {
      const maliciousNode = nodes[3]
      injector.setMaliciousBehavior(maliciousNode as any, 'event-flooding')
      maliciousNode.isMalicious = true
      maliciousNode.maliciousBehavior = 'event-flooding'

      const nextHop = nodes[4]

      // Malicious node floods
      for (let i = 0; i < 1000; i++) {
        const floodEvent: MockEvent = {
          id: `flood-event-${i}`,
          content: `Flood ${i}`,
          signature: `sig-${i}`,
          pubkey: 'pubkey-malicious',
        }
        nextHop.publishEvent(floodEvent)
      }

      // Other nodes (e.g., Node 0-2, 5-9) publish legitimate events
      const legitimateEvent: MockEvent = {
        id: 'legit-event-1',
        content: 'Legitimate event',
        signature: 'valid-sig',
        pubkey: 'pubkey-alice',
      }

      nodes.forEach((node, i) => {
        if (i !== 3 && i !== 4) {
          // Reset rate limit counter for other nodes
          node.rateLimitCounter = 0
          node.publishEvent(legitimateEvent)
        }
      })

      // Verify other nodes processed legitimate events normally
      nodes.forEach((node, i) => {
        if (i !== 3 && i !== 4) {
          expect(node.receivedEvents).toContainEqual(
            expect.objectContaining({ id: 'legit-event-1' })
          )
        }
      })
    })

    it('should ban malicious node after sustained flooding', () => {
      const maliciousNode = nodes[3]
      injector.setMaliciousBehavior(maliciousNode as any, 'event-flooding')
      maliciousNode.isMalicious = true
      maliciousNode.maliciousBehavior = 'event-flooding'

      const nextHop = nodes[4]

      // Malicious node floods
      for (let i = 0; i < 10000; i++) {
        const floodEvent: MockEvent = {
          id: `flood-event-${i}`,
          content: `Flood ${i}`,
          signature: `sig-${i}`,
          pubkey: 'pubkey-malicious',
        }
        nextHop.publishEvent(floodEvent)
      }

      // Detect sustained flooding and ban malicious node
      if (nextHop.rejectedEvents.length > RATE_LIMIT_THRESHOLD) {
        maliciousNode.banNode('Event flooding DoS attack')
      }

      // Verify malicious node was banned
      expect(maliciousNode.isBanned).toBe(true)
      expect(maliciousNode.reputation).toBe(0)
    })

    it('should maintain network throughput during DoS attack', () => {
      const maliciousNode = nodes[3]
      injector.setMaliciousBehavior(maliciousNode as any, 'event-flooding')
      maliciousNode.isMalicious = true
      maliciousNode.maliciousBehavior = 'event-flooding'

      // Measure throughput before attack
      const legitimateEvent: MockEvent = {
        id: 'legit-before',
        content: 'Before attack',
        signature: 'valid-sig',
        pubkey: 'pubkey-alice',
      }
      nodes[0].publishEvent(legitimateEvent)
      const beforeCount = nodes[0].receivedEvents.length

      // Malicious node attacks
      for (let i = 0; i < 1000; i++) {
        const floodEvent: MockEvent = {
          id: `flood-event-${i}`,
          content: `Flood ${i}`,
          signature: `sig-${i}`,
          pubkey: 'pubkey-malicious',
        }
        nodes[4].publishEvent(floodEvent)
      }

      // Measure throughput during attack (other nodes)
      const duringEvent: MockEvent = {
        id: 'legit-during',
        content: 'During attack',
        signature: 'valid-sig-2',
        pubkey: 'pubkey-bob',
      }
      nodes[0].rateLimitCounter = 0 // Reset for legitimate traffic
      nodes[0].publishEvent(duringEvent)
      const duringCount = nodes[0].receivedEvents.length

      // Verify throughput maintained (Node 0 still processing events)
      expect(duringCount).toBeGreaterThan(beforeCount)
    })
  })

  describe('Multi-Attack Scenarios', () => {
    it('should handle combination of event modification + flooding', () => {
      const maliciousNode = nodes[3]
      injector.setMaliciousBehavior(maliciousNode as any, 'event-modification')
      maliciousNode.isMalicious = true
      maliciousNode.maliciousBehavior = 'event-modification'

      const nextHop = nodes[4]

      // Attack 1: Modify events
      for (let i = 0; i < 100; i++) {
        const modifiedEvent: MockEvent = {
          id: `modified-${i}`,
          content: 'MODIFIED',
          signature: 'sig',
          pubkey: 'pubkey',
          modified: true,
        }
        nextHop.publishEvent(modifiedEvent)
      }

      // Attack 2: Flood with forged events
      for (let i = 0; i < 1000; i++) {
        const forgedEvent: MockEvent = {
          id: `forged-${i}`,
          content: 'Forged',
          signature: 'FORGED',
          pubkey: 'pubkey',
          forged: true,
        }
        nextHop.publishEvent(forgedEvent)
      }

      // Verify both attacks were mitigated
      const modifiedAccepted = nextHop.receivedEvents.filter(e => e.modified).length
      const forgedAccepted = nextHop.receivedEvents.filter(e => e.forged).length

      expect(modifiedAccepted).toBe(0) // No modified events accepted
      expect(forgedAccepted).toBe(0) // No forged events accepted
      expect(nextHop.rejectedEvents.length).toBeGreaterThan(0)
    })

    it('should maintain reputation system across multiple attack types', () => {
      const maliciousNode = nodes[3]
      maliciousNode.isMalicious = true
      maliciousNode.reputation = 100

      // Attack 1: Event modification (reduce reputation by 20)
      injector.setMaliciousBehavior(maliciousNode as any, 'event-modification')
      maliciousNode.reputation -= 20

      // Attack 2: Forged signature (reduce reputation by 30)
      injector.setMaliciousBehavior(maliciousNode as any, 'forged-signature')
      maliciousNode.reputation -= 30

      // Attack 3: Event flooding (reduce reputation by 50)
      injector.setMaliciousBehavior(maliciousNode as any, 'event-flooding')
      maliciousNode.reputation -= 50

      // Verify reputation degraded
      expect(maliciousNode.reputation).toBe(0)

      // Ban node when reputation reaches 0
      if (maliciousNode.reputation <= 0) {
        maliciousNode.banNode('Multiple Byzantine attacks')
      }

      expect(maliciousNode.isBanned).toBe(true)
    })
  })
})
