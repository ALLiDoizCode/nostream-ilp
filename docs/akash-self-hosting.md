# Akash Self-Hosting API

## Overview

The Nostream-ILP relay includes built-in Akash Network deployment capabilities, enabling **peer-to-peer self-hosting**. Peers can programmatically deploy new relay nodes directly from the running relay container.

This enables:
- **Pay-to-deploy**: Users pay with ILP/AKT to deploy their own relay
- **Automated provisioning**: No manual deployment steps required
- **Decentralized hosting**: Each relay can spawn new relays on Akash Network
- **Self-sustaining network**: Relays can fund their own hosting costs

## Architecture

```
┌─────────────────────┐
│  Nostream Relay     │
│  (Running in Akash) │
│                     │
│  ┌───────────────┐  │
│  │ Akash CLI     │  │ ◄─── Installed in container
│  └───────────────┘  │
│         │           │
│         ▼           │
│  ┌───────────────┐  │
│  │ CLI Service   │  │ ◄─── TypeScript wrapper
│  └───────────────┘  │
│         │           │
│         ▼           │
│  ┌───────────────┐  │
│  │ REST API      │  │ ◄─── /api/akash/*
│  └───────────────┘  │
└─────────┬───────────┘
          │
          ▼
    Akash Network
    (Deploy new relay)
```

## Installation

The Akash CLI is automatically installed in the Docker container during build:

```dockerfile
# Dockerfile includes:
RUN apk add --no-cache bash curl jq
RUN curl -sSfL https://raw.githubusercontent.com/akash-network/node/master/install.sh | sh
```

No additional installation required!

## API Endpoints

### Check Akash CLI Status

```bash
GET /api/akash/status
```

**Response:**
```json
{
  "available": true,
  "version": "v1.1.1",
  "networks": ["mainnet", "testnet", "sandbox"]
}
```

---

### Create Deployment Wallet

```bash
POST /api/akash/wallet/create
Content-Type: application/json

{
  "walletName": "peer-wallet-1"
}
```

**Response:**
```json
{
  "success": true,
  "wallet": {
    "name": "peer-wallet-1",
    "address": "akash1...",
    "mnemonic": "word1 word2 word3 ... word12"
  },
  "warning": "Save mnemonic securely - it cannot be recovered"
}
```

⚠️ **CRITICAL**: Save the mnemonic immediately! It cannot be recovered.

---

### Import Existing Wallet

```bash
POST /api/akash/wallet/import
Content-Type: application/json

{
  "walletName": "peer-wallet-1",
  "mnemonic": "word1 word2 word3 ... word12"
}
```

---

### Check Wallet Balance

```bash
GET /api/akash/wallet/peer-wallet-1/balance?network=mainnet
```

**Response:**
```json
{
  "wallet": "peer-wallet-1",
  "address": "akash1...",
  "network": "mainnet",
  "balance": {
    "akt": 10.5,
    "uakt": 10500000
  },
  "sufficient": true
}
```

---

### Deploy Peer Node

```bash
POST /api/akash/deploy
Content-Type: application/json

{
  "walletName": "peer-wallet-1",
  "network": "mainnet",
  "sdlPath": "/app/akash/deploy.yaml"
}
```

**Response:**
```json
{
  "success": true,
  "deployment": {
    "dseq": "123456",
    "provider": "akash1provider...",
    "leaseId": "akash1.../123456/1/1/akash1provider...",
    "uri": "https://akash1provider....provider.akash.network",
    "cost": {
      "uaktPerBlock": 950,
      "aktPerMonth": 0.998,
      "estimatedUSDPerMonth": 4.99
    },
    "network": "mainnet"
  },
  "nextSteps": [
    "Wait 5-10 minutes for containers to start",
    "Check logs: GET /api/akash/deployment/123456/logs",
    "Access service at: https://akash1provider....provider.akash.network"
  ]
}
```

⏱️ **Deployment Time**: 5-15 minutes from request to running service

---

### Get Deployment Logs

```bash
GET /api/akash/deployment/123456/logs?walletName=peer-wallet-1&provider=akash1provider...&network=mainnet
```

**Response:**
```json
{
  "dseq": "123456",
  "provider": "akash1provider...",
  "logs": "[nostream] Starting relay...\n[postgres] Database ready...\n..."
}
```

---

### Close Deployment

```bash
DELETE /api/akash/deployment/123456
Content-Type: application/json

{
  "walletName": "peer-wallet-1",
  "network": "mainnet"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Deployment 123456 closed successfully",
  "note": "Unused deposit will be refunded to your wallet"
}
```

---

## Usage Examples

### Example 1: Deploy via API

