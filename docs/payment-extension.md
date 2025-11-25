# Payment Extension for Nostr Events

## Overview

This document specifies the payment tag format for attaching ILP (Interledger Protocol) payments to Nostr events. This extension enables paid relay services and monetized content on Nostr without modifying the core protocol.

## Payment Tag Format

Payment claims are embedded in Nostr event tags using the following format:

```json
{
  "tags": [
    ["payment", "ilp", "<channelId>", "<amountSats>", "<nonce>", "<signature>", "<currency>"]
  ]
}
```

### Field Specifications

| Position | Field | Type | Description | Validation Rules |
|----------|-------|------|-------------|-----------------|
| 0 | Tag Type | `"payment"` | Identifies this as a payment metadata tag | Must be exactly "payment" |
| 1 | Protocol | `"ilp"` | Payment protocol identifier (ILP) | Must be exactly "ilp" |
| 2 | channelId | `string` | Blockchain-specific channel identifier | Non-empty, min 10 characters |
| 3 | amountSats | `string` | Payment amount in satoshis (numeric string) | Positive integer > 0, < 2^53 |
| 4 | nonce | `string` | Monotonically increasing counter (numeric string) | Non-negative integer >= 0, < 2^53 |
| 5 | signature | `string` | Hex-encoded cryptographic signature | Hex string, 128-130 characters |
| 6 | currency | `string` | Payment currency enum | One of: `BTC`, `BASE`, `AKT`, `XRP` |

### Tag Position

The payment tag can appear at any position in the event's `tags` array. Relays will search for the first tag matching `tag[0] === "payment" && tag[1] === "ilp"`.

## Supported Currencies

| Currency | Blockchain | Channel ID Format | Notes |
|----------|-----------|------------------|-------|
| `BTC` | Bitcoin Lightning | `lnbc1...` or channel point `<txid>:<vout>` | Lightning Network payment channels |
| `BASE` | Base L2 (Ethereum) | `0x<contract_address>:<channel_id>` | Smart contract address + channel ID |
| `AKT` | Akash (Cosmos) | `akash1<bech32>:<channel_id>` | CosmWasm contract address + channel ID |
| `XRP` | XRP Ledger | 64-character hex string | XRP payment channel ID |

### Channel ID Format Examples

**Bitcoin Lightning:**
```
lnbc1p0xq3wnpp5j0v8z...
or
a3f2b1c0d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9:0
```

**BASE (Ethereum L2):**
```
0x1234567890abcdef1234567890abcdef12345678:42
```

**Akash (CosmWasm):**
```
akash1qj5y3z2h9x8w7v6u5t4s3r2q1p0o9n8m7l6k5j:42
```

**XRP Ledger:**
```
A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4A5B6C7D8E9F0A1B2
```

## Signature Generation

### Message Format

The signature is computed over the following message:

```
channelId:amountSats:nonce
```

**Example:**
```
channel_abc123:1000:42
```

### Signing Algorithm

- **Algorithm:** ECDSA with secp256k1 curve
- **Key:** Channel sender's private key (blockchain-specific)
- **Output:** Hex-encoded signature (128-130 characters)

### Signature Encoding

The signature must be hex-encoded (characters: `0-9`, `a-f`, `A-F`). Optional `0x` prefix is not supported.

**Example valid signature:**
```
304402207f8b3c9e1d2a4f5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e79a8901
```

## Example Events

### Short Note with Bitcoin Payment

```json
{
  "id": "abc123def456...",
  "pubkey": "user_pubkey_hex...",
  "created_at": 1700000000,
  "kind": 1,
  "tags": [
    ["payment", "ilp", "lnbc1p0xq3wnpp5...", "1000", "42", "304402207f8b...", "BTC"],
    ["p", "mentioned_pubkey_hex"]
  ],
  "content": "Hello paid Nostr!",
  "sig": "event_signature_hex..."
}
```

### Long-Form Content with Akash Payment

```json
{
  "id": "def456abc789...",
  "pubkey": "author_pubkey_hex...",
  "created_at": 1700000100,
  "kind": 30023,
  "tags": [
    ["d", "my-article-slug"],
    ["title", "My Premium Article"],
    ["payment", "ilp", "akash1qj5y3z2h9x8w7v6u5t4s3r2q1p0o9n8m7l6k5j:10", "5000", "128", "304502210a1b...", "AKT"],
    ["published_at", "1700000000"]
  ],
  "content": "Article content here...",
  "sig": "event_signature_hex..."
}
```

### File Metadata with BASE Payment

