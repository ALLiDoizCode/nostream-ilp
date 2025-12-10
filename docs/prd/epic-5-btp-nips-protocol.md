# Epic 5: BTP-NIPs Core Protocol Implementation

**Goal:** Implement the BTP-NIPs protocol that embeds Nostr events inside ILP STREAM packets, enabling native payment-content coupling for the peer-to-peer network.

**Key Innovation:** Instead of bolting payments onto Nostr (separate protocols), BTP-NIPs achieves **atomic payment-content delivery** where every Nostr message travels inside an ILP packet. This leverages ILP's existing multi-hop routing, encryption, and payment guarantees for event propagation.

**Architecture Context:** This epic integrates with Dassie's existing ILP packet handling infrastructure. We add custom packet handlers that extract Nostr events from the ILP packet `data` field, verify Nostr signatures, store events in PostgreSQL, and manage subscriptions. Dassie's built-in peer discovery (BNL/KNL) and routing are reused without modification.

---

## Story 5.1: BTP-NIPs Packet Parser

**As a** developer,
**I want** to parse Nostr events from ILP STREAM packets,
**so that** Dassie can process BTP-NIPs messages.

**Acceptance Criteria:**
1. Create packet parser module: `packages/app-dassie/src/btp-nips/parser.ts`
2. Parse 4-byte header:
   ```typescript
   interface BTPNIPsHeader {
     version: number;      // Byte 0: Protocol version (1)
     messageType: number;  // Byte 1: Message type (0x01=EVENT, 0x02=REQ, etc.)
     payloadLength: number; // Bytes 2-3: Payload size (uint16 big-endian)
   }
   ```
3. Parse JSON payload:
   ```typescript
   interface BTPNIPsPayload {
     payment: PaymentMetadata;
     nostr: NostrMessage;
     metadata: MessageMetadata;
   }
   ```
4. Message type enumeration:
   ```typescript
   enum NostrMessageType {
     EVENT = 0x01,
     REQ = 0x02,
     CLOSE = 0x03,
     NOTICE = 0x04,
     EOSE = 0x05,
     OK = 0x06,
     AUTH = 0x07
   }
   ```
5. Serialization (reverse):
   - Serialize header (4 bytes)
   - Serialize payload (JSON → UTF-8)
   - Concatenate header + payload
   - Return Buffer for ILP packet data field
6. Validation:
   - Verify version === 1
   - Verify message type is valid (0x01-0x07)
   - Verify payload length matches actual payload size
   - Handle malformed packets gracefully
7. Unit tests:
   - Parse valid EVENT packet
   - Parse valid REQ packet
   - Reject invalid version
   - Reject invalid message type
   - Handle truncated packets
   - Round-trip test (serialize → parse → matches original)

**Dependencies:**
- None (standalone module)

**Outputs:**
- BTP-NIPs packet parser/serializer
- TypeScript types for all message structures
- Unit test suite (>90% coverage)

---

## Story 5.2: EVENT Message Handler

**As a** peer,
**I want** to receive and process EVENT messages via ILP,
**so that** I can store events published by other peers.

**Acceptance Criteria:**
1. Create EVENT handler: `packages/app-dassie/src/btp-nips/handlers/event-handler.ts`
2. Integrate with Dassie's ILP packet processing:
   - Hook into `ProcessPacket` actor
   - Extract BTP-NIPs data from ILP packet `data` field
   - Parse using Story 5.1 parser
3. Validation logic:
   - Verify ILP payment (STREAM validates automatically)
   - Verify Nostr signature: `verifySignature(event)`
   - Verify event ID: `sha256(serialized) === event.id`
   - Verify event is not duplicate (check database)
4. Storage:
   - Save event to PostgreSQL
   - Update Redis cache
   - Emit local topic for UI notification
5. Payment handling:
   - If payment insufficient → Reject ILP packet
   - If payment valid but event invalid → Fulfill ILP packet but log error
   - If both valid → Fulfill ILP packet and store event
6. Integration with Dassie reactor:
   ```typescript
   export const EventHandlerActor = (reactor: DassieReactor) => {
     return createActor(async (sig) => {
       sig.on(BTPNIPsPacketTopic, async (packet) => {
         if (packet.messageType === NostrMessageType.EVENT) {
           await handleEvent(packet.nostr, packet.payment);
         }
       });
     });
   };
   ```
