# Multi-Chain ILP Routing Matrix

## Supported Swap Routes

Your ILP connector can route between ANY supported ledgers. Here's the complete matrix:

### Swap Route Table

| From ↓ / To → | Lightning BTC | Cronos AKT | Base ETH | XRP | Akash AKT | Cronos CRO | Solana SOL* |
|---------------|---------------|------------|----------|-----|-----------|------------|-------------|
| **Lightning BTC** | - | ✅ 2% | ✅ 2% | ✅ 2.5% | ✅ 2% | ✅ 2.5% | 🔮 2% |
| **Cronos AKT** | ✅ 2% | - | ✅ 2% | ✅ 2.5% | ✅ 1% | ✅ 2.5% | 🔮 2% |
| **Base ETH** | ✅ 2% | ✅ 2% | - | ✅ 2.5% | ✅ 2% | ✅ 2.5% | 🔮 2% |
| **XRP** | ✅ 2.5% | ✅ 2.5% | ✅ 2.5% | - | ✅ 2.5% | ✅ 3% | 🔮 2.5% |
| **Akash AKT** | ✅ 2% | ✅ 1% | ✅ 2% | ✅ 2.5% | - | ✅ 2.5% | 🔮 2% |
| **Cronos CRO** | ✅ 2.5% | ✅ 2.5% | ✅ 2.5% | ✅ 3% | ✅ 2.5% | - | 🔮 2.5% |
| **Solana SOL*** | 🔮 2% | 🔮 2% | 🔮 2% | 🔮 2.5% | 🔮 2% | 🔮 2.5% | - |

**Legend:**
- ✅ = Currently supported (Epic 2 & 3)
- 🔮 = Future support (requires Solana integration)
- % = Routing fee (includes liquidity risk premium)

**Fee Structure:**
- Same asset, different chain (e.g., Cronos AKT → Akash AKT): **1%** (lowest risk)
- Different assets, same ecosystem: **2%** (medium risk)
- Cross-ecosystem swaps: **2.5-3%** (highest risk due to volatility)

*Solana integration planned for future epic

## Example Routes

### Route 1: Lightning BTC → Akash AKT

**User Journey:**
1. Relay operator has 0.01 BTC on Lightning Network
2. Needs 20 AKT on Akash Network to pay 6 months hosting
3. Current rate: 1 BTC = 2000 AKT

**ILP Flow:**
```
Input:  0.01 BTC (Lightning)
Rate:   0.01 BTC × 2000 = 20 AKT
Fee:    2% = 0.4 AKT
Output: 19.6 AKT (Akash native)

Time:   ~60 seconds
Cost:   2% routing fee
```

### Route 2: XRP → Cronos CRO (Gas Fees)

**User Journey:**
1. Relay operator accepts XRP payments
2. Has 100 XRP available
3. Needs CRO for transaction gas fees on Cronos

**ILP Flow:**
```
Input:  100 XRP
Rate:   1 XRP = 8 CRO (example rate)
Gross:  100 × 8 = 800 CRO
Fee:    3% = 24 CRO
Output: 776 CRO (Cronos mainnet)

Time:   ~30 seconds
Cost:   3% routing fee
```

### Route 3: Multi-Hop (Base ETH → Akash AKT)

**User Journey:**
1. Relay operator has 0.5 ETH on Base L2
2. Needs Akash AKT for hosting

**ILP Multi-Hop Flow:**
```
Option A (Direct):
Base ETH → Akash AKT (2% fee)

Option B (Via Cronos - may have better liquidity):
Base ETH → Cronos AKT (2%) → Akash AKT (1%)
Total fee: 3% but better availability

Dassie automatically picks best route!
```

## Liquidity Pool Requirements

To support all routes, you need initial liquidity on each ledger:

### Minimum Viable Liquidity (MVP)

| Ledger | Initial Capital | USD Value (est.) |
|--------|----------------|------------------|
| Lightning BTC | 0.05 BTC | $5,000 |
| Cronos AKT | 5,000 AKT | $2,500 |
| Base ETH | 1 ETH | $3,500 |
| XRP | 2,000 XRP | $1,200 |
| Akash AKT | 5,000 AKT | $2,500 |
| Cronos CRO | 5,000 CRO | $600 |
| **Total** | - | **~$15,300** |

### Scale-Up Liquidity (Production)

| Ledger | Production Capital | USD Value (est.) |
|--------|-------------------|------------------|
| Lightning BTC | 0.2 BTC | $20,000 |
| Cronos AKT | 20,000 AKT | $10,000 |
| Base ETH | 5 ETH | $17,500 |
| XRP | 10,000 XRP | $6,000 |
| Akash AKT | 20,000 AKT | $10,000 |
| Cronos CRO | 20,000 CRO | $2,400 |
| **Total** | - | **~$65,900** |

