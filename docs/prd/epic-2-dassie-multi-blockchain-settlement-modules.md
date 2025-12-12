# Epic 2: Dassie Multi-Blockchain Settlement Modules

**Goal:** Enable RPC token authentication, implement settlement modules for Bitcoin (Lightning), Base L2, Cosmos/Akash (CosmWasm), and XRP Ledger in Dassie node, and add RPC endpoints for economic monitoring. This epic enables the relay to accept payments in 4 different cryptocurrencies via ILP routing and provides APIs for Nostream integration.

**Status:** In Progress (Stories 2.10-2.13 added for monorepo integration and deployment)

**Timeline:** 2-3 weeks

**Dependencies:**
- Epic 1 complete (Nostream forked and running)
- Epic 3 complete (MultiTokenPaymentChannelFactory deployed)
- Dassie repository accessible at `/Users/jonathangreen/Documents/dassie`

**Output:** Integrated Dassie ILP node in monorepo, deployed to Akash with multi-currency payment support

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

## Story 2.10: Migrate Dassie into Monorepo

**As a** developer,
**I want** Dassie integrated into the nostream-ilp monorepo,
**so that** I can develop, build, and deploy both services together with shared types and tooling.

**Acceptance Criteria:**
1. Dassie source code moved into `packages/app-dassie/` directory
2. pnpm workspace configuration updated to include Dassie
3. Shared TypeScript types extracted to `packages/lib-payment-types/`
4. Smart contracts moved to `packages/lib-contracts/`
5. Build scripts work for both packages: `pnpm build` builds all
6. Dev scripts work: `pnpm dev:nostream` and `pnpm dev:dassie`
7. All existing Dassie tests pass in new location
8. Git history preserved (use `git subtree` or `git filter-branch`)
9. Documentation updated: README.md, architecture docs
10. CI/CD updated to build both packages

**Priority:** HIGH (Foundation for 2.11-2.13)

**Story File:** `docs/stories/2.10-migrate-dassie-monorepo.md`

---

## Story 2.11: Integrate MultiTokenPaymentChannelFactory with Dassie

**As a** developer,
**I want** Dassie to use MultiTokenPaymentChannelFactory for Base/Cronos settlements,
**so that** users can pay the relay with multiple ERC-20 tokens on different L2 chains.

**Acceptance Criteria:**
1. Dassie Cosmos settlement module integrated with MultiTokenPaymentChannelFactory contract
2. Support for Base L2 (Sepolia testnet and mainnet)
3. Support for Cronos (testnet and mainnet)
4. Contract interaction via viem library
5. Open channel function: Creates channel with ERC-20 token or native ETH
6. Verify claim function: Validates off-chain signed payment claims
7. Close channel function: Settles final claim on-chain
8. RPC endpoint added: `verifyPaymentClaim` accepts claims for BASE/CRONOS
9. Integration tests with deployed MultiTokenPaymentChannelFactory
10. Documentation: How to configure Base/Cronos settlement

**Priority:** HIGH (Critical for payment functionality)

**Story File:** `docs/stories/2.11-integrate-multitokenpaymentchannel.md`

**Contract Addresses:**
- Cronos Mainnet: `0x9Ec2d217b14e67cAbF86F20F4E7462D6d7bc7684`
- Cronos Testnet: `0x4b9e32389896C05A4CAfC41bE9dA6bB108a7dA72`
- Base Sepolia: TBD (requires deployment)
- Base Mainnet: TBD (requires deployment)

---

## Story 2.12: Create Docker Images for Monorepo Services

**As a** developer,
**I want** Docker images for both Nostream and Dassie built from the monorepo,
**so that** I can deploy both services to Akash with proper isolation and resource management.

**Acceptance Criteria:**
1. `docker/Dockerfile.nostream` - Multi-stage build from monorepo
2. `docker/Dockerfile.dassie` - Multi-stage build from monorepo
3. Both images use node:22-alpine base
4. Optimized layer caching (dependencies installed before code copy)
5. Health check endpoints configured in Dockerfiles
6. Images build successfully: `docker-compose build`
7. Both services start: `docker-compose up`
8. Nostream can connect to Dassie RPC (service discovery works)
9. Environment variables properly injected
10. Image sizes optimized (<500MB per image)

