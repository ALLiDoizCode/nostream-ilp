# Epic 2: Dassie Multi-Blockchain Settlement Modules

**Goal:** Enable RPC token authentication, implement settlement modules for Bitcoin (Lightning), Base L2, Cosmos/Akash (CosmWasm), and XRP Ledger in Dassie node, and add RPC endpoints for economic monitoring. This epic enables the relay to accept payments in 4 different cryptocurrencies via ILP routing and provides APIs for Nostream integration.

## Story 2.1: Set Up Dassie Development Environment

**As a** developer,
**I want** Dassie running locally for development,
**so that** I can test ILP functionality and build settlement modules.

**Acceptance Criteria:**
1. Dassie repository cloned or forked: `dassie` or `dassie-relay`
2. Dependencies installed: `pnpm install`
3. Development build succeeds: `pnpm build`
4. Dassie node starts: `pnpm dev` (app-dassie package)
5. Health check endpoint responds: GET `http://localhost:7768/health`
6. Peer discovery works (connects to Dassie testnet or local multi-node setup)
7. Documentation: How to run Dassie locally for development

## Story 2.2: Enable RPC Token Authentication in Dassie

**As a** developer,
**I want** Dassie to support token-based authentication for RPC,
**so that** Nostream can authenticate securely via environment variable.

**Acceptance Criteria:**
1. Modify Dassie RPC server: `packages/app-dassie/src/rpc-server/rpc-server.ts`
2. Add token authentication alongside existing session cookie auth:
   ```typescript
   // Token authentication (production-safe)
   const providedToken = url.searchParams.get("token")
   const expectedToken = environmentConfig.rpcAuthToken  // New config

   if (
     expectedToken &&
     expectedToken.length >= 32 &&  // Minimum 32 characters
     providedToken &&
     providedToken === expectedToken  // Constant-time comparison
   ) {
     authenticated = true
   }
   ```
3. Configuration via environment variable: `RPC_AUTH_TOKEN` (minimum 32 characters)
4. Token auth available in production (not just dev mode)
5. Works alongside existing session cookie authentication (both methods supported)
6. Token NOT logged in plain text (sanitize URLs in logs to hide token)
7. Documentation: How to generate secure token (e.g., `openssl rand -hex 32`)
8. Unit test validates token auth works
9. Integration test: Connect with valid token → authenticated, invalid token → `RpcFailure("Unauthorized")`

## Story 2.3: Add Payment Verification RPC Endpoint to Dassie

**As a** developer,
**I want** Dassie to expose an RPC endpoint for payment claim verification,
**so that** Nostream can validate claims via WebSocket RPC.

**Acceptance Criteria:**
1. New RPC mutation added to Dassie's payment router: `src/rpc-server/routers/payment.ts`
2. Mutation definition:
   ```typescript
   verifyPaymentClaim: authenticatedProcedure
     .input(z.object({
       channelId: z.string(),
       amountSats: z.number(),
       nonce: z.number(),
       signature: z.string(),  // hex
       currency: z.enum(['BTC', 'BASE', 'AKT', 'XRP'])
     }))
     .mutation(async ({ input, context }) => {
       // Look up channel state in internal ledger
       // Verify signature matches sender's public key
       // Validate nonce > previous nonce (prevent replay)
       // Validate amount ≤ channel capacity
       // Update channel state with new highest nonce if valid
       return {
         valid: boolean,
         reason?: string,  // "invalid-signature", "insufficient-balance", etc.
         amountSats?: number
       }
     })
   ```
