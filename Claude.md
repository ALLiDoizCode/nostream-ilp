# Domain Knowledge: Nostr-ILP Integration Project

This document provides comprehensive domain knowledge about the key technologies and protocols relevant to this project, which bridges Nostr (decentralized social protocol) with Interledger Protocol (ILP) for payments.

---

## Table of Contents

1. [Nostr Protocol](#nostr-protocol)
2. [Interledger Protocol (ILP)](#interledger-protocol-ilp)
3. [Dassie Implementation](#dassie-implementation)
4. [Nostream Relay](#nostream-relay)
5. [CosmWasm Smart Contracts](#cosmwasm-smart-contracts)
6. [Arweave Permanent Storage](#arweave-permanent-storage)
7. [Integration Architecture](#integration-architecture)

---

## Nostr Protocol

### Overview
Nostr (Notes and Other Stuff Transmitted by Relays) is a simple, open protocol for decentralized social networking that is censorship-resistant and cryptographically verifiable.

### Core Concepts

#### Event Structure
- Events are the fundamental data structure in Nostr
- Each event has a `kind` number that defines its type
- Events are signed with private keys and verified with public keys

#### Key Event Kinds Relevant to This Project
| Kind | Description | Relevance |
|------|-------------|-----------|
| `1` | Short Text Note | Basic messaging |
| `4` | Encrypted Direct Messages | Private communications (deprecated, use NIP-17) |
| `14` | Direct Message (NIP-17) | Modern private messaging |
| `9735` | Zap | Lightning payment receipts |
| `7375` | Cashu Wallet Tokens | E-cash tokens |
| `10002` | Relay List Metadata | User's preferred relays |

### NIPs (Nostr Implementation Possibilities)

#### Critical NIPs for Payment Integration
- **NIP-01**: Basic protocol flow - fundamental message types (EVENT, REQ, CLOSE)
- **NIP-04**: Encrypted Direct Messages (deprecated in favor of NIP-17)
- **NIP-17**: Private Direct Messages - modern encrypted messaging
- **NIP-47**: Nostr Wallet Connect - connect wallets to applications
- **NIP-57**: Lightning Zaps - tipping with Lightning Network
- **NIP-60**: Cashu Wallet - e-cash wallet integration
- **NIP-61**: Nutzaps - Cashu-based zaps

#### Message Flow
**Client to Relay:**
- `EVENT` - publish events
- `REQ` - request events and subscribe
- `CLOSE` - stop subscriptions
- `AUTH` - authentication

**Relay to Client:**
- `EVENT` - send requested events
- `EOSE` - End of Stored Events
- `OK` - event acceptance confirmation
- `NOTICE` - human-readable messages

### Authentication & Identity
- Public/private key pairs (secp256k1)
- Public keys (npub) identify users
- Events are signed to prove authenticity
- NIP-05: DNS-based verification (name@domain.com)
- NIP-42: Client authentication to relays

---

## Interledger Protocol (ILP)

### Overview
Interledger is an open protocol suite for sending payments across different ledgers and payment networks. It enables interoperability between different payment systems.

### Core Concepts

#### Key Features
1. **Ledger-agnostic**: Works with any asset or payment network
2. **Multi-hop payments**: Route through multiple connectors
3. **Atomic transactions**: Either complete or fail entirely
4. **No central operator**: Fully decentralized

#### Payment Flow
```
Sender → Connector(s) → Receiver
```

Each hop uses conditional payments (similar to Lightning Network HTLCs) to ensure atomicity.

#### Address Format
ILP addresses are hierarchical:
```
g.crypto.bitcoin.alice
g.crypto.ethereum.bob
```

### Settlement Methods
- On-chain cryptocurrency transfers
- Lightning Network
- Traditional banking rails
- Trust-based credit lines between peers

---

## Dassie Implementation

### Overview
Dassie is a modern Interledger node implementation written in Rust, designed for peer-to-peer payments with built-in settlement and routing capabilities.

### Architecture

#### Repository Structure
The Dassie monorepo uses pnpm and contains:
- **app-*** packages: Applications (e.g., `app-dassie`)
- **gui-*** packages: Frontend interfaces
- **lib-*** packages: Libraries (e.g., `lib-reactive`, `lib-sqlite`)
- **meta-*** packages: Meta-packages for organization

#### Key Features

**1. Internal Ledger**
- Double-entry accounting system
- Inspired by TigerBeetle
- Account types: asset, liability, equity, revenue, expense, contra
- Tracks all fund movements with debits and credits

Account path examples:
```
xrp:assets/settlement
xrp:assets/interledger/peerA
xrp:liabilities/peerA/interledger
```

**2. Peer-to-Peer Communication**
- **Public HTTPS API**: Discovery and handshaking
- **Private UDP API**: Encrypted ILP packet transport
- Uses AES128-GCM-SHA256 for encryption
- Session-based with initialization vectors

**3. Network Membership**
- **Bootstrap Node List (BNL)**: Trusted initial nodes
- **Known Node List (KNL)**: Discovered nodes
- Anti-Sybil mechanisms to prevent network attacks
- Proof-of-payment for network entry

**4. Node Discovery**
- Nodes start with hardcoded BNL
- Download KNLs from bootstrap nodes
- Build routing table through gossip
- Regularly update node status

**5. Peering Process**
1. Evaluate potential peers (settlement methods, features, reputation)
2. Send peering request
3. Exchange heartbeat messages
4. Monitor liquidity and reliability
5. Advertise peering relationship to network

#### Reactive Programming Model
Dassie uses a reactive architecture with:
- `createActor` - background processes
- `createComputed` - derived values
- `createSignal` - reactive state
- `createStore` - persistent state
- `Reactor` - execution context

#### Token Payment Protocol
Secure two-phase payment for services:
1. **Purchase Phase**: Buy tokens with ILP payment
2. **Redemption Phase**: Exchange tokens for service
3. Uses execution conditions and witnesses to prevent fraud

---

## Nostream Relay

### Overview
Nostream is a production-ready Nostr relay implementation written in TypeScript, supporting most NIPs and designed for scalability.

### Features

#### Supported NIPs
- NIP-01: Basic protocol flow
- NIP-02: Contact list and petnames
- NIP-04: Encrypted Direct Message
- NIP-09: Event deletion
- NIP-11: Relay information document
- NIP-13: Proof of Work
- NIP-15: End of Stored Events Notice
- NIP-20: Command Results
- NIP-22: Event `created_at` Limits
- NIP-28: Public Chat
- NIP-33: Parameterized Replaceable Events
- NIP-40: Expiration Timestamp

#### Architecture
- **Database**: PostgreSQL 14.0+
- **Cache**: Redis
- **Runtime**: Node.js v18+
- **Language**: TypeScript

#### Payment Integration
Nostream supports paid relays with multiple payment processors:

**Supported Payment Processors:**
1. **ZEBEDEE**: Lightning payment processor with webhooks
2. **Nodeless**: Lightning invoices and webhooks
3. **OpenNode**: Lightning payment API
4. **LNbits**: Self-hosted Lightning wallet
5. **LNURL**: Universal Lightning URL protocol

**Payment Flow:**
1. User visits relay
2. Relay requires admission fee
3. User pays Lightning invoice
4. Relay confirms payment via webhook
5. User's pubkey granted access

**Configuration:**
```yaml
payments:
  enabled: true
  processor: zebedee
  feeSchedules:
    admission:
      enabled: true
      amount: 1000000  # msats
```

#### Event Filtering
- Filter by author (pubkey)
- Filter by kind
- Filter by tags
- Time-based filtering
- Proof-of-Work requirements

---

## CosmWasm Smart Contracts

### Overview
CosmWasm is a smart contract platform for the Cosmos ecosystem, enabling WebAssembly-based contracts with IBC support.

### Key Components

#### Crates
- **cosmwasm-std**: Standard library for contracts
- **cosmwasm-vm**: WebAssembly execution engine
- **cosmwasm-schema**: JSON schema generation
- **cosmwasm-check**: Contract verification tool

#### Contract Entry Points
```rust
#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError>

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError>

#[entry_point]
pub fn query(
    deps: Deps,
    env: Env,
    msg: QueryMsg,
) -> Result<Binary, ContractError>

#[entry_point]
pub fn migrate(
    deps: DepsMut,
    env: Env,
    msg: MigrateMsg,
) -> Result<Response, ContractError>
```

#### Storage API
```rust
pub trait Storage {
    fn get(&self, key: &[u8]) -> Option<Vec<u8>>;
    fn set(&mut self, key: &[u8], value: &[u8]);
    fn remove(&mut self, key: &[u8]);

    #[cfg(feature = "iterator")]
    fn range<'a>(&'a self, start: Option<&[u8]>, end: Option<&[u8]>, order: Order)
        -> Box<dyn Iterator<Item = Record> + 'a>;
}
```

#### IBC Support
For cross-chain communication:
- `ibc_channel_open`
- `ibc_channel_connect`
- `ibc_channel_close`
- `ibc_packet_receive`
- `ibc_packet_ack`
- `ibc_packet_timeout`

### Use Cases for Nostr-ILP
- Escrow contracts for marketplace transactions
- Multi-signature payment authorization
- Automated payment splitting
- Trustless exchange between assets
- Decentralized governance for payment routing

---

## Arweave Permanent Storage

### Overview
Arweave is a decentralized storage network that enables permanent data storage with a one-time payment model. Unlike traditional cloud storage with recurring fees, Arweave uses an endowment model where upfront payment covers storage costs in perpetuity.

### Key Concepts

#### Permanent Storage Model
- **One-time payment**: Pay once, store forever
- **Economic endowment**: Storage costs decline over time due to technological advancement
- **200+ year guarantee**: Network designed for multi-century data persistence
- **No recurring fees**: Eliminates ongoing storage costs for relay operators

#### Data Structure
- **Transactions**: Immutable data uploads identified by transaction ID
- **Transaction ID**: 43-character base64-URL encoded hash
- **Block weave**: Novel blockchain structure linking data blocks
- **Content addressing**: Data retrieved via transaction ID

#### ArFS (Arweave File System)
- Hierarchical file/folder structure on Arweave
- Metadata stored in Arweave transactions
- Public and private file support
- Version control and file history

### Integration with Nostr-ILP

#### Storage Tiers

**Hot Storage (Relay PostgreSQL/Redis):**
- Kind `1` - Short text notes (< 280 chars)
- Kind `7` - Reactions/likes
- Kind `3` - Follow lists
- Kind `5` - Deletion requests
- Recent events (last 30-90 days configurable)

**Cold Storage (Arweave):**
- Kind `30023` - Long-form content (articles, blog posts)
- Kind `1063` - File metadata
- Kind `71`, `22` - Video events
- Kind `20` - Pictures
- Kind `23` - Long-form content
- **Event backups**: All relay events periodically archived

#### Payment Model: Bundled Pricing

**Single ILP Payment Covers:**
1. Relay service fee (event validation, distribution, caching)
2. Arweave storage cost (calculated based on content size)
3. Network routing (ILP connector fees)

**Price Calculation:**
```typescript
// Pseudo-code for bundled pricing
interface EventCost {
  relayFee: number;        // Base relay processing fee (msats)
  arweaveCost: number;     // Arweave storage cost (msats)
  sizeFee: number;         // Additional fee for large content
  kindMultiplier: number;  // Per-kind pricing multiplier
}

function calculateCost(event: NostrEvent, contentSize: number): EventCost {
  const baseRelayFee = 100; // 100 msats base
  const arweavePricePerMB = 5000; // AR price converted to msats
  const kindMultipliers = {
    1: 0.1,      // Short notes - cheap
    30023: 2.0,  // Long-form - 2x
    1063: 3.0,   // Files - 3x
    71: 5.0      // Video - 5x
  };

  const sizeMB = contentSize / (1024 * 1024);
  const arweaveCost = Math.ceil(sizeMB * arweavePricePerMB);
  const multiplier = kindMultipliers[event.kind] || 1.0;

  return {
    relayFee: baseRelayFee * multiplier,
    arweaveCost: arweaveCost,
    sizeFee: Math.max(0, (sizeMB - 1) * 1000), // Free first MB
    kindMultiplier: multiplier
  };
}

const totalCost = cost.relayFee + cost.arweaveCost + cost.sizeFee;
```

#### Event Structure with Arweave References

**For Large Content (stored on Arweave only):**
```json
{
  "id": "event_id_hash",
  "pubkey": "user_pubkey",
  "created_at": 1234567890,
  "kind": 30023,
  "tags": [
    ["d", "unique-article-identifier"],
    ["title", "My Article Title"],
    ["arweave", "tx_id_43_characters_long"],
    ["arweave-size", "1024576"],
    ["content-type", "text/markdown"],
    ["summary", "Brief summary of the content..."]
  ],
  "content": "",
  "sig": "signature"
}
```

**For Media Files:**
```json
{
  "id": "event_id_hash",
  "pubkey": "user_pubkey",
  "created_at": 1234567890,
  "kind": 1063,
  "tags": [
    ["url", "ar://tx_id_43_characters_long"],
    ["arweave", "tx_id_43_characters_long"],
    ["m", "image/jpeg"],
    ["x", "file_hash_sha256"],
    ["size", "2048000"],
    ["dim", "1920x1080"],
    ["blurhash", "hash_for_preview"]
  ],
  "content": "Photo from my vacation",
  "sig": "signature"
}
```

### Upload Flow

```
┌─────────────┐
│   Client    │
│  (Browser)  │
└──────┬──────┘
       │
       │ 1. POST /arweave/upload
       │    { content, kind, tags }
       ▼
┌─────────────────────────────┐
│    Nostream Relay           │
│  + Arweave Integration      │
└──────┬──────────────────────┘
       │
       │ 2. Calculate costs
       │    (relay fee + Arweave storage)
       ▼
       │ 3. Request ILP payment quote
       │
┌──────▼─────────┐
│  Dassie Node   │
│   (ILP)        │
└──────┬─────────┘
       │
       │ 4. Return payment quote
       ▼
┌─────────────────────────────┐
│    Relay Payment Handler    │
└──────┬──────────────────────┘
       │
       │ 5. Return quote to client
       ▼
┌──────────────┐
│   Client     │ 6. User confirms payment
└──────┬───────┘
       │
       │ 7. Send ILP payment
       ▼
┌─────────────────────────────┐
│    Relay receives payment   │
└──────┬──────────────────────┘
       │
       │ 8. Upload to Arweave
       ▼
┌──────────────┐
│   Arweave    │
│   Network    │
└──────┬───────┘
       │
       │ 9. Return tx_id
       ▼
┌─────────────────────────────┐
│    Relay creates event      │
│    with arweave tag         │
└──────┬──────────────────────┘
       │
       │ 10. Return signed event
       │     with tx_id to client
       ▼
┌──────────────┐
│   Client     │ 11. Broadcast event to relays
└──────────────┘
```

### Relay Implementation Details

#### Required Components

**1. Arweave Wallet Management**
```typescript
// packages/relay-arweave/src/wallet.ts
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';

export class ArweaveWalletManager {
  private arweave: Arweave;
  private wallet: JWKInterface;

  constructor(walletKeyPath: string) {
    this.arweave = Arweave.init({
      host: 'arweave.net',
      port: 443,
      protocol: 'https'
    });
    this.wallet = JSON.parse(fs.readFileSync(walletKeyPath, 'utf8'));
  }

  async getBalance(): Promise<string> {
    const address = await this.arweave.wallets.jwkToAddress(this.wallet);
    return this.arweave.wallets.getBalance(address);
  }

  async uploadData(data: Buffer, contentType: string, tags: Array<{name: string, value: string}>): Promise<string> {
    const transaction = await this.arweave.createTransaction({
      data: data
    }, this.wallet);

    transaction.addTag('Content-Type', contentType);
    transaction.addTag('App-Name', 'nostr-ilp-relay');
    transaction.addTag('App-Version', '1.0.0');

    for (const tag of tags) {
      transaction.addTag(tag.name, tag.value);
    }

    await this.arweave.transactions.sign(transaction, this.wallet);
    await this.arweave.transactions.post(transaction);

    return transaction.id;
  }
}
```

**2. Upload Endpoint**
```typescript
// packages/relay-arweave/src/routes/upload.ts
import { Request, Response } from 'express';
import { ArweaveWalletManager } from '../wallet';
import { ILPPaymentHandler } from '../payment';

export async function handleArweaveUpload(req: Request, res: Response) {
  const { content, kind, tags, pubkey } = req.body;

  // 1. Validate content
  if (!content || !kind) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // 2. Calculate costs
  const contentBuffer = Buffer.from(content);
  const contentSize = contentBuffer.length;
  const costs = calculateBundledCost(kind, contentSize);

  // 3. Create payment quote
  const paymentHandler = new ILPPaymentHandler();
  const quote = await paymentHandler.createQuote(
    costs.total,
    `Arweave upload for kind ${kind}, size ${contentSize} bytes`
  );

  // 4. Return quote to client
  res.json({
    quote: {
      id: quote.id,
      amount: costs.total,
      breakdown: {
        relayFee: costs.relayFee,
        arweaveCost: costs.arweaveCost,
        sizeFee: costs.sizeFee
      },
      ilp_address: quote.destination,
      expires_at: quote.expiresAt
    }
  });

  // 5. Wait for payment (WebSocket or polling)
  const paymentReceived = await paymentHandler.waitForPayment(quote.id, 300000); // 5 min timeout

  if (!paymentReceived) {
    return res.status(402).json({ error: 'Payment not received' });
  }

  // 6. Upload to Arweave
  const arweave = new ArweaveWalletManager(process.env.ARWEAVE_WALLET_PATH);
  const txId = await arweave.uploadData(
    contentBuffer,
    req.body.contentType || 'text/plain',
    [
      { name: 'Nostr-Kind', value: kind.toString() },
      { name: 'Nostr-Pubkey', value: pubkey },
      ...tags.map(([key, value]) => ({ name: `Nostr-Tag-${key}`, value }))
    ]
  );

  // 7. Return transaction ID
  res.json({
    success: true,
    arweave_tx: txId,
    url: `https://arweave.net/${txId}`,
    cost_paid: costs.total
  });
}
```

**3. Event Backup System**
```typescript
// packages/relay-arweave/src/backup.ts
import { EventRepository } from '@nostream/core';

export class ArweaveBackupService {
  private arweave: ArweaveWalletManager;
  private eventRepo: EventRepository;

  async backupEvents(startDate: Date, endDate: Date): Promise<string> {
    // 1. Query events from database
    const events = await this.eventRepo.findByDateRange(startDate, endDate);

    // 2. Create backup manifest
    const manifest = {
      relay: process.env.RELAY_NAME,
      backup_date: new Date().toISOString(),
      event_count: events.length,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString()
    };

    // 3. Bundle events as NDJSON
    const ndjson = events.map(e => JSON.stringify(e)).join('\n');

    // 4. Compress with gzip
    const compressed = await gzip(Buffer.from(ndjson));

    // 5. Upload to Arweave
    const txId = await this.arweave.uploadData(
      compressed,
      'application/x-ndjson+gzip',
      [
        { name: 'Backup-Manifest', value: JSON.stringify(manifest) },
        { name: 'Backup-Type', value: 'nostr-events' },
        { name: 'Relay-Name', value: process.env.RELAY_NAME }
      ]
    );

    // 6. Store backup reference in database
    await this.storeBackupReference({
      tx_id: txId,
      event_count: events.length,
      start_date: startDate,
      end_date: endDate,
      created_at: new Date()
    });

    return txId;
  }

  // Run daily backup job
  async scheduleDailyBackup() {
    setInterval(async () => {
      const yesterday = new Date(Date.now() - 86400000);
      const today = new Date();
      await this.backupEvents(yesterday, today);
    }, 86400000); // 24 hours
  }
}
```

### Configuration

**Relay Settings (.nostr/settings.yaml):**
```yaml
arweave:
  enabled: true
  wallet_path: /path/to/arweave-keyfile.json
  min_balance_ar: 1.0  # Alert if balance falls below 1 AR

  # Which kinds require Arweave storage
  required_kinds:
    - 30023  # Long-form content
    - 1063   # File metadata
    - 71     # Video
    - 22     # Short video
    - 20     # Picture

  # Backup configuration
  backup:
    enabled: true
    frequency: daily
    retention_days: 90  # Keep events in hot storage for 90 days

payments:
  enabled: true
  processor: ilp
  bundled_pricing: true

  arweave_pricing:
    # Price per MB in AR tokens (updated from oracle)
    ar_per_mb: 0.001
    ar_to_usd_rate: 25.0  # Updated via price feed

  fee_schedules:
    per_kind:
      default: 100  # msats
      30023: 500    # Long-form gets relay fee
      1063: 1000    # Files
      71: 2000      # Video
```

### Client Implementation

**Upload Helper:**
```typescript
// client/src/arweave-upload.ts
export async function uploadToArweaveThroughRelay(
  relay: string,
  content: string | Buffer,
  kind: number,
  tags: string[][],
  signer: NostrSigner
): Promise<NostrEvent> {

  // 1. Request upload quote
  const quoteRes = await fetch(`${relay}/api/arweave/upload/quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: content.toString('base64'),
      kind,
      tags,
      pubkey: await signer.getPublicKey()
    })
  });

  const quote = await quoteRes.json();

  // 2. Show cost to user
  console.log(`Upload cost: ${quote.amount} msats`);
  console.log(`Breakdown:`, quote.breakdown);

  // 3. Pay via ILP
  const payment = await ilpPay(quote.ilp_address, quote.amount);

  // 4. Upload content
  const uploadRes = await fetch(`${relay}/api/arweave/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payment_proof: payment.proof,
      quote_id: quote.id
    })
  });

  const result = await uploadRes.json();

  // 5. Create Nostr event with Arweave reference
  const event = {
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ...tags,
      ['arweave', result.arweave_tx],
      ['arweave-size', content.length.toString()],
      ['arweave-url', result.url]
    ],
    content: '', // Content is on Arweave
    pubkey: await signer.getPublicKey()
  };

  // 6. Sign and return
  return await signer.signEvent(event);
}
```

### Retrieval Flow

**Content Retrieval:**
```typescript
// Fetch content from Arweave when displaying event
async function getEventContent(event: NostrEvent): Promise<string> {
  const arweaveTx = event.tags.find(t => t[0] === 'arweave')?.[1];

  if (!arweaveTx) {
    return event.content; // No Arweave reference, use inline content
  }

  // Fetch from Arweave
  const response = await fetch(`https://arweave.net/${arweaveTx}`);
  return await response.text();
}
```

### Benefits Summary

1. **Economic Efficiency**
   - One-time storage payment vs. recurring cloud costs
   - Relay operators predictable cost model
   - Users pay proportionally for storage used

2. **Data Durability**
   - Events backed up to permanent storage
   - Relay failure doesn't mean data loss
   - Multi-century data preservation

3. **Scalability**
   - Relays cache hot data only
   - Large content doesn't bloat relay databases
   - Archive old events to Arweave, free up space

4. **Decentralization**
   - No dependence on centralized storage (S3, etc.)
   - Content addressable via transaction ID
   - Censorship resistant

5. **Business Model**
   - Clear value proposition: permanent storage + relay service
   - Bundled pricing simplifies UX
   - Competitive differentiation from Lightning-only relays

---

## Integration Architecture

### Project Vision: Nostr-ILP Bridge

This project aims to bridge Nostr's social layer with Interledger's payment layer, enabling:

1. **Micropayments for Content**
   - Pay-per-post or pay-per-view content
   - Tips and donations via ILP (alternative to Lightning)
   - Subscription management

2. **Cross-Network Payments**
   - Send payments to Nostr users using any asset
   - ILP routing for optimal payment paths
   - Support for multiple settlement methods

3. **Relay Payment Infrastructure**
   - Paid relays accepting ILP payments
   - Alternative to Lightning-only payment models
   - Lower barrier to entry (no Lightning channel management)

4. **Decentralized Marketplace**
   - NIP-15 marketplace with ILP settlement
   - Escrow via smart contracts
   - Multi-currency support

### Technical Integration Points

#### 1. Nostr Events for ILP
Create custom Nostr event kinds for:
- Payment requests (similar to NIP-57 zap requests)
- Payment receipts (proof of payment)
- ILP address announcements (profile metadata)
- Settlement confirmations

#### 2. Relay Extensions
Extend Nostream relay with:
- ILP payment processor integration
- Dassie node connection
- Payment verification middleware
- Balance tracking per pubkey

#### 3. Client Integration
Client applications need:
- ILP wallet integration
- Payment flow UI (request → pay → confirm)
- Balance display
- Transaction history

#### 4. Settlement Layer
Options for settlement:
- Direct blockchain settlement
- Trust-based credit lines
- Lightning Network (hybrid approach)
- Stablecoin transfers

### Security Considerations

#### From Dassie Documentation
1. **Frontend Security**: Generate root seeds server-side or use service workers
2. **Content Security Policy**: Prevent XSS attacks
3. **Cryptographic Signatures**: Verify all payments and messages
4. **Replay Attack Prevention**: Cache received ILP packets

#### From Nostr
1. **Key Management**: Secure private key storage (NIP-07 browser extension)
2. **Event Verification**: Always verify event signatures
3. **Relay Trust**: Don't trust any single relay
4. **Encrypted Communication**: Use NIP-17 for private messages

### Payment Flow Example

```
1. Alice wants to tip Bob for a post on Nostr

