# Direct ILP Payments for Liquidity Swaps

## Why Direct ILP is Better for Liquidity Connector

### The Realization

**Payment channels** (what we built in Epic 3) are optimized for:
- High frequency (1000s of payments)
- Low latency (instant claims)
- Minimal per-payment cost

**Liquidity swaps** are different:
- Low frequency (once per month)
- One-time transfers (no repeat payments)
- Large amounts (100-1000 AKT)

**Direct ILP payments are perfect for this!**

## How Direct ILP Works (Already in Dassie!)

Dassie already supports direct ILP payments via the **STREAM protocol**:

```typescript
// Relay Operator wants to swap 100 AKT: Cronos → Akash

// Step 1: Request quote from connector
const quote = await fetch('https://connector.example.com/quote', {
  body: JSON.stringify({
    sourceLedger: 'akt+cronos-mainnet+akt',
    destinationLedger: 'akt+akash-mainnet+akt',
    sourceAmount: '100000000' // 100 AKT (6 decimals)
  })
});

// Quote response:
{
  "destinationAmount": "99000000", // 99 AKT (1% fee)
  "destinationAddress": "ilp.connector.akash.uakt.akash1youraddress",
  "expiresAt": "2025-12-01T12:00:00Z",
  "conditions": {
    "deliverTo": "akash1youraddress" // Your Akash address
  }
}

// Step 2: Send ILP payment via Dassie
const result = await dassie.sendPayment({
  destinationAddress: quote.destinationAddress,
  sourceAmount: '100000000',
  sourceLedger: 'akt+cronos-mainnet+akt'
});

// Step 3: Connector receives payment on Cronos
//         Connector sends AKT to your Akash address
//         All atomic via ILP conditions!
```

## Architecture: Two-Tier System

### Tier 1: User → Relay (Payment Channels)

**Why payment channels:**
- User posts 1000 notes/month
- Each note costs 10 sats
- Opening/closing channel once = cheaper than 1000 individual payments

**Flow:**
```
User opens channel → Posts 1000 notes → Relay claims batch → Channel closes
Gas cost: 2 transactions (open + close) vs 1000 transactions
Savings: 99.8% reduction in gas fees
```

### Tier 2: Relay → Connector (Direct ILP)

**Why direct ILP:**
- Relay swaps once per month
- Large amount (100 AKT = $50)
- One-time transfer
- Channel overhead not worth it

**Flow:**
```
Relay: Send 100 AKT on Cronos via ILP
Connector: Receive 100 AKT on Cronos
Connector: Send 99 AKT to Relay's Akash address
All atomic: Either both succeed or both fail
```

## Technical Implementation

### Connector Side (You)

```typescript
// packages/app-dassie/src/connector/ilp-swap-handler.ts

import { SigningStargateClient } from "@cosmjs/stargate";
import { ethers } from "ethers";

export class IlpSwapHandler {
  private cronosProvider: ethers.JsonRpcProvider;
  private akashClient: SigningStargateClient;

  /**
   * Handle incoming ILP payment for swap
   */
  async handleSwapRequest(ilpPayment: IlpPaymentRequest) {
    const { sourceAmount, sourceLedger, destinationLedger, destinationAddress } = ilpPayment;

    // Validate swap parameters
    if (sourceLedger !== 'akt+cronos-mainnet+akt') {
      throw new Error('Only Cronos AKT supported as source');
    }

    if (destinationLedger !== 'akt+akash-mainnet+akt') {
      throw new Error('Only Akash AKT supported as destination');
    }

    // Check liquidity
    const destAmount = this.calculateDestAmount(sourceAmount, 0.01); // 1% fee
    if (!await this.hasLiquidity('akt+akash-mainnet+akt', destAmount)) {
      throw new Error('Insufficient liquidity');
    }

    // Accept ILP payment (Dassie handles this via STREAM)
    // This automatically:
    // 1. Validates the ILP packet
    // 2. Checks fulfillment conditions
    // 3. Credits your Cronos AKT balance

    // Send AKT to destination on Akash
    const akashTx = await this.akashClient.sendTokens(
      this.akashAddress,
      destinationAddress, // Relay's Akash address
      [{ denom: 'uakt', amount: destAmount.toString() }],
      'auto'
    );

    console.log(`Swap complete: ${sourceAmount} Cronos AKT → ${destAmount} Akash AKT`);
    console.log(`Akash tx: ${akashTx.transactionHash}`);

    return {
      success: true,
      sourceAmount,
      destinationAmount: destAmount,
      fee: sourceAmount - destAmount,
      akashTxHash: akashTx.transactionHash
    };
  }

  private calculateDestAmount(sourceAmount: bigint, feePercent: number): bigint {
    return sourceAmount * BigInt(Math.floor((1 - feePercent) * 1000)) / 1000n;
  }

  private async hasLiquidity(ledger: string, amount: bigint): Promise<boolean> {
    // Check Akash balance
    const balance = await this.akashClient.getBalance(this.akashAddress, 'uakt');
    return BigInt(balance.amount) >= amount + this.minReserve;
  }
}
```

