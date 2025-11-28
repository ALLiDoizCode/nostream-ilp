# Common Issues and Solutions

This guide provides comprehensive troubleshooting for common issues encountered when setting up and running a local CosmWasm testnet.

## Quick Reference Table

| Issue | Symptom | Quick Fix |
|-------|---------|-----------|
| Port conflict | "address already in use" | `lsof -i :26657` → kill process or change port |
| wasmd not found | "command not found" | Add `$GOPATH/bin` to `$PATH` |
| Genesis invalid | "genesis validation failed" | Re-run init-testnet.sh |
| Out of gas | Transaction fails with gas error | Increase `--gas` or use `--gas auto` |
| Permission denied (Docker) | Cannot connect to Docker daemon | Add user to docker group |
| Chain won't start | No blocks produced | Check logs for errors |
| Keys not found | "key not found" | Verify keyring-backend is "test" |
| Insufficient funds | Transaction rejected | Check balance with `query bank balances` |
| Contract upload fails | "contract too large" | Re-optimize with cosmwasm-optimizer |
| Cannot connect to RPC | Curl fails | Verify chain is running and ports are open |

## Setup Issues

### 1. wasmd: command not found

**Symptom:**
```bash
$ wasmd version
-bash: wasmd: command not found
```

**Root Cause:** wasmd binary not in PATH

**Solution:**
```bash
# Check if wasmd is installed
ls -la $GOPATH/bin/wasmd
ls -la $HOME/go/bin/wasmd

# Add to PATH permanently
echo 'export PATH=$PATH:$HOME/go/bin' >> ~/.zshrc
source ~/.zshrc

# Verify
wasmd version
```

**Prevention:** Add Go bin directory to PATH during Go installation

---

### 2. Port Already in Use

**Symptom:**
```
Error: listen tcp 127.0.0.1:26657: bind: address already in use
```

**Root Cause:** Another process using port 26657 (or 1317, 9090)

**Solution:**
```bash
# Find process using port
lsof -i :26657

# Kill the process
kill -9 <PID>

# OR change port in config.toml
sed -i.bak 's/tcp:\/\/0.0.0.0:26657/tcp:\/\/0.0.0.0:36657/' $WASMD_HOME/config/config.toml

# Restart chain
wasmd start --home $WASMD_HOME
```

**Prevention:** Always stop chain before restarting

---

### 3. Docker Permission Denied (Linux)

**Symptom:**
```
permission denied while trying to connect to the Docker daemon socket
```

**Root Cause:** User not in docker group

**Solution:**
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Apply changes (log out and back in, or run)
newgrp docker

# Verify
docker ps
```

**Prevention:** Add to docker group during Docker installation

---

### 4. Genesis Validation Fails

**Symptom:**
```
Error: error during handshake: error on replay: validator set is nil in genesis and still empty after InitChain
```

**Root Cause:** Invalid genesis.json configuration

**Solution:**
```bash
# Remove corrupted genesis
rm -rf $WASMD_HOME

# Re-initialize
./scripts/init-testnet.sh native

# OR manually fix
wasmd init testnode --chain-id local-testnet --home $WASMD_HOME --overwrite
# Then re-add accounts and gentx
```

**Prevention:** Always validate genesis after modifications: `wasmd validate-genesis --home $WASMD_HOME`

---

### 5. Rust wasm32 Target Missing

**Symptom:**
```
error: can't find crate for `std`
  = note: the `wasm32-unknown-unknown` target may not be installed
```

**Root Cause:** wasm32 target not added to Rust toolchain

**Solution:**
```bash
# Add wasm32 target
rustup target add wasm32-unknown-unknown

# Verify
rustup target list --installed | grep wasm32

# Rebuild
cargo wasm
```

**Prevention:** Run `rustup target add wasm32-unknown-unknown` during setup

---

## Runtime Issues

### 6. Chain Won't Produce Blocks

**Symptom:**
```
Chain starts but latest_block_height remains 0
```

**Root Cause:** Multiple possible causes

**Solution:**
```bash
# Check logs for errors
tail -f $WASMD_HOME/wasmd.log

# Common issues:
# 1. Insufficient validator power
wasmd query staking validators --home $WASMD_HOME

# 2. Corrupted data
rm -rf $WASMD_HOME/data
wasmd start --home $WASMD_HOME

# 3. Time sync issues
sudo ntpdate pool.ntp.org  # Sync system time
```

**Prevention:** Ensure validator has sufficient stake in genesis

---

### 7. Out of Gas Errors

**Symptom:**
```
Error: out of gas in location: ...
```

**Root Cause:** Gas limit too low for transaction

**Solution:**
```bash
# Use auto gas estimation
wasmd tx wasm store contract.wasm \
    --from alice \
    --gas auto \
    --gas-adjustment 1.3 \
    --gas-prices 0.025uakt

