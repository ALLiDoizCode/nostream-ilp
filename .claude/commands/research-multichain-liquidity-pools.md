# /research-multichain-liquidity-pools Task

When this command is used, execute the following task:

<!-- Powered by BMAD™ Core -->

# Multi-Chain Payment Channel Liquidity Pools Deep Research Task

This task executes comprehensive research into cross-chain offchain liquidity pools for funding ILP connectors across Bitcoin, Ethereum/EVM, and Solana using payment channel primitives with built-in asset swapping capabilities.

## Purpose

Design and evaluate architectures for cross-chain offchain liquidity pools that enable liquidity providers to fund ILP connectors across Bitcoin, Ethereum/EVM, and Solana ecosystems using payment channel primitives, with built-in asset swapping capabilities.

## Research Output Structure

CRITICAL: All research outputs MUST be organized in the following folder structure:

```
docs/
└── research/
    └── multichain-liquidity-pools/
        ├── README.md                          # Research overview and navigation
        ├── executive-summary.md               # Key findings and go/no-go recommendation
        ├── architecture-proposal.md           # Recommended pool architecture design
        ├── payment-channels/
        │   ├── bitcoin-lightning-survey.md    # Lightning Network pooling mechanisms
        │   ├── ethereum-state-channels.md     # Raiden, Connext, Nitro analysis
        │   ├── solana-channels.md             # Solana payment channel research
        │   └── comparison-matrix.md           # Side-by-side channel comparison
        ├── offchain-swapping/
        │   ├── htlc-atomic-swaps.md           # HTLC-based cross-chain swaps
        │   ├── submarine-swaps.md             # Lightning Loop and similar protocols
        │   ├── offchain-amm-designs.md        # AMM logic in offchain contexts
        │   └── swap-mechanism-tradeoffs.md    # Performance and security comparison
        ├── pool-architectures/
        │   ├── centralized-spoke-model.md     # LSP-style pooling (Option A)
        │   ├── decentralized-mesh-model.md    # Raiden-style routing (Option B)
        │   ├── tee-hybrid-model.md            # nilCC-secured pooling (Option C)
        │   └── architecture-comparison.md     # Detailed tradeoff analysis
        ├── ilp-integration/
        │   ├── connector-interface-design.md  # Pool ↔ connector API
        │   ├── liquidity-provisioning.md      # How connectors access pool funds
        │   ├── debt-tracking-integration.md   # Integration with BIMP debt system
        │   └── presigned-batch-compat.md      # Pre-signed packet integration
        ├── cross-chain/
        │   ├── bridge-mechanisms.md           # Cross-chain bridge security models
        │   ├── settlement-finality.md         # Handling BTC/ETH/SOL differences
        │   ├── wrapped-assets.md              # wBTC, wETH strategies
        │   └── ibc-compatibility.md           # Inter-Blockchain Communication
        ├── security/
        │   ├── trust-models.md                # Custody and multi-party trust
        │   ├── attack-vectors.md              # Griefing, frontrunning, jamming
        │   ├── tee-security-enhancement.md    # nilCC security benefits
        │   └── dispute-resolution.md          # Multi-party dispute handling
        ├── economics/
        │   ├── capital-efficiency.md          # Locked capital vs routing capacity
        │   ├── lp-incentive-design.md         # Fee structures and rewards
        │   ├── impermanent-loss-modeling.md   # Risk analysis for LPs
        │   └── rebalancing-strategies.md      # Automated rebalancing (nilAI)
        ├── implementation/
        │   ├── existing-projects.md           # Lightning Pool, Liquality, Hop
        │   ├── performance-benchmarks.md      # TPS, latency, capital requirements
        │   ├── integration-roadmap.md         # Phased implementation approach
        │   └── prototype-recommendations.md   # Next steps for proof-of-concept
        └── appendices/
            ├── glossary.md                    # Payment channel and DeFi terms
            ├── bolt-specifications.md         # Relevant Lightning BOLTs
            ├── regulatory-considerations.md   # Money transmitter and compliance
            └── sources.md                     # All research sources cited
```

## Background Context

### BIMP Protocol Context

- **Current Architecture**: ILP connector built on Dassie fork
- **Settlement Layer**: Lightning Network (Bitcoin) only currently
- **Per-peer Model**: Individual payment channels with debt tracking
- **Innovation**: Pre-signed packet batching for zero-latency micropayments
- **Performance Targets**: 1,000+ TPS per channel, sub-100ms latency

