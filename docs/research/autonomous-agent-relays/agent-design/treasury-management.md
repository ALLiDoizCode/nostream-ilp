# Autonomous Relay Treasury Management Algorithm

## Overview

The treasury management algorithm handles multi-chain balance tracking, AKT token swaps, and Akash lease renewal timing. It must autonomously maintain sufficient funds for relay operations while optimizing swap timing and minimizing transaction costs.

## Design Principles

1. **Safety First**: Always maintain operational reserves
2. **Cost Optimization**: Minimize swap fees and slippage
3. **Timing Intelligence**: Swap when conditions are favorable
4. **Multi-Chain Awareness**: Track balances across Base, Cronos, Arbitrum
5. **Automated Renewal**: Renew Akash leases before expiration

## Treasury Architecture

### Account Structure

```typescript
interface TreasuryAccounts {
  // Revenue accounts (EVM chains)
  revenue: {
    base: ChainAccount;       // Base revenue
    cronos: ChainAccount;     // Cronos revenue
    arbitrum: ChainAccount;   // Arbitrum revenue
  };

  // Operational accounts
  operations: {
    akash: AkashAccount;      // AKT balance for leases
    gas: Map<ChainId, GasAccount>; // Gas reserves per chain
    emergency: ChainAccount;  // Emergency reserve
  };

  // Swap accounts
  liquidity: {
    osmosis: OsmosisAccount;  // Osmosis DEX account
    crescent: CrescentAccount; // Crescent DEX account
  };
}

interface ChainAccount {
  chainId: string;
  address: string;
  balance: bigint;
  token: string;
  lastUpdated: number;
}

interface AkashAccount {
  address: string;
  aktBalance: bigint;
  uaktBalance: bigint;
  escrowBalance: bigint;
  lastUpdated: number;
}

interface GasAccount {
  chainId: string;
  nativeBalance: bigint;
  minimumRequired: bigint;
  topUpThreshold: bigint;
}
```

### Balance Aggregation

```typescript
class TreasuryBalanceAggregator {
  constructor(
    private evmProviders: Map<string, ethers.Provider>,
    private cosmosClients: Map<string, CosmosClient>
  ) {}

  /**
   * Aggregate balances across all chains
   */
  async aggregateBalances(): Promise<AggregatedBalance> {
    const [evmBalances, cosmosBalances] = await Promise.all([
      this.fetchEVMBalances(),
      this.fetchCosmosBalances()
    ]);

    const totalUSD = await this.convertToUSD([
      ...evmBalances,
      ...cosmosBalances
    ]);

    return {
      byChain: new Map([
        ...evmBalances.map(b => [b.chainId, b] as const),
        ...cosmosBalances.map(b => [b.chainId, b] as const)
      ]),
      totalUSD,
      lastUpdated: Date.now()
    };
  }

  /**
   * Fetch balances from EVM chains
   */
  private async fetchEVMBalances(): Promise<ChainBalance[]> {
    const balances: ChainBalance[] = [];

    for (const [chainId, provider] of this.evmProviders) {
      const address = await this.getAddress(chainId);

      // Native balance (ETH, CRO, etc.)
      const nativeBalance = await provider.getBalance(address);

      // USDC balance
      const usdcContract = new ethers.Contract(
        this.getUSDCAddress(chainId),
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );

      const usdcBalance = await usdcContract.balanceOf(address);

      balances.push({
        chainId,
        address,
        native: nativeBalance,
        tokens: new Map([
          ['USDC', usdcBalance]
        ]),
        lastUpdated: Date.now()
      });
    }

    return balances;
  }

  /**
   * Fetch balances from Cosmos chains
   */
  private async fetchCosmosBalances(): Promise<ChainBalance[]> {
    const balances: ChainBalance[] = [];

    for (const [chainId, client] of this.cosmosClients) {
      const address = await this.getCosmosAddress(chainId);

      const allBalances = await client.getAllBalances(address);

      const tokenBalances = new Map<string, bigint>();

      for (const coin of allBalances) {
        tokenBalances.set(
          coin.denom,
          BigInt(coin.amount)
        );
      }

      balances.push({
        chainId,
        address,
        native: tokenBalances.get('uakt') ?? 0n,
        tokens: tokenBalances,
        lastUpdated: Date.now()
      });
    }

    return balances;
  }

  /**
   * Convert balances to USD
   */
  private async convertToUSD(balances: ChainBalance[]): Promise<number> {
    let totalUSD = 0;

    for (const balance of balances) {
      // Get price for native token
      const nativePrice = await this.getTokenPrice(balance.chainId, 'native');
      totalUSD += Number(balance.native) * nativePrice / 1e18;

      // Get prices for other tokens
      for (const [token, amount] of balance.tokens) {
        const price = await this.getTokenPrice(balance.chainId, token);
        const decimals = this.getTokenDecimals(token);
        totalUSD += Number(amount) * price / Math.pow(10, decimals);
      }
    }

    return totalUSD;
  }

  private getAddress(chainId: string): string {
    // Get EVM address for chain
    return process.env[`${chainId.toUpperCase()}_ADDRESS`] ?? '';
  }

  private getCosmosAddress(chainId: string): string {
    // Get Cosmos address for chain
    return process.env[`${chainId.toUpperCase()}_ADDRESS`] ?? '';
  }

  private getUSDCAddress(chainId: string): string {
    const USDC_ADDRESSES: Record<string, string> = {
      'base': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      'arbitrum': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      'cronos': '0xc21223249CA28397B4B6541dfFaEcC539BfF0c59'
    };

    return USDC_ADDRESSES[chainId] ?? '';
  }

  private async getTokenPrice(chainId: string, token: string): Promise<number> {
    // Fetch from price oracle (CoinGecko, etc.)
    return 0; // Placeholder
  }

  private getTokenDecimals(token: string): number {
    const DECIMALS: Record<string, number> = {
      'USDC': 6,
      'uakt': 6,
      'ETH': 18,
      'CRO': 18
    };

    return DECIMALS[token] ?? 18;
  }
}

interface ChainBalance {
  chainId: string;
  address: string;
  native: bigint;
  tokens: Map<string, bigint>;
  lastUpdated: number;
}

interface AggregatedBalance {
  byChain: Map<string, ChainBalance>;
  totalUSD: number;
  lastUpdated: number;
}
```

