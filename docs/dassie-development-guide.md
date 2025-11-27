# Dassie Development Guide

## Overview

This guide covers setting up a local Dassie development environment for the Nostr-ILP integration project. Dassie is a modern Interledger Protocol (ILP) node implementation that will handle payment routing and settlement for the Nostream relay.

## Prerequisites

### Required Software

| Tool | Version | Purpose | Installation |
|------|---------|---------|--------------|
| Node.js | v22.8.0 **(exact)** | Runtime environment | `fnm install 22.8.0` |
| fnm | Latest | Node version manager | `brew install fnm` |
| pnpm | 9.12.0+ | Package manager | `npm install -g pnpm@9.12.0` |
| mkcert | Latest | Local TLS certificates | `brew install mkcert` |
| dnsmasq | Latest | Wildcard localhost DNS | `brew install dnsmasq` |

### Why Exact Node.js Version?

Dassie's development server has a **strict version check** and will refuse to start with any version other than v22.8.0. This ensures consistency across development environments.

## Installation Steps

### Step 1: Install fnm (Fast Node Manager)

```bash
brew install fnm
```

Add fnm to your shell configuration (`~/.zshrc` or `~/.bashrc`):

```bash
eval "$(fnm env --use-on-cd)"
```

Reload your shell:

```bash
source ~/.zshrc  # or source ~/.bashrc
```

### Step 2: Install Node.js v22.8.0

```bash
fnm install 22.8.0
fnm use 22.8.0
node --version  # Should output: v22.8.0
```

### Step 3: Disable Corepack and Install pnpm

Due to corepack signature verification issues in Node.js v22.8.0, we install pnpm globally:

```bash
corepack disable
npm install -g pnpm@9.12.0 --force
pnpm --version  # Should output: 9.12.0
```

### Step 4: Install and Configure mkcert

```bash
# Install mkcert
brew install mkcert

# Create and install local CA
mkcert -install

# Verify CA root path
mkcert -CAROOT
# Example output: /Users/yourname/Library/Application Support/mkcert
```

Add the following to your shell configuration (`~/.zshrc` or `~/.bashrc`):

```bash
export NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"
```

Reload your shell:

```bash
source ~/.zshrc  # or source ~/.bashrc
```

### Step 5: Install and Configure dnsmasq (Wildcard localhost DNS)

```bash
# Install dnsmasq
brew install dnsmasq

# Configure wildcard localhost resolution
echo 'address=/.localhost/127.0.0.1' >> /opt/homebrew/etc/dnsmasq.conf

# Create macOS resolver for .localhost domains
sudo mkdir -p /etc/resolver
echo "nameserver 127.0.0.1" | sudo tee /etc/resolver/localhost

# Start dnsmasq service
sudo brew services start dnsmasq

# Flush DNS cache
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder
```

**Verify DNS works:**

```bash
ping test.localhost  # Should resolve to 127.0.0.1
node -e "require('dns').lookup('test.localhost', console.log)"  # Should output: null 127.0.0.1
```

### Step 6: Clone Dassie Repository

```bash
# Navigate to parent directory (sibling to nostream-ilp)
cd ~/Documents  # or wherever nostream-ilp is located

# Clone Dassie
git clone https://github.com/justmoon/dassie.git
cd dassie
```

### Step 7: Install Dependencies

```bash
# Ensure you're using Node v22.8.0
fnm use 22.8.0

# Install dependencies
pnpm install

# Verify workspace packages
pnpm list --depth 0
```

### Step 8: Verify Type Checking

```bash
pnpm typecheck
```

**Expected output:** No errors (warnings about Node version are acceptable)

## Starting the Development Environment

### Run Development Server

```bash
# Ensure correct Node version
fnm use 22.8.0

# Start development server
pnpm start
# OR
pnpm dev  # Alias for pnpm start
```

**Expected startup output:**

```
  Dassie//dev

  Starting development server...

  Debug UI: https://localhost/ <- Start here

  (space) to open in browser
  (r) to restart
  (ctrl+c) to quit
```

### Multi-Node Development Environment

The development server automatically spins up **multiple Dassie nodes** locally for testing:

- Each node runs on a different port
- Nodes are accessible via `*.localhost` subdomains (e.g., `node1.localhost`, `node2.localhost`)
- The Debug UI at `https://localhost/` provides an overview of all running nodes

### Accessing Node Web Interface

1. **Start the development server** (see above)
2. **Press space** or visit `https://localhost/` in your browser
3. **First-time setup:**
   - You'll see a message: "Node identity is not configured"
   - Follow the setup URL printed in the console
   - Complete node configuration via the web interface (set node identity)
4. **After setup:**
   - DaemonActor initializes successfully
   - LocalRpcServerActor, HttpServerActor, TrpcServerActor start
   - Web interface becomes fully functional

**Key Actors (services) that initialize:**

- **LocalRpcServerActor**: Local IPC for CLI communication
- **HttpServerActor**: HTTPS server infrastructure
- **AcmeCertificateManagerActor**: TLS certificate management (uses mkcert in dev)
- **TrpcServerActor**: tRPC server for API endpoints (**critical for Nostream integration**)
- **AuthenticationFeatureActor**: User authentication system
- **AccountingActor**: Internal double-entry ledger (tracks all payments)
- **PeerProtocolActor**: Peer-to-peer communication (UDP + gossip)
- **RoutingActor**: ILP routing table management

## RPC Server Access

Dassie exposes a **tRPC WebSocket API** that Nostream will use for payment operations.

### RPC Server Details

- **Protocol**: tRPC over WebSocket
- **Endpoint**: `ws://localhost:5000/trpc` (port varies, check console logs)
- **Authentication**: Session cookies, Bearer token (see RPC Authentication below)
- **Type Safety**: tRPC provides TypeScript types for client integration

### RPC Authentication (Story 2.2)

Dassie RPC server supports **three authentication methods**:

#### 1. Session Cookie Authentication (Web UI)

Used by the Dassie web interface for logged-in users:

- Cookie name: `__Host-Dassie-Session`
- Managed by SessionsStore (in-memory)
- Automatically handled by browser

#### 2. Production Token Authentication (External Services)

**For external services like Nostream**, use Bearer token authentication:

**Generate a secure token:**

```bash
# Generate 64-character hex token (recommended)
openssl rand -hex 32

# Output example: a1b2c3d4e5f6...
```

**Configure Dassie with the token:**

Add to your environment variables before starting Dassie:

```bash
# Set RPC auth token (minimum 32 characters, recommend 64)
export DASSIE_RPC_AUTH_TOKEN="a1b2c3d4e5f6..."  # Use your generated token

# Start Dassie
pnpm start
```

**Token Requirements:**

- Minimum length: **32 characters**
- Recommended length: **64 characters** (matches dev token)
- Format: Any string (alphanumeric + special chars supported)
- Generation: Use cryptographically secure random source (e.g., `openssl rand`)

**Client usage (Nostream example):**

```typescript
import { createTRPCProxyClient, createWSClient } from '@trpc/client'

const wsClient = createWSClient({
  url: 'ws://localhost:5000/trpc',
  connectionParams: () => ({
    headers: {
      Authorization: `Bearer ${process.env.DASSIE_RPC_AUTH_TOKEN}`
    }
  })
})

const dassieClient = createTRPCProxyClient({ links: [wsClient] })
```

**Authorization header format:**

- Prefix: `Bearer` (case-insensitive)
- Separator: Single space
- Example: `Authorization: Bearer a1b2c3d4e5f6...`

#### 3. Development Token Authentication (Dev Mode Only)

Only available when `import.meta.env.DEV` is true:

```bash
# Generate dev token
export DASSIE_DEV_SECURITY_TOKEN=$(openssl rand -hex 32)

# Connect via query parameter
ws://localhost:5000/trpc?token=$DASSIE_DEV_SECURITY_TOKEN
```

**Important:** Dev token is NOT available in production builds.

### Authentication Precedence

When multiple auth methods are present, Dassie checks in this order:

1. **Session cookie** (if valid, user is authenticated)
2. **RPC auth token** (if valid Bearer token provided)
3. **Dev security token** (if in dev mode and valid token in query param)

If none are valid, the connection is unauthenticated and protected RPC calls will fail.

### Security Considerations

**Token Storage:**

- ✅ Store in environment variables
- ✅ Use secure random generation (`openssl rand`)
- ❌ Never hardcode tokens in source code
- ❌ Never commit tokens to git repositories
- ❌ Never log tokens in plain text

**Token Transmission:**

- ✅ Use Authorization header (not query parameters in production)
- ✅ Token is compared using constant-time algorithm (prevents timing attacks)
- ✅ Tokens are sanitized in logs (replaced with `***`)

**Token Rotation:**

To rotate tokens:

1. Generate new token: `openssl rand -hex 32`
2. Update both Dassie and Nostream environment variables
3. Restart both services
4. Verify connection works
5. Securely delete old token

### Testing RPC Authentication

**Test valid token:**