2. Alice's client:
   - Fetches Bob's ILP address from his Nostr profile (custom tag)
   - Creates ILP payment quote
   - Shows amount in Alice's preferred currency

3. Alice confirms payment:
   - Client sends ILP payment via Dassie node
   - Payment routes through ILP network
   - Bob's Dassie node receives payment

4. Bob's client:
   - Receives payment confirmation from Dassie
   - Creates Nostr event (kind: custom payment receipt)
   - Publishes event to relays
   - Alice's client displays confirmation
```

### Database Schema Considerations

For a Nostr-ILP relay, you'll need:

**User Accounts:**
- nostr_pubkey (primary key)
- ilp_address
- balance (in msats or base units)
- created_at
- last_payment_at

**Payments:**
- payment_id (primary key)
- from_pubkey
- to_pubkey
- amount
- currency
- ilp_packet_hash
- status (pending, completed, failed)
- timestamp

**Events (extend Nostream schema):**
- Add: requires_payment (boolean)
- Add: payment_amount (integer)
- Add: payment_currency (string)

---

## Development Resources

### Documentation Links
- Nostr NIPs: https://github.com/nostr-protocol/nips
- Dassie: https://github.com/justmoon/dassie
- Nostream: https://github.com/cameri/nostream
- Interledger: https://interledger.org
- CosmWasm: https://github.com/CosmWasm/cosmwasm

### Key Dependencies
```toml
# Rust (Dassie/ILP integration)
dassie = "*"
cosmwasm-std = "3.0"
interledger = "*"

