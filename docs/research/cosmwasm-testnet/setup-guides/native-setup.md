# Native wasmd Binary Setup

This guide provides comprehensive instructions for setting up a local CosmWasm testnet using native wasmd binaries (non-Docker approach) for AKT custody contract development.

## Overview

Native binary setup offers:
- **Direct control:** No containerization overhead
- **Performance:** Native execution speed
- **Debugging:** Direct access to processes and logs
- **Flexibility:** Easy configuration modifications
- **Production similarity:** Closer to actual node deployment

**Trade-offs:**
- Longer initial setup (30-45 minutes)
- System-level dependencies
- Potential version conflicts
- Requires more technical knowledge

## Prerequisites

Ensure you have completed the [Prerequisites Guide](./prerequisites.md):
- Go 1.21.0+ installed
- 8GB RAM minimum (16GB recommended)
- 20GB disk space
- Git installed

**Verify:**
```bash
go version  # Should be 1.21.0 or later
git --version
echo $GOPATH  # Should show Go workspace path
```

## Installation Methods

### Method 1: Build from Source (Recommended)

Building from source ensures you get the exact version with all features enabled.

#### Step 1: Clone wasmd Repository

```bash
# Create workspace
mkdir -p ~/cosmwasm-dev/tools
cd ~/cosmwasm-dev/tools

# Clone wasmd
git clone https://github.com/CosmWasm/wasmd.git
cd wasmd

# View available versions
git tag | grep -E 'v0\.(45|46|47|48|49|50)' | tail -10

# Checkout stable version
git checkout v0.50.0
```

#### Step 2: Build and Install

```bash
# Build and install to $GOPATH/bin
make install

# Verify installation
wasmd version
# Expected output: v0.50.0

# Check binary location
which wasmd
# Expected: /Users/<user>/go/bin/wasmd or /home/<user>/go/bin/wasmd

# Verify wasmd is in PATH
echo $PATH | grep -o "$HOME/go/bin"
# If empty, add to PATH (see troubleshooting section)
```

#### Step 3: Verify Build

```bash
# Check version details
wasmd version --long

# Expected output similar to:
# name: wasmd
# server_name: wasmd
# version: v0.50.0
# commit: abc123def456...
# build_tags: netgo,ledger
# go: go1.21.6 darwin/arm64

# Test basic commands
wasmd help
wasmd keys --help
```

### Method 2: Pre-built Binaries

For faster setup, use official pre-built binaries.

#### Step 1: Download Binary

```bash
# Set version
WASMD_VERSION="v0.50.0"

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Map architecture names
case $ARCH in
  x86_64)
    ARCH="amd64"
    ;;
  arm64|aarch64)
    ARCH="arm64"
    ;;
esac

# Download binary
cd ~/cosmwasm-dev/tools
wget "https://github.com/CosmWasm/wasmd/releases/download/${WASMD_VERSION}/wasmd-${WASMD_VERSION}-${OS}-${ARCH}.tar.gz"

# Extract
tar -xzf wasmd-${WASMD_VERSION}-${OS}-${ARCH}.tar.gz

# Make executable
chmod +x wasmd

# Move to PATH
sudo mv wasmd /usr/local/bin/

# Verify
wasmd version
```

#### Step 2: Verify Installation

```bash
# Test command
wasmd version

# Check help
wasmd --help
```

### Method 3: Install via Package Manager (macOS)

```bash
# Using Homebrew (if available)
# Note: Not officially supported, use with caution
brew tap cosmwasm/tap
brew install wasmd

# Verify
wasmd version
```

## Testnet Initialization

### Step 1: Create Node Directory

```bash
# Create directory for testnet data
mkdir -p ~/cosmwasm-dev/testnet/native
cd ~/cosmwasm-dev/testnet/native

# Set environment variable for convenience
export WASMD_HOME="$HOME/cosmwasm-dev/testnet/native/.wasmd"
echo "export WASMD_HOME=\"$HOME/cosmwasm-dev/testnet/native/.wasmd\"" >> ~/.zshrc  # or ~/.bashrc
```

