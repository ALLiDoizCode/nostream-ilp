# Deployment Architecture

## Akash Network Deployment

The relay deploys to Akash Network, a decentralized cloud compute marketplace. Akash provides cost-effective hosting (~$2.50-5/month) with the unique capability for the relay to **pay its own hosting bills** using earned AKT tokens.

### Akash SDL (Stack Definition Language)

**File:** `akash/deploy.yaml`

```yaml
---
version: "2.0"

services:
  nostream:
    image: ghcr.io/yourorg/nostream-ilp:latest
    expose:
      - port: 443
        as: 443
        to:
          - global: true
        proto: tcp
        accept:
          - wss://relay.yourdomain.com
    env:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://nostream:password@postgres:5432/nostream
      - REDIS_URL=redis://redis:6379
      - DASSIE_RPC_URL=ws://dassie:5000/trpc
      - DASSIE_RPC_TOKEN=  # Injected at deployment
      - ARWEAVE_WALLET_PATH=/secrets/arweave-keyfile.json
      - DASHBOARD_USERNAME=  # Injected at deployment
      - DASHBOARD_PASSWORD=  # Injected at deployment
    depends_on:
      - postgres
      - redis
      - dassie

  dassie:
    image: ghcr.io/yourorg/dassie-relay:latest
    expose:
      - port: 5000
        to:
          - service: nostream
        proto: tcp
    env:
      - NODE_ENV=production
      - DASSIE_RPC_TOKEN=  # Injected at deployment (same as nostream)
      - SETTLEMENT_ENABLED=true

  postgres:
    image: postgres:14-alpine
    expose:
      - port: 5432
        to:
          - service: nostream
    env:
      - POSTGRES_USER=nostream
      - POSTGRES_PASSWORD=  # Injected at deployment
      - POSTGRES_DB=nostream

  redis:
    image: redis:7-alpine
    expose:
      - port: 6379
        to:
          - service: nostream

profiles:
  compute:
    nostream:
      resources:
        cpu:
          units: 0.5  # 500 millicores
        memory:
          size: 1Gi
        storage:
          size: 10Gi  # For PostgreSQL + logs
    dassie:
      resources:
        cpu:
          units: 0.25
        memory:
          size: 512Mi
        storage:
          size: 1Gi  # SQLite ledger
    postgres:
      resources:
        cpu:
          units: 0.25
        memory:
          size: 512Mi
        storage:
          size: 20Gi  # Event storage
    redis:
      resources:
        cpu:
          units: 0.1
        memory:
          size: 256Mi
        storage:
          size: 1Gi

  placement:
    dcloud:
      pricing:
        nostream:
          denom: uakt
          amount: 1000  # Max price willing to pay per block
        dassie:
          denom: uakt
          amount: 500
        postgres:
          denom: uakt
          amount: 500
        redis:
          denom: uakt
          amount: 200

deployment:
  nostream:
    dcloud:
      profile: nostream
      count: 1
  dassie:
    dcloud:
      profile: dassie
      count: 1
  postgres:
    dcloud:
      profile: postgres
      count: 1
  redis:
    dcloud:
      profile: redis
      count: 1
```

### Deployment Steps

**1. Build Docker Images**

```bash