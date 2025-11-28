# Contract Deployment Workflow

This guide provides a comprehensive workflow for deploying CosmWasm smart contracts to your local testnet, from compilation through instantiation, execution, and migration.

## Overview

The complete deployment lifecycle:

```
1. Compile → 2. Optimize → 3. Validate → 4. Upload → 5. Instantiate → 6. Execute → 7. Query → 8. Migrate
```

Each step is essential for production-ready contract deployment.

## Prerequisites

- Local testnet running (Docker or native)
- Rust toolchain with wasm32 target installed
- Docker installed (for optimizer)
- cosmwasm-check installed
- Test accounts with AKT balances

**Verify:**
```bash
# Rust and wasm target
rustc --version
rustup target list --installed | grep wasm32-unknown-unknown

# Docker
docker --version

# cosmwasm-check
cosmwasm-check --version

# Testnet running
curl http://localhost:26657/status
```

## Step 1: Compile Contract

### Create or Clone Contract

```bash
# Option 1: Create new contract from template
cargo generate --git https://github.com/CosmWasm/cw-template.git --name akt-custody
cd akt-custody

# Option 2: Use existing contract
cd ~/cosmwasm-dev/contracts/akt-custody
```

### Build Contract

```bash
# Compile to WebAssembly
cargo wasm

# Output location
# target/wasm32-unknown-unknown/release/akt_custody.wasm

# Check file size (should be large, pre-optimization)
ls -lh target/wasm32-unknown-unknown/release/*.wasm
# Example: 1.8M akt_custody.wasm
```

### Run Unit Tests

```bash
# Run all tests
cargo test

# Run specific test
cargo test --test integration_tests

# With output
cargo test -- --nocapture

# Expected: all tests passing
```

### Run Schema Generation

```bash
# Generate JSON schemas for contract messages
cargo schema

# Output: schema/*.json
ls -la schema/
# Example:
# - instantiate.json
# - execute.json
# - query.json
# - state.json
```

## Step 2: Optimize Contract

Optimization produces deterministic, minimal-size Wasm binaries.

### Using cosmwasm-optimizer (Single Contract)

```bash
# Run optimizer (from project root)
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/optimizer:0.16.0

# Wait for completion (2-5 minutes)
# Output: artifacts/akt_custody.wasm

# Check optimized size
ls -lh artifacts/*.wasm
# Example: 142K akt_custody.wasm (much smaller!)
```

### Using workspace-optimizer (Multiple Contracts)

For workspaces with multiple contracts:

```bash
# Run workspace optimizer
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/workspace-optimizer:0.16.0

# Outputs: artifacts/*.wasm (one per contract)
```

### Optimizer Output

```
Optimizing contract...
Creating intermediate container...
Compiling with optimizations...
Stripping debug symbols...
Running wasm-opt...

Final size: 142,857 bytes
Checksum: sha256:abc123def456...

Optimization complete: artifacts/akt_custody.wasm
```

## Step 3: Validate Contract

Ensure the contract meets CosmWasm standards before upload.

### Using cosmwasm-check

```bash
# Validate optimized contract
cosmwasm-check artifacts/akt_custody.wasm

# Expected output:
# Available capabilities: {"iterator", "staking", "stargate", "cosmwasm_1_1"}
# contract checks passed
```

### Common Validation Errors

**Error: Contract too large**
```
Error: wasm contract too large: 819200 bytes (max: 819200)
```
Solution: Re-run optimizer, remove unused dependencies

**Error: Invalid import**
```
Error: contract has invalid imports
```
Solution: Ensure no floating-point operations or unsupported features

**Error: Missing exports**
```
Error: contract missing required exports
```
Solution: Verify entry points are properly decorated with `#[entry_point]`

## Step 4: Upload Contract

Upload the optimized Wasm binary to the blockchain.

### Native Setup Upload

```bash
# Set variables
export WASMD_HOME="$HOME/cosmwasm-dev/testnet/native/.wasmd"
CONTRACT_WASM="artifacts/akt_custody.wasm"

# Upload contract
TX_HASH=$(wasmd tx wasm store $CONTRACT_WASM \
  --from alice \
  --chain-id local-testnet \
  --gas auto \
  --gas-adjustment 1.3 \
  --gas-prices 0.025uakt \
  --keyring-backend test \
  --home $WASMD_HOME \
  --yes \
  --output json | jq -r '.txhash')

echo "Transaction hash: $TX_HASH"

# Wait for confirmation (1-5 seconds)
sleep 3

# Get code ID from transaction
CODE_ID=$(wasmd query tx $TX_HASH \
  --home $WASMD_HOME \
  --output json | \
  jq -r '.logs[0].events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')

echo "Code ID: $CODE_ID"
```

