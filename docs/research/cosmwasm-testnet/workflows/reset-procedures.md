# Chain Reset Procedures

This guide provides comprehensive procedures for resetting your local CosmWasm testnet, including fast resets (preserving configuration) and full resets (clean slate).

## Overview

Reset scenarios:

| Scenario | Keep Config | Keep Keys | Keep Data | Use Case |
|----------|-------------|-----------|-----------|----------|
| Fast Reset | ✓ | ✓ | ✗ | Quick restart during development |
| Full Reset | ✗ | ✗ | ✗ | Start completely fresh |
| Config-Only Reset | ✗ | ✓ | ✗ | Re-initialize with new settings |
| Data Export Reset | ✓ | ✓ | → Export | Migrate to new setup |

## Native Setup Resets

### Fast Reset (Keep Configuration)

Preserves config files and keys, only resets blockchain data.

```bash
# Set home directory
export WASMD_HOME="$HOME/cosmwasm-dev/testnet/native/.wasmd"

# 1. Stop chain
pkill wasmd
# OR if using systemd:
# sudo systemctl stop wasmd

# 2. Remove data directory only
rm -rf $WASMD_HOME/data

# 3. Regenerate genesis (keeps existing config)
wasmd init testnode \
  --chain-id local-testnet \
  --home $WASMD_HOME \
  --overwrite

# 4. Re-add genesis accounts (keys already exist)
VALIDATOR_ADDR=$(wasmd keys show validator -a --keyring-backend test --home $WASMD_HOME)
ALICE_ADDR=$(wasmd keys show alice -a --keyring-backend test --home $WASMD_HOME)
BOB_ADDR=$(wasmd keys show bob -a --keyring-backend test --home $WASMD_HOME)

wasmd add-genesis-account validator 100000000000uakt --keyring-backend test --home $WASMD_HOME
wasmd add-genesis-account alice 50000000000uakt --keyring-backend test --home $WASMD_HOME
wasmd add-genesis-account bob 25000000000uakt --keyring-backend test --home $WASMD_HOME

# 5. Create genesis transaction
wasmd gentx validator 50000000000uakt \
  --chain-id local-testnet \
  --keyring-backend test \
  --home $WASMD_HOME

wasmd collect-gentxs --home $WASMD_HOME

# 6. Validate
wasmd validate-genesis --home $WASMD_HOME

# 7. Restart chain
nohup wasmd start --home $WASMD_HOME > $WASMD_HOME/wasmd.log 2>&1 &
echo $! > $WASMD_HOME/wasmd.pid

# OR if using systemd:
# sudo systemctl start wasmd
```

**Time:** ~30 seconds

### Full Reset (Clean Slate)

Removes everything and starts from scratch.