```bash
# Set auth token
export DASSIE_RPC_AUTH_TOKEN=$(openssl rand -hex 32)

# Start Dassie
cd ~/Documents/dassie
pnpm start

# Test connection with wscat (install: npm install -g wscat)
wscat -c "ws://localhost:5000/trpc" \
  -H "Authorization: Bearer $DASSIE_RPC_AUTH_TOKEN"
```

**Test invalid token (should fail):**

```bash
wscat -c "ws://localhost:5000/trpc" \
  -H "Authorization: Bearer invalid_token_xyz"

# Expected: Connection established but RPC calls fail with "Unauthorized"
```

**Test missing token (fallback to session/dev token):**

```bash
wscat -c "ws://localhost:5000/trpc"

# Expected:
# - Dev mode: Falls back to dev token (if set)
# - Production: Unauthenticated (protected calls fail)
```

### RPC Router Locations

RPC endpoints are defined in:

```
packages/app-dassie/src/*/rpc-routers/
```

**Examples:**

- `ledger`: Query balances, account state
- `debug`: Development/testing endpoints
- `authentication`: Login/logout
- `ilp-connector`: ILP routing queries

### Testing RPC Endpoints

1. **Start Dassie** (`pnpm start`)
2. **Access web interface** (setup complete)
3. **Open browser DevTools** → Network → WS tab
4. **Observe tRPC WebSocket messages** as you interact with the UI
5. **Test basic RPC calls** via web interface:
   - View node balance (`ledger.getBalance`)
   - Subscribe to account updates (`ledger.accountUpdates`)

### Future RPC Additions (Epic 2)

- **Story 2.2**: ✅ Token-based RPC authentication (COMPLETE)
- **Story 2.3**: `payment.verifyPaymentClaim` mutation
- **Story 2.9**: ✅ Routing statistics endpoint (`ledgers.getRoutingStats`) (COMPLETE)

## Routing Statistics API

**Added in Story 2.9** - Query routing fees, active peers, and connector revenue.

### Endpoint: `ledgers.getRoutingStats`

**Method:** `query` (no parameters)
**Authentication:** Required (`protectedRoute`)
**Returns:** Routing statistics object

### Response Structure

```typescript
interface RoutingStatsOutput {
  paymentsRouted24h: number;                    // ILP packets forwarded (currently 0)
  routingFeesEarned: Record<string, bigint>;    // Fees per ledger ID
  connectorRevenue: Record<string, bigint>;     // Total revenue per ledger
  activePeers: number;                          // Connected Dassie peers
  timestamp: number;                            // Unix timestamp (seconds)
}
```

### Example Response

```json
{
  "paymentsRouted24h": 0,
  "routingFeesEarned": {
    "xrpl+xrp": "5000000",
    "btc+lightning-testnet+btc": "12000000",
    "eth+base-sepolia+eth": "3500000",
    "akt+cosmos-akash+akt": "8000000"
  },
  "connectorRevenue": {
    "xrpl+xrp": "5000000",
    "btc+lightning-testnet+btc": "12000000",
    "eth+base-sepolia+eth": "3500000",
    "akt+cosmos-akash+akt": "8000000"
  },
  "activePeers": 8,
  "timestamp": 1732636800
}
```

### Usage from Nostream

```typescript
import { createRpcClient } from '@dassie/lib-rpc/client';
import type { AppRouter } from 'packages/app-dassie/src/rpc-server/app-router';

const dassieClient = createRpcClient<AppRouter>({
  url: "ws://localhost:5000/rpc"
});

// Query routing stats
const stats = await dassieClient.ledgers.getRoutingStats.query();

console.log(`Routing fees (XRP): ${stats.routingFeesEarned["xrpl+xrp"]} drops`);
console.log(`Active peers: ${stats.activePeers}`);
```

### Implementation Details

- **Location:** `packages/app-dassie/src/ledgers/rpc-routers/ledgers.ts`
- **Logic:** `packages/app-dassie/src/ledgers/functions/get-routing-stats.ts`
- **Revenue accounts:** `{ledgerId}:revenue/fees` (e.g., `xrpl+xrp:revenue/fees`)
- **Fees calculation:** `creditsPosted - debitsPosted` for each ledger
- **Peer count:** From `PeersSignal` (returns `Set<NodeId>`)

### Notes

- `paymentsRouted24h` currently returns 0 (packet counting not yet implemented)
- `connectorRevenue` currently equals `routingFeesEarned`
- All fees returned as bigint (JavaScript native support for large integers)
- Requires all settlement modules (Stories 2.4-2.8) for full multi-currency support

## Peer Discovery Process

Dassie uses a **distributed peer discovery mechanism** with anti-Sybil protection.

### How Peer Discovery Works

1. **Bootstrap Node List (BNL)**: Hardcoded trusted initial nodes
2. **Known Node List (KNL)**: Dynamic list downloaded from BNL nodes
3. **Anti-Sybil Protection**: Node added if it appears on >N/2 + 1 BNL nodes' KNLs
4. **Peering Process**:
   - Evaluate potential peers (settlement methods, features, reputation)
   - Send peering request
   - Exchange heartbeat messages
   - Advertise peering relationship to network

### Observing Peer Discovery (Manual Testing)

**Task 6: Test Peer Discovery**

1. Start development server (`pnpm start`)
2. **Check development dashboard** (`https://localhost/`)
   - Multiple nodes visible (local dev environment)
3. **Check console logs** for:
   - `Bootstrap Node List (BNL) download`
   - `Known Node List (KNL) population`
   - `Peer discovery process (nodes appearing in routing table)`
4. **Verify routing table updates** via web interface

**Task 10: Integration Test - Full Payment Flow**

1. Start 2+ Dassie nodes (automatic in dev environment)
2. **Create payment channels** between nodes (via web UI or RPC)
3. **Send test ILP payment** (node A → node B)
4. **Verify payment receipt** in ledger (check accounting logs)
5. **Query balances via RPC** (use web interface or tRPC client)
6. **Document observed payment flow** for future reference

## Troubleshooting

### Issue: "incorrect node version"

**Symptom:**

```
Required Node.js version: v22.8.0
Your Node.js version: v22.11.0
```

**Solution:**

```bash
fnm install 22.8.0
fnm use 22.8.0
```

### Issue: Corepack signature verification error

**Symptom:**

```
Error: Cannot find matching keyid: {...}
at verifySignature (/path/to/corepack.cjs:21535:47)
```

**Solution:**

```bash
corepack disable
npm install -g pnpm@9.12.0 --force
```

### Issue: test.localhost doesn't resolve

**Symptom:**

```
ping: cannot resolve test.localhost: Unknown host
```

**Solution:**

```bash
# Restart dnsmasq
sudo brew services restart dnsmasq

# Flush DNS cache
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder

# Verify resolver exists
cat /etc/resolver/localhost  # Should output: nameserver 127.0.0.1
```

### Issue: Port conflicts

**Symptom:**

```
Error: Address already in use
```

**Solution:**

```bash
# Find process using port (example: 5000)
lsof -i :5000

# Kill the process
kill -9 <PID>
```

### Issue: mkcert certificates not trusted

**Symptom:**

Browser shows "Not Secure" for `https://localhost/`

**Solution:**

```bash
# Reinstall CA
mkcert -install

# Verify NODE_EXTRA_CA_CERTS is set
echo $NODE_EXTRA_CA_CERTS
# Should output: /path/to/mkcert/rootCA.pem

# Restart browser
```

### Issue: pnpm errors during install

**Symptom:**

```
ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@package/name: Not Found
```

**Solution:**

```bash
# Clear pnpm cache
pnpm store prune

# Re-install
pnpm install
```

## Development Workflow

### Daily Development Flow

1. **Start Dassie** (separate terminal):
   ```bash
   cd ~/Documents/dassie
   fnm use 22.8.0
   pnpm start
   ```

2. **Access development dashboard**:
   - Visit `https://localhost/`
   - Complete initial configuration if needed

3. **Start Nostream** (separate terminal):
   ```bash
   cd ~/Documents/nostream-ilp
   pnpm dev
   ```

4. **Future: Connect Nostream to Dassie RPC** (Epic 2 Stories 2.2+):
   - Nostream tRPC client → `ws://localhost:5000/trpc`
   - Type-safe RPC calls to Dassie

### Resetting Development Environment

If you need to start fresh:

```bash
# Stop Dassie (Ctrl+C in terminal)

# Clear SQLite databases
cd ~/Documents/dassie
rm -rf .dassie-dev/node*/db/

# Restart
pnpm start
```

### Hot Module Reloading

The development server watches for file changes:

- TypeScript recompiles automatically
- Node processes restart on change
- Web UI updates automatically

## Internal Ledger System

Dassie uses **double-entry accounting** inspired by TigerBeetle.

### Account Types

- **Asset**: What the node owns (e.g., `xrp:assets/settlement`)
- **Liability**: What the node owes (e.g., `xrp:liabilities/peerA/interledger`)
- **Equity**: Net worth
- **Revenue**: Income from fees (e.g., `xrp:revenue/fees`)
- **Expense**: Costs
- **Contra**: Offsetting accounts

### Example Account Paths

```
xrp:assets/settlement           # XRP held in settlement account
xrp:assets/interledger/peerA    # XRP owed by peer A
xrp:liabilities/peerA/interledger  # XRP owed to peer A
xrp:revenue/fees                # Routing fees earned
```

