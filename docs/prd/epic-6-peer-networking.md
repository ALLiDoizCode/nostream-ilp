# Epic 6: Peer Networking & Social Graph Integration

**Goal:** Integrate Nostr's social layer (follow lists, user discovery) with Dassie's network layer (ILP peer discovery, routing) to create seamless peer-to-peer connections.

**Key Innovation:** Map Nostr public keys to ILP addresses via **Kind 32001 (ILP Node Announcement)** events, enabling users to follow each other using familiar Nostr social mechanics while leveraging Dassie's built-in peer discovery (BNL/KNL) for network routing.

**Architecture Context:** This epic bridges two discovery systems: Nostr (social graph) and Dassie (network graph). When Alice follows Bob (Kind 3), the system automatically resolves Bob's ILP address (Kind 32001), discovers Bob's node in the Dassie network (BNL/KNL), opens a payment channel (Base L2), and subscribes via BTP-NIPs. All peer discovery and routing leverage existing Dassie features.

---

## Story 6.1: ILP Node Announcement (Kind 32001)

**As a** peer operator,
**I want** to publish my ILP node information as a Nostr event,
**so that** others can discover and connect to my node.

**Acceptance Criteria:**
1. Define Kind 32001 event structure:
   ```typescript
   interface ILPNodeAnnouncement {
     kind: 32001;
     pubkey: string;
     tags: [
       ['d', 'ilp-node-info'],
       ['ilp-address', string],      // g.btp-nips.alice.npub1abc
       ['ilp-endpoint', string],     // https://alice-node.akash.network
       ['base-address', string],     // 0x123abc... (for payment channels)
       ['supported-tokens', string], // eth,usdc
       ['version', string],          // 1.0.0
       ['features', string]          // subscriptions,payments,routing
     ];
     content: string; // JSON metadata (optional)
     created_at: number;
     sig: string;
   }
   ```
2. Auto-publish on node startup:
   - Generate ILP address from node ID and pubkey
   - Get public endpoint from Akash deployment
   - Get Base address from wallet
   - Sign and publish event
3. Update announcement when configuration changes:
   - Endpoint changes (new Akash deployment)
   - Features added/removed
   - Supported tokens changed
4. Query module: `packages/app-dassie/src/peer-discovery/ilp-announcement.ts`
   - Query for peer's Kind 32001 event
   - Cache results (TTL: 1 hour)
   - Handle missing announcements gracefully
5. Announcement validation:
   - Verify Nostr signature
   - Verify ILP address format
   - Verify endpoint is valid URL
   - Verify Base address is valid Ethereum address
6. Tests:
   - Publish announcement on startup
   - Query peer's announcement
   - Cache hit/miss behavior
   - Handle stale announcements

**Dependencies:**
- Epic 5 complete (can publish/query events)

**Outputs:**
- Kind 32001 event specification
- Auto-publish on startup
- Query and caching module

---

## Story 6.2: Nostr-to-ILP Address Resolution

**As a** peer operator,
**I want** to resolve Nostr pubkeys to ILP addresses,
**so that** I can send payments and subscriptions to followed users.

**Acceptance Criteria:**
1. Create resolver module: `packages/app-dassie/src/peer-discovery/address-resolver.ts`
2. Resolution flow:
   ```typescript
   async function resolveIlpAddress(
     nostrPubkey: string
   ): Promise<ILPPeerInfo | null> {
     // 1. Check cache
     const cached = await cache.get(`ilp:${nostrPubkey}`);
     if (cached) return cached;

     // 2. Query for Kind 32001
     const announcement = await storage.queryEvents({
       kinds: [32001],
       authors: [nostrPubkey],
       '#d': ['ilp-node-info'],
       limit: 1
     });

     if (!announcement) return null;

     // 3. Extract peer info
     const peerInfo = parseNodeAnnouncement(announcement);

     // 4. Cache result
     await cache.set(`ilp:${nostrPubkey}`, peerInfo, 3600);

     return peerInfo;
   }
   ```
3. Handle missing announcements:
   - Return null (peer not on BTP-NIPs network)
   - Log warning
   - UI should show "Peer not available"
4. Handle stale announcements:
   - Refresh cache every hour
   - Query for newer announcements
   - Update cached data
5. Batch resolution (performance optimization):
   - Resolve multiple pubkeys in single query
   - Use `IN` clause for authors
6. Tests:
   - Resolve existing peer → success
   - Resolve non-existent peer → null
   - Cache behavior
   - Batch resolution

**Dependencies:**
- Story 6.1 complete (Kind 32001 defined)

**Outputs:**
- Address resolution module
- Caching layer
- Batch query optimization

---

## Story 6.3: Follow List Integration (Kind 3)

**As a** peer,
**I want** automatic subscription when I follow someone,
**so that** I receive their events without manual subscription.

**Acceptance Criteria:**
1. Monitor Kind 3 (Contact List) events:
   - Watch for local user's Kind 3 updates
   - Extract followed pubkeys from `p` tags
   - Detect additions/removals
