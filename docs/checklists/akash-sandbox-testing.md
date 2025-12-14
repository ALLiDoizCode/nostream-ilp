# Akash Sandbox Testing Procedure

This document provides the testing procedure for Story 2.13 (Update Akash Deployment with Dassie Service) sandbox testing (ACs 8-9).

## Prerequisites

- Akash CLI installed (`akash version` should work)
- Wallet funded with testnet AKT (from testnet faucet)
- Docker images built and pushed to registry:
  - `nostream-ilp:v1.0.0-mainnet` (or `:latest` for sandbox)
  - `dassie-node:v1.0.0-mainnet` (or `:latest` for sandbox)
- Environment variables configured in `akash/.env.mainnet`

## Step 1: Pre-Deployment Validation

Run validation checks before deploying:

```bash
# Validate environment variables
./scripts/validate-env.sh akash/.env.mainnet

# Expected output:
# ✅ VALIDATION PASSED - Environment is ready for deployment
# OR
# ⚠️  VALIDATION PASSED WITH WARNINGS (acceptable for sandbox)
```

## Step 2: Create Deployment

Deploy to Akash sandbox/testnet:

```bash
# Using TypeScript SDK (recommended)
npm run akash:deploy

# OR using CLI directly
akash tx deployment create akash/deploy.yaml \
  --from mainnet-wallet \
  --node https://rpc.akashnet.net:443 \
  --chain-id akashnet-2 \
  --env-file akash/.env.mainnet \
  --gas auto \
  --gas-prices 0.025uakt \
  --yes
```

**Expected Result:**
- Deployment created successfully
- Deployment sequence number (DSEQ) returned
- Record DSEQ for subsequent commands

## Step 3: Monitor Deployment Status

Check deployment status and wait for bids:

```bash
# Check deployment status
akash query deployment get \
  --dseq <DSEQ> \
  --node https://rpc.akashnet.net:443 \
  --owner <YOUR_ADDRESS>

# Wait for provider bids (2-5 minutes)
akash query market bid list \
  --dseq <DSEQ> \
  --node https://rpc.akashnet.net:443 \
  --owner <YOUR_ADDRESS>
```

**Expected Result:**
- Deployment state: `active`
- At least one bid from a provider
- Bid price ≤ 1,150 uAKT/block

## Step 4: Accept Provider Bid

Create lease by accepting a provider bid:

```bash
akash tx market lease create \
  --dseq <DSEQ> \
  --provider <PROVIDER_ADDRESS> \
  --node https://rpc.akashnet.net:443 \
  --from mainnet-wallet \
  --gas auto \
  --gas-prices 0.025uakt \
  --yes
```

**Expected Result:**
- Lease created successfully
- Provider begins deploying containers

## Step 5: Verify Service Status

Check that all 4 services are running:

```bash
akash provider service-status \
  --dseq <DSEQ> \
  --provider <PROVIDER_ADDRESS> \
  --node https://rpc.akashnet.net:443 \
  --from mainnet-wallet
```

**Expected Result:**
```json
{
  "services": {
    "nostream": {
      "name": "nostream",
      "available": 1,
      "ready": 1
    },
    "dassie": {
      "name": "dassie",
      "available": 1,
      "ready": 1
    },
    "postgres": {
      "name": "postgres",
      "available": 1,
      "ready": 1
    },
    "redis": {
      "name": "redis",
      "available": 1,
      "ready": 1
    }
  }
}
```

**Success Criteria:**
- All services show `available: 1, ready: 1`
- If any service shows `available: 0` or `ready: 0`, check logs (Step 6)

## Step 6: Check Service Logs

Verify services started correctly:

```bash
# Check Nostream logs
akash provider service-logs \
  --dseq <DSEQ> \
  --provider <PROVIDER_ADDRESS> \
  --service nostream \
  --node https://rpc.akashnet.net:443 \
  --from mainnet-wallet

# Check Dassie logs
akash provider service-logs \
  --dseq <DSEQ> \
  --provider <PROVIDER_ADDRESS> \
  --service dassie \
  --node https://rpc.akashnet.net:443 \
  --from mainnet-wallet
```

**Expected in Nostream logs:**
- `Server started on port 8008`
- `Connected to PostgreSQL`
- `Connected to Redis`
- `Connected to Dassie RPC` or `tRPC client initialized`

**Expected in Dassie logs:**
- `Dassie node started`
- `HTTP server listening on port 7768`
- `Ledger database opened: /app/data/ledger.db`
- No authentication errors

**Red Flags (investigate if seen):**
- `ECONNREFUSED` - service not reachable
- `Authentication failed` - RPC token mismatch
- `SETTLEMENT_*_RELAY_PRIVATE_KEY is required` - missing configuration