# OR specify explicit gas limit
wasmd tx wasm store contract.wasm \
    --from alice \
    --gas 1500000 \
    --gas-prices 0.025uakt
```

**Prevention:** Always use `--gas auto --gas-adjustment 1.3` for complex transactions

---

### 8. Insufficient Fees Error

**Symptom:**
```
Error: insufficient fees; got: 0uakt required: 5000uakt
```

**Root Cause:** No gas prices specified or minimum-gas-prices not set

**Solution:**
```bash
# Add gas prices to command
wasmd tx bank send alice <recipient> 1000000uakt \
    --gas-prices 0.025uakt

# OR fix app.toml
sed -i 's/minimum-gas-prices = ""/minimum-gas-prices = "0.025uakt"/' $WASMD_HOME/config/app.toml
```

**Prevention:** Set minimum-gas-prices in app.toml during initialization

---

### 9. Key Not Found

**Symptom:**
```
Error: alice: key not found
```

**Root Cause:** Incorrect keyring-backend or key doesn't exist

**Solution:**
```bash
# List existing keys
wasmd keys list --keyring-backend test --home $WASMD_HOME

# Create key if missing
wasmd keys add alice --keyring-backend test --home $WASMD_HOME

# Verify keyring-backend is correct (should be "test" for local)
wasmd keys show alice --keyring-backend test --home $WASMD_HOME
```

**Prevention:** Always use `--keyring-backend test` for local development

---

### 10. Insufficient Funds

**Symptom:**
```
Error: insufficient funds: 0uakt < 5000000uakt
```

**Root Cause:** Account has insufficient balance

**Solution:**
```bash
# Check balance
ALICE_ADDR=$(wasmd keys show alice -a --keyring-backend test --home $WASMD_HOME)
wasmd query bank balances $ALICE_ADDR --home $WASMD_HOME

# If balance is 0, account wasn't added to genesis
# Reset and re-add genesis accounts
./scripts/reset-testnet.sh full
```

**Prevention:** Verify genesis accounts have balances before starting chain

---

## Contract Issues

### 11. Contract Upload Fails: Too Large

**Symptom:**
```
Error: contract exceeds maximum size (819200 bytes)
```

**Root Cause:** Contract not optimized or has bloated dependencies

**Solution:**
```bash
# Re-optimize with cosmwasm-optimizer
docker run --rm -v "$(pwd)":/code \
    --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
    --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
    cosmwasm/optimizer:0.16.0