7. Tests:
   - Valid EVENT → stored successfully
   - Insufficient payment → rejected
   - Invalid signature → rejected, payment still fulfilled
   - Duplicate event → ignored
   - Integration test: Send EVENT via ILP end-to-end

**Dependencies:**
- Story 5.1 complete (parser ready)
- PostgreSQL schema created (Story 5.4)

**Outputs:**
- EVENT message handler
- Integration with Dassie packet processing
- End-to-end EVENT publishing test

---

## Story 5.3: REQ/CLOSE Subscription Handler

**As a** peer,
**I want** to handle subscription requests via ILP,
**so that** other peers can subscribe to my events.

**Acceptance Criteria:**
1. Create REQ handler: `packages/app-dassie/src/btp-nips/handlers/req-handler.ts`
2. Handle REQ packet:
   - Extract subscription ID and filters
   - Validate payment (subscription duration × cost)
   - Query database for matching stored events
   - Send EVENT packets via ILP (stream response)
   - Send EOSE packet (end of stored events)
   - Register subscription in SubscriptionManager
3. Subscription structure:
   ```typescript
   interface Subscription {
     id: string;
     subscriber: string;        // ILP address of subscriber
     streamConnection: StreamConnection;
     filters: NostrFilter[];
     expiresAt: number;
     active: boolean;
   }
   ```
4. Create CLOSE handler: `packages/app-dassie/src/btp-nips/handlers/close-handler.ts`
5. Handle CLOSE packet:
   - Remove subscription from SubscriptionManager
   - Send CLOSED confirmation
   - Fulfill ILP packet
6. Subscription payment model:
   ```typescript
   function calculateSubscriptionCost(ttl: number): number {
     const costPerHour = 5000; // 5000 msats per hour
     const hours = Math.ceil(ttl / 3600);
     return costPerHour * hours;
   }
   ```
7. Tests:
   - REQ with valid payment → subscription created
   - REQ with insufficient payment → rejected
   - CLOSE → subscription removed
   - Subscription expiry → auto-closed after TTL
   - Multiple subscriptions from same peer

**Dependencies:**
- Story 5.1 complete (parser)
- Story 5.2 complete (EVENT handler for response)
- Story 5.5 complete (SubscriptionManager)

**Outputs:**
- REQ/CLOSE handlers
- Subscription lifecycle management
- Integration tests

---

## Story 5.4: Redis Caching & Tag Filtering ✅

**Status:** Done (Scope reduced from original "Nostr Storage Layer Enhancements")

**As a** peer,
**I want** Redis caching and advanced tag filtering for event queries,
**so that** I can efficiently serve events with sub-100ms query latency.

**Acceptance Criteria:**
1. Implement Redis caching layer for hot events (24h TTL)
2. Add tag-based filtering using JSONB GIN index (`#e`, `#p`, `#a`)
3. Integrate cache-aside pattern for event retrieval and queries
4. Add database schema enhancements (is_deleted, expires_at columns for future stories)

**Outputs:**
- Enhanced EventCache with query caching and SHA-256 filter hashing
- EventRepository with cache integration and JSONB tag filtering
- Database migration with lifecycle columns

---

## Story 5.6: Event Lifecycle Management (NIP-09/40)

**As a** peer,
**I want** to handle event deletion and expiration per Nostr NIPs,
**so that** users can delete their events and set expiration timestamps.

**Acceptance Criteria:**
1. Implement NIP-09 event deletion handler (soft delete)
2. Implement NIP-40 event expiration (tag extraction, validation)
3. Create expiration cleanup background task (hourly)
4. Tests for deletion and expiration workflows

**Dependencies:**
- Story 5.4 complete (migration with lifecycle columns)

**Outputs:**
- Deletion handler utility (NIP-09)
- Expiration tag extraction and cleanup actor (NIP-40)
- Integration tests for event lifecycle

---

## Story 5.7: Storage Statistics & Dashboard Integration

**As a** relay operator,
**I want** real-time storage statistics and dashboard monitoring,
**so that** I can track event storage, query performance, and cache efficiency.

**Acceptance Criteria:**
1. Create storage statistics module (event counts, storage size, cache metrics)
2. Implement query performance monitoring (ring buffer, percentiles)
3. Add dashboard API endpoint (`GET /dashboard/storage`)
4. Performance optimization and benchmarks