### Step 2: Initialize Chain

```bash
# Initialize chain with custom home directory
wasmd init testnode \
  --chain-id local-testnet \
  --home $WASMD_HOME

# Expected output:
# {"app_message":{"auth":{"accounts":[],...}}}
# Successful initialization message

# Verify directory structure
ls -la $WASMD_HOME
# Should show: config/ data/ keyring-test/
```

### Step 3: Configure Chain Parameters

#### Configure app.toml

```bash
# Set minimum gas prices (required for transactions)
sed -i.bak 's/minimum-gas-prices = ""/minimum-gas-prices = "0.025uakt"/' $WASMD_HOME/config/app.toml

# Enable API server
sed -i.bak 's/enable = false/enable = true/g' $WASMD_HOME/config/app.toml

# Enable swagger UI for API documentation
sed -i.bak 's/swagger = false/swagger = true/' $WASMD_HOME/config/app.toml

# Configure API address (default is fine for local)
# Address: localhost:1317

# Configure gRPC
# Default address: 0.0.0.0:9090 (fine for local)

# Verify changes
grep "minimum-gas-prices" $WASMD_HOME/config/app.toml
grep "enable = true" $WASMD_HOME/config/app.toml
```

#### Configure config.toml

```bash
# Set faster block time for development (optional)
sed -i.bak 's/timeout_commit = "5s"/timeout_commit = "1s"/' $WASMD_HOME/config/config.toml

# Allow CORS for local development
sed -i.bak 's/cors_allowed_origins = \[\]/cors_allowed_origins = ["*"]/' $WASMD_HOME/config/config.toml

# Configure RPC server to listen on all interfaces
sed -i.bak 's/laddr = "tcp:\/\/127.0.0.1:26657"/laddr = "tcp:\/\/0.0.0.0:26657"/' $WASMD_HOME/config/config.toml

# Verify changes
grep "timeout_commit" $WASMD_HOME/config/config.toml
grep "cors_allowed_origins" $WASMD_HOME/config/config.toml
```

#### Configure genesis.json

```bash
# Enable permissionless contract uploads (DEVELOPMENT ONLY)
sed -i.bak 's/"permission": "Nobody"/"permission": "Everybody"/' $WASMD_HOME/config/genesis.json

# Set governance parameters for faster testing
# Reduce voting period from 2 days to 5 minutes
sed -i.bak 's/"voting_period": "172800s"/"voting_period": "300s"/' $WASMD_HOME/config/genesis.json

# Verify changes
grep "permission" $WASMD_HOME/config/genesis.json | head -5
grep "voting_period" $WASMD_HOME/config/genesis.json
```

### Step 4: Create Keys

```bash
# Create validator key
wasmd keys add validator \
  --keyring-backend test \
  --home $WASMD_HOME

# Save the mnemonic shown!
# Example output:
# - name: validator
#   type: local
#   address: wasm1abc123...
#   pubkey: '{"@type":"/cosmos.crypto.secp256k1.PubKey",...}'
#   mnemonic: "word1 word2 word3 ... word24"

# Create additional test accounts
wasmd keys add alice \
  --keyring-backend test \
  --home $WASMD_HOME

wasmd keys add bob \
  --keyring-backend test \
  --home $WASMD_HOME

# List all keys
wasmd keys list \
  --keyring-backend test \
  --home $WASMD_HOME

# Export addresses to environment variables
export VALIDATOR_ADDR=$(wasmd keys show validator -a --keyring-backend test --home $WASMD_HOME)
export ALICE_ADDR=$(wasmd keys show alice -a --keyring-backend test --home $WASMD_HOME)
export BOB_ADDR=$(wasmd keys show bob -a --keyring-backend test --home $WASMD_HOME)

echo "Validator: $VALIDATOR_ADDR"
echo "Alice: $ALICE_ADDR"
echo "Bob: $BOB_ADDR"
```