**Priority:** HIGH (Required for deployment)

**Story File:** `docs/stories/2.12-create-docker-images.md`

---

## Story 2.13: Update Akash Deployment with Dassie Service

**As a** peer operator,
**I want** both Nostream and Dassie deployed together on Akash,
**so that** my peer node has full payment verification capabilities.

**Acceptance Criteria:**
1. Update `akash/deploy.yaml` to include Dassie service
2. Configure resource allocation for Dassie (0.35 CPU, 512Mi RAM, 5Gi storage)
3. Update pricing to include Dassie (add 200 uAKT/block)
4. Configure service dependencies (nostream depends on dassie)
5. Configure internal networking (nostream → dassie:7768)
6. Update environment variables for both services
7. Total cost remains <$10/month (1,150 uAKT/block total = $6.04/month)
8. Test deployment to Akash sandbox/testnet
9. Verify services can communicate
10. Update deployment documentation

**Priority:** HIGH (Completes Epic 2 deployment)

**Story File:** `docs/stories/2.13-update-akash-deployment-dassie.md`

**Cost Breakdown:**
- Nostream: 550 uAKT/block
- Dassie: 200 uAKT/block (NEW)
- PostgreSQL: 300 uAKT/block
- Redis: 100 uAKT/block
- **Total**: 1,150 uAKT/block = **$6.04/month** (at $5/AKT)

---

## Epic 2 Sprint Plan

### Sprint 1: Monorepo Foundation (Week 1)

**Stories:**
- ✅ Story 2.10: Migrate Dassie into Monorepo (5 days)

**Deliverables:**
- Monorepo structure with pnpm workspaces
- Shared payment types package
- Consolidated contracts package
- All tests passing in new structure

**Risks:**
- Git history preservation complexity
- Import path breakage
- Build configuration issues

---

### Sprint 2: Payment Integration (Week 2)

**Stories:**
- ✅ Story 2.11: Integrate MultiTokenPaymentChannelFactory (5 days)
- ✅ Story 2.12: Create Docker Images (3 days, can overlap)

**Deliverables:**
- Base L2 settlement module working
- Cronos settlement module working
- Payment verification RPC endpoint
- Docker images for both services
- Integration tests passing

**Risks:**
- Contract interaction bugs (viem signature verification)
- Testnet RPC reliability
- Docker build complexity

---

### Sprint 3: Deployment (Week 3)

**Stories:**
- ✅ Story 2.13: Update Akash Deployment (3 days)
- ✅ Story 2.2: Enable RPC Token Authentication (2 days, if not done)
- ✅ Story 2.3: Add Payment Verification RPC Endpoint (overlap with 2.11)

**Deliverables:**
- Akash SDL with 4 services
- Sandbox deployment tested
- Full documentation updated
- Mainnet deployment ready

**Risks:**
- Akash provider availability
- Service communication issues
- Environment variable configuration

---

## Story Dependencies

```
2.10 (Monorepo)
  ├─→ 2.11 (MultiToken Integration)
  ├─→ 2.12 (Docker Images)
  │     └─→ 2.13 (Akash Deployment)
  └─→ 2.2, 2.3 (RPC endpoints - can be parallel)

Epic 3 (Contracts Deployed)
  └─→ 2.11 (Needs contract addresses)

Story 8.1-8.2 (Docker/Akash foundation)
  └─→ 2.12, 2.13 (Deployment infrastructure)
```

---

## Success Metrics

**Epic 2 Complete When:**
- ✅ Dassie integrated into monorepo
- ✅ Nostream ↔ Dassie RPC communication working
- ✅ Payment claims verified via MultiTokenPaymentChannelFactory
- ✅ Docker images built and tested
- ✅ Deployed to Akash with both services
- ✅ Cost <$10/month
- ✅ Integration tests passing
- ✅ Documentation complete

**Key Metrics:**
- Build time: <5 minutes for full monorepo
- Docker image sizes: <500MB each
- Deployment time: <10 minutes on Akash
- Monthly cost: ~$6/month
- Payment verification latency: <100ms

---