### Docker Setup Upload

```bash
# Copy contract into container
docker cp artifacts/akt_custody.wasm cosmwasm-testnet:/tmp/

# Upload contract
CODE_ID=$(docker exec cosmwasm-testnet \
  wasmd tx wasm store /tmp/akt_custody.wasm \
    --from alice \
    --chain-id local-testnet \
    --gas auto \
    --gas-adjustment 1.3 \
    --gas-prices 0.025uakt \
    --keyring-backend test \
    --yes \
    --output json | jq -r '.logs[0].events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')

echo "Code ID: $CODE_ID"
```

### Verify Upload

```bash
# Query uploaded code
wasmd query wasm code $CODE_ID --home $WASMD_HOME

# List all uploaded codes
wasmd query wasm list-code --home $WASMD_HOME

# Expected output:
# code_infos:
# - code_id: "1"
#   creator: wasm1...
#   data_hash: abc123...
```

### Download and Verify Code

```bash
# Download uploaded code
wasmd query wasm code $CODE_ID \
  --home $WASMD_HOME \
  downloaded.wasm

# Compare checksums
sha256sum artifacts/akt_custody.wasm downloaded.wasm

# Should match exactly (deterministic builds)
```

## Step 5: Instantiate Contract

Create a contract instance with initial state.

### Prepare Instantiation Message

```json
{
  "owner": "wasm1abc123...",
  "custody_fee_bps": 50,
  "min_deposit_amount": "1000000",
  "denom": "uakt"
}
```

### Instantiate Contract (Native)

```bash
# Get owner address
ALICE_ADDR=$(wasmd keys show alice -a --keyring-backend test --home $WASMD_HOME)

# Create instantiation message
INIT_MSG=$(cat <<EOF
{
  "owner": "$ALICE_ADDR",
  "custody_fee_bps": 50,
  "min_deposit_amount": "1000000",
  "denom": "uakt"
}
EOF
)

# Instantiate contract
wasmd tx wasm instantiate $CODE_ID "$INIT_MSG" \
  --from alice \
  --label "akt-custody-v1" \
  --admin $ALICE_ADDR \
  --chain-id local-testnet \
  --gas auto \
  --gas-adjustment 1.3 \
  --gas-prices 0.025uakt \
  --keyring-backend test \
  --home $WASMD_HOME \
  --yes

# Wait for confirmation
sleep 3

# Get contract address
CONTRACT_ADDR=$(wasmd query wasm list-contract-by-code $CODE_ID \
  --home $WASMD_HOME \
  --output json | jq -r '.contracts[0]')

echo "Contract address: $CONTRACT_ADDR"
```

### Instantiate with Funds

```bash
# Instantiate and send tokens to contract
wasmd tx wasm instantiate $CODE_ID "$INIT_MSG" \
  --from alice \
  --label "akt-custody-v1" \
  --admin $ALICE_ADDR \
  --amount 10000000uakt \
  --chain-id local-testnet \
  --gas auto \
  --gas-adjustment 1.3 \
  --gas-prices 0.025uakt \
  --keyring-backend test \
  --home $WASMD_HOME \
  --yes
```

### Verify Instantiation

```bash
# Query contract info
wasmd query wasm contract $CONTRACT_ADDR --home $WASMD_HOME

# Expected output:
# address: wasm14hj2...
# code_id: "1"
# creator: wasm1abc...
# admin: wasm1abc...
# label: akt-custody-v1

# List all contract instances
wasmd query wasm list-contract-by-code $CODE_ID --home $WASMD_HOME
```

## Step 6: Execute Contract

Invoke contract functions to change state.

### Example: Deposit Function

```bash
# Prepare execute message
EXECUTE_MSG=$(cat <<EOF
{
  "deposit": {
    "recipient": "$ALICE_ADDR"
  }
}
EOF
)

# Execute with funds
wasmd tx wasm execute $CONTRACT_ADDR "$EXECUTE_MSG" \
  --from alice \
  --amount 5000000uakt \
  --chain-id local-testnet \
  --gas auto \
  --gas-adjustment 1.3 \
  --gas-prices 0.025uakt \
  --keyring-backend test \
  --home $WASMD_HOME \
  --yes

# Wait for confirmation
sleep 2
```

### Example: Withdraw Function

```bash
# Prepare withdraw message
WITHDRAW_MSG=$(cat <<EOF
{
  "withdraw": {
    "amount": "2000000"
  }
}
EOF
)

# Execute withdraw
wasmd tx wasm execute $CONTRACT_ADDR "$WITHDRAW_MSG" \
  --from alice \
  --chain-id local-testnet \
  --gas auto \
  --gas-adjustment 1.3 \
  --gas-prices 0.025uakt \
  --keyring-backend test \
  --home $WASMD_HOME \
  --yes
```