### Step 5: Add Genesis Accounts

```bash
# Add validator account with 100,000 AKT (100000000000 uakt)
wasmd add-genesis-account validator 100000000000uakt \
  --keyring-backend test \
  --home $WASMD_HOME

# Add alice with 50,000 AKT
wasmd add-genesis-account alice 50000000000uakt \
  --keyring-backend test \
  --home $WASMD_HOME

# Add bob with 50,000 AKT
wasmd add-genesis-account bob 50000000000uakt \
  --keyring-backend test \
  --home $WASMD_HOME

# Verify accounts in genesis
cat $WASMD_HOME/config/genesis.json | jq '.app_state.bank.balances'
```

### Step 6: Create Genesis Transaction

```bash
# Create gentx for validator with 50,000 AKT staked
wasmd gentx validator 50000000000uakt \
  --chain-id local-testnet \
  --keyring-backend test \
  --home $WASMD_HOME

# Expected output:
# Genesis transaction written to $WASMD_HOME/config/gentx/gentx-*.json

# Collect all genesis transactions
wasmd collect-gentxs --home $WASMD_HOME

# Expected output:
# Successfully collected gentxs from: $WASMD_HOME/config/gentx

# Validate genesis file
wasmd validate-genesis --home $WASMD_HOME

# Expected output:
# File at $WASMD_HOME/config/genesis.json is a valid genesis file
```

## Starting the Chain

### Method 1: Foreground (Interactive)

```bash
# Start in foreground (logs to terminal)
wasmd start --home $WASMD_HOME

# Watch for:
# - "starting ABCI with Tendermint"
# - "executed block" (blocks are being produced)
# - "indexed block" (block indexing is working)

# Press Ctrl+C to stop
```

### Method 2: Background (Daemon)

```bash
# Start in background
nohup wasmd start --home $WASMD_HOME > $WASMD_HOME/wasmd.log 2>&1 &

# Save process ID
echo $! > $WASMD_HOME/wasmd.pid

# View logs
tail -f $WASMD_HOME/wasmd.log

# Check if running
ps aux | grep wasmd | grep -v grep

# Stop daemon
kill $(cat $WASMD_HOME/wasmd.pid)
```

### Method 3: Systemd Service (Linux Production-like)

Create systemd service file:

```bash
# Create service file
sudo tee /etc/systemd/system/wasmd.service > /dev/null <<EOF
[Unit]
Description=CosmWasm Daemon (wasmd)
After=network-online.target

[Service]
User=$USER
ExecStart=$(which wasmd) start --home $WASMD_HOME
Restart=always
RestartSec=3
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable wasmd

# Start service
sudo systemctl start wasmd

# Check status
sudo systemctl status wasmd

# View logs
journalctl -u wasmd -f

# Stop service
sudo systemctl stop wasmd

# Restart service
sudo systemctl restart wasmd
```

## Verification

### Check Chain Status

```bash
# Query chain status
wasmd status --home $WASMD_HOME

# Expected output (JSON):
# {
#   "NodeInfo": {...},
#   "SyncInfo": {
#     "latest_block_height": "123",
#     "catching_up": false
#   },
#   "ValidatorInfo": {...}
# }

# Pretty print with jq
wasmd status --home $WASMD_HOME | jq .

# Check specific fields
wasmd status --home $WASMD_HOME | jq -r '.SyncInfo.latest_block_height'
```

### Query Accounts

```bash
# Check validator balance
wasmd query bank balances $VALIDATOR_ADDR --home $WASMD_HOME

# Expected output:
# balances:
# - amount: "100000000000"
#   denom: uakt
# pagination:
#   next_key: null
#   total: "0"

# Check alice
wasmd query bank balances $ALICE_ADDR --home $WASMD_HOME

# Check total supply
wasmd query bank total --home $WASMD_HOME
```

