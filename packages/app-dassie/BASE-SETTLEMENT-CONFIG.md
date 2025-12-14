# Base L2 Settlement Module Configuration

## Overview

The Base L2 settlement module enables Dassie to accept payment channel claims on Base blockchain (Ethereum L2) using the MultiTokenPaymentChannelFactory contract. This module supports both native ETH and ERC-20 tokens (e.g., USDC).

**Contract Address (Base Mainnet):** `0xf7e968d6f3bdFC504A434288Ea3f243e033e846F`

## Environment Variables

### Base Mainnet Configuration

```bash
# Enable/disable Base mainnet settlement module
BASE_MAINNET_ENABLED=true

# Base mainnet RPC endpoint (required)
# Recommended: Use Alchemy, Infura, or public RPC
BASE_MAINNET_RPC_URL=https://mainnet.base.org

# MultiTokenPaymentChannelFactory contract address (deployed)
BASE_MAINNET_FACTORY_ADDRESS=0xf7e968d6f3bdFC504A434288Ea3f243e033e846F

# Relay's Ethereum address (recipient of payments)
BASE_MAINNET_RELAY_ADDRESS=0xYourRelayAddressHere

# Relay's private key (for closing channels and claiming funds)
# CRITICAL: Keep this secret! Never commit to git
BASE_MAINNET_RELAY_PRIVATE_KEY=0xYourPrivateKeyHere

# Minimum claim amount to trigger on-chain settlement (in wei)
# Default: 0.1 ETH = 100000000000000000 wei
BASE_SETTLEMENT_THRESHOLD=100000000000000000

# Time interval between settlement batches (in seconds)
# Default: 3600 seconds = 1 hour
BASE_SETTLEMENT_INTERVAL=3600

# Maximum gas limit per transaction
# Default: 500,000
BASE_GAS_LIMIT=500000

# Maximum gas price (in wei)
# Default: 10 gwei = 10000000000 wei
BASE_MAX_GAS_PRICE=10000000000

# Supported token addresses (optional)
# Base mainnet USDC address (default)
BASE_MAINNET_USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

### Base Sepolia Testnet Configuration

```bash
# Enable/disable Base Sepolia testnet settlement module
BASE_ENABLED=true

# Base Sepolia RPC endpoint
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# MultiTokenPaymentChannelFactory contract address (if deployed on Sepolia)
BASE_PAYMENT_CHANNEL_ADDRESS=0xYourSepoliaContractAddress

# Relay's Ethereum address (testnet)
BASE_RELAY_ADDRESS=0xYourTestnetRelayAddress

# Relay's private key (testnet)
BASE_RELAY_PRIVATE_KEY=0xYourTestnetPrivateKey

# Optional: USDC address on Sepolia (if available)
BASE_SEPOLIA_USDC_ADDRESS=0xSepoliaUSDCAddress
```

## Supported Tokens

### Native ETH
- **Token Address:** `0x0000000000000000000000000000000000000000` (address zero)
- **Decimals:** 18
- **Usage:** Default token for payment channels

### USDC (Base Mainnet)
- **Token Address:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Decimals:** 6
- **Usage:** Stablecoin alternative to ETH

## Usage Examples

### Opening a Channel with Native ETH

```typescript
import { createBaseClient } from './client'
import { openChannel } from './functions/channel-operations'
import { loadBaseMainnetConfig } from './config'

const config = loadBaseMainnetConfig()
const client = await createBaseClient(config)

const result = await openChannel(client, config, {
  tokenAddress: '0x0000000000000000000000000000000000000000', // Native ETH
  recipient: '0xRelayAddress...',
  amount: BigInt('10000000000000000'), // 0.01 ETH in wei
  duration: 86400, // 24 hours
})

console.log('Channel ID:', result.channelId)
console.log('Transaction Hash:', result.txHash)
console.log('Expiration:', result.expiration)
```

### Opening a Channel with USDC

```typescript
import { createBaseClient } from './client'
import { openChannel } from './functions/channel-operations'
import { loadBaseMainnetConfig } from './config'

const config = loadBaseMainnetConfig()
const client = await createBaseClient(config)