```json
{
  "id": "ghi789jkl012...",
  "pubkey": "uploader_pubkey_hex...",
  "created_at": 1700000200,
  "kind": 1063,
  "tags": [
    ["url", "https://arweave.net/tx_id_here"],
    ["m", "image/jpeg"],
    ["x", "file_hash_sha256"],
    ["size", "2048000"],
    ["payment", "ilp", "0x1234567890abcdef1234567890abcdef12345678:7", "10000", "256", "3046022100b2c3...", "BASE"]
  ],
  "content": "My vacation photo",
  "sig": "event_signature_hex..."
}
```

## Client Workflow

### 1. User Creates Nostr Event

The client constructs a standard Nostr event (kind, content, tags).

### 2. Open Payment Channel with Relay

Client opens a payment channel with the relay via Dassie settlement API:

```typescript
const channel = await dassieApi.openChannel({
  currency: 'BTC',
  initialBalance: 100000, // sats
  relayPubkey: relay.pubkey
})
```

### 3. Create Payment Claim

For each event requiring payment, increment the nonce and sign the claim:

```typescript
const nonce = channel.nonce + 1
const message = `${channel.id}:${amountSats}:${nonce}`
const signature = signMessage(message, channelPrivateKey)
```

### 4. Attach Payment Tag to Event

Add the payment tag to the event's tags array:

```typescript
event.tags.push([
  "payment",
  "ilp",
  channel.id,
  amountSats.toString(),
  nonce.toString(),
  signature,
  currency
])
```

### 5. Publish Event to Relay

Send the event via the Nostr protocol (`EVENT` message).

### 6. Relay Verifies Payment

The relay:
1. Extracts payment claim from event tags
2. Validates claim format
3. Verifies payment with Dassie RPC (Story 1.4)
4. Accepts or rejects event based on verification result

## Security Considerations

### Replay Attack Prevention

**Nonce Monotonicity:**
- Nonces must be strictly increasing for each channel
- Relay/Dassie tracks the last used nonce per channel
- Claims with nonce <= last_used_nonce are rejected

**Example:**
```
Payment 1: nonce = 0 → accepted
Payment 2: nonce = 1 → accepted
Payment 3: nonce = 1 → rejected (replay)
Payment 4: nonce = 2 → accepted
```

### Signature Verification

The relay delegates signature verification to the Dassie node (Story 1.4):
1. Relay extracts claim from event
2. Relay sends claim to Dassie via RPC
3. Dassie verifies signature against channel's public key
4. Dassie checks channel balance and expiration
5. Dassie returns verification result

### Amount Validation

- Amount must be positive (> 0)
- Amount must not exceed channel balance
- Amount must not exceed JavaScript safe integer range (< 2^53)

### Channel Validation

- Channel must exist and be open
- Channel must not be expired
- Channel must belong to the event author (signature verification)
- Channel must have sufficient balance

## Client Integration Examples

### TypeScript: Creating Payment Tags

```typescript
import { PaymentClaim, PaymentCurrency } from './types/payment-claim'
import { signMessage } from './crypto-utils'

/**
 * Creates a payment tag for a Nostr event
 *
 * @param channelId - Blockchain-specific channel identifier
 * @param amountSats - Payment amount in satoshis
 * @param nonce - Monotonically increasing nonce for replay protection
 * @param channelPrivateKey - Private key for signing (hex-encoded)
 * @param currency - Payment currency (BTC, BASE, AKT, XRP)
 * @returns Payment tag array ready to add to event.tags
 */
function createPaymentTag(
  channelId: string,
  amountSats: number,
  nonce: number,
  channelPrivateKey: string,
  currency: PaymentCurrency
): string[] {
  // Create message to sign: channelId:amountSats:nonce
  const message = `${channelId}:${amountSats}:${nonce}`

  // Sign message with channel private key (ECDSA secp256k1)
  const signature = signMessage(message, channelPrivateKey)

  return [
    "payment",
    "ilp",
    channelId,
    amountSats.toString(),
    nonce.toString(),
    signature,
    currency
  ]
}

// Example usage
const paymentTag = createPaymentTag(
  'channel_abc123',
  1000,
  42,
  privateKey,
  'BTC'
)
```

### JavaScript: Client-Side Event Creation

```javascript
// Complete example: Create and publish paid event

// 1. Open payment channel with relay (done once, reuse channel)
const channel = await dassieApi.openChannel({
  currency: 'BTC',
  initialBalance: 100000, // sats
  relayPubkey: relay.pubkey
})

// 2. Create Nostr event
const event = {
  kind: 1,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    // Add payment tag
    createPaymentTag(
      channel.id,
      1000, // 1000 sats for this post
      channel.nonce + 1,
      channelPrivateKey,
      'BTC'
    ),
    // Other tags
    ['p', 'mentioned_pubkey_hex']
  ],
  content: 'Hello paid Nostr!',
  pubkey: myPublicKey
}

// 3. Sign event with Nostr key (NIP-01)
const signedEvent = await nostrSigner.signEvent(event)

// 4. Send to relay via WebSocket
relayWebSocket.send(JSON.stringify(['EVENT', signedEvent]))

// 5. Listen for OK response
relayWebSocket.onmessage = (msg) => {
  const [type, eventId, accepted, message] = JSON.parse(msg.data)
  if (type === 'OK') {
    if (accepted) {
      console.log('Event accepted! Payment verified.')
    } else {
      console.error('Event rejected:', message)
    }
  }
}
```