### Test Transaction

```bash
# Send tokens from alice to bob
wasmd tx bank send alice $BOB_ADDR 1000000uakt \
  --chain-id local-testnet \
  --keyring-backend test \
  --home $WASMD_HOME \
  --gas auto \
  --gas-adjustment 1.3 \
  --gas-prices 0.025uakt \
  --yes

# Wait for block confirmation (1-5 seconds)
sleep 2

# Verify bob's balance increased
wasmd query bank balances $BOB_ADDR --home $WASMD_HOME
# Should show: 50000001000000 uakt (50000 AKT + 1 AKT)
```

## Configuration Files Reference

### app.toml Key Settings

```toml
# Minimum gas prices
minimum-gas-prices = "0.025uakt"

# API Configuration
[api]
enable = true
swagger = true
address = "tcp://0.0.0.0:1317"

# gRPC Configuration
[grpc]
enable = true
address = "0.0.0.0:9090"

# State Sync (for syncing from existing network)
[state-sync]
snapshot-interval = 0  # Disable for local testnet
snapshot-keep-recent = 2
```

### config.toml Key Settings

```toml
# RPC Server
[rpc]
laddr = "tcp://0.0.0.0:26657"
cors_allowed_origins = ["*"]

# P2P Configuration
[p2p]
laddr = "tcp://0.0.0.0:26656"
persistent_peers = ""  # Empty for single node

# Consensus
[consensus]
timeout_commit = "1s"  # Fast blocks for development
```

### genesis.json Key Settings

```json
{
  "app_state": {
    "wasm": {
      "params": {
        "code_upload_access": {
          "permission": "Everybody"  // DEVELOPMENT ONLY
        },
        "instantiate_default_permission": "Everybody"
      }
    },
    "gov": {
      "voting_params": {
        "voting_period": "300s"  // 5 minutes for testing
      }
    },
    "bank": {
      "params": {
        "send_enabled": [{"denom": "uakt", "enabled": true}]
      }
    }
  }
}
```

## Management Operations

### Stopping the Chain

```bash
# If running in foreground
Ctrl+C

# If running in background
kill $(cat $WASMD_HOME/wasmd.pid)

# If running as systemd service
sudo systemctl stop wasmd

# Force kill if needed
pkill -9 wasmd
```

### Restarting the Chain

```bash
# Background mode
kill $(cat $WASMD_HOME/wasmd.pid)
nohup wasmd start --home $WASMD_HOME > $WASMD_HOME/wasmd.log 2>&1 &
echo $! > $WASMD_HOME/wasmd.pid

# Systemd
sudo systemctl restart wasmd
```

### Viewing Logs

```bash
# Background mode
tail -f $WASMD_HOME/wasmd.log

# Systemd
journalctl -u wasmd -f

# View errors only
journalctl -u wasmd -p err -f
```

### Backup Chain Data

```bash
# Stop chain first
kill $(cat $WASMD_HOME/wasmd.pid)

# Backup entire directory
tar -czf wasmd-backup-$(date +%Y%m%d).tar.gz $WASMD_HOME

# Backup only data (exclude logs)
tar -czf wasmd-data-$(date +%Y%m%d).tar.gz \
  $WASMD_HOME/config \
  $WASMD_HOME/data \
  $WASMD_HOME/keyring-test

# Restart chain
nohup wasmd start --home $WASMD_HOME > $WASMD_HOME/wasmd.log 2>&1 &
```

### Restore from Backup

```bash
# Stop chain
kill $(cat $WASMD_HOME/wasmd.pid)

# Remove current data
rm -rf $WASMD_HOME

# Restore from backup
tar -xzf wasmd-backup-YYYYMMDD.tar.gz -C ~/cosmwasm-dev/testnet/native/

# Restart chain
nohup wasmd start --home $WASMD_HOME > $WASMD_HOME/wasmd.log 2>&1 &
```