```bash
export WASMD_HOME="$HOME/cosmwasm-dev/testnet/native/.wasmd"

# 1. Stop chain
pkill wasmd
# OR: sudo systemctl stop wasmd

# 2. Backup if needed (optional)
tar -czf wasmd-backup-$(date +%Y%m%d-%H%M%S).tar.gz $WASMD_HOME

# 3. Remove everything
rm -rf $WASMD_HOME

# 4. Re-initialize from scratch
wasmd init testnode \
  --chain-id local-testnet \
  --home $WASMD_HOME

# 5. Configure app.toml
sed -i.bak 's/minimum-gas-prices = ""/minimum-gas-prices = "0.025uakt"/' $WASMD_HOME/config/app.toml
sed -i.bak 's/enable = false/enable = true/g' $WASMD_HOME/config/app.toml
sed -i.bak 's/swagger = false/swagger = true/' $WASMD_HOME/config/app.toml

# 6. Configure config.toml
sed -i.bak 's/timeout_commit = "5s"/timeout_commit = "1s"/' $WASMD_HOME/config/config.toml
sed -i.bak 's/cors_allowed_origins = \[\]/cors_allowed_origins = ["*"]/' $WASMD_HOME/config/config.toml

# 7. Configure genesis.json
sed -i.bak 's/"permission": "Nobody"/"permission": "Everybody"/' $WASMD_HOME/config/genesis.json
sed -i.bak 's/"voting_period": "172800s"/"voting_period": "300s"/' $WASMD_HOME/config/genesis.json

# 8. Create new keys
wasmd keys add validator --keyring-backend test --home $WASMD_HOME
wasmd keys add alice --keyring-backend test --home $WASMD_HOME
wasmd keys add bob --keyring-backend test --home $WASMD_HOME

# 9. Add genesis accounts
VALIDATOR_ADDR=$(wasmd keys show validator -a --keyring-backend test --home $WASMD_HOME)
ALICE_ADDR=$(wasmd keys show alice -a --keyring-backend test --home $WASMD_HOME)
BOB_ADDR=$(wasmd keys show bob -a --keyring-backend test --home $WASMD_HOME)

wasmd add-genesis-account validator 100000000000uakt --keyring-backend test --home $WASMD_HOME
wasmd add-genesis-account alice 50000000000uakt --keyring-backend test --home $WASMD_HOME
wasmd add-genesis-account bob 25000000000uakt --keyring-backend test --home $WASMD_HOME

# 10. Create genesis transaction
wasmd gentx validator 50000000000uakt \
  --chain-id local-testnet \
  --keyring-backend test \
  --home $WASMD_HOME

wasmd collect-gentxs --home $WASMD_HOME
wasmd validate-genesis --home $WASMD_HOME

# 11. Start chain
nohup wasmd start --home $WASMD_HOME > $WASMD_HOME/wasmd.log 2>&1 &
echo $! > $WASMD_HOME/wasmd.pid
```

**Time:** ~2 minutes

### Automated Reset Script (Native)

```bash
#!/bin/bash
# scripts/reset-native.sh

set -e

WASMD_HOME="${WASMD_HOME:-$HOME/cosmwasm-dev/testnet/native/.wasmd}"
RESET_TYPE="${1:-fast}"  # fast or full

echo "Resetting native testnet (type: $RESET_TYPE)..."

# Stop chain
echo "Stopping chain..."
pkill wasmd || true
sleep 2

if [ "$RESET_TYPE" == "full" ]; then
  echo "Performing full reset..."

  # Backup
  if [ -d "$WASMD_HOME" ]; then
    BACKUP_FILE="wasmd-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    tar -czf "$BACKUP_FILE" "$WASMD_HOME"
    echo "Backup created: $BACKUP_FILE"
  fi

  # Remove everything
  rm -rf "$WASMD_HOME"

  # Re-run full initialization
  ./scripts/init-native.sh
else
  echo "Performing fast reset..."

  # Remove only data
  rm -rf "$WASMD_HOME/data"

  # Reinitialize
  wasmd init testnode --chain-id local-testnet --home "$WASMD_HOME" --overwrite

  # Re-add accounts
  VALIDATOR_ADDR=$(wasmd keys show validator -a --keyring-backend test --home "$WASMD_HOME")
  ALICE_ADDR=$(wasmd keys show alice -a --keyring-backend test --home "$WASMD_HOME")
  BOB_ADDR=$(wasmd keys show bob -a --keyring-backend test --home "$WASMD_HOME")

  wasmd add-genesis-account validator 100000000000uakt --keyring-backend test --home "$WASMD_HOME"
  wasmd add-genesis-account alice 50000000000uakt --keyring-backend test --home "$WASMD_HOME"
  wasmd add-genesis-account bob 25000000000uakt --keyring-backend test --home "$WASMD_HOME"

  # Gentx
  wasmd gentx validator 50000000000uakt --chain-id local-testnet --keyring-backend test --home "$WASMD_HOME"
  wasmd collect-gentxs --home "$WASMD_HOME"
  wasmd validate-genesis --home "$WASMD_HOME"
fi

# Start chain
echo "Starting chain..."
nohup wasmd start --home "$WASMD_HOME" > "$WASMD_HOME/wasmd.log" 2>&1 &
echo $! > "$WASMD_HOME/wasmd.pid"

echo "Reset complete. Chain is starting..."
sleep 3

# Verify
curl -s http://localhost:26657/status > /dev/null && echo "Chain is running!" || echo "Chain failed to start. Check logs."
```

