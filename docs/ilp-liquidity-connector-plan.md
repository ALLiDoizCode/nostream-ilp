# ILP Liquidity Connector for Relay Operators

## Vision

A **shared ILP connector/relay** that provides instant liquidity swaps for Nostr relay operators, eliminating the need for manual bridging between:
- Cronos EVM (AKT, CRO)
- Akash Network (native AKT)
- Other supported ILP networks (BTC, XRP, Base, etc.)

## Problem Statement

Every Nostr-ILP relay operator faces the same liquidity fragmentation:

1. **Revenue streams (income):**
   - AKT on Cronos EVM (from payment channels)
   - Potentially BTC, XRP, Base ETH (from cross-chain users)

2. **Operational needs (expenses):**
   - CRO on Cronos EVM (for gas fees)
   - Native AKT on Akash (for hosting payments)

3. **Current solution:** Manual bridging
   - Time-consuming (30min - 2 hours per bridge)
   - Expensive (bridge fees: 0.1-1%)
   - Complex (requires understanding multiple chains)
   - Doesn't scale (every operator does this individually)

## ILP Solution: Shared Liquidity Connector

### Concept

**One well-capitalized connector** (you!) provides instant swaps for all relay operators:

- **You maintain liquidity** on multiple chains
- **Operators pay small routing fee** (0.5-2%)
- **Everyone benefits** from shared liquidity pool
- **You profit** from routing fees + rebalancing arbitrage

### Network Effect

As more relays use your connector:
- Your liquidity pools grow (from fees)
- More routing options available
- Better exchange rates (economies of scale)
- Becomes essential infrastructure for Nostr-ILP ecosystem

## Technical Architecture

### Dassie Settlement Modules (Already Built!)

You already have these from Epic 2 & 3:

```typescript
// Existing modules in ~/Documents/dassie/packages/app-dassie/src/ledgers/modules/

✅ cronos-mainnet.ts       // Cronos EVM settlement (Story 3.6)
✅ cosmos-akash.ts          // Akash Network settlement (Epic 2)
✅ lightning-testnet.ts     // BTC Lightning (Epic 2)
✅ base-sepolia.ts          // Base L2 (Epic 2)
✅ xrpl-testnet.ts          // XRP (Epic 2)
```

**You already have multi-chain settlement!** Just need routing logic.

### New: Liquidity Connector Logic