**Note:** You can start with MVP and scale up as demand grows. Routing fees fund liquidity expansion!

## Revenue Model

### Monthly Projections (Conservative)

**Assumptions:**
- 10 active relay operators
- Each swaps $100/month average
- Average fee: 2%

**Revenue:**
```
10 operators × $100 × 2% = $20/month
```

**At scale (100 operators):**
```
100 operators × $100 × 2% = $200/month
```

**With multiple swaps per operator:**
```
100 operators × 2 swaps/month × $100 × 2% = $400/month
```

### Fee Optimization Strategy

**Dynamic fees based on liquidity:**

```typescript
interface DynamicFeeConfig {
  baseFee: number;           // Base routing fee (e.g., 1%)
  liquidityPremium: number;  // Added if pool is low (e.g., +0.5%)
  volatilityPremium: number; // Added for volatile pairs (e.g., +0.5%)

  calculateFee(
    sourceLedger: string,
    destLedger: string,
    amount: bigint,
    currentLiquidity: bigint
  ): number {
    let fee = this.baseFee;

    // Add liquidity premium if pool is < 30% of target
    const liquidityRatio = currentLiquidity / targetLiquidity;
    if (liquidityRatio < 0.3) {
      fee += this.liquidityPremium;
    }

    // Add volatility premium for cross-chain swaps
    if (isDifferentAsset(sourceLedger, destLedger)) {
      fee += this.volatilityPremium;
    }

    return fee;
  }
}
```

**Example:**
- Cronos AKT → Akash AKT (same asset): 1% base fee
- But if Akash pool is low: 1% + 0.5% = 1.5%
- BTC → AKT (different assets): 2% base + 0.5% volatility = 2.5%

## Technical Implementation

### Dassie Configuration for Multi-Chain

```typescript
// ~/Documents/dassie/.env

# Enable all settlement modules
CRONOS_MAINNET_ENABLED=true
AKASH_MAINNET_ENABLED=true
LIGHTNING_ENABLED=true
BASE_ENABLED=true
XRP_ENABLED=true

# Settlement module addresses
CRONOS_MAINNET_CHANNEL_ADDRESS=0x9Ec2d217b14e67cAbF86F20F4E7462D6d7bc7684
AKASH_RELAY_ADDRESS=akash1youraddress
LIGHTNING_NODE_URI=your-lnd-node:10009
BASE_CONTRACT_ADDRESS=0xYourBaseContract
XRP_WALLET_ADDRESS=rYourXRPAddress

# Liquidity thresholds
CRONOS_AKT_MIN_LIQUIDITY=1000000000    # 1,000 AKT
AKASH_AKT_MIN_LIQUIDITY=2000000000     # 2,000 AKT
LIGHTNING_BTC_MIN_LIQUIDITY=5000000    # 0.05 BTC (sats)
```

### Route Discovery

Dassie automatically discovers routes via **ILP routing protocol**:

```
User requests: "Send from Lightning BTC to Akash AKT"

Dassie queries network:
1. Direct route: Lightning → Akash?
   → Not available (different protocols)

2. One-hop routes:
   → Lightning → Cronos → Akash ✅ (via your connector)
   → Lightning → Base → Cronos → Akash (2 hops, higher fee)

3. Selects best route based on:
   - Lowest total fee
   - Fastest settlement
   - Highest liquidity

Winner: Lightning → Your Connector (Cronos) → Akash
```

**Your connector advertises:**
```
ILP Address: ilp.connector.yourrelay.com

Supported pairs:
- btc+lightning → akt+cronos (fee: 2%)
- akt+cronos → akt+akash (fee: 1%)
- eth+base → akt+cronos (fee: 2%)
- xrp+mainnet → cro+cronos (fee: 3%)
... etc
```

## Market Opportunity Analysis

### Target Addressable Market (TAM)

**Nostr Relay Operators:**
- Current: ~500 public relays
- Growth: 2x per year
- Projected (2026): ~2,000 relays

**Payment Enabled Relays:**
- Current: ~50 paid relays
- Your target: 10% market share = 5 relays
- 12-month goal: 50 relays

### Competitive Advantage

**Traditional Exchanges:**
- ❌ KYC required
- ❌ High fees (3-5%)
- ❌ Slow (hours to days)
- ❌ Limited pairs