3. Verification logic uses Dassie's internal ledger to look up channel state
4. Updates ledger account when claim is verified (tracks revenue)
5. Requires authentication (uses Dassie's existing auth system)
6. Unit tests with mock channel state
7. Integration test with real payment channel
8. Exported in AppRouter type for Nostream to use

## Story 2.4: Implement Bitcoin Lightning Settlement Module

**As a** developer,
**I want** a Lightning Network settlement module in Dassie,
**so that** users can pay the relay using Bitcoin.

**Acceptance Criteria:**
1. Check if Dassie already has Lightning support (may exist)
2. If not, create module: `packages/app-dassie/src/settlement/lightning/`
3. Implements Dassie's SettlementSchemeModule interface
4. Integrates with LND or CLN (Core Lightning) via gRPC
5. Supports opening payment channels with users
6. Verifies Lightning invoice payments (claim-based or invoice-based)
7. Settles by claiming from Lightning channels
8. Uses Bitcoin testnet for MVP
9. Integration test: Open channel, send payment, close channel

## Story 2.5: Create Base L2 Payment Channel Contract

**As a** developer,
**I want** an Ethereum smart contract for payment channels on Base L2,
**so that** users can pay the relay using ETH.

**Acceptance Criteria:**
1. Solidity contract created: `contracts/BasePaymentChannel.sol`
2. Functions implemented:
   - `openChannel(recipient, expiration) payable` - Lock ETH
   - `closeChannel(channelId, finalClaim) ` - Settle with claim
   - `getChannel(channelId) view` - Query channel state
3. Claim verification logic (ecrecover signature validation)
4. Nonce monotonicity enforcement
5. Contract compiled and tested with Hardhat/Foundry
6. Unit tests cover all functions and edge cases
7. Contract deployed to Base Sepolia testnet
8. Deployment script and documentation

## Story 2.6: Implement Base L2 Settlement Module in Dassie

**As a** developer,
**I want** a Base L2 settlement module in Dassie,
**so that** the relay can accept ETH payments on Base.

**Acceptance Criteria:**
1. Module created: `packages/app-dassie/src/settlement/base/`
2. Implements Dassie's SettlementSchemeModule interface
3. Integrates with Base RPC endpoint (Alchemy, Infura, or public Base Sepolia)
4. Interacts with deployed BasePaymentChannel contract via ethers.js or viem
5. Opens channels: Calls contract's `openChannel` method
6. Verifies claims: Off-chain signature verification in TypeScript
7. Settles: Calls contract's `closeChannel` with final claim
8. Uses Base Sepolia testnet for MVP
9. Integration test: Open channel, verify claims, close channel

## Story 2.7: Implement Cosmos/Akash Settlement Module in Dassie

**As a** developer,
**I want** a Cosmos settlement module in Dassie,
**so that** the relay can accept AKT payments natively.

**Acceptance Criteria:**
1. Module created: `packages/app-dassie/src/settlement/cosmos/`
2. Implements Dassie's SettlementSchemeModule interface
3. Integrates with Akash RPC via CosmJS (@cosmjs/stargate)
4. Interacts with deployed CosmWasm payment channel contract
5. Opens channels: Executes contract's OpenChannel message
6. Verifies claims: Off-chain signature verification (Cosmos secp256k1)
7. Settles: Executes contract's CloseChannel with final claim
8. Uses Akash testnet for development, mainnet for production
9. Integration test: Open channel on testnet, verify claim, close channel

## Story 2.8: Implement XRP Ledger Settlement Module in Dassie

**As a** developer,
**I want** an XRP Ledger settlement module in Dassie,
**so that** users can pay the relay using XRP.

**Acceptance Criteria:**
1. Module created: `packages/app-dassie/src/settlement/xrp/`
2. Implements Dassie's SettlementSchemeModule interface
3. Integrates with XRP Ledger via xrpl.js library
4. Opens payment channels: PaymentChannelCreate transaction
5. Verifies claims: Ed25519 signature verification
6. Settles: PaymentChannelClaim transaction submits final claim
7. Uses XRP testnet for MVP
8. Integration test: Open channel on testnet, send claims, close channel

## Story 2.9: Add Additional RPC Endpoints for Economic Monitor

**As a** developer,
**I want** Dassie to expose RPC endpoints for currency conversion and channel claiming,
**so that** economic monitor can automate AKT conversion and settlement.

**Acceptance Criteria:**
1. New RPC mutations added to Dassie's payment router:
   ```typescript
   // Convert balance to AKT via ILP routing
   convertToAKT: authenticatedProcedure
     .input(z.object({
       fromCurrency: z.enum(['BTC', 'BASE', 'XRP']),
       amount: z.number()
     }))
     .mutation(async ({ input, context }) => {
       // Create ILP payment to AKT connector
       // Return conversion result
       return { aktReceived: number, conversionRate: number, fees: number }
     }),

   // Trigger settlement on all or specific payment channels
   claimAllChannels: authenticatedProcedure
     .input(z.object({ currency: z.enum(['BTC', 'BASE', 'AKT', 'XRP']).optional() }))
     .mutation(async ({ input, context }) => {
       // Trigger settlement on payment channels
       // Return claimed amounts per currency
       return { btc: number, base: number, akt: number, xrp: number }
     }),

   // Get routing statistics (connector revenue)
   getRoutingStats: authenticatedProcedure
     .query(async ({ context }) => {
       // Query revenue/routing-fees accounts from ledger
       return {
         paymentsRouted24h: number,
         routingFeesEarned: { btc, base, akt, xrp },
         activePeers: number
       }
     })
   ```
2. All endpoints use Dassie's existing auth system (authenticated procedures)
3. Unit tests for each endpoint
4. Integration tests validate conversion, claiming, and stats work correctly
5. Note: Balance querying already exists via `ledgers.getList` and `debug.getLedger` (no new endpoint needed)

---