## AKT Swap Decision Algorithm

### Swap Triggers

```typescript
interface SwapTriggers {
  // Balance thresholds
  minEVMBalance: number;        // Min USD in EVM tokens before swap ($50)
  safetyMargin: number;         // Reserve to keep ($20)
  maxEVMBalance: number;        // Max USD before mandatory swap ($200)

  // AKT balance thresholds
  minAKTBalance: number;        // Min AKT to maintain (100 AKT)
  targetAKTBalance: number;     // Target AKT balance (500 AKT)
  maxAKTBalance: number;        // Max AKT before selling (1000 AKT)

  // Price conditions
  priceChangeThreshold: number; // Min price change to trigger (5%)
  favorablePriceRatio: number;  // Favorable price vs MA (1.02 = 2% above)

  // Timing conditions
  minSwapInterval: number;      // Min time between swaps (3600000 = 1 hour)
  leaseRenewalBuffer: number;   // Time before lease expiry (86400000 = 24 hours)
}

const DEFAULT_SWAP_TRIGGERS: SwapTriggers = {
  minEVMBalance: 50,
  safetyMargin: 20,
  maxEVMBalance: 200,
  minAKTBalance: 100,
  targetAKTBalance: 500,
  maxAKTBalance: 1000,
  priceChangeThreshold: 0.05,
  favorablePriceRatio: 1.02,
  minSwapInterval: 3600000,
  leaseRenewalBuffer: 86400000
};
```

### Decision Algorithm

