# Testing Patterns for CosmWasm Contracts

This guide covers comprehensive testing strategies for CosmWasm smart contracts, including unit tests, integration tests, and automated testing workflows for local testnet development.

## Overview

Testing pyramid for CosmWasm:

```
        ┌─────────────────┐
        │  Manual Testing │  (Rare, high-level validation)
        └─────────────────┘
       ┌───────────────────┐
       │ Integration Tests │  (Test on live testnet)
       └───────────────────┘
     ┌──────────────────────┐
     │   Unit Tests         │  (Test contract logic in isolation)
     └──────────────────────┘
```

**Testing levels:**
1. **Unit Tests:** Fast, isolated, mock dependencies
2. **Integration Tests:** Real blockchain, full workflow
3. **Manual Testing:** UI/UX validation, exploratory

## Unit Testing

### Setup

Unit tests use cosmwasm-std mocks for isolated testing.

**Cargo.toml dependencies:**
```toml
[dev-dependencies]
cosmwasm-std = { version = "2.0.0", features = ["stargate"] }
cosmwasm-schema = "2.0.0"
cw-multi-test = "2.0.0"
```

### Basic Unit Test Structure

```rust
// src/contract.rs
#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{coins, from_json, Addr};

    #[test]
    fn proper_initialization() {
        let mut deps = mock_dependencies();

        let msg = InstantiateMsg {
            owner: "owner".to_string(),
            custody_fee_bps: 50,
            min_deposit_amount: Uint128::new(1000000),
            denom: "uakt".to_string(),
        };

        let info = mock_info("creator", &coins(1000, "uakt"));
        let res = instantiate(deps.as_mut(), mock_env(), info, msg).unwrap();

        assert_eq!(0, res.messages.len());

        // Verify state
        let config = CONFIG.load(&deps.storage).unwrap();
        assert_eq!(config.owner, "owner");
        assert_eq!(config.custody_fee_bps, 50);
    }

    #[test]
    fn deposit_increases_balance() {
        let mut deps = mock_dependencies();

        // Instantiate
        let instantiate_msg = InstantiateMsg { /* ... */ };
        let info = mock_info("creator", &[]);
        instantiate(deps.as_mut(), mock_env(), info, instantiate_msg).unwrap();

        // Execute deposit
        let deposit_msg = ExecuteMsg::Deposit {
            recipient: "user1".to_string(),
        };
        let info = mock_info("user1", &coins(5000000, "uakt"));
        let res = execute(deps.as_mut(), mock_env(), info, deposit_msg).unwrap();

        assert_eq!(res.attributes.len(), 3);
        assert_eq!(res.attributes[0].key, "action");
        assert_eq!(res.attributes[0].value, "deposit");

        // Query balance
        let query_msg = QueryMsg::Balance {
            address: "user1".to_string(),
        };
        let res = query(deps.as_ref(), mock_env(), query_msg).unwrap();
        let balance: Uint128 = from_json(&res).unwrap();
        assert_eq!(balance, Uint128::new(5000000));
    }

    #[test]
    fn withdraw_reduces_balance() {
        let mut deps = mock_dependencies();
        setup_contract(&mut deps);

        // Deposit first
        let deposit_msg = ExecuteMsg::Deposit {
            recipient: "user1".to_string(),
        };
        let info = mock_info("user1", &coins(5000000, "uakt"));
        execute(deps.as_mut(), mock_env(), info, deposit_msg).unwrap();

        // Withdraw
        let withdraw_msg = ExecuteMsg::Withdraw {
            amount: Uint128::new(2000000),
        };
        let info = mock_info("user1", &[]);
        let res = execute(deps.as_mut(), mock_env(), info, withdraw_msg).unwrap();

        // Verify bank message
        assert_eq!(res.messages.len(), 1);
        match &res.messages[0].msg {
            CosmosMsg::Bank(BankMsg::Send { to_address, amount }) => {
                assert_eq!(to_address, "user1");
                assert_eq!(amount, &coins(2000000, "uakt"));
            }
            _ => panic!("Expected BankMsg::Send"),
        }

        // Verify remaining balance
        let query_msg = QueryMsg::Balance {
            address: "user1".to_string(),
        };
        let res = query(deps.as_ref(), mock_env(), query_msg).unwrap();
        let balance: Uint128 = from_json(&res).unwrap();
        assert_eq!(balance, Uint128::new(3000000));
    }

    #[test]
    fn unauthorized_withdrawal_fails() {
        let mut deps = mock_dependencies();
        setup_contract(&mut deps);

        // User1 deposits
        let deposit_msg = ExecuteMsg::Deposit {
            recipient: "user1".to_string(),
        };
        let info = mock_info("user1", &coins(5000000, "uakt"));
        execute(deps.as_mut(), mock_env(), info, deposit_msg).unwrap();

        // User2 tries to withdraw user1's funds
        let withdraw_msg = ExecuteMsg::Withdraw {
            amount: Uint128::new(2000000),
        };
        let info = mock_info("user2", &[]);
        let err = execute(deps.as_mut(), mock_env(), info, withdraw_msg).unwrap_err();

        assert_eq!(err, ContractError::Unauthorized {});
    }

    // Helper function
    fn setup_contract(deps: &mut OwnedDeps<MockStorage, MockApi, MockQuerier>) {
        let msg = InstantiateMsg {
            owner: "owner".to_string(),
            custody_fee_bps: 50,
            min_deposit_amount: Uint128::new(1000000),
            denom: "uakt".to_string(),
        };
        let info = mock_info("creator", &[]);
        instantiate(deps.as_mut(), mock_env(), info, msg).unwrap();
    }
}
```