```typescript
// packages/app-dassie/src/connector/liquidity-routes.ts

import type { SettlementSchemeModule } from '../ledgers/types/settlement-scheme-module'

interface LiquidityPool {
  ledgerId: string;           // e.g., "akt+cronos-mainnet+akt"
  availableBalance: bigint;   // Current liquidity
  minimumReserve: bigint;     // Don't go below this
  rebalanceThreshold: bigint; // Trigger rebalance when hit
}

interface RouteConfig {
  sourceLedger: string;       // "akt+cronos-mainnet+akt"
  destinationLedger: string;  // "akt+akash-mainnet+akt"
  exchangeRate: number;       // e.g., 1.0 (1:1 for same asset)
  routingFee: number;         // e.g., 0.01 (1%)
  maxAmount: bigint;          // Maximum per transaction
}

export class LiquidityConnector {
  private pools: Map<string, LiquidityPool> = new Map();
  private routes: RouteConfig[] = [];

  constructor() {
    // Initialize liquidity pools
    this.initializePools();
    // Configure routes
    this.configureRoutes();
  }

  private initializePools() {
    // Cronos EVM AKT
    this.pools.set('akt+cronos-mainnet+akt', {
      ledgerId: 'akt+cronos-mainnet+akt',
      availableBalance: 10000n * 1_000_000n, // 10,000 AKT (6 decimals)
      minimumReserve: 1000n * 1_000_000n,    // Always keep 1,000 AKT
      rebalanceThreshold: 15000n * 1_000_000n // Rebalance if > 15,000
    });

    // Akash Network AKT
    this.pools.set('akt+akash-mainnet+akt', {
      ledgerId: 'akt+akash-mainnet+akt',
      availableBalance: 10000n * 1_000_000n,
      minimumReserve: 2000n * 1_000_000n,   // Higher reserve for hosting
      rebalanceThreshold: 15000n * 1_000_000n
    });

    // Cronos EVM CRO
    this.pools.set('cro+cronos-mainnet+cro', {
      ledgerId: 'cro+cronos-mainnet+cro',
      availableBalance: 5000n * 1_000_000_000_000_000_000n, // 5,000 CRO (18 decimals)
      minimumReserve: 500n * 1_000_000_000_000_000_000n,
      rebalanceThreshold: 10000n * 1_000_000_000_000_000_000n
    });
  }

  private configureRoutes() {
    // Route 1: Cronos AKT → Akash AKT (most important!)
    this.routes.push({
      sourceLedger: 'akt+cronos-mainnet+akt',
      destinationLedger: 'akt+akash-mainnet+akt',
      exchangeRate: 0.99, // 1% fee built into rate
      routingFee: 0.01,   // 1% routing fee
      maxAmount: 1000n * 1_000_000n // Max 1,000 AKT per swap
    });

    // Route 2: Akash AKT → Cronos AKT (reverse)
    this.routes.push({
      sourceLedger: 'akt+akash-mainnet+akt',
      destinationLedger: 'akt+cronos-mainnet+akt',
      exchangeRate: 0.99,
      routingFee: 0.01,
      maxAmount: 1000n * 1_000_000n
    });

    // Route 3: Cronos AKT → Cronos CRO
    this.routes.push({
      sourceLedger: 'akt+cronos-mainnet+akt',
      destinationLedger: 'cro+cronos-mainnet+cro',
      exchangeRate: 40.0 * 0.975, // 1 AKT ≈ 40 CRO, with 2.5% fee
      routingFee: 0.025,
      maxAmount: 100n * 1_000_000n // Max 100 AKT → CRO per swap
    });

    // Route 4: Any asset → Cronos AKT (for users paying in BTC/XRP/ETH)
    // These would use market rates from oracles
  }

  /**
   * Check if a route is possible and has sufficient liquidity
   */
  canRoute(
    sourceLedger: string,
    destinationLedger: string,
    sourceAmount: bigint
  ): boolean {
    const route = this.findRoute(sourceLedger, destinationLedger);
    if (!route) return false;

    const destPool = this.pools.get(destinationLedger);
    if (!destPool) return false;

    const destinationAmount = this.calculateDestinationAmount(
      sourceAmount,
      route.exchangeRate
    );

    // Check if we have enough liquidity (above minimum reserve)
    return (
      destPool.availableBalance - destinationAmount >= destPool.minimumReserve
    );
  }

  /**
   * Execute a liquidity swap
   */
  async executeSwap(
    sourceLedger: string,
    destinationLedger: string,
    sourceAmount: bigint,
    destinationAddress: string
  ): Promise<{ success: boolean; destinationAmount: bigint }> {
    const route = this.findRoute(sourceLedger, destinationLedger);
    if (!route) {
      throw new Error('No route found');
    }

    if (!this.canRoute(sourceLedger, destinationLedger, sourceAmount)) {
      throw new Error('Insufficient liquidity');
    }

    const destinationAmount = this.calculateDestinationAmount(
      sourceAmount,
      route.exchangeRate
    );

    // Update pool balances (accounting)
    const sourcePool = this.pools.get(sourceLedger)!;
    const destPool = this.pools.get(destinationLedger)!;

    sourcePool.availableBalance += sourceAmount;
    destPool.availableBalance -= destinationAmount;

    // Check if rebalancing needed
    if (sourcePool.availableBalance > sourcePool.rebalanceThreshold) {
      await this.scheduleRebalance(sourceLedger, destinationLedger);
    }

    // Actual settlement would happen here via Dassie modules
    // For now, return success
    return { success: true, destinationAmount };
  }

  /**
   * Schedule rebalancing (manual bridge or automated)
   */
  private async scheduleRebalance(
    sourceLedger: string,
    destinationLedger: string
  ): Promise<void> {
    console.log(`⚠️ Rebalancing needed: ${sourceLedger} → ${destinationLedger}`);
    // Trigger manual bridge or automated process
    // This would:
    // 1. Alert operator (you) to bridge
    // 2. Or trigger automated bridge via Crypto.com API
    // 3. Or post order on DEX for market making
  }

  private findRoute(source: string, destination: string): RouteConfig | undefined {
    return this.routes.find(
      (r) => r.sourceLedger === source && r.destinationLedger === destination
    );
  }

  private calculateDestinationAmount(
    sourceAmount: bigint,
    exchangeRate: number
  ): bigint {
    // Convert to number, apply rate, convert back
    // Handle decimal precision carefully
    return BigInt(Math.floor(Number(sourceAmount) * exchangeRate));
  }
}
```

