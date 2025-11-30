# Archived: Original CosmWasm Epic 3 QA Gates

**Archived Date:** 2025-11-28
**Reason:** Epic 3 pivoted from CosmWasm/Akash deployment to Cronos EVM deployment

## Background

These QA gates were created for the original Epic 3 plan, which focused on:
- CosmWasm smart contract development
- Native Akash blockchain deployment
- Rust-based contract implementation

## Why Archived?

On 2025-11-28, after research findings showed that Cronos deployment would be:
- **8x faster** to develop (7 hours vs 57 hours)
- **8x cheaper** ($900 vs $8,625)
- **60-70% cheaper gas** costs
- **95% code reuse** from existing Base L2 contract

Epic 3 was pivoted to focus on Cronos EVM deployment instead of native CosmWasm.

## Original Stories (Archived)

- Story 3.1: Initialize CosmWasm Contract Project
- Story 3.2: Implement Contract State and Messages
- Story 3.3: Implement OpenChannel Function
- Story 3.4: Implement CloseChannel with Claim Verification
- Story 3.5: Add Query Functions
- Story 3.6: Deploy Contract to Akash Testnet (removed - not implemented)
- Story 3.6: Create Contract Interaction Library for Dassie

## New Epic 3 (Cronos)

The NEW Epic 3 stories focus on Cronos deployment:
- Story 3.1: Modify BasePaymentChannel for ERC-20 AKT Support
- Story 3.2: Create MockAKT Token and Update Tests
- Story 3.3: Configure Hardhat for Cronos and Create Deployment Scripts
- Story 3.4: Deploy to Cronos Testnet and Verify
- Story 3.5: Create Dassie Cronos Settlement Module
- Story 3.6: Deploy to Cronos Mainnet (Production)

See `docs/prd/epic-3-cosmwasm-payment-channel-contract.md` for current Epic 3 documentation.

---

**Note:** CosmWasm deployment may be reconsidered in the future if channel volume exceeds 100k/month and native Akash integration provides strategic value.