### Example Transaction (ILP payment from peer A to peer B)

```
Transfer 1:
  Dr. xrp:assets/interledger/peerA    # Reduce A's credit
  Cr. xrp:assets/interledger/peerB    # Increase B's credit

Transfer 2:
  Dr. xrp:liabilities/peerA/interledger  # Reduce A's liability
  Cr. xrp:revenue/fees                   # Record routing fee
```

**Relevance for Epic 2:**

- Stories 2.4-2.8 will query these accounts via RPC
- Payment verification checks channel balances in ledger
- Revenue tracking reads `xrp:revenue/fees` accounts
- Settlement modules update `assets/settlement` accounts

## Next Steps: Preparing for Epic 2

Now that Dassie is running locally, the next phase is Epic 2: Dassie Integration.

### Upcoming Stories

| Story | Description | Dassie Work Required |
|-------|-------------|---------------------|
| **2.2** | RPC token authentication | Add token-based auth to tRPC server |
| **2.3** | Payment verification endpoint | Implement `payment.verifyPaymentClaim` mutation |
| **2.4-2.8** | Settlement modules | Add Bitcoin, Base, Cosmos, XRP settlement support |
| **2.9** | Economic monitoring | Implement `convertToAKT`, `claimAllChannels`, `getRoutingStats` |

### Key Files for Epic 2 Integration

**Dassie RPC Server (Story 2.2 target):**

```
packages/app-dassie/src/backend/rpc/
packages/app-dassie/src/backend/daemon.ts
```

**ILP Routing Logic:**

```
packages/app-dassie/src/backend/ilp-connector/
```

**Internal Ledger (Double-Entry Accounting):**

```
packages/app-dassie/src/backend/accounting/
```

**Peer-to-Peer Communication:**

```
packages/app-dassie/src/backend/peer-protocol/
```

**Settlement Module Interface:**

```
packages/app-dassie/src/backend/settlement/
```

### Testing Integration

To test Nostream ↔ Dassie integration:

1. **Start Dassie** (`pnpm start`)
2. **Configure tRPC client in Nostream** (Epic 2 stories)
3. **Send test payment** from Nostr client
4. **Verify payment in Dassie ledger** (via web UI or RPC)
5. **Confirm Nostream event published** (payment receipt event)

## Additional Resources