```typescript
class AKTSwapDecisionEngine {
  constructor(
    private balanceAggregator: TreasuryBalanceAggregator,
    private priceOracle: PriceOracle,
    private leaseManager: AkashLeaseManager,
    private triggers: SwapTriggers = DEFAULT_SWAP_TRIGGERS
  ) {}

  /**
   * Decide whether to swap and how much
   */
  async makeSwapDecision(): Promise<SwapDecision> {
    const [balances, aktPrice, leaseStatus, lastSwap] = await Promise.all([
      this.balanceAggregator.aggregateBalances(),
      this.priceOracle.getAKTPrice(),
      this.leaseManager.getLeaseStatus(),
      this.getLastSwapTime()
    ]);

    // Calculate total EVM balance
    const evmBalanceUSD = this.calculateEVMBalance(balances);

    // Calculate AKT balance
    const aktBalance = this.getAKTBalance(balances);

    // 1. Check swap interval
    if (Date.now() - lastSwap < this.triggers.minSwapInterval) {
      return {
        shouldSwap: false,
        reason: 'Too soon since last swap',
        amount: 0,
        direction: 'none'
      };
    }

    // 2. Emergency: Lease expiring soon
    if (this.isLeaseExpiringSoon(leaseStatus)) {
      const needed = this.calculateLeaseRenewalCost(leaseStatus);

      if (aktBalance < needed) {
        return {
          shouldSwap: true,
          reason: 'Emergency: Lease expiring soon',
          amount: needed - aktBalance,
          direction: 'evm-to-akt',
          urgency: 'high'
        };
      }
    }

    // 3. AKT balance too low
    if (aktBalance < this.triggers.minAKTBalance) {
      return {
        shouldSwap: true,
        reason: 'AKT balance below minimum',
        amount: this.triggers.targetAKTBalance - aktBalance,
        direction: 'evm-to-akt',
        urgency: 'medium'
      };
    }

    // 4. EVM balance accumulation
    if (evmBalanceUSD > this.triggers.maxEVMBalance) {
      return {
        shouldSwap: true,
        reason: 'EVM balance exceeds maximum',
        amount: (evmBalanceUSD - this.triggers.safetyMargin) / aktPrice.usd,
        direction: 'evm-to-akt',
        urgency: 'low'
      };
    }

    // 5. EVM balance sufficient for swap
    if (evmBalanceUSD > this.triggers.minEVMBalance + this.triggers.safetyMargin) {
      // Check price conditions
      const priceCondition = await this.checkPriceConditions(aktPrice);

      if (priceCondition.favorable) {
        return {
          shouldSwap: true,
          reason: `Favorable price: ${priceCondition.reason}`,
          amount: (evmBalanceUSD - this.triggers.safetyMargin) / aktPrice.usd,
          direction: 'evm-to-akt',
          urgency: 'low'
        };
      }
    }

    // 6. AKT balance too high (sell excess)
    if (aktBalance > this.triggers.maxAKTBalance) {
      return {
        shouldSwap: true,
        reason: 'AKT balance exceeds maximum',
        amount: aktBalance - this.triggers.targetAKTBalance,
        direction: 'akt-to-evm',
        urgency: 'low'
      };
    }

    // No swap needed
    return {
      shouldSwap: false,
      reason: 'Balances within target ranges',
      amount: 0,
      direction: 'none'
    };
  }

  /**
   * Calculate total EVM balance in USD
   */
  private calculateEVMBalance(balances: AggregatedBalance): number {
    let total = 0;

    for (const [chainId, balance] of balances.byChain) {
      if (this.isEVMChain(chainId)) {
        // Add USDC balance
        const usdc = balance.tokens.get('USDC') ?? 0n;
        total += Number(usdc) / 1e6; // USDC has 6 decimals
      }
    }

    return total;
  }

  /**
   * Get AKT balance
   */
  private getAKTBalance(balances: AggregatedBalance): number {
    const akashBalance = balances.byChain.get('akash');

    if (!akashBalance) {
      return 0;
    }

    const uakt = akashBalance.tokens.get('uakt') ?? 0n;
    return Number(uakt) / 1e6; // uAKT has 6 decimals
  }

  /**
   * Check if lease is expiring soon
   */
  private isLeaseExpiringSoon(leaseStatus: LeaseStatus): boolean {
    const timeUntilExpiry = leaseStatus.expiresAt - Date.now();
    return timeUntilExpiry < this.triggers.leaseRenewalBuffer;
  }

  /**
   * Calculate cost to renew lease
   */
  private calculateLeaseRenewalCost(leaseStatus: LeaseStatus): number {
    // Estimate 30 days of lease costs
    const dailyCost = leaseStatus.dailyCostUAKT / 1e6; // Convert to AKT
    return dailyCost * 30;
  }

  /**
   * Check price conditions for favorable swap
   */
  private async checkPriceConditions(
    currentPrice: TokenPrice
  ): Promise<PriceCondition> {
    // Get 7-day moving average
    const ma7 = await this.priceOracle.getMovingAverage('AKT', 7);

    // Check if current price is favorable (above MA)
    if (currentPrice.usd > ma7 * this.triggers.favorablePriceRatio) {
      return {
        favorable: false,
        reason: 'Price above moving average - wait for dip'
      };
    }

    // Check if price is significantly below MA (good buy opportunity)
    if (currentPrice.usd < ma7 * 0.95) {
      return {
        favorable: true,
        reason: `Price 5%+ below MA (${currentPrice.usd} vs ${ma7})`
      };
    }

    // Check recent price trend
    const priceChange24h = currentPrice.change24h;

    if (Math.abs(priceChange24h) > this.triggers.priceChangeThreshold) {
      if (priceChange24h < 0) {
        return {
          favorable: true,
          reason: `Price down ${Math.abs(priceChange24h)}% in 24h`
        };
      } else {
        return {
          favorable: false,
          reason: `Price up ${priceChange24h}% in 24h - wait`
        };
      }
    }

    // Neutral conditions - don't swap unless necessary
    return {
      favorable: false,
      reason: 'Price conditions neutral'
    };
  }

  private isEVMChain(chainId: string): boolean {
    return ['base', 'cronos', 'arbitrum'].includes(chainId);
  }

  private async getLastSwapTime(): Promise<number> {
    // Query from database
    return 0; // Placeholder
  }
}

interface SwapDecision {
  shouldSwap: boolean;
  reason: string;
  amount: number;
  direction: 'evm-to-akt' | 'akt-to-evm' | 'none';
  urgency?: 'low' | 'medium' | 'high';
}

interface TokenPrice {
  usd: number;
  change24h: number;
  timestamp: number;
}

interface PriceCondition {
  favorable: boolean;
  reason: string;
}

interface LeaseStatus {
  active: boolean;
  expiresAt: number;
  dailyCostUAKT: number;
}
```

