# /research-cronos-akt-deployment Task

When this command is used, execute the following task:

<!-- Powered by BMAD™ Core -->

# Cronos AKT Payment Channel Deployment Research Task

This task executes comprehensive research to validate whether the existing Base L2 Payment Channel contract (BasePaymentChannel.sol) can be deployed to Cronos to enable AKT token payment channels, and determine the minimal changes required.

## Purpose

Determine whether we can reuse the existing Solidity payment channel contract from Epic 2 Story 2.5 by deploying it to Cronos (EVM-compatible chain with IBC bridge to Akash), potentially avoiding the need for the CosmWasm contracts built in Epic 3 Stories 3.1-3.5.

## Project Context

**Current State:**
- ✅ **Epic 2 Story 2.5 (DONE):** Solidity payment channel contract created for Base L2
- ✅ **Contract Location:** `/Users/jonathangreen/Documents/base-payment-channel/contracts/BasePaymentChannel.sol`
- ✅ **Contract Capabilities:**
  - `openChannel(recipient, expiration)` with ETH deposits
  - `closeChannel(channelId, finalClaim)` with signature verification
  - `getChannel(channelId)` view function
  - Nonce monotonicity enforcement
  - ecrecover signature validation
- ✅ **Deployed to:** Base Sepolia testnet (working)
- ✅ **Integration:** Dassie settlement module for Base L2 (Story 2.6 - done)

**Epic 3 Original Assumption (INCORRECT):**
- Stories 3.1-3.5: Built CosmWasm contracts in Rust for "Akash deployment"
- Reality: Akash Network is for hosting, NOT smart contracts
- **New Insight:** Cronos is EVM-compatible AND has IBC bridge with Akash

**Key Question:**
Can we deploy BasePaymentChannel.sol to Cronos and use AKT tokens (via IBC bridge), making Epic 3's CosmWasm work unnecessary?

## Research Output Structure

CRITICAL: All research outputs MUST be organized in the following folder structure:

```
docs/
└── research/
    └── cronos-akt-deployment/
        ├── README.md                           # Executive summary and recommendations
        ├── findings/
        │   ├── evm-compatibility.md           # Cronos EVM compatibility analysis
        │   ├── akt-token-integration.md       # AKT token on Cronos details
        │   ├── ibc-bridge-analysis.md         # Akash ↔ Cronos IBC bridge
        │   ├── contract-modifications.md      # Required code changes
        │   ├── gas-cost-comparison.md         # Cost analysis
        │   └── deployment-guide.md            # How to deploy to Cronos
        ├── code-examples/
        │   ├── BasePaymentChannelAKT.sol      # Modified contract for AKT
        │   ├── hardhat.config.cronos.ts       # Hardhat config for Cronos
        │   └── deploy-cronos.ts               # Deployment script
        ├── comparisons/
        │   ├── cronos-vs-cosmwasm.md          # Strategic comparison
        │   └── effort-estimation.md           # Hours to modify vs rewrite
        └── references/
            ├── cronos-documentation.md        # Official docs links
            ├── akt-token-addresses.md         # Contract addresses
            └── bridge-security.md             # Security audits
```

## Research Objective

**Determine the optimal path for AKT token payment channel support: Deploy BasePaymentChannel.sol to Cronos (modify existing) vs Continue with CosmWasm contracts (Epic 3 as-is) vs Multi-chain strategy (both).**

---

## Research Questions

### Primary Questions (Must Answer)

1. **Is Cronos fully EVM-compatible for Solidity ^0.8.20 contracts?**
   - Solidity version support
   - OpenZeppelin library compatibility
   - ecrecover signature verification support
   - Gas cost comparison vs Base L2

2. **Can AKT tokens be used in the BasePaymentChannel.sol contract on Cronos?**
   - Does AKT exist as an ERC-20 token on Cronos after IBC bridge?
   - What is the token contract address (mainnet + testnet)?
   - Do we need to modify `openChannel` from `payable` (ETH) to ERC-20 token transfers?
   - Example: Change from `msg.value` to `AKT.transferFrom()`

3. **How does the Akash ↔ Cronos IBC bridge work for users?**
   - User workflow: Akash wallet → IBC bridge → Cronos wallet
   - Bridge time (seconds? minutes?)
   - Bridge fees
   - Is it trustless or trusted?
   - Security audits

4. **What contract modifications are needed?**
   - Token handling: ETH (native) vs AKT (ERC-20)
   - Code changes required in openChannel, closeChannel
   - Testing changes
   - Deployment script changes

5. **What is the deployment process for Cronos testnet?**
   - Testnet name and RPC endpoint
   - Faucet for test CRO (gas token)
   - Test AKT token availability
   - Block explorer (equivalent to Basescan)

### Secondary Questions (Nice to Have)