# Check optimized size
ls -lh artifacts/*.wasm

# If still too large, review dependencies
cargo tree

# Remove unused features in Cargo.toml
```

**Prevention:** Always optimize contracts before upload

---

### 12. Contract Instantiation Fails

**Symptom:**
```
Error: failed to execute message; message index: 0: Generic error: ...
```

**Root Cause:** Invalid instantiation message or contract logic error

**Solution:**
```bash
# Validate JSON message
echo '{"owner":"wasm1..."}' | jq .

# Check contract's instantiate requirements
cat schema/instantiate.json

# View detailed error logs
wasmd query tx <TX_HASH> --home $WASMD_HOME | jq .

# Test instantiate message in unit tests first
cargo test proper_initialization
```

**Prevention:** Test instantiation in unit tests before deploying

---

### 13. Query Returns Empty Result

**Symptom:**
```
$ wasmd query wasm contract-state smart $CONTRACT_ADDR '{"balance":{"address":"wasm1..."}}'
data: null
```

**Root Cause:** State not initialized or query message malformed

**Solution:**
```bash
# Check if contract is instantiated
wasmd query wasm contract $CONTRACT_ADDR --home $WASMD_HOME

# Verify query message matches schema
cat schema/query.json

# Query raw state to verify data exists
wasmd query wasm contract-state all $CONTRACT_ADDR --home $WASMD_HOME

# Check contract logs for errors
# (if custom logging implemented)
```

**Prevention:** Validate query messages against generated schema

---

### 14. Execute Transaction Fails

**Symptom:**
```
Error: execute wasm contract failed: ...
```

**Root Cause:** Contract execution error or insufficient funds

**Solution:**
```bash
# Check transaction details
wasmd query tx <TX_HASH> --home $WASMD_HOME --output json | jq .

# Common issues:
# 1. Insufficient contract balance (for bank sends)
wasmd query bank balances $CONTRACT_ADDR --home $WASMD_HOME

# 2. Wrong sender
# Ensure --from matches required permissions

# 3. Invalid execute message
cat schema/execute.json

# Debug in unit tests
cargo test execute_deposit -- --nocapture
```

**Prevention:** Comprehensive unit tests for all execute paths

---

### 15. Contract Migration Fails

**Symptom:**
```
Error: migration failed: unauthorized
```

**Root Cause:** Sender is not contract admin

**Solution:**
```bash
# Check who is admin
wasmd query wasm contract $CONTRACT_ADDR --home $WASMD_HOME | jq .admin

# Ensure --from is the admin
wasmd tx wasm migrate $CONTRACT_ADDR $NEW_CODE_ID '{}' \
    --from <admin_key> \
    --keyring-backend test \
    --home $WASMD_HOME
```

**Prevention:** Set admin during instantiation with `--admin <address>`

---

## Docker-Specific Issues

### 16. Docker Container Won't Start

**Symptom:**
```
Error: Container exits immediately after starting
```

**Root Cause:** Configuration error or resource limits

**Solution:**
```bash
# Check container logs
docker-compose logs wasmd

# Common fixes:
# 1. Remove volume and restart
docker-compose down -v
docker-compose up -d

# 2. Increase Docker resources (Docker Desktop)
# Settings → Resources → Memory (increase to 4GB+)

# 3. Fix docker-compose.yml syntax
docker-compose config
```

**Prevention:** Validate docker-compose.yml before first run

---

### 17. Cannot Access RPC from Host

**Symptom:**
```
$ curl http://localhost:26657/status
curl: (7) Failed to connect to localhost port 26657
```

**Root Cause:** Port mapping incorrect or firewall blocking

**Solution:**
```bash
# Verify container is running
docker-compose ps

# Check port mapping
docker port cosmwasm-testnet

# Test from inside container
docker exec cosmwasm-testnet curl http://localhost:26657/status

# Fix port mapping in docker-compose.yml
ports:
  - "26657:26657"  # host:container
```

**Prevention:** Test RPC access after starting containers

---

### 18. Docker Volume Permissions

**Symptom:**
```
Error: permission denied accessing /root/.wasmd
```

**Root Cause:** Host volume mount has wrong permissions

**Solution:**
```bash
# Fix permissions on host
chmod -R 755 ~/.wasmd-docker

# OR use named volume instead of bind mount
# In docker-compose.yml:
volumes:
  - wasmd-data:/root/.wasmd  # Named volume (recommended)
  # NOT: - ~/.wasmd-docker:/root/.wasmd
```

**Prevention:** Use named Docker volumes for data persistence

---

## Network Issues

### 19. Slow Block Times

**Symptom:**
Blocks take 5+ seconds instead of expected 1 second

**Root Cause:** Default timeout_commit setting

**Solution:**
```bash
# Edit config.toml
sed -i 's/timeout_commit = "5s"/timeout_commit = "1s"/' $WASMD_HOME/config/config.toml

# Restart chain
pkill wasmd
wasmd start --home $WASMD_HOME
```

**Prevention:** Configure fast block times during initialization

---

### 20. Cannot Connect to Peers (Multi-Node)

**Symptom:**
```
Nodes don't connect to each other
```

**Root Cause:** Incorrect persistent_peers or network configuration

**Solution:**
```bash
# Get node ID
wasmd tendermint show-node-id --home $WASMD_HOME

# Add to other node's config.toml
persistent_peers = "<node_id>@<ip>:26656"

# Verify connectivity
curl http://localhost:26657/net_info | jq .result.peers
```

**Prevention:** Properly configure persistent_peers during multi-node setup

---

## Pre-flight Checklist

Before starting troubleshooting:

- [ ] Check system resources (disk space, RAM)
- [ ] Verify all prerequisites installed
- [ ] Review recent changes to configuration
- [ ] Check logs for error messages
- [ ] Ensure chain is fully stopped before restarting
- [ ] Backup data before destructive operations

## Troubleshooting Methodology

1. **Identify symptoms:** Collect error messages
2. **Check logs:** `tail -f $WASMD_HOME/wasmd.log` or `docker-compose logs -f`
3. **Verify configuration:** Ensure config files are valid
4. **Isolate issue:** Test components individually
5. **Consult documentation:** Check official docs for known issues
6. **Ask community:** Cosmos Discord, GitHub issues

## Getting Help

If issues persist:

1. **Gather information:**
   - wasmd version: `wasmd version`
   - Go version: `go version`
   - OS: `uname -a`
   - Full error message
   - Steps to reproduce

2. **Check resources:**
   - CosmWasm Discord: https://discord.gg/cosmwasm
   - GitHub Issues: https://github.com/CosmWasm/wasmd/issues
   - Cosmos Forum: https://forum.cosmos.network

3. **Create minimal reproduction:**
   - Isolate the issue
   - Provide full command output
   - Share relevant config files

## Next Steps

1. **Debugging Guide:** See [Debugging Guide](./debugging-guide.md)
2. **Version Compatibility:** See [Version Compatibility](./version-compatibility.md)
3. **Reset Procedures:** See [Reset Procedures](../workflows/reset-procedures.md)

---

*Last Updated: 2025-11-28*
*wasmd Version: v0.50.0*