### Problem Statement

ILP connectors require liquidity in multiple assets to route cross-chain payments. Current model requires separate channels per peer per asset, leading to:

- **High Capital Lockup**: Dedicated channels tie up funds
- **Poor Capital Efficiency**: Idle balances in underutilized channels
- **Limited Cross-Chain Routing**: Manual cross-chain liquidity management
- **Complex Rebalancing**: Manual intervention required frequently

### Desired Solution Characteristics

Offchain liquidity pools that:
1. Accept deposits from multiple liquidity providers (pooled capital)
2. Enable efficient asset swapping (BTC ↔ ETH ↔ SOL) offchain
3. Provide liquidity to ILP connectors for packet routing
4. Minimize on-chain transactions and settlement latency
5. Integrate with BIMP's pre-signed batching system
6. Leverage nilCC TEE for enhanced security

## Research Questions

### Primary Questions (Must Answer)

#### 1. Payment Channel Pooling Models

**Investigation Focus:**
- How can multiple LPs contribute to a shared payment channel or channel network?
- What are the trust/custody models for multi-party channels (virtual channels, channel factories, shared UTXOs)?
- How does Lightning Network support multi-party liquidity (Lightning Pools, LSPs, Pool2)?
- What are the Ethereum equivalents (Raiden, Connext, Nitro)?
- Does Solana have production-ready payment channel infrastructure?

**Deliverable:** `payment-channels/comparison-matrix.md` with detailed comparison table

#### 2. Offchain Swapping Mechanisms

**Investigation Focus:**
- How can atomic swaps work within payment channel constraints?
- Can AMM logic execute offchain with channel-backed liquidity?
- What are the options for cross-chain swaps using HTLCs across BTC/ETH/SOL channels?
- How do submarine swaps and channel-based DEXes (e.g., Sparkswap) work?
- Can pre-signed packet batching integrate with swap execution?

**Deliverable:** `offchain-swapping/swap-mechanism-tradeoffs.md` with pros/cons analysis

#### 3. ILP Connector Integration

**Investigation Focus:**
- Should the liquidity pool itself act as an ILP connector peer?
- How do connectors withdraw/deposit liquidity from the pool?
- Can the pool provide "liquidity as a service" to multiple connectors?
- How does debt tracking work with pooled vs. dedicated liquidity?
- What's the interaction model between BIMP's settlement layer and the pool?

**Deliverable:** `ilp-integration/connector-interface-design.md` with API specifications

#### 4. Capital Efficiency & Rebalancing

**Investigation Focus:**
- How to minimize locked capital while ensuring routing liquidity?
- What rebalancing algorithms work for offchain pools (vs onchain AMMs)?
- How does ILP packet flow affect pool balance distribution?
- Can machine learning optimize pool rebalancing (nilAI integration)?
- What are the fee structures that incentivize LPs while maintaining competitiveness?

**Deliverable:** `economics/capital-efficiency.md` with efficiency metrics and models

#### 5. Cross-Chain Architecture

**Investigation Focus:**
- How to bridge payment channels across Bitcoin, Ethereum, and Solana?
- What are the security tradeoffs of different bridge approaches (HTLCs, optimistic bridges, threshold signatures)?
- Can IBC (Inter-Blockchain Communication) or similar protocols help?
- How do settlement finality differences (Bitcoin PoW vs ETH PoS vs Solana) affect pool design?
- What role could wrapped assets play (wBTC on Ethereum, etc.)?

**Deliverable:** `cross-chain/bridge-mechanisms.md` with security analysis

#### 6. Security & Trust Model

**Investigation Focus:**
- How to prevent malicious LPs from stealing pooled funds?
- What cryptographic proofs ensure fair LP share distribution?
- How does TEE deployment (nilCC) enhance security for pool operations?
- What are the attack vectors (griefing, frontrunning swaps, channel jamming)?
- How to handle dispute resolution in multi-party offchain pools?

**Deliverable:** `security/attack-vectors.md` with mitigation strategies

### Secondary Questions (Important Context)

#### 7. Technical Implementation Details

**Investigation Focus:**
- What are the specific channel protocols (BOLT specs, ERC standards, Solana programs)?
- How do existing projects implement similar functionality (Lightning Pool, Raiden network, Liquality)?
- What are the performance benchmarks (TPS, latency, capital requirements)?
- How do different signature schemes (ECDSA, Schnorr, EdDSA) affect design?