## Chain Selection for Swaps

### Selection Algorithm

```typescript
class ChainSelector {
  constructor(
    private liquidityAnalyzer: LiquidityAnalyzer,
    private feeEstimator: FeeEstimator
  ) {}

  /**
   * Select best chain for swap
   */
  async selectChain(
    amount: number,
    direction: 'evm-to-akt' | 'akt-to-evm'
  ): Promise<ChainSelection> {
    const chains = await this.getAvailableChains(direction);

    const evaluations = await Promise.all(
      chains.map(chain => this.evaluateChain(chain, amount, direction))
    );

    // Sort by score (highest first)
    evaluations.sort((a, b) => b.score - a.score);

    const best = evaluations[0];

    return {
      chainId: best.chainId,
      route: best.route,
      estimatedOutput: best.estimatedOutput,
      fees: best.fees,
      score: best.score,
      reasoning: best.reasoning
    };
  }

  /**
   * Evaluate chain for swap
   */
  private async evaluateChain(
    chainId: string,
    amount: number,
    direction: 'evm-to-akt' | 'akt-to-evm'
  ): Promise<ChainEvaluation> {
    const [liquidity, fees, route] = await Promise.all([
      this.liquidityAnalyzer.getLiquidity(chainId, direction),
      this.feeEstimator.estimateFees(chainId, amount),
      this.findBestRoute(chainId, amount, direction)
    ]);

    // Calculate scores (0-100)
    const liquidityScore = Math.min(100, liquidity.depth / amount * 100);
    const feeScore = Math.max(0, 100 - fees.total / amount * 100);
    const slippageScore = Math.max(0, 100 - route.slippage * 100);

    // Weighted total score
    const score =
      liquidityScore * 0.4 +
      feeScore * 0.3 +
      slippageScore * 0.3;

    return {
      chainId,
      route,
      estimatedOutput: route.outputAmount,
      fees,
      score,
      reasoning: this.generateReasoning(liquidityScore, feeScore, slippageScore)
    };
  }

  /**
   * Find best swap route on chain
   */
  private async findBestRoute(
    chainId: string,
    amount: number,
    direction: 'evm-to-akt' | 'akt-to-evm'
  ): Promise<SwapRoute> {
    if (chainId === 'osmosis') {
      return this.findOsmosisRoute(amount, direction);
    } else if (chainId === 'crescent') {
      return this.findCrescentRoute(amount, direction);
    } else {
      throw new Error(`Unsupported chain: ${chainId}`);
    }
  }

  private async findOsmosisRoute(
    amount: number,
    direction: 'evm-to-akt' | 'akt-to-evm'
  ): Promise<SwapRoute> {
    // Query Osmosis pools
    const pools = await this.queryOsmosisPools();

    // Find best route (may involve multiple hops)
    // USDC -> OSMO -> AKT
    // or AKT -> OSMO -> USDC

    return {
      dex: 'osmosis',
      pools: ['pool-1', 'pool-2'],
      inputAmount: amount,
      outputAmount: amount * 0.98, // Example with 2% slippage
      slippage: 0.02,
      priceImpact: 0.01
    };
  }

  private async findCrescentRoute(
    amount: number,
    direction: 'evm-to-akt' | 'akt-to-evm'
  ): Promise<SwapRoute> {
    // Similar to Osmosis
    return {
      dex: 'crescent',
      pools: ['pool-1'],
      inputAmount: amount,
      outputAmount: amount * 0.99,
      slippage: 0.01,
      priceImpact: 0.005
    };
  }

  private async getAvailableChains(
    direction: 'evm-to-akt' | 'akt-to-evm'
  ): Promise<string[]> {
    // For now, use Osmosis and Crescent
    return ['osmosis', 'crescent'];
  }

  private async queryOsmosisPools(): Promise<any[]> {
    // Query Osmosis pool data
    return []; // Placeholder
  }

  private generateReasoning(
    liquidityScore: number,
    feeScore: number,
    slippageScore: number
  ): string {
    const reasons: string[] = [];

    if (liquidityScore > 80) {
      reasons.push('high liquidity');
    }

    if (feeScore > 70) {
      reasons.push('low fees');
    }

    if (slippageScore > 90) {
      reasons.push('minimal slippage');
    }

    return reasons.join(', ') || 'acceptable conditions';
  }
}

interface ChainSelection {
  chainId: string;
  route: SwapRoute;
  estimatedOutput: number;
  fees: FeeEstimate;
  score: number;
  reasoning: string;
}

interface ChainEvaluation {
  chainId: string;
  route: SwapRoute;
  estimatedOutput: number;
  fees: FeeEstimate;
  score: number;
  reasoning: string;
}

interface SwapRoute {
  dex: string;
  pools: string[];
  inputAmount: number;
  outputAmount: number;
  slippage: number;
  priceImpact: number;
}

interface FeeEstimate {
  gas: number;
  swap: number;
  bridge?: number;
  total: number;
}
```