# TypeScript (Nostream relay)
nostr-tools = "^2.0"
ws = "^8.0"
postgresql = "^14.0"

# JavaScript/TypeScript (Client)
nostr-tools = "^2.0"
@interledger/pay = "*"
```

### Testing Strategy
1. **Unit Tests**: Test individual components (Rust & TypeScript)
2. **Integration Tests**: Test ILP payment flows end-to-end
3. **Relay Tests**: Test Nostr event handling with payments
4. **Security Tests**: Test key management, signature verification
5. **Load Tests**: Test relay performance under payment load

### Deployment Architecture
```
┌─────────────────┐
│  Nostr Client   │
│   (Browser/App) │
└────────┬────────┘
         │
         ├─── WebSocket ───┐
         │                 │
         └─── HTTP/ILP ────┤
                          │
         ┌────────────────▼────────┐
         │   Nostream Relay        │
         │   + ILP Integration     │
         └────────┬────────────────┘
                  │
         ┌────────┴────────┐
         │                 │
    ┌────▼────┐      ┌────▼────┐
    │PostgreSQL│      │  Redis  │
    │  Events  │      │  Cache  │
    └──────────┘      └──────────┘

         ┌────────────────┐
         │  Dassie Node   │
         │  (ILP Routing) │
         └────────┬───────┘
                  │
         ┌────────┴────────┐
         │                 │
    ┌────▼─────┐     ┌─────▼────┐
    │Settlement│     │  Peers   │
    │ Ledger   │     │  (Other  │
    │          │     │  Dassie) │
    └──────────┘     └──────────┘
