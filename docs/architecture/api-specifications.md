# API Specifications

## Nostr Protocol APIs (WebSocket)

The relay implements the Nostr protocol specification (NIP-01) over WebSocket.

### Client → Relay Messages

**1. EVENT - Publish an event**
```json
["EVENT", {
  "id": "event_id_hash_hex",
  "pubkey": "author_pubkey_hex",
  "created_at": 1234567890,
  "kind": 1,
  "tags": [
    ["e", "referenced_event_id"],
    ["p", "mentioned_pubkey"],
    ["payment", "ilp", "channel_123", "1000", "42", "signature_hex", "BTC"]
  ],
  "content": "Hello Nostr!",
  "sig": "signature_hex"
}]
```

**Payment Tag Format:**
```
["payment", "ilp", channelId, amountSats, nonce, signature, currency]
```

**2. REQ - Subscribe to events**
```json
["REQ", "subscription_id", {
  "authors": ["pubkey1", "pubkey2"],
  "kinds": [1, 30023],
  "#e": ["event_id"],
  "#p": ["pubkey"],
  "since": 1234567890,
  "until": 1234567900,
  "limit": 100
}]
```

**3. CLOSE - Close subscription**
```json
["CLOSE", "subscription_id"]
```

**4. AUTH - Authenticate (NIP-42)**
```json
["AUTH", {
  "id": "event_id",
  "pubkey": "client_pubkey",
  "created_at": 1234567890,
  "kind": 22242,
  "tags": [["relay", "wss://relay.example.com"], ["challenge", "challenge_string"]],
  "content": "",
  "sig": "signature"
}]
```

### Relay → Client Messages

**1. EVENT - Send event matching subscription**
```json
["EVENT", "subscription_id", {
  "id": "event_id",
  "pubkey": "author_pubkey",
  "created_at": 1234567890,
  "kind": 1,
  "tags": [["arweave", "tx_id_if_archived"]],
  "content": "Event content or empty if in Arweave",
  "sig": "signature"
}]
```

**2. EOSE - End of Stored Events**
```json
["EOSE", "subscription_id"]
```

**3. OK - Event acceptance result**
```json
["OK", "event_id", true, ""]
["OK", "event_id", false, "invalid: signature verification failed"]
["OK", "event_id", false, "restricted: payment required"]
["OK", "event_id", false, "restricted: invalid payment"]
["OK", "event_id", true, "duplicate: already stored"]
```

**4. NOTICE - Human-readable message**
```json
["NOTICE", "Payment required for event kind 30023. Include payment tag."]
```

**5. AUTH - Authentication challenge (NIP-42)**
```json
["AUTH", "challenge_string"]
```

---

## Dashboard REST API

The operator dashboard exposes HTTP endpoints for monitoring and management.

**Base URL:** `https://relay.example.com/dashboard`

### GET /dashboard/metrics

**Description:** Get current relay metrics (revenue, profit, channels)

**Authentication:** HTTP Basic Auth (operator credentials)

**Response:**
```json
{
  "timestamp": "2025-11-25T12:00:00Z",
  "revenue": {
    "btc_sats": 1000000,
    "base_wei": "5000000000000000000",
    "akt_uakt": 50000000,
    "xrp_drops": 10000000
  },
  "expenses": {
    "arweave_winston": 5000000000,
    "akash_uakt": 2500000
  },
  "profit": {
    "total_akt_equivalent": 47500000,
    "hourly_rate_uakt": 1200
  },
  "channels": {
    "open": 15,
    "total_capacity_sats": 50000000
  },
  "relay_stats": {
    "total_events": 125000,
    "events_24h": 850,
    "active_subscriptions": 42,
    "connected_clients": 23
  }
}
```

### GET /dashboard/payments

**Description:** Get recent payment history

**Authentication:** HTTP Basic Auth

**Query Parameters:**
- `limit` (default: 50, max: 500)
- `offset` (default: 0)
- `currency` (filter by BTC, BASE, AKT, XRP, or "all")

**Response:**
```json
{
  "payments": [
    {
      "timestamp": "2025-11-25T11:55:00Z",
      "channel_id": "channel_123",
      "amount_sats": 1000,
      "currency": "BTC",
      "event_id": "abc123...",
      "event_kind": 1,
      "sender_pubkey": "def456..."
    }
  ],
  "total": 850,
  "limit": 50,
  "offset": 0
}
```

### GET /dashboard/health

**Description:** Health check endpoint

**Authentication:** None (public)

**Response:**
```json
{
  "status": "healthy",
  "services": {
    "nostream": "up",
    "dassie_rpc": "up",
    "postgresql": "up",
    "redis": "up",
    "arweave": "up"
  },
  "warnings": [
    "AKT balance below reserve threshold (3.5 AKT remaining)"
  ]
}
```

### GET /dashboard/channels

**Description:** Get payment channel details

**Authentication:** HTTP Basic Auth

**Response:**
```json
{
  "channels": [
    {
      "channel_id": "channel_123",
      "blockchain": "BTC",
      "sender": "bc1q...",
      "capacity_sats": 10000000,
      "balance_sats": 8500000,
      "highest_nonce": 42,
      "status": "OPEN",
      "expiration": "2025-12-25T00:00:00Z",
      "total_spent_sats": 1500000
    }
  ]
}
```

### POST /dashboard/config

**Description:** Update relay configuration (pricing, alerts)

**Authentication:** HTTP Basic Auth