## Swap Execution

### Execution Engine

```typescript
class SwapExecutor {
  constructor(
    private chainSelector: ChainSelector,
    private walletManager: WalletManager,
    private dexClients: Map<string, DexClient>
  ) {}

  /**
   * Execute swap
   */
  async executeSwap(decision: SwapDecision): Promise<SwapResult> {
    if (!decision.shouldSwap) {
      throw new Error('No swap decision made');
    }

    // 1. Select best chain
    const chainSelection = await this.chainSelector.selectChain(
      decision.amount,
      decision.direction
    );

    console.log(`Swapping on ${chainSelection.chainId}`);
    console.log(`Route: ${JSON.stringify(chainSelection.route)}`);
    console.log(`Estimated output: ${chainSelection.estimatedOutput}`);

    // 2. Prepare funds
    await this.prepareFunds(
      chainSelection.chainId,
      decision.direction,
      decision.amount
    );

    // 3. Execute swap
    const dexClient = this.dexClients.get(chainSelection.chainId);

    if (!dexClient) {
      throw new Error(`No DEX client for ${chainSelection.chainId}`);
    }

    const txHash = await dexClient.executeSwap(chainSelection.route);

    // 4. Wait for confirmation
    const receipt = await this.waitForConfirmation(
      chainSelection.chainId,
      txHash
    );

    // 5. Record swap
    await this.recordSwap({
      chainId: chainSelection.chainId,
      direction: decision.direction,
      inputAmount: decision.amount,
      outputAmount: chainSelection.estimatedOutput,
      txHash,
      timestamp: Date.now()
    });

    return {
      success: receipt.status === 'success',
      txHash,
      inputAmount: decision.amount,
      outputAmount: chainSelection.estimatedOutput,
      chainId: chainSelection.chainId
    };
  }

  /**
   * Prepare funds for swap (bridge if needed)
   */
  private async prepareFunds(
    targetChain: string,
    direction: 'evm-to-akt' | 'akt-to-evm',
    amount: number
  ): Promise<void> {
    if (direction === 'evm-to-akt') {
      // Need to bridge USDC from EVM to Cosmos
      await this.bridgeToCosmos(targetChain, amount);
    } else {
      // AKT is already on Cosmos chains
      // May need to IBC transfer to target chain
      await this.ibcTransfer(targetChain, amount);
    }
  }

  private async bridgeToCosmos(
    targetChain: string,
    amount: number
  ): Promise<void> {
    // Use Axelar or other bridge
    console.log(`Bridging ${amount} USDC to ${targetChain}`);
    // Implementation would use bridge SDK
  }

  private async ibcTransfer(
    targetChain: string,
    amount: number
  ): Promise<void> {
    // IBC transfer between Cosmos chains
    console.log(`IBC transfer ${amount} AKT to ${targetChain}`);
    // Implementation would use IBC SDK
  }

  private async waitForConfirmation(
    chainId: string,
    txHash: string
  ): Promise<TransactionReceipt> {
    // Poll for transaction confirmation
    return { status: 'success' }; // Placeholder
  }

  private async recordSwap(record: SwapRecord): Promise<void> {
    // Store swap in database
    console.log('Swap recorded:', record);
  }
}

interface SwapResult {
  success: boolean;
  txHash: string;
  inputAmount: number;
  outputAmount: number;
  chainId: string;
}

interface SwapRecord {
  chainId: string;
  direction: 'evm-to-akt' | 'akt-to-evm';
  inputAmount: number;
  outputAmount: number;
  txHash: string;
  timestamp: number;
}

interface TransactionReceipt {
  status: 'success' | 'failed';
}
```

## Akash Lease Renewal

### Renewal Timing Algorithm