## Step 7: Get Provider URI

Get the public URI for accessing Nostream:

```bash
akash provider lease-status \
  --dseq <DSEQ> \
  --provider <PROVIDER_ADDRESS> \
  --node https://rpc.akashnet.net:443 \
  --from mainnet-wallet \
  | grep -A 5 "forwarded_ports"
```

**Expected Result:**
```
forwarded_ports:
  nostream:
    - host: provider.akash.network
      port: 443
      externalPort: 30443
```

Record the provider URI: `https://provider.akash.network:30443`

## Step 8: Test Nostream Connectivity

Test that Nostream is reachable:

```bash
# Get relay info (NIP-11)
curl -H "Accept: application/nostr+json" https://<provider-uri>:443

# Expected: JSON response with relay information
# {
#   "name": "Nostr-ILP Relay",
#   "supported_nips": [1, 2, 4, 9, 11, ...],
#   ...
# }
```

**Success Criteria:**
- HTTP 200 response
- Valid JSON with relay metadata
- `supported_nips` includes expected NIPs

## Step 9: Verify Service Communication

Verify Nostream can communicate with Dassie:

```bash
# Option 1: Check Nostream logs for successful RPC calls
akash provider service-logs \
  --dseq <DSEQ> \
  --service nostream \
  --follow \
  --tail 50 | grep -i "dassie"

# Expected: No connection errors, successful RPC calls

# Option 2: Send test Nostr event with payment claim
# (Requires Nostr client with payment support)
# This tests the full flow: Nostream → Dassie → payment verification
```

**Success Criteria:**
- No `ECONNREFUSED` errors when Nostream tries to reach Dassie
- No authentication errors (`Invalid RPC token`)
- If sending test event with payment, Dassie logs show verification attempt

## Step 10: Verify Cost

Check actual lease cost:

```bash
akash query market lease list \
  --owner <YOUR_ADDRESS> \
  --dseq <DSEQ> \
  --node https://rpc.akashnet.net:443
```

**Expected Result:**
- Lease price ≤ 1,150 uAKT/block
- Monthly cost estimate: ~$6-7 USD (at $5/AKT)

## Step 11: Cleanup

Close deployment after testing:

```bash
akash tx deployment close \
  --dseq <DSEQ> \
  --node https://rpc.akashnet.net:443 \
  --from mainnet-wallet \
  --gas auto \
  --gas-prices 0.025uakt \
  --yes
```

**Expected Result:**
- Deployment closed
- Lease terminated
- Containers stopped on provider

## Troubleshooting

### Issue: Services show `available: 0`

**Cause:** Container failed to start or health check failing

**Solution:**
1. Check service logs for errors
2. Verify environment variables are correctly injected
3. Verify Docker image is accessible
4. Check resource allocation is sufficient

### Issue: Nostream can't connect to Dassie

**Cause:** Service discovery or authentication failure

**Solution:**
1. Verify Dassie is running (`service-status`)
2. Check `DASSIE_RPC_TOKEN` matches in both services
3. Verify port 7768 is exposed to nostream service
4. Check Dassie logs for connection attempts

### Issue: No provider bids

**Cause:** Deployment configuration incompatible with available providers

**Solution:**
1. Reduce resource requirements
2. Increase bid price (amount per service)
3. Try deploying to different Akash network (testnet vs mainnet)

### Issue: Lease price higher than expected

**Cause:** Provider bid higher than SDL pricing

**Solution:**
- Accept a different provider with lower bid
- Adjust SDL pricing (`profiles.placement.dcloud.pricing`)
- Verify block time calculation (6s blocks)

## Success Summary

✅ **Deployment Successful** when:
1. All 4 services show `available: 1, ready: 1`
2. Nostream logs show "Connected to Dassie RPC"
3. No authentication or connection errors
4. Relay info endpoint returns valid JSON
5. Lease cost ≤ 1,150 uAKT/block

✅ **Service Communication Verified** when:
1. Nostream can reach Dassie on port 7768
2. Dassie logs show successful RPC authentication
3. Payment verification works (if test claim sent)

## Automated Testing

For automated testing, see:
- `test/akash/sdl-validation.spec.ts` - SDL structure validation
- `test/akash/env-validation.spec.ts` - Environment variable validation
- `./scripts/validate-env.sh` - Pre-deployment validation script

## References

- Story 2.13: `docs/stories/2.13-update-akash-deployment-dassie.md`
- Deployment Runbook: `docs/deployment-runbook.md`
- Akash Documentation: https://docs.akash.network
- Dassie Deployment Checklist: `docs/checklists/dassie-deployment-checklist.md`
