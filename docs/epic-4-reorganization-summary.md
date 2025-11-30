# Epic 4 Reorganization Summary

**Date:** November 30, 2025
**Author:** Sarah (Product Owner)
**Context:** Post Story 3.6 mainnet deployment strategic pivot

---

## What Changed

### Epic 3: Cronos Payment Channel Integration

**Status:** ✅ **COMPLETE** (6 stories, all done)

**Changes:**
- ❌ Removed Story 3.7 (was creating circular dependency with Epic 4)
- ✅ Epic 3 now cleanly ends at Story 3.6 (mainnet deployment)

**Final Story List:**
1. Story 3.1: Modify BasePaymentChannel for ERC-20 AKT ✅
2. Story 3.2: Create MockAKT and Update Tests ✅
3. Story 3.3: Configure Hardhat for Cronos Deployment ✅
4. Story 3.4: Deploy to Cronos Testnet ✅
5. Story 3.5: Create Dassie Cronos Settlement Module ✅
6. Story 3.6: Deploy to Cronos Mainnet ✅

---

### Epic 4: ILP Liquidity Connector & Self-Sustainability

**Status:** 🆕 **MAJOR EXPANSION** (7 stories → 13 stories)

**Goal Updated:**
- **Old**: Economic monitoring and Akash payment automation
- **New**: Multi-chain liquidity connector + economic monitoring + self-sustainability

**Key Innovation:**
Multi-token payment channel factory enables users to pay in ANY ERC-20 token (AKT, USDC, CRO, etc.) on any EVM chain. Combined with ILP routing, this creates a universal liquidity network where relays can:
1. Accept payments in any token
2. Swap to any other token via ILP
3. Automatically pay for Akash hosting
4. Earn routing fees from other relays

---

## New Epic 4 Structure

### Phase 1: Multi-Token Payment Infrastructure (Stories 4.1-4.3)

**Story 4.1: Create Multi-Token Payment Channel Factory Contract** (NEW)
- Build universal factory supporting any ERC-20 token
- Dynamic token selection per channel
- Support native ETH channels
- Comprehensive multi-token test suite

**Story 4.2: Deploy Multi-Token Factory to EVM Chains** (NEW)
- Deploy to Cronos Mainnet (ChainID: 25)
- Deploy to Base Mainnet (ChainID: 8453)
- Optional: Deploy to Arbitrum (ChainID: 42161)
- Create per-chain token whitelists
- **EVM Universality**: Same contract works on ALL EVM chains (Polygon, Optimism, BSC, etc.)