6. **What are the gas costs on Cronos vs Base L2?**
   - openChannel gas cost
   - closeChannel gas cost
   - Cost in USD equivalent

7. **Are there any Cronos-specific gotchas or limitations?**
   - Maximum contract size
   - Gas limit per block
   - Known EVM compatibility issues

8. **Should we deploy to BOTH Base L2 (for ETH) and Cronos (for AKT)?**
   - Multi-chain strategy benefits
   - Dassie settlement module: one per chain or unified?
   - User experience implications

---

## Research Methodology

### Information Sources

**Primary Sources (Prioritize These):**
1. **Cronos Official Documentation**
   - EVM compatibility page
   - Smart contract deployment guide
   - Solidity version support
   - Gas fee structure
   - Testnet details

2. **Cronos IBC Bridge Documentation**
   - Official Akash ↔ Cronos IBC bridge docs
   - AKT token contract address on Cronos
   - Bridge tutorial/guide
   - Security audits

3. **Cronos Developer Resources**
   - GitHub repo with example contracts
   - Hardhat configuration examples
   - Contract verification guide (CronoScan)

4. **AKT Token Information**
   - AKT on Cronos: contract address, decimals
   - Existing DeFi protocols using AKT on Cronos
   - Liquidity and trading volume (validates real usage)

**Secondary Sources:**
5. Cronos Discord/Telegram developer channels
6. Blog posts about deploying to Cronos
7. Comparison articles: Cronos vs other EVM chains
8. YouTube tutorials

### Analysis Frameworks

**Code Diff Analysis:**
Compare existing BasePaymentChannel.sol with required changes:

```solidity
// CURRENT (Base L2 - ETH native)
function openChannel(address recipient, uint256 expiration)
    external payable returns (bytes32 channelId) {
    require(msg.value > 0, InsufficientBalance());
    // Store msg.value as channel balance
}

// MODIFIED (Cronos - AKT ERC-20)
IERC20 public immutable aktToken;

function openChannel(address recipient, uint256 expiration, uint256 amount)
    external returns (bytes32 channelId) {
    require(amount > 0, InsufficientBalance());
    aktToken.transferFrom(msg.sender, address(this), amount);
    // Store amount as channel balance
}
```

**Effort Estimation:**
- Contract modifications: X hours
- Testing: Y hours
- Deployment: Z hours
- Total vs CosmWasm rewrite: W hours saved

**Feasibility Matrix:**

| Factor | Base L2 (Current) | Cronos (Proposed) | Compatibility |
|--------|-------------------|-------------------|---------------|
| Language | Solidity ^0.8.20 | ? | ? |
| Token Type | Native ETH | ERC-20 AKT | Needs modification |
| Signature Verify | ecrecover | ? | ? |
| Gas Costs | ~$0.01/tx | ? | ? |
| Deployment Tool | Hardhat | ? | ? |

### Data Requirements

- **Official docs** from Cronos (not third-party)
- **AKT token contract address** on Cronos mainnet/testnet
- **Working code examples** of ERC-20 payment channels on Cronos
- **Gas benchmarks** (actual transaction costs)

---

## Expected Deliverables

### Executive Summary (README.md)

**Should include:**
- **Yes/No decision:** Can BasePaymentChannel.sol be deployed to Cronos for AKT?
- **Effort estimate:** Hours to modify contract vs ~80 hours for CosmWasm Stories 3.1-3.5
- **Key modifications needed** (bullet list)
- **Recommendation:** Use Cronos (reuse Base contract) vs Continue with CosmWasm (Epic 3 as-is) vs Multi-chain (both)

### Detailed Analysis Files

**findings/evm-compatibility.md:**
- Cronos EVM version and Solidity support
- OpenZeppelin library compatibility
- Known limitations or differences from Ethereum/Base
- ecrecover and cryptographic functions support

**findings/akt-token-integration.md:**
- AKT token contract address (mainnet + testnet)
- Token standard (ERC-20 confirmed?)
- Decimals, symbol, total supply
- Real-world usage examples (DeFi protocols using AKT on Cronos)
- Liquidity analysis

**findings/ibc-bridge-analysis.md:**
- Step-by-step user flow with screenshots/diagrams
- Bridge transaction time and costs
- Security model (trustless/trusted)
- Security audit results
- Alternative bridge options (if any)

**findings/contract-modifications.md:**
- Annotated code diff (BasePaymentChannel.sol before/after)
- Testing strategy changes
- Deployment script changes
- Estimated effort in hours

**findings/gas-cost-comparison.md:**
- openChannel: Base vs Cronos (USD)
- closeChannel: Base vs Cronos (USD)
- Acceptable for micropayments? (< $0.10 per tx target)
- Gas optimization opportunities

**findings/deployment-guide.md:**
- Cronos testnet setup instructions
- Faucet links and instructions
- Hardhat configuration
- Contract verification on CronoScan
- Troubleshooting common issues

