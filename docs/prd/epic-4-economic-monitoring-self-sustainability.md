# Epic 4: Base Payment Channels for Peer-to-Peer Network

**Goal:** Deploy multi-token payment channel factory on Base L2 to enable peer-to-peer payments between Dassie nodes. This epic provides the on-chain settlement layer for the BTP-NIPs network, where peers open unidirectional payment channels with each other to fund subscriptions and content payments.

**Key Innovation:** Multi-token payment channel factory with **top-up functionality** allows peers to start with small deposits ($25-50) and add funds as needed without closing channels. Unidirectional design means only the payer deposits capital, making the network highly capital-efficient.

**Architecture Context:** This epic supports a **pure peer-to-peer network** where every participant runs a Dassie ILP node + Nostr storage + Web UI. There are no relay operators or client applications - everyone is an equal peer. Payment channels enable off-chain micropayments, with periodic on-chain settlement batching hundreds of transactions into a single Base L2 transaction.

---

## Story 4.1: Create Multi-Token Payment Channel Factory Contract

**As a** developer,
**I want** a payment channel factory that supports any ERC-20 token,
**so that** users can open channels with AKT, CRO, USDC, or any token on Cronos/Base.

**Acceptance Criteria:**
1. New contract created: `contracts/MultiTokenPaymentChannelFactory.sol`
2. Contract supports dynamic token selection per channel:
   ```solidity
   function openChannel(
       address tokenAddress,  // Any ERC-20 token
       address recipient,
       uint256 amount,
       uint256 expiration
   ) external returns (bytes32 channelId)
   ```
3. Channel struct includes token address:
   ```solidity
   struct Channel {
       address sender;
       address recipient;
       address token;         // ← NEW: Dynamic per channel
       uint256 balance;
       uint256 highestNonce;
       uint256 expiration;
       bool isClosed;
   }
   ```
4. `closeChannel()` and `expireChannel()` handle token-specific transfers:
   - Use `IERC20(channel.token).transfer()` instead of hardcoded token
