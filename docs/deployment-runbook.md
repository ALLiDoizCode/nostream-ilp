# Akash Mainnet Deployment Runbook

## Version Information

- **Runbook Version**: 1.0
- **Last Updated**: 2025-12-11
- **Network**: Akash Mainnet (akashnet-2)
- **Story**: 8.3 - Deploy to Akash Mainnet

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Methods](#deployment-methods)
4. [Post-Deployment Verification](#post-deployment-verification)
5. [Troubleshooting](#troubleshooting)
6. [Maintenance](#maintenance)
7. [Security](#security)

---

## Prerequisites

### Required Software

| Software | Minimum Version | Installation |
|----------|----------------|--------------|
| Akash CLI | v0.6.1+ | `curl -sSfL https://raw.githubusercontent.com/akash-network/provider/main/install.sh \| sh` |
| Node.js | v22.x LTS | `https://nodejs.org/` |
| Docker | v24.x | `https://docs.docker.com/get-docker/` |
| jq | Latest | `brew install jq` (macOS) or `apt install jq` (Linux) |

### Required Resources

1. **Akash Mainnet Wallet**
   - Wallet created with mnemonic stored in `.akash-wallet.txt`
   - Minimum **5 AKT** balance (deployment deposit + transaction fees)
   - Wallet address: Check with `grep "Address:" .akash-wallet.txt`

2. **Domain Name** (Optional but recommended)
   - DNS management access (for CNAME/A record)
   - Domain example: `relay.nostr-ilp.network`

3. **Docker Images**
   - Nostream image published to registry (e.g., `ghcr.io/yourorg/nostream-ilp:v1.0.0`)
   - PostgreSQL image: `postgres:16-alpine`
   - Redis image: `redis:7-alpine`

### Wallet Funding

**How to get AKT tokens:**

1. **Purchase from exchanges**:
   - Kraken: https://www.kraken.com/
   - Gate.io: https://www.gate.io/
   - Osmosis DEX: https://osmosis.zone/

2. **Check wallet balance**:
   ```bash
   npm run akash:balance -- mainnet
   ```

3. **Minimum recommended balance**: 5 AKT
   - ~4.5 AKT for deployment deposit
   - ~0.5 AKT for transaction fees
   - Deposit is refundable when closing deployment

---

## Pre-Deployment Checklist

### Step 1: Verify Wallet Balance

```bash
# Check wallet address
grep "Address:" .akash-wallet.txt

# Check balance (requires 5+ AKT)
npm run akash:balance -- mainnet
```

**Expected Output:**
```
Wallet: akash10ah0ah4mqx5trfcyux5ygtgayfgp3aksfeqwrc
Balance: 5.123456 AKT
```

✅ **Checkpoint**: Wallet has at least 5 AKT

---

### Step 2: Verify Docker Images

```bash
# Check if images are accessible
docker pull nostream-ilp:v1.0.0-mainnet || echo "Image needs to be built/pushed"
docker pull postgres:16-alpine
docker pull redis:7-alpine
```

If images don't exist:

```bash
# Build and tag mainnet image
docker build -t nostream-ilp:v1.0.0-mainnet -f Dockerfile .

# Optionally push to registry (if using ghcr.io)
# docker tag nostream-ilp:v1.0.0-mainnet ghcr.io/yourorg/nostream-ilp:v1.0.0
# docker push ghcr.io/yourorg/nostream-ilp:v1.0.0
```

✅ **Checkpoint**: All Docker images are available

---

### Step 3: Review Production Environment Variables

```bash
cat akash/.env.mainnet
```

**Required variables (must be set):**

| Variable | Status | Generation Command |
|----------|--------|-------------------|
| `SECRET` | ✅ Generated | `openssl rand -hex 32` |
| `DB_PASSWORD` | ✅ Generated | `openssl rand -hex 16` |
| `REDIS_PASSWORD` | ✅ Generated | `openssl rand -hex 16` |
| `DASSIE_RPC_TOKEN` | ✅ Generated | `openssl rand -hex 32` |
| `DOMAIN` | ⚠️ Update after deployment | Provider URI from lease |
| `DASHBOARD_PASSWORD` | ⚠️ Change default | User-defined password |

**Action Items:**
1. Change `DASHBOARD_PASSWORD` from `changeme_after_deployment` to a strong password
2. `DOMAIN` will be updated after getting provider URI

✅ **Checkpoint**: Environment variables reviewed and updated

---

### Step 4: Review Akash SDL Configuration

```bash
cat akash/deploy.yaml
```

**Verify image tags:**
- `nostream` service: Image should be `nostream-ilp:v1.0.0-mainnet` (not `:latest`)
- `postgres` service: Image should be `postgres:16-alpine` (not `:latest`)
- `redis` service: Image should be `redis:7-alpine` (not `:latest`)

**Verify pricing (current configuration):**
- Nostream: 550 uAKT/block
- PostgreSQL: 300 uAKT/block
- Redis: 100 uAKT/block
- **Total**: 950 uAKT/block (~$4.99/month at $5/AKT)

**Verify resource allocation:**
- Nostream: 0.5 CPU, 1Gi RAM, 10Gi storage
- PostgreSQL: 0.25 CPU, 512Mi RAM, 20Gi storage
- Redis: 0.1 CPU, 256Mi RAM, 1Gi storage
- **Total**: 0.85 CPU, 1.75Gi RAM, 31Gi storage

✅ **Checkpoint**: SDL configuration is production-ready

---

## Deployment Methods

### Method 1: Using Akash CLI (Recommended)

The Akash CLI is the **production-stable method** for mainnet deployment. The SDK has known gRPC issues (see Story 8.3 research findings).

#### Step 1: Set Environment Variables

```bash
export AKASH_NODE=https://rpc.akashnet.net:443
export AKASH_CHAIN_ID=akashnet-2
export AKASH_KEYRING_BACKEND=test
export AKASH_GAS=auto
export AKASH_GAS_ADJUSTMENT=1.5
export AKASH_GAS_PRICES=0.025uakt
export AKASH_YES=true
```

#### Step 2: Import Wallet

```bash
# Extract mnemonic from wallet file
MNEMONIC=$(grep "^main action" .akash-wallet.txt)

# Import to Akash CLI keyring (if not already done)
echo "$MNEMONIC" | akash keys add mainnet-wallet --recover --keyring-backend test
```

#### Step 3: Create Deployment

```bash
# Create deployment transaction
akash tx deployment create akash/deploy.yaml \
  --from mainnet-wallet \
  --node https://rpc.akashnet.net:443 \
  --chain-id akashnet-2 \
  --keyring-backend test \
  --gas auto \
  --gas-adjustment 1.5 \
  --gas-prices 0.025uakt \
  --yes

# Save the deployment sequence number (DSEQ) from output
# Example output: "dseq: 1234567"
export DSEQ=<DSEQ_FROM_OUTPUT>
```

**Expected Output:**
```
code: 0
txhash: ABC123...
...
dseq: 1234567
```

✅ **Checkpoint**: Deployment created successfully, DSEQ recorded

---

#### Step 4: Monitor Bid Acceptance

```bash
# Wait 1-3 minutes for providers to bid

# List bids for your deployment
akash query market bid list --dseq $DSEQ --node https://rpc.akashnet.net:443

# You should see multiple bids from different providers
```

**Expected Output:**
```
bids:
- bid:
    bid_id:
      dseq: "1234567"
      gseq: 1
      oseq: 1
      owner: akash10ah0ah4mqx5trfcyux5ygtgayfgp3aksfeqwrc
      provider: akash1abcdef...
    created_at: "1234567890"
    price:
      amount: "950"
      denom: uakt
    state: open
...
```

If pricing ≤ 950 uAKT/block, Akash will **automatically accept** the lowest bid.

✅ **Checkpoint**: Bids received, lease automatically created

---

#### Step 5: Verify Lease Creation

```bash
# Check lease status
akash query market lease list --dseq $DSEQ --node https://rpc.akashnet.net:443

# Extract provider address
export PROVIDER=$(akash query market lease list --dseq $DSEQ --node https://rpc.akashnet.net:443 -o json | jq -r '.leases[0].lease.lease_id.provider')

echo "Provider: $PROVIDER"
```

**Expected Output:**
```
leases:
- lease:
    lease_id:
      dseq: "1234567"
      gseq: 1
      oseq: 1
      owner: akash10ah0ah4mqx5trfcyux5ygtgayfgp3aksfeqwrc
      provider: akash1provider...
    price:
      amount: "950"
      denom: uakt
    state: active
```

✅ **Checkpoint**: Lease is active, provider assigned

---

#### Step 6: Wait for Service Startup

```bash
# Provider will now:
# 1. Pull Docker images (~2-5 minutes)
# 2. Start containers (~1-2 minutes)
# 3. Run database migrations (~30 seconds)

# Monitor logs to see startup progress
akash provider service-logs \
  --node https://rpc.akashnet.net:443 \
  --dseq $DSEQ \
  --provider $PROVIDER \
  --service nostream

# Wait for "Server listening on port 8008" message
```

**Estimated Startup Time**: 4-8 minutes

✅ **Checkpoint**: Services started successfully

---

#### Step 7: Get Public Service URI

```bash
# Get service status with URIs
akash provider service-status \
  --node https://rpc.akashnet.net:443 \
  --dseq $DSEQ \
  --provider $PROVIDER

# Extract the URI for port 443 (HTTPS/WSS) and 8080 (Dashboard)
export SERVICE_URI=<PROVIDER_URI_FROM_OUTPUT>
```

**Expected Output:**
```json
{
  "services": {
    "nostream": {
      "available": 1,
      "ready": 1,
      "uris": [
        "provider.akash.network:443",
        "provider.akash.network:8080"
      ]
    }
  }
}
```

**Save URIs:**
- WebSocket (WSS): `wss://provider.akash.network:443`
- Dashboard: `https://provider.akash.network:8080`

✅ **Checkpoint**: Public URIs obtained

---

### Method 2: Using CLI Wrapper Script (Alternative)

For simplified CLI deployment:

```bash
# Use the wrapper script
./scripts/akash-cli-deploy.sh

# Follow interactive prompts
```

This script automates the CLI steps above.

---

### Method 3: Using SDK (NOT RECOMMENDED)

⚠️ **WARNING**: The Akash SDK (`@akashnetwork/chain-sdk@1.0.0-alpha.0`) has critical gRPC issues and is NOT production-ready. See Story 8.3 research findings for details.

The SDK option has been **removed** from this runbook. Use CLI only.

---

## Post-Deployment Verification

### Step 1: Configure DNS (Optional)

If you have a domain name:

```bash
# Create DNS record pointing to provider URI
# Example: relay.nostr-ilp.network → provider.akash.network

# CNAME record (recommended):
relay.nostr-ilp.network.  CNAME  provider.akash.network.

# Or A record (if provider gives you an IP):
relay.nostr-ilp.network.  A  123.45.67.89
```

**Wait for DNS propagation (5-60 minutes):**

```bash
# Test DNS resolution
dig relay.nostr-ilp.network

# Or use nslookup
nslookup relay.nostr-ilp.network
```

✅ **Checkpoint**: DNS resolves to provider URI

---

### Step 2: Verify HTTPS Access

```bash
# Test health endpoint
curl https://$SERVICE_URI:8080/health

# Expected response:
# {"status":"healthy","services":{"nostream":"up","postgresql":"up","redis":"up"}}
```

If using domain:
```bash
curl https://relay.nostr-ilp.network:8080/health
```

**Check TLS certificate:**
```bash
openssl s_client -connect $SERVICE_URI:443 -servername $SERVICE_URI
```

Akash providers automatically provision Let's Encrypt certificates.

✅ **Checkpoint**: HTTPS working with valid TLS

---

### Step 3: Test WebSocket Connection

```bash
# Install wscat if not already installed
npm install -g wscat

# Connect to relay
wscat -c wss://$SERVICE_URI:443
```

**Once connected, send Nostr REQ message:**
```json
["REQ", "test-sub", {"kinds": [1], "limit": 10}]
```

**Expected responses:**
1. `EVENT` messages (if any events exist)
2. `["EOSE", "test-sub"]` (End of Stored Events)

**Test CLOSE:**
```json
["CLOSE", "test-sub"]
```

✅ **Checkpoint**: WebSocket and Nostr protocol working

---

### Step 4: Test NIP-11 Relay Information

```bash
# Get relay information document
curl https://$SERVICE_URI -H "Accept: application/nostr+json"
```

**Expected response (JSON):**
```json
{
  "name": "Nostr-ILP Relay",
  "description": "Nostr relay with ILP payment integration",
  "pubkey": "...",
  "contact": "...",
  "supported_nips": [1, 2, 4, 9, 11, 15, 20, 22, 28, 33, 40],
  "software": "nostream",
  "version": "2.1.0"
}
```

✅ **Checkpoint**: NIP-11 working

---

### Step 5: Access Operator Dashboard

```bash
# Open dashboard in browser
open https://$SERVICE_URI:8080
```

**Login credentials:**
- Username: `admin` (from `DASHBOARD_USERNAME`)
- Password: `<your_updated_password>` (from `DASHBOARD_PASSWORD`)

**Verify dashboard shows:**
- Service status (nostream, postgresql, redis)
- Event count
- Active connections
- Resource usage

✅ **Checkpoint**: Dashboard accessible and functional

---

### Step 6: Run Integration Tests

```bash
# Run integration tests against production deployment
RELAY_URL=wss://$SERVICE_URI:443 npm run test:integration
```

**Expected Output:**
```
✓ test/integration/docker-stack.spec.ts (6 tests) 3.45s
  ✓ Docker stack integration tests (6 tests) 3.45s
    ✓ should have nostream container running
    ✓ should have postgres container running
    ✓ should have redis container running
    ✓ should connect to relay via WebSocket
    ✓ should publish and retrieve events
    ✓ should handle subscriptions correctly

Test Files  1 passed (1)
     Tests  6 passed (6)
```

✅ **Checkpoint**: All integration tests passing

---

### Step 7: Verify Deployment Cost

```bash
# Get lease details with pricing
akash query market lease get \
  --dseq $DSEQ \
  --provider $PROVIDER \
  --node https://rpc.akashnet.net:443

# Extract pricing (should be ≤950 uAKT/block)
```

**Calculate monthly cost:**
```bash
# Formula:
# Blocks per month ≈ 1,051,200 (30 days × 24h × 60m × 60s / 6s per block)
# Monthly AKT = (uAKT_per_block × blocks_per_month) / 1,000,000
# Monthly USD = Monthly AKT × AKT_USD_rate

# Example for 950 uAKT/block at $5/AKT:
# Monthly AKT = (950 × 1,051,200) / 1,000,000 = 0.998 AKT
# Monthly USD = 0.998 × $5 = $4.99
```

✅ **Checkpoint**: Cost is ≤$5/month as expected

---

### Step 8: Monitor Deployment Logs

```bash
# Stream logs from all services
akash provider service-logs \
  --node https://rpc.akashnet.net:443 \
  --dseq $DSEQ \
  --provider $PROVIDER \
  --follow

# Check for errors or warnings
# Look for:
# - "Server listening on port 8008" (nostream started)
# - "Database migrations completed" (postgres ready)
# - No connection errors to Redis
```

✅ **Checkpoint**: No critical errors in logs

---

## Troubleshooting

### Issue 1: Insufficient AKT Balance

**Symptom**: Deployment creation fails with "insufficient funds"

**Cause**: Wallet doesn't have enough AKT for deposit + fees

**Resolution**:
1. Check balance: `npm run akash:balance -- mainnet`
2. Fund wallet with at least 5 AKT from exchange
3. Wait for transaction confirmation (1-2 minutes)
4. Retry deployment

---

### Issue 2: No Provider Bids

**Symptom**: No bids appear after 5+ minutes

**Causes**:
- Pricing too low in SDL
- Resources too high (no providers have capacity)
- Network congestion

**Resolution**:

```bash
# Close failed deployment
akash tx deployment close \
  --dseq $DSEQ \
  --from mainnet-wallet \
  --node https://rpc.akashnet.net:443 \
  --chain-id akashnet-2

# Option 1: Increase pricing in akash/deploy.yaml
# Change amounts: 600, 350, 150 (instead of 550, 300, 100)

# Option 2: Reduce resources slightly
# CPU: 0.4, 0.2, 0.05 (instead of 0.5, 0.25, 0.1)

# Redeploy with updated SDL
akash tx deployment create akash/deploy.yaml ...
```

---

### Issue 3: Image Pull Failures

**Symptom**: Provider logs show "failed to pull image"

**Causes**:
- Image doesn't exist in registry
- Image tag is incorrect
- Registry is unreachable

**Resolution**:

```bash
# Verify image exists locally
docker images | grep nostream-ilp

# If image doesn't exist, build it
docker build -t nostream-ilp:v1.0.0-mainnet -f Dockerfile .

# For Akash, image must be in Docker Hub or ghcr.io
# Push to registry:
docker tag nostream-ilp:v1.0.0-mainnet ghcr.io/yourorg/nostream-ilp:v1.0.0
docker push ghcr.io/yourorg/nostream-ilp:v1.0.0

# Update akash/deploy.yaml with full registry path
# image: ghcr.io/yourorg/nostream-ilp:v1.0.0

# Close deployment and redeploy with updated SDL
```

---

### Issue 4: Service Fails to Start

**Symptom**: Provider logs show container exits or crashes

**Causes**:
- Missing environment variables
- Database migration errors
- Out of memory (OOM)

**Resolution**:

```bash
# Check logs for specific error
akash provider service-logs \
  --node https://rpc.akashnet.net:443 \
  --dseq $DSEQ \
  --provider $PROVIDER \
  --service nostream

# Common fixes:
# - Missing env var: Add to akash/deploy.yaml env section
# - Migration error: Check database connectivity, verify schema
# - OOM: Increase memory in SDL (1Gi → 1.5Gi)

# Update SDL and redeploy
akash tx deployment update akash/deploy.yaml --dseq $DSEQ ...
```

---

### Issue 5: TLS Certificate Not Working

**Symptom**: Certificate errors when accessing HTTPS

**Causes**:
- DNS not propagated yet
- Let's Encrypt rate limits hit
- Provider certificate provisioning failed

**Resolution**:

```bash
# Wait for DNS propagation (can take 5-60 minutes)
dig relay.nostr-ilp.network

# If DNS is correct, provider should auto-provision cert
# Check provider logs for certificate errors

# Alternative: Use provider URI directly (bypasses DNS)
curl https://provider.akash.network:8080/health

# If provider URI works but domain doesn't, it's a DNS issue
```

---

### Issue 6: Cannot Connect via WebSocket

**Symptom**: `wscat` connection fails or times out

**Causes**:
- Port 443 not exposed correctly
- Provider firewall rules
- TLS handshake failure

**Resolution**:

```bash
# Verify port exposure in akash/deploy.yaml
# Ensure global: true is set for port 443

# Test with curl first (simpler than WebSocket)
curl -I https://$SERVICE_URI:443

# If curl works but wscat doesn't, check wscat version
npm update -g wscat

# Try connecting with specific TLS version
wscat -c wss://$SERVICE_URI:443 --no-check
```

---

### Deployment Rollback Procedure

If deployment is critically broken:

```bash
# 1. Close deployment (refunds remaining balance)
akash tx deployment close \
  --dseq $DSEQ \
  --from mainnet-wallet \
  --node https://rpc.akashnet.net:443 \
  --chain-id akashnet-2 \
  --keyring-backend test

# 2. Fix issues in SDL or environment
# Edit akash/deploy.yaml or akash/.env.mainnet

# 3. Redeploy with fixes
akash tx deployment create akash/deploy.yaml ...
```

**Refund Details:**
- Deposit: Fully refunded minus consumed resources
- Transaction fees: NOT refunded (~0.1 AKT)
- Resource usage: Charged for time deployed

---

## Maintenance

### Updating Existing Deployment

To update image version or configuration:

```bash
# 1. Update akash/deploy.yaml with new image tag
# Change: nostream-ilp:v1.0.0-mainnet → nostream-ilp:v1.1.0-mainnet

# 2. Update deployment
akash tx deployment update akash/deploy.yaml \
  --dseq $DSEQ \
  --from mainnet-wallet \
  --node https://rpc.akashnet.net:443 \
  --chain-id akashnet-2

# 3. Provider will pull new image and restart services
# Monitor logs for successful restart
```

**Zero-downtime updates**: Not supported by default. Consider:
- Running multiple deployments behind load balancer
- Using DNS failover during updates

---

### Monitoring and Alerting

**Daily Checks:**
1. Health endpoint: `curl https://$SERVICE_URI:8080/health`
2. Event count growing: Dashboard metrics
3. No error spikes: Check logs
4. Balance sufficient: `npm run akash:balance -- mainnet`

**Weekly Checks:**
1. Review deployment cost: Compare actual vs expected
2. Storage usage: PostgreSQL size growing as expected
3. Provider uptime: Check provider reputation
4. Backup verification: If using Arweave, verify backups exist

**Automated Monitoring (Optional):**
```bash
# Set up cron job to check health every 5 minutes
*/5 * * * * curl -f https://relay.nostr-ilp.network:8080/health || echo "Health check failed" | mail -s "Relay Down" admin@example.com
```

---

### Backup and Disaster Recovery

**Database Backups:**

Akash storage is **ephemeral** - data is lost if deployment closes or provider fails.

**Backup Strategy:**

1. **Arweave Backups** (Recommended):
   - Enable Arweave backup service (Epic 9+)
   - Daily backups of all events to permanent storage
   - One-time cost for permanent storage

2. **Manual PostgreSQL Dumps**:
   ```bash
   # Get shell access to postgres container (requires provider support)
   # Then dump database:
   pg_dump -U nostr_ts_relay nostr_ts_relay > backup.sql
   ```

3. **Event Replication**:
   - Run backup relay
   - Mirror all events to backup using REQ subscriptions
   - Backup relay can take over if primary fails

**Disaster Recovery:**

If deployment is lost (provider failure, accidental closure):

1. Deploy new instance using this runbook
2. Restore database from Arweave or backup
3. Update DNS to point to new provider
4. Verify all services operational

**RTO (Recovery Time Objective)**: ~30 minutes (new deployment + DNS propagation)

**RPO (Recovery Point Objective)**: 24 hours (daily Arweave backups)

---

## Security

### Secret Management

**Production Secrets Checklist:**

- ✅ All secrets in `akash/.env.mainnet` are cryptographically random
- ✅ `akash/.env.mainnet` is gitignored (NEVER commit to version control)
- ✅ Backup of `.env.mainnet` stored securely (encrypted)
- ✅ Akash wallet mnemonic backed up securely (`.akash-wallet.txt`)
- ✅ Dashboard password changed from default

**Secret Rotation:**

Rotate secrets every 90 days:

```bash
# Generate new secrets
NEW_SECRET=$(openssl rand -hex 32)
NEW_DB_PASSWORD=$(openssl rand -hex 16)
NEW_REDIS_PASSWORD=$(openssl rand -hex 16)
NEW_DASSIE_TOKEN=$(openssl rand -hex 32)

# Update akash/.env.mainnet
# Then update deployment (triggers rolling restart):
akash tx deployment update akash/deploy.yaml --dseq $DSEQ ...
```

---

### Wallet Security

**Best Practices:**

1. **Never share mnemonic**: `.akash-wallet.txt` contains private keys
2. **Encrypted backups**: Store backup in password manager or encrypted drive
3. **Minimum balance**: Keep only ~5 AKT in deployment wallet
4. **Separate wallets**: Use different wallets for deployment vs. large holdings
5. **Hardware wallet**: For large AKT amounts, use Ledger/Trezor

**If wallet is compromised:**

1. Create new wallet immediately
2. Transfer remaining AKT from old wallet to new wallet
3. Close all deployments from old wallet
4. Redeploy using new wallet

---

### Network Security

**Exposed Ports:**

| Port | Service | Public? | Purpose |
|------|---------|---------|---------|
| 443 | Nostream | ✅ Yes | WebSocket (WSS) for Nostr clients |
| 8080 | Dashboard | ✅ Yes | Operator dashboard (HTTP Basic Auth) |
| 5432 | PostgreSQL | ❌ No | Internal only (service-to-service) |
| 6379 | Redis | ❌ No | Internal only (service-to-service) |

**Akash Provider Security:**

- Providers are third-party operators (not under your control)
- Provider CAN theoretically access deployment data
- Database encryption recommended for sensitive data
- Consider VPN/Wireguard for additional provider isolation (advanced)

**Dashboard Access Control:**

Current: HTTP Basic Authentication

**Recommendations for hardening:**

1. **IP Whitelist**: Configure Akash SDL to allow dashboard access only from specific IPs
2. **VPN**: Access dashboard only via VPN
3. **Disable Dashboard**: Remove port 8080 exposure if not needed

---

### Incident Response

**If relay is compromised or behaving maliciously:**

1. **Immediate Actions**:
   ```bash
   # Close deployment immediately
   akash tx deployment close --dseq $DSEQ ...
   ```

2. **Investigation**:
   - Download logs from provider
   - Review recent events in database
   - Check for unauthorized access (dashboard logs)

3. **Recovery**:
   - Rotate all secrets
   - Deploy to new provider
   - Audit all published events

4. **Post-Incident**:
   - Document incident
   - Update security measures
   - Consider additional hardening

---

## Deployment Verification Checklist

Use this checklist after deployment:

- [ ] Deployment created successfully (DSEQ recorded)
- [ ] Provider bid accepted, lease active
- [ ] All services started (check logs)
- [ ] Health endpoint returns `{"status":"healthy"}`
- [ ] WebSocket connection works (`wscat` test)
- [ ] Nostr REQ/EVENT/CLOSE messages work
- [ ] NIP-11 relay information accessible
- [ ] Dashboard accessible and shows correct metrics
- [ ] TLS certificate valid (no browser warnings)
- [ ] DNS resolves to provider (if using domain)
- [ ] Integration tests pass against production
- [ ] Deployment cost ≤$5/month
- [ ] No critical errors in logs
- [ ] Public URI documented and shared

---

## Support and Resources

**Akash Network:**
- Documentation: https://docs.akash.network/
- Discord: https://discord.akash.network/
- Forum: https://forum.akash.network/

**Nostr:**
- NIPs Specification: https://github.com/nostr-protocol/nips
- Nostr Dev Discord: https://discord.gg/nostr

**Project-Specific:**
- GitHub Issues: https://github.com/yourorg/nostream-ilp/issues
- Story 8.3: `docs/stories/8.3.story.md`
- Architecture Docs: `docs/architecture/`

---

## Appendix: Useful Commands

### Quick Reference

```bash
# Check wallet balance
npm run akash:balance -- mainnet

# List deployments
akash query deployment list --owner $(grep "Address:" .akash-wallet.txt | awk '{print $2}') --node https://rpc.akashnet.net:443

# Get lease details
akash query market lease get --dseq $DSEQ --provider $PROVIDER --node https://rpc.akashnet.net:443

# Stream logs
akash provider service-logs --dseq $DSEQ --provider $PROVIDER --node https://rpc.akashnet.net:443 --follow

# Close deployment
akash tx deployment close --dseq $DSEQ --from mainnet-wallet --node https://rpc.akashnet.net:443 --chain-id akashnet-2

# Test health
curl https://$SERVICE_URI:8080/health

# Test WebSocket
wscat -c wss://$SERVICE_URI:443

# Test NIP-11
curl https://$SERVICE_URI -H "Accept: application/nostr+json"
```

---

**End of Runbook**

Last Updated: 2025-12-11
Version: 1.0
Maintainer: Development Team