```typescript
class AkashLeaseManager {
  private readonly RENEWAL_BUFFER = 86400000; // 24 hours
  private readonly CHECK_INTERVAL = 3600000;  // 1 hour

  constructor(
    private akashClient: AkashClient,
    private swapEngine: AKTSwapDecisionEngine
  ) {
    this.startRenewalMonitoring();
  }

  /**
   * Get current lease status
   */
  async getLeaseStatus(): Promise<LeaseStatus> {
    const lease = await this.akashClient.getCurrentLease();

    if (!lease) {
      throw new Error('No active lease found');
    }

    return {
      active: lease.state === 'active',
      expiresAt: lease.expiresAt,
      dailyCostUAKT: lease.price.amount
    };
  }

  /**
   * Check if lease needs renewal
   */
  async checkRenewal(): Promise<RenewalDecision> {
    const lease = await this.getLeaseStatus();

    const timeUntilExpiry = lease.expiresAt - Date.now();

    // Needs immediate renewal
    if (timeUntilExpiry < this.RENEWAL_BUFFER) {
      const cost = this.calculateRenewalCost(lease);

      return {
        shouldRenew: true,
        urgency: 'high',
        reason: `Lease expires in ${timeUntilExpiry / 3600000} hours`,
        cost
      };
    }

    // Proactive renewal (if balance is good and price is favorable)
    if (timeUntilExpiry < this.RENEWAL_BUFFER * 3) { // 3 days
      const cost = this.calculateRenewalCost(lease);

      // Check if we have sufficient AKT
      const aktBalance = await this.getAKTBalance();

      if (aktBalance > cost * 2) { // Have 2x needed
        return {
          shouldRenew: true,
          urgency: 'low',
          reason: 'Proactive renewal - sufficient balance',
          cost
        };
      }
    }

    return {
      shouldRenew: false,
      urgency: 'none',
      reason: 'Lease renewal not needed yet',
      cost: 0
    };
  }

  /**
   * Renew lease
   */
  async renewLease(days: number = 30): Promise<RenewalResult> {
    const lease = await this.getLeaseStatus();
    const cost = this.calculateRenewalCost(lease, days);

    // Ensure sufficient balance
    const aktBalance = await this.getAKTBalance();

    if (aktBalance < cost) {
      // Trigger swap
      console.log(`Insufficient AKT (${aktBalance} < ${cost}), triggering swap`);

      const swapDecision = await this.swapEngine.makeSwapDecision();

      if (swapDecision.shouldSwap) {
        // Execute swap would happen here
        throw new Error('Swap needed before renewal - implement swap first');
      } else {
        throw new Error('Insufficient AKT and no swap possible');
      }
    }

    // Execute renewal
    const txHash = await this.akashClient.renewLease(days);

    return {
      success: true,
      txHash,
      cost,
      daysExtended: days,
      newExpiryDate: Date.now() + days * 86400000
    };
  }

  /**
   * Calculate renewal cost
   */
  private calculateRenewalCost(
    lease: LeaseStatus,
    days: number = 30
  ): number {
    const dailyCostAKT = lease.dailyCostUAKT / 1e6;
    return dailyCostAKT * days;
  }

  private async getAKTBalance(): Promise<number> {
    const balance = await this.akashClient.getBalance();
    return Number(balance.amount) / 1e6;
  }

  /**
   * Start background monitoring
   */
  private startRenewalMonitoring(): void {
    setInterval(async () => {
      const decision = await this.checkRenewal();

      if (decision.shouldRenew && decision.urgency === 'high') {
        console.log('URGENT: Renewing lease');
        await this.renewLease();
      }
    }, this.CHECK_INTERVAL);
  }
}

interface RenewalDecision {
  shouldRenew: boolean;
  urgency: 'none' | 'low' | 'medium' | 'high';
  reason: string;
  cost: number;
}

interface RenewalResult {
  success: boolean;
  txHash: string;
  cost: number;
  daysExtended: number;
  newExpiryDate: number;
}
```

## Emergency Scenarios

### Emergency Handler

