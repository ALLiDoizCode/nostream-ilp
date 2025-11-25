# Data Models

## NostrEvent

**Purpose:** Represents a Nostr event (note, reaction, long-form content, etc.) stored in the relay

**Key Attributes:**
- `id`: string (SHA-256 hash of event) - Primary key
- `pubkey`: string (hex-encoded public key) - Author identifier
- `created_at`: integer (Unix timestamp) - Event creation time
- `kind`: integer (event type) - Determines event category (1=note, 30023=article, etc.)
- `tags`: array of string arrays - Metadata, references, payment claims
- `content`: text - Event payload (may be empty if stored in Arweave)
- `sig`: string (hex-encoded signature) - Cryptographic proof of authorship

**Relationships:**
- References other events via `["e", "<event_id>"]` tags (replies, quotes)
- References users via `["p", "<pubkey>"]` tags (mentions)
- References Arweave via `["arweave", "<tx_id>"]` tags (permanent storage)

## PaymentClaim

**Purpose:** Off-chain payment claim embedded in Nostr event tags for micropayment verification

**Key Attributes:**
- `channelId`: string - Identifier for payment channel (blockchain-specific)
- `amountSats`: integer - Payment amount in satoshis (standardized across currencies)
- `nonce`: integer - Monotonically increasing counter (prevents replay attacks)
- `signature`: string (hex) - Cryptographic signature from payer
- `currency`: enum ('BTC' | 'BASE' | 'AKT' | 'XRP') - Payment currency

**Relationships:**
- Embedded in NostrEvent.tags as `["payment", "ilp", channelId, amount, nonce, signature, currency]`
- Verified against PaymentChannel state in Dassie ledger

## PaymentChannel (Dassie Internal State)

**Purpose:** Tracks state of payment channels across all blockchains in Dassie's internal ledger

**Key Attributes:**
- `channelId`: string - Unique identifier (Primary key)
- `blockchain`: enum ('BTC' | 'BASE' | 'AKT' | 'XRP') - Settlement network
- `sender`: string - Payer's address (blockchain-specific format)
- `recipient`: string - Relay's address
- `capacity`: bigint - Total locked funds in channel
- `balance`: bigint - Current unclaimed balance
- `highestNonce`: integer - Last verified nonce (prevents double-spend)
- `expiration`: integer (Unix timestamp) - When channel expires
- `status`: enum ('OPEN' | 'CLOSED' | 'EXPIRED') - Channel state

**Relationships:**
- Links to Dassie ledger accounts: `<currency>:assets/settlement/<channelId>`
- References on-chain contracts (CosmWasm address, Base contract address, etc.)

## EconomicSnapshot

**Purpose:** Tracks relay's financial health over time for profitability monitoring

**Key Attributes:**
- `timestamp`: timestamptz - Snapshot time (Primary key)
- `revenue_btc`: bigint - Revenue from BTC payments (in satoshis)
- `revenue_base`: bigint - Revenue from BASE payments (in wei)
- `revenue_akt`: bigint - Revenue from AKT payments (in uakt)
- `revenue_xrp`: bigint - Revenue from XRP payments (in drops)
- `routing_fees_total`: bigint - ILP connector fees earned (AKT-equivalent)
- `arweave_expenses`: bigint - AR spent on uploads/backups (in winston)
- `akash_expenses`: bigint - Akash hosting costs (in uakt)
- `net_profit`: bigint - Total profit (in AKT-equivalent)
- `akt_balance`: bigint - Current AKT balance for Akash payments

**Relationships:**
- Aggregated from Dassie ledger accounts via RPC queries
- Used by Economic Monitor for profitability alerts
- Displayed in operator dashboard

## ArweaveBackup

**Purpose:** Tracks daily event backups uploaded to Arweave for disaster recovery

**Key Attributes:**
- `tx_id`: string (43 chars) - Arweave transaction ID (Primary key)
- `event_count`: integer - Number of events in backup
- `start_date`: timestamptz - Backup date range start
- `end_date`: timestamptz - Backup date range end
- `created_at`: timestamptz - When backup was created
- `size_bytes`: bigint - Compressed backup size
- `ar_cost`: decimal - AR tokens spent on upload

**Relationships:**
- ArchivedEvent references ArweaveBackup.tx_id
- Used for hot/cold storage tier management

## ArchivedEvent (Stub Record)

**Purpose:** Minimal record for events archived to Arweave (full data deleted from PostgreSQL)

**Key Attributes:**
- `id`: string - Original event ID (Primary key)
- `created_at`: timestamptz - Original event timestamp
- `kind`: integer - Event kind (for filtering)
- `arweave_backup_tx`: string - Reference to ArweaveBackup.tx_id
- `archived_at`: timestamptz - When event was archived

**Relationships:**
- Links to ArweaveBackup containing full event data
- Clients query this table when requesting old events
- REQ handler returns event with `["arweave", tx_id]` tag

## CosmWasmPaymentChannel (Smart Contract State)

**Purpose:** On-chain state for Cosmos/Akash payment channels (stored in CosmWasm contract)

**Key Attributes:**
- `id`: string - Channel identifier
- `sender`: Addr - Cosmos address of payer
- `recipient`: Addr - Relay's Cosmos address
- `amount`: Uint128 - Locked AKT amount (in uakt)
- `denom`: string - "uakt"
- `expiration`: u64 - Block height or timestamp
- `highest_claim`: Uint128 - Largest verified claim
- `status`: enum (Open | Closed | Expired)

**Relationships:**
- Mirrored in Dassie internal ledger for off-chain verification
- Contract deployed on Akash chain

---
