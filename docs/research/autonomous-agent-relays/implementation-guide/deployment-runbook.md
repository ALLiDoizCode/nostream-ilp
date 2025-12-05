# Autonomous Agent Deployment Runbook

## Overview

This runbook provides step-by-step procedures for deploying autonomous Nostr-ILP relay agents to Akash Network. It covers manual bootstrap (first agent), autonomous reproduction (subsequent agents), troubleshooting, migration, and shutdown procedures.

**Audience:** DevOps engineers, relay operators, autonomous system administrators

**Prerequisites:**
- Access to Akash Network (mainnet or testnet)
- Funded wallets (AKT for leases, CRO for operations)
- Docker images built and pushed to registry
- Domain name configured (optional but recommended)

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Manual Bootstrap - First Agent](#manual-bootstrap---first-agent)
3. [Autonomous Reproduction - Subsequent Agents](#autonomous-reproduction---subsequent-agents)
4. [Verification Procedures](#verification-procedures)
5. [Troubleshooting Guide](#troubleshooting-guide)
6. [Migration Procedures](#migration-procedures)
7. [Shutdown Procedures](#shutdown-procedures)
8. [Emergency Procedures](#emergency-procedures)
9. [Appendix: Command Reference](#appendix-command-reference)

---

## Pre-Deployment Checklist

### Environment Setup

- [ ] **Akash CLI installed**
  ```bash
  # Install Akash CLI
  curl -sSfL https://raw.githubusercontent.com/akash-network/node/master/install.sh | sh

  # Verify installation
  akash version
  ```

- [ ] **Wallet created and funded**
  ```bash
  # Create new wallet (save mnemonic securely!)
  akash keys add agent-wallet

  # Or import existing wallet
  akash keys add agent-wallet --recover

  # Check balance (need minimum 10 AKT)
  akash query bank balances $(akash keys show agent-wallet -a)
  ```

- [ ] **Docker images built**
  ```bash
  # Build agent relay image
  cd packages/agent-relay
  docker build -t ghcr.io/your-org/autonomous-agent-relay:latest .

  # Push to registry
  docker push ghcr.io/your-org/autonomous-agent-relay:latest
  ```

- [ ] **Configuration files prepared**
  ```bash
  # Create secrets directory
  mkdir -p ~/.nostr/secrets

  # Generate agent private key
  node scripts/generate-keys.js > ~/.nostr/secrets/agent-keys.json

  # Set proper permissions
  chmod 600 ~/.nostr/secrets/agent-keys.json
  ```

- [ ] **Domain name configured (optional)**
  ```bash
  # If using custom domain, prepare DNS records
  # You'll need to point domain to Akash provider after deployment
  ```

### Resource Planning

- [ ] **Determine initial resource requirements**
  ```typescript
  // Use cost calculator to estimate
  import { CostCalculator } from '@agent-deployment/utils';

  const calculator = new CostCalculator();
  const resources = calculator.calculateResourcesForBudget(5.0, 0.50); // $5/day, AKT=$0.50

  console.log('Recommended resources:', resources);
  // Output: { cpuUnits: 4, memorySize: "8Gi", storageSize: "100Gi", maxPricePerBlock: 2000 }
  ```

- [ ] **Estimate monthly costs**
  ```bash
  # Run cost estimation script
  node scripts/estimate-costs.js --cpu 4 --memory 8 --storage 100 --akt-price 0.50

  # Expected output:
  # Daily cost: 5.76 AKT ($2.88)
  # Monthly cost: 172.80 AKT ($86.40)
  ```

- [ ] **Ensure sufficient AKT balance**
  ```bash
  # Minimum balance = (daily cost × 30 days) + 10 AKT buffer
  # For $5/day target: ~200 AKT recommended
  ```

### Network Configuration

- [ ] **Choose Akash network**
  ```bash
  # Mainnet
  export AKASH_NET="https://raw.githubusercontent.com/akash-network/net/main/mainnet"
  export AKASH_CHAIN_ID="akashnet-2"
  export AKASH_NODE="https://rpc.akash.network:443"

  # Or testnet (recommended for first deployment)
  export AKASH_NET="https://raw.githubusercontent.com/akash-network/net/main/testnet"
  export AKASH_CHAIN_ID="testnet-02"
  export AKASH_NODE="https://rpc.testnet.akash.network:443"
  ```

- [ ] **Set wallet variables**
  ```bash
  export AKASH_ACCOUNT_ADDRESS=$(akash keys show agent-wallet -a)
  export AKASH_KEYRING_BACKEND=os
  export AKASH_GAS=auto
  export AKASH_GAS_ADJUSTMENT=1.25
  export AKASH_GAS_PRICES=0.025uakt
  export AKASH_SIGN_MODE=amino-json
  ```

---

## Manual Bootstrap - First Agent

### Step 1: Generate Agent Identity

```bash
# Run identity generation script
node scripts/generate-agent-identity.js

# Output:
# ✓ Agent identity generated
#   Agent ID: agent_a1b2c3d4e5f6...
#
#   Mnemonic (SAVE SECURELY):
#   witch collapse practice feed shame open despair creek road again ice least
#
#   Addresses:
#   - Akash (AKT):  akash1xyz...
#   - Cronos (CRO): 0xabc123...
#
#   Keys saved to: ~/.nostr/secrets/agent_a1b2c3d4e5f6/

# IMPORTANT: Save the mnemonic in a secure password manager
# This is the ONLY way to recover your agent if something goes wrong
```

**Manual verification:**
```bash
# Verify keys were generated
ls -la ~/.nostr/secrets/agent_*/

# Should see:
# - agent-keys.json (Nostr & Akash keys)
# - payment-keys.json (Cronos EVM keys)
# - arweave-wallet.json (Arweave JWK)
# - encryption.key (AES-256 key for sensitive data)
```

### Step 2: Fund Agent Accounts

```bash
# Display funding instructions
node scripts/show-funding-addresses.js --agent-id agent_a1b2c3d4e5f6

# Output:
# Fund the following addresses:
#
# 1. Akash (AKT) - for lease payments
#    Address: akash1xyz...
#    Minimum: 10 AKT
#    Recommended: 50 AKT (for ~30 days)
#
# 2. Cronos (CRO) - for payment channels
#    Address: 0xabc123...
#    Minimum: 100 CRO
#    Recommended: 500 CRO
#
# 3. Arweave (AR) - for permanent storage
#    Address: ar_wallet_abc...
#    Minimum: 0.1 AR
#    Recommended: 1 AR
```

**Fund via exchanges or bridges:**

```bash
# Option 1: Transfer from existing wallet
akash tx bank send \
  my-wallet \
  akash1xyz... \
  50000000uakt \
  --chain-id $AKASH_CHAIN_ID \
  --node $AKASH_NODE

# Option 2: Use Akash faucet (testnet only)
curl -X POST https://faucet.testnet.akash.network/claim \
  -H "Content-Type: application/json" \
  -d '{"address": "akash1xyz..."}'

# Option 3: Bridge from Cosmos Hub
# (Use IBC bridge UI at https://app.akash.network)
```

**Wait for funding confirmation:**
```bash
# Monitor balances
watch -n 5 'node scripts/check-balances.js --agent-id agent_a1b2c3d4e5f6'

# Output updates every 5 seconds:
# Agent: agent_a1b2c3d4e5f6
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Akash (AKT):    50.00 / 10.00 ✓
# Cronos (CRO):   500.00 / 100.00 ✓
# Arweave (AR):   1.00 / 0.10 ✓
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Status: Ready for deployment
```

### Step 3: Generate SDL Manifest

```bash
# Generate SDL based on traffic estimates and cost target
node scripts/generate-sdl.js \
  --agent-id agent_a1b2c3d4e5f6 \
  --cpu 4 \
  --memory 8Gi \
  --storage 100Gi \
  --target-cost 5.00 \
  --domain agent-a1b2c3d4e5f6.yourdomain.com \
  --output deploy.yaml

# Output:
# ✓ SDL generated: deploy.yaml
#
#   Resources:
#   - CPU: 4 cores
#   - Memory: 8Gi
#   - Storage: 100Gi (persistent) + 10Gi (ephemeral)
#
#   Estimated cost:
#   - Per block: 1800 uAKT
#   - Per day: 25.92 AKT ($12.96 @ $0.50/AKT)
#   - Per month: 777.60 AKT ($388.80 @ $0.50/AKT)
#
#   Services:
#   - agent-relay (main application)
#   - postgres (database)
#   - redis (cache)
```

**Review SDL:**
```bash
cat deploy.yaml

# Verify:
# - Image URLs are correct
# - Environment variables are set
# - Expose ports are configured (80, 443, 7946/udp)
# - Resource limits match expectations
# - Pricing is within budget
```

**Test SDL validity:**
```bash
# Validate SDL syntax
akash deployment validate deploy.yaml

# Expected output:
# deploy.yaml is valid deployment
```

### Step 4: Create Deployment on Akash

```bash
# Create deployment
akash tx deployment create deploy.yaml \
  --from agent-wallet \
  --chain-id $AKASH_CHAIN_ID \
  --node $AKASH_NODE \
  --gas $AKASH_GAS \
  --gas-adjustment $AKASH_GAS_ADJUSTMENT \
  --gas-prices $AKASH_GAS_PRICES \
  --yes

# Output:
# txhash: ABC123...
#
# Waiting for transaction to be included in block...
#
# ✓ Deployment created
#   DSEQ: 12345678
#   Owner: akash1xyz...

# Save deployment sequence number
export AKASH_DSEQ=12345678
```

**Monitor deployment status:**
```bash
# Check deployment status
akash query deployment get \
  --owner $AKASH_ACCOUNT_ADDRESS \
  --dseq $AKASH_DSEQ \
  --node $AKASH_NODE

# Wait for "state: open" (deployment accepting bids)
```

### Step 5: Review and Select Provider Bid

```bash
# Wait for bids (usually 30-60 seconds)
sleep 60

# List all bids
akash query market bid list \
  --owner $AKASH_ACCOUNT_ADDRESS \
  --dseq $AKASH_DSEQ \
  --node $AKASH_NODE

# Output:
# bids:
# - bid:
#     bid_id:
#       dseq: "12345678"
#       gseq: 1
#       oseq: 1
#       provider: akash1provider1...
#     price:
#       amount: "1750"
#       denom: uakt
#     state: open
# - bid:
#     bid_id:
#       dseq: "12345678"
#       gseq: 1
#       oseq: 1
#       provider: akash1provider2...
#     price:
#       amount: "1850"
#       denom: uakt
#     state: open
```

**Evaluate bids using selection script:**
```bash
# Run provider selection algorithm
node scripts/select-provider.js \
  --dseq $AKASH_DSEQ \
  --max-price 2000 \
  --output selection.json

# Output:
# Evaluating 5 bids...
#
# Top candidates:
# 1. akash1provider1... (Score: 87.5)
#    Price: 1750 uAKT/block
#    Uptime: 99.8%
#    Region: us-west
#    Reputation: 4.5 ⭐
#
# 2. akash1provider2... (Score: 82.3)
#    Price: 1850 uAKT/block
#    Uptime: 99.5%
#    Region: eu-central
#    Reputation: 4.2 ⭐
#
# Selected provider: akash1provider1...
# Selection saved to: selection.json

# Load selected provider
export AKASH_PROVIDER=$(jq -r '.provider' selection.json)
```

### Step 6: Accept Bid and Create Lease

```bash
# Accept bid from selected provider
akash tx market lease create \
  --dseq $AKASH_DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $AKASH_PROVIDER \
  --from agent-wallet \
  --chain-id $AKASH_CHAIN_ID \
  --node $AKASH_NODE \
  --gas $AKASH_GAS \
  --gas-adjustment $AKASH_GAS_ADJUSTMENT \
  --gas-prices $AKASH_GAS_PRICES \
  --yes

# Output:
# txhash: DEF456...
#
# ✓ Lease created
#   DSEQ: 12345678
#   Provider: akash1provider1...
#   Price: 1750 uAKT/block (~25.20 AKT/day)
```

**Verify lease is active:**
```bash
akash query market lease get \
  --owner $AKASH_ACCOUNT_ADDRESS \
  --dseq $AKASH_DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $AKASH_PROVIDER \
  --node $AKASH_NODE

# Should show: state: active
```

### Step 7: Send Manifest to Provider

```bash
# Upload deployment manifest to provider
akash provider send-manifest deploy.yaml \
  --dseq $AKASH_DSEQ \
  --provider $AKASH_PROVIDER \
  --from agent-wallet \
  --home ~/.akash

# Output:
# Sending manifest to provider...
# ✓ Manifest sent successfully
```

**Monitor deployment progress:**
```bash
# Check deployment logs
akash provider lease-logs \
  --dseq $AKASH_DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $AKASH_PROVIDER \
  --from agent-wallet \
  --follow

# You should see:
# [agent-relay] Starting autonomous agent relay...
# [agent-relay] Loading configuration...
# [postgres] PostgreSQL Database directory appears to contain a database; Skipping initialization
# [redis] Ready to accept connections
# [agent-relay] ✓ Database connected
# [agent-relay] ✓ Redis connected
# [agent-relay] ✓ Relay started on port 8080
```

### Step 8: Retrieve Deployment URI

```bash
# Get deployment status including URI
akash provider lease-status \
  --dseq $AKASH_DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $AKASH_PROVIDER \
  --from agent-wallet

# Output includes:
# services:
#   agent-relay:
#     ...
#     uris:
#       - "provider.akash.network:12345"
#     ...

# Save URI
export AGENT_URI=$(akash provider lease-status \
  --dseq $AKASH_DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $AKASH_PROVIDER \
  --from agent-wallet \
  --output json | jq -r '.services."agent-relay".uris[0]')

echo "Agent URI: https://$AGENT_URI"
```

**Configure DNS (if using custom domain):**
```bash
# Get provider IP
PROVIDER_IP=$(dig +short $(echo $AGENT_URI | cut -d: -f1))

# Add DNS records:
# A record: agent-a1b2c3d4e5f6.yourdomain.com -> $PROVIDER_IP
# Or CNAME: agent-a1b2c3d4e5f6.yourdomain.com -> $AGENT_URI

# Wait for DNS propagation
watch -n 5 'dig +short agent-a1b2c3d4e5f6.yourdomain.com'
```

### Step 9: Verify Deployment Health

```bash
# Check health endpoint
curl -s https://$AGENT_URI/health | jq

# Expected response:
# {
#   "status": "healthy",
#   "version": "1.0.0",
#   "agent_id": "agent_a1b2c3d4e5f6",
#   "services": {
#     "postgres": "healthy",
#     "redis": "healthy",
#     "relay": "healthy"
#   },
#   "uptime": "00:05:32"
# }

# Check relay info
curl -s https://$AGENT_URI/api/info | jq

# Expected response:
# {
#   "name": "Autonomous Agent agent_a1b2c3d4e5f6",
#   "description": "Self-managing Nostr relay with ILP payments",
#   "pubkey": "npub1xyz...",
#   "supported_nips": [1, 2, 4, 9, 11, 12, 15, 16, 20, 22, 28, 33, 40],
#   "software": "autonomous-agent-relay/1.0.0",
#   "version": "1.0.0",
#   "autonomous_mode": false,
#   "lease_id": "12345678"
# }
```

**Test WebSocket connection:**
```bash
# Use websocat or wscat to test
websocat wss://$AGENT_URI

# Send REQ message:
["REQ","sub1",{"kinds":[1],"limit":10}]

# Should receive events and EOSE:
["EVENT","sub1",{...event...}]
["EOSE","sub1"]
```

### Step 10: Activate Autonomous Mode

```bash
# Generate admin token
ADMIN_TOKEN=$(node scripts/generate-admin-token.js --agent-id agent_a1b2c3d4e5f6)

# Activate autonomous features
curl -X POST https://$AGENT_URI/api/admin/config \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "autonomous_mode": true,
    "self_deployment_enabled": true,
    "reproduction_enabled": false,
    "lease_id": "'$AKASH_DSEQ'",
    "provider_address": "'$AKASH_PROVIDER'"
  }' | jq

# Expected response:
# {
#   "status": "success",
#   "message": "Autonomous mode activated",
#   "config": {
#     "autonomous_mode": true,
#     "self_deployment_enabled": true,
#     "reproduction_enabled": false
#   }
# }
```

**Verify autonomous mode:**
```bash
curl -s https://$AGENT_URI/api/info | jq '.autonomous_mode'
# Should return: true
```

### Step 11: Configure Monitoring

```bash
# Set up health check monitoring
node scripts/setup-monitoring.js \
  --agent-id agent_a1b2c3d4e5f6 \
  --uri $AGENT_URI \
  --alert-channels slack,telegram

# Output:
# ✓ Monitoring configured
#   Health checks: Every 60 seconds
#   Alerts:
#     - Slack: #agent-alerts
#     - Telegram: @agent_status_bot
#
#   Metrics dashboard: https://grafana.yourdomain.com/d/agent_a1b2c3d4e5f6
```

**Test alerting:**
```bash
# Trigger test alert
curl -X POST https://$AGENT_URI/api/admin/test-alert \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Check Slack/Telegram for alert message
```

### Step 12: Document Deployment

```bash
# Save deployment info
cat > ~/.nostr/deployments/agent_a1b2c3d4e5f6.json <<EOF
{
  "agent_id": "agent_a1b2c3d4e5f6",
  "deployed_at": "$(date -Iseconds)",
  "akash": {
    "dseq": "$AKASH_DSEQ",
    "provider": "$AKASH_PROVIDER",
    "lease_price": "1750 uAKT/block"
  },
  "uri": "$AGENT_URI",
  "domain": "agent-a1b2c3d4e5f6.yourdomain.com",
  "autonomous_mode": true,
  "resources": {
    "cpu": "4 cores",
    "memory": "8Gi",
    "storage": "100Gi"
  }
}
EOF

# Backup mnemonic to secure storage
# CRITICAL: Store in password manager or hardware wallet
```

---

## Autonomous Reproduction - Subsequent Agents

Once the first agent is deployed and autonomous mode is activated, it can spawn child agents automatically based on triggers (high load, geographic demand, redundancy, etc.).

### Reproduction Flow

**1. Monitor Reproduction Events**

```bash
# Watch reproduction logs
akash provider lease-logs \
  --dseq $AKASH_DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $AKASH_PROVIDER \
  --from agent-wallet \
  --follow \
  | grep "reproduction"

# Example output:
# [agent-relay] Reproduction decision: shouldReproduce=true
# [agent-relay] Trigger: high_load
# [agent-relay] Reason: Load at 82.3% capacity, max vertical scale reached
# [agent-relay] Spawning child agent...
# [agent-relay] ✓ Child agent spawned: agent_b2c3d4e5f6g7
# [agent-relay] Child URI: https://provider2.akash.network:54321
```

**2. Verify Child Agent Deployment**

```bash
# Query parent agent for children
curl -s https://$AGENT_URI/api/admin/children \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq

# Response:
# {
#   "children": [
#     {
#       "agent_id": "agent_b2c3d4e5f6g7",
#       "pubkey": "npub1abc...",
#       "uri": "https://provider2.akash.network:54321",
#       "status": "active",
#       "spawned_at": "2025-12-05T10:30:00Z",
#       "lease_id": "12345679",
#       "provider": "akash1provider2...",
#       "role": "replica"
#     }
#   ],
#   "total": 1
# }
```

**3. Monitor Child Health**

```bash
# Check child health
CHILD_URI="https://provider2.akash.network:54321"

curl -s $CHILD_URI/health | jq

# Parent automatically monitors children via heartbeats
# View parent's child monitoring dashboard
curl -s https://$AGENT_URI/api/admin/children/health \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq

# Response:
# {
#   "agent_b2c3d4e5f6g7": {
#     "status": "healthy",
#     "last_heartbeat": "2025-12-05T10:35:42Z",
#     "uptime": "00:05:42",
#     "resources": {
#       "cpu_percent": 15,
#       "memory_percent": 45,
#       "disk_percent": 10
#     }
#   }
# }
```

**4. Enable Child Reproduction (Optional)**

By default, children cannot reproduce. To enable:

```bash
# Enable reproduction for child
curl -X POST $CHILD_URI/api/admin/config \
  -H "Authorization: Bearer $CHILD_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reproduction_enabled": true,
    "max_children": 3
  }' | jq

# WARNING: Only enable if you want exponential growth
# This allows children to spawn their own children (grandchildren)
```

### Manual Reproduction Trigger

If you want to manually trigger reproduction:

```bash
# Trigger reproduction on parent agent
curl -X POST https://$AGENT_URI/api/admin/reproduce \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Manual deployment for new region",
    "role": "replica",
    "target_cost_per_day": 5.0,
    "resources": {
      "cpu": 4,
      "memory": "8Gi",
      "storage": "100Gi"
    }
  }' | jq

# Response:
# {
#   "status": "success",
#   "child_agent_id": "agent_c3d4e5f6g7h8",
#   "deployment_dseq": "12345680",
#   "uri": "https://provider3.akash.network:43210",
#   "estimated_time": "5 minutes"
# }
```

---

## Verification Procedures

### Health Check Verification

```bash
#!/bin/bash
# verify-deployment.sh

AGENT_URI=$1

echo "Verifying deployment at $AGENT_URI..."
echo ""

# 1. Health endpoint
echo "1. Checking health endpoint..."
HEALTH=$(curl -s $AGENT_URI/health)
STATUS=$(echo $HEALTH | jq -r '.status')

if [ "$STATUS" == "healthy" ]; then
  echo "   ✓ Health check passed"
else
  echo "   ✗ Health check failed: $HEALTH"
  exit 1
fi

# 2. Service availability
echo "2. Checking service availability..."
SERVICES=$(echo $HEALTH | jq -r '.services | to_entries | map(select(.value == "healthy")) | length')
TOTAL=$(echo $HEALTH | jq -r '.services | length')

if [ "$SERVICES" -eq "$TOTAL" ]; then
  echo "   ✓ All $TOTAL services healthy"
else
  echo "   ✗ Only $SERVICES/$TOTAL services healthy"
  exit 1
fi

# 3. WebSocket connection
echo "3. Testing WebSocket connection..."
WS_TEST=$(echo '["REQ","test",{"kinds":[1],"limit":1}]' | websocat -n1 wss://$AGENT_URI 2>&1)

if [[ $WS_TEST == *"EVENT"* ]] || [[ $WS_TEST == *"EOSE"* ]]; then
  echo "   ✓ WebSocket connection successful"
else
  echo "   ✗ WebSocket connection failed"
  exit 1
fi

# 4. Relay info
echo "4. Verifying relay info..."
RELAY_INFO=$(curl -s $AGENT_URI/api/info)
AUTONOMOUS=$(echo $RELAY_INFO | jq -r '.autonomous_mode')

echo "   Agent ID: $(echo $RELAY_INFO | jq -r '.agent_id')"
echo "   Version: $(echo $RELAY_INFO | jq -r '.version')"
echo "   Autonomous: $AUTONOMOUS"

if [ "$AUTONOMOUS" == "true" ]; then
  echo "   ✓ Autonomous mode active"
fi

# 5. Resource metrics
echo "5. Checking resource usage..."
METRICS=$(curl -s $AGENT_URI/metrics)
CPU=$(echo $METRICS | grep 'agent_resource_usage_percent{resource="cpu"}' | awk '{print $2}')
MEMORY=$(echo $METRICS | grep 'agent_resource_usage_percent{resource="memory"}' | awk '{print $2}')
DISK=$(echo $METRICS | grep 'agent_resource_usage_percent{resource="disk"}' | awk '{print $2}')

echo "   CPU: ${CPU}%"
echo "   Memory: ${MEMORY}%"
echo "   Disk: ${DISK}%"

if (( $(echo "$CPU < 90" | bc -l) )) && (( $(echo "$MEMORY < 90" | bc -l) )) && (( $(echo "$DISK < 85" | bc -l) )); then
  echo "   ✓ Resource usage within limits"
else
  echo "   ⚠ High resource usage detected"
fi

echo ""
echo "✓ Deployment verification complete"
```

**Run verification:**
```bash
chmod +x verify-deployment.sh
./verify-deployment.sh $AGENT_URI
```

### Lease Verification

```bash
# Check lease is active and not expiring soon
akash query market lease get \
  --owner $AKASH_ACCOUNT_ADDRESS \
  --dseq $AKASH_DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $AKASH_PROVIDER \
  --node $AKASH_NODE \
  --output json | jq

# Verify:
# - state: "active"
# - Check created_at vs current time (should be recent)
```

### Treasury Balance Verification

```bash
# Check all treasury balances
node scripts/check-balances.js --agent-id agent_a1b2c3d4e5f6

# Ensure:
# - AKT balance > 7 days of lease costs
# - CRO balance sufficient for operations
# - AR balance sufficient for storage needs
```

---

## Troubleshooting Guide

### Deployment Creation Failed

**Symptom:** `akash tx deployment create` fails

**Common causes:**

1. **Insufficient AKT balance**
   ```bash
   # Check balance
   akash query bank balances $AKASH_ACCOUNT_ADDRESS --node $AKASH_NODE

   # Solution: Fund wallet with more AKT
   ```

2. **Invalid SDL syntax**
   ```bash
   # Validate SDL
   akash deployment validate deploy.yaml

   # Solution: Fix syntax errors in deploy.yaml
   ```

3. **Network connectivity**
   ```bash
   # Test RPC connection
   curl -s $AKASH_NODE/status

   # Solution: Check AKASH_NODE is reachable
   ```

### No Bids Received

**Symptom:** No providers bidding on deployment after 2+ minutes

**Common causes:**

1. **Price too low**
   ```bash
   # Increase max price in SDL
   # Edit deploy.yaml pricing section:
   pricing:
     agent-relay:
       denom: uakt
       amount: 3000  # Increase from 2000

   # Close old deployment and create new one
   akash tx deployment close --dseq $AKASH_DSEQ --from agent-wallet ...
   akash tx deployment create deploy.yaml --from agent-wallet ...
   ```

2. **Resource requirements too high**
   ```bash
   # Reduce resources in SDL
   # Lower CPU/memory/storage and retry
   ```

3. **Provider network issues**
   ```bash
   # Check provider status
   akash query provider list --node $AKASH_NODE

   # Try different network (mainnet vs testnet)
   ```

### Manifest Upload Failed

**Symptom:** `akash provider send-manifest` fails

**Common causes:**

1. **Provider unreachable**
   ```bash
   # Test provider connectivity
   akash provider lease-status \
     --dseq $AKASH_DSEQ \
     --gseq 1 \
     --oseq 1 \
     --provider $AKASH_PROVIDER \
     --from agent-wallet

   # Solution: Wait and retry, or close lease and select different provider
   ```

2. **Certificate issues**
   ```bash
   # Regenerate certificate
   akash tx cert generate client --from agent-wallet
   akash tx cert publish client --from agent-wallet
   ```

### Services Not Starting

**Symptom:** Deployment created but services fail to start

**Diagnosis:**
```bash
# Check logs
akash provider lease-logs \
  --dseq $AKASH_DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $AKASH_PROVIDER \
  --from agent-wallet

# Look for error messages in output
```

**Common causes:**

1. **Image pull failure**
   ```
   # Log shows:
   # Error: Failed to pull image "ghcr.io/your-org/autonomous-agent-relay:latest"

   # Solution: Make image public or add image pull secrets to SDL
   ```

2. **Missing environment variables**
   ```
   # Log shows:
   # Error: POSTGRES_PASSWORD is required

   # Solution: Add missing env vars to SDL
   ```

3. **Port conflicts**
   ```
   # Log shows:
   # Error: Address already in use (port 8080)

   # Solution: Change exposed ports in SDL
   ```

4. **Database initialization failure**
   ```
   # Log shows:
   # Error: Could not connect to PostgreSQL

   # Solution: Check postgres service definition in SDL
   # Ensure depends_on is set correctly
   ```

### Autonomous Mode Not Activating

**Symptom:** `/api/admin/config` returns error or autonomous_mode stays false

**Common causes:**

1. **Invalid admin token**
   ```bash
   # Regenerate token
   ADMIN_TOKEN=$(node scripts/generate-admin-token.js --agent-id agent_a1b2c3d4e5f6)

   # Retry activation
   ```

2. **Missing lease information**
   ```bash
   # Ensure lease_id and provider_address are correct
   curl -X POST https://$AGENT_URI/api/admin/config \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -H "Content-Type: application/json" \
     -d "{
       \"autonomous_mode\": true,
       \"lease_id\": \"$AKASH_DSEQ\",
       \"provider_address\": \"$AKASH_PROVIDER\"
     }"
   ```

3. **Keys not loaded**
   ```bash
   # Check logs for key loading errors
   akash provider lease-logs ... | grep -i "key"

   # Verify environment variables in SDL contain correct keys
   ```

### High Resource Usage

**Symptom:** CPU/Memory/Disk usage > 90%

**Diagnosis:**
```bash
# Check detailed metrics
curl -s https://$AGENT_URI/metrics | grep agent_resource_usage_percent

# Check current load
curl -s https://$AGENT_URI/api/admin/metrics | jq
```

**Solutions:**

1. **Scale vertically (increase resources)**
   ```bash
   # Agent should auto-scale if autonomous mode is enabled
   # Check logs for scaling events

   # Or manually update SDL and redeploy
   # Edit deploy.yaml with higher resources
   # Then update deployment (requires migration)
   ```

2. **Scale horizontally (spawn child agent)**
   ```bash
   # Trigger reproduction
   curl -X POST https://$AGENT_URI/api/admin/reproduce \
     -H "Authorization: Bearer $ADMIN_TOKEN" \
     -d '{"reason": "High resource usage"}'
   ```

### Lease Expiring Soon

**Symptom:** Alert: "Lease expiring in < 24 hours"

**Solution:**
```bash
# Agent should auto-renew if autonomous mode is enabled
# Check renewal status
curl -s https://$AGENT_URI/api/admin/lease-status | jq

# Manual renewal (if auto-renewal failed)
akash tx market lease renew \
  --dseq $AKASH_DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $AKASH_PROVIDER \
  --from agent-wallet \
  --chain-id $AKASH_CHAIN_ID \
  --node $AKASH_NODE
```

---

## Migration Procedures

### Provider Migration (Moving to Different Provider)

**When to migrate:**
- Current provider has degraded performance
- Current provider is offline
- Better pricing available elsewhere
- Geo-distribution requirements

**Migration process:**

```bash
#!/bin/bash
# migrate-provider.sh

OLD_DSEQ=$1
OLD_PROVIDER=$2

echo "Starting provider migration..."

# 1. Create new deployment (same SDL)
echo "Creating new deployment..."
NEW_DSEQ=$(akash tx deployment create deploy.yaml \
  --from agent-wallet \
  --chain-id $AKASH_CHAIN_ID \
  --node $AKASH_NODE \
  --gas auto \
  --gas-adjustment 1.25 \
  --gas-prices 0.025uakt \
  --yes \
  --output json | jq -r '.logs[0].events[] | select(.type=="akash.v1").attributes[] | select(.key=="dseq").value')

echo "New DSEQ: $NEW_DSEQ"

# 2. Wait for bids
sleep 60

# 3. Select provider (exclude old one)
NEW_PROVIDER=$(node scripts/select-provider.js \
  --dseq $NEW_DSEQ \
  --exclude $OLD_PROVIDER \
  --output /dev/stdout | jq -r '.provider')

echo "New provider: $NEW_PROVIDER"

# 4. Accept bid and create lease
akash tx market lease create \
  --dseq $NEW_DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $NEW_PROVIDER \
  --from agent-wallet \
  --chain-id $AKASH_CHAIN_ID \
  --node $AKASH_NODE \
  --yes

# 5. Send manifest
akash provider send-manifest deploy.yaml \
  --dseq $NEW_DSEQ \
  --provider $NEW_PROVIDER \
  --from agent-wallet

# 6. Wait for new deployment to be ready
echo "Waiting for new deployment..."
sleep 120

# 7. Get new URI
NEW_URI=$(akash provider lease-status \
  --dseq $NEW_DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $NEW_PROVIDER \
  --from agent-wallet \
  --output json | jq -r '.services."agent-relay".uris[0]')

echo "New URI: https://$NEW_URI"

# 8. Verify new deployment
./verify-deployment.sh $NEW_URI

# 9. Update DNS (if using custom domain)
echo "Update DNS to point to new URI: $NEW_URI"
echo "Press Enter when DNS is updated..."
read

# 10. Close old lease
echo "Closing old lease..."
akash tx deployment close \
  --dseq $OLD_DSEQ \
  --from agent-wallet \
  --chain-id $AKASH_CHAIN_ID \
  --node $AKASH_NODE \
  --yes

echo "✓ Migration complete"
```

**Run migration:**
```bash
chmod +x migrate-provider.sh
./migrate-provider.sh $AKASH_DSEQ $AKASH_PROVIDER
```

### Data Migration (Preserving State)

If you need to preserve data during migration:

```bash
# 1. Backup data from old deployment
akash provider exec \
  --dseq $OLD_DSEQ \
  --provider $OLD_PROVIDER \
  --service agent-relay \
  --from agent-wallet \
  -- pg_dump -U postgres nostream > backup.sql

# 2. Copy backup to local machine
akash provider download \
  --dseq $OLD_DSEQ \
  --provider $OLD_PROVIDER \
  --service agent-relay \
  --from agent-wallet \
  --remote /tmp/backup.sql \
  --local ./backup.sql

# 3. After new deployment is ready, restore data
akash provider upload \
  --dseq $NEW_DSEQ \
  --provider $NEW_PROVIDER \
  --service agent-relay \
  --from agent-wallet \
  --local ./backup.sql \
  --remote /tmp/backup.sql

akash provider exec \
  --dseq $NEW_DSEQ \
  --provider $NEW_PROVIDER \
  --service agent-relay \
  --from agent-wallet \
  -- psql -U postgres nostream < /tmp/backup.sql
```

**Note:** The agent should handle data persistence via Arweave backups automatically. Manual backup is only needed for very recent data not yet backed up.

---

## Shutdown Procedures

### Graceful Shutdown

```bash
#!/bin/bash
# shutdown-agent.sh

DSEQ=$1
PROVIDER=$2
AGENT_ID=$3

echo "Shutting down agent $AGENT_ID..."

# 1. Disable autonomous mode (prevent reproduction)
ADMIN_TOKEN=$(node scripts/generate-admin-token.js --agent-id $AGENT_ID)
AGENT_URI=$(akash provider lease-status \
  --dseq $DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $PROVIDER \
  --from agent-wallet \
  --output json | jq -r '.services."agent-relay".uris[0]')

curl -X POST https://$AGENT_URI/api/admin/config \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "autonomous_mode": false,
    "reproduction_enabled": false
  }'

echo "✓ Autonomous mode disabled"

# 2. Drain connections (wait for active connections to close)
echo "Draining connections..."
curl -X POST https://$AGENT_URI/api/admin/drain \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Monitor active connections
while true; do
  CONNECTIONS=$(curl -s https://$AGENT_URI/api/admin/metrics | jq -r '.active_connections')
  echo "Active connections: $CONNECTIONS"

  if [ "$CONNECTIONS" -eq "0" ]; then
    break
  fi

  sleep 10
done

echo "✓ All connections drained"

# 3. Backup data to Arweave
echo "Triggering final backup..."
curl -X POST https://$AGENT_URI/api/admin/backup \
  -H "Authorization: Bearer $ADMIN_TOKEN"

sleep 30  # Wait for backup to complete

# 4. Close lease
echo "Closing lease..."
akash tx deployment close \
  --dseq $DSEQ \
  --from agent-wallet \
  --chain-id $AKASH_CHAIN_ID \
  --node $AKASH_NODE \
  --yes

echo "✓ Lease closed"

# 5. Archive deployment info
mkdir -p ~/.nostr/archived-deployments
mv ~/.nostr/deployments/$AGENT_ID.json ~/.nostr/archived-deployments/

echo "✓ Shutdown complete"
```

**Run shutdown:**
```bash
chmod +x shutdown-agent.sh
./shutdown-agent.sh $AKASH_DSEQ $AKASH_PROVIDER agent_a1b2c3d4e5f6
```

### Emergency Shutdown

For immediate shutdown without graceful drain:

```bash
# Close lease immediately
akash tx deployment close \
  --dseq $AKASH_DSEQ \
  --from agent-wallet \
  --chain-id $AKASH_CHAIN_ID \
  --node $AKASH_NODE \
  --yes

# Deployment will terminate within 60 seconds
```

---

## Emergency Procedures

### Emergency: Insufficient AKT Balance

**Scenario:** Lease payment failing due to low AKT balance

```bash
# 1. Check current balance
BALANCE=$(akash query bank balances $AKASH_ACCOUNT_ADDRESS --node $AKASH_NODE --output json | jq -r '.balances[] | select(.denom=="uakt") | .amount')
echo "Current AKT balance: $(($BALANCE / 1000000)) AKT"

# 2. Trigger emergency swap from treasury
curl -X POST https://$AGENT_URI/api/admin/emergency-swap \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "from": "CRO",
    "to": "AKT",
    "amount": 50
  }'

# 3. Wait for swap confirmation
sleep 60

# 4. Verify balance increased
NEW_BALANCE=$(akash query bank balances $AKASH_ACCOUNT_ADDRESS --node $AKASH_NODE --output json | jq -r '.balances[] | select(.denom=="uakt") | .amount')
echo "New AKT balance: $(($NEW_BALANCE / 1000000)) AKT"
```

### Emergency: Provider Offline

**Scenario:** Provider becomes unresponsive

```bash
# 1. Verify provider is actually offline
akash provider lease-status \
  --dseq $AKASH_DSEQ \
  --gseq 1 \
  --oseq 1 \
  --provider $AKASH_PROVIDER \
  --from agent-wallet \
  --timeout 10s

# If timeout, provider is offline

# 2. Immediately start migration
./migrate-provider.sh $AKASH_DSEQ $AKASH_PROVIDER

# 3. Update monitoring to point to new deployment
```

### Emergency: Data Loss

**Scenario:** Deployment data corrupted or lost

```bash
# 1. Check latest Arweave backup
curl -s https://$AGENT_URI/api/admin/backups | jq -r '.[0]'

# Response:
# {
#   "tx_id": "arweave_tx_abc123...",
#   "timestamp": "2025-12-05T08:00:00Z",
#   "event_count": 50000
# }

# 2. Trigger restore from Arweave
curl -X POST https://$AGENT_URI/api/admin/restore \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "backup_tx_id": "arweave_tx_abc123..."
  }'

# 3. Monitor restore progress
curl -s https://$AGENT_URI/api/admin/restore-status | jq
```

### Emergency: Key Compromise

**Scenario:** Agent private key compromised

```bash
# 1. IMMEDIATELY disable autonomous mode
curl -X POST https://$AGENT_URI/api/admin/config \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"autonomous_mode": false}'

# 2. Close all active leases
for DSEQ in $(node scripts/list-agent-leases.js --agent-id $AGENT_ID); do
  akash tx deployment close --dseq $DSEQ --from agent-wallet --yes
done

# 3. Rotate all keys
node scripts/rotate-all-keys.js --agent-id $AGENT_ID

# 4. Deploy new agent with fresh keys
# Follow manual bootstrap process with new keys

# 5. Notify users of key change via Nostr
node scripts/broadcast-key-rotation.js \
  --old-pubkey $OLD_PUBKEY \
  --new-pubkey $NEW_PUBKEY
```

---

## Appendix: Command Reference

### Akash CLI Commands

```bash
# Wallet management
akash keys add <name>                           # Create new wallet
akash keys list                                 # List all wallets
akash keys show <name> -a                       # Show address
akash query bank balances <address>             # Check balance

# Deployment management
akash tx deployment create <sdl>                # Create deployment
akash query deployment list --owner <address>   # List deployments
akash query deployment get --dseq <dseq>        # Get deployment details
akash tx deployment update <sdl> --dseq <dseq>  # Update deployment
akash tx deployment close --dseq <dseq>         # Close deployment

# Market/Bidding
akash query market bid list --owner <address>   # List bids
akash tx market lease create --dseq <dseq>      # Create lease
akash query market lease list --owner <address> # List leases
akash query market lease get --dseq <dseq>      # Get lease details

# Provider interaction
akash provider send-manifest <sdl>              # Send manifest to provider
akash provider lease-status                     # Get deployment status
akash provider lease-logs                       # View logs
akash provider lease-events                     # View events
akash provider exec -- <command>                # Execute command in container
```

### Agent API Endpoints

```bash
# Public endpoints
GET  /health                     # Health check
GET  /api/info                   # Relay information (NIP-11)
GET  /metrics                    # Prometheus metrics
WS   /                           # WebSocket (Nostr relay)

# Admin endpoints (require Authorization header)
POST /api/admin/config           # Update configuration
GET  /api/admin/config           # Get configuration
GET  /api/admin/metrics          # Detailed metrics
GET  /api/admin/children         # List child agents
GET  /api/admin/children/health  # Child health status
POST /api/admin/reproduce        # Trigger reproduction
POST /api/admin/drain            # Drain connections
POST /api/admin/backup           # Trigger backup
GET  /api/admin/backups          # List backups
POST /api/admin/restore          # Restore from backup
POST /api/admin/emergency-swap   # Emergency treasury swap
POST /api/admin/test-alert       # Send test alert
```

### Helper Scripts

```bash
# Located in scripts/
generate-agent-identity.js       # Generate new agent identity
generate-admin-token.js          # Generate admin JWT token
show-funding-addresses.js        # Display funding addresses
check-balances.js                # Check all balances
generate-sdl.js                  # Generate SDL from config
select-provider.js               # Run provider selection algorithm
estimate-costs.js                # Estimate deployment costs
setup-monitoring.js              # Configure monitoring
verify-deployment.sh             # Verify deployment health
migrate-provider.sh              # Migrate to new provider
shutdown-agent.sh                # Graceful shutdown
```

---

## Summary

This runbook provides comprehensive procedures for:

1. **Manual Bootstrap** - Step-by-step first agent deployment
2. **Autonomous Reproduction** - Child agent spawning and management
3. **Verification** - Health checks and validation
4. **Troubleshooting** - Common issues and solutions
5. **Migration** - Provider and data migration procedures
6. **Shutdown** - Graceful and emergency shutdown
7. **Emergency Procedures** - Critical failure recovery

**Key Takeaways:**

- Save mnemonic securely during bootstrap
- Verify deployment health before activating autonomous mode
- Monitor treasury balances to prevent lease payment failures
- Use migration procedures for zero-downtime provider changes
- Test alerting channels after deployment
- Document all deployments for future reference

**Next Steps:**

1. Test deployment on Akash testnet first
2. Deploy to mainnet with minimal resources
3. Monitor for 24 hours before enabling reproduction
4. Gradually increase resources based on traffic
5. Enable reproduction only when confident in system stability

---

*Document Status: Complete*
*Last Updated: 2025-12-05*
*Author: Claude (Deployment Runbook)*