**Dependencies:**
- Story 5.4 complete (EventCache and EventRepository)

**Outputs:**
- StorageStats module
- QueryMonitor middleware
- Dashboard API endpoint
- Performance benchmarks

---

## Story 5.5: Subscription Manager

**As a** peer,
**I want** efficient subscription matching,
**so that** new events are delivered only to relevant subscribers.

**Acceptance Criteria:**
1. Create subscription manager: `packages/app-dassie/src/btp-nips/subscription-manager.ts`
2. Subscription storage (in-memory + PostgreSQL):
   ```typescript
   class SubscriptionManager {
     private subscriptions: Map<string, Subscription>;
     private index: SubscriptionIndex;

     async addSubscription(sub: Subscription): Promise<void>
     async removeSubscription(id: string): Promise<void>
     findMatchingSubscriptions(event: NostrEvent): Subscription[]
     getActiveSubscriptions(): Subscription[]
   }
   ```
3. Subscription indexing for performance:
   - Index by author (author → subscription IDs)
   - Index by kind (kind → subscription IDs)
   - Index by tags (tag → subscription IDs)
   - O(1) lookup instead of O(n) scan
4. Event matching algorithm:
   ```typescript
   function eventMatchesFilter(event: NostrEvent, filter: NostrFilter): boolean {
     // Check IDs, authors, kinds, timestamps, tags
     // Return true if event matches filter
   }
   ```
5. Subscription expiration:
   - Background actor checks subscriptions every minute
   - Close expired subscriptions (expiresAt < now)
   - Send CLOSED message to subscriber
6. Event propagation:
   - When new event stored → check all active subscriptions
   - Find matching subscriptions (use index)
   - Send EVENT packet to each matching subscriber via ILP
7. Tests:
   - Add/remove subscriptions
   - Match events by author, kind, tags
   - Expiration handling
   - Performance: 10,000 subscriptions, O(log n) matching

**Dependencies:**
- Story 5.1 complete (parser)
- Story 5.4 complete (storage)

**Outputs:**
- Subscription manager with indexing
- Event matching engine
- Performance-optimized filtering

---

## Story 5.8: BTP-NIPs Integration Tests

**As a** developer,
**I want** end-to-end tests for the complete BTP-NIPs protocol,
**so that** I can verify all components work together.

**Acceptance Criteria:**
1. Test environment (2 Dassie nodes: Alice, Bob with PostgreSQL)
2. Test: Publish Event (Alice → Bob via ILP)
3. Test: Subscribe and Receive (REQ, EOSE, streaming events)
4. Test: Close Subscription (CLOSE, CLOSED confirmation)
5. Test: Subscription Expiry (TTL enforcement)
6. Test: Multi-Hop Routing (Alice → Bob → Carol)
7. Test: Payment Failures (insufficient payment, invalid signature)
8. Performance tests (100 events/sec, <100ms latency, 1000 subscriptions)

**Dependencies:**
- All stories 5.1-5.7 complete

**Outputs:**
- Comprehensive integration test suite
- Performance benchmarks
- End-to-end validation

---

## Epic 5 Summary

**Stories:** 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8 (8 stories)
**Timeline:** 5-6 weeks (adjusted for story split)
**Output:** Complete BTP-NIPs protocol implementation, ready for peer-to-peer network

**Story Sequence:**
1. **5.1** - BTP-NIPs Packet Parser ✅
2. **5.2** - EVENT Message Handler ✅
3. **5.3** - REQ/CLOSE Subscription Handler ✅
4. **5.4** - Redis Caching & Tag Filtering ✅
5. **5.5** - Subscription Manager (in progress)
6. **5.6** - Event Lifecycle Management (NIP-09/40) (new)
7. **5.7** - Storage Statistics & Dashboard Integration (new)
8. **5.8** - BTP-NIPs Integration Tests (renumbered from 5.6)

**Key Deliverables:**
- Nostr events embedded in ILP packets ✅
- EVENT, REQ, CLOSE message handlers ✅
- PostgreSQL storage with efficient querying ✅
- Redis caching and JSONB tag filtering ✅
- Event lifecycle management (deletion, expiration)
- Storage statistics and monitoring
- Subscription management with indexing
- End-to-end integration tests

---
