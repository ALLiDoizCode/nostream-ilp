# Dassie Deployment Validation Checklist

This checklist ensures that Dassie service is properly configured and deployed alongside Nostream on Akash Network.

## Pre-Deployment

- [ ] DASSIE_RPC_TOKEN generated (32+ chars): `openssl rand -hex 32`
- [ ] Settlement module configured (if using):
  - [ ] Base L2: SETTLEMENT_BASE_ENABLED, RPC_URL, FACTORY_ADDRESS, PRIVATE_KEY set
  - [ ] Cronos: SETTLEMENT_CRONOS_ENABLED, RPC_URL, FACTORY_ADDRESS, PRIVATE_KEY set
- [ ] Relay private keys secured (never commit to git)
- [ ] Docker images built and tagged:
  - [ ] `nostream-ilp:v1.0.0-mainnet` built
  - [ ] `dassie-node:v1.0.0-mainnet` built

## Deployment Configuration

- [ ] SDL includes all 4 services (nostream, dassie, postgres, redis)
- [ ] Total pricing = 1,150 uAKT/block:
  - [ ] Nostream: 550 uAKT/block
  - [ ] Dassie: 200 uAKT/block
  - [ ] PostgreSQL: 300 uAKT/block
  - [ ] Redis: 100 uAKT/block
- [ ] Nostream depends_on: [postgres, redis, dassie]
- [ ] Dassie port 7768 exposed only to nostream service (not global)
- [ ] Environment variables injected via `akash/.env.mainnet`

## Post-Deployment

- [ ] All containers running:
  ```bash
  akash provider service-status --dseq <DSEQ> --provider <PROVIDER>
  ```
  Expected: 4 services with `available: 1, ready: 1`

- [ ] Nostream health check passes:
  ```bash
  curl https://<provider-uri>:8080/health
  ```
  Expected: `{"status":"healthy","services":{"nostream":"up","dassie":"up","postgresql":"up","redis":"up"}}`

- [ ] Nostream logs show Dassie connection:
  ```bash
  akash provider service-logs --dseq <DSEQ> --service nostream --provider <PROVIDER>
  ```
  Look for: "Connected to Dassie RPC" or "tRPC client initialized"

- [ ] No RPC authentication errors in logs

- [ ] Payment verification works (test claim):
  - [ ] Send Nostr event with payment claim tag
  - [ ] Check Dassie logs for verification attempt
  - [ ] Verify no authentication errors

## Cost Verification

- [ ] Lease pricing ≤ 1,150 uAKT/block:
  ```bash
  akash query market lease list --owner <OWNER>
  ```

- [ ] Estimated monthly cost: $6-7 USD (at $5/AKT)
  - Calculation: 1,150 × 1,051,200 / 1,000,000 = 1.209 AKT/month
  - At $5/AKT: 1.209 × $5 = $6.04/month

## Troubleshooting

If Nostream cannot connect to Dassie:

1. Check Dassie container is running:
   ```bash
   akash provider service-status --service dassie
   ```

2. Verify DASSIE_RPC_TOKEN matches in both services:
   - Check `akash/.env.mainnet` for correct token
   - Verify token length ≥ 32 characters

3. Check Dassie logs for startup errors:
   ```bash
   akash provider service-logs --service dassie
   ```

4. Verify internal networking:
   - Nostream should use `ws://dassie:7768/trpc` (not localhost)
   - Port 7768 should be exposed to nostream service only

5. Check depends_on configuration:
   - Dassie should start before Nostream
   - Verify `depends_on: [postgres, redis, dassie]` in SDL

## Success Criteria

✅ All 4 services running
✅ Nostream health check returns `{"status":"healthy"}`
✅ Nostream logs show "Connected to Dassie RPC"
✅ No RPC authentication errors
✅ Payment verification functional
✅ Cost ≤ $7/month (allowing for AKT price fluctuation)

---

**Last Updated**: 2025-12-14
**Story**: 2.13 - Update Akash Deployment with Dassie Service