```

---

## Glossary

**Nostr Terms:**
- **npub**: Nostr public key (bech32-encoded)
- **nsec**: Nostr secret/private key (bech32-encoded)
- **Relay**: Server that stores and forwards Nostr events
- **Event**: Signed JSON message in Nostr
- **NIP**: Nostr Implementation Possibility (protocol extension)
- **Zap**: Lightning Network tip on Nostr (NIP-57)

**ILP Terms:**
- **Connector**: Node that routes ILP payments
- **STREAM**: ILP protocol for streaming payments
- **Condition/Fulfillment**: Cryptographic commitment for atomic payments
- **Settlement**: Final transfer of value between peers
- **Liquidity**: Available funds for routing payments

**Dassie Terms:**
- **BNL**: Bootstrap Node List (trusted initial peers)
- **KNL**: Known Node List (discovered peers)
- **Reactor**: Reactive execution context
- **Internal Ledger**: Double-entry accounting system
- **Token Payment Protocol**: Secure two-phase payment

**CosmWasm Terms:**
- **Entry Point**: Exported function that the VM calls
- **DepsMut/Deps**: Dependencies (storage, API access)
- **Response**: Return value from contract execution
- **IBC**: Inter-Blockchain Communication protocol

**Arweave Terms:**
- **Transaction ID (tx_id)**: 43-character unique identifier for stored data
- **Blockweave**: Arweave's blockchain structure linking blocks to previous transactions
- **Endowment**: Economic model where upfront payment funds perpetual storage
- **AR**: Native token of Arweave network
- **Winston**: Smallest unit of AR (1 AR = 1,000,000,000,000 winston)
- **Gateway**: HTTP server providing access to Arweave data
- **Permaweb**: Collection of permanent web apps/sites on Arweave
- **ArFS**: Arweave File System for hierarchical file storage

---

## Next Steps for Implementation

1. **Phase 1: Basic Integration**
   - Define custom Nostr event kinds for ILP payments
   - Create ILP address announcement format (profile metadata)
   - Build simple payment request/response flow
   - Implement per-kind pricing configuration

2. **Phase 2: Arweave Storage Layer**
   - Set up Arweave wallet management for relay
   - Implement upload endpoint with bundled ILP+Arweave pricing
   - Add automatic backup system for all events
   - Create client upload helpers
   - Implement content retrieval from Arweave

3. **Phase 3: Relay Integration**
   - Extend Nostream with Dassie client
   - Implement payment verification and balance tracking
   - Add event kind-based pricing logic
   - Create hot/cold storage tier management
   - Implement daily backup scheduler

4. **Phase 4: Client Development**
   - Build browser extension or standalone client
   - Integrate ILP wallet functionality
   - Create payment UI with cost breakdown
   - Add Arweave upload/download support
   - Implement content preview before payment

5. **Phase 5: Advanced Features**
   - Smart contract escrow (CosmWasm)
   - Multi-hop routing optimization
   - Subscription management with ILP streaming
   - Marketplace integration with Arweave storage
   - Price oracle for AR/ILP conversion

6. **Phase 6: Production Hardening**
   - Security audits (payment flow, key management)
   - Load testing (payment processing, Arweave uploads)
   - Monitoring and alerting (wallet balance, upload failures)
   - Monitoring and alerting
   - Documentation and tutorials

---

*Last Updated: 2025-11-25*
*This document is maintained as part of the nostr-ilp project.*