**comparisons/cronos-vs-cosmwasm.md:**
- Option A: Cronos only (abandon CosmWasm)
- Option B: Multi-chain (Base for ETH, Cronos for AKT)
- Option C: CosmWasm only (continue Epic 3)
- Pros/cons table with weighted scoring

**comparisons/effort-estimation.md:**
- Detailed breakdown of modification hours
- Risk assessment for each approach
- Timeline impact on Epic 3
- Resource requirements

### Code Examples (code-examples/)

**BasePaymentChannelAKT.sol:**
- Modified contract accepting AKT ERC-20 tokens
- Full implementation with comments

**hardhat.config.cronos.ts:**
- Complete Hardhat configuration for Cronos
- Network settings (mainnet, testnet)
- AKT token address constants

**deploy-cronos.ts:**
- Deployment script for Cronos
- Verification steps
- Testing instructions

### References (references/)

**cronos-documentation.md:**
- Links to all official Cronos documentation
- Developer resources
- Community channels

**akt-token-addresses.md:**
- Mainnet contract addresses
- Testnet contract addresses
- Token metadata

**bridge-security.md:**
- Security audit links
- Known vulnerabilities
- Risk mitigation strategies

---

## Success Criteria

This research achieves its objective if it provides:

1. ✅ **Clear feasibility verdict** (Can we do this? Yes/No)
2. ✅ **Concrete effort estimate** (Hours to modify vs CosmWasm approach)
3. ✅ **Working proof of concept** (Contract address on Cronos testnet OR clear blocker identified)
4. ✅ **AKT token integration confirmed** (Token address + usage examples)
5. ✅ **Strategic recommendation** (Cronos, Multi-chain, or CosmWasm - with rationale)

**Red Flags (should trigger rejection of Cronos approach):**
- Cronos doesn't support Solidity ^0.8.20
- AKT token not available on Cronos (no IBC bridge working)
- Gas costs > $0.50 per transaction (too expensive for micropayments)
- Major security issues with IBC bridge (unaudited, exploit history)
- Contract modifications > 20 hours (approaching CosmWasm rewrite effort)

**Green Lights (strong signals to proceed):**
- Example payment channel contracts already deployed on Cronos
- AKT actively used in Cronos DeFi ecosystem
- Gas costs < $0.05 per transaction
- BasePaymentChannel.sol deploys with < 5 hours of modifications
- Official Cronos documentation is comprehensive

---

## Timeline and Priority

**Priority: CRITICAL** - Blocks Epic 3 Story 3.6 and may invalidate Stories 3.1-3.5

**Suggested Timeline:**
- **Phase 1 (1 hour):** Cronos EVM compatibility verification
- **Phase 2 (2 hours):** AKT token research + IBC bridge investigation
- **Phase 3 (2 hours):** Code modification planning (contract diff analysis)
- **Phase 4 (1 hour):** Deployment testing on Cronos testnet (if feasible)
- **Phase 5 (30 min):** Strategic recommendation writeup

**Total Estimated Time:** 6.5 hours

---

## Next Steps After Research

**If Cronos is viable (recommended):**
1. **Update Epic 3 plan:**
   - Archive Stories 3.1-3.5 (CosmWasm work)
   - Create new Story 3.X: "Deploy BasePaymentChannel.sol to Cronos"
   - Reuse Story 2.6 pattern (Dassie settlement module for Cronos)

2. **Modification checklist:**
   - Update contract to accept ERC-20 AKT instead of ETH
   - Update tests for AKT token mocking
   - Create Cronos deployment script
   - Deploy to Cronos testnet
   - Verify on CronoScan

3. **Documentation updates:**
   - Add IBC bridge user guide to operator docs
   - Update architecture diagrams (remove CosmWasm, add Cronos)

**If Cronos is NOT viable:**
1. Continue with CosmWasm approach (Epic 3 as-is)
2. Research alternative Cosmos chains (Osmosis, Juno) for CosmWasm deployment
3. Accept that AKT support requires separate CosmWasm contract stack

**If BOTH are viable (multi-chain strategy):**
1. Deploy BasePaymentChannel.sol to Cronos for AKT
2. Keep existing Base L2 deployment for ETH
3. Consider adding Polygon, Arbitrum, etc. for wider token support
4. Epic 3 CosmWasm work becomes optional/future enhancement

---

## Research Execution Instructions

1. **Create folder structure** in `docs/research/cronos-akt-deployment/` as specified above
2. **Start with Phase 1:** EVM compatibility research
3. **Use WebSearch and WebFetch** to gather official documentation
4. **Document all findings** in the appropriate markdown files
5. **Create code examples** if Cronos is deemed viable
6. **Synthesize final recommendation** in README.md
7. **Present findings** to user with clear action items

---

**Execute this research systematically and document all findings in the specified folder structure.**
