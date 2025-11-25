# Epic 3: CosmWasm Payment Channel Contract

**Goal:** Create, test, and deploy CosmWasm smart contract for Cosmos/Akash payment channels with XRP-style claim functionality. This epic enables native AKT payments without wrapping or bridging.

## Story 3.1: Initialize CosmWasm Contract Project

**As a** developer,
**I want** a CosmWasm contract project with proper tooling,
**so that** I can develop payment channel smart contract.

**Acceptance Criteria:**
1. New repository created: `cosmos-payment-channels`
2. CosmWasm template initialized: `cargo generate --git https://github.com/CosmWasm/cw-template.git`
3. Project structure:
   ```
   cosmos-payment-channels/
     src/
       contract.rs       # Main contract logic
       state.rs          # State structures
       msg.rs            # Message types
       error.rs          # Error types
     examples/
       schema.rs         # Generate JSON schema
     tests/
       integration.rs    # Integration tests
   ```
4. Dependencies configured in Cargo.toml (cosmwasm-std, cw-storage-plus)
5. Contract compiles: `cargo wasm`
6. Tests pass: `cargo test`
7. Schema generation works: `cargo schema`

## Story 3.2: Implement Contract State and Messages

**As a** developer,
**I want** well-defined state structures and message types,
**so that** the contract has clear interface.

**Acceptance Criteria:**
1. State structures in `src/state.rs`:
   ```rust
   pub struct PaymentChannel {
       pub id: String,
       pub sender: Addr,
       pub recipient: Addr,
       pub amount: Uint128,
       pub denom: String,
       pub expiration: u64,
       pub highest_claim: Uint128,
       pub status: ChannelStatus,
   }

   pub enum ChannelStatus {
       Open,
       Closed,
       Expired,
   }
   ```
2. Message types in `src/msg.rs`:
   ```rust
   pub enum ExecuteMsg {
       OpenChannel { recipient: String, expiration: u64 },
       CloseChannel { channel_id: String, final_claim: Claim },
   }

   pub struct Claim {
       pub amount: Uint128,
       pub nonce: u64,
       pub signature: Binary,
   }

   pub enum QueryMsg {
       GetChannel { channel_id: String },
       ListChannels { sender: Option<String>, recipient: Option<String> },
   }
   ```
3. Error types in `src/error.rs`
4. Unit tests validate structure serialization

## Story 3.3: Implement OpenChannel Function

**As a** developer,
**I want** OpenChannel to lock sender's funds in escrow,
**so that** recipients can later claim their payments.

**Acceptance Criteria:**
1. `execute_open_channel` function in `src/contract.rs`
2. Validates recipient address is valid
3. Validates expiration is in future
4. Requires sender to attach funds (validates exactly one coin sent)
5. Generates unique channel_id (hash of sender + recipient + timestamp)
6. Creates PaymentChannel struct and stores in state
7. Emits event with channel_id
8. Returns response with channel_id
9. Unit tests with cw-multi-test

## Story 3.4: Implement CloseChannel with Claim Verification

**As a** developer,
**I want** CloseChannel to verify claim signatures and transfer funds,
**so that** recipients can settle payment channels.

**Acceptance Criteria:**
1. `execute_close_channel` function in `src/contract.rs`
2. Loads channel from state (validates exists and is Open)
3. Verifies claim signature using Cosmos SDK secp256k1
4. Validates claim amount ≤ channel locked amount
5. Validates claim nonce > channel's highest_claim (prevents replay)
6. Transfers claimed amount to recipient via bank module
7. Refunds remaining balance to sender
8. Updates channel status to Closed
9. Emits event with settled amounts
10. Unit tests cover valid claims, invalid signatures, insufficient balance, replay attacks

## Story 3.5: Add Query Functions

**As a** developer,
**I want** query functions for channel state,
**so that** clients can check channel status off-chain.

**Acceptance Criteria:**
1. `query_channel` function returns channel details
2. `query_list_channels` returns paginated list of channels
3. Filters supported: sender, recipient, status
4. Returns channel data: id, parties, amount, status, highest_claim
5. Unit tests validate queries

## Story 3.6: Deploy Contract to Akash Testnet

**As a** developer,
**I want** the contract deployed to Akash testnet,
**so that** I can test with real blockchain.

**Acceptance Criteria:**
1. Contract optimized: `cosmwasm-optimize` produces .wasm file
2. Wallet created for Akash testnet with test AKT
3. Contract stored on-chain: `akash tx wasm store`
4. Contract instantiated: `akash tx wasm instantiate`
5. Contract address documented in project README
6. Test transactions executed: Open channel, close channel
7. Gas costs measured and documented
8. Deployment script: `scripts/deploy-testnet.sh`

## Story 3.7: Create Contract Interaction Library for Dassie

**As a** developer,
**I want** a TypeScript library for interacting with deployed contract,
**so that** Dassie settlement module can easily call contract functions.

**Acceptance Criteria:**
1. Library created: `packages/app-dassie/src/settlement/cosmos/contract-client.ts`
2. Uses CosmJS (@cosmjs/cosmwasm-stargate)
3. Methods:
   - `openChannel(recipient, amount, expiration) -> channelId`
   - `closeChannel(channelId, finalClaim) -> txHash`
   - `getChannel(channelId) -> ChannelState`
4. Handles transaction signing with wallet
5. Error handling for transaction failures
6. Integration test with deployed testnet contract

---