// Step 1: Approve USDC spending (if not already approved)
// This step is typically done by the client wallet

// Step 2: Open channel
const result = await openChannel(client, config, {
  tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
  recipient: '0xRelayAddress...',
  amount: BigInt('10000000'), // 10 USDC (6 decimals)
  duration: 86400, // 24 hours
})

console.log('Channel ID:', result.channelId)
console.log('Transaction Hash:', result.txHash)
```

### Verifying Payment Claims

Payment claims are verified off-chain via the RPC endpoint:

```typescript
// Called by Nostream relay
const verification = await dassieClient.payment.verifyPaymentClaim.mutate({
  channelId: '0x1234...', // 32-byte channel ID
  amountSats: 100000, // Amount claimed (standardized across currencies)
  nonce: 5, // Monotonically increasing nonce
  signature: '0xabcd...', // ECDSA signature from payer
  currency: 'BASE', // Settlement currency
})

if (verification.valid) {
  // Accept Nostr event
  console.log('Payment verified! Amount:', verification.amountSats)
} else {
  // Reject event
  console.error('Invalid payment:', verification.reason)
}
```

## Security Considerations

### Private Key Management

**CRITICAL:** The `BASE_MAINNET_RELAY_PRIVATE_KEY` controls access to all funds in payment channels!

- **Never commit private keys to version control**
- Store in secure environment variables or secrets manager
- Use hardware wallets for production deployments
- Rotate keys regularly
- Monitor for unauthorized access

### RPC Endpoint Security

- Use authenticated RPC endpoints (Alchemy, Infura)
- Implement rate limiting on RPC calls
- Monitor RPC usage and costs
- Have fallback RPC endpoints

### Contract Security

- MultiTokenPaymentChannelFactory has been audited
- Uses OpenZeppelin ReentrancyGuard
- Nonce-based replay protection
- Signature verification via ECDSA

### Operational Security

- Monitor channel balances regularly
- Set appropriate settlement thresholds
- Automate channel closure before expiration
- Keep settlement gas costs under control

## Settlement Strategy

The module automatically settles channels when:

1. **Threshold reached:** Claim amount ≥ `BASE_SETTLEMENT_THRESHOLD`
2. **Time interval exceeded:** Time since last claim ≥ `BASE_SETTLEMENT_INTERVAL`
3. **Near expiration:** Less than 24 hours until channel expires
4. **High claim count:** 100+ claims accumulated

## Monitoring

### Recommended Metrics

- **Channel count:** Number of open channels
- **Total locked value:** Sum of all channel balances
- **Claim rate:** Claims per hour
- **Settlement frequency:** Settlements per day
- **Gas costs:** Total gas spent on settlements
- **Failed transactions:** Count and reasons

### Health Checks

```typescript
import { createBaseClient } from './client'

const client = await createBaseClient(config)
const isHealthy = await client.checkHealth()

if (!isHealthy) {
  console.error('Base RPC endpoint unreachable!')
}
```

## Troubleshooting

### "Invalid signature" errors
- Verify channel sender's public key matches signature
- Check message format matches contract expectations
- Ensure nonce is correctly encoded

### "Insufficient balance" errors
- Channel capacity exceeded
- Check on-chain channel state with `getChannel()`

### "Channel expired" errors
- Close channel before expiration (24 hours buffer recommended)
- Set up automated channel renewal

### "RPC connection failed" errors
- Verify RPC URL is correct
- Check API key/authentication
- Test RPC endpoint independently

## Additional Resources

- [Base L2 Documentation](https://docs.base.org)
- [MultiTokenPaymentChannelFactory Contract](https://basescan.org/address/0xf7e968d6f3bdFC504A434288Ea3f243e033e846F)
- [Epic 2 PRD: Multi-Blockchain Settlement](../../../docs/prd/epic-2-dassie-multi-blockchain-settlement-modules.md)
- [Story 2.11: MultiToken Integration](../../../docs/stories/2.11.story.md)

---

**Last Updated:** 2025-12-14
**Story:** 2.11 - Integrate MultiTokenPaymentChannelFactory with Dassie
