# Docker-Based Local Testnet Setup

This guide provides complete instructions for setting up a local CosmWasm testnet using Docker and Docker Compose for AKT custody contract development.

## Overview

Docker-based setup offers:
- **Fast setup:** 10-15 minutes from zero to working testnet
- **Reproducibility:** Same environment across different machines
- **Isolation:** No interference with system packages
- **Easy reset:** Simple cleanup and restart
- **Team sharing:** docker-compose.yml ensures consistency

## Prerequisites

Ensure you have completed the [Prerequisites Guide](./prerequisites.md):
- Docker 20.10.0+ installed
- Docker Compose 1.29.0+ or Docker Compose V2
- 4GB RAM available for Docker
- 10GB disk space

**Verify:**
```bash
docker --version
docker-compose --version  # or: docker compose version
docker ps  # Should run without errors
```

## Approach 1: Single Container (Quick Start)

Ideal for: Simple testing, single-developer environments, quick experiments

### Step 1: Pull wasmd Docker Image

```bash
# Pull official wasmd image
docker pull cosmwasm/wasmd:latest

# Verify
docker images | grep wasmd
```

### Step 2: Initialize Testnet

```bash
# Create directory for node data
mkdir -p ~/.wasmd-docker

# Initialize chain in container
docker run --rm \
  -v ~/.wasmd-docker:/root/.wasmd \
  cosmwasm/wasmd:latest \
  init testnode --chain-id local-testnet
```

### Step 3: Configure for Development

```bash
# Update genesis to enable CosmWasm uploads
docker run --rm \
  -v ~/.wasmd-docker:/root/.wasmd \
  cosmwasm/wasmd:latest \
  sh -c 'sed -i "s/\"permission\": \"Nobody\"/\"permission\": \"Everybody\"/" /root/.wasmd/config/genesis.json'

# Set minimum gas prices
docker run --rm \
  -v ~/.wasmd-docker:/root/.wasmd \
  cosmwasm/wasmd:latest \
  sh -c 'sed -i "s/minimum-gas-prices = \"\"/minimum-gas-prices = \"0.025uakt\"/" /root/.wasmd/config/app.toml'
```

### Step 4: Create Test Keys

```bash
# Create validator key
docker run --rm -it \
  -v ~/.wasmd-docker:/root/.wasmd \
  cosmwasm/wasmd:latest \
  keys add validator --keyring-backend test

# Create test account
docker run --rm -it \
  -v ~/.wasmd-docker:/root/.wasmd \
  cosmwasm/wasmd:latest \
  keys add test-account --keyring-backend test

# Save the addresses shown - you'll need them
```

### Step 5: Add Genesis Accounts

```bash
# Add validator account with AKT
docker run --rm \
  -v ~/.wasmd-docker:/root/.wasmd \
  cosmwasm/wasmd:latest \
  add-genesis-account validator 100000000000uakt --keyring-backend test

# Add test account with AKT
docker run --rm \
  -v ~/.wasmd-docker:/root/.wasmd \
  cosmwasm/wasmd:latest \
  add-genesis-account test-account 100000000000uakt --keyring-backend test
```

### Step 6: Create Genesis Transaction

```bash
# Generate validator genesis tx
docker run --rm \
  -v ~/.wasmd-docker:/root/.wasmd \
  cosmwasm/wasmd:latest \
  gentx validator 50000000000uakt \
    --chain-id local-testnet \
    --keyring-backend test

# Collect genesis txs
docker run --rm \
  -v ~/.wasmd-docker:/root/.wasmd \
  cosmwasm/wasmd:latest \
  collect-gentxs
```

### Step 7: Start the Chain

```bash
# Start wasmd container
docker run -d \
  --name wasmd-testnet \
  -p 26657:26657 \
  -p 26656:26656 \
  -p 1317:1317 \
  -p 9090:9090 \
  -v ~/.wasmd-docker:/root/.wasmd \
  cosmwasm/wasmd:latest \
  start

# View logs
docker logs -f wasmd-testnet

# Verify chain is running
curl http://localhost:26657/status
```

### Step 8: Verify Setup

```bash
# Check account balance
docker exec wasmd-testnet \
  wasmd query bank balances $(docker exec wasmd-testnet wasmd keys show test-account -a --keyring-backend test)

# Should show: 100000000000uakt
```

### Managing Single Container

```bash
# Stop chain
docker stop wasmd-testnet

# Start existing chain
docker start wasmd-testnet

# View logs
docker logs -f wasmd-testnet

# Execute commands
docker exec wasmd-testnet wasmd status

# Remove container (keeps data in ~/.wasmd-docker)
docker rm -f wasmd-testnet

# Full reset (deletes all data)
docker rm -f wasmd-testnet
rm -rf ~/.wasmd-docker
```

## Approach 2: Docker Compose (Recommended)

Ideal for: Team development, multi-service setups, production-like environments

### Architecture

```
Docker Compose Setup:
├── wasmd (validator node)
├── volumes (persistent data)
└── networks (inter-service communication)

Optional additions:
├── faucet (automated token distribution)
├── explorer (block explorer UI)
└── indexer (event indexing)
```