**Deliverable:** `implementation/existing-projects.md` with code repository analysis

#### 8. Regulatory & Compliance

**Investigation Focus:**
- Does pooled liquidity trigger money transmitter licensing?
- How do KYC/AML requirements differ by jurisdiction for automated pools?
- What disclosures are needed for LP risk (impermanent loss, channel force-closures)?

**Deliverable:** `appendices/regulatory-considerations.md` with jurisdictional analysis

#### 9. Economic Modeling

**Investigation Focus:**
- What LP incentive models maximize pool liquidity while minimizing connector costs?
- How to model impermanent loss in offchain swapping environments?
- What fee distribution mechanisms are fair and gas-efficient?

**Deliverable:** `economics/lp-incentive-design.md` with game-theoretic analysis

## Research Methodology

### Information Sources

#### Primary Sources (High Priority)
- Bitcoin Lightning Network specifications (BOLTs 1-11)
- Ethereum state channel research (Raiden Network, Connext, Nitro Protocol)
- Solana documentation on payment channels/state compression
- ILP RFCs and Interledger specifications
- Academic papers on payment channel networks (PCNs)

#### Secondary Sources (Supporting Context)
- Lightning Pool documentation (Lightning Labs)
- Liquality Network (cross-chain atomic swaps)
- Hop Protocol (cross-chain bridges + AMMs)
- Existing multi-party channel research (channel factories, virtual channels)
- DeFi liquidity pool literature (Uniswap V3, Balancer, Curve)

#### Code Repositories (Implementation Reference)
- Lightning Network Daemon (LND)
- c-lightning / Core Lightning
- Raiden Network
- Connext Vector
- Solana Sealevel programs for payment channels

### Analysis Frameworks

#### Comparison Criteria

Use these criteria to evaluate all architectural options:

1. **Capital Efficiency**: Ratio of locked capital to routing capacity
2. **Transaction Throughput**: Sustained TPS and burst capacity
3. **Latency**: End-to-end payment finality time
4. **Security Guarantees**: Trust assumptions and cryptographic proofs
5. **Implementation Complexity**: Engineering effort and risk
6. **Integration Effort**: Compatibility with BIMP architecture
7. **Operational Costs**: On-chain fees, watchtower costs, infrastructure

#### Evaluation Methodology

Follow this systematic process:

1. **Map Payment Channel Primitives**: Survey available primitives on BTC/ETH/SOL
2. **Identify Multi-Party Implementations**: Find production-ready pooling solutions
3. **Analyze Offchain Swap Mechanisms**: Deep dive on atomic swap protocols
4. **Model Capital Efficiency**: Create spreadsheet models for different architectures
5. **Evaluate Security Tradeoffs**: Threat model each architecture variant
6. **Assess BIMP Integration**: Map integration points with existing codebase
7. **Synthesize Recommendations**: Distill findings into actionable architecture

## Expected Deliverables

### Executive Summary (`executive-summary.md`)

**Required Sections:**

1. **Key Findings** (1-2 pages)
   - Top 5 insights about offchain liquidity pooling feasibility
   - Critical technical blockers identified (if any)
   - Surprising discoveries or paradigm shifts

2. **Recommended Architecture** (1 page)
   - High-level design for BIMP liquidity pools
   - Justification for recommendation
   - Visual architecture diagram

3. **Go/No-Go Assessment** (1 page)
   - Clear recommendation: Proceed, Pivot, or Table
   - Risk assessment and mitigation strategies
   - Confidence level and key uncertainties

4. **Next Steps** (1 page)
   - Immediate action items
   - Phased implementation approach
   - Resource requirements (time, team, capital)

### Architectural Proposal (`architecture-proposal.md`)

**Required Sections:**

1. **System Architecture**
   - Component diagram showing all system elements
   - Data flow diagrams for key operations (deposit, swap, withdrawal, routing)
   - Interface specifications between components

2. **Technology Stack**
   - Recommended payment channel protocols per chain
   - Smart contract or program requirements
   - Off-chain infrastructure (watchtowers, monitoring)

3. **Integration Design**
   - How liquidity pool integrates with BIMP ILP connector
   - API specifications for connector ↔ pool communication
   - Pre-signed batch compatibility approach

