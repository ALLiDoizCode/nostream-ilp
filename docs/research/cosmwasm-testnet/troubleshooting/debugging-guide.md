# Debugging Guide

Comprehensive debugging techniques for CosmWasm contracts and testnet operations.

## Log Analysis

### wasmd Logs

```bash
# Native setup - tail logs
tail -f $WASMD_HOME/wasmd.log

# Filter for errors only
tail -f $WASMD_HOME/wasmd.log | grep -i error

# Docker setup
docker-compose logs -f wasmd

# Filter specific module
docker-compose logs wasmd | grep wasm
```

### Understanding Log Levels

- **INFO:** Normal operations
- **DEBUG:** Detailed execution flow
- **ERROR:** Critical failures

## Transaction Debugging

### Query Transaction Details

```bash
# Get transaction by hash
wasmd query tx <TX_HASH> --home $WASMD_HOME --output json | jq .

# View events
wasmd query tx <TX_HASH> --home $WASMD_HOME --output json | jq '.logs[].events'

# Check gas used
wasmd query tx <TX_HASH> --home $WASMD_HOME --output json | jq '.gas_used'
```

### Failed Transaction Analysis

```bash
# View raw log
wasmd query tx <TX_HASH> --home $WASMD_HOME | jq -r '.raw_log'

# Common error patterns
# "out of gas" -> Increase gas limit
# "unauthorized" -> Wrong sender
# "insufficient funds" -> Check balance
```

## Contract State Inspection

### Query All State

```bash
# View all contract storage
wasmd query wasm contract-state all $CONTRACT_ADDR --home $WASMD_HOME

# Query specific key (hex encoded)
wasmd query wasm contract-state raw $CONTRACT_ADDR <hex_key> --home $WASMD_HOME
```

### Contract Info

```bash
# Get contract metadata
wasmd query wasm contract $CONTRACT_ADDR --home $WASMD_HOME

# Get code info
wasmd query wasm code 1 --home $WASMD_HOME
```

## Network Debugging

### Check Node Status

```bash
# RPC status
curl http://localhost:26657/status | jq .

# Check if syncing
curl http://localhost:26657/status | jq -r '.result.sync_info.catching_up'

# Get latest block height
curl http://localhost:26657/status | jq -r '.result.sync_info.latest_block_height'
```

### Network Info

```bash
# List peers
curl http://localhost:26657/net_info | jq '.result.peers'

# Number of peers
curl http://localhost:26657/net_info | jq '.result.n_peers'
```

## Enable Debug Mode

### wasmd Debug Logging

```bash
# Start with debug logging
wasmd start --home $WASMD_HOME --log_level debug

# Or set in config.toml
sed -i 's/log_level = "info"/log_level = "debug"/' $WASMD_HOME/config/config.toml
```

## Contract Debugging

### Unit Test Debugging

```rust
#[test]
fn debug_test() {
    let mut deps = mock_dependencies();
    // ... setup ...

    // Print debug info
    println!("State: {:?}", CONFIG.load(&deps.storage).unwrap());

    // Run with output
    // cargo test debug_test -- --nocapture
}
```

### Query Debugging

```bash
# Test query locally before deploying
cargo test query_balance -- --nocapture
```

## Performance Profiling

### Gas Usage

```bash
# Dry run to estimate gas
wasmd tx wasm execute $CONTRACT_ADDR '{"action":{}}' \
    --from alice \
    --dry-run \
    --home $WASMD_HOME
```

### Block Time Analysis

```bash
# Monitor block production
watch -n 1 'curl -s http://localhost:26657/status | jq -r .result.sync_info.latest_block_height'
```

## Next Steps

- [Common Issues](./common-issues.md)
- [Version Compatibility](./version-compatibility.md)

---

*Last Updated: 2025-11-28*