5. Support for native ETH channels (special case: `address(0)` = ETH)
6. Comprehensive test suite:
   - Test with multiple ERC-20 tokens (MockAKT, MockUSDC, MockCRO)
   - Test with native ETH
   - Test multiple simultaneous channels with different tokens
   - Test that channels are isolated (AKT channel can't claim USDC)
7. Gas optimization: Similar costs to single-token contract
8. Security: Validate token address is contract (prevent EOA addresses)
9. Events include token address for indexing:
   ```solidity
   event ChannelOpened(
       bytes32 indexed channelId,
       address indexed sender,
       address indexed recipient,
       address token,      // ← NEW
       uint256 balance,
       uint256 expiration
   )
   ```

**Testing Requirements:**
- Unit tests: >90% coverage
- Test multiple tokens simultaneously
- Test native ETH fallback
- Gas cost comparison vs single-token contract (<10% overhead)

**Dependencies:**
- Epic 3 complete (CronosPaymentChannel as reference) ✅

**Outputs:**
- Multi-token factory contract (Solidity)
- Test suite with multiple token mocks
- Deployment script for Cronos + Base
- Documentation on supported token standards

---

## Story 4.2: Deploy Multi-Token Factory to Base Mainnet

**As a** peer operator,
**I want** MultiTokenPaymentChannelFactory deployed to Base mainnet,
**so that** I can open payment channels with other peers using ETH or USDC.

**Acceptance Criteria:**
1. Deploy to **Base Mainnet** (ChainID: 8453):
   - Contract: `MultiTokenPaymentChannelFactory.sol`
   - Verify on BaseScan
   - Test with: Native ETH (address(0)) and USDC
   - Document address: `BASE_MULTI_TOKEN_FACTORY_ADDRESS`
2. Create Base token configuration:
   ```yaml
   # config/base-tokens.yaml
   base:
     - address: "0x0000000000000000000000000000000000000000"
       symbol: "ETH"
       decimals: 18
       name: "Ethereum"
     - address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
       symbol: "USDC"
       decimals: 6
       name: "USD Coin"
   ```
3. Gas cost validation: <$0.01 per channel open/close on Base
4. Integration tests:
   - Open channel with ETH
   - Open channel with USDC
   - Top-up channel with both token types
   - Close channel and verify settlement
5. Update .env.example with Base factory address
6. Document deployment process and contract addresses

**Dependencies:**
- Story 4.1 complete (factory contract built and tested)
- Deployer wallet funded on Base mainnet

**Outputs:**
- Deployed factory address on Base
- Verified contract on BaseScan
- Base token configuration
- Deployment documentation

**Note:** While Base is the only chain for MVP, the factory contract is **chain-agnostic** and can be deployed to other EVM chains (Arbitrum, Optimism, Polygon) in the future if demand exists.

---

## Story 4.3: Create Dassie Base Settlement Module

**As a** peer operator,
**I want** Dassie to track Base payment channel balances and create payment claims,
**so that** I can send payments to other peers via ILP with off-chain settlement.

**Acceptance Criteria:**
1. Create `base-mainnet.ts` settlement module in Dassie:
   - File: `packages/app-dassie/src/settlement/base-mainnet.ts`
   - Connect to Base L2 RPC (https://mainnet.base.org)
   - Load factory contract ABI
2. Track peer payment channels:
   - Query factory contract for channels where node is sender
   - Cache channel balances locally
   - Monitor channel expiration dates
3. Create payment claim function:
   - Generate off-chain signed claim for channel payment
   - Increment nonce (prevent double-spend)
   - Sign with node's private key
   - Return claim to ILP layer for transmission
4. Implement periodic settlement:
   - Batch multiple claims
   - Settle on-chain daily or when threshold reached
   - Call closeChannel() with highest nonce
5. Handle incoming claims from peers:
   - Verify signature
   - Verify nonce > highestNonce
   - Update local accounting
   - Queue for on-chain settlement
6. Support both ETH and USDC tokens:
   - Track balances per token type
   - Handle native ETH vs ERC-20 differences
7. Integration tests:
   - Open channel, create claims, verify balances
   - Test settlement with batched claims
   - Test with both ETH and USDC channels

**Dependencies:**
- Story 4.2 complete (factory deployed to Base)

**Outputs:**
- Base settlement module for Dassie
- Off-chain payment claim generation
- Periodic settlement logic

---

## Epic 4 Complete

**Stories 4.4+** from the original plan (liquidity pools, token swapping, multi-chain support) are **removed** in favor of simplified Base-only architecture with direct Akash payments.

**See:**
- Epic 7: Direct Akash Integration (replaces complex swapping logic)
- Epic 10+: Future multi-chain expansion (if needed)

---

## Original Stories (Deprecated)

The following stories from the original Epic 4 plan are **moved to Epic 7 (Direct Akash Integration)** or **removed entirely** due to architectural simplification:

- ~~Story 4.4: Configure Dassie as Multi-Chain Liquidity Connector~~ → Removed (Base-only architecture)
- ~~Story 4.5: Implement Direct ILP Swap Quote API~~ → Removed (no token swapping)
- ~~Story 4.6: Implement Multi-Chain Swap Execution via ILP~~ → Removed (no token swapping)
- ~~Story 4.7: Add Liquidity Pool Management & Rebalancing~~ → Removed (no liquidity pools)
- ~~Story 4.8: Create Economic Monitor Service~~ → Moved to Epic 7
- ~~Story 4.9: Integrate with Akash Provider Billing~~ → Moved to Epic 7
- ~~Story 4.10: Implement Automatic Akash Escrow Deposit~~ → Moved to Epic 7
- ~~Story 4.11: Create Profitability Dashboard~~ → Moved to Epic 7
- ~~Story 4.12: Add Economic Alerts~~ → Moved to Epic 7
- ~~Story 4.13: Implement 30-Day Self-Sustainability Simulation~~ → Moved to Epic 7

**Rationale:** Epic 4 now focuses solely on **Base payment channel deployment**. Economic monitoring and Akash integration are separated into Epic 7 for clearer scope boundaries.

---

**Epic 4 Summary:**
- **Stories:** 4.1, 4.2, 4.3 (3 stories total)
- **Timeline:** 2 weeks
- **Output:** Base L2 payment channels operational for peer-to-peer network

---