## Advanced Configuration

### Enable Prometheus Metrics

```toml
# In config.toml
[instrumentation]
prometheus = true
prometheus_listen_addr = ":26660"
```

Access metrics: `http://localhost:26660/metrics`

### Configure Pruning

```toml
# In app.toml
[pruning]
pruning = "custom"
pruning-keep-recent = "100"
pruning-keep-every = "500"
pruning-interval = "10"
```

### Database Backend

```toml
# In config.toml
[storage]
db_backend = "goleveldb"  # or "rocksdb" (requires CGO)
db_dir = "data"
```

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 26657
lsof -i :26657

# Kill process or change port in config.toml
sed -i.bak 's/tcp:\/\/0.0.0.0:26657/tcp:\/\/0.0.0.0:36657/' $WASMD_HOME/config/config.toml
```

### wasmd: command not found

```bash
# Check if GOPATH/bin is in PATH
echo $PATH | grep "$HOME/go/bin"

# Add to PATH
echo 'export PATH=$PATH:$HOME/go/bin' >> ~/.zshrc
source ~/.zshrc

# Or use absolute path
$HOME/go/bin/wasmd version
```

### Genesis Validation Fails

```bash
# Common issue: duplicate accounts
# Solution: start fresh
rm -rf $WASMD_HOME
# Re-run initialization steps

# Check genesis structure
cat $WASMD_HOME/config/genesis.json | jq .
```

### Chain Won't Start

```bash
# Check logs for errors
tail -50 $WASMD_HOME/wasmd.log

# Common issues:
# 1. Corrupted data - reset data directory
rm -rf $WASMD_HOME/data
wasmd start --home $WASMD_HOME

# 2. Port conflicts - check and change ports
# 3. Permission issues - check file ownership
ls -la $WASMD_HOME
```

## Performance Tuning

### Optimize for Development Speed

```bash
# Fast blocks (1 second)
sed -i.bak 's/timeout_commit = "5s"/timeout_commit = "1s"/' $WASMD_HOME/config/config.toml

# Disable mempool caching
sed -i.bak 's/cache_size = 10000/cache_size = 1000/' $WASMD_HOME/config/config.toml

# Reduce peer discovery overhead
sed -i.bak 's/max_num_inbound_peers = 40/max_num_inbound_peers = 0/' $WASMD_HOME/config/config.toml
sed -i.bak 's/max_num_outbound_peers = 10/max_num_outbound_peers = 0/' $WASMD_HOME/config/config.toml
```

### Optimize for Production Testing

```bash
# Slower blocks (5 seconds) - more realistic
sed -i.bak 's/timeout_commit = "1s"/timeout_commit = "5s"/' $WASMD_HOME/config/config.toml

# Enable state sync snapshots
sed -i.bak 's/snapshot-interval = 0/snapshot-interval = 1000/' $WASMD_HOME/config/app.toml

# Aggressive pruning
sed -i.bak 's/pruning = "default"/pruning = "everything"/' $WASMD_HOME/config/app.toml
```

## Next Steps

1. **Configure AKT Token:** See [Akash Token Configuration](./akash-token-config.md)
2. **Deploy Contracts:** See [Contract Deployment Workflow](../workflows/contract-deployment.md)
3. **Testing:** See [Testing Patterns](../workflows/testing-patterns.md)
4. **Automation:** See [Automation Scripts](../workflows/automation-scripts.md)

## Additional Resources

- **wasmd Documentation:** https://github.com/CosmWasm/wasmd
- **Cosmos SDK Documentation:** https://docs.cosmos.network
- **CosmWasm Book:** https://book.cosmwasm.com/
- **Tendermint Documentation:** https://docs.tendermint.com/

---

*Last Updated: 2025-11-28*
*wasmd Version: v0.50.0*
*Platform: macOS Darwin 23.5.0 / Linux*