### Testing Error Cases

```rust
#[test]
fn deposit_below_minimum_fails() {
    let mut deps = mock_dependencies();
    setup_contract(&mut deps);

    let deposit_msg = ExecuteMsg::Deposit {
        recipient: "user1".to_string(),
    };
    let info = mock_info("user1", &coins(500000, "uakt")); // Below 1M min
    let err = execute(deps.as_mut(), mock_env(), info, deposit_msg).unwrap_err();

    match err {
        ContractError::DepositTooSmall { min, actual } => {
            assert_eq!(min, Uint128::new(1000000));
            assert_eq!(actual, Uint128::new(500000));
        }
        _ => panic!("Expected DepositTooSmall error"),
    }
}

#[test]
fn withdraw_more_than_balance_fails() {
    let mut deps = mock_dependencies();
    setup_contract(&mut deps);

    // Deposit 5 AKT
    let deposit_msg = ExecuteMsg::Deposit {
        recipient: "user1".to_string(),
    };
    let info = mock_info("user1", &coins(5000000, "uakt"));
    execute(deps.as_mut(), mock_env(), info, deposit_msg).unwrap();

    // Try to withdraw 10 AKT
    let withdraw_msg = ExecuteMsg::Withdraw {
        amount: Uint128::new(10000000),
    };
    let info = mock_info("user1", &[]);
    let err = execute(deps.as_mut(), mock_env(), info, withdraw_msg).unwrap_err();

    assert_eq!(err, ContractError::InsufficientFunds {});
}
```

### Testing with cw-multi-test

For multi-contract interactions:

```rust
use cw_multi_test::{App, ContractWrapper, Executor};

#[test]
fn test_multi_contract_interaction() {
    // Create app
    let mut app = App::default();

    // Store contract code
    let code = ContractWrapper::new(execute, instantiate, query);
    let code_id = app.store_code(Box::new(code));

    // Instantiate contract
    let contract_addr = app
        .instantiate_contract(
            code_id,
            Addr::unchecked("creator"),
            &InstantiateMsg { /* ... */ },
            &[],
            "akt-custody",
            None,
        )
        .unwrap();

    // Execute transaction
    app.execute_contract(
        Addr::unchecked("user1"),
        contract_addr.clone(),
        &ExecuteMsg::Deposit {
            recipient: "user1".to_string(),
        },
        &coins(5000000, "uakt"),
    )
    .unwrap();

    // Query state
    let balance: Uint128 = app
        .wrap()
        .query_wasm_smart(
            contract_addr,
            &QueryMsg::Balance {
                address: "user1".to_string(),
            },
        )
        .unwrap();

    assert_eq!(balance, Uint128::new(5000000));
}
```