```typescript
// Step 1: Create wallet
const walletRes = await fetch('http://relay.example.com/api/akash/wallet/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ walletName: 'my-peer-wallet' })
});

const { wallet } = await walletRes.json();
console.log('Wallet address:', wallet.address);
console.log('Mnemonic (SAVE THIS):', wallet.mnemonic);

// Step 2: Fund wallet with AKT (manual step - send AKT from exchange)
// Minimum: 5 AKT (~$25 at $5/AKT)

// Step 3: Check balance
const balanceRes = await fetch(
  'http://relay.example.com/api/akash/wallet/my-peer-wallet/balance?network=mainnet'
);
const { balance } = await balanceRes.json();
console.log('Balance:', balance.akt, 'AKT');

// Step 4: Deploy!
const deployRes = await fetch('http://relay.example.com/api/akash/deploy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    walletName: 'my-peer-wallet',
    network: 'mainnet'
  })
});

const { deployment } = await deployRes.json();
console.log('Deployment DSEQ:', deployment.dseq);
console.log('Monthly cost:', deployment.cost.estimatedUSDPerMonth, 'USD');
console.log('Service URI:', deployment.uri);

// Step 5: Wait for deployment to start (5-10 minutes)
await new Promise(resolve => setTimeout(resolve, 600000)); // 10 minutes

// Step 6: Check logs
const logsRes = await fetch(
  `http://relay.example.com/api/akash/deployment/${deployment.dseq}/logs?` +
  `walletName=my-peer-wallet&provider=${deployment.provider}&network=mainnet`
);
const { logs } = await logsRes.json();
console.log(logs);
```

---

### Example 2: Payment-Triggered Deployment

```typescript
// In your payment handler (after receiving ILP payment)
async function handleDeploymentPayment(paymentAmount: number, userPubkey: string) {
  // Verify payment is sufficient (e.g., 0.1 BTC or equivalent)
  if (paymentAmount < DEPLOYMENT_COST) {
    throw new Error('Insufficient payment');
  }

  // Create wallet for user
  const walletName = `user-${userPubkey.substring(0, 8)}`;
  await fetch('/api/akash/wallet/create', {
    method: 'POST',
    body: JSON.stringify({ walletName })
  });

  // Fund wallet from relay treasury
  await transferAKT(walletName, 5); // 5 AKT for deployment

  // Deploy on behalf of user
  const deployRes = await fetch('/api/akash/deploy', {
    method: 'POST',
    body: JSON.stringify({
      walletName,
      network: 'mainnet'
    })
  });

  const { deployment } = await deployRes.json();

  // Send deployment info to user via Nostr DM
  await sendNostrDM(userPubkey, {
    type: 'deployment-success',
    dseq: deployment.dseq,
    uri: deployment.uri,
    walletMnemonic: '...', // Include mnemonic for user to manage deployment
    cost: deployment.cost
  });

  return deployment;
}
```

---

## Security Considerations

### Wallet Management

- **Keyring Backend**: Uses `--keyring-backend test` for simplicity in container
- **Production**: Consider using encrypted keyring backend for production
- **Mnemonic Storage**: Never log or expose mnemonics in responses
- **Wallet Isolation**: Each peer gets isolated wallet

### API Access Control

The API includes rate limiting via `rateLimiterMiddleware`. Consider additional controls:

```typescript
// Add authentication middleware
router.use('/api/akash', authenticateUser, rateLimiterMiddleware, akashDeploymentRouter);

// Require payment before deployment
router.post('/api/akash/deploy', verifyPayment, async (req, res) => {
  // ... deploy logic
});
```

### Network Selection

- **Production**: Use `mainnet` only
- **Testing**: Use `testnet` or `sandbox`
- **Cost**: Mainnet requires real AKT tokens (~5 AKT = $25)

---

## Pricing Model

### Deployment Costs

| Item | Cost (AKT) | Cost (USD @ $5/AKT) |
|------|-----------|---------------------|
| Initial deposit | 5.0 | $25.00 |
| Monthly hosting | ~1.0 | ~$5.00 |
| Transaction fees | ~0.01 | ~$0.05 |
| **Total first month** | **~6.0** | **~$30.00** |
| **Subsequent months** | **~1.0** | **~$5.00** |

### Revenue Model

Relays can monetize deployments:

```
User pays relay: 0.01 BTC (~$1000 at $100k/BTC)
Relay cost: 6 AKT (~$30)
Relay profit: ~$970

Or:

Monthly subscription: $10/month
Relay cost: ~$5/month
Relay profit: ~$5/month per deployment
```

---

## Monitoring and Maintenance

### Health Checks

Monitor deployment health:

```bash
# Check deployment logs
curl "http://relay.example.com/api/akash/deployment/123456/logs?walletName=wallet&provider=provider&network=mainnet"

# Check container health
akash provider service-status --dseq 123456 --provider provider
```

### Auto-Renewal

Deployments continue until:
1. Wallet runs out of funds
2. Deployment is manually closed
3. Provider terminates lease

Consider implementing auto-funding:

```typescript
// Monitor wallet balances
setInterval(async () => {
  for (const wallet of activeWallets) {
    const balance = await akashCLI.getBalance(wallet.name, 'mainnet');
    if (balance < 2) {
      // Fund wallet from treasury
      await fundWallet(wallet.name, 5);
    }
  }
}, 3600000); // Check hourly
```

---

## Troubleshooting

### CLI Not Available

```json
{
  "available": false,
  "message": "Akash CLI not installed or not accessible"
}
```

**Solution**: Rebuild Docker image - CLI should be installed during build

---

### Insufficient Balance

```json
{
  "error": "Deployment failed",
  "details": "Insufficient balance: 2.5 AKT (minimum 5 AKT required)"
}
```

**Solution**: Fund wallet with at least 5 AKT before deployment

---

### No Provider Bids

Deployment times out waiting for bids.

**Solutions**:
- Increase pricing in SDL (`akash/deploy.yaml`)
- Try different network (mainnet has more providers)
- Check resource requirements (too high = no bids)

---

## Next Steps

1. **Test on Sandbox**: Deploy to Akash Sandbox first
2. **Implement Payments**: Integrate with ILP payment flows
3. **Add UI**: Build frontend for deployment management
4. **Monitor Costs**: Track deployment costs and revenues
5. **Scale**: Handle multiple concurrent deployments

---

## Related Documentation

- [Akash Network Documentation](https://docs.akash.network)
- [Akash CLI Reference](https://docs.akash.network/cli)
- [Story 8.3: Deploy to Akash Mainnet](../stories/8.3.story.md)
- [CLAUDE.md: Akash Network Deployment](../CLAUDE.md#integration-architecture)

---

**Last Updated**: 2025-12-11
