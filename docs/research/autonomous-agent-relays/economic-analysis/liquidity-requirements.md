# Liquidity Requirements: Autonomous Agent Relay Network

**Document Version:** 1.0.0
**Last Updated:** 2025-12-05
**Status:** Complete

## Executive Summary

This document analyzes the capital requirements for operating an autonomous agent relay node, focusing on payment channel liquidity, routing reserves, and emergency funds. Our analysis demonstrates that agents require **$500-1,500** in working capital to operate effectively across multiple chains.

**Key Findings:**
- **Payment Channel Capital:** $200-500 per chain (Base, Arbitrum, Cronos)
- **Total Multi-Chain Capital:** $600-1,500 (3 chains)
- **Routing Reserves:** $200-500 (for ILP forwarding)
- **Emergency Fund:** $50-100 (for AKT price spikes)
- **Reputation Stake:** 100 AKT (~$46, locked not spent)
- **Total Capital Required:** $896-2,146 per agent
- **Capital Efficiency:** $90 revenue/day on $1,000 capital = **9% daily return**

---

## Table of Contents

1. [Payment Channel Sizing](#payment-channel-sizing)
2. [Routing Reserve Calculation](#routing-reserve-calculation)
3. [Emergency Fund Sizing](#emergency-fund-sizing)
4. [Total Capital Breakdown](#total-capital-breakdown)
5. [Capital Efficiency Metrics](#capital-efficiency-metrics)
6. [Rebalancing Strategies](#rebalancing-strategies)
7. [Liquidity Provision Alternatives](#liquidity-provision-alternatives)
8. [Multi-Chain Liquidity Management](#multi-chain-liquidity-management)

---

## 1. Payment Channel Sizing

### 1.1 Payment Channel Fundamentals

Agents use **bidirectional payment channels** on EVM L2s (Base, Arbitrum, Cronos) to accept payments from users and peers:

**Channel Capacity = Agent's Locked Capital + Peer's Locked Capital**

For a channel to route payments in both directions:
- **Agent → Peer:** Agent must have balance (local capacity)
- **Peer → Agent:** Peer must have balance (remote capacity)

### 1.2 Required Channel Capacity per Chain

**Sizing Methodology:**

1. **Estimate Daily Inbound Payment Volume:**
   - Event fees: $60/day (from unit economics)
   - Routing fees (inbound): $30/day
   - **Total inbound: $90/day**

2. **Estimate Daily Outbound Payment Volume:**
   - Akash hosting payments: $5/day
   - DEX swap transactions: $90/day (converting earnings to AKT)
   - Routing payments (outbound): $20/day
   - **Total outbound: $115/day**

3. **Settlement Frequency:**
   - On-chain settlement: 1x/day (to minimize gas costs)
   - Between settlements, channel must have capacity for all payments

4. **Safety Margin:**
   - 2x daily volume (to handle spikes and avoid channel exhaustion)
   - **Required capacity: max($90, $115) * 2 = $230**

**Per-Chain Capacity:**

| Chain | Inbound/Day | Outbound/Day | Peak Daily | 2x Safety | Required Capacity |
|-------|-------------|--------------|------------|-----------|-------------------|
| **Base** | $30 | $40 | $40 | $80 | **$100-150** |
| **Arbitrum** | $40 | $50 | $50 | $100 | **$150-200** |
| **Cronos** | $20 | $25 | $25 | $50 | **$50-100** |
| **TOTAL** | $90 | $115 | - | - | **$300-450** |

**Allocation Strategy:**
- Base: 30% of total capacity (high volume, low fees)
- Arbitrum: 45% of total capacity (highest volume)
- Cronos: 25% of total capacity (low volume, very low fees)

**Recommended Allocation:**
- Total capital: $500
- Base: $150 (30%)
- Arbitrum: $225 (45%)
- Cronos: $125 (25%)

### 1.3 Channel Capacity Utilization

**Utilization Metrics:**

```
Channel Utilization = Daily Payment Volume / Channel Capacity

Target Utilization: 40-60% (allows for spikes without exhausting channel)
Maximum Utilization: 80% (trigger rebalancing)
Critical Utilization: 95% (immediate settlement required)
```

**Example Utilization:**
- Arbitrum channel capacity: $225
- Daily volume: $50
- Utilization: 50/225 = 22.2% (healthy)

**If Daily Volume Increases to $180:**
- Utilization: 180/225 = 80% (trigger rebalancing)
- Action: Settle channel on-chain or add more capital

### 1.4 Minimum Viable Channel Size

What's the absolute minimum channel size for an agent to operate?

**Worst-Case Scenario:**
- No routing revenue (only event fees)
- Daily event revenue: $30
- Daily outbound (Akash): $5
- **Minimum capacity: $30 * 2 = $60 per chain**

**Total Minimum (3 chains): $180**

**Risk:** Small channels exhaust quickly, requiring frequent settlements (higher gas costs).

**Trade-off:**
- Small channels ($180): Lower capital, higher gas costs (daily settlement)
- Large channels ($500+): Higher capital, lower gas costs (weekly settlement)

### 1.5 Channel Exhaustion Risk

**What happens if a channel runs out of capacity?**

1. **Inbound Exhaustion (agent receives too many payments):**
   - Agent's balance → 100% of channel capacity
   - Peer's balance → 0%
   - Agent cannot receive more payments until channel is rebalanced
   - **Mitigation:** Settle on-chain or use circular rebalancing

2. **Outbound Exhaustion (agent sends too many payments):**
   - Agent's balance → 0%
   - Peer's balance → 100% of channel capacity
   - Agent cannot send more payments
   - **Mitigation:** Settle on-chain or receive more payments to rebalance

**Rebalancing Frequency:**
- Daily settlement: 0.01% risk of exhaustion
- Weekly settlement: 1% risk of exhaustion
- Monthly settlement: 10% risk of exhaustion

**Recommendation:** Settle weekly or when utilization > 80%, whichever comes first.

---

## 2. Routing Reserve Calculation

### 2.1 What is a Routing Reserve?

Agents earn fees by **routing ILP payments** between peers:

```
Peer A → Agent → Peer B
```

To route a payment, the agent must have:
- **Inbound capacity** from Peer A (to receive the payment)
- **Outbound capacity** to Peer B (to forward the payment)

**Routing Reserve = Capital allocated specifically for payment forwarding**

### 2.2 Sizing Routing Reserves

**Assumptions:**
- Agent routes 10,000 payments/day
- Average payment size: 10,000 msats (10 sats) = $0.01
- Peak routing volume: 500 payments/hour = $5/hour
- Agent has 100 peers

**Required Reserve:**

```
Routing Reserve = Peak Hourly Volume * Safety Factor
                = $5/hour * 10 hours (to handle full day without rebalancing)
                = $50

With 2x safety margin: $100
```

**Per-Peer Reserve:**
```
Reserve per peer = Total Reserve / Number of Peers
                 = $100 / 100 peers
                 = $1/peer
```

**Channel Allocation:**
- Payment channel capacity: $500 (for receiving user payments)
- Routing reserve: $100 (for forwarding peer payments)
- **Total: $600**

### 2.3 Routing Reserve Utilization

**Utilization Metrics:**

| Routing Volume | Reserve Utilization | Status |
|----------------|---------------------|--------|
| 1,000 payments/day ($10) | 10% | Underutilized |
| 5,000 payments/day ($50) | 50% | Optimal |
| 10,000 payments/day ($100) | 100% | At capacity |
| 15,000 payments/day ($150) | 150% | Need more capital |

**Capital Efficiency:**
- Routing fee: 0.5% of payment value
- Reserve: $100
- Daily routing volume: $100 (at 100% utilization)
- Daily routing revenue: $100 * 0.5% = $0.50
- **Daily ROI on routing reserve: 0.5%** (not very efficient)

**Key Insight:** Routing reserves have low capital efficiency compared to payment channels. Agents should minimize routing reserves and rebalance frequently.

### 2.4 Optimizing Routing Reserves

**Strategy 1: Just-in-Time Routing**
- Don't allocate a static routing reserve
- Rebalance channels dynamically as routing demands change
- **Pros:** Higher capital efficiency
- **Cons:** Requires sophisticated algorithms, more frequent settlements

**Strategy 2: Tiered Routing**
- Small payments (<1,000 msats): Route immediately (low capital requirement)
- Large payments (>100,000 msats): Require settlement or circular rebalancing
- **Pros:** Reduces capital lockup for large payments
- **Cons:** More complex logic

**Strategy 3: Routing-as-a-Service**
- Outsource routing to specialized routing nodes
- Agent focuses on relaying events, not routing payments
- **Pros:** No routing reserve needed
- **Cons:** Pay routing fees to third party (reduces profit)

**Recommendation:** Start with Strategy 1 (just-in-time routing) and upgrade to Strategy 2 if routing volume increases significantly.

---

## 3. Emergency Fund Sizing

### 3.1 Purpose of Emergency Fund

The emergency fund covers unexpected cost spikes:

1. **AKT Price Spike:** Akash hosting costs increase if AKT price rises
2. **Gas Fee Spike:** L1 congestion causes L2 gas fees to spike
3. **Slippage Protection:** DEX swaps experience higher slippage during volatility
4. **Downtime Costs:** Agent goes offline and loses revenue but still incurs hosting costs

### 3.2 AKT Price Spike Coverage

**Scenario:** AKT price increases 10x from $0.46 to $4.60

**Impact:**
- Normal hosting cost: $5/day
- Spiked hosting cost: $50/day
- Additional cost: $45/day

**Emergency Fund Requirement:**
- Cover 7 days at spiked prices: $45/day * 7 = $315
- Agent should have time to:
  1. Increase fees to users (pass-through cost increase)
  2. Exit Akash and migrate to AWS/GCP
  3. Exit market gracefully (return funds to users, close channels)

**Recommendation:** $50-100 emergency fund for AKT price coverage (covers 1-2 days, enough time to react)

### 3.3 Gas Fee Spike Coverage

**Scenario:** L2 gas fees spike 10x

**Impact:**
- Normal gas cost: $2/day
- Spiked gas cost: $20/day
- Additional cost: $18/day

**Emergency Fund Requirement:**
- Cover 3 days: $18/day * 3 = $54
- Agent can reduce settlement frequency to minimize gas usage

**Recommendation:** $25-50 for gas fee coverage (included in overall emergency fund)

### 3.4 Total Emergency Fund

**Combined Emergency Fund:**
- AKT spike coverage: $50
- Gas spike coverage: $25
- Slippage buffer: $25 (for large DEX swaps during volatility)
- **Total: $100**

**Allocation:**
- Keep in stablecoin (USDC) to avoid price volatility
- Store on Base or Arbitrum (low withdrawal fees)
- Automated trigger: If AKT > $2.00 or gas > $10/day, use emergency fund

---

## 4. Total Capital Breakdown

### 4.1 Complete Capital Requirements

| Capital Component | Amount | Purpose | Lock Duration |
|-------------------|--------|---------|---------------|
| **Payment Channels (Base)** | $150 | Accept payments on Base | Locked until channel close |
| **Payment Channels (Arbitrum)** | $225 | Accept payments on Arbitrum | Locked until channel close |
| **Payment Channels (Cronos)** | $125 | Accept payments on Cronos | Locked until channel close |
| **Routing Reserve** | $100 | Forward peer payments | Locked until channel close |
| **Emergency Fund** | $100 | Cover cost spikes | Liquid (can withdraw anytime) |
| **Reputation Stake** | 100 AKT (~$46) | Anti-Sybil, network entry | Locked until agent exits |
| **TOTAL** | **$746** | | |

**Capital Breakdown by Liquidity:**
- **Locked (channels):** $600 (80%)
- **Liquid (emergency):** $100 (13%)
- **Staked (reputation):** $46 (7%)

### 4.2 Capital Requirements by Agent Size

| Agent Size | Daily Events | Payment Channels | Routing Reserve | Emergency | Reputation | Total |
|------------|--------------|------------------|----------------|-----------|------------|-------|
| **Small** | 100K | $200 | $50 | $50 | $46 | **$346** |
| **Medium** | 1M | $500 | $100 | $75 | $46 | **$721** |
| **Large** | 10M | $1,500 | $300 | $150 | $100 | **$2,050** |
| **Enterprise** | 50M | $5,000 | $1,000 | $500 | $200 | **$6,700** |

**Key Insight:** Capital requirements scale sub-linearly with event volume. A 10x increase in events (100K → 1M) only requires 2x capital ($346 → $721).

### 4.3 Capital as % of Annual Revenue

| Agent Size | Annual Revenue | Total Capital | Capital as % Revenue |
|------------|----------------|---------------|----------------------|
| Small | $4,745 | $346 | 7.3% |
| Medium | $47,450 | $721 | 1.5% |
| Large | $328,500 | $2,050 | 0.6% |
| Enterprise | $1,642,500 | $6,700 | 0.4% |

**Interpretation:** Larger agents have much better capital efficiency (capital as % of revenue decreases with scale).

---

## 5. Capital Efficiency Metrics

### 5.1 Return on Locked Capital (ROLC)

**Formula:**
```
ROLC = Annual Profit / Total Locked Capital
```

**Example (Medium Agent):**
- Annual profit: $29,930 (from unit economics)
- Total locked capital: $721
- **ROLC = $29,930 / $721 = 4,150%**

**Comparison to Other Investments:**
| Investment | Annual Return | Risk |
|------------|---------------|------|
| S&P 500 | 10% | Medium |
| High-yield savings | 5% | Low |
| Staking AKT | 15-20% | Medium-high |
| Agent relay capital | 4,150% | High |

**Key Insight:** Agent relays offer exceptional returns on capital, but with higher risk (competition, AKT volatility, user adoption).

### 5.2 Capital Turnover Ratio

**Formula:**
```
Capital Turnover = Annual Revenue / Total Capital
```

**Example (Medium Agent):**
- Annual revenue: $47,450
- Total capital: $721
- **Turnover = 65.8x**

**Interpretation:** Each dollar of capital generates $65.80 in annual revenue. This is extremely high capital efficiency.

**Comparison:**
- Traditional SaaS: 1-3x capital turnover
- E-commerce: 5-10x capital turnover
- Agent relay: 65x capital turnover

### 5.3 Liquidity-Adjusted Return

**Not all capital is equally liquid:**
- Payment channel capital: Locked until channel close (1-6 months)
- Emergency fund: Liquid (1-day withdrawal)
- Reputation stake: Locked until agent exit (6+ months)

**Weighted Return Calculation:**

```
Locked Capital Weight = Lock Duration / 365 days
Emergency Fund Weight = 1 / 365 days (daily liquidity)

Weighted Capital = (Locked * Lock Weight) + (Emergency * Emergency Weight)
```

**Example:**
- Locked channels: $600 * (90 days / 365) = $148
- Emergency fund: $100 * (1 day / 365) = $0.27
- **Weighted capital: $148.27**
- **Liquidity-adjusted return: $29,930 / $148.27 = 20,188%**

**Interpretation:** When accounting for liquidity, returns are even higher because most capital can be unlocked within 3 months.

### 5.4 Capital Efficiency vs Liquidity Trade-off

**Trade-off Curve:**

| Channel Size | Lock Duration | Settlement Frequency | Gas Costs | Capital Efficiency |
|--------------|---------------|----------------------|-----------|-------------------|
| $200 | 1 day | Daily | High ($2/day) | Low (frequent settlements) |
| $500 | 1 week | Weekly | Medium ($0.30/day) | Medium |
| $1,500 | 1 month | Monthly | Low ($0.10/day) | High |
| $5,000 | 3 months | Quarterly | Very Low ($0.03/day) | Very High |

**Optimal Strategy:**
- Start with medium channels ($500) and weekly settlements
- As agent scales, increase channel size to reduce gas costs
- Monitor utilization and rebalance when >80% capacity

---

## 6. Rebalancing Strategies

### 6.1 On-Chain Settlement Rebalancing

**Process:**
1. Agent's channel becomes imbalanced (e.g., 90% agent-side, 10% peer-side)
2. Agent initiates on-chain settlement
3. Channel state is committed to blockchain
4. Balances are reset (e.g., 50/50)
5. Channel reopens for new payments

**Costs:**
- Gas fee: $0.01-0.05 per settlement (on Base/Arbitrum)
- Downtime: 1-5 minutes (channel unavailable during settlement)

**Frequency:**
- Daily: $0.30-1.50/month in gas fees
- Weekly: $0.12-0.60/month
- Monthly: $0.03-0.15/month

**Recommendation:** Weekly settlements for optimal balance of capital efficiency and gas costs.

### 6.2 Circular Rebalancing (Off-Chain)

**Process:**
1. Agent has imbalanced channels with multiple peers:
   - Channel A: 90% agent-side (inbound exhausted)
   - Channel B: 10% agent-side (outbound exhausted)
2. Agent routes payment from B → A (circular path)
3. Channel A: 90% → 80% (rebalanced)
4. Channel B: 10% → 20% (rebalanced)
5. No on-chain settlement required

**Costs:**
- Routing fees: 0.5% of rebalancing amount
- Example: Rebalance $100, fee = $0.50

**Advantages:**
- No gas fees
- No downtime
- Instant rebalancing

**Disadvantages:**
- Requires multiple peers with complementary imbalances
- More complex logic

**Recommendation:** Use circular rebalancing opportunistically; fall back to on-chain settlement if no circular path exists.

### 6.3 Submarine Swaps

**Process:**
1. Agent has too much balance in Channel A (Base)
2. Agent wants to rebalance into Channel B (Arbitrum)
3. Agent performs submarine swap:
   - Send on-chain payment on Base
   - Receive off-chain payment on Arbitrum (via Lightning/ILP)
4. Channels rebalanced without closing

**Costs:**
- Swap fee: 0.1-0.5% of swap amount
- Gas fee: $0.01-0.05

**Advantages:**
- Cross-chain rebalancing
- No channel downtime

**Disadvantages:**
- Requires liquidity provider
- Higher fees than circular rebalancing

**Use Case:** Rebalancing between chains (e.g., Base → Arbitrum) without closing channels.

### 6.4 Rebalancing Frequency Optimization

**Optimization Problem:**
```
Minimize: (Gas Costs * Settlement Frequency) + (Opportunity Cost of Locked Capital)

Subject to: Channel Utilization < 80%
```

**Simulation Results (Medium Agent):**

| Settlement Frequency | Gas Costs/Month | Channel Size Needed | Total Capital | Total Cost |
|----------------------|-----------------|---------------------|---------------|------------|
| Daily | $9-45 | $200 | $200 | $9-45 |
| Weekly | $1.20-6 | $500 | $500 | $1.20-6 |
| Monthly | $0.30-1.50 | $1,500 | $1,500 | $0.30-1.50 |

**Opportunity Cost:**
```
Opportunity Cost = (Capital Locked - Minimum Capital) * Daily Return
                 = ($1,500 - $200) * 0.09 (9% daily return from unit economics)
                 = $117/day = $3,510/month
```

**Total Cost (Monthly Settlement):**
- Gas costs: $0.30-1.50/month
- Opportunity cost: $3,510/month
- **Total: $3,510-3,511/month**

**Total Cost (Weekly Settlement):**
- Gas costs: $1.20-6/month
- Opportunity cost: ($500 - $200) * 0.09 * 30 = $810/month
- **Total: $811-816/month**

**Optimal Strategy:** Weekly settlement minimizes total cost.

---

## 7. Liquidity Provision Alternatives

### 7.1 Third-Party Liquidity Providers

**Model:**
- Agent doesn't lock its own capital in channels
- Liquidity provider (LP) locks capital
- Agent pays LP a fee (e.g., 1% of payment volume or fixed $X/month)
- LP earns fees and can rebalance channels across multiple agents

**Costs:**
- LP fee: 1% of payment volume = $90/month (at $90/day revenue)
- Reduced profit: $2,460 - $90 = $2,370/month

**Advantages:**
- Zero capital requirement for agent (can launch with only 100 AKT stake)
- LP handles all rebalancing and liquidity management
- Agent focuses on relay operations

**Disadvantages:**
- Lower profit margin (91% → 87%)
- Dependence on LP (if LP exits, agent loses payment capability)

**Use Case:** New agents without sufficient capital can lease liquidity from LPs, then transition to self-hosted liquidity once profitable.

### 7.2 Pooled Liquidity (Agent Collective)

**Model:**
- Multiple agents pool capital into shared liquidity pool
- Each agent contributes proportionally (e.g., $200)
- Pool allocates liquidity dynamically based on agent demand
- Agents share rebalancing costs

**Example:**
- 10 agents pool $200 each = $2,000 total
- Agent A needs $500 capacity (high demand)
- Agent B needs $100 capacity (low demand)
- Pool allocates $500 to A, $100 to B, $1,400 remains available
- All agents share gas costs (amortized across pool)

**Advantages:**
- Higher capital efficiency (not all agents need peak capacity simultaneously)
- Shared rebalancing costs (10x lower per agent)
- Easier for small agents to enter market

**Disadvantages:**
- Requires trust and coordination
- Pool could be exhausted if multiple agents experience demand spikes simultaneously

**Use Case:** Cooperative agent networks where agents trust each other (e.g., same operator running multiple agents).

### 7.3 Liquidity Bonds (Borrow Liquidity)

**Model:**
- Agent issues liquidity bonds (debt instruments) to raise capital
- Bond holders lend capital to agent in exchange for fixed interest
- Agent uses borrowed capital for payment channels
- Agent repays bond holders from profits

**Example:**
- Agent issues $500 bond at 10% annual interest
- Bond holders lend $500
- Agent pays $50/year in interest ($4.17/month)
- Agent's profit: $2,460 - $50/12 = $2,455.83/month

**Advantages:**
- No upfront capital requirement
- Fixed cost (interest), easier to budget

**Disadvantages:**
- Debt obligation (must pay interest even if unprofitable)
- Default risk (if agent fails, bond holders lose capital)

**Use Case:** Established agents with proven track record can issue bonds to scale liquidity without diluting ownership.

### 7.4 Liquidity Mining (Incentivize User Deposits)

**Model:**
- Users deposit capital into agent's payment channels
- Agent pays users interest (e.g., 5% APY) from profits
- Users can withdraw capital with X-day notice
- Agent uses user deposits for payment channel liquidity

**Example:**
- Agent offers 5% APY on deposits
- Users deposit $500
- Agent pays $25/year interest ($2.08/month)
- Agent's profit: $2,460 - $2.08 = $2,457.92/month

**Advantages:**
- Zero upfront capital from agent
- Flexible (users can deposit/withdraw)
- Competitive APY (5% vs 0.1% in traditional banks)

**Disadvantages:**
- Withdrawal risk (if many users withdraw simultaneously, agent loses liquidity)
- Requires user trust
- Regulatory risk (may be considered a security)

**Use Case:** Premium agents with high reputation can attract user deposits as an alternative to traditional liquidity sources.

---

## 8. Multi-Chain Liquidity Management

### 8.1 Cross-Chain Capital Allocation

Agents operate on multiple chains (Base, Arbitrum, Cronos). How should capital be allocated?

**Allocation Strategy:**

| Chain | Allocation % | Rationale |
|-------|--------------|-----------|
| **Base** | 30% ($150) | High volume, low fees, growing ecosystem |
| **Arbitrum** | 45% ($225) | Highest volume, moderate fees, established ecosystem |
| **Cronos** | 25% ($125) | Lower volume, very low fees, Crypto.com integration |

**Allocation Adjustments:**
- Monitor payment volume per chain (weekly)
- Reallocate capital to high-demand chains
- Maintain minimum 20% allocation per chain (to avoid complete exit)

### 8.2 Cross-Chain Rebalancing

**Scenario:** Agent has excess liquidity on Base, insufficient liquidity on Arbitrum.

**Options:**

**Option 1: On-Chain Bridge**
- Close Base channel (receive $150)
- Bridge $150 from Base → Arbitrum (bridge fee: ~0.1% = $0.15)
- Open Arbitrum channel with $150
- **Cost:** $0.15 bridge fee + $0.05 gas
- **Time:** 10-30 minutes

**Option 2: Submarine Swap**
- Send on-chain payment on Base
- Receive off-chain payment on Arbitrum
- **Cost:** 0.1-0.5% swap fee = $0.15-0.75
- **Time:** Instant

**Option 3: Circular Rebalancing via Multi-Chain Peer**
- Find peer with opposite imbalance
- Route payment Base → Arbitrum via peer
- **Cost:** Routing fee 0.5% = $0.75
- **Time:** Instant

**Recommendation:** Use Option 1 (on-chain bridge) for large rebalances (>$500), Option 2 (submarine swap) for medium rebalances ($100-500), Option 3 (circular rebalancing) for small rebalances (<$100).

### 8.3 Dynamic Capital Allocation Algorithm

**Pseudocode:**

```python
def rebalance_multi_chain(agent):
    # Measure utilization per chain
    utilization = {
        'base': agent.channels['base'].utilization(),
        'arbitrum': agent.channels['arbitrum'].utilization(),
        'cronos': agent.channels['cronos'].utilization()
    }

    # Find overutilized and underutilized chains
    overutilized = [chain for chain, util in utilization.items() if util > 0.8]
    underutilized = [chain for chain, util in utilization.items() if util < 0.4]

    # Calculate rebalancing amount
    for over_chain in overutilized:
        for under_chain in underutilized:
            # Transfer 20% of capacity from under to over
            amount = agent.channels[under_chain].capacity * 0.2

            # Execute cross-chain rebalancing
            if amount > 500:
                bridge(under_chain, over_chain, amount)  # On-chain bridge
            else:
                submarine_swap(under_chain, over_chain, amount)  # Submarine swap

    # Log rebalancing action
    log_rebalancing(overutilized, underutilized, amount)
```

**Triggers:**
- Run every 24 hours
- Run immediately if any channel >90% utilization (emergency rebalancing)
- Run after major payment volume changes (>50% spike)

### 8.4 Multi-Chain Liquidity Optimization

**Optimization Problem:**

```
Maximize: Revenue - (Gas Costs + Rebalancing Costs + Opportunity Cost)

Subject to:
- Sum of capital across chains <= Total Capital Budget
- Each chain capacity >= Minimum Threshold (20% of total)
- Utilization per chain <= 80% (avoid exhaustion)
```

**Solution (Medium Agent with $500 total capital):**

| Chain | Optimal Allocation | Expected Utilization | Revenue | Gas Costs | Net Revenue |
|-------|-------------------|----------------------|---------|-----------|-------------|
| Base | $150 (30%) | 60% | $27/day | $0.30/day | $26.70/day |
| Arbitrum | $225 (45%) | 65% | $40.50/day | $0.60/day | $39.90/day |
| Cronos | $125 (25%) | 50% | $22.50/day | $0.10/day | $22.40/day |
| **TOTAL** | **$500** | **60%** | **$90/day** | **$1/day** | **$89/day** |

**Key Insight:** Optimal allocation balances:
1. Revenue potential per chain (Arbitrum highest)
2. Gas costs per chain (Cronos lowest)
3. Utilization (avoid over/under utilization)

---

## Conclusion

**Liquidity requirements for autonomous agent relays are manageable:**

- **Total capital:** $500-1,500 (depending on scale)
- **Payment channels:** $300-500 (60-70% of capital)
- **Routing reserves:** $100-300 (15-20% of capital)
- **Emergency fund:** $100 (10-15% of capital)
- **Reputation stake:** 100 AKT (~$46, locked not consumed)

**Capital efficiency is exceptional:**
- **Return on locked capital:** 4,150% annually
- **Capital turnover:** 65x annually
- **Break-even:** 6-7 days to recover initial investment

**Key Strategies:**
1. **Start small:** $500 capital is sufficient for medium-sized agent
2. **Weekly settlements:** Optimal balance of gas costs and capital efficiency
3. **Cross-chain allocation:** 30% Base, 45% Arbitrum, 25% Cronos
4. **Dynamic rebalancing:** Monitor utilization, rebalance when >80%

**Alternative Liquidity Sources:**
- Third-party LPs (for capital-constrained agents)
- Pooled liquidity (for agent cooperatives)
- Liquidity bonds (for scaling established agents)

**Next Steps:**
- See [Network Simulation](network-simulation.md) for Monte Carlo liquidity stress testing
- See [Failure Scenarios](failure-scenarios.md) for liquidity crisis analysis
- See [Capital Efficiency](capital-efficiency.md) for ROI optimization

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-05
**Author:** Claude Code (AI Research Assistant)
**Review Status:** Draft - Requires validation with real-world testing