### Running Unit Tests

```bash
# Run all tests
cargo test

# Run specific test
cargo test proper_initialization

# Run with output
cargo test -- --nocapture

# Run with coverage (requires cargo-tarpaulin)
cargo tarpaulin --out Html
```

## Integration Testing

### Setup Integration Test Environment

```bash
# Start local testnet
docker-compose up -d

# Wait for chain to start
sleep 10

# Verify chain is running
curl http://localhost:26657/status
```

### Integration Test Script

```bash
#!/bin/bash
# tests/integration_test.sh

set -e

# Configuration
CHAIN_ID="local-testnet"
WASMD_HOME="$HOME/cosmwasm-dev/testnet/native/.wasmd"
CONTRACT_DIR="$(pwd)"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo "Starting integration tests..."

# 1. Compile and optimize
echo "1. Compiling contract..."
cargo wasm

echo "2. Optimizing contract..."
docker run --rm -v "$CONTRACT_DIR":/code \
  --mount type=volume,source="$(basename "$CONTRACT_DIR")_cache",target=/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/optimizer:0.16.0

# 3. Validate
echo "3. Validating contract..."
cosmwasm-check artifacts/*.wasm

# 4. Upload
echo "4. Uploading contract..."
CODE_ID=$(wasmd tx wasm store artifacts/akt_custody.wasm \
  --from alice \
  --chain-id $CHAIN_ID \
  --gas auto \
  --gas-adjustment 1.3 \
  --gas-prices 0.025uakt \
  --keyring-backend test \
  --home $WASMD_HOME \
  --yes \
  --output json | jq -r '.logs[0].events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')

echo "Code ID: $CODE_ID"

# 5. Instantiate
echo "5. Instantiating contract..."
ALICE_ADDR=$(wasmd keys show alice -a --keyring-backend test --home $WASMD_HOME)

INIT_MSG=$(cat <<EOF
{
  "owner": "$ALICE_ADDR",
  "custody_fee_bps": 50,
  "min_deposit_amount": "1000000",
  "denom": "uakt"
}
EOF
)

wasmd tx wasm instantiate $CODE_ID "$INIT_MSG" \
  --from alice \
  --label "akt-custody-test" \
  --admin $ALICE_ADDR \
  --chain-id $CHAIN_ID \
  --gas auto \
  --gas-adjustment 1.3 \
  --gas-prices 0.025uakt \
  --keyring-backend test \
  --home $WASMD_HOME \
  --yes

sleep 3

CONTRACT_ADDR=$(wasmd query wasm list-contract-by-code $CODE_ID \
  --home $WASMD_HOME \
  --output json | jq -r '.contracts[0]')

echo "Contract address: $CONTRACT_ADDR"

# 6. Test deposit
echo "6. Testing deposit..."
BOB_ADDR=$(wasmd keys show bob -a --keyring-backend test --home $WASMD_HOME)

DEPOSIT_MSG=$(cat <<EOF
{
  "deposit": {
    "recipient": "$BOB_ADDR"
  }
}
EOF
)

wasmd tx wasm execute $CONTRACT_ADDR "$DEPOSIT_MSG" \
  --from bob \
  --amount 5000000uakt \
  --chain-id $CHAIN_ID \
  --gas auto \
  --gas-adjustment 1.3 \
  --gas-prices 0.025uakt \
  --keyring-backend test \
  --home $WASMD_HOME \
  --yes

sleep 2

# 7. Verify balance
echo "7. Verifying balance..."
BALANCE_QUERY=$(cat <<EOF
{
  "balance": {
    "address": "$BOB_ADDR"
  }
}
EOF
)

BALANCE=$(wasmd query wasm contract-state smart $CONTRACT_ADDR "$BALANCE_QUERY" \
  --home $WASMD_HOME \
  --output json | jq -r '.data')

if [ "$BALANCE" == "5000000" ]; then
  echo -e "${GREEN}✓ Deposit test passed${NC}"
else
  echo -e "${RED}✗ Deposit test failed: Expected 5000000, got $BALANCE${NC}"
  exit 1
fi

# 8. Test withdrawal
echo "8. Testing withdrawal..."
WITHDRAW_MSG=$(cat <<EOF
{
  "withdraw": {
    "amount": "2000000"
  }
}
EOF
)

wasmd tx wasm execute $CONTRACT_ADDR "$WITHDRAW_MSG" \
  --from bob \
  --chain-id $CHAIN_ID \
  --gas auto \
  --gas-adjustment 1.3 \
  --gas-prices 0.025uakt \
  --keyring-backend test \
  --home $WASMD_HOME \
  --yes

sleep 2

# 9. Verify remaining balance
echo "9. Verifying remaining balance..."
BALANCE=$(wasmd query wasm contract-state smart $CONTRACT_ADDR "$BALANCE_QUERY" \
  --home $WASMD_HOME \
  --output json | jq -r '.data')

if [ "$BALANCE" == "3000000" ]; then
  echo -e "${GREEN}✓ Withdrawal test passed${NC}"
else
  echo -e "${RED}✗ Withdrawal test failed: Expected 3000000, got $BALANCE${NC}"
  exit 1
fi

echo -e "${GREEN}All integration tests passed!${NC}"
```

