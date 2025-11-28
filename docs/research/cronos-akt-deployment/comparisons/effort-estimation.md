# Effort Estimation: Cronos Deployment

**Research Date:** 2025-11-28
**Purpose:** Detailed hour breakdown for deploying BasePaymentChannel.sol to Cronos

---

## Summary

| Approach | Total Hours | Cost (@ $150/hr) | Timeline |
|----------|-------------|------------------|----------|
| **Cronos (Modify existing)** | 5-6 hours | $750-900 | 1-2 days |
| **CosmWasm (Rewrite)** | 40-60 hours | $6,000-9,000 | 2-3 weeks |
| **Multi-chain (Both)** | 45-66 hours | $6,750-9,900 | 3-4 weeks |

**Savings with Cronos:** 35-55 hours ($5,250-8,100)

---

## Detailed Breakdown: Cronos Deployment

### Phase 1: Contract Modification (2 hours)

| Task | Hours | Details |
|------|-------|---------|
| Copy BasePaymentChannel.sol to CronosPaymentChannel.sol | 0.1 | Simple file copy |
| Add IERC20 import and state variable | 0.1 | One line import, one variable |
| Add constructor with token address | 0.2 | Simple constructor |
| Modify openChannel() function | 0.3 | Remove payable, add amount param, add transferFrom |
| Modify closeChannel() function | 0.2 | Replace native transfers with token.transfer() |
| Modify expireChannel() function | 0.1 | Replace transfer |
| Code review and cleanup | 0.2 | Check for edge cases |
| Compile and fix any errors | 0.2 | Usually none, but buffer |
| Create MockERC20 test helper | 0.3 | Standard ERC-20 mock |
| Git commit changes | 0.1 | Commit message, push |
| **Subtotal** | **1.8 hours** | Round to 2 hours |

### Phase 2: Test Updates (1.5 hours)

| Task | Hours | Details |
|------|-------|---------|
| Update test setup (deploy mock token) | 0.2 | Add token deployment to beforeEach |
| Update openChannel tests | 0.3 | Add approval step, update assertions |
| Update closeChannel tests | 0.3 | Change from getBalance to balanceOf |
| Update expireChannel tests | 0.2 | Same as closeChannel |
| Add ERC-20 specific tests (approval, etc.) | 0.3 | Edge cases: insufficient approval, etc. |
| Run full test suite, fix failures | 0.2 | Usually passes, but buffer |
| **Subtotal** | **1.5 hours** | |

### Phase 3: Configuration (0.5 hours)

| Task | Hours | Details |
|------|-------|---------|
| Update hardhat.config.ts | 0.2 | Add Cronos networks, CronoScan config |
| Create .env entries | 0.1 | PRIVATE_KEY, CRONOSCAN_API_KEY |
| Install any missing dependencies | 0.1 | Usually none, but check |
| Test compilation | 0.1 | npx hardhat compile |
| **Subtotal** | **0.5 hours** | |

### Phase 4: Deployment Scripts (0.5 hours)

| Task | Hours | Details |
|------|-------|---------|
| Create deploy-cronos.ts script | 0.3 | Deploy MockAKT + CronosPaymentChannel |
| Create verification script | 0.1 | Hardhat verify commands |
| Test deployment on local network | 0.1 | npx hardhat node |
| **Subtotal** | **0.5 hours** | |

### Phase 5: Testnet Deployment (1 hour)

| Task | Hours | Details |
|------|-------|---------|
| Set up MetaMask with Cronos testnet | 0.1 | Add network, get address |
| Get TCRO from faucet | 0.1 | Visit faucet, wait for tokens |
| Deploy MockAKT to testnet | 0.1 | npx hardhat run --network cronos-testnet |
| Deploy CronosPaymentChannel to testnet | 0.1 | Same command |
| Verify contracts on CronoScan | 0.2 | Can be slow, sometimes fails first try |
| Troubleshoot verification issues | 0.2 | Constructor args, compiler version |
| Test openChannel + closeChannel on testnet | 0.2 | End-to-end test with MetaMask |
| **Subtotal** | **1.0 hour** | |

