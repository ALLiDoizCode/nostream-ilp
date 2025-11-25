# Risk Assessment & Mitigation

## Top Risks

**Risk 1: Nostream + Dassie integration complexity**
- **Likelihood**: Medium
- **Impact**: Medium (HTTP API between processes may have issues)
- **Mitigation**:
  - Build robust API client with retries and error handling
  - Extensive integration testing
  - Fallback: Merge into single process if API approach fails (2-3 week effort)

**Risk 2: ILP connector liquidity providers don't exist**
- **Likelihood**: Medium-High
- **Impact**: High (can't convert BTC → AKT without connectors)
- **Mitigation**:
  - Run own ILP connectors providing liquidity (become market maker)
  - Partner with existing ILP networks (if available)
  - Fallback: Accept AKT directly only (simplify to single currency)

**Risk 3: Akash costs higher than estimated**
- **Likelihood**: Low
- **Impact**: High (relay not profitable)
- **Mitigation**:
  - Measure actual costs in Week 11-12 (Phase 3)
  - Adjust pricing model if needed (increase per-event cost)
  - Optimize: Compress data, cache aggressively, reduce storage
  - Deploy to cheaper providers on Akash marketplace

**Risk 4: CosmWasm contract security vulnerability**
- **Likelihood**: Low
- **Impact**: Critical (funds at risk)
- **Mitigation**:
  - Security audit before mainnet (paid audit or community review)
  - Extensive testing on testnet (weeks of testing)
  - Low initial limits (100 AKT max per channel)
  - Bug bounty program

**Risk 5: Insufficient user adoption (< 500 users)**
- **Likelihood**: Medium
- **Impact**: High (relay not profitable without users)
- **Mitigation**:
  - Market to Nostr community (sustainability message resonates)
  - Competitive pricing (cheaper than alternatives)
  - Excellent performance (Nostream is fast)
  - Free tier (first 100 events free per user)
  - Operator willing to subsidize initially (~$5-10/month)

---