### Relay Operator Side (Client)

```typescript
// packages/relay-client/src/liquidity-swap.ts

import { DassieClient } from '@dassie/client';

export class LiquiditySwapClient {
  private dassie: DassieClient;
  private connectorIlpAddress: string;

  /**
   * Swap AKT from Cronos to Akash via ILP connector
   */
  async swapCronosToAkash(
    amountAkt: number,
    akashDestinationAddress: string
  ): Promise<SwapResult> {
    // Step 1: Get quote
    const quote = await this.getQuote(
      'akt+cronos-mainnet+akt',
      'akt+akash-mainnet+akt',
      amountAkt
    );

    console.log(`Quote: ${amountAkt} AKT → ${quote.destinationAmount} AKT`);
    console.log(`Fee: ${quote.fee} AKT (${quote.feePercent}%)`);

    // Step 2: Confirm with user
    if (!await this.confirmSwap(quote)) {
      return { success: false, reason: 'User cancelled' };
    }

    // Step 3: Send ILP payment
    // Dassie automatically routes through connector
    const payment = await this.dassie.sendPayment({
      destination: this.connectorIlpAddress,
      sourceAmount: (amountAkt * 1_000_000).toString(), // Convert to uakt
      sourceLedger: 'akt+cronos-mainnet+akt',
      destinationLedger: 'akt+akash-mainnet+akt',
      destinationMemo: akashDestinationAddress // Tell connector where to send
    });

    if (payment.status === 'fulfilled') {
      console.log('✅ Swap complete!');
      console.log(`You should receive ${quote.destinationAmount} AKT at ${akashDestinationAddress}`);

      return {
        success: true,
        sourceAmount: amountAkt,
        destinationAmount: quote.destinationAmount,
        fee: quote.fee,
        ilpTransactionId: payment.id
      };
    } else {
      return {
        success: false,
        reason: payment.error || 'Unknown error'
      };
    }
  }

  private async getQuote(
    sourceLedger: string,
    destinationLedger: string,
    amount: number
  ): Promise<Quote> {
    const response = await fetch(`${this.connectorUrl}/api/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceLedger,
        destinationLedger,
        sourceAmount: (amount * 1_000_000).toString()
      })
    });

    return response.json();
  }
}
```

## Benefits of Direct ILP

### 1. **Atomic Swaps**

ILP has built-in escrow via **conditional payments**:

```
If connector sends AKT to Akash address
Then relay's Cronos payment is released
Else relay gets refund