2. Auto-subscribe logic:
   ```typescript
   async function handleFollowListUpdate(followList: Kind3Event) {
     const currentFollows = extractPubkeys(followList.tags);
     const previousFollows = await getStoredFollowList();

     // New follows
     const added = currentFollows.filter(p => !previousFollows.includes(p));

     for (const pubkey of added) {
       await subscribeTouser(pubkey);
     }

     // Unfollows
     const removed = previousFollows.filter(p => !currentFollows.includes(p));

     for (const pubkey of removed) {
       await unsubscribeFromPeer(pubkey);
     }

     await storeFollowList(currentFollows);
   }
   ```
3. Subscribe to peer flow:
   - Resolve ILP address (Story 6.2)
   - Discover peer in Dassie network
   - Check if payment channel exists
   - If not, prompt user to open channel
   - Send REQ packet with payment
4. Unsubscribe flow:
   - Send CLOSE packet
   - Remove from active subscriptions
   - Optionally: Close payment channel (if no other subscriptions)
5. Subscription preferences:
   - Default filters per follow (configurable)
   - Default subscription duration (1 day, renew automatically)
   - Payment amount per subscription
6. Tests:
   - Add follow → auto-subscribe
   - Remove follow → auto-unsubscribe
   - Update follow list → sync subscriptions
   - Handle missing peers gracefully

**Dependencies:**
- Story 6.2 complete (address resolution)
- Epic 5 complete (can send REQ/CLOSE)

**Outputs:**
- Follow list monitoring
- Auto-subscribe/unsubscribe logic
- Subscription preferences

---

## Story 6.4: Event Propagation Logic

**As a** peer,
**I want** to forward events to subscribed peers,
**so that** events propagate through the network.

**Acceptance Criteria:**
1. Create propagation module: `packages/app-dassie/src/btp-nips/event-propagation.ts`
2. Propagation actor:
   ```typescript
   export const EventPropagationActor = (reactor: DassieReactor) => {
     return createActor(async (sig) => {
       // Listen for new events (local or received)
       sig.on(NewEventTopic, async (event) => {
         // Find subscriptions that match
         const subscribers = await subscriptionManager.findMatching(event);

         // Send to each subscriber via ILP
         for (const sub of subscribers) {
           await sendEventPacket(sub.streamConnection, event);
         }
       });
     });
   };
   ```
3. Deduplication:
   - Track event IDs already seen
   - Don't propagate duplicates
   - Expire dedup cache after 24 hours
4. Propagation limits:
   - Max hops: 5 (prevent infinite loops)
   - TTL in packet metadata (decrement each hop)
   - Drop if TTL reaches 0
5. Routing optimization:
   - Don't send back to source
   - Don't send to peer who already has it
   - Track which peers have which events
6. Bandwidth management:
   - Rate limit events per peer (100 events/sec max)
   - Prioritize by subscription payment amount
   - Queue if rate limit exceeded
7. Tests:
   - Event propagates to subscribers
   - Deduplication works
   - TTL enforcement
   - No infinite loops
   - Multi-hop propagation (Alice → Bob → Carol)

**Dependencies:**
- Story 5.5 complete (subscription manager)
- Story 5.2 complete (EVENT handler)

**Outputs:**
- Event propagation logic
- Deduplication system
- Multi-hop routing with TTL

---

## Story 6.5: Peer Connection Lifecycle

**As a** peer operator,
**I want** automated peer connection management,
**so that** connections are established and maintained efficiently.

**Acceptance Criteria:**
1. Connection states:
   ```typescript
   enum PeerConnectionState {
     DISCOVERING = 'discovering',     // Querying BNL/KNL
     CONNECTING = 'connecting',       // Establishing ILP session
     CHANNEL_NEEDED = 'channel_needed', // Need payment channel
     CHANNEL_OPENING = 'channel_opening', // Waiting for on-chain TX
     CONNECTED = 'connected',         // Fully operational
     DISCONNECTED = 'disconnected',   // Connection lost
     FAILED = 'failed'                // Connection failed
   }
   ```
2. Connection workflow:
   - DISCOVERING: Query for peer's ILP address (Kind 32001)
   - CONNECTING: Establish Dassie ILP session
   - CHANNEL_NEEDED: Prompt user to open payment channel
   - CHANNEL_OPENING: Wait for Base L2 confirmation
   - CONNECTED: Send initial REQ, start receiving events
3. Connection persistence:
   - Store peer connections in database
   - Reconnect on node restart
   - Retry failed connections (exponential backoff)
4. Heartbeat mechanism:
   - Send ping every 60 seconds
   - Expect pong within 10 seconds
   - Mark disconnected if no response
5. Connection prioritization:
   - Follow list peers (high priority)
   - Well-connected peers (routing)
   - Low-latency peers (performance)
6. Tests:
   - Full connection lifecycle
   - Reconnection after restart
   - Heartbeat timeout handling
   - Connection recovery

**Dependencies:**
- Story 6.2 complete (address resolution)
- Epic 4 complete (payment channels)

**Outputs:**
- Peer connection state machine
- Automated connection management
- Reconnection logic

---

## Epic 6 Summary

**Stories:** 6.1, 6.2, 6.3, 6.4, 6.5 (5 stories)
**Timeline:** 2 weeks
**Output:** Complete peer networking layer integrating Nostr social graph with Dassie ILP network

**Key Deliverables:**
- ILP node announcements (Kind 32001) ✅
- Nostr → ILP address resolution ✅
- Follow list → auto-subscribe ✅
- Event propagation with deduplication ✅
- Peer connection lifecycle management ✅

---