### Integration with Dassie

Your existing Dassie instance becomes a **connector/relay** instead of just a settlement node:

```typescript
// packages/app-dassie/src/index.ts

import { LiquidityConnector } from './connector/liquidity-routes'
import cronosMainnetModule from './ledgers/modules/cronos/cronos-mainnet'
import akashModule from './ledgers/modules/cosmos/cosmos-akash'

const connector = new LiquidityConnector();

// When Dassie receives an ILP payment request:
// 1. Check if it's a liquidity swap request
// 2. Validate route exists and has liquidity
// 3. Execute swap via LiquidityConnector
// 4. Settle using appropriate SettlementSchemeModule
```

## Business Model

### Revenue Streams

1. **Routing Fees:** 0.5-2% per swap
   - Cronos AKT ↔ Akash AKT: 1%
   - Cronos AKT ↔ CRO: 2.5%
   - Cross-chain swaps: 2%

2. **Rebalancing Arbitrage:**
   - You manually bridge at low fees (quarterly)
   - Users pay instant swap fees (daily)
   - Spread profit: ~0.5-1%

3. **Network Effects:**
   - More users = more volume = more fees
   - Eventually: automated rebalancing via DEX

### Example Economics

**Assumptions:**
- 10 active relay operators
- Each swaps 100 AKT/month (Cronos → Akash)
- 1% routing fee

**Monthly Revenue:**
```
10 operators × 100 AKT × 1% = 10 AKT/month
At $0.50/AKT = $5/month
```

**At scale (100 operators):**
```
100 operators × 100 AKT × 1% = 100 AKT/month
At $0.50/AKT = $50/month
```

**Plus gas fee swaps, cross-chain routing, etc.**

### Capital Requirements

**Initial liquidity needed:**
- 10,000 AKT on Cronos EVM: ~$5,000
- 10,000 AKT on Akash: ~$5,000
- 5,000 CRO on Cronos: ~$600
- **Total:** ~$10,600

**You can start smaller:**
- 1,000 AKT per chain: ~$1,000 total
- Scale up as usage grows

## Implementation Roadmap

### Phase 1: Manual Connector (MVP)

**What:** You manually handle swaps for early relay operators

**How:**
1. Relay operator contacts you (Discord/Telegram)
2. They send AKT on Cronos → your address
3. You send AKT on Akash → their address
4. Manual fee calculation

**Timeline:** 1-2 weeks to set up

### Phase 2: Automated Quotes

**What:** API endpoint for instant quotes

```bash
GET /api/swap/quote?from=akt+cronos&to=akt+akash&amount=100
Response: {
  "destinationAmount": "99.0",
  "fee": "1.0",
  "route": "akt+cronos-mainnet+akt → akt+akash-mainnet+akt",
  "expiresIn": 300
}
```

**Timeline:** 2-4 weeks

### Phase 3: Full ILP Integration

**What:** Native Dassie connector with automatic routing

**Features:**
- Real-time liquidity checks
- Automatic settlement via Dassie modules
- Multi-hop routing (Cronos → Osmosis → Akash)
- Price oracles for exchange rates