**Your ILP Connector:**
- ✅ No KYC (peer-to-peer)
- ✅ Lower fees (1-3%)
- ✅ Fast (seconds to minutes)
- ✅ Universal pairs (any supported asset)
- ✅ Atomic swaps (trustless)

### Network Effects

As you gain users:
1. **More liquidity** → Better rates
2. **More routes** → More use cases
3. **More volume** → Lower fees
4. **More relays** → More revenue

**Flywheel effect:**
```
More users → More volume → More liquidity
     ↑                             ↓
Lower fees ← Better rates ← Deeper pools
```

## Go-to-Market Strategy

### Phase 1: Early Adopters (Months 1-3)

**Target:** 3-5 relay operators who:
- Already use multiple chains
- Have liquidity pain points
- Are technically sophisticated

**Strategy:**
1. Direct outreach on Nostr
2. Offer first 10 swaps free
3. Gather feedback, iterate
4. Document case studies

### Phase 2: Market Expansion (Months 4-9)

**Target:** 20-30 relay operators

**Strategy:**
1. Launch API documentation
2. Create Dassie plugin/integration
3. Speak at Nostr conferences
4. Content marketing (blog posts)

### Phase 3: Market Leader (Months 10-18)

**Target:** 50+ relay operators (10% market share)

**Strategy:**
1. Automated rebalancing (fully hands-off)
2. Yield optimization (stake idle capital)
3. White-label for other connectors
4. Enterprise SLA for large relays

## Risk Mitigation

### Operational Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Liquidity drain on one chain | High | Daily monitoring, auto-rebalance alerts |
| Exchange rate volatility | Medium | 0.5% buffer in fees, rapid rebalancing |
| Smart contract bug | High | Audits, insurance, gradual rollout |
| Regulatory uncertainty | Medium | Legal review, geographic restrictions |

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Dassie node downtime | High | Redundant nodes, monitoring, backups |
| Chain outage (Cronos, etc.) | Medium | Multi-chain diversification |
| ILP protocol bugs | Low | Well-tested, years of production use |

## Success Metrics (KPIs)

### Operational Metrics
- **Monthly swap volume** (USD)
- **Number of unique users**
- **Average swap size**
- **Swap success rate** (target: >99%)

### Financial Metrics
- **Monthly revenue** (routing fees)
- **Liquidity utilization** (% of pools actively used)
- **Return on liquidity** (fees earned / capital locked)

### Growth Metrics
- **User acquisition rate** (new users/month)
- **User retention** (repeat swaps)
- **Market share** (% of Nostr paid relays)

### Example Dashboard

```
┌─────────────────────────────────────────┐
│    ILP Connector Dashboard (Dec 2025)   │
├─────────────────────────────────────────┤
│ Monthly Volume:     $12,450             │
│ Total Swaps:        124                 │
│ Unique Users:       18                  │
│ Success Rate:       99.2%               │
│                                         │
│ Revenue (Fees):     $248.50             │
│ Capital Deployed:   $15,300             │
│ Monthly ROI:        1.62%               │
│                                         │
│ Top Routes:                             │
│ 1. Cronos AKT → Akash AKT    (42%)     │
│ 2. Lightning BTC → Akash AKT (28%)     │
│ 3. Base ETH → Cronos CRO     (15%)     │
│ 4. XRP → Akash AKT           (10%)     │
│ 5. Other                     (5%)      │
└─────────────────────────────────────────┘
```

## Future Enhancements

### Year 1: Core Functionality
- ✅ Direct ILP swaps (all pairs)
- ✅ Quote API
- ✅ Manual rebalancing
- ✅ Basic monitoring

### Year 2: Automation
- 🔮 Automated rebalancing via DEX
- 🔮 Dynamic fee optimization
- 🔮 Solana integration
- 🔮 Yield farming (stake idle AKT)

### Year 3: Market Leadership
- 🔮 White-label connector service
- 🔮 Institutional liquidity pools
- 🔮 Cross-ILP connector routing
- 🔮 Derivatives (futures, options)

## Conclusion

**Your multi-chain ILP connector is not just a feature—it's a business.**

By supporting Lightning, Cronos, Base, XRP, Akash (and future Solana), you become **essential infrastructure** for every Nostr relay operator.

**Network effect moat:**
- First mover in Nostr-ILP space
- Only multi-chain liquidity provider
- Deep liquidity pools
- Proven track record

**This is your competitive advantage.** 🚀

---

**Next Steps:**
1. Start with Cronos ↔ Akash (simplest, highest demand)
2. Add Lightning support (unlock Bitcoin users)
3. Expand to Base, XRP (full coverage)
4. Future: Solana integration (massive user base)

Each chain you add **multiplies** your addressable market!