### TypeScript: Relay-Side Parsing

```typescript
import { extractPaymentClaim } from '@/services/payment/payment-claim-parser'
import { DassieRpcClient } from '@/services/payment/dassie-client'

const dassieRpc = new DassieRpcClient('ws://localhost:41234')

// In Nostr EVENT handler
async function handleEvent(event: NostrEvent): Promise<void> {
  // 1. Extract payment claim from event
  const claim = extractPaymentClaim(event)

  if (!claim) {
    // No payment or invalid format
    sendResponse(['OK', event.id, false, 'restricted: payment required'])
    return
  }

  // 2. Verify claim with Dassie (Story 1.4)
  try {
    const result = await dassieRpc.payment.verifyPaymentClaim.query(claim)

    if (!result.valid) {
      sendResponse(['OK', event.id, false, `payment-required: ${result.error}`])
      return
    }

    // 3. Payment verified, store event
    await eventRepository.save(event)
    sendResponse(['OK', event.id, true, ''])

    // 4. Broadcast to subscribers
    broadcastEvent(event)

  } catch (error) {
    console.error('Payment verification error:', error)
    sendResponse(['OK', event.id, false, 'error: payment verification failed'])
  }
}
```

### React Hook: Payment UI

```typescript
import { useState } from 'react'
import { createPaymentTag } from '../lib/payment'

function usePaymentEvent(relay: string) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const publishPaidEvent = async (
    content: string,
    amountSats: number,
    channel: PaymentChannel
  ) => {
    setLoading(true)
    setError(null)

    try {
      // Create event with payment tag
      const event = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          createPaymentTag(
            channel.id,
            amountSats,
            channel.nonce + 1,
            channel.privateKey,
            channel.currency
          )
        ],
        content,
        pubkey: await nostr.getPublicKey()
      }

      // Sign event
      const signedEvent = await nostr.signEvent(event)

      // Send to relay
      const ws = new WebSocket(relay)

      return new Promise((resolve, reject) => {
        ws.onopen = () => {
          ws.send(JSON.stringify(['EVENT', signedEvent]))
        }

        ws.onmessage = (msg) => {
          const [type, eventId, accepted, message] = JSON.parse(msg.data)
          if (type === 'OK') {
            if (accepted) {
              resolve(eventId)
            } else {
              reject(new Error(message))
            }
            ws.close()
          }
        }

        ws.onerror = (err) => reject(err)
      })

    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { publishPaidEvent, loading, error }
}

// Usage in component
function PublishButton() {
  const { publishPaidEvent, loading } = usePaymentEvent('wss://relay.example.com')

  const handleClick = async () => {
    await publishPaidEvent(
      'My paid post',
      1000, // 1000 sats
      myChannel
    )
  }

  return (
    <button onClick={handleClick} disabled={loading}>
      {loading ? 'Publishing...' : 'Publish (1000 sats)'}
    </button>
  )
}
```

## Implementation Notes

### Parser Implementation

See `src/services/payment/payment-claim-parser.ts` for the reference implementation:

- `extractPaymentClaim(event: NostrEvent): PaymentClaim | null`
- `validateClaimFormat(claim: Partial<PaymentClaim>): boolean`

### Error Handling

The parser returns `null` for all parsing failures:
- Missing payment tag
- Malformed payment tag (wrong length)
- Invalid field values
- Unsupported currency

Relays should reject events with `null` claims if payment is required.

### Logging

Parsers should log validation failures for debugging:
- `WARN`: Malformed payment tag (client bug)
- `DEBUG`: No payment tag (expected for free events)
- `ERROR`: Unexpected parsing errors

### Performance

Parsers must be optimized for high throughput:
- Early returns for invalid tags (fail fast)
- No expensive operations (regex, crypto) in parser
- Target: < 1ms per event

## Future Extensions

### Multiple Payment Protocols

The payment tag format supports future payment protocols:

```json
["payment", "lightning", "<invoice>", "<preimage>"]
["payment", "cashu", "<token>", "<proof>"]
```

### Multi-Currency Payments

Future versions may support multiple payment tags per event (partial payments in different currencies).

### Payment Receipts

Relays may publish payment receipt events (custom kind) to provide proof of payment on Nostr.

---

*Document Version: 1.0*
*Last Updated: 2025-11-25*
*Story: 1.3 - Define Payment Claim Format for Nostr Events*