- **Dassie Documentation**: [GitHub - justmoon/dassie](https://github.com/justmoon/dassie)
- **Interledger Protocol**: [interledger.org](https://interledger.org)
- **tRPC Documentation**: [trpc.io](https://trpc.io)
- **Project Domain Knowledge**: See `CLAUDE.md` in nostream-ilp repository

## Summary

You now have a fully functional Dassie development environment for the Nostr-ILP integration project. Key achievements:

- ✅ Node.js v22.8.0 installed via fnm
- ✅ pnpm 9.12.0 installed globally (corepack bypassed)
- ✅ mkcert local CA configured and trusted
- ✅ Wildcard localhost DNS working (*.localhost → 127.0.0.1)
- ✅ Dassie repository cloned and dependencies installed
- ✅ Development server runs successfully
- ✅ Debug UI accessible at `https://localhost/`
- ✅ Multi-node development environment operational
- ✅ tRPC server ready for integration

**Next:** Proceed to Epic 2 stories to integrate Dassie RPC with Nostream relay.

---

## Payment Verification RPC Endpoint

### Overview

Story 2.3 adds a new RPC mutation `verifyPaymentClaim` to Dassie's payment router. This endpoint allows Nostream to verify payment claims from users via WebSocket RPC.

### Endpoint Definition

**Location:** `~/Documents/dassie/packages/app-dassie/src/rpc-server/routers/payment.ts`

**Method:** `mutation`

**Namespace:** `payment.verifyPaymentClaim`

**Authentication:** Required (uses `protectedRoute`)

### Input Schema

```typescript
{
  channelId: string,         // Payment channel identifier
  amountSats: number,        // Payment amount in satoshis
  nonce: number,             // Incrementing nonce (must be > highestNonce)
  signature: string,         // Hex-encoded signature
  currency: "BTC" | "BASE" | "AKT" | "XRP"  // Blockchain currency
}
```

### Output Schema

**Success Response:**
```typescript
{
  valid: true,
  amountSats: number  // Verified payment amount
}
```

**Failure Response:**
```typescript
{
  valid: false,
  reason: string  // Error code (see below)
}
```

### Error Codes

| Error Code | Description | Resolution |
|------------|-------------|------------|
| `channel-not-found` | Channel ID doesn't exist in ledger | Verify channel was created |
| `channel-expired` | Channel expiration timestamp has passed | Create a new channel |
| `invalid-signature` | Signature verification failed | Check signature generation |
| `invalid-nonce` | Nonce ≤ highestNonce (replay attack) | Increment nonce |
| `nonce-too-high` | Nonce > highestNonce + 1000 | Use sequential nonces |
| `insufficient-balance` | Amount > channel capacity | Reduce payment amount |
| `invalid-amount` | Amount ≤ 0 | Use positive payment amount |
| `ledger-error` | Internal ledger update failed | Check logs, retry |

### Signature Format

**Message Construction:**
```typescript
message = SHA256(channelId + amountSats + nonce)
```

**Signature Algorithms by Currency:**

| Currency | Algorithm | Library |
|----------|-----------|---------|
| BTC | secp256k1 (ECDSA) | `@noble/curves` |
| BASE | secp256k1 (ECDSA) | `@noble/curves` |
| AKT | secp256k1 (ECDSA) | `@noble/curves` |
| XRP | Ed25519 | `@noble/ed25519` |

**Example (Bitcoin/BASE/AKT):**
```typescript
import { secp256k1 } from "@noble/curves/secp256k1"
import { createHash } from "node:crypto"

const channelId = "channel-123"
const amountSats = 1000
const nonce = 1

// Create message
const message = createHash("sha256")
  .update(`${channelId}${amountSats}${nonce}`)
  .digest()

// Sign with private key
const signature = secp256k1.sign(message, privateKey)
const signatureHex = Buffer.from(signature).toString("hex")
```

**Example (XRP):**
```typescript
import { sign } from "@noble/ed25519"
import { createHash } from "node:crypto"

const message = createHash("sha256")
  .update(`${channelId}${amountSats}${nonce}`)
  .digest()

const signature = await sign(message, privateKey)
const signatureHex = Buffer.from(signature).toString("hex")
```

### Usage from Nostream (Story 3.1)

**tRPC Client Setup:**
```typescript
import { createTRPCProxyClient, createWSClient } from '@trpc/client'
import type { AppRouter } from 'dassie/packages/app-dassie/src/rpc-server/app-router'

const wsClient = createWSClient({
  url: process.env.DASSIE_RPC_URL, // ws://localhost:5000/trpc
  connectionParams: {
    headers: {
      Authorization: `Bearer ${process.env.DASSIE_RPC_AUTH_TOKEN}`
    }
  }
})

export const dassieClient = createTRPCProxyClient<AppRouter>({
  links: [wsClient]
})
```

**Verify Payment Claim:**
```typescript
const result = await dassieClient.payment.verifyPaymentClaim.mutate({
  channelId: "channel-abc",
  amountSats: 1000,
  nonce: 5,
  signature: "3045022100...",  // Hex signature
  currency: "BTC"
})

if (result.valid) {
  console.log(`Payment verified: ${result.amountSats} sats`)
  // Store Nostr event in relay database
} else {
  console.error(`Payment verification failed: ${result.reason}`)
  // Reject Nostr event
}
```

### Database Schema

**Payment Channels Table:**
```sql
CREATE TABLE payment_channels (
  channel_id TEXT PRIMARY KEY NOT NULL,
  sender_pubkey TEXT NOT NULL,
  recipient_pubkey TEXT NOT NULL,
  currency TEXT NOT NULL,
  capacity_sats INTEGER NOT NULL,
  highest_nonce INTEGER NOT NULL DEFAULT 0,
  expiration INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT
```

**Ledger Accounts:**
- Channel balance: `{currency}:assets/settlement/{channelId}`
- Revenue tracking: `{currency}:revenue/relay-fees`

### Testing

**Unit Tests:** `packages/app-dassie/src/rpc-server/routers/payment.test.ts`

Run tests:
```bash
cd ~/Documents/dassie
pnpm vitest run packages/app-dassie/src/rpc-server/routers/payment.test.ts
```

**Integration Tests:** Story 2.3 implementation uses stubbed channel data. Full integration tests require settlement modules (Stories 2.4-2.8).

### Type Exports

The `AppRouter` type is exported from `packages/app-dassie/src/rpc-server/app-router.ts`:

```typescript
export type AppRouter = typeof appRouter
```

Nostream can import this type for type-safe tRPC client creation.

### Verification Flow

```
1. Client → Nostream: Nostr EVENT with payment claim tags
2. Nostream → Dassie RPC: payment.verifyPaymentClaim mutation
3. Dassie:
   - Look up channel state from database
   - Verify channel exists and not expired
   - Validate amount ≤ capacity
   - Validate nonce > highestNonce
   - Verify signature with sender's public key
   - Update channel highest nonce
   - Record revenue in ledger
4. Dassie → Nostream: {valid: true/false, reason?, amountSats?}
5. Nostream: Store event if valid, reject if invalid
```

### Nonce Management

**Replay Attack Prevention:**
- Each payment claim must use a nonce **strictly greater** than `highestNonce`
- After verification, `highestNonce` is updated to the new nonce
- Attempting to reuse a nonce returns `invalid-nonce` error

**Nonce Jump Protection:**
- Maximum nonce jump: 1000 (prevents nonce exhaustion attacks)
- If `nonce > highestNonce + 1000`, returns `nonce-too-high` error

**Best Practice:**
- Use sequential nonces: `highestNonce + 1`
- Query current `highestNonce` before creating claim
- Retry with incremented nonce if `invalid-nonce` error

### Security Considerations

1. **Authentication Required:** All calls must provide valid RPC auth token or session cookie
2. **Signature Verification:** Each claim cryptographically verified with sender's public key
3. **Replay Protection:** Nonce prevents reusing old claims
4. **Amount Validation:** Prevents overclaiming channel capacity
5. **Expiration Checks:** Expired channels rejected automatically

### Future Enhancements (Stories 2.4-2.8)

- Real settlement modules for BTC, BASE, AKT, XRP
- Automated channel opening flow
- Channel rebalancing logic
- Multi-hop payment routing

---

*Last Updated: 2025-11-26*
*Story: 2.3 - Add Payment Verification RPC Endpoint to Dassie*
*Author: Claude Code (Sonnet 4.5)*

---

## Lightning Settlement Module

### Overview

The Lightning settlement module enables Dassie to settle ILP payments using Bitcoin Lightning Network channels on testnet. This module implements the `SettlementSchemeModule` interface and integrates with Core Lightning (CLN) via JSON-RPC.

**Module ID:** `btc+lightning-testnet+btc`
**Realm:** `test` (testnet only)
**Network:** Bitcoin testnet3
**Lightning Implementation:** Core Lightning (CLN) 24.11+
**Authentication:** Lightning RPC (rune-based)

### How Lightning Settlement Works

The Lightning settlement module bridges Dassie's ILP payments with Bitcoin Lightning Network:

1. **Peering Phase**: Two Dassie nodes exchange Lightning pubkeys
2. **Channel Opening**: Node A opens Lightning channel with Node B on Bitcoin testnet
3. **ILP Payment Phase**: Payments flow through ILP network, tracked in Dassie's internal ledger
4. **Settlement Phase**: When ILP balances diverge from Lightning balances:
   - Node owing money creates Lightning invoice
   - Counterparty pays invoice
   - Balances synchronized between ILP ledger and Lightning channel

**Key Benefits:**
- Bitcoin-based settlement (no trust required)
- Instant finality via Lightning HTLCs
- Low fees compared to on-chain Bitcoin
- Compatible with existing Lightning Network infrastructure

### Prerequisites

Before setting up Lightning settlement, you need:

| Component | Version | Purpose |
|-----------|---------|---------|
| Bitcoin Core | 28.0+ | Blockchain access for Lightning |
| Core Lightning (CLN) | 24.11+ | Lightning node implementation |
| Testnet BTC | 0.01+ BTC | Channel funding (from faucet) |
| Dassie | Latest | ILP node with Lightning module |

**Time Requirements:**
- Bitcoin testnet sync: **4-8 hours** (depending on network speed)
- Core Lightning setup: **15 minutes**
- Channel opening: **30-60 minutes** (waiting for confirmations)

### Installation

#### Step 1: Install Bitcoin Core and Core Lightning

```bash
# macOS with Homebrew
brew install bitcoin core-lightning

# Verify installations
bitcoin-cli --version
lightning-cli --version
```

#### Step 2: Configure Bitcoin Testnet

Create Bitcoin configuration file:

```bash
mkdir -p ~/Library/Application\ Support/Bitcoin
cat > ~/Library/Application\ Support/Bitcoin/bitcoin.conf <<EOF
# Network
testnet=1
server=1

# RPC Settings
rpcuser=testnetrpc
rpcpassword=testnetpass

# Testnet-specific settings
[test]
rpcport=18332
port=18333
prune=10000

# Performance
dbcache=450
maxmempool=300
EOF
```

**Configuration Explained:**
- `testnet=1`: Use Bitcoin testnet3 network
- `server=1`: Enable RPC server for CLN
- `prune=10000`: Keep only 10GB of blockchain data (saves space)
- `rpcuser/rpcpassword`: Credentials for CLN to access Bitcoin RPC

Start Bitcoin daemon:

```bash
bitcoind -testnet -daemon

# Monitor sync progress (takes 4-8 hours)
bitcoin-cli -testnet getblockchaininfo | grep -E 'blocks|verificationprogress'
```

**Tip:** Initial sync can take several hours. You can proceed with CLN configuration while Bitcoin syncs.

#### Step 3: Configure Core Lightning

Create CLN configuration file:

```bash
mkdir -p ~/.lightning
cat > ~/.lightning/config <<EOF
# Network
network=testnet

# Bitcoin RPC connection
bitcoin-rpcuser=testnetrpc
bitcoin-rpcpassword=testnetpass
bitcoin-rpcconnect=127.0.0.1
bitcoin-rpcport=18332

# Node identity
alias=dassie-cln-testnet
rgb=FF9900

# RPC settings
rpc-file-mode=0600

# Logging
log-level=info
EOF
```

**Configuration Explained:**
- `network=testnet`: Use Bitcoin testnet
- `bitcoin-rpc*`: Must match Bitcoin Core settings
- `alias`: Your Lightning node's public name
- `rpc-file-mode=0600`: Secure RPC socket permissions

Start Core Lightning (only after Bitcoin is synced or nearly synced):

```bash
# Start CLN daemon
lightningd --daemon

# Verify CLN is running
lightning-cli --testnet getinfo
```

**Expected Output:**
```json
{
  "id": "02abcd1234...",
  "alias": "dassie-cln-testnet",
  "color": "ff9900",
  "num_peers": 0,
  "num_pending_channels": 0,
  "num_active_channels": 0,
  "num_inactive_channels": 0,
  "blockheight": 2850123,
  "network": "testnet"
}
```

#### Step 4: Fund Your Lightning Node

Generate testnet Bitcoin address:

```bash
# Create a new address
lightning-cli --testnet newaddr

# Output: { "bech32": "tb1q..." }
```

Get testnet Bitcoin from faucets:

**Recommended Faucets:**
- https://testnet-faucet.mempool.co/
- https://coinfaucet.eu/en/btc-testnet/
- https://bitcoinfaucet.uo1.net/

Request **0.01 BTC** (1,000,000 sats) minimum for testing.

Wait for confirmations (typically 3-6 blocks, ~30-60 minutes):

```bash
# Check balance
lightning-cli --testnet listfunds

# Expected output after confirmations:
# {
#   "outputs": [
#     {
#       "txid": "abc123...",
#       "output": 0,
#       "amount_msat": "1000000000",  # 0.01 BTC
#       "status": "confirmed"
#     }
#   ]
# }
```

#### Step 5: Add Lightning Client to Dassie

Install the Core Lightning client library:

```bash
cd ~/Documents/dassie
pnpm add @asoltys/clightning-client --filter @dassie/app-dassie
```

**Note:** This library provides JSON-RPC client for CLN, used by the Lightning settlement module.

### Authentication and Configuration

#### Lightning RPC Authentication

Core Lightning uses **Unix socket authentication** by default:

**Socket Location:**
- macOS: `~/.lightning/testnet/lightning-rpc`
- Linux: `~/.lightning/testnet/lightning-rpc`

**Security:**
- File permissions: `0600` (owner read/write only)
- No password required (socket-based auth)
- Access restricted to processes running as same user

**Alternative: Rune Authentication (for remote access):**

If you need remote access, generate a rune:

```bash
# Generate rune with full access
lightning-cli --testnet createrune

# Output: { "rune": "abc123...", "unique_id": "0" }
```

Store rune in environment variable:

```bash
export CLN_RUNE="abc123..."
```

#### Dassie Configuration

Configure Dassie to use the Lightning module:

**Option 1: Environment Variables**

```bash
export DASSIE_LIGHTNING_ENABLED=true
export DASSIE_LIGHTNING_NETWORK=testnet
export DASSIE_LIGHTNING_RPC_PATH=~/.lightning/testnet/lightning-rpc
```

**Option 2: Configuration File** (if Dassie supports config files in future)

```yaml
settlement:
  lightning:
    enabled: true
    network: testnet
    rpc_path: ~/.lightning/testnet/lightning-rpc
    auto_open_channels: false
    default_capacity_sats: 1000000  # 0.01 BTC
```

### Module Architecture

**Location:** `packages/app-dassie/src/ledgers/modules/lightning/`

**File Structure:**
```
lightning/
├── lightning-testnet.ts          # Main module export
├── types/
│   └── peer-state.ts             # LightningPeerState interface
└── lightning-testnet.test.ts     # Unit tests
```

**Key Components:**

**1. Module Definition (`lightning-testnet.ts`):**
- Implements `SettlementSchemeModule<LightningPeerState>`
- Exports module with ID: `btc+lightning-testnet+btc`
- Provides settlement behavior methods

**2. Peer State (`types/peer-state.ts`):**
```typescript
interface LightningPeerState {
  channelId: string                // Lightning channel ID
  shortChannelId?: string          // Short channel ID (after 6 confirmations)
  peerPubkey: string               // Peer's Lightning pubkey
  capacity: bigint                 // Channel capacity in sats
  localBalance: bigint             // Our balance in sats
  remoteBalance: bigint            // Peer's balance in sats
  status: "pending" | "active" | "closing" | "closed"
}
```

**3. Settlement Flow:**

**Opening a Channel:**
1. Dassie calls `createPeeringRequest()` with peer's Lightning pubkey
2. Module calls CLN `fundchannel` RPC
3. Wait for Bitcoin confirmations (6 blocks)
4. Channel becomes active
5. Update Dassie internal ledger: `btc:assets/settlement/{channelId}`

**Settling Payments:**
1. ILP balances diverge from Lightning balances
2. `prepareSettlement()` generates Lightning invoice
3. Peer pays invoice via `sendpay` RPC
4. Payment completes (HTLC settled)
5. Update internal ledger to reflect new balances

**Closing a Channel:**
1. Dassie calls CLN `close` RPC
2. Cooperative close initiated
3. Wait for Bitcoin confirmations
4. Channel closed, funds returned to wallet

### Example Peering Workflow

This example demonstrates opening a Lightning channel between two Dassie nodes.

#### Prerequisites

- Two Dassie nodes running (Node A and Node B)
- Both nodes have Lightning module enabled
- Both CLN nodes funded with testnet BTC

#### Step 1: Get Node B's Lightning Pubkey

On Node B:

```bash
# Get CLN node info
lightning-cli --testnet getinfo | grep '"id"'

# Output: "id": "02abcd1234...",
```

#### Step 2: Initiate Peering from Node A

Using Dassie's web interface or RPC:

```typescript
// Via tRPC client
const peerInfo = {
  settlementScheme: "btc+lightning-testnet+btc",
  lightningPubkey: "02abcd1234...",  // Node B's pubkey
  capacity: 1000000n  // 0.01 BTC in sats
}

const result = await dassieClient.settlement.createPeering.mutate(peerInfo)
// Returns: { channelId: "abc123...", status: "pending" }
```

#### Step 3: Monitor Channel Opening

On Node A (CLN):

```bash
# Check pending channels
lightning-cli --testnet listpeerchannels

# Output shows:
# {
#   "peer_id": "02abcd1234...",
#   "state": "CHANNELD_AWAITING_LOCKIN",  # Waiting for confirmations
#   "funding_txid": "abc123...",
#   "to_us_msat": "1000000000"
# }
```

Wait for 6 confirmations (~60 minutes):

```bash
# Monitor confirmations
watch -n 30 'lightning-cli --testnet listpeerchannels | grep -E "state|short_channel_id"'

# After 6 confirmations, state becomes:
# "state": "CHANNELD_NORMAL"
# "short_channel_id": "2850123x1x0"
```

#### Step 4: Verify Channel in Dassie

```typescript
// Query Dassie ledger
const balance = await dassieClient.ledger.getBalance.query({
  accountPath: "btc:assets/settlement/abc123"
})

console.log(`Lightning channel balance: ${balance} sats`)
// Output: Lightning channel balance: 1000000 sats
```

#### Step 5: Send ILP Payment (Triggers Settlement)

```typescript
// Send ILP payment from Node A to Node B
const payment = await dassieClient.ilp.sendPayment.mutate({
  destination: "g.dassie.nodeB",
  amount: 100000n,  // 0.001 BTC
  currency: "BTC"
})

// Dassie automatically settles via Lightning when balances diverge
// Check logs for settlement activity
```

#### Step 6: Close Channel (When Done)

```bash
# Cooperative close
lightning-cli --testnet close <channel_id>

# Wait for closing transaction confirmation
lightning-cli --testnet listpeerchannels | grep state
# Output: "state": "CLOSINGD_COMPLETE"

# Funds returned to wallet
lightning-cli --testnet listfunds
```

### Testing

#### Unit Tests

Unit tests use a **mock CLN client** for fast testing:

```bash
cd ~/Documents/dassie

# Run Lightning module unit tests
pnpm test packages/app-dassie/src/ledgers/modules/lightning/lightning-testnet.test.ts

# Expected output:
# ✓ Module exports correct name and interface
# ✓ getPeeringInfo() returns valid Lightning pubkey
# ✓ prepareSettlement() generates valid invoice
# ✓ handleSettlement() verifies preimage correctly
# ✓ Error handling for CLN unavailable
```

**Test Coverage:**
- Module interface compliance
- Peering info generation
- Settlement preparation
- Invoice verification
- Error handling

#### Integration Tests

Integration tests require **real CLN nodes and Bitcoin testnet**:

**Setup:**
1. Start two Dassie nodes (each with its own CLN instance)
2. Fund both CLN nodes with testnet BTC
3. Wait for Bitcoin sync to complete

**Test Scenarios:**

```bash
# Run integration tests (requires ~10 minutes due to blockchain confirmations)
pnpm test packages/app-dassie/src/ledgers/modules/lightning/lightning-integration.test.ts --timeout=600000

# Test scenarios:
# 1. Open Lightning channel between two nodes
# 2. Send ILP payment, verify Lightning settlement occurs
# 3. Close Lightning channel cooperatively
# 4. Verify internal ledger balances match Lightning balances
```

**Note:** Integration tests are marked as **pending** until Bitcoin testnet sync completes (see Story 2.4 completion notes).

### Troubleshooting

#### Common Issues and Solutions

**Issue: "CLN not available" or "Connection refused"**

**Symptoms:**
```
Error: connect ENOENT /Users/username/.lightning/testnet/lightning-rpc
```

**Diagnosis:**
```bash
# Check if CLN is running
ps aux | grep lightningd

# Check RPC socket exists
ls -la ~/.lightning/testnet/lightning-rpc
```

**Solutions:**
1. Start CLN: `lightningd --daemon`
2. Verify Bitcoin is synced: `bitcoin-cli -testnet getblockchaininfo`
3. Check CLN logs: `tail -f ~/.lightning/testnet/log`
4. Ensure RPC socket permissions: `chmod 600 ~/.lightning/testnet/lightning-rpc`

---

**Issue: Channel open fails with "insufficient funds"**

**Symptoms:**
```
Error: Insufficient funds for channel of 1000000 sats
```

**Diagnosis:**
```bash
# Check on-chain balance
lightning-cli --testnet listfunds

# Check if funds are confirmed
lightning-cli --testnet listfunds | grep status
```

**Solutions:**
1. Fund wallet from testnet faucet (see Installation Step 4)
2. Wait for confirmations (3-6 blocks minimum)
3. Reduce channel capacity if insufficient funds
4. Check Bitcoin daemon is synced: `bitcoin-cli -testnet getblockchaininfo`

---

**Issue: Bitcoin RPC connection error**

**Symptoms:**
```
Could not connect to bitcoind using bitcoin-cli
```

**Diagnosis:**
```bash
# Test Bitcoin RPC
bitcoin-cli -testnet getblockchaininfo

# Verify credentials match
grep rpc ~/.lightning/config
grep rpc ~/Library/Application\ Support/Bitcoin/bitcoin.conf
```

**Solutions:**
1. Ensure Bitcoin daemon is running: `ps aux | grep bitcoind`
2. Verify `bitcoin.conf` and `~/.lightning/config` have matching credentials:
   - `rpcuser` must match
   - `rpcpassword` must match
   - `rpcport=18332` for testnet
3. Restart both services:
   ```bash
   bitcoin-cli -testnet stop
   lightning-cli --testnet stop
   bitcoind -testnet -daemon
   lightningd --daemon
   ```

---

**Issue: Channel stuck in "CHANNELD_AWAITING_LOCKIN"**

**Symptoms:**
Channel not activating after 1+ hours

**Diagnosis:**
```bash
# Check channel state
lightning-cli --testnet listpeerchannels | grep -E "state|funding_txid"

# Check transaction confirmations
bitcoin-cli -testnet gettransaction <funding_txid>
```

**Solutions:**
1. Wait longer - testnet can be slow (sometimes 2-3 hours between blocks)
2. Check transaction on block explorer: `https://blockstream.info/testnet/tx/<funding_txid>`
3. Ensure Bitcoin node is synced: `bitcoin-cli -testnet getblockchaininfo`
4. If transaction not found, channel open may have failed - close and retry

---

**Issue: Invoice payment fails with "route not found"**

**Symptoms:**
```
Error: Could not find route to destination
```

**Diagnosis:**
This usually means no Lightning channel exists between the nodes.

**Solutions:**
1. Verify channel is active:
   ```bash
   lightning-cli --testnet listpeerchannels | grep state
   # Should show: "state": "CHANNELD_NORMAL"
   ```
2. Check peer is online:
   ```bash
   lightning-cli --testnet listpeers | grep connected
   # Should show: "connected": true
   ```
3. For direct peer payments, ensure channel has sufficient balance
4. For multi-hop payments, Lightning routing may not find path (common on testnet)

---

**Issue: Dassie can't find Lightning module**

**Symptoms:**
```
Error: Settlement scheme "btc+lightning-testnet+btc" not found
```

**Diagnosis:**
```bash
# Check module is registered
cd ~/Documents/dassie
grep -r "btc+lightning-testnet+btc" packages/app-dassie/src/ledgers/modules/index.ts
```

**Solutions:**
1. Ensure module is exported in `modules/index.ts`
2. Rebuild Dassie: `pnpm build`
3. Verify TypeScript compilation succeeded: `pnpm typecheck`
4. Restart Dassie: `pnpm start`

---

**Issue: Nonce errors in payment verification**

**Symptoms:**
```
Payment verification failed: invalid-nonce
```

**Diagnosis:**
This is a replay attack protection mechanism.

**Solutions:**
1. Query current nonce from payment channel state
2. Use `nonce = currentNonce + 1` for next payment
3. Never reuse old nonces
4. If using multiple clients, implement nonce coordination

---

### Performance Considerations

**Channel Opening Time:**
- Funding transaction broadcast: ~30 seconds
- 1st confirmation: ~10-60 minutes (testnet block time variable)
- 6 confirmations required: ~60-360 minutes
- **Total: 1-6 hours** (testnet blocks are unpredictable)

**Payment Settlement Time:**
- Invoice generation: < 1 second
- HTLC routing: 1-5 seconds
- Settlement finality: Instant (when preimage revealed)
- **Total: 1-5 seconds** for Lightning settlement

**Channel Closure Time:**
- Cooperative close: ~10-60 minutes (1 confirmation needed)
- Force close: ~2880 blocks (~20 days on mainnet, ~1-3 days on testnet)

### Security Considerations

**RPC Socket Security:**
- Unix socket is restricted to owner (0600 permissions)
- No network exposure by default
- For remote access, use SSH tunneling or rune authentication

**Private Key Management:**
- CLN stores private keys in `~/.lightning/testnet/hsm_secret`
- **Never share this file** - it controls your Bitcoin
- Backup this file securely
- For production, consider hardware security modules (HSM)

---

## Base L2 Settlement Module

### Overview

The Base L2 settlement module enables Dassie to accept ETH payments on Base L2 (Ethereum Layer 2) using unidirectional payment channels. This module implements the `SettlementSchemeModule` interface and integrates with the BasePaymentChannel smart contract on Base Sepolia testnet.

**Module ID:** `eth+base-sepolia+eth`
**Realm:** `test` (Base Sepolia testnet)
**Network:** Base Sepolia (Chain ID: 84532)
**Blockchain SDK:** viem v2.x
**Contract Address:** `0xBe140c80d39A94543e21458F9C1382EccBEC36Ee`

### How Base Settlement Works

1. **Channel Opening**: User opens payment channel by locking ETH in smart contract
2. **Off-Chain Claims**: User creates signed payment claims for Nostr events (no gas fees)
3. **Claim Verification**: Dassie verifies claims off-chain using ECDSA signature verification
4. **Settlement**: Relay periodically settles channels on-chain, claiming accumulated payments

**Key Benefits:**
- Low gas fees (~$0.01 per transaction on Base L2)
- Ethereum compatibility (can bridge to mainnet)
- Off-chain claim verification (instant, no gas cost)
- Smart contract security (audited OpenZeppelin libraries)

### Prerequisites

| Component | Version | Purpose |
|-----------|---------|---------|
| Base Sepolia RPC | N/A | Blockchain access (Alchemy, Infura, or public) |
| Test ETH | 0.1+ ETH | Channel funding |
| Deployed Contract | v1.0 | BasePaymentChannel.sol |
| Relay Wallet | N/A | Ethereum address with private key |

### Configuration

**Environment Variables:**

```bash
# Base L2 Settlement Module
BASE_ENABLED=true
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_PAYMENT_CHANNEL_ADDRESS=0xBe140c80d39A94543e21458F9C1382EccBEC36Ee
BASE_RELAY_ADDRESS=0xYourRelayEthereumAddress
BASE_RELAY_PRIVATE_KEY=0xYourPrivateKey

# Settlement Policy
BASE_SETTLEMENT_THRESHOLD=100000000000000000  # 0.1 ETH in wei
BASE_SETTLEMENT_INTERVAL=3600  # 1 hour in seconds

# Gas Management
BASE_MAX_GAS_PRICE=10000000000  # 10 gwei
BASE_GAS_LIMIT=500000
```

**Get Test ETH:**
Visit https://www.coinbase.com/faucets/base-ethereum-goerli-faucet and request testnet ETH for your relay address.

### Testing the Module

**Run Unit Tests:**
```bash
cd ~/Documents/dassie
pnpm test packages/app-dassie/src/ledgers/modules/base/base-sepolia.test.ts
```

**Run Integration Tests** (requires funded wallet):
```bash
pnpm test packages/app-dassie/src/ledgers/modules/base/base-integration.test.ts --testTimeout=300000
```

### Troubleshooting

**Issue: "Failed to connect to Base RPC endpoint"**

**Solutions:**
1. Verify RPC URL is accessible:
   ```bash
   curl -X POST https://sepolia.base.org \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
   ```
2. Check for rate limiting (use Alchemy/Infura for higher limits)
3. Try alternative RPC endpoints

**Issue: "Invalid signature" when verifying claims**

**Solutions:**
1. Verify signature format matches Solidity:
   ```typescript
   const messageHash = keccak256(encodePacked(channelId, claimAmount, nonce))
   const signature = await wallet.signMessage({ message: { raw: messageHash } })
   ```
2. Ensure sender address matches channel.sender from contract
3. Check nonce is monotonically increasing

**Issue: "Gas price too high"**

**Solutions:**
1. Wait for lower gas prices on Base Sepolia
2. Increase `BASE_MAX_GAS_PRICE` in configuration
3. Use manual settlement trigger during low-gas periods

### Contract Verification

View the deployed contract on Basescan:
https://sepolia.basescan.org/address/0xBe140c80d39A94543e21458F9C1382EccBEC36Ee

**Channel Security:**
- Lightning channels are trustless (enforced by Bitcoin)
- HTLCs ensure atomic payments (no partial failures)
- Always verify invoice amounts before paying
- Monitor channel states for force-close attempts

**Testing Best Practices:**
- Use testnet only for development
- Never use mainnet until thoroughly tested
- Keep testnet balances small (0.01-0.1 BTC max)
- Test force-close scenarios to understand recovery

### Next Steps

After setting up Lightning settlement:

1. **Test Basic Operations**: Open a channel, send a payment, close the channel
2. **Integrate with Nostream** (Story 3.x): Connect relay to use Lightning settlement
3. **Monitor Economic Viability** (Story 2.9): Track revenue vs. on-chain fees
4. **Plan Mainnet Migration**: When ready for production, switch to `btc+lightning+btc` module

---

## Cosmos/Akash Settlement Module

### Overview

The Cosmos/Akash settlement module (`akt+cosmos-akash+akt`) enables payment settlement using the Akash Network blockchain via CosmWasm smart contracts. This module provides native AKT payment channels without bridging or wrapping.

**Key Features:**
- **CosmWasm Integration**: Uses deployed PaymentChannel contract on Akash
- **Off-Chain Claims**: Verify payment claims off-chain with secp256k1 signatures
- **On-Chain Settlement**: Final settlement via contract execution
- **Flexible Strategy**: Configurable settlement triggers (threshold, time, expiration)

### Prerequisites

Before setting up the Cosmos settlement module:

1. **CosmWasm PaymentChannel Contract** deployed on Akash testnet (Epic 3, Stories 3.1-3.6)
2. **Cosmos Wallet** with test AKT funds
3. **Akash RPC Access** (public or custom node)

### Configuration

**Environment Variables:**

```bash
# Cosmos/Akash Settlement Module
COSMOS_ENABLED=true

# RPC Configuration
COSMOS_AKASH_RPC_URL=https://rpc.sandbox-01.aksh.pw:443  # Testnet
# COSMOS_AKASH_RPC_URL=https://akash-rpc.polkachu.com:443  # Mainnet

# Contract Address (from Epic 3 deployment)
COSMOS_PAYMENT_CHANNEL_ADDRESS=akash1...  # Replace with actual address

# Relay Wallet (NEVER commit to git)
COSMOS_RELAY_ADDRESS=akash1...  # Generate with: DirectSecp256k1Wallet
COSMOS_RELAY_PRIVATE_KEY=...    # Hex-encoded private key (64 chars)

# Network Selection
COSMOS_NETWORK=testnet  # or 'mainnet'

# Settlement Policy
COSMOS_SETTLEMENT_THRESHOLD=1000000  # 1 AKT in uakt
COSMOS_SETTLEMENT_INTERVAL=3600      # 1 hour in seconds

# Gas Management
COSMOS_GAS_PRICE=0.025uakt
COSMOS_GAS_LIMIT=200000
```

### Generating a Cosmos Wallet

**Using CosmJS:**

```typescript
import { DirectSecp256k1Wallet } from "@cosmjs/proto-signing"
import { stringToPath } from "@cosmjs/crypto"

// Generate new wallet
const wallet = await DirectSecp256k1Wallet.generate(24, { prefix: "akash" })
const [account] = await wallet.getAccounts()

console.log("Address:", account.address) // akash1...
console.log("Mnemonic:", wallet.mnemonic) // Save this securely!

// Get private key (for COSMOS_RELAY_PRIVATE_KEY)
const privateKey = wallet.privkey.toString('hex')
console.log("Private Key:", privateKey) // 64 hex characters
```

**Get Test AKT:**
Visit Akash Discord and request testnet AKT from the faucet channel:
https://discord.gg/akash

### Testing the Module

**Run Unit Tests:**
```bash
cd ~/Documents/dassie
pnpm test packages/app-dassie/src/ledgers/modules/cosmos/cosmos-akash.test.ts
```

**Run Integration Tests** (requires deployed contract and funded wallet):
```bash
# Set integration test flag
export COSMOS_INTEGRATION_TESTS=true

# Run tests with extended timeout
pnpm test packages/app-dassie/src/ledgers/modules/cosmos/cosmos-integration.test.ts --testTimeout=120000
```

### Troubleshooting

**Issue: "Failed to connect to Cosmos RPC"**

**Solutions:**
1. Verify RPC URL is accessible:
   ```bash
   curl https://rpc.sandbox-01.aksh.pw:443/status
   ```
2. Check for rate limiting (use custom Akash node for higher limits)
3. Try alternative RPC endpoints from Cosmos Chain Registry

**Issue: "Invalid signature" when verifying claims**

**Solutions:**
1. Verify signature format matches CosmWasm:
   ```typescript
   const messageJson = JSON.stringify({
     channel_id: channelId,
     amount: amountUakt,
     nonce: nonce
   })
   const messageHash = sha256(new TextEncoder().encode(messageJson))
   const signature = secp256k1.sign(messageHash, privateKey)
   ```
2. Ensure sender address matches `channel.sender` from contract
3. Check nonce is greater than `channel.highestNonce`

**Issue: "Nonce mismatch"**

**Solutions:**
1. Verify nonce increments monotonically (1, 2, 3, ...)
2. Query contract state to get current `highestNonce`
3. Clear local state if desynchronized

**Issue: "Contract execution failed"**

**Solutions:**
1. Check contract address is correct:
   ```bash
   curl -X POST https://rpc.sandbox-01.aksh.pw:443 \
     -H "Content-Type: application/json" \
     -d '{
       "jsonrpc": "2.0",
       "id": 1,
       "method": "abci_query",
       "params": {
         "path": "/cosmwasm.wasm.v1.Query/ContractInfo",
         "data": "..."
       }
     }'
   ```
2. Verify gas price and limit are sufficient
3. Check relay wallet has enough AKT for gas fees

**Issue: "Gas price too low/high"**

**Solutions:**
1. Monitor current gas prices on Akash
2. Adjust `COSMOS_GAS_PRICE` (typical range: 0.025-0.05uakt)
3. Increase `COSMOS_GAS_LIMIT` if transactions failing with "out of gas"

### Contract Interaction

**Query Channel State:**
```typescript
import { CosmWasmClient } from "@cosmjs/cosmwasm-stargate"

const client = await CosmWasmClient.connect(rpcUrl)

const channelState = await client.queryContractSmart(
  contractAddress,
  { get_channel: { channel_id: "channel_123" } }
)

console.log("Sender:", channelState.sender)
console.log("Balance:", channelState.amount)
console.log("Highest Claim:", channelState.highest_claim)
console.log("Status:", channelState.status)
```

**Open Channel (from client):**
```typescript
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate"
import { coin } from "@cosmjs/stargate"

const client = await SigningCosmWasmClient.connectWithSigner(rpcUrl, wallet)

const result = await client.execute(
  senderAddress,
  contractAddress,
  {
    open_channel: {
      recipient: relayAddress,
      expiration: Math.floor(Date.now() / 1000) + 86400 // 24 hours
    }
  },
  "auto",
  "Open payment channel",
  [coin("1000000", "uakt")] // 1 AKT
)

console.log("Transaction Hash:", result.transactionHash)
```

**Close Channel (from relay):**
```typescript
const result = await client.execute(
  relayAddress,
  contractAddress,
  {
    close_channel: {
      channel_id: "channel_123",
      final_claim: {
        amount: "800000",
        nonce: 10,
        signature: claimSignature
      }
    }
  },
  "auto",
  "Close payment channel"
)

console.log("Settlement complete:", result.transactionHash)
```

### Settlement Strategy

The Cosmos module settles channels based on multiple criteria:

1. **Threshold Reached**: `claim >= COSMOS_SETTLEMENT_THRESHOLD`
2. **Time Interval**: `now - lastClaimTime >= COSMOS_SETTLEMENT_INTERVAL`
3. **Near Expiration**: `expiration - now < 24 hours`
4. **High Claim Count**: `totalClaims >= 100`

**Customize Strategy:**
Edit `/Users/jonathangreen/Documents/dassie/packages/app-dassie/src/ledgers/modules/cosmos/functions/settlement-engine.ts` and modify the `shouldSettleChannel()` function.

### Monitoring

**View Logs:**
```bash
# Filter Cosmos settlement logs
tail -f /path/to/dassie/logs | grep "das:node:settlement-cosmos"
```

**Key Events to Monitor:**
- Channel opens/closes
- Claim verifications (success/failure)
- Settlement triggers
- RPC connection errors
- Gas costs per settlement

### Security Considerations

**Private Key Management:**
- NEVER commit `COSMOS_RELAY_PRIVATE_KEY` to git
- Use `.env` file (add to `.gitignore`)
- Use separate wallet for relay (not personal wallet)
- Fund only with necessary amount (minimize risk)

**Channel Expiration:**
- Monitor channels approaching expiration
- Auto-settle 24 hours before expiration
- Handle expired channels gracefully

**Signature Verification:**
- ALWAYS verify signatures off-chain before accepting claims
- Match CosmWasm signature format exactly
- Reject non-monotonic nonces (replay attack prevention)
- Reject claims exceeding balance (overdraft prevention)

### Next Steps

After setting up Cosmos/Akash settlement:

1. **Deploy CosmWasm Contract** (Epic 3): Required for full functionality
2. **Test Channel Lifecycle**: Open, claim, settle on testnet
3. **Integrate with Nostream**: Connect relay to use Cosmos settlement
4. **Monitor Performance**: Track settlement costs vs. revenue
5. **Plan Mainnet Migration**: When ready, switch network to mainnet

### Related Documentation

- **Story 2.7**: Cosmos/Akash Settlement Module Implementation
- **Epic 3**: CosmWasm PaymentChannel Contract Deployment
- **Akash Network**: https://akash.network/
- **CosmJS Docs**: https://cosmos.github.io/cosmjs/
- **CosmWasm Docs**: https://docs.cosmwasm.com/

---

### Related Documentation

- **Story 2.4**: Lightning Settlement Module Implementation
- **Bitcoin Testnet**: https://testnet.bitcoinspace.org/
- **Core Lightning Docs**: https://docs.corelightning.org/
- **Lightning Network Spec**: https://github.com/lightning/bolts

---

## XRP Ledger Payment Channels

### Overview

XRP Ledger (XRPL) payment channels are a native protocol feature that enables fast, low-cost off-chain payments with on-chain settlement. Unlike other blockchains that require smart contracts for payment channels, XRPL has payment channels built directly into the protocol.

**Key Advantages:**
- **Native Protocol Support**: No smart contract deployment needed
- **Ed25519 Signatures**: Different from secp256k1 (Bitcoin/Ethereum)
- **Low Fees**: Typically < 0.01 XRP per transaction
- **Fast Settlement**: 3-5 second ledger confirmations
- **Optional Expiration**: Automatic channel closure

### How XRPL Payment Channels Work

**1. Channel Creation (On-Chain)**
- Sender creates PaymentChannelCreate transaction
- Locks XRP in the channel
- Specifies recipient, amount, settle delay, and optional expiration

**2. Off-Chain Claims**
- Sender creates signed claims: `sign(CLM\0 + channelId + amount)`
- Claims must be monotonically increasing
- Recipient verifies signature and claim validity
- No on-chain transaction required

**3. Settlement (On-Chain)**
- Recipient submits PaymentChannelClaim transaction
- Includes highest claim amount and sender's signature
- Settle delay period begins

**4. Channel Closure**
- After settle delay, channel can close
- Remaining funds returned to sender

### Dassie XRP Module Architecture

The XRP payment channel implementation is located in:
```
packages/app-dassie/src/ledgers/modules/xrpl/
├── types/
│   ├── payment-channel-state.ts    # Channel state interface
│   └── peer-state.ts                # Extended with channel tracking
├── functions/
│   ├── create-payment-channel.ts    # PaymentChannelCreate transaction
│   ├── verify-payment-claim.ts      # Ed25519 signature verification
│   ├── settlement-strategy.ts       # Settlement decision logic
│   └── query-payment-channel.ts     # XRPL channel queries
├── config.ts                         # Environment configuration
├── xrpl.ts                          # Mainnet module
├── xrpl-testnet.ts                  # Testnet module
└── payment-channels.test.ts         # Unit tests
```

### Configuration

**Environment Variables (.env):**
```bash
# XRP Payment Channel Configuration
XRPL_PAYMENT_CHANNELS_ENABLED=true
XRPL_NETWORK=testnet  # or 'mainnet'

# Settlement Policy
XRPL_SETTLEMENT_THRESHOLD=1000000  # 1 XRP in drops
XRPL_SETTLEMENT_INTERVAL=3600      # 1 hour in seconds

# Channel Parameters
XRPL_SETTLE_DELAY=3600             # 1 hour settle delay
XRPL_CHANNEL_EXPIRATION_DAYS=30    # 30 days default expiration
XRPL_MIN_CHANNEL_BALANCE=100000    # 0.1 XRP minimum balance
```

**XRP Units:**
- 1 XRP = 1,000,000 drops
- All amounts stored/transmitted in drops (smallest unit)

### Settlement Strategy

Channels are settled when any of these conditions are met:

| Trigger | Condition | Default Value |
|---------|-----------|---------------|
| **Threshold** | Claim amount >= threshold | 1,000,000 drops (1 XRP) |
| **Time Interval** | Time since last claim >= interval | 3600 seconds (1 hour) |
| **Near Expiration** | Expiration approaching (< settle delay + 1 hour) | Calculated |
| **High Claim Count** | Total claims >= 100 | 100 claims |
| **Low Balance** | Remaining balance < minimum | 100,000 drops (0.1 XRP) |

### Ed25519 Signature Format

**Critical Implementation Detail:**
XRPL payment channels use a specific signature format:

```typescript
// Signature message: CLM\0 + channelId + amount
const CLM_PREFIX = Buffer.from([0x43, 0x4C, 0x4D, 0x00])
const channelIdBuffer = Buffer.from(channelId, 'hex') // 32 bytes
const amountBuffer = Buffer.alloc(8)
amountBuffer.writeBigUInt64BE(BigInt(amountDrops))

const message = Buffer.concat([CLM_PREFIX, channelIdBuffer, amountBuffer])

// Verification
import { ed25519 } from '@noble/curves/ed25519'
const valid = ed25519.verify(signatureBytes, message, publicKeyBytes)
```

### Payment Channel Lifecycle Example

**Create Channel:**
```typescript
import { createPaymentChannel } from './functions/create-payment-channel'

const result = await createPaymentChannel({
  client,  // XRPL client
  wallet,  // Sender wallet
  recipientAddress: 'rLHzPsX6oXkzU9fYnJqYKCWbJh5fJJWB5j',
  amountDrops: '10000000',  // 10 XRP
  settleDelay: 3600,         // 1 hour
})

console.log(`Channel ID: ${result.channelId}`)
console.log(`Transaction: ${result.txHash}`)
```

**Verify Claim (Off-Chain):**
```typescript
import { verifyPaymentClaim } from './functions/verify-payment-claim'

const claim = {
  channelId: '5DB01B7...',
  amountSats: 2000000,  // 2 XRP worth
  nonce: 1,
  signature: 'ED5F5AC8...',
  currency: 'XRP'
}

const result = verifyPaymentClaim(claim, channelState)

if (result.valid) {
  console.log(`Claim verified: ${result.amountSats} sats`)
  channelState = result.updatedChannelState
}
```

**Settle Channel:**
```typescript
import { settlePaymentChannel } from './functions/settlement-strategy'

const settlement = await settlePaymentChannel({
  client,
  wallet,  // Relay wallet (recipient)
  channelState,
  claimSignature: 'ED5F5AC8...',  // From sender
})

console.log(`Settlement TX: ${settlement.txHash}`)
console.log(`Amount claimed: ${settlement.amountClaimed} drops`)
```

### Testing

**Unit Tests:**
```bash
cd /path/to/dassie
pnpm test packages/app-dassie/src/ledgers/modules/xrpl/payment-channels.test.ts
```

**Integration Tests (Requires XRP Testnet):**
```bash
pnpm test packages/app-dassie/src/ledgers/modules/xrpl/xrpl-payment-channels-integration.test.ts --testTimeout=60000
```

### XRP Testnet Setup

**1. Connect to Testnet:**
```typescript
import { Client } from 'xrpl'

const client = new Client('wss://s.altnet.rippletest.net:51233')
await client.connect()
```

**2. Fund Test Wallet:**
```typescript
import { Wallet } from 'xrpl'

const wallet = Wallet.generate()
await client.fundWallet(wallet)  // Uses testnet faucet

console.log(`Address: ${wallet.address}`)
console.log(`Public Key: ${wallet.publicKey}`)
```

**3. Check Balance:**
```bash
# Using xrpl-cli (install: npm install -g xrpl-cli)
xrpl-cli account_info rN7n7otQDd6FczFgLdlqtyMVrn3z956G9U --network testnet
```

### Troubleshooting

#### Invalid Signature Errors

**Symptom:** `verifyPaymentClaim` returns `invalid-signature`

**Causes:**
1. **Wrong signature message format**: Ensure CLM\0 prefix, 32-byte channel ID, big-endian amount
2. **Wrong public key**: Must match sender's public key from channel
3. **Signature from different key**: Sender must sign with same key used in PaymentChannelCreate

**Debug:**
```typescript
// Log signature components
console.log('Channel ID:', channelId)
console.log('Amount (drops):', amountDrops)
console.log('Public Key:', channelState.publicKey)
console.log('Signature:', claim.signature)

// Verify message construction
const message = createClaimMessage(channelId, amountDrops)
console.log('Message hex:', Buffer.from(message).toString('hex'))
```

#### Insufficient Balance Errors

**Symptom:** `verifyPaymentClaim` returns `insufficient-balance`

**Causes:**
1. Claim amount > channel amount
2. Channel already partially settled

**Fix:**
- Query channel from XRPL to get current balance
- Ensure claim <= channel.amount

#### Channel Not Found

**Symptom:** `queryPaymentChannel` returns `undefined`

**Causes:**
1. Channel not yet confirmed on ledger
2. Wrong channel ID
3. Channel already closed

**Fix:**
```typescript
// Wait for ledger confirmation
await new Promise(resolve => setTimeout(resolve, 5000))

// Verify channel exists
const channels = await client.request({
  command: 'account_channels',
  account: recipientAddress,
  ledger_index: 'validated'
})

console.log('Channels:', channels.result.channels)
```

#### Settlement Transaction Failures

**Symptom:** PaymentChannelClaim transaction fails with `tecXYZ` error

**Common Errors:**
- `tecNO_PERMISSION`: Not channel recipient
- `tecUNFUNDED`: Relay wallet has insufficient XRP for transaction fee
- `tecNO_TARGET`: Destination account doesn't exist

**Fix:**
- Ensure relay wallet has minimum XRP balance (>= 10 XRP for testnet)
- Verify signature is from correct sender
- Check channel hasn't expired

### Currency Conversion (MVP)

**Story 2.8 (Current):**
- Uses 1:1 conversion: 1 sat = 1 drop
- Simplified for MVP implementation

**Story 2.9 (Future):**
- Exchange rate oracle integration
- Accurate XRP <-> BTC conversion
- Dynamic pricing based on market rates

### Security Considerations

1. **Ed25519 Signature Verification**: Always use constant-time comparison to prevent timing attacks
2. **Monotonicity Check**: Reject claims with amount <= previous claim
3. **Expiration Monitoring**: Settle channels before expiration to avoid fund loss
4. **Key Management**: Never commit private keys to git; use environment variables

### Production Checklist

Before deploying XRP payment channels to mainnet:

- [ ] **Test extensively on testnet**: Full lifecycle (create, claim, settle, close)
- [ ] **Verify all signatures**: Test with multiple test wallets
- [ ] **Monitor settlement strategy**: Ensure thresholds are appropriate for mainnet fees
- [ ] **Fund relay wallet**: Minimum 100 XRP recommended for mainnet operations
- [ ] **Set up monitoring**: Track channel expirations, settlement failures
- [ ] **Enable alerts**: Low balance, signature failures, settlement delays
- [ ] **Use hardware wallet**: For mainnet private key storage
- [ ] **Test failover**: Ensure relay can recover from network interruptions

### Useful Resources

- **XRPL Docs - Payment Channels**: https://xrpl.org/payment-channels.html
- **xrpl.js Documentation**: https://js.xrpl.org/
- **XRP Testnet Faucet**: https://xrpl.org/xrp-testnet-faucet.html
- **XRP Testnet Explorer**: https://testnet.xrpl.org/
- **XRPL Dev Portal**: https://xrpl.org/

### Related Documentation

- **Story 2.8**: XRP Payment Channel Implementation
- **Epic 2**: Dassie Multi-Blockchain Settlement Modules
- **CLAUDE.md**: Domain knowledge for Nostr-ILP integration

---