```typescript
class EmergencyHandler {
  constructor(
    private balanceAggregator: TreasuryBalanceAggregator,
    private swapExecutor: SwapExecutor,
    private leaseManager: AkashLeaseManager,
    private alertSystem: AlertSystem
  ) {}

  /**
   * Handle emergency scenarios
   */
  async handleEmergency(): Promise<void> {
    const [balances, leaseStatus] = await Promise.all([
      this.balanceAggregator.aggregateBalances(),
      this.leaseManager.getLeaseStatus()
    ]);

    // Scenario 1: Lease expiring in < 6 hours
    const timeUntilExpiry = leaseStatus.expiresAt - Date.now();

    if (timeUntilExpiry < 21600000) { // 6 hours
      await this.handleLeaseEmergency(leaseStatus, balances);
    }

    // Scenario 2: AKT price spike (10x)
    const aktPrice = await this.getAKTPrice();
    const ma7 = await this.getMovingAverage('AKT', 7);

    if (aktPrice > ma7 * 10) {
      await this.handlePriceSpike(aktPrice, balances);
    }

    // Scenario 3: Liquidity crisis (can't swap)
    const liquidityOK = await this.checkLiquidity();

    if (!liquidityOK) {
      await this.handleLiquidityCrisis(balances);
    }

    // Scenario 4: Gas depletion
    const gasCheck = await this.checkGasBalances(balances);

    if (!gasCheck.sufficient) {
      await this.handleGasDepletion(gasCheck);
    }
  }

  /**
   * Handle lease emergency
   */
  private async handleLeaseEmergency(
    leaseStatus: LeaseStatus,
    balances: AggregatedBalance
  ): Promise<void> {
    const cost = leaseStatus.dailyCostUAKT / 1e6 * 30;
    const aktBalance = this.getAKTBalance(balances);

    if (aktBalance < cost) {
      // CRITICAL: Emergency swap
      await this.alertSystem.sendCritical(
        'EMERGENCY: Lease expiring, swapping all available EVM funds to AKT'
      );

      const evmBalance = this.calculateEVMBalance(balances);

      // Swap with max slippage tolerance
      await this.swapExecutor.executeSwap({
        shouldSwap: true,
        reason: 'EMERGENCY: Lease expiring',
        amount: evmBalance * 0.95, // Keep 5% for gas
        direction: 'evm-to-akt',
        urgency: 'high'
      });
    }

    // Renew lease
    await this.leaseManager.renewLease(30);
  }

  /**
   * Handle AKT price spike
   */
  private async handlePriceSpike(
    currentPrice: number,
    balances: AggregatedBalance
  ): Promise<void> {
    const aktBalance = this.getAKTBalance(balances);

    // Calculate how much AKT we need for 90 days of operations
    const leaseStatus = await this.leaseManager.getLeaseStatus();
    const dailyCost = leaseStatus.dailyCostUAKT / 1e6;
    const reserveNeeded = dailyCost * 90;

    if (aktBalance > reserveNeeded * 2) {
      // We have excess AKT - sell half the excess
      const excess = aktBalance - reserveNeeded;
      const sellAmount = excess * 0.5;

      await this.alertSystem.sendWarning(
        `AKT price spiked to $${currentPrice}, selling ${sellAmount} AKT`
      );

      await this.swapExecutor.executeSwap({
        shouldSwap: true,
        reason: 'AKT price spike - taking profit',
        amount: sellAmount,
        direction: 'akt-to-evm',
        urgency: 'high'
      });
    }
  }

  /**
   * Handle liquidity crisis
   */
  private async handleLiquidityCrisis(
    balances: AggregatedBalance
  ): Promise<void> {
    await this.alertSystem.sendCritical(
      'LIQUIDITY CRISIS: Cannot swap, using emergency reserves'
    );

    // Reduce operations to minimum
    // - Stop accepting new events
    // - Extend lease with available AKT
    // - Wait for liquidity to return
  }

  /**
   * Handle gas depletion
   */
  private async handleGasDepletion(
    gasCheck: GasCheck
  ): Promise<void> {
    await this.alertSystem.sendWarning(
      `Low gas on ${gasCheck.chain}, topping up`
    );

    // Swap small amount to get native tokens for gas
    // Implementation would bridge from USDC to native token
  }

  private async getAKTPrice(): Promise<number> {
    return 0; // Placeholder
  }

  private async getMovingAverage(token: string, days: number): Promise<number> {
    return 0; // Placeholder
  }

  private async checkLiquidity(): Promise<boolean> {
    return true; // Placeholder
  }

  private async checkGasBalances(
    balances: AggregatedBalance
  ): Promise<GasCheck> {
    return { sufficient: true, chain: '' }; // Placeholder
  }

  private getAKTBalance(balances: AggregatedBalance): number {
    const akashBalance = balances.byChain.get('akash');
    const uakt = akashBalance?.tokens.get('uakt') ?? 0n;
    return Number(uakt) / 1e6;
  }

  private calculateEVMBalance(balances: AggregatedBalance): number {
    let total = 0;

    for (const [chainId, balance] of balances.byChain) {
      if (['base', 'cronos', 'arbitrum'].includes(chainId)) {
        const usdc = balance.tokens.get('USDC') ?? 0n;
        total += Number(usdc) / 1e6;
      }
    }

    return total;
  }
}

interface GasCheck {
  sufficient: boolean;
  chain: string;
}
```

## Worked Examples

### Example 1: Normal Operations

```
Initial State:
- Base USDC: $75
- Cronos USDC: $30
- Arbitrum USDC: $20
- Total EVM: $125
- AKT balance: 450 AKT
- Lease expires in: 15 days

Decision:
1. EVM balance ($125) > minEVMBalance ($50) ✓
2. Lease not expiring soon (15 days > 1 day) ✓
3. AKT balance (450) > minAKTBalance (100) ✓
4. EVM balance ($125) < maxEVMBalance ($200) ✓

Price Check:
- Current AKT: $2.50
- 7-day MA: $2.60
- Price below MA: favorable ✓

Action: Swap $105 to AKT (keeping $20 safety margin)
- Amount: $105 / $2.50 = 42 AKT
- New AKT balance: 492 AKT
- New EVM balance: $20
```