**Timeline:** 1-2 months

### Phase 4: Automated Rebalancing

**What:** Integrate with Crypto.com API or DEX

**Features:**
- Automatic bridging when thresholds hit
- Market making on DEXs
- Yield optimization (stake idle AKT)

**Timeline:** 3-6 months

## Marketing & Distribution

### Target Audience

1. **Nostr relay operators** using nostream-ilp
2. **Future relay operators** evaluating payment options
3. **Akash deployers** needing multi-chain liquidity

### Value Proposition

**"Never manually bridge again."**

- Instant swaps (seconds, not hours)
- Lower fees than exchanges (1% vs 2-5%)
- No KYC required (peer-to-peer via ILP)
- 24/7 availability (automated)

### Go-to-Market

1. **Launch announcement** on Nostr (post to relays)
2. **Documentation** in nostream-ilp README
3. **Discord/Telegram bot** for manual swaps (Phase 1)
4. **API documentation** for automated swaps (Phase 2)
5. **Dassie plugin** for one-click integration (Phase 3)

## Risk Management

### Liquidity Risk

**Risk:** Run out of AKT on Akash, can't fulfill swaps

**Mitigation:**
- Monitor balances daily
- Alert when < 20% of minimum reserve
- Manual rebalance when hit threshold
- Eventually: automated rebalancing

### Price Risk

**Risk:** AKT/CRO exchange rate moves against you

**Mitigation:**
- Use real-time price oracles (CoinGecko API)
- Update rates every 5 minutes
- Add 0.5% buffer for volatility
- Limit swap sizes to reduce exposure

### Smart Contract Risk

**Risk:** Cronos payment channel contract has bug

**Mitigation:**
- ✅ 100% test coverage (Story 3.2)
- ✅ Testnet validation (Story 3.4)
- ✅ Mainnet deployment verified (Story 3.6)
- Only risk is ERC-20 AKT contract (external)

### Regulatory Risk

**Risk:** Swap service classified as money transmitter

**Mitigation:**
- Start small (under regulatory thresholds)
- Peer-to-peer model (not custodial)
- Geographic restrictions if needed
- Consult legal counsel before scaling

## Success Metrics

### Key Performance Indicators (KPIs)

1. **Monthly swap volume:** Total AKT swapped
2. **Number of active users:** Unique relay operators
3. **Average swap size:** Typical transaction
4. **Routing fee revenue:** Monthly income
5. **Liquidity utilization:** % of pools being used

### Target Milestones

**Month 1:**
- 3 relay operators using service
- 300 AKT monthly volume
- $1.50 revenue (3 AKT fees)

**Month 3:**
- 10 relay operators
- 1,000 AKT monthly volume
- $5 revenue

**Month 6:**
- 25 relay operators
- 5,000 AKT monthly volume
- $25 revenue

**Month 12:**
- 50+ relay operators
- 10,000+ AKT monthly volume
- $50+ monthly revenue
- Automated rebalancing operational

## Next Steps

1. **Document this vision** in nostream-ilp repo ✅ (this file!)
2. **Start Phase 1:** Set up manual swap service
3. **Announce on Nostr:** "Liquidity connector now available"
4. **Find first customer:** Offer free swap to first relay operator
5. **Iterate:** Build Phase 2 based on demand

---

## Conclusion

**This is the killer app for your Nostr-ILP integration!**

Instead of just building payment channels, you're building **essential infrastructure** for the entire Nostr-ILP ecosystem.

Every relay operator will need this service. You'll be the **AWS of Nostr liquidity** - providing shared infrastructure that everyone relies on.

And the best part? **You already have all the technical pieces from Epic 2 & 3!** Just need to add routing logic and market it.

---

**Status:** Conceptual design - ready for implementation in Epic 4+
**Dependencies:** Epic 3 complete ✅, Dassie settlement modules ✅
**Next Epic:** Epic 4 - ILP Liquidity Connector & Routing