### Make Script Executable

```bash
chmod +x tests/integration_test.sh

# Run integration tests
./tests/integration_test.sh
```

## Automated Testing with CI/CD

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Contract Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Rust
        uses: actions-rust-lang/setup-rust-toolchain@v1
        with:
          toolchain: stable
          targets: wasm32-unknown-unknown

      - name: Run unit tests
        run: cargo test

      - name: Run clippy
        run: cargo clippy -- -D warnings

      - name: Check formatting
        run: cargo fmt -- --check

  integration-tests:
    runs-on: ubuntu-latest
    services:
      wasmd:
        image: cosmwasm/wasmd:latest
        ports:
          - 26657:26657
          - 1317:1317
    steps:
      - uses: actions/checkout@v3

      - name: Install dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y jq
          cargo install cosmwasm-check

      - name: Run integration tests
        run: ./tests/integration_test.sh
```

## Test Coverage

### Using cargo-tarpaulin

```bash
# Install tarpaulin
cargo install cargo-tarpaulin

# Generate coverage report
cargo tarpaulin --out Html --output-dir coverage

# View report
open coverage/index.html
```

### Coverage Goals

- **Unit tests:** >80% code coverage
- **Integration tests:** All critical paths
- **Edge cases:** All error conditions tested

## Testing Best Practices

### 1. Test Organization

```rust
#[cfg(test)]
mod tests {
    use super::*;

    mod instantiate {
        use super::*;

        #[test]
        fn proper_initialization() { /* ... */ }

        #[test]
        fn invalid_owner_fails() { /* ... */ }
    }

    mod execute {
        use super::*;

        mod deposit {
            use super::*;

            #[test]
            fn successful_deposit() { /* ... */ }

            #[test]
            fn deposit_below_minimum_fails() { /* ... */ }
        }

        mod withdraw {
            use super::*;

            #[test]
            fn successful_withdrawal() { /* ... */ }

            #[test]
            fn insufficient_balance_fails() { /* ... */ }
        }
    }

    mod query {
        use super::*;

        #[test]
        fn query_balance() { /* ... */ }

        #[test]
        fn query_config() { /* ... */ }
    }
}
```

### 2. Test Data Builders

```rust
struct TestContext {
    deps: OwnedDeps<MockStorage, MockApi, MockQuerier>,
    env: Env,
    contract_addr: Addr,
}