### Phase 6: Integration Testing (1 hour)

| Task | Hours | Details |
|------|-------|---------|
| Create Dassie settlement module for Cronos | 0.5 | Similar to Base L2 module (Story 2.6) |
| Test ILP payment → channel open flow | 0.2 | Integration test |
| Test channel close → refund flow | 0.2 | Integration test |
| Document any issues found | 0.1 | Notes for production |
| **Subtotal** | **1.0 hour** | |

### Phase 7: Documentation (0.5 hours)

| Task | Hours | Details |
|------|-------|---------|
| Update README with Cronos instructions | 0.2 | How to deploy, addresses |
| Document user flow (bridge AKT) | 0.2 | User-facing documentation |
| Add contract addresses to docs | 0.1 | Testnet + mainnet (when ready) |
| **Subtotal** | **0.5 hours** | |

---

## Total Effort: Cronos

**Base estimate:** 6.8 hours
**Rounded:** 7 hours
**With 20% buffer:** 8.4 hours

**Conservative estimate:** **8-10 hours** (includes unknowns)

**Best case:** 5 hours (everything works first try)
**Likely case:** 7 hours (minor issues)
**Worst case:** 10 hours (verification issues, testnet downtime)

---

## Detailed Breakdown: CosmWasm Deployment (for comparison)

### Phase 1: Learning (8 hours) - If team unfamiliar with Rust/CosmWasm

| Task | Hours |
|------|-------|
| Learn Rust basics | 4 |
| Learn CosmWasm framework | 3 |
| Set up dev environment (Rust, cargo, cosmwasm-check) | 1 |

### Phase 2: Contract Development (20 hours)

| Task | Hours |
|------|-------|
| Create project structure (cargo generate) | 0.5 |
| Define state (State struct, storage) | 2 |
| Define messages (InstantiateMsg, ExecuteMsg, QueryMsg) | 2 |
| Implement instantiate() entry point | 1 |
| Implement execute::open_channel() | 4 |
| Implement execute::close_channel() with signature verification | 5 |
| Implement execute::expire_channel() | 2 |
| Implement query functions | 2 |
| Error handling and validation | 1.5 |

### Phase 3: Testing (12 hours)

| Task | Hours |
|------|-------|
| Set up test environment | 1 |
| Write unit tests for each function | 4 |
| Write integration tests | 4 |
| Mock dependencies (cosmwasm-std testing) | 2 |
| Fix bugs found during testing | 1 |

### Phase 4: WASM Compilation & Optimization (4 hours)

| Task | Hours |
|------|-------|
| Compile to WASM | 0.5 |
| Optimize with wasm-opt | 0.5 |
| Run cosmwasm-check | 0.5 |
| Fix any compatibility issues | 1 |
| Generate JSON schema | 1 |
| Create deployment artifacts | 0.5 |

### Phase 5: Deployment (4 hours)

| Task | Hours |
|------|-------|
| Set up Akash testnet | 1 |
| Deploy contract with akash CLI | 1 |
| Instantiate contract | 0.5 |
| Test on-chain | 1.5 |

### Phase 6: Integration (8 hours)

| Task | Hours |
|------|-------|
| Create Dassie settlement module for Cosmos | 4 |
| Integrate with ILP | 2 |
| End-to-end testing | 2 |

### Phase 7: Documentation (4 hours)

| Task | Hours |
|------|-------|
| Contract documentation | 2 |
| Deployment guide | 1 |
| User guide | 1 |

**Total CosmWasm effort:** 60 hours (with learning), 52 hours (without learning)

---

## Risk-Adjusted Estimates

### Cronos (Low Risk)

| Scenario | Probability | Hours |
|----------|-------------|-------|
| Best case (everything works) | 20% | 5 |
| Expected case (minor issues) | 60% | 7 |
| Worst case (major issues) | 20% | 12 |