**Usage:**
```bash
chmod +x scripts/reset-native.sh

# Fast reset
./scripts/reset-native.sh fast

# Full reset
./scripts/reset-native.sh full
```

## Docker Setup Resets

### Fast Reset (Docker Compose)

```bash
# 1. Stop containers
docker-compose down

# 2. Remove only data volume
docker volume rm cosmwasm-testnet_wasmd-data

# 3. Restart (will re-initialize)
docker-compose up -d

# 4. Wait for initialization
sleep 30

# 5. Verify
curl http://localhost:26657/status
```

**Time:** ~1 minute

### Full Reset (Docker Compose)

```bash
# 1. Stop and remove everything
docker-compose down -v

# 2. Remove images (optional, forces re-download)
docker rmi cosmwasm/wasmd:latest

# 3. Restart
docker-compose up -d

# 4. Verify
docker-compose logs -f
```

**Time:** ~2 minutes

### Single Container Reset

```bash
# 1. Stop container
docker stop wasmd-testnet

# 2. Remove container
docker rm wasmd-testnet

# 3. Remove data (fast reset - keep keys)
# Skip this step to preserve data

# 4. Restart
docker run -d \
  --name wasmd-testnet \
  -p 26657:26657 \
  -p 26656:26656 \
  -p 1317:1317 \
  -p 9090:9090 \
  -v ~/.wasmd-docker:/root/.wasmd \
  cosmwasm/wasmd:latest \
  start
```

### Automated Reset Script (Docker)

```bash
#!/bin/bash
# scripts/reset-docker.sh

set -e

COMPOSE_FILE="${1:-docker-compose.yml}"
RESET_TYPE="${2:-fast}"

echo "Resetting Docker testnet (type: $RESET_TYPE)..."

if [ "$RESET_TYPE" == "full" ]; then
  echo "Performing full reset..."

  # Stop and remove everything
  docker-compose -f "$COMPOSE_FILE" down -v

  # Remove images (optional)
  # docker rmi cosmwasm/wasmd:latest
else
  echo "Performing fast reset..."

  # Stop containers
  docker-compose -f "$COMPOSE_FILE" down

  # Remove data volume only
  docker volume rm cosmwasm-testnet_wasmd-data || true
fi

# Restart
echo "Starting containers..."
docker-compose -f "$COMPOSE_FILE" up -d

# Wait for initialization
echo "Waiting for chain to start..."
sleep 30

# Verify
docker-compose -f "$COMPOSE_FILE" logs --tail=20

echo "Reset complete!"
```

**Usage:**
```bash
chmod +x scripts/reset-docker.sh

# Fast reset
./scripts/reset-docker.sh docker-compose.yml fast

# Full reset
./scripts/reset-docker.sh docker-compose.yml full
```

## State Export and Import

### Export Chain State

```bash
# Stop chain first
pkill wasmd

# Export state to JSON
wasmd export \
  --home $WASMD_HOME \
  --height <block_height> \
  > exported-state.json

# Optional: compress
gzip exported-state.json
```

### Import Chain State

```bash
# 1. Reset chain
rm -rf $WASMD_HOME/data

# 2. Initialize with exported genesis
wasmd init testnode \
  --chain-id local-testnet \
  --home $WASMD_HOME

# 3. Replace genesis with exported state
cp exported-state.json $WASMD_HOME/config/genesis.json

# 4. Validate
wasmd validate-genesis --home $WASMD_HOME

# 5. Start chain
wasmd start --home $WASMD_HOME
```

## Selective Data Removal

### Remove Contracts Only

```bash
# Stop chain
pkill wasmd

# Use unsafe-reset-all but keep config
wasmd tendermint unsafe-reset-all --home $WASMD_HOME --keep-addr-book

# This removes:
# - Block data
# - State data
# - Evidence
# But keeps:
# - Config files
# - Keys
# - Address book
```

### Clear Mempool

```bash
# If chain is stuck on unconfirmed txs
pkill wasmd
rm -f $WASMD_HOME/data/mempool.wal
wasmd start --home $WASMD_HOME
```

## Pre-flight Checklist

Before resetting:

