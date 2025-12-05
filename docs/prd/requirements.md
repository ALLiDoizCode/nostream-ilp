# Requirements

## Functional Requirements

**BTP-NIPs Protocol (Core)**
- **FR1:** The system shall embed Nostr events inside ILP STREAM packets (BTP-NIPs protocol)
- **FR2:** The system shall parse 4-byte BTP-NIPs header (version, message type, payload length)
- **FR3:** The system shall support Nostr message types: EVENT, REQ, CLOSE, EOSE, OK, NOTICE, AUTH
- **FR4:** The system shall validate both ILP payment (STREAM) and Nostr signature (secp256k1) atomically
- **FR5:** The system shall maintain bidirectional ILP STREAM connections for subscriptions

**Nostr Storage (Local Peer Storage)**
- **FR6:** The system shall store Nostr events in PostgreSQL database with indexing by id, pubkey, kind, and tags
- **FR7:** The system shall support Nostr subscription filters (authors, kinds, tags, since, until, limit)
- **FR8:** The system shall query events matching subscription filters in <100ms
- **FR9:** The system shall deduplicate events (reject duplicates based on event.id)
- **FR10:** The system shall cache recent events in Redis for fast retrieval

**Peer-to-Peer Networking**
- **FR11:** The system shall publish ILP Node Announcement (Kind 32001) on startup
- **FR12:** The system shall resolve Nostr pubkeys to ILP addresses via Kind 32001 queries
- **FR13:** The system shall integrate with Dassie's peer discovery (BNL/KNL)
- **FR14:** The system shall automatically subscribe to followed users (Kind 3 integration)
- **FR15:** The system shall propagate events to subscribed peers via ILP routing

**Base L2 Payment Channels**
- **FR16:** The system shall support unidirectional payment channels on Base L2
- **FR17:** The system shall support ETH and USDC as payment tokens
- **FR18:** The system shall allow sender to top-up payment channel without closing
- **FR19:** The system shall batch multiple payment claims into single on-chain settlement
- **FR20:** The system shall settle payment channels periodically (daily or when threshold reached)

**Economic Monitoring**
- **FR21:** The system shall track revenue in USD from subscriptions and routing fees
- **FR22:** The system shall query CoinGecko API for ETH/USD, USDC/USD, AKT/USD prices
- **FR23:** The system shall calculate net profitability (revenue - expenses) in real-time
- **FR24:** The system shall expose economic metrics via web dashboard

**Akash Integration**
- **FR25:** The system shall manage Akash wallet using Cosmos SDK
- **FR26:** The system shall query Akash wallet balance and escrow balance
- **FR27:** The system shall execute Cosmos transactions to deposit AKT to escrow
- **FR28:** The system shall maintain minimum 7-day buffer in Akash escrow
- **FR29:** The system shall alert if escrow balance < 3 days of hosting costs

**ILP Connector Functionality (Dassie Built-In)**
- **FR30:** Dassie node shall operate as ILP connector, routing BTP-NIPs packets between peers
- **FR31:** Dassie node shall use BNL/KNL for peer discovery (built-in)
- **FR32:** Dassie node shall forward ILP packets to next-hop peers based on routing table
- **FR33:** Dassie node shall earn routing fees on forwarded BTP-NIPs packets (1% configurable)

## Non-Functional Requirements

**Performance**
- **NFR1:** The system shall process at least 100 BTP-NIPs events per second per peer
- **NFR2:** Payment validation via ILP STREAM shall complete atomically (built-in)
- **NFR3:** Event propagation latency shall be <100ms p50, <300ms p95
- **NFR4:** Subscription queries shall return results in <100ms

**Reliability**
- **NFR5:** The system shall persist all state (events, subscriptions, channels) to survive crashes
- **NFR6:** The system shall automatically reconnect to peers after restart
- **NFR7:** The system shall provide health check endpoint for Akash orchestration
- **NFR8:** The system shall achieve 99%+ uptime (excluding planned maintenance)

**Security**
- **NFR9:** The system shall verify Nostr signatures (secp256k1) for all events
- **NFR10:** The system shall track nonces in payment channels to prevent double-spending
- **NFR11:** The system shall rate limit ILP connections (max 100 peers)
- **NFR12:** Private keys (Nostr, Akash, Base) shall be stored encrypted at rest
- **NFR13:** The system shall use ILP's built-in encryption (HTTPS + HMAC-SHA256)

**Compatibility**
- **NFR14:** The system shall run as Docker containers deployable via Akash SDL
- **NFR15:** The system shall use Node.js 22.x and TypeScript
- **NFR16:** The system shall interoperate with other BTP-NIPs peers (Dassie-based)

**Economic Viability**
- **NFR17:** The system shall achieve break-even (revenue ≥ expenses) within 30 days with 50+ followers
- **NFR18:** The system shall maintain at least 7 days of Akash hosting reserves in escrow
- **NFR19:** The system shall track profitability and alert if profit < 110% target

**Scalability**
- **NFR20:** Akash deployment shall cost <$5/month for single peer node
- **NFR21:** The system shall support 1,000+ active subscriptions per peer
- **NFR22:** The network shall scale via peer addition (horizontal peer growth)

---