impl TestContext {
    fn new() -> Self {
        let mut deps = mock_dependencies();
        let env = mock_env();

        // Instantiate contract
        let msg = InstantiateMsg::default();
        let info = mock_info("creator", &[]);
        instantiate(deps.as_mut(), env.clone(), info, msg).unwrap();

        Self {
            deps,
            env,
            contract_addr: Addr::unchecked("contract"),
        }
    }

    fn deposit(&mut self, sender: &str, amount: u128) -> Result<Response, ContractError> {
        let msg = ExecuteMsg::Deposit {
            recipient: sender.to_string(),
        };
        let info = mock_info(sender, &coins(amount, "uakt"));
        execute(self.deps.as_mut(), self.env.clone(), info, msg)
    }

    fn query_balance(&self, address: &str) -> Uint128 {
        let msg = QueryMsg::Balance {
            address: address.to_string(),
        };
        let res = query(self.deps.as_ref(), self.env.clone(), msg).unwrap();
        from_json(&res).unwrap()
    }
}

#[test]
fn test_with_context() {
    let mut ctx = TestContext::new();

    ctx.deposit("user1", 5000000).unwrap();
    assert_eq!(ctx.query_balance("user1"), Uint128::new(5000000));
}
```

### 3. Property-Based Testing

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn deposit_and_withdraw_balance_consistency(
        deposit_amount in 1000000u128..100000000u128,
        withdraw_amount in 0u128..100000000u128
    ) {
        let mut deps = mock_dependencies();
        setup_contract(&mut deps);

        // Deposit
        let deposit_msg = ExecuteMsg::Deposit {
            recipient: "user1".to_string(),
        };
        let info = mock_info("user1", &coins(deposit_amount, "uakt"));
        let _ = execute(deps.as_mut(), mock_env(), info, deposit_msg);

        // Withdraw (may fail if amount > balance)
        if withdraw_amount <= deposit_amount {
            let withdraw_msg = ExecuteMsg::Withdraw {
                amount: Uint128::new(withdraw_amount),
            };
            let info = mock_info("user1", &[]);
            let _ = execute(deps.as_mut(), mock_env(), info, withdraw_msg);

            // Balance should be deposit - withdraw
            let balance = query_balance(&deps, "user1");
            prop_assert_eq!(balance, Uint128::new(deposit_amount - withdraw_amount));
        }
    }
}
```

## Performance Testing

### Benchmark Contract Operations

```bash
#!/bin/bash
# benchmark.sh

CONTRACT_ADDR=$1
ITERATIONS=100

echo "Benchmarking $ITERATIONS deposits..."

START=$(date +%s)
for i in $(seq 1 $ITERATIONS); do
  wasmd tx wasm execute $CONTRACT_ADDR '{"deposit":{"recipient":"user1"}}' \
    --from user1 \
    --amount 1000000uakt \
    --chain-id local-testnet \
    --gas auto \
    --gas-prices 0.025uakt \
    --keyring-backend test \
    --yes \
    > /dev/null 2>&1
done
END=$(date +%s)

DURATION=$((END - START))
echo "Total time: ${DURATION}s"
echo "Average: $((DURATION * 1000 / ITERATIONS))ms per transaction"
```

## Next Steps

1. **Automation Scripts:** See [Automation Scripts](./automation-scripts.md)
2. **Debugging:** See [Debugging Guide](../troubleshooting/debugging-guide.md)
3. **Reset Procedures:** See [Reset Procedures](./reset-procedures.md)

## Additional Resources

- **CosmWasm Testing:** https://book.cosmwasm.com/basics/testing.html
- **cw-multi-test:** https://github.com/CosmWasm/cw-multi-test
- **Proptest:** https://github.com/proptest-rs/proptest

---

*Last Updated: 2025-11-28*
*CosmWasm Version: 2.0.x*