### Execute from Different Account

```bash
# Get bob's address
BOB_ADDR=$(wasmd keys show bob -a --keyring-backend test --home $WASMD_HOME)

# Execute as bob
EXECUTE_MSG=$(cat <<EOF
{
  "deposit": {
    "recipient": "$BOB_ADDR"
  }
}
EOF
)

wasmd tx wasm execute $CONTRACT_ADDR "$EXECUTE_MSG" \
  --from bob \
  --amount 3000000uakt \
  --chain-id local-testnet \
  --gas auto \
  --gas-adjustment 1.3 \
  --gas-prices 0.025uakt \
  --keyring-backend test \
  --home $WASMD_HOME \
  --yes
```

## Step 7: Query Contract

Read contract state without changing it.

### Query Contract State

```bash
# Example: Get config
QUERY_MSG='{"config":{}}'

wasmd query wasm contract-state smart $CONTRACT_ADDR "$QUERY_MSG" \
  --home $WASMD_HOME \
  --output json | jq .

# Expected output:
# {
#   "data": {
#     "owner": "wasm1abc...",
#     "custody_fee_bps": 50,
#     "min_deposit_amount": "1000000",
#     "denom": "uakt"
#   }
# }
```

### Query Balance

```bash
# Query user's deposit balance
BALANCE_QUERY=$(cat <<EOF
{
  "balance": {
    "address": "$ALICE_ADDR"
  }
}
EOF
)

wasmd query wasm contract-state smart $CONTRACT_ADDR "$BALANCE_QUERY" \
  --home $WASMD_HOME \
  --output json | jq .
```

### Query All State

```bash
# Query all contract state (raw storage)
wasmd query wasm contract-state all $CONTRACT_ADDR \
  --home $WASMD_HOME \
  --output json | jq .

# Query specific storage key
wasmd query wasm contract-state raw $CONTRACT_ADDR <hex_key> \
  --home $WASMD_HOME
```

### Query Contract History

```bash
# Get contract update history
wasmd query wasm contract-history $CONTRACT_ADDR \
  --home $WASMD_HOME

# Shows all instantiate/migrate operations
```

## Step 8: Migrate Contract

Update contract code while preserving state.

### Upload New Contract Version

```bash
# Compile and optimize new version
cargo wasm
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/optimizer:0.16.0

# Upload new version
NEW_CODE_ID=$(wasmd tx wasm store artifacts/akt_custody.wasm \
  --from alice \
  --chain-id local-testnet \
  --gas auto \
  --gas-adjustment 1.3 \
  --gas-prices 0.025uakt \
  --keyring-backend test \
  --home $WASMD_HOME \
  --yes \
  --output json | jq -r '.logs[0].events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')

echo "New Code ID: $NEW_CODE_ID"
```

### Perform Migration

```bash
# Prepare migration message
MIGRATE_MSG=$(cat <<EOF
{
  "migrate": {
    "new_parameter": "value"
  }
}
EOF
)

# Migrate contract (must be admin)
wasmd tx wasm migrate $CONTRACT_ADDR $NEW_CODE_ID "$MIGRATE_MSG" \
  --from alice \
  --chain-id local-testnet \
  --gas auto \
  --gas-adjustment 1.3 \
  --gas-prices 0.025uakt \
  --keyring-backend test \
  --home $WASMD_HOME \
  --yes

# Wait for confirmation
sleep 2

# Verify migration
wasmd query wasm contract $CONTRACT_ADDR --home $WASMD_HOME | jq .code_id
# Should show new code ID
```

### Migration with State Changes

If migration requires state updates:

```rust
// In contract code: src/contract.rs
#[cfg_attr(not(feature = "library"), entry_point)]
pub fn migrate(
    deps: DepsMut,
    _env: Env,
    msg: MigrateMsg,
) -> Result<Response, ContractError> {
    // Update state schema
    let old_config: OldConfig = OLD_CONFIG.load(deps.storage)?;
    let new_config = Config {
        owner: old_config.owner,
        custody_fee_bps: old_config.custody_fee_bps,
        min_deposit_amount: old_config.min_deposit_amount,
        denom: old_config.denom,
        new_field: msg.new_parameter, // New field
    };
    CONFIG.save(deps.storage, &new_config)?;

    Ok(Response::new()
        .add_attribute("action", "migrate")
        .add_attribute("version", "2.0"))
}
```

## Advanced Workflows

### Multi-Contract Deployment

Deploy multiple interacting contracts:

```bash
#!/bin/bash
# deploy-all.sh

# Deploy token contract
TOKEN_CODE_ID=$(deploy_contract "artifacts/token.wasm")
TOKEN_ADDR=$(instantiate_contract $TOKEN_CODE_ID '{"name":"Test","symbol":"TST"}')

# Deploy custody contract with token reference
CUSTODY_CODE_ID=$(deploy_contract "artifacts/custody.wasm")
CUSTODY_INIT=$(cat <<EOF
{
  "owner": "$ALICE_ADDR",
  "token_contract": "$TOKEN_ADDR"
}
EOF
)
CUSTODY_ADDR=$(instantiate_contract $CUSTODY_CODE_ID "$CUSTODY_INIT")

echo "Token: $TOKEN_ADDR"
echo "Custody: $CUSTODY_ADDR"
```

### Automated Testing Pipeline

```bash
#!/bin/bash
# test-and-deploy.sh

set -e

echo "1. Running unit tests..."
cargo test

echo "2. Compiling contract..."
cargo wasm

echo "3. Optimizing..."
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/optimizer:0.16.0

echo "4. Validating..."
cosmwasm-check artifacts/*.wasm

echo "5. Deploying to testnet..."
CODE_ID=$(upload_and_get_code_id)

echo "6. Instantiating..."
CONTRACT_ADDR=$(instantiate_and_get_address $CODE_ID)

echo "7. Running integration tests..."
./scripts/integration-test.sh $CONTRACT_ADDR

echo "Deployment complete: $CONTRACT_ADDR"
```

### Contract Upgrade Strategy

```bash
# 1. Deploy new version alongside old
NEW_CODE_ID=$(upload_new_version)
NEW_CONTRACT=$(instantiate_for_testing $NEW_CODE_ID)

# 2. Test new version
run_integration_tests $NEW_CONTRACT

# 3. Migrate production contract
migrate_production $OLD_CONTRACT $NEW_CODE_ID

# 4. Verify migration
verify_state $OLD_CONTRACT
```

## Deployment Checklist

Before deploying to production:

- [ ] All unit tests pass
- [ ] Contract optimized with cosmwasm-optimizer
- [ ] Contract validated with cosmwasm-check
- [ ] Integration tests pass
- [ ] Security audit completed
- [ ] Admin key secured
- [ ] Migration path tested
- [ ] Rollback plan prepared
- [ ] Documentation updated
- [ ] Gas costs estimated

## Gas Estimation

### Estimate Gas for Operations

```bash
# Upload (typically 800,000 - 1,200,000 gas)
wasmd tx wasm store artifacts/contract.wasm \
  --from alice \
  --gas auto \
  --gas-adjustment 1.3 \
  --dry-run

# Instantiate (typically 150,000 - 300,000 gas)
wasmd tx wasm instantiate $CODE_ID "$INIT_MSG" \
  --from alice \
  --gas auto \
  --gas-adjustment 1.3 \
  --dry-run

# Execute (varies: 80,000 - 500,000 gas)
wasmd tx wasm execute $CONTRACT_ADDR "$EXEC_MSG" \
  --from alice \
  --gas auto \
  --gas-adjustment 1.3 \
  --dry-run
```

### Gas Cost Calculation

```
Gas Used × Gas Price = Total Fee

Example:
- Gas Used: 200,000
- Gas Price: 0.025 uakt
- Total Fee: 200,000 × 0.025 = 5,000 uakt = 0.005 AKT
```

## Troubleshooting

### Contract Upload Fails

**Issue:** Gas estimation error
```bash
# Use explicit gas limit
wasmd tx wasm store artifacts/contract.wasm \
  --gas 1500000 \
  --gas-prices 0.025uakt
```

### Instantiation Fails

**Issue:** Invalid JSON message
```bash
# Validate JSON
echo "$INIT_MSG" | jq .

# Use escaped JSON
wasmd tx wasm instantiate $CODE_ID '{"owner":"wasm1..."}' ...
```

### Execute Returns Error

**Issue:** Insufficient funds
```bash
# Check contract requirements
wasmd query wasm contract-state smart $CONTRACT_ADDR '{"config":{}}'

# Check sender balance
wasmd query bank balances $ALICE_ADDR
```

## Next Steps

1. **Testing Patterns:** See [Testing Patterns](./testing-patterns.md)
2. **Automation Scripts:** See [Automation Scripts](./automation-scripts.md)
3. **Debugging:** See [Debugging Guide](../troubleshooting/debugging-guide.md)

## Additional Resources

- **CosmWasm Docs:** https://docs.cosmwasm.com
- **CosmWasm Book:** https://book.cosmwasm.com
- **wasmd Repository:** https://github.com/CosmWasm/wasmd
- **Optimizer:** https://github.com/CosmWasm/optimizer

---

*Last Updated: 2025-11-28*
*CosmWasm Version: 2.0.x*
*wasmd Version: v0.50.0*