### Example 2: Lease Emergency

```
Initial State:
- Total EVM: $80
- AKT balance: 50 AKT
- Lease expires in: 12 hours
- Renewal cost: 100 AKT

Decision:
1. Lease expiring soon (12h < 24h) ✓
2. AKT balance (50) < renewal cost (100) ✓
3. EMERGENCY SWAP NEEDED

Action:
1. Swap all available EVM funds ($80 * 0.95 = $76)
2. $76 / $2.50 = 30.4 AKT
3. New AKT balance: 80.4 AKT
4. Still insufficient - ALERT HUMAN

Result: Emergency alert sent, operations suspended
```

### Example 3: Price Spike

```
Initial State:
- AKT balance: 800 AKT
- Current AKT price: $25 (10x spike from $2.50 MA)
- Daily lease cost: 3 AKT
- 90-day reserve needed: 270 AKT

Decision:
1. Price spike detected (10x) ✓
2. AKT balance (800) > reserve (270) * 2 ✓
3. Excess: 800 - 540 = 260 AKT
4. Sell 50% of excess: 130 AKT

Action: Sell 130 AKT at $25 = $3,250
- New AKT balance: 670 AKT (still > 2x reserve)
- New EVM balance: $3,250
```

## Performance Metrics

```typescript
interface TreasuryMetrics {
  // Balance metrics
  totalBalanceUSD: number;
  aktBalance: number;
  evmBalance: number;
  gasReserves: Map<string, number>;

  // Swap metrics
  totalSwaps: number;
  successfulSwaps: number;
  failedSwaps: number;
  avgSlippage: number;
  totalFeesUSD: number;

  // Timing metrics
  avgSwapInterval: number;
  fastestSwap: number;
  slowestSwap: number;

  // Lease metrics
  daysUntilExpiry: number;
  renewalHistory: number;
  avgRenewalCost: number;

  // Emergency metrics
  emergenciesTriggered: number;
  criticalAlertsn: number;
  manualInterventions: number;
}
```

## Testing Strategy

```typescript
describe('Treasury Management', () => {
  it('should aggregate balances correctly', async () => {
    const aggregator = new TreasuryBalanceAggregator(
      evmProviders,
      cosmosClients
    );

    const balances = await aggregator.aggregateBalances();

    expect(balances.totalUSD).toBeGreaterThan(0);
    expect(balances.byChain.size).toBeGreaterThan(0);
  });

  it('should decide to swap when EVM balance high', async () => {
    const engine = new AKTSwapDecisionEngine(
      aggregator,
      oracle,
      leaseManager,
      triggers
    );

    // Mock high EVM balance
    const decision = await engine.makeSwapDecision();

    expect(decision.shouldSwap).toBe(true);
    expect(decision.direction).toBe('evm-to-akt');
  });

  it('should select best chain for swap', async () => {
    const selector = new ChainSelector(liquidityAnalyzer, feeEstimator);

    const selection = await selector.selectChain(100, 'evm-to-akt');

    expect(selection.chainId).toBeDefined();
    expect(selection.score).toBeGreaterThan(0);
  });

  it('should renew lease before expiry', async () => {
    const manager = new AkashLeaseManager(akashClient, swapEngine);

    // Mock lease expiring soon
    const decision = await manager.checkRenewal();

    expect(decision.shouldRenew).toBe(true);
    expect(decision.urgency).toBe('high');
  });

  it('should handle emergency scenarios', async () => {
    const handler = new EmergencyHandler(
      aggregator,
      swapExecutor,
      leaseManager,
      alertSystem
    );

    // Mock lease emergency
    await handler.handleEmergency();

    // Verify emergency swap executed
    expect(swapExecutor.executeSwap).toHaveBeenCalled();
  });
});
```

## Conclusion

This treasury management algorithm provides:

1. **Multi-chain balance tracking**: Real-time aggregation across Base, Cronos, Arbitrum, Akash
2. **Intelligent swap timing**: Price-aware, balance-aware, urgency-aware
3. **Chain selection**: Optimal routing through Osmosis/Crescent DEXs
4. **Automated lease renewal**: Proactive renewal before expiration
5. **Emergency handling**: Price spikes, liquidity crises, lease emergencies

The system operates autonomously while maintaining safety margins and alerting humans only when absolutely necessary.

**Key Features:**
- Safety-first design with operational reserves
- Multi-factor swap decisions (balance, price, urgency)
- Optimal chain/route selection for swaps
- Proactive lease management
- Emergency scenario handling

Implementation integrates with existing EVM and Cosmos infrastructure and provides fully autonomous treasury operations.