### Step 1: Create Project Directory

```bash
# Create testnet project
mkdir -p ~/cosmwasm-dev/testnet/docker
cd ~/cosmwasm-dev/testnet/docker
```

### Step 2: Create docker-compose.yml

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  wasmd:
    image: cosmwasm/wasmd:latest
    container_name: cosmwasm-testnet
    hostname: wasmd
    command: >
      sh -c "
      if [ ! -d /root/.wasmd/config ]; then
        echo 'Initializing new chain...';
        wasmd init testnode --chain-id local-testnet &&
        echo 'password' | wasmd keys add validator --keyring-backend test &&
        echo 'password' | wasmd keys add test-account --keyring-backend test &&
        wasmd add-genesis-account validator 100000000000uakt --keyring-backend test &&
        wasmd add-genesis-account test-account 100000000000uakt --keyring-backend test &&
        wasmd gentx validator 50000000000uakt --chain-id local-testnet --keyring-backend test &&
        wasmd collect-gentxs &&
        sed -i 's/minimum-gas-prices = \"\"/minimum-gas-prices = \"0.025uakt\"/' /root/.wasmd/config/app.toml &&
        sed -i 's/\"permission\": \"Nobody\"/\"permission\": \"Everybody\"/' /root/.wasmd/config/genesis.json &&
        sed -i 's/enable = false/enable = true/' /root/.wasmd/config/app.toml &&
        sed -i 's/swagger = false/swagger = true/' /root/.wasmd/config/app.toml &&
        echo 'Initialization complete.';
      else
        echo 'Using existing chain data...';
      fi &&
      wasmd start --rpc.laddr tcp://0.0.0.0:26657
      "
    ports:
      - "26657:26657"  # RPC
      - "26656:26656"  # P2P
      - "1317:1317"    # REST API
      - "9090:9090"    # gRPC
    volumes:
      - wasmd-data:/root/.wasmd
    networks:
      - testnet
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:26657/status"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s

volumes:
  wasmd-data:
    driver: local

networks:
  testnet:
    driver: bridge
```

### Step 3: Start the Testnet

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f wasmd

# Wait for initialization (30-60 seconds)
# Watch for: "Initialization complete" and block production
```

### Step 4: Verify Setup

```bash
# Check status
curl http://localhost:26657/status | jq

# Get test account address
TEST_ADDR=$(docker-compose exec -T wasmd wasmd keys show test-account -a --keyring-backend test)
echo $TEST_ADDR

# Check balance
docker-compose exec wasmd \
  wasmd query bank balances $TEST_ADDR

# Expected output:
# balances:
# - amount: "100000000000"
#   denom: uakt
```

### Step 5: Access the Testnet

**From Host Machine:**
```bash
# Install wasmd CLI on host (optional)
# brew install wasmd  # or build from source

# Query via RPC
curl http://localhost:26657/status

# Query via REST API
curl http://localhost:1317/cosmos/bank/v1beta1/supply

# Query via gRPC (requires grpcurl)
grpcurl -plaintext localhost:9090 list
```

**From Within Container:**
```bash
# Execute any wasmd command
docker-compose exec wasmd wasmd status
docker-compose exec wasmd wasmd query bank total
docker-compose exec wasmd wasmd keys list --keyring-backend test
```

### Managing Docker Compose Testnet

```bash
# View status
docker-compose ps

# Stop (preserves data)
docker-compose stop

# Start stopped services
docker-compose start

# Restart
docker-compose restart

# View logs
docker-compose logs -f
docker-compose logs --tail=100 wasmd

# Execute commands
docker-compose exec wasmd wasmd status

# Stop and remove containers (keeps volumes)
docker-compose down

# Stop and remove everything including volumes
docker-compose down -v
```

## Approach 3: Multi-Node Testnet

For advanced testing with multiple validators.

### Create docker-compose-multinode.yml

```yaml
version: '3.8'

services:
  wasmd-node0:
    image: cosmwasm/wasmd:latest
    container_name: wasmd-node0
    command: wasmd start --home /root/.wasmd
    ports:
      - "26657:26657"
      - "1317:1317"
      - "9090:9090"
    volumes:
      - ./testnets/node0/wasmd:/root/.wasmd
    networks:
      testnet:
        ipv4_address: 172.25.0.10

  wasmd-node1:
    image: cosmwasm/wasmd:latest
    container_name: wasmd-node1
    command: wasmd start --home /root/.wasmd
    ports:
      - "26658:26657"
      - "1318:1317"
      - "9091:9090"
    volumes:
      - ./testnets/node1/wasmd:/root/.wasmd
    networks:
      testnet:
        ipv4_address: 172.25.0.11

  wasmd-node2:
    image: cosmwasm/wasmd:latest
    container_name: wasmd-node2
    command: wasmd start --home /root/.wasmd
    ports:
      - "26659:26657"
      - "1319:1317"
      - "9092:9090"
    volumes:
      - ./testnets/node2/wasmd:/root/.wasmd
    networks:
      testnet:
        ipv4_address: 172.25.0.12

networks:
  testnet:
    driver: bridge
    ipam:
      config:
        - subnet: 172.25.0.0/16
```

