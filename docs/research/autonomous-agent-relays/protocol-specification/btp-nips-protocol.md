# BTP-NIPs Protocol Specification

**Version:** 1.0.0
**Status:** Draft
**Authors:** Nostr-ILP Integration Team
**Date:** 2025-12-05

---

## Table of Contents

1. [Overview](#overview)
2. [Design Goals](#design-goals)
3. [Protocol Architecture](#protocol-architecture)
4. [Packet Structure](#packet-structure)
5. [Message Type Mapping](#message-type-mapping)
6. [Payment Semantics](#payment-semantics)
7. [Routing Semantics](#routing-semantics)
8. [Security Considerations](#security-considerations)
9. [Examples](#examples)
10. [Interoperability](#interoperability)

---

## Overview

### Motivation

BTP-NIPs (Bilateral Transfer Protocol for Nostr Implementation Possibilities) is a protocol specification for embedding Nostr protocol messages within Interledger Protocol (ILP) packets. This enables:

1. **Micropayment-Native Messaging:** Every Nostr message can include a payment
2. **Decentralized Routing:** Leverage ILP's multi-hop routing infrastructure
3. **Autonomous Agent Relays:** Enable AI agents to operate relays and route messages economically
4. **Cross-Network Bridging:** Connect traditional Nostr relays with ILP-based agent networks

### Protocol Layering

```
┌─────────────────────────────────────┐
│     Nostr Application Layer         │
│  (Events, Subscriptions, Profiles)  │
├─────────────────────────────────────┤
│      BTP-NIPs Message Layer         │
│  (EVENT, REQ, CLOSE, NOTICE, etc.)  │
├─────────────────────────────────────┤
│    ILP Packet Layer (STREAM)        │
│  (Prepare, Fulfill, Reject)         │
├─────────────────────────────────────┤
│      Transport Layer                │
│  (Encrypted UDP in Dassie)          │
└─────────────────────────────────────┘
```

### Key Features

- **Backwards Compatible:** Bridge to WebSocket relays
- **Payment-First:** All messages can carry micropayments
- **Efficient:** Optimized for 32 KB ILP packet limit
- **Extensible:** Support for future NIPs
- **Secure:** Preserves Nostr's cryptographic signatures

---

## Design Goals

### Primary Goals

1. **Enable Micropayments:** Every Nostr interaction can include a payment (e.g., pay-per-event, pay-per-subscription)
2. **Autonomous Agent Support:** AI agents can route messages and earn fees
3. **Decentralization:** No central relay operator required
4. **Efficiency:** Minimize overhead while maintaining compatibility

### Non-Goals

1. **Real-Time Broadcast:** Not optimized for high-frequency streaming (use traditional relays)
2. **Large File Transfer:** Use Arweave references for large content
3. **Video Streaming:** Out of scope for BTP-NIPs

---

## Protocol Architecture

### Address Scheme

BTP-NIPs uses a hierarchical ILP address scheme to map Nostr public keys to ILP addresses:

```
g.btp-nips.<relay-id>.<npub-prefix>
```

**Examples:**
```
g.btp-nips.alice-relay.npub1a2b3c4d
g.btp-nips.agent007.npub1xyz789
```

**Components:**
- `g`: Global ILP address prefix
- `btp-nips`: Protocol identifier
- `<relay-id>`: Relay or agent node identifier
- `<npub-prefix>`: First 10 characters of Nostr npub (for routing)

**Full Npub Encoding:**
The complete Nostr public key is included in the packet payload, not the ILP address.

### Connection Model

**Peer-to-Peer:**
```
Client (Dassie Node)
    ↓ ILP Packet
Relay Agent (Dassie Node)
    ↓ ILP Packet
Peer Agent (Dassie Node)
    ↓ ILP Packet
Destination Client (Dassie Node)
```

**Bridge Model:**
```
Client (WebSocket)
    ↓ WebSocket
Bridge Relay (BTP-NIPs ↔ WebSocket)
    ↓ ILP Packet
Agent Network (Dassie Nodes)
```

---

## Packet Structure

### High-Level Structure

Every BTP-NIPs message is encoded as an ILP STREAM packet with custom application data:

```typescript
interface BTPNIPsPacket {
  // ILP Layer
  ilp: {
    type: 'prepare' | 'fulfill' | 'reject';
    amount: string;              // Amount in base units (e.g., msats)
    destination: string;          // ILP address
    expiresAt: Date;
    executionCondition?: Buffer;  // 32-byte SHA-256 hash
    fulfillment?: Buffer;         // 32-byte preimage
    data: Buffer;                 // Encrypted STREAM frames
  };

  // BTP-NIPs Application Layer (inside ILP data field)
  btpNips: {
    version: number;              // Protocol version (1)
    messageType: NostrMessageType;
    payment: PaymentMetadata;
    nostr: NostrMessage;
    metadata: MessageMetadata;
  };
}
```

### NostrMessageType Enumeration

```typescript
enum NostrMessageType {
  EVENT = 0x01,        // Nostr EVENT message
  REQ = 0x02,          // Subscription request
  CLOSE = 0x03,        // Close subscription
  NOTICE = 0x04,       // Relay notice
  EOSE = 0x05,         // End of stored events
  OK = 0x06,           // Command result
  AUTH = 0x07,         // NIP-42 authentication
  COUNT = 0x08,        // NIP-45 event count
  CLOSED = 0x09,       // Subscription closed by relay
}
```

### PaymentMetadata Structure

```typescript
interface PaymentMetadata {
  amount: string;           // Payment amount (0 for free events)
  currency: string;         // e.g., "msat", "usd", "xrp"
  purpose: PaymentPurpose;
  feeSchedule?: FeeSchedule;
}

enum PaymentPurpose {
  EVENT_PUBLISH = 'event_publish',
  SUBSCRIPTION = 'subscription',
  RELAY_FEE = 'relay_fee',
  AGENT_FEE = 'agent_fee',
  CONTENT_PURCHASE = 'content_purchase',
  TIP = 'tip',
}

interface FeeSchedule {
  baseRelayFee: string;        // Relay processing fee
  agentRoutingFee: string;     // Agent routing fee (per hop)
  contentFee?: string;         // Content-specific fee (e.g., Arweave)
  total: string;               // Total amount
}
```

### NostrMessage Union Type

```typescript
type NostrMessage =
  | EventMessage
  | ReqMessage
  | CloseMessage
  | NoticeMessage
  | EoseMessage
  | OkMessage
  | AuthMessage
  | CountMessage
  | ClosedMessage;

interface EventMessage {
  type: 'EVENT';
  subscriptionId?: string;  // Optional for unsolicited events
  event: NostrEvent;
}

interface ReqMessage {
  type: 'REQ';
  subscriptionId: string;
  filters: NostrFilter[];
}

interface CloseMessage {
  type: 'CLOSE';
  subscriptionId: string;
}

interface NoticeMessage {
  type: 'NOTICE';
  message: string;
}

interface EoseMessage {
  type: 'EOSE';
  subscriptionId: string;
}

interface OkMessage {
  type: 'OK';
  eventId: string;
  accepted: boolean;
  message: string;
}

interface AuthMessage {
  type: 'AUTH';
  challenge: string;
}

interface CountMessage {
  type: 'COUNT';
  subscriptionId: string;
  count: number;
}

interface ClosedMessage {
  type: 'CLOSED';
  subscriptionId: string;
  reason: string;
}
```

### MessageMetadata Structure

```typescript
interface MessageMetadata {
  timestamp: number;           // Unix timestamp (seconds)
  relaySignature?: string;     // Optional relay signature
  routingHints?: RoutingHint[];
  ttl?: number;                // Time-to-live (seconds)
  priority?: number;           // 0-255 (higher = more important)
}

interface RoutingHint {
  nodeId: string;              // ILP address of suggested route
  fee: string;                 // Estimated fee for this route
  reliability: number;         // 0.0-1.0 reliability score
}
```

### Complete TypeScript Type Definitions

```typescript
import { NostrEvent, NostrFilter } from 'nostr-tools';

/**
 * BTP-NIPs Protocol Version
 */
export const BTP_NIPS_VERSION = 1;

/**
 * Maximum packet size (ILP limit)
 */
export const MAX_PACKET_SIZE = 32767; // 32 KB

/**
 * Maximum Nostr event size (allows overhead for metadata)
 */
export const MAX_EVENT_SIZE = 30000; // ~30 KB

/**
 * Complete BTP-NIPs packet structure
 */
export interface BTPNIPsEnvelope {
  version: number;
  messageType: NostrMessageType;
  payment: PaymentMetadata;
  nostr: NostrMessage;
  metadata: MessageMetadata;
}

/**
 * Serialized format for transmission
 */
export interface SerializedBTPNIPsPacket {
  // Header (fixed size)
  header: {
    version: number;        // 1 byte
    messageType: number;    // 1 byte
    payloadLength: number;  // 2 bytes (big-endian)
  };

  // Payload (variable size, JSON-encoded)
  payload: Buffer;
}
```

---

## Message Type Mapping

### EVENT Message

**Nostr (WebSocket):**
```json
["EVENT", "subscription-id", { event object }]
```

**BTP-NIPs:**
```typescript
{
  version: 1,
  messageType: NostrMessageType.EVENT,
  payment: {
    amount: "1000",
    currency: "msat",
    purpose: PaymentPurpose.EVENT_PUBLISH,
    feeSchedule: {
      baseRelayFee: "100",
      agentRoutingFee: "50",
      total: "150"
    }
  },
  nostr: {
    type: "EVENT",
    subscriptionId: "sub-123",
    event: { /* NostrEvent */ }
  },
  metadata: {
    timestamp: 1733414400,
    priority: 128
  }
}
```

**Payment Flow:**
1. Client creates ILP Prepare packet with payment amount
2. Relay validates event, stores it
3. Relay returns ILP Fulfill with proof (event ID hash)

### REQ (Subscription)

**Nostr (WebSocket):**
```json
["REQ", "subscription-id", { filter1 }, { filter2 }]
```

**BTP-NIPs:**
```typescript
{
  version: 1,
  messageType: NostrMessageType.REQ,
  payment: {
    amount: "500",
    currency: "msat",
    purpose: PaymentPurpose.SUBSCRIPTION,
    feeSchedule: {
      baseRelayFee: "500",
      total: "500"
    }
  },
  nostr: {
    type: "REQ",
    subscriptionId: "sub-abc",
    filters: [
      { kinds: [1], authors: ["pubkey1"] },
      { kinds: [30023], "#d": ["article-slug"] }
    ]
  },
  metadata: {
    timestamp: 1733414400,
    ttl: 3600  // Subscription expires in 1 hour
  }
}
```

**Payment Flow:**
1. Client pays for subscription setup
2. Relay creates subscription, returns EOSE + matching events
3. Subsequent events may require additional payments (configurable)

### CLOSE

**Nostr (WebSocket):**
```json
["CLOSE", "subscription-id"]
```

**BTP-NIPs:**
```typescript
{
  version: 1,
  messageType: NostrMessageType.CLOSE,
  payment: {
    amount: "0",  // Free to close
    currency: "msat",
    purpose: PaymentPurpose.RELAY_FEE
  },
  nostr: {
    type: "CLOSE",
    subscriptionId: "sub-abc"
  },
  metadata: {
    timestamp: 1733414400
  }
}
```

### OK (Event Acceptance)

**Nostr (WebSocket):**
```json
["OK", "event-id", true, ""]
```

**BTP-NIPs:**
```typescript
{
  version: 1,
  messageType: NostrMessageType.OK,
  payment: {
    amount: "0",  // Response is free
    currency: "msat",
    purpose: PaymentPurpose.RELAY_FEE
  },
  nostr: {
    type: "OK",
    eventId: "abcd1234...",
    accepted: true,
    message: ""
  },
  metadata: {
    timestamp: 1733414400,
    relaySignature: "relay-sig"  // Proof of acceptance
  }
}
```

### NOTICE

**Nostr (WebSocket):**
```json
["NOTICE", "human-readable message"]
```

**BTP-NIPs:**
```typescript
{
  version: 1,
  messageType: NostrMessageType.NOTICE,
  payment: {
    amount: "0",
    currency: "msat",
    purpose: PaymentPurpose.RELAY_FEE
  },
  nostr: {
    type: "NOTICE",
    message: "Rate limit exceeded"
  },
  metadata: {
    timestamp: 1733414400
  }
}
```

### AUTH (NIP-42)

**Nostr (WebSocket):**
```json
["AUTH", "challenge-string"]
```

**BTP-NIPs:**
```typescript
{
  version: 1,
  messageType: NostrMessageType.AUTH,
  payment: {
    amount: "0",
    currency: "msat",
    purpose: PaymentPurpose.RELAY_FEE
  },
  nostr: {
    type: "AUTH",
    challenge: "random-challenge-string"
  },
  metadata: {
    timestamp: 1733414400,
    ttl: 300  // Challenge expires in 5 minutes
  }
}
```

---

## Payment Semantics

### Payment Models

#### 1. Pay-Per-Event

**Publisher Pays:**
```typescript
// Client publishes event with payment
{
  payment: {
    amount: "1000",  // 1000 msats
    purpose: PaymentPurpose.EVENT_PUBLISH
  }
}
```

**Relay's Revenue:**
- Base fee: 100 msats (relay processing)
- Agent routing: 50 msats (each hop)
- Content fee: 850 msats (if Arweave storage)

#### 2. Pay-Per-Subscription

**Subscriber Pays:**
```typescript
// Client creates subscription with payment
{
  payment: {
    amount: "5000",  // 5000 msats for 1 hour
    purpose: PaymentPurpose.SUBSCRIPTION
  },
  metadata: {
    ttl: 3600  // 1 hour
  }
}
```

**Event Delivery:**
- Option A: All events in subscription are free (included in subscription)
- Option B: Each event requires micro-payment (streaming payments)

#### 3. Free Events

**Zero-Cost Messages:**
```typescript
{
  payment: {
    amount: "0",
    purpose: PaymentPurpose.RELAY_FEE
  }
}
```

**Use Cases:**
- CLOSE messages
- NOTICE messages
- Public relay (free tier)

#### 4. Content Purchase

**Pay-Once Access:**
```typescript
{
  payment: {
    amount: "10000",  // 10,000 msats
    purpose: PaymentPurpose.CONTENT_PURCHASE,
    feeSchedule: {
      baseRelayFee: "100",
      contentFee: "9900",  // Creator's share
      total: "10000"
    }
  }
}
```

### Condition/Fulfillment Semantics

**ILP Prepare (Client → Relay):**
```typescript
{
  amount: "1000",
  destination: "g.btp-nips.alice-relay.npub1abc",
  executionCondition: SHA256(fulfillment),  // 32 bytes
  expiresAt: Date.now() + 30000,  // 30 seconds
  data: BTPNIPsEnvelope  // Encrypted
}
```

**ILP Fulfill (Relay → Client):**
```typescript
{
  fulfillment: preimage,  // 32-byte preimage
  data: {
    // Proof of relay acceptance
    eventId: "event-id-hash",
    relaySignature: "sig",
    timestamp: 1733414400
  }
}
```

**Proof-of-Relay:**
The fulfillment preimage is derived from:
```
preimage = HMAC-SHA256(relay_secret, event_id || timestamp)
```

This proves the relay accepted and stored the event.

### Fee Distribution

**Multi-Hop Routing:**
```
Client → Agent1 → Agent2 → Relay

Total Payment: 1000 msats
- Agent1 fee: 50 msats
- Agent2 fee: 50 msats
- Relay fee: 900 msats
```

**Each Hop:**
1. Receives ILP Prepare with amount
2. Deducts its fee
3. Forwards reduced amount to next hop
4. Returns ILP Fulfill back up the chain

---

## Routing Semantics

### ILP Address Format

**Mapping Nostr Pubkey to ILP Address:**

```typescript
function npubToILPAddress(npub: string, relayId: string): string {
  // Extract prefix for routing
  const prefix = npub.substring(0, 14); // "npub1" + 10 chars

  return `g.btp-nips.${relayId}.${prefix}`;
}

// Example:
npubToILPAddress(
  "npub1a2b3c4d5e6f7g8h9i0j",
  "alice-relay"
)
// → "g.btp-nips.alice-relay.npub1a2b3c4d5e"
```

**Full Pubkey in Payload:**
The complete public key is in the Nostr event:
```typescript
{
  nostr: {
    event: {
      pubkey: "full-64-char-hex-pubkey"
    }
  }
}
```

### Multi-Hop Routing

**Path Discovery:**
1. Client queries Dassie node for route to destination
2. Dassie uses ILP routing table (populated via gossip)
3. Returns optimal path with fee estimate

**Example Route:**
```
Client (g.btp-nips.client.npub1xyz)
  ↓ 50 msats fee
Agent1 (g.btp-nips.agent1)
  ↓ 50 msats fee
Agent2 (g.btp-nips.agent2)
  ↓ 100 msats fee
Destination Relay (g.btp-nips.alice-relay.npub1abc)
```

**Total Cost:** 1200 msats (1000 base + 200 routing fees)

### Event Propagation Logic

**Relay-to-Relay Forwarding:**

When a relay receives an event for a subscription:

```typescript
async function propagateEvent(event: NostrEvent, subscription: Subscription) {
  // 1. Find subscribers for this event
  const subscribers = findMatchingSubscribers(event, subscription.filters);

  // 2. For each subscriber
  for (const subscriber of subscribers) {
    // 3. Create BTP-NIPs EVENT message
    const packet = createEventPacket(event, subscriber.subscriptionId);

    // 4. Determine payment (free or paid)
    const payment = subscription.paymentModel === 'streaming'
      ? { amount: "10", purpose: PaymentPurpose.EVENT_PUBLISH }
      : { amount: "0", purpose: PaymentPurpose.RELAY_FEE };

    // 5. Send ILP packet to subscriber's address
    await sendILPPacket(subscriber.ilpAddress, packet, payment);
  }
}
```

**De-duplication:**
Each relay maintains a cache of recent event IDs:
```typescript
const recentEvents = new LRUCache<string, boolean>({
  max: 10000,
  ttl: 3600000  // 1 hour
});

function isDuplicate(eventId: string): boolean {
  return recentEvents.has(eventId);
}
```

### Routing Hints

**Efficient Path Selection:**

Relays can include routing hints in responses:

```typescript
{
  metadata: {
    routingHints: [
      {
        nodeId: "g.btp-nips.fast-agent",
        fee: "25",
        reliability: 0.99
      },
      {
        nodeId: "g.btp-nips.cheap-agent",
        fee: "10",
        reliability: 0.85
      }
    ]
  }
}
```

Clients can use these hints to optimize future routing.

---

## Security Considerations

### 1. Cryptographic Guarantees

**Preserved from Nostr:**
- Event signatures (secp256k1) remain intact
- Clients verify signatures as usual
- No trust in relay for event authenticity

**Added by ILP:**
- Packet encryption (AES128-GCM-SHA256)
- Proof-of-payment (condition/fulfillment)
- Relay accountability (fulfillment = receipt)

### 2. Replay Attack Prevention

**ILP Packet Nonces:**
Each ILP packet includes:
- Unique execution condition (32-byte hash)
- Expiration timestamp (prevents replay after expiry)
- Sequence numbers (in STREAM protocol)

**Event De-duplication:**
Relays cache event IDs to prevent duplicate delivery:
```typescript
if (isDuplicate(event.id)) {
  return reject('duplicate event');
}
```

### 3. Denial-of-Service Protection

**Payment-Based Rate Limiting:**
- Every message requires payment (even if zero)
- High-volume clients pay more
- Agents can reject low-fee packets

**TTL Limits:**
```typescript
const MAX_TTL = 86400; // 24 hours

if (metadata.ttl > MAX_TTL) {
  return reject('TTL too long');
}
```

### 4. Privacy Considerations

**Packet Encryption:**
All BTP-NIPs payloads are encrypted via ILP STREAM:
- AES128-GCM-SHA256
- Per-session keys
- Forward secrecy

**Metadata Leakage:**
- ILP addresses reveal relay and pubkey prefix
- Timing analysis possible (same as WebSocket)
- Mitigation: Use Tor or VPN

### 5. Relay Authenticity

**Relay Signatures:**
Relays can sign their responses:
```typescript
{
  metadata: {
    relaySignature: signMessage(relay_privkey, event.id)
  }
}
```

Clients verify:
```typescript
if (!verifySignature(relay_pubkey, event.id, relaySignature)) {
  throw new Error('Invalid relay signature');
}
```

### 6. Payment Fraud Prevention

**Conditional Payments:**
- Client locks funds with hash (execution condition)
- Relay unlocks by revealing preimage (fulfillment)
- No refunds if relay provides valid fulfillment

**Dispute Resolution:**
- Client proves payment via ILP fulfillment
- Relay proves acceptance via signed event ID
- CosmWasm escrow for high-value disputes

---

## Examples

### Example 1: Publish Event with Payment

**Client Code:**
```typescript
import { createEvent, signEvent } from 'nostr-tools';
import { sendBTPNIPsPacket } from './btp-nips-client';

// 1. Create Nostr event
const event = createEvent({
  kind: 1,
  content: "Hello BTP-NIPs!",
  tags: [],
  created_at: Math.floor(Date.now() / 1000)
});

const signedEvent = signEvent(event, clientPrivateKey);

// 2. Create BTP-NIPs packet
const packet: BTPNIPsEnvelope = {
  version: 1,
  messageType: NostrMessageType.EVENT,
  payment: {
    amount: "1000",  // 1000 msats
    currency: "msat",
    purpose: PaymentPurpose.EVENT_PUBLISH,
    feeSchedule: {
      baseRelayFee: "100",
      agentRoutingFee: "50",
      total: "150"
    }
  },
  nostr: {
    type: "EVENT",
    event: signedEvent
  },
  metadata: {
    timestamp: Math.floor(Date.now() / 1000),
    priority: 128,
    ttl: 300
  }
};

// 3. Send via ILP
const destination = "g.btp-nips.alice-relay.npub1abc";
const result = await sendBTPNIPsPacket(destination, packet, "1000");

// 4. Verify acceptance
console.log('Event published:', result.eventId);
console.log('Proof:', result.fulfillment);
```

### Example 2: Create Subscription

**Client Code:**
```typescript
const packet: BTPNIPsEnvelope = {
  version: 1,
  messageType: NostrMessageType.REQ,
  payment: {
    amount: "5000",  // 5000 msats for 1 hour
    currency: "msat",
    purpose: PaymentPurpose.SUBSCRIPTION
  },
  nostr: {
    type: "REQ",
    subscriptionId: "my-sub-001",
    filters: [
      {
        kinds: [1],
        authors: ["pubkey1", "pubkey2"],
        since: Math.floor(Date.now() / 1000) - 3600
      }
    ]
  },
  metadata: {
    timestamp: Math.floor(Date.now() / 1000),
    ttl: 3600  // 1 hour
  }
};

const result = await sendBTPNIPsPacket(relayAddress, packet, "5000");

// Wait for EOSE and events
listenForEvents("my-sub-001", (event) => {
  console.log('Received event:', event);
});
```

### Example 3: Relay Processing EVENT

**Relay Code:**
```typescript
import { verifyEvent } from 'nostr-tools';
import { EventRepository } from './database';

async function handleEventPacket(
  packet: BTPNIPsEnvelope,
  ilpPrepare: ILPPrepare
): Promise<ILPFulfill> {

  // 1. Validate BTP-NIPs structure
  if (packet.version !== 1) {
    throw new Error('Unsupported protocol version');
  }

  // 2. Extract and verify Nostr event
  const { event } = packet.nostr as EventMessage;

  if (!verifyEvent(event)) {
    throw new Error('Invalid event signature');
  }

  // 3. Check payment amount
  const requiredFee = calculateEventFee(event);
  if (BigInt(packet.payment.amount) < requiredFee) {
    throw new Error('Insufficient payment');
  }

  // 4. Store event
  const eventRepo = new EventRepository();
  await eventRepo.save(event);

  // 5. Generate fulfillment proof
  const preimage = generateFulfillment(event.id);

  if (sha256(preimage).toString('hex') !== ilpPrepare.executionCondition) {
    throw new Error('Condition mismatch');
  }

  // 6. Return ILP Fulfill
  return {
    fulfillment: preimage,
    data: {
      eventId: event.id,
      relaySignature: signMessage(relayPrivateKey, event.id),
      timestamp: Math.floor(Date.now() / 1000)
    }
  };
}
```

### Example 4: Bridge WebSocket to BTP-NIPs

**Bridge Code:**
```typescript
import WebSocket from 'ws';

class BTPNIPsBridge {
  private wsServer: WebSocket.Server;
  private ilpClient: DassieClient;

  constructor() {
    this.wsServer = new WebSocket.Server({ port: 8080 });
    this.ilpClient = new DassieClient();

    this.wsServer.on('connection', (ws) => {
      this.handleWebSocketClient(ws);
    });
  }

  async handleWebSocketClient(ws: WebSocket) {
    ws.on('message', async (data) => {
      // Parse Nostr message
      const message = JSON.parse(data.toString());

      if (message[0] === 'EVENT') {
        const [, event] = message;

        // Convert to BTP-NIPs
        const packet: BTPNIPsEnvelope = {
          version: 1,
          messageType: NostrMessageType.EVENT,
          payment: {
            amount: "1000",
            currency: "msat",
            purpose: PaymentPurpose.EVENT_PUBLISH
          },
          nostr: {
            type: "EVENT",
            event
          },
          metadata: {
            timestamp: Math.floor(Date.now() / 1000)
          }
        };

        // Send via ILP
        const result = await this.ilpClient.send(
          "g.btp-nips.downstream-relay",
          packet,
          "1000"
        );

        // Return OK to WebSocket client
        ws.send(JSON.stringify([
          "OK",
          event.id,
          true,
          ""
        ]));
      }

      if (message[0] === 'REQ') {
        const [, subId, ...filters] = message;

        // Convert to BTP-NIPs
        const packet: BTPNIPsEnvelope = {
          version: 1,
          messageType: NostrMessageType.REQ,
          payment: {
            amount: "5000",
            currency: "msat",
            purpose: PaymentPurpose.SUBSCRIPTION
          },
          nostr: {
            type: "REQ",
            subscriptionId: subId,
            filters
          },
          metadata: {
            timestamp: Math.floor(Date.now() / 1000),
            ttl: 3600
          }
        };

        // Send via ILP
        await this.ilpClient.send(
          "g.btp-nips.downstream-relay",
          packet,
          "5000"
        );

        // Listen for events and forward to WebSocket
        this.ilpClient.on('event', (event) => {
          ws.send(JSON.stringify([
            "EVENT",
            subId,
            event
          ]));
        });

        this.ilpClient.on('eose', () => {
          ws.send(JSON.stringify([
            "EOSE",
            subId
          ]));
        });
      }
    });
  }
}

const bridge = new BTPNIPsBridge();
```

---

## Interoperability

### WebSocket Relay Compatibility

**Client Perspective:**
A BTP-NIPs client can connect to traditional WebSocket relays via a bridge:

```
BTP-NIPs Client → Bridge (ILP ↔ WebSocket) → WebSocket Relay
```

**Relay Perspective:**
A BTP-NIPs relay can serve WebSocket clients via a bridge:

```
WebSocket Client → Bridge (WebSocket ↔ ILP) → BTP-NIPs Relay
```

### NIP Compatibility

**Supported NIPs:**
- NIP-01: Basic protocol (via message type mapping)
- NIP-02: Contact lists (EVENT kind 3)
- NIP-04: Encrypted DMs (EVENT kind 4, deprecated)
- NIP-09: Event deletion (EVENT kind 5)
- NIP-11: Relay info (via HTTPS endpoint)
- NIP-17: Private DMs (EVENT kind 14)
- NIP-20: Command results (OK message)
- NIP-40: Expiration (via metadata.ttl)
- NIP-42: Authentication (AUTH message)
- NIP-45: Event counts (COUNT message)

**Unsupported NIPs:**
- NIP-57: Lightning Zaps (use ILP payments instead)
- NIP-60: Cashu Wallet (incompatible with ILP)

### Migration Path

**Phase 1: Bridge Deployment**
- Deploy BTP-NIPs bridges at major relays
- WebSocket clients work unchanged
- BTP-NIPs adoption gradual

**Phase 2: Native Client Support**
- Clients add BTP-NIPs support
- Dual-mode operation (WebSocket + BTP-NIPs)
- Users choose based on payment preference

**Phase 3: Agent Network Growth**
- AI agents deploy BTP-NIPs relays
- Economic routing emerges
- Traditional relays remain compatible

---

## Appendix

### A. Message Size Analysis

**Overhead Breakdown:**
```
ILP Packet Header:     ~100 bytes
STREAM Frame:          ~50 bytes
BTP-NIPs Header:       ~200 bytes (JSON metadata)
Nostr Event:           Variable (0-30 KB)
--------------------------------------------
Total Overhead:        ~350 bytes
Maximum Event Size:    ~30 KB (leaving 2.7 KB for ILP/metadata)
```

**Comparison:**
```
WebSocket (JSON):      Event + ~50 bytes overhead
BTP-NIPs:              Event + ~350 bytes overhead

Trade-off: 300 bytes extra for payment infrastructure
```

### B. Fee Estimation Formulas

**Relay Base Fee:**
```typescript
function calculateBaseFee(event: NostrEvent): bigint {
  const kindMultipliers = {
    1: 1,      // Short note
    30023: 5,  // Long-form
    1063: 10   // File metadata
  };

  const multiplier = kindMultipliers[event.kind] || 1;
  const baseFee = 100n; // 100 msats

  return baseFee * BigInt(multiplier);
}
```

**Size-Based Fee:**
```typescript
function calculateSizeFee(event: NostrEvent): bigint {
  const size = JSON.stringify(event).length;
  const freeSize = 1024; // First 1 KB free

  if (size <= freeSize) return 0n;

  const extraBytes = size - freeSize;
  const pricePerKB = 500n; // 500 msats per KB

  return (BigInt(extraBytes) * pricePerKB) / 1024n;
}
```

**Total Fee:**
```typescript
function calculateTotalFee(event: NostrEvent): bigint {
  return calculateBaseFee(event) + calculateSizeFee(event);
}
```

### C. Test Vectors

See `packet-structure.md` for detailed test vectors with hex dumps.

### D. JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "BTPNIPsEnvelope",
  "type": "object",
  "required": ["version", "messageType", "payment", "nostr", "metadata"],
  "properties": {
    "version": {
      "type": "number",
      "const": 1
    },
    "messageType": {
      "type": "number",
      "enum": [1, 2, 3, 4, 5, 6, 7, 8, 9]
    },
    "payment": {
      "type": "object",
      "required": ["amount", "currency", "purpose"],
      "properties": {
        "amount": { "type": "string", "pattern": "^[0-9]+$" },
        "currency": { "type": "string" },
        "purpose": { "type": "string" },
        "feeSchedule": {
          "type": "object",
          "properties": {
            "baseRelayFee": { "type": "string" },
            "agentRoutingFee": { "type": "string" },
            "contentFee": { "type": "string" },
            "total": { "type": "string" }
          }
        }
      }
    },
    "nostr": {
      "type": "object"
    },
    "metadata": {
      "type": "object",
      "required": ["timestamp"],
      "properties": {
        "timestamp": { "type": "number" },
        "relaySignature": { "type": "string" },
        "routingHints": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "nodeId": { "type": "string" },
              "fee": { "type": "string" },
              "reliability": { "type": "number", "minimum": 0, "maximum": 1 }
            }
          }
        },
        "ttl": { "type": "number" },
        "priority": { "type": "number", "minimum": 0, "maximum": 255 }
      }
    }
  }
}
```

---

## Version History

- **1.0.0** (2025-12-05): Initial draft specification

---

## References

1. [Nostr Protocol Specification](https://github.com/nostr-protocol/nips)
2. [Interledger Protocol](https://interledger.org/rfcs/0027-interledger-protocol-4/)
3. [Dassie Documentation](https://github.com/justmoon/dassie)
4. [ILP STREAM Protocol](https://interledger.org/rfcs/0029-stream/)
5. [NIP-01: Basic Protocol](https://github.com/nostr-protocol/nips/blob/master/01.md)

---

## License

This specification is released under CC0 (public domain).

---

**End of BTP-NIPs Protocol Specification v1.0.0**