No trust needed! Protocol enforces atomicity.
```

### 2. **No Smart Contract Gas Fees**

Payment channels require:
- `openChannel()` = 0.054 CRO
- `closeChannel()` = 0.039 CRO
- **Total: 0.093 CRO per channel**

Direct ILP:
- Just the transfer itself
- **No channel overhead!**

For a one-time 100 AKT swap:
- Channel: 0.093 CRO gas + 1% routing fee
- Direct ILP: 1% routing fee only
- **Savings: 0.093 CRO (~$0.011)**

### 3. **Simpler UX**

**Payment channel flow:**
```
1. Approve AKT spending
2. Open channel (wait for tx)
3. Wait for settlement
4. Close channel (another tx)
Total: 4 steps, 2 gas fees
```

**Direct ILP flow:**
```
1. Send ILP payment (one step)
Total: 1 step, no gas fees
```

### 4. **Already Built in Dassie!**

From Epic 2, Dassie already supports:
- ✅ STREAM protocol (direct payments)
- ✅ Multi-ledger routing
- ✅ Conditional transfers
- ✅ Settlement modules for Cronos + Akash

**You don't need to build anything new!**

## When to Use Each

### Use Payment Channels When:
- ✅ High frequency (>100 payments)
- ✅ Small amounts (<1 AKT per payment)
- ✅ Same sender/recipient repeatedly
- ✅ Want to minimize per-payment cost

**Example:** User paying relay for 1000 Nostr events

### Use Direct ILP When:
- ✅ Low frequency (1-10 payments)
- ✅ Large amounts (>10 AKT per payment)
- ✅ One-time transfers
- ✅ Want atomic swaps

**Example:** Relay swapping 100 AKT for Akash hosting

## Implementation Plan

### Phase 1: Direct ILP Swaps (NOW!)

Since Dassie already supports direct ILP:

1. **Configure Dassie as connector:**
   ```bash
   cd ~/Documents/dassie
   # Enable both Cronos and Akash modules
   CRONOS_MAINNET_ENABLED=true
   AKASH_MAINNET_ENABLED=true
   pnpm dev
   ```

2. **Expose ILP address:**
   ```
   Your connector: ilp.yourconnector.com
   Cronos route: ilp.yourconnector.com.cronos.akt
   Akash route: ilp.yourconnector.com.akash.uakt
   ```

3. **Accept swap requests:**
   - Relay sends ILP payment to your Cronos address
   - You receive on Cronos, send on Akash
   - All handled by Dassie automatically!

### Phase 2: Add Quote API

Build simple REST API:

```typescript
POST /api/quote
{
  "sourceLedger": "akt+cronos-mainnet+akt",
  "destinationLedger": "akt+akash-mainnet+akt",
  "sourceAmount": "100000000"
}

Response:
{
  "destinationAmount": "99000000",
  "fee": "1000000",
  "feePercent": 1.0,
  "ilpAddress": "ilp.yourconnector.com.akash.uakt",
  "expiresAt": "2025-12-01T12:00:00Z"
}
```

### Phase 3: Client Library

Create npm package for relay operators:

```bash
npm install @nostream-ilp/swap-client

import { SwapClient } from '@nostream-ilp/swap-client';

const client = new SwapClient('https://connector.example.com');
await client.swap({
  from: 'cronos-akt',
  to: 'akash-akt',
  amount: 100,
  destination: 'akash1youraddress'
});
```

## Comparison Table

| Feature | Payment Channels | Direct ILP |
|---------|------------------|------------|
| **Best for** | High frequency | Low frequency |
| **Payments** | 100s - 1000s | 1 - 10 |
| **Amount** | Micropayments | Bulk transfers |
| **Gas fees** | 2 txs (open+close) | 0 txs |
| **Setup time** | Minutes | Seconds |
| **Atomicity** | On-chain escrow | ILP conditions |
| **Complexity** | Smart contract | Protocol only |
| **Built?** | ✅ Epic 3 | ✅ Epic 2 (Dassie) |

## Conclusion

**For the liquidity connector:**
- ❌ Don't use payment channels
- ✅ Use direct ILP payments (Dassie STREAM)

**Reasoning:**
1. Already built in Dassie ✅
2. Lower cost (no gas) ✅
3. Simpler UX ✅
4. Atomic swaps ✅
5. Perfect for one-time large transfers ✅

**Payment channels are still valuable** for the original use case:
- Users paying relay for Nostr events
- High frequency micropayments
- Where channel overhead is amortized

---

**Next step:** Test direct ILP payment between Cronos and Akash using your Dassie setup!