- [ ] **Backup:** Create backup if preserving any data
- [ ] **Contracts:** Note deployed contract addresses
- [ ] **Keys:** Export important keys
- [ ] **State:** Document critical state if needed
- [ ] **Scripts:** Update automation scripts with new addresses
- [ ] **Stop chain:** Ensure chain is fully stopped before reset

## Post-Reset Verification

### Native Setup Verification

```bash
# 1. Check chain status
wasmd status --home $WASMD_HOME | jq .

# 2. Verify blocks are progressing
HEIGHT1=$(wasmd status --home $WASMD_HOME | jq -r '.SyncInfo.latest_block_height')
sleep 5
HEIGHT2=$(wasmd status --home $WASMD_HOME | jq -r '.SyncInfo.latest_block_height')
if [ $HEIGHT2 -gt $HEIGHT1 ]; then
  echo "Chain is producing blocks"
else
  echo "Chain is NOT producing blocks"
fi

# 3. Check account balances
ALICE_ADDR=$(wasmd keys show alice -a --keyring-backend test --home $WASMD_HOME)
wasmd query bank balances $ALICE_ADDR --home $WASMD_HOME

# 4. Test transaction
BOB_ADDR=$(wasmd keys show bob -a --keyring-backend test --home $WASMD_HOME)
wasmd tx bank send alice $BOB_ADDR 1000000uakt \
  --chain-id local-testnet \
  --keyring-backend test \
  --home $WASMD_HOME \
  --gas auto \
  --gas-prices 0.025uakt \
  --yes
```

### Docker Setup Verification

```bash
# 1. Check container status
docker-compose ps

# 2. Check chain status
curl http://localhost:26657/status | jq .

# 3. Check accounts
docker exec cosmwasm-testnet \
  wasmd query bank total

# 4. Test transaction
ALICE_ADDR=$(docker exec cosmwasm-testnet wasmd keys show alice -a --keyring-backend test)
BOB_ADDR=$(docker exec cosmwasm-testnet wasmd keys show bob -a --keyring-backend test)

docker exec cosmwasm-testnet \
  wasmd tx bank send alice $BOB_ADDR 1000000uakt \
    --chain-id local-testnet \
    --keyring-backend test \
    --gas auto \
    --gas-prices 0.025uakt \
    --yes
```

## Troubleshooting Resets

### Issue: Chain Won't Start After Reset

```bash
# Check logs
tail -f $WASMD_HOME/wasmd.log

# Common fixes:
# 1. Port conflict
lsof -i :26657
pkill -9 wasmd

# 2. Corrupted genesis
wasmd validate-genesis --home $WASMD_HOME

# 3. Permission issues
chmod -R 755 $WASMD_HOME
```

### Issue: Genesis Validation Fails

```bash
# Re-generate genesis
rm $WASMD_HOME/config/genesis.json
wasmd init testnode --chain-id local-testnet --home $WASMD_HOME --overwrite

# Re-add accounts and gentx
# (see full reset steps)
```

### Issue: Keys Not Found After Reset

```bash
# List existing keys
wasmd keys list --keyring-backend test --home $WASMD_HOME

# If empty, keys were deleted - restore from backup or create new
wasmd keys add alice --keyring-backend test --home $WASMD_HOME
```

## Best Practices

1. **Regular backups:** Backup before major changes
2. **Fast reset by default:** Use fast reset during development
3. **Document state:** Keep notes on important contract addresses
4. **Automation:** Use scripts for consistent resets
5. **Verify after reset:** Always run post-reset verification
6. **Clean logs:** Clear old logs during resets to avoid confusion

## Next Steps

1. **Automation Scripts:** See [Automation Scripts](./automation-scripts.md)
2. **Troubleshooting:** See [Common Issues](../troubleshooting/common-issues.md)
3. **Testing Patterns:** See [Testing Patterns](./testing-patterns.md)

## Additional Resources

- **wasmd Commands:** https://github.com/CosmWasm/wasmd
- **Tendermint Reset:** https://docs.tendermint.com/master/nodes/

---

*Last Updated: 2025-11-28*
*wasmd Version: v0.50.0*