4. **Security Model**
   - Threat model and attack surface analysis
   - Cryptographic primitives and proof systems
   - TEE integration points for nilCC

5. **Operational Model**
   - Liquidity provider onboarding flow
   - Rebalancing triggers and algorithms
   - Monitoring and alerting requirements

### Comparison Matrices

#### Payment Channel Comparison (`payment-channels/comparison-matrix.md`)

| Feature | Bitcoin Lightning | Ethereum Raiden/Connext | Solana Channels |
|---------|------------------|------------------------|----------------|
| Multi-party support | Lightning Pool, LSPs | Virtual channels | TBD |
| Maturity | Production | Beta/Experimental | Research |
| Throughput | X TPS | Y TPS | Z TPS |
| Finality time | X seconds | Y seconds | Z seconds |
| Capital efficiency | ... | ... | ... |
| Cross-chain support | Submarine swaps | Connext bridge | ... |

*Fill in all cells with research findings*

#### Architecture Tradeoff Matrix (`pool-architectures/architecture-comparison.md`)

| Architecture | Capital Efficiency | Security | Complexity | BIMP Integration | Score |
|-------------|-------------------|----------|------------|-----------------|-------|
| Centralized Spoke (LSP) | High | Medium | Low | Easy | X/10 |
| Decentralized Mesh | Medium | High | High | Medium | Y/10 |
| TEE-Hybrid | High | Very High | Medium | Medium | Z/10 |

*Provide weighted scoring methodology*

### Implementation Roadmap (`implementation/integration-roadmap.md`)

**Required Phases:**

**Phase 1: Proof of Concept (4-8 weeks)**
- Build single-chain pool prototype (Bitcoin Lightning)
- Integrate with BIMP connector on testnet
- Validate capital efficiency assumptions

**Phase 2: Cross-Chain Expansion (8-12 weeks)**
- Add Ethereum state channel support
- Implement offchain swap mechanism
- Test cross-chain routing flows

**Phase 3: Production Hardening (12-16 weeks)**
- Security audits (smart contracts + off-chain logic)
- nilCC TEE integration
- Monitoring and alerting infrastructure

**Phase 4: Mainnet Launch (Ongoing)**
- Gradual liquidity ramp-up
- Performance optimization
- LP incentive tuning

### Supporting Materials

#### Technical Deep Dives

- `payment-channels/bitcoin-lightning-survey.md`: Comprehensive Lightning pooling analysis
- `offchain-swapping/htlc-atomic-swaps.md`: HTLC protocol specifications and examples
- `cross-chain/bridge-mechanisms.md`: Security models for cross-chain bridges

#### Code References

- `implementation/existing-projects.md`: Links to relevant GitHub repositories
- `appendices/bolt-specifications.md`: Relevant BOLT specs with annotations
- Code snippets demonstrating key integration points

#### Visual Diagrams

- System architecture diagrams (component, sequence, deployment)
- Data flow diagrams for deposit, swap, withdraw, route operations
- Attack tree diagrams for security analysis

## Success Criteria

Research is successful if it delivers:

✅ **Feasibility Assessment**: Clear understanding of payment channel pooling viability across BTC/ETH/SOL

✅ **Actionable Recommendation**: Specific architectural proposal with justified tradeoffs OR clear rationale for not proceeding

✅ **Risk Identification**: Critical technical blockers, security concerns, and regulatory risks identified

✅ **Implementation Roadmap**: Concrete phased approach if architecture is viable

✅ **Performance Alignment**: Validation that proposed architecture can meet BIMP's goals (1000+ TPS, sub-100ms latency)

✅ **Capital Efficiency Model**: Quantitative analysis showing capital efficiency improvements over current per-peer channel model

✅ **Security Analysis**: Comprehensive threat model with mitigation strategies, especially TEE integration points

## Timeline and Priority

### Phase 1: Payment Channel Primitives Survey (High Priority - Week 1)

**Tasks:**
- Survey Bitcoin Lightning pooling mechanisms (Lightning Pool, LSPs, channel factories)
- Research Ethereum state channel networks (Raiden, Connext, Nitro)
- Investigate Solana payment channel status and maturity
- Create comparison matrix

**Deliverables:**
- `payment-channels/bitcoin-lightning-survey.md`
- `payment-channels/ethereum-state-channels.md`
- `payment-channels/solana-channels.md`
- `payment-channels/comparison-matrix.md`