**Story 4.3: Update Dassie Settlement Modules for Multi-Token Support** (NEW - replaces old Story 3.7)
- Update cronos-mainnet.ts for factory integration
- Update base-mainnet.ts (or create if doesn't exist)
- Add token metadata cache (decimals, symbols)
- Integrate price oracles (CoinGecko API)
- Test multi-token payment verification

### Phase 2: ILP Swap Service (Stories 4.4-4.7)

**Story 4.4: Configure Dassie as Multi-Chain Liquidity Connector** (NEW)
- Enable all settlement modules (Lightning, Cronos, Base, XRP, Akash)
- Configure initial liquidity pools (~$3,820 capital)
- Set reserve levels and routing fees
- Test routing between all chain pairs

**Story 4.5: Implement Direct ILP Swap Quote API** (NEW)
- REST API: `POST /api/swap/quote`
- Return quotes for any ledger pair
- Include fees, exchange rates, expiration
- Liquidity validation

**Story 4.6: Implement Multi-Chain Swap Execution via ILP** (NEW)
- Handle incoming ILP swap requests
- Atomic swap execution (Cronos → Akash, BTC → AKT, etc.)
- Transaction logging (swap_transactions table)
- Error handling and refunds

**Story 4.7: Add Liquidity Pool Management & Rebalancing** (NEW)
- Monitor pool levels per ledger
- Alert when pools < 30% of target
- Rebalancing recommendations
- Pool statistics dashboard

### Phase 3: Economic Monitoring (Stories 4.8-4.10)

**Story 4.8: Create Economic Monitor Service** (OLD 4.1 - moved)
- Track revenue (user payments + swap fees + routing fees)
- Store economic snapshots
- Real-time balance updates via Dassie RPC

**Story 4.9: Integrate Akash Provider Billing** (OLD 4.3 - moved)
- Query Akash hosting costs
- Track expenses in database

**Story 4.10: Implement Automatic Akash Escrow Deposit** (OLD 4.4 - moved)
- Auto-swap Cronos AKT → Akash AKT (uses Stories 4.5-4.6!)
- Auto-pay Akash escrow when balance sufficient
- End-to-end automation test

### Phase 4: Visibility & Validation (Stories 4.11-4.13)

**Story 4.11: Create Profitability Dashboard** (OLD 4.5 - moved)
- Economic health monitoring
- Liquidity pool visualization
- Swap activity tracking

**Story 4.12: Add Economic Alerts** (OLD 4.6 - moved)
- Revenue/expense alerts
- Liquidity pool alerts
- Swap failure rate alerts

**Story 4.13: 30-Day Self-Sustainability Simulation** (OLD 4.7 - moved)
- Multi-revenue stream model
- User payments + swap fees + routing fees
- Validate profitability > 110%

---

## Removed Stories

**Story 4.2 (OLD): Implement Automatic Currency Conversion to AKT**
- ❌ Removed - functionality replaced by Stories 4.5-4.6 (swap service)
- The old story assumed a simple "convert" RPC call
- The new approach uses proper ILP swap infrastructure

---

## Key Architectural Insights

### 1. EVM Universality

The MultiTokenPaymentChannelFactory contract works on **ALL EVM chains** because:
- Uses standard ERC-20 interface (identical across all EVM chains)
- No chain-specific opcodes or features
- Same bytecode deploys everywhere

**Supported Chains (Now or Future):**
- ✅ Cronos (deployed in Story 4.2)
- ✅ Base (deployed in Story 4.2)
- ✅ Arbitrum (optional in Story 4.2)
- 🔮 Polygon, Optimism, BSC, Avalanche (future - just deploy and add to whitelist)

**No code changes needed for new chains!** Just:
1. Deploy factory contract
2. Add token whitelist for that chain
3. Create Dassie settlement module (or reuse existing EVM module)

### 2. Two-Tier Payment System

**Tier 1: Payment Channels (High Frequency)**
- User → Relay: 1000s of micropayments
- Use factory contract for any ERC-20 token
- Amortize gas costs over many payments

**Tier 2: Direct ILP (Low Frequency)**
- Relay → Connector: Bulk swaps (100 AKT once/month)
- No channels needed (direct ILP payments)
- Simpler, cheaper for one-time transfers

### 3. Universal Swap Matrix

With multi-token factory + ILP routing, ANY asset can swap to ANY other:

```
Payment Channel Tokens:
- Cronos: AKT, USDC, CRO, any ERC-20
- Base: ETH, USDC, any ERC-20
- Arbitrum: ETH, USDC, ARB, any ERC-20

ILP Direct Routes:
- Lightning BTC
- XRP Ledger
- Akash native AKT
- Future: Solana SOL

Total Combinations:
- 10+ tokens on 3+ EVM chains = 30+ payment options
- Each can swap to Akash AKT for hosting
- Each can swap to any other token
```

### 4. Network Effects

**For Relay Operators:**
- More tokens accepted → More users can pay
- More liquidity → Better swap rates
- More relays using connector → Lower fees (economies of scale)

**For Liquidity Connector (You):**
- More swaps → More fee revenue
- More volume → Justify deeper liquidity pools
- More pools → More routing opportunities

---

## Epic Dependencies

### Epic 3 → Epic 4 Dependency

**Epic 3 provides:**
- ✅ Single-token contract pattern (reference implementation)
- ✅ Cronos mainnet deployment experience
- ✅ Dassie cronos-mainnet settlement module (basis for multi-token)

**Epic 4 builds on:**
- Extends single-token to multi-token factory
- Adds swap service on top of settlement modules
- Enables full economic automation

### Epic 4 Internal Dependencies

**Must be sequential:**
1. Stories 4.1-4.3: Build multi-token infrastructure
2. Stories 4.4-4.7: Build swap service (depends on 4.1-4.3)
3. Stories 4.8-4.10: Add Akash automation (depends on 4.4-4.7 for swaps)
4. Stories 4.11-4.13: Add monitoring (depends on 4.8-4.10 for data)

**Critical Path:** 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 4.7 → 4.10 (can't skip any)

---

## Effort Estimate

### Original Epic 4 (7 stories)
- Estimated: ~12 hours
- Focus: Economic monitoring only

### New Epic 4 (13 stories)
- Estimated: ~30-35 hours
- Focus: Multi-token factory + swap service + economic monitoring

### Story Breakdown

| Story | Description | Effort |
|-------|-------------|--------|
| 4.1 | Multi-token factory contract | 4 hours |
| 4.2 | Deploy to 3 EVM chains | 2 hours |
| 4.3 | Update Dassie modules | 3 hours |
| 4.4 | Configure liquidity connector | 3 hours |
| 4.5 | Swap quote API | 3 hours |
| 4.6 | Swap execution engine | 4 hours |
| 4.7 | Liquidity pool management | 3 hours |
| 4.8 | Economic monitor service | 2 hours |
| 4.9 | Akash billing integration | 2 hours |
| 4.10 | Auto Akash escrow deposit | 3 hours |
| 4.11 | Profitability dashboard | 3 hours |
| 4.12 | Economic alerts | 2 hours |
| 4.13 | 30-day simulation | 3 hours |
| **Total** | | **37 hours** |

**Timeline:** 3-4 weeks (with testing and review)

---

## Strategic Rationale for Changes

### Why Multi-Token Factory?

**Problem with single-token contracts:**
- Limits user payment options (AKT only on Cronos)
- Requires deploying new contract per token
- Fragments liquidity across contracts

**Multi-token factory solution:**
- ONE contract handles ALL tokens ✅
- Users pay in their preferred token ✅
- Simpler deployment and maintenance ✅

### Why Reorder Stories?

**Original order:**
1. Economic monitoring
2. Akash automation
3. (Swap service was in Epic 7)

**Problem:** Can't automate Akash payments without swap service!

**New order:**
1. Multi-token infrastructure (expand payment options)
2. Swap service (enable conversions)
3. Akash automation (uses swap service)
4. Monitoring (tracks everything)

**Benefit:** Each phase builds on previous, can test incrementally.

### Why Add 6 New Stories?

The original Epic 4 assumed:
- Simple currency conversion (magic "convert" function)
- Single-token payment channels (AKT only)
- Swap service would come later (Epic 7)

The new insight:
- Swap service is CORE to self-sustainability (not optional)
- Multi-token support dramatically increases addressable market
- Need proper liquidity connector infrastructure (not just automation)

---

## Impact on Other Epics

### Epic 7: ILP Connector Revenue Optimization

**Original scope:**
- Configure Dassie as public connector
- Routing fee configuration
- Peering with other connectors
- Revenue optimization

**New scope (after Epic 4):**
- Most functionality moved to Epic 4 (Stories 4.4-4.7)
- Epic 7 can focus on:
  - Advanced routing strategies
  - Automated rebalancing via DEX
  - Market making and arbitrage
  - White-label connector service

**Status:** Epic 7 scope reduced (many stories moved to Epic 4)

### Epic 5: Akash Deployment

**Impact:** None - Epic 5 deploys whatever Epic 4 builds

**Benefits from Epic 4:**
- More revenue sources (swap fees + routing)
- Better sustainability (multi-revenue model)
- Universal token support (users pay in anything)

---

## Risk Assessment

### New Risks Introduced

| Risk | Mitigation |
|------|------------|
| Multi-token factory complexity | Comprehensive test suite (AC #6) |
| Liquidity fragmentation (many tokens) | Token whitelist (only approved tokens) |
| Capital requirements increased (~$3,820) | Start with minimum viable liquidity, scale up |
| More chains = more monitoring | Shared monitoring infrastructure |

### Risks Mitigated

| Original Risk | How Multi-Token Helps |
|---------------|----------------------|
| Limited payment options (AKT only) | Now supports any ERC-20 + native ETH |
| Dependency on Cronos only | Works on Base, Arbitrum, any EVM chain |
| User onboarding friction | Users pay in token they already have |
| Single point of failure | Multi-chain redundancy |

---

## Success Metrics Updated

### Epic 3 Success (Achieved)

✅ AKT payment channels deployed on Cronos
✅ 100% test coverage
✅ Mainnet deployment at `0x9Ec2d217b14e67cAbF86F20F4E7462D6d7bc7684`

### Epic 4 Success Criteria (New)

**Technical:**
- ✅ Multi-token factory deployed on 3+ EVM chains
- ✅ Support 10+ different tokens across chains
- ✅ Swap service handling 5+ different asset pairs
- ✅ <60 second swap execution time
- ✅ >99% swap success rate

**Economic:**
- ✅ Revenue > 110% of Akash hosting costs
- ✅ 3+ revenue streams (user payments, swap fees, routing fees)
- ✅ 30-day profitability validated via simulation

**Operational:**
- ✅ Automated Akash payments (no manual intervention)
- ✅ Liquidity pools monitored and balanced
- ✅ Economic alerts configured

---

## Next Steps

### Immediate (This Week)
1. ✅ Review Epic 4 reorganization with team
2. Create Story 4.1 detailed story file
3. Begin multi-token factory contract development

### Short-term (Next 2 Weeks)
1. Complete Phase 1: Stories 4.1-4.3 (multi-token infrastructure)
2. Test on Cronos + Base testnets
3. Deploy to mainnets

### Medium-term (Weeks 3-4)
1. Complete Phase 2: Stories 4.4-4.7 (swap service)
2. Test end-to-end swap flows
3. Validate liquidity management

### Long-term (Month 2)
1. Complete Phase 3-4: Stories 4.8-4.13 (automation + monitoring)
2. 30-day economic validation
3. Ready for Epic 5 (Akash deployment)

---

## Questions for Stakeholders

1. **Capital Requirements:** Are we comfortable with ~$3,820 initial liquidity for MVP?
   - Can start smaller ($1,000) if needed
   - Scale up as swap volume grows

2. **Chain Priorities:** Which EVM chains to deploy to first?
   - Recommended: Cronos (✅ AKT), Base (✅ low fees), Arbitrum (✅ large ecosystem)
   - Future: Polygon (very low fees), Optimism (OP token)

3. **Token Priorities:** Which tokens to whitelist initially?
   - Cronos: AKT, USDC, CRO
   - Base: ETH, USDC
   - Arbitrum: ETH, USDC, ARB

4. **Revenue Split:** How to price swap fees?
   - Same asset, different chain: 1% (Cronos AKT → Akash AKT)
   - Different assets: 2-2.5% (BTC → AKT)
   - Market-competitive? Adjust based on volume?

---

## Conclusion

**Epic 4 is now the core value delivery epic.**

Instead of just monitoring economics, it:
1. Enables universal token acceptance (any ERC-20)
2. Provides liquidity service to ecosystem (swap fees)
3. Automates hosting payments (self-sustainability)
4. Proves economic model (simulation)

**This is the killer feature** that makes Nostr-ILP relays economically viable AND positions you as essential infrastructure for the ecosystem.

Epic 3 gave us the foundation (single-token channels).
Epic 4 gives us the full vision (universal liquidity network).

---

**Status:** Epic 4 reorganization complete and documented.
**Next:** Create detailed Story 4.1 file for implementation.