**Request Body:**
```json
{
  "pricing": {
    "1": { "amount_sats": 10, "requires_payment": true },
    "30023": { "amount_sats": 500, "requires_payment": true, "requires_arweave": true }
  },
  "economic_monitor": {
    "alerts": {
      "unprofitable_threshold": -2000,
      "low_balance_akt": 3000000
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Configuration updated. Restart required for some changes."
}
```

---

## Dassie RPC API (tRPC)

These are the **custom endpoints** that need to be added to Dassie for Nostream integration.

**Connection:** WebSocket at `ws://dassie:5000/trpc`

### payment.getChannelState

**Type:** Query
**Description:** Fetch payment channel details

**Input:**
```typescript
{
  channelId: string;
}
```

**Output:**
```typescript
{
  channelId: string;
  blockchain: 'BTC' | 'BASE' | 'AKT' | 'XRP';
  sender: string;
  recipient: string;
  capacity: bigint;
  balance: bigint;
  highestNonce: number;
  expiration: number; // Unix timestamp
  status: 'OPEN' | 'CLOSED' | 'EXPIRED';
}
```

### payment.verifyPaymentClaim

**Type:** Mutation
**Description:** Verify a payment claim's validity and update ledger state

**Input:**
```typescript
{
  channelId: string;
  amountSats: number;
  nonce: number;
  signature: string;
  currency: 'BTC' | 'BASE' | 'AKT' | 'XRP';
}
```

**Output:**
```typescript
{
  valid: boolean;
  reason?: string; // If invalid: "invalid-signature", "invalid-nonce", "insufficient-balance", etc.
  amountSats?: number; // Verified amount if valid
}
```

### payment.recordClaim

**Type:** Mutation
**Description:** Record an off-chain payment claim in ledger

**Input:**
```typescript
{
  channelId: string;
  amount: number;
  nonce: number;
  eventId?: string; // Optional Nostr event ID for tracking
}
```

**Output:**
```typescript
{
  success: boolean;
  newBalance: bigint;
  newNonce: number;
}
```

### payment.convertToAKT

**Type:** Mutation
**Description:** Convert revenue from other currencies to AKT for Akash payments

**Input:**
```typescript
{
  amount: number; // Amount in source currency base units
  fromCurrency: 'BTC' | 'BASE' | 'XRP';
  slippageTolerance?: number; // Default: 0.05 (5%)
}
```

**Output:**
```typescript
{
  success: boolean;
  amountAKT: bigint; // Amount received in uakt
  exchangeRate: number; // Rate used for conversion
  transactionId: string; // On-chain or ILP payment ID
}
```

### ledger.getBalance

**Type:** Query
**Description:** Get balance for a ledger account path

**Input:**
```typescript
{
  accountPath: string; // e.g., "btc:revenue/relay-fees"
}
```

**Output:**
```typescript
{
  balance: bigint;
  accountPath: string;
  lastUpdated: number; // Unix timestamp
}
```

### ledger.subscribeToAccount

**Type:** Subscription
**Description:** Real-time balance updates for an account

**Input:**
```typescript
{
  accountPath: string;
}
```

**Output (stream):**
```typescript
{
  balance: bigint;
  delta: bigint; // Change since last update
  timestamp: number;
  reason: string; // "payment_received", "settlement", "conversion", etc.
}
```

### settlement.openChannel

**Type:** Mutation
**Description:** Open a new payment channel on a blockchain

**Input:**
```typescript
{
  blockchain: 'BTC' | 'BASE' | 'AKT' | 'XRP';
  sender: string; // Blockchain-specific address
  amount: bigint; // In base units (sats, wei, uakt, drops)
  expirationBlocks?: number; // Default: 1000 blocks
}
```

**Output:**
```typescript
{
  channelId: string;
  onChainTxId: string; // Transaction ID on the blockchain
  status: 'PENDING' | 'OPEN';
  estimatedConfirmationTime: number; // Seconds
}
```

### settlement.closeChannel

**Type:** Mutation
**Description:** Close a payment channel and settle on-chain

**Input:**
```typescript
{
  channelId: string;
  finalAmount: bigint; // Final claimed amount
}
```

**Output:**
```typescript
{
  success: boolean;
  onChainTxId: string;
  refundAmount: bigint; // Amount returned to sender
  relayAmount: bigint; // Amount sent to relay
}
```

---

## Arweave Upload API (Internal)

**Note:** This is an internal service, not exposed via HTTP. Used by Nostream event handler and backup service.

### arweaveService.upload(content, metadata)

**Description:** Upload content to Arweave and return transaction ID

**Parameters:**
```typescript
content: Buffer | string;
metadata: {
  eventId: string;
  eventKind: number;
  contentType: string;
  pubkey: string;
}
```

**Returns:**
```typescript
Promise<{
  txId: string; // Arweave transaction ID (43 chars)
  url: string; // https://arweave.net/{txId}
  cost: number; // AR cost in winston
  size: number; // Bytes uploaded
}>
```

### arweaveService.uploadBackup(compressedData, manifest)

**Description:** Upload daily event backup bundle

**Parameters:**
```typescript
compressedData: Buffer; // Gzipped NDJSON
manifest: {
  event_count: number;
  start_date: string;
  end_date: string;
}
```

**Returns:**
```typescript
Promise<{
  txId: string;
  cost: number;
  size: number;
}>
```

### arweaveService.retrieve(txId)

**Description:** Fetch archived content from Arweave

**Parameters:**
```typescript
txId: string; // 43-character transaction ID
```

**Returns:**
```typescript
Promise<{
  data: Buffer;
  contentType: string;
  tags: Array<{ name: string; value: string }>;
}>
```

---