**Initialize Multi-Node:**
```bash
# Initialize testnet files
docker run --rm \
  -v $(pwd):/data \
  cosmwasm/wasmd:latest \
  testnet init-files \
    --v 3 \
    --chain-id local-testnet \
    --keyring-backend test \
    --output-dir /data/testnets

# Start multi-node testnet
docker-compose -f docker-compose-multinode.yml up -d
```

## Deployment Workflow with Docker

### Upload Contract

```bash
# Assume contract is at ./contract/artifacts/contract.wasm

# Upload from host
docker-compose exec wasmd \
  wasmd tx wasm store /tmp/contract.wasm \
    --from test-account \
    --gas auto \
    --gas-adjustment 1.3 \
    --gas-prices 0.025uakt \
    --chain-id local-testnet \
    --keyring-backend test \
    --yes

# OR: Copy file into container and upload
docker cp ./contract/artifacts/contract.wasm cosmwasm-testnet:/tmp/
docker-compose exec wasmd \
  wasmd tx wasm store /tmp/contract.wasm \
    --from test-account \
    --gas auto \
    --gas-adjustment 1.3 \
    --gas-prices 0.025uakt \
    --chain-id local-testnet \
    --keyring-backend test \
    --yes
```

### Query Code

```bash
# List uploaded contracts
docker-compose exec wasmd \
  wasmd query wasm list-code

# Get code info
docker-compose exec wasmd \
  wasmd query wasm code 1
```

## Persistent Data Management

### Backup Testnet State

```bash
# Stop chain
docker-compose stop

# Backup volume data
docker run --rm \
  -v cosmwasm-testnet_wasmd-data:/source \
  -v $(pwd)/backups:/backup \
  ubuntu \
  tar czf /backup/wasmd-backup-$(date +%Y%m%d).tar.gz -C /source .

# Restart
docker-compose start
```

### Restore from Backup

```bash
# Stop and remove
docker-compose down -v

# Restore data
docker run --rm \
  -v cosmwasm-testnet_wasmd-data:/target \
  -v $(pwd)/backups:/backup \
  ubuntu \
  tar xzf /backup/wasmd-backup-YYYYMMDD.tar.gz -C /target

# Start
docker-compose up -d
```

## Customization Options

### Custom Genesis File

```yaml
# In docker-compose.yml, mount custom genesis
services:
  wasmd:
    # ... other config
    volumes:
      - wasmd-data:/root/.wasmd
      - ./custom-genesis.json:/root/.wasmd/config/genesis.json:ro
```

### Environment Variables

```yaml
# Add environment variables
services:
  wasmd:
    environment:
      - MINIMUM_GAS_PRICES=0.025uakt
      - CHAIN_ID=local-testnet
    # ... rest of config
```

### Resource Limits

```yaml
services:
  wasmd:
    # ... other config
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
```

## Troubleshooting Docker Setup

### Container Won't Start

```bash
# Check logs
docker-compose logs wasmd

# Common issues:
# 1. Port already in use
lsof -i :26657
# Solution: Change port mapping in docker-compose.yml

# 2. Permission issues with volumes
sudo chown -R $USER ~/.wasmd-docker

# 3. Corrupted data
docker-compose down -v  # WARNING: Deletes all data
```

### Cannot Connect to RPC

```bash
# Verify container is running
docker-compose ps

# Check if port is accessible
curl http://localhost:26657/status

# If not accessible, check firewall
# macOS:
sudo pfctl -d  # Disable temporarily for testing

# Linux:
sudo ufw allow 26657
```

### Out of Memory Errors

```bash
# Increase Docker memory limit
# Docker Desktop -> Settings -> Resources -> Memory
# Increase to at least 4GB

# Or edit docker-compose.yml with limits (shown above)
```

## Performance Optimization

### Faster Block Times (Development)

Edit after initialization:
```bash
docker-compose exec wasmd sh -c \
  'sed -i "s/timeout_commit = \"5s\"/timeout_commit = \"1s\"/" /root/.wasmd/config/config.toml'

docker-compose restart
```

### Disable Unnecessary Services

```toml
# In app.toml (edit via docker exec or volume mount)
[api]
enable = false  # If not using REST API

[grpc]
enable = false  # If not using gRPC
```

## Next Steps

1. **Configure AKT Token:** See [Akash Token Configuration](./akash-token-config.md)
2. **Deploy Contracts:** See [Contract Deployment Workflow](../workflows/contract-deployment.md)
3. **Testing Patterns:** See [Testing Patterns](../workflows/testing-patterns.md)

## Additional Resources

- **Docker Compose Documentation:** https://docs.docker.com/compose/
- **wasmd Docker Hub:** https://hub.docker.com/r/cosmwasm/wasmd
- **LocalOsmosis (Reference):** https://github.com/osmosis-labs/LocalOsmosis

---

*Last Updated: 2025-11-28*
*Docker Version: 24.0.7*
*Docker Compose Version: v2.23.3*
