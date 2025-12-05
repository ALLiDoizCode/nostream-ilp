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

## Story 5.4: Nostr Storage Layer

**As a** peer,
**I want** persistent storage for Nostr events,
**so that** I can query and serve events to subscribers.

**Acceptance Criteria:**
1. PostgreSQL schema:
   ```sql
   CREATE TABLE events (
     id VARCHAR(64) PRIMARY KEY,
     pubkey VARCHAR(64) NOT NULL,
     created_at INTEGER NOT NULL,
     kind INTEGER NOT NULL,
     tags JSONB NOT NULL,
     content TEXT NOT NULL,
     sig VARCHAR(128) NOT NULL,
     received_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE INDEX idx_events_pubkey ON events(pubkey);
   CREATE INDEX idx_events_kind ON events(kind);
   CREATE INDEX idx_events_created_at ON events(created_at);
   CREATE INDEX idx_events_tags ON events USING GIN(tags);
   ```
2. Storage module: `packages/nostr-storage/src/index.ts`
3. CRUD operations:
   - `saveEvent(event)` - Insert with conflict handling
   - `getEvent(id)` - Query by ID
   - `queryEvents(filters)` - Query with NostrFilter
   - `deleteEvent(id)` - Mark as deleted (soft delete)
4. Filter query builder:
   - Support `authors`, `kinds`, `ids`, `since`, `until`, `limit`
   - Support tag filters (`#e`, `#p`, etc.)
   - Build efficient SQL queries
5. Redis caching:
   - Cache recent events (last 24 hours)
   - Cache popular queries
   - Invalidate on new events
6. Performance:
   - Query with complex filters < 100ms
   - Store event < 10ms
   - Support 1,000+ events/sec write throughput
7. Tests:
   - Save and retrieve events
   - Query with various filters
   - Tag filter queries
   - Cache hit/miss behavior
   - Concurrent writes (race conditions)

**Dependencies:**
- None (standalone module)

**Outputs:**
- Nostr storage layer
- PostgreSQL schema migration
- Redis caching layer

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

## Story 5.6: BTP-NIPs Integration Tests

**As a** developer,
**I want** end-to-end tests for the complete BTP-NIPs protocol,
**so that** I can verify all components work together.

**Acceptance Criteria:**
1. Test environment:
   - Spin up 2 Dassie nodes (Alice, Bob)
   - Initialize PostgreSQL for both
   - Connect nodes as ILP peers
2. Test: Publish Event
   - Alice publishes EVENT via ILP
   - Bob receives and stores
   - Verify event in Bob's database
3. Test: Subscribe and Receive
   - Bob sends REQ to Alice with payment
   - Alice sends stored events
   - Alice sends EOSE
   - Alice publishes new event
   - Bob receives new event via subscription
4. Test: Close Subscription
   - Bob sends CLOSE
   - Alice stops sending events
   - Alice sends CLOSED confirmation
5. Test: Subscription Expiry
   - Bob subscribes with 5-second TTL
   - Wait 6 seconds
   - Verify Alice auto-closed subscription
6. Test: Multi-Hop Routing
   - Set up 3 nodes: Alice → Bob → Carol
   - Alice subscribes to Carol (routed through Bob)
   - Carol publishes event
   - Event propagates: Carol → Bob → Alice
   - Verify Alice receives event
7. Test: Payment Failures
   - Insufficient payment → REQ rejected
   - Invalid signature → EVENT rejected but payment fulfilled
8. Performance tests:
   - 100 events/sec throughput
   - <100ms p50 latency
   - 1,000 active subscriptions

**Dependencies:**
- All stories 5.1-5.5 complete

**Outputs:**
- Comprehensive integration test suite
- Performance benchmarks
- End-to-end validation

---

## Epic 5 Summary

**Stories:** 5.1, 5.2, 5.3, 5.4, 5.5, 5.6 (6 stories)
**Timeline:** 4 weeks
**Output:** Complete BTP-NIPs protocol implementation, ready for peer-to-peer network

**Key Deliverables:**
- Nostr events embedded in ILP packets ✅
- EVENT, REQ, CLOSE message handlers ✅
- PostgreSQL storage with efficient querying ✅
- Subscription management with indexing ✅
- End-to-end integration tests ✅

---