**Risk-adjusted estimate:** (0.2 × 5) + (0.6 × 7) + (0.2 × 12) = **7.6 hours**

### CosmWasm (Medium Risk)

| Scenario | Probability | Hours |
|----------|-------------|-------|
| Best case (team knows Rust) | 10% | 40 |
| Expected case (learning + dev) | 70% | 55 |
| Worst case (major blockers) | 20% | 75 |

**Risk-adjusted estimate:** (0.1 × 40) + (0.7 × 55) + (0.2 × 75) = **57.5 hours**

---

## ROI Comparison

### Cronos

**Investment:** 7.6 hours × $150/hr = $1,140

**Benefits:**
- Production-ready in 1 week
- Reusable for other EVM chains (Polygon, Arbitrum, etc.)
- Familiar stack (lower maintenance cost)

**ROI:** Fast time-to-market, low risk

### CosmWasm

**Investment:** 57.5 hours × $150/hr = $8,625

**Benefits:**
- 10x cheaper gas ($0.0001 vs $0.001)
- Native Cosmos experience
- Learning investment in Rust/CosmWasm

**ROI:** Long-term gas savings, but higher upfront cost

### Break-Even Analysis

**Gas savings per channel:** $0.001 - $0.0001 = $0.0009

**Channels needed to recoup development cost:**
$7,485 / $0.0009 = **8,316,667 channels**

**At 1,000 channels/day:**
8,316,667 / 1,000 = **8,317 days** (22.8 years)

**Conclusion:** CosmWasm gas savings don't justify upfront cost unless VERY high volume (millions of channels per year)

---

## Recommendation

✅ **Deploy to Cronos**

**Rationale:**
1. **8x faster:** 7.6 hours vs 57.5 hours
2. **8x cheaper:** $1,140 vs $8,625
3. **Lower risk:** Reusing proven code
4. **Faster ROI:** Production in 1 week vs 3 weeks

**Defer CosmWasm to v2 when:**
- Payment channel volume justifies gas optimization
- Team has Rust expertise
- Have time for longer development cycle

---

## Resource Requirements

### Cronos Deployment

**People:**
- 1 developer (familiar with Solidity/Hardhat)

**Skills:**
- Solidity (intermediate)
- Hardhat (intermediate)
- Git (basic)

**Tools:**
- VS Code or similar IDE
- Node.js v18+
- Hardhat
- MetaMask

**Infrastructure:**
- None (use public RPC)

### CosmWasm Deployment

**People:**
- 1 developer (Rust experience preferred)

**Skills:**
- Rust (intermediate-advanced)
- CosmWasm (beginner-intermediate)
- Cargo (intermediate)
- WASM compilation

**Tools:**
- VS Code with Rust extension
- Rust toolchain
- cosmwasm-check
- wasm-opt

**Infrastructure:**
- Akash testnet access
- CLI tools (akash, gaiad, etc.)

---

## Timeline with Dependencies

### Cronos (1 week total)

**Day 1:**
- Morning: Contract modification (2 hours)
- Afternoon: Test updates (1.5 hours)

**Day 2:**
- Morning: Configuration + deployment scripts (1 hour)
- Afternoon: Testnet deployment (1 hour)

**Day 3:**
- Morning: Integration testing with Dassie (1 hour)
- Afternoon: Documentation (0.5 hours)

**Day 4-5:** Buffer for issues, code review

**Total:** 5 business days with buffer

### CosmWasm (3 weeks total)

**Week 1:**
- Learn Rust/CosmWasm (3 days)
- Start contract dev (2 days)

**Week 2:**
- Finish contract (2 days)
- Testing (3 days)

**Week 3:**
- WASM compilation (1 day)
- Deployment (1 day)
- Integration (2 days)
- Documentation (1 day)

**Total:** 15 business days

---

**Status:** ✅ COMPLETE
**Next:** See executive summary (README.md) for final recommendation