### Phase 2: Multi-Party Channel Architectures (High Priority - Week 1-2)

**Tasks:**
- Deep dive on Lightning Network channel factories and virtual channels
- Analyze LSP (Lightning Service Provider) models
- Research Raiden mesh network topology
- Evaluate Connext router architecture

**Deliverables:**
- `pool-architectures/centralized-spoke-model.md`
- `pool-architectures/decentralized-mesh-model.md`
- `pool-architectures/tee-hybrid-model.md`

### Phase 3: Offchain Swapping Mechanisms (Medium Priority - Week 2)

**Tasks:**
- HTLC-based atomic swap protocols
- Submarine swap analysis (Lightning Loop, Boltz)
- AMM logic in offchain contexts
- Pre-signed batch compatibility assessment

**Deliverables:**
- `offchain-swapping/htlc-atomic-swaps.md`
- `offchain-swapping/submarine-swaps.md`
- `offchain-swapping/offchain-amm-designs.md`
- `offchain-swapping/swap-mechanism-tradeoffs.md`

### Phase 4: ILP Integration & Capital Efficiency (Medium Priority - Week 2-3)

**Tasks:**
- Design connector ↔ pool interface
- Model capital efficiency scenarios
- Analyze debt tracking integration
- Design rebalancing algorithms

**Deliverables:**
- `ilp-integration/connector-interface-design.md`
- `economics/capital-efficiency.md`
- `economics/rebalancing-strategies.md`

### Phase 5: Security, Cross-Chain, Economics (Lower Priority - Week 3)

**Tasks:**
- Comprehensive threat modeling
- Cross-chain bridge security analysis
- LP incentive mechanism design
- Regulatory landscape survey

**Deliverables:**
- `security/attack-vectors.md`
- `cross-chain/bridge-mechanisms.md`
- `economics/lp-incentive-design.md`
- `appendices/regulatory-considerations.md`

### Final Synthesis (Week 3-4)

**Tasks:**
- Write executive summary
- Create architecture proposal
- Build implementation roadmap
- Assemble all deliverables

**Deliverables:**
- `executive-summary.md`
- `architecture-proposal.md`
- `implementation/integration-roadmap.md`
- `README.md` (navigation and overview)

## Special Instructions

### Use Available MCP Tools

CRITICAL: This project has MCP (Model Context Protocol) documentation servers configured. Use them extensively:

- **Dassie Docs**: `mcp__dassie_Docs__*` tools for BIMP/Dassie architecture research
- **Open Payments Docs**: `mcp__open-payments_Docs__*` for ILP payment integration
- **Interledger Org**: `mcp__interledger_org-v4_Docs__*` for ILP specifications
- **Rafiki Docs**: `mcp__rafiki_Docs__*` for Rafiki connector architecture

**Example Usage:**
```
mcp__dassie_Docs__search_dassie_documentation("lightning settlement")
mcp__interledger_org-v4_Docs__search_interledger_org_docs("ILP connector liquidity")
```

### Code Analysis Integration

- Read relevant BIMP source files to understand current architecture
- Key files to analyze:
  - `packages/app-dassie/src/ledgers/modules/lightning/lightning.ts` (current Lightning integration)
  - `packages/app-dassie/src/batch-signing/batch-signer.ts` (pre-signed batching)
  - `packages/app-dassie/src/accounting/functions/process-settlement.ts` (settlement accounting)
- Reference specific line numbers when discussing integration points

### Research Quality Standards

- **Cite All Sources**: Every claim must have a citation in `appendices/sources.md`
- **Code Over Theory**: Prefer analyzing real implementations over theoretical papers
- **Quantitative Analysis**: Include benchmarks, metrics, and numerical comparisons
- **Visual Communication**: Create diagrams for complex concepts
- **Actionable Output**: Every section should lead to concrete decisions or next steps

## Final Note

This research will determine whether BIMP pursues multi-chain liquidity pooling or focuses on optimizing the current per-peer Lightning channel model. The deliverables should provide enough detail to make a confident architectural decision and begin implementation planning.

**Decision Outcomes:**
1. **Proceed**: Clear architectural recommendation with implementation roadmap
2. **Pivot**: Alternative liquidity strategy identified (e.g., onchain AMMs with fast withdrawals)
3. **Table**: Insufficient technology maturity, revisit in 6-12 months with specific triggers

The executive summary should make the decision obvious to any technical stakeholder reviewing the research.
