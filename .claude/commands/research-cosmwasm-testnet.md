# /research-cosmwasm-testnet Task

When this command is used, execute the following task:

<!-- Powered by BMAD™ Core -->

# CosmWasm Local Testnet Infrastructure Research Task

This task executes comprehensive research into setting up a local Cosmos testnet environment optimized for CosmWasm smart contract development targeting Akash token custody.

## Purpose

Establish a reproducible, developer-friendly local Cosmos testnet environment that enables:

- Rapid iteration for CosmWasm smart contract development
- Akash token (AKT) custody contract testing
- Fast deployment and testing workflows
- Clear troubleshooting and debugging procedures

## Research Output Structure

CRITICAL: All research outputs MUST be organized in the following folder structure:

```
docs/
└── research/
    └── cosmwasm-testnet/
        ├── README.md                          # Research overview and navigation
        ├── executive-summary.md               # Recommended approach and key findings
        ├── setup-guides/
        │   ├── prerequisites.md               # OS requirements and tools
        │   ├── docker-setup.md                # Docker-based testnet setup
        │   ├── native-setup.md                # Native binary setup
        │   └── akash-token-config.md          # AKT denomination configuration
        ├── workflows/
        │   ├── contract-deployment.md         # Complete deployment workflow
        │   ├── testing-patterns.md            # Unit and integration testing
        │   ├── reset-procedures.md            # Fast reset and restart
        │   └── automation-scripts.md          # Setup and deployment scripts
        ├── troubleshooting/
        │   ├── common-issues.md               # Issue diagnosis and solutions
        │   ├── debugging-guide.md             # Log analysis and debugging
        │   └── version-compatibility.md       # Binary version matrix
        ├── comparisons/
        │   ├── approach-comparison.md         # Docker vs native vs compose
        │   └── decision-matrix.md             # Weighted approach selection
        ├── examples/
        │   ├── sample-contract/               # Working AKT custody contract
        │   ├── genesis-template.json          # Genesis file template
        │   ├── docker-compose.yml             # Docker compose configuration
        │   └── init-scripts/                  # Initialization shell scripts
        └── appendices/
            ├── glossary.md                    # CosmWasm, Cosmos SDK terms
            ├── command-reference.md           # Complete wasmd command reference
            └── sources.md                     # Documentation sources used
```

## Research Execution Process

### Phase 1: Data Collection

CRITICAL: Use the MCP documentation servers and official sources:

1. **Fetch base documentation**:
   - `mcp__cosmwasm_Docs__fetch_cosmwasm_documentation`
   - `mcp__akash_Docs__fetch_docs_documentation`
   - Official Cosmos SDK documentation
   - wasmd repository documentation

2. **Search for specific information**:
   - `mcp__cosmwasm_Docs__search_cosmwasm_documentation` for targeted queries
   - `mcp__akash_Docs__search_docs_documentation` for Akash-specific config
   - `mcp__cosmwasm_Docs__search_cosmwasm_code` for implementation examples
   - `mcp__*__fetch_generic_url_content` for linked resources

3. **Community resources**:
   - CosmWasm GitHub repositories (cw-plus, cw-storage-plus)
   - LocalOsmosis, LocalJuno patterns for reference
   - Recent developer blog posts (2024-2025)

4. **Document all sources** in `appendices/sources.md`

### Phase 2: Environment Setup Analysis

#### Prerequisites Analysis (`setup-guides/prerequisites.md`)

Document requirements for each OS:

**macOS:**
- Homebrew packages needed
- Go version requirements
- Rust toolchain setup
- Docker Desktop configuration
- Directory structure recommendations

**Linux:**
- Package manager dependencies
- Binary installation paths
- Docker/podman setup
- Systemd service files (if applicable)

**Windows/WSL:**
- WSL2 configuration
- Cross-platform considerations
- Performance optimizations

**Version Compatibility Matrix:**
- Go 1.21+ required
- Rust 1.70+ with wasm32-unknown-unknown target
- CosmWasm 2.0+
- wasmd compatible versions
- Akash Network compatibility

#### Docker Setup Guide (`setup-guides/docker-setup.md`)

**Single Container Approach:**
- Dockerfile for wasmd with CosmWasm
- Volume mounts for persistence
- Port mappings
- Environment variables
- Startup commands
- Pros/cons analysis

**Docker Compose Approach:**
- Multi-service setup (chain, faucet, explorer optional)
- Service dependencies
- Network configuration
- Health checks
- Initialization containers
- Pros/cons analysis

**Configuration:**
```yaml
# Example structure to document
services:
  wasmd:
    image: cosmwasm/wasmd:latest
    command: ...
    volumes: ...
    ports: ...
    environment: ...
```

#### Native Binary Setup (`setup-guides/native-setup.md`)

**Installation:**
- Building wasmd from source
- Installing pre-built binaries
- Binary location and PATH setup
- Version verification

**Initialization:**
- Chain ID selection
- Moniker configuration
- Node directory structure
- Key generation and management

**Configuration Files:**
- app.toml modifications
- config.toml modifications
- genesis.json structure
- Client configuration

**Starting the Chain:**
- Background vs foreground execution
- Log output configuration
- API/RPC endpoint activation
- Systemd service (optional)

#### Akash Token Configuration (`setup-guides/akash-token-config.md`)

**Token Denomination:**
- Setting base denomination (uakt)
- Display denomination (akt)
- Conversion factors (1 akt = 1,000,000 uakt)
- Genesis balances

**Genesis File Modifications:**
```json
{
  "app_state": {
    "bank": {
      "denom_metadata": [...],
      "supply": [...]
    },
    "staking": {
      "params": {
        "bond_denom": "uakt"
      }
    },
    "crisis": {
      "constant_fee": {
        "denom": "uakt"
      }
    },
    "gov": {
      "deposit_params": {
        "min_deposit": [
          {
            "denom": "uakt",
            "amount": "10000000"
          }
        ]
      }
    },
    "mint": {
      "params": {
        "mint_denom": "uakt"
      }
    }
  }
}
```

**Account Initialization:**
- Creating test accounts with AKT balances
- Validator account setup
- Fee token configuration
- Gas price settings

### Phase 3: Development Workflow Documentation

#### Contract Deployment Workflow (`workflows/contract-deployment.md`)

**Complete Step-by-Step Process:**

1. **Compile Contract**
   ```bash
   cd contract-directory
   cargo build --release --target wasm32-unknown-unknown
   ```
   - Explain target flag
   - Output location
   - Build artifacts

2. **Optimize Contract**
   ```bash
   # Using cosmwasm-optimizer
   docker run --rm -v "$(pwd)":/code \
     --mount type=volume,source="$(basename "$(pwd)")_cache",target=/code/target \
     --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
     cosmwasm/optimizer:0.16.0

   # OR using wasm-opt
   wasm-opt -Os --signext-lowering contract.wasm -o contract-optimized.wasm
   ```
   - Size reduction benefits
   - Gas cost implications
   - Validation with cosmwasm-check

3. **Upload to Chain**
   ```bash
   wasmd tx wasm store ./artifacts/contract.wasm \
     --from test-account \
     --gas auto \
     --gas-adjustment 1.3 \
     --gas-prices 0.025uakt \
     --chain-id local-testnet \
     --node http://localhost:26657 \
     --broadcast-mode block
   ```
   - Explain each flag
   - Gas configuration
   - How to get code ID from output

4. **Instantiate Contract**
   ```bash
   wasmd tx wasm instantiate <CODE_ID> \
     '{"owner":"akash1...","initial_balance":"1000000"}' \
     --from test-account \
     --label "akt-custody-v1" \
     --no-admin \
     --gas auto \
     --gas-adjustment 1.3 \
     --gas-prices 0.025uakt \
     --chain-id local-testnet \
     --node http://localhost:26657 \
     --broadcast-mode block
   ```
   - Instantiate message structure
   - Admin vs no-admin
   - Label best practices
   - How to get contract address from output

5. **Execute Contract**
   ```bash
   wasmd tx wasm execute <CONTRACT_ADDR> \
     '{"deposit":{}}' \
     --amount 1000000uakt \
     --from test-account \
     --gas auto \
     --gas-prices 0.025uakt \
     --chain-id local-testnet \
     --node http://localhost:26657
   ```
   - Execute message patterns
   - Sending funds with execution
   - Transaction verification

6. **Query Contract**
   ```bash
   # Smart query
   wasmd query wasm contract-state smart <CONTRACT_ADDR> \
     '{"get_balance":{"address":"akash1..."}}' \
     --node http://localhost:26657

   # Raw state query
   wasmd query wasm contract-state raw <CONTRACT_ADDR> <KEY_HEX> \
     --node http://localhost:26657

   # All state
   wasmd query wasm contract-state all <CONTRACT_ADDR> \
     --node http://localhost:26657
   ```
   - Query message structure
   - Response parsing
   - State inspection

**Iteration Workflow:**
- Modify contract code
- Recompile
- Upload (new code ID)
- Instantiate new instance
- Test
- Migrate existing contract (if using admin)

#### Testing Patterns (`workflows/testing-patterns.md`)

**Unit Testing:**
```rust
#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{coins, from_json};

    #[test]
    fn test_instantiate() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let info = mock_info("creator", &coins(1000, "uakt"));
        // Test logic
    }
}
```
- Mock environment setup
- Test helpers
- Assertion patterns
- Coverage best practices

**Integration Testing:**
- Testing against local testnet
- Multi-contract interactions
- Token transfer verification
- Event emission testing
- Error handling validation

**Test Automation:**
- Shell scripts for test suites
- CI/CD integration patterns
- Snapshot testing
- Property-based testing (if applicable)

#### Reset Procedures (`workflows/reset-procedures.md`)

**Fast Reset (Keep Config):**
```bash
# Stop chain
pkill wasmd

# Remove data but keep config
rm -rf ~/.wasmd/data
wasmd tendermint unsafe-reset-all

# Restart chain
wasmd start
```

**Full Reset (Fresh Start):**
```bash
# Stop chain
pkill wasmd

# Remove everything
rm -rf ~/.wasmd

# Re-initialize
wasmd init testnode --chain-id local-testnet
# ... reconfigure genesis, keys, etc.
```

**Docker Reset:**
```bash
docker-compose down -v
docker-compose up -d
```

**State Backup and Restore:**
```bash
# Export state
wasmd export > state-backup.json

# Import to new chain
# ... initialization ...
# Use exported state as genesis
```

#### Automation Scripts (`workflows/automation-scripts.md`)

**Initialization Script:**
```bash
#!/bin/bash
# init-testnet.sh

set -e

CHAIN_ID="local-testnet"
MONIKER="testnode"
DENOM="uakt"
VALIDATOR_KEY="validator"
TEST_KEY="test-account"

# Initialize chain
wasmd init $MONIKER --chain-id $CHAIN_ID

# Add keys
echo "password" | wasmd keys add $VALIDATOR_KEY --keyring-backend test
echo "password" | wasmd keys add $TEST_KEY --keyring-backend test

# Add genesis accounts
wasmd add-genesis-account $VALIDATOR_KEY 100000000000uakt --keyring-backend test
wasmd add-genesis-account $TEST_KEY 100000000000uakt --keyring-backend test

# Create validator
wasmd gentx $VALIDATOR_KEY 50000000000uakt --chain-id $CHAIN_ID --keyring-backend test

# Collect genesis txs
wasmd collect-gentxs

# Modify config for development
sed -i '' 's/minimum-gas-prices = ""/minimum-gas-prices = "0.025uakt"/' ~/.wasmd/config/app.toml

echo "Testnet initialized! Start with: wasmd start"
```

**Deployment Script:**
```bash
#!/bin/bash
# deploy-contract.sh

CONTRACT_DIR="./contract"
WASM_FILE="./artifacts/contract.wasm"
FROM_ACCOUNT="test-account"
CHAIN_ID="local-testnet"
NODE="http://localhost:26657"

# Build and optimize
cd $CONTRACT_DIR
cargo build --release --target wasm32-unknown-unknown
docker run --rm -v "$(pwd)":/code cosmwasm/optimizer:0.16.0

# Upload
UPLOAD_TX=$(wasmd tx wasm store $WASM_FILE \
  --from $FROM_ACCOUNT \
  --gas auto \
  --gas-prices 0.025uakt \
  --chain-id $CHAIN_ID \
  --node $NODE \
  --output json \
  -y)

CODE_ID=$(echo $UPLOAD_TX | jq -r '.logs[0].events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')

echo "Code ID: $CODE_ID"

# Instantiate
INIT_MSG='{"owner":"akash1..."}'
wasmd tx wasm instantiate $CODE_ID "$INIT_MSG" \
  --from $FROM_ACCOUNT \
  --label "my-contract" \
  --no-admin \
  --gas auto \
  --gas-prices 0.025uakt \
  --chain-id $CHAIN_ID \
  --node $NODE \
  -y
```

### Phase 4: Troubleshooting and Debugging

#### Common Issues (`troubleshooting/common-issues.md`)

Create comprehensive issue table:

| Issue | Symptoms | Root Cause | Solution | Prevention |
|-------|----------|------------|----------|------------|
| Port already in use | Chain fails to start with "bind: address already in use" | Previous instance still running | `pkill wasmd` or change port in config.toml | Use proper shutdown procedures |
| CosmWasm disabled | Upload fails with "Wasm not supported" | CosmWasm not enabled in genesis | Set `"upload_access": {"permission": "Everybody"}` in genesis wasm params | Use correct genesis template |
| Insufficient gas | Transaction fails with "out of gas" | Gas limit too low | Increase `--gas` flag or use `--gas auto` | Use `--gas auto --gas-adjustment 1.3` |
| Wrong denomination | Token operations fail | Incorrect denom in commands | Verify denom matches genesis (uakt) | Check genesis config before starting |
| Contract not found | Query fails with "not found" | Wrong contract address or not instantiated | Verify address with `wasmd query wasm list-contract-by-code` | Save contract addresses after instantiation |
| Invalid message format | Execute/query fails with JSON parse error | Malformed JSON in message | Validate JSON syntax, check schema | Use contract's schema files |
| Permission denied | Upload fails even with CosmWasm enabled | Upload permissions restricted in genesis | Set appropriate upload access in genesis | Review wasm.params in genesis |
| Key not found | Transaction fails with "key not found" | Account doesn't exist in keyring | Add key with `wasmd keys add` | Use `--keyring-backend test` for dev |

**Debugging Checklist:**
```markdown
### Pre-flight Checks
- [ ] Verify wasmd binary version: `wasmd version`
- [ ] Check ports available: `lsof -i :26657,26656,1317,9090`
- [ ] Confirm directory exists: `ls -la ~/.wasmd`
- [ ] Validate genesis file: `wasmd validate-genesis`
- [ ] Check account keys: `wasmd keys list`

### Runtime Checks
- [ ] Chain is running: `curl localhost:26657/status`
- [ ] Accounts have balance: `wasmd query bank balances <ADDRESS>`
- [ ] Node is synced: Check `sync_info` in status
- [ ] Gas prices configured: `grep minimum-gas-prices ~/.wasmd/config/app.toml`

### Contract-Specific Checks
- [ ] Contract compiled: Wasm file exists and is valid
- [ ] Contract optimized: Check file size
- [ ] cosmwasm-check passed: `cosmwasm-check <WASM_FILE>`
- [ ] Code uploaded: `wasmd query wasm list-code`
- [ ] Contract instantiated: `wasmd query wasm list-contract-by-code <CODE_ID>`
```

#### Debugging Guide (`troubleshooting/debugging-guide.md`)

**Log Analysis:**
```bash
# View real-time logs
wasmd start 2>&1 | tee testnet.log

# Search for errors
grep -i error testnet.log

# Filter by module
grep "module=x/wasm" testnet.log

# Transaction-specific debugging
wasmd query tx <TX_HASH> --node http://localhost:26657
```

**State Inspection:**
```bash
# Check account state
wasmd query auth account <ADDRESS>

# Check contract info
wasmd query wasm contract <CONTRACT_ADDR>

# Dump all contract state
wasmd query wasm contract-state all <CONTRACT_ADDR> --output json | jq
```

**Network Debugging:**
```bash
# Check node status
curl http://localhost:26657/status | jq

# Check network info
curl http://localhost:26657/net_info | jq

# Check latest block
curl http://localhost:26657/block | jq
```

#### Version Compatibility (`troubleshooting/version-compatibility.md`)

**Compatibility Matrix:**

| wasmd Version | CosmWasm Version | Cosmos SDK | Go Version | Rust Version | Notes |
|---------------|------------------|------------|------------|--------------|-------|
| v0.50.x | 2.0.x | 0.50.x | 1.21+ | 1.70+ | Latest, recommended |
| v0.45.x | 1.5.x | 0.47.x | 1.20+ | 1.65+ | Stable, widely used |
| v0.40.x | 1.3.x | 0.45.x | 1.19+ | 1.60+ | Older, still supported |

**Akash Network Versions:**
- Current mainnet version
- Testnet version
- Recommended local dev version

**Upgrade Path:**
- How to migrate from older versions
- Breaking changes to be aware of
- Migration scripts

### Phase 5: Approach Comparison and Decision

#### Approach Comparison (`comparisons/approach-comparison.md`)

| Aspect | Native wasmd | Docker Single | Docker Compose | Recommended For |
|--------|-------------|---------------|----------------|-----------------|
| **Setup Time** | 30-45 min | 10-15 min | 15-20 min | Compose: Quick start |
| **Iteration Speed** | Very Fast | Medium | Fast | Native: Rapid development |
| **Production Parity** | Highest | Medium | High | Native: Pre-production testing |
| **Resource Usage** | Low | Medium | Medium-High | Native: Resource-constrained |
| **Complexity** | Medium | Low | Medium | Docker: Simplicity |
| **Team Sharing** | Manual sync | Easy (Dockerfile) | Easy (Compose file) | Docker: Team collaboration |
| **Debugging** | Full access | Limited | Good | Native: Deep debugging |
| **Maintenance** | Manual updates | Image updates | Service updates | Docker: Easy updates |
| **Customization** | Full control | Limited | Good | Native: Custom builds |
| **Isolation** | None | Full | Full | Docker: Multiple testnets |

**Detailed Analysis:**

**Native wasmd Approach:**
- Pros: Maximum performance, full control, closest to production, best for learning internals
- Cons: Manual dependency management, OS-specific issues, requires more expertise
- Best for: Experienced developers, performance-sensitive testing, production preparation

**Docker Single Container:**
- Pros: Quick setup, isolated, portable, easy to reset
- Cons: Limited flexibility, harder to customize, black-box feel
- Best for: Quick experiments, newcomers, sandboxed testing

**Docker Compose Multi-Service:**
- Pros: Reproducible, team-friendly, can add services (faucet, explorer), good balance
- Cons: Resource overhead, slight performance penalty, requires Docker knowledge
- Best for: Team development, consistent environments, CI/CD integration

#### Decision Matrix (`comparisons/decision-matrix.md`)

| Factor | Weight | Native | Docker Single | Docker Compose | Notes |
|--------|--------|--------|---------------|----------------|-------|
| Setup ease | 15% | 6/10 | 9/10 | 8/10 | Docker variants faster |
| Iteration speed | 25% | 10/10 | 7/10 | 8/10 | Native fastest compile-deploy-test |
| Production parity | 20% | 10/10 | 6/10 | 8/10 | Native matches real deployment |
| Team reproducibility | 15% | 5/10 | 9/10 | 10/10 | Docker ensures consistency |
| Debugging capability | 10% | 10/10 | 5/10 | 7/10 | Native provides full access |
| Maintenance burden | 10% | 6/10 | 9/10 | 8/10 | Docker easier to update |
| Resource efficiency | 5% | 10/10 | 7/10 | 6/10 | Native lowest overhead |

**Weighted Scores:**
- Native wasmd: (Calculate based on weights)
- Docker Single: (Calculate based on weights)
- Docker Compose: (Calculate based on weights)

**Recommendation:**
Based on the use case (CosmWasm development for Akash token custody in nostr-ilp project):

**Primary Recommendation: Docker Compose**
- Balanced setup time and iteration speed
- Team can share exact configuration
- Can add services as needed (block explorer, faucet)
- Good production parity
- Easy to reset and reproduce

**Alternative: Native wasmd**
- For solo developers comfortable with Cosmos tooling
- When maximum performance is needed
- For learning Cosmos SDK internals deeply

### Phase 6: Working Examples

#### Sample Contract (`examples/sample-contract/`)

Create a complete working example of an AKT custody contract:

**Contract Structure:**
```
examples/sample-contract/
├── Cargo.toml
├── schema/
│   ├── execute_msg.json
│   ├── instantiate_msg.json
│   └── query_msg.json
├── src/
│   ├── contract.rs
│   ├── error.rs
│   ├── lib.rs
│   ├── msg.rs
│   └── state.rs
└── README.md
```

**Minimal Working Contract:**
```rust
// src/contract.rs
use cosmwasm_std::{
    entry_point, to_json_binary, BankMsg, Binary, Coin, Deps, DepsMut,
    Env, MessageInfo, Response, StdResult, Uint128,
};

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg};
use crate::state::{Config, CONFIG, BALANCES};

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    let config = Config {
        owner: info.sender.clone(),
    };
    CONFIG.save(deps.storage, &config)?;

    Ok(Response::new()
        .add_attribute("method", "instantiate")
        .add_attribute("owner", info.sender))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::Deposit {} => execute_deposit(deps, info),
        ExecuteMsg::Withdraw { amount } => execute_withdraw(deps, env, info, amount),
    }
}

fn execute_deposit(deps: DepsMut, info: MessageInfo) -> Result<Response, ContractError> {
    // Find AKT in sent funds
    let akt_amount = info.funds.iter()
        .find(|c| c.denom == "uakt")
        .map(|c| c.amount)
        .unwrap_or_else(Uint128::zero);

    if akt_amount.is_zero() {
        return Err(ContractError::NoFunds {});
    }

    // Update balance
    BALANCES.update(
        deps.storage,
        &info.sender,
        |balance: Option<Uint128>| -> StdResult<_> {
            Ok(balance.unwrap_or_default() + akt_amount)
        },
    )?;

    Ok(Response::new()
        .add_attribute("method", "deposit")
        .add_attribute("depositor", info.sender)
        .add_attribute("amount", akt_amount))
}

fn execute_withdraw(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    amount: Uint128,
) -> Result<Response, ContractError> {
    // Check and update balance
    let new_balance = BALANCES.update(
        deps.storage,
        &info.sender,
        |balance: Option<Uint128>| -> Result<_, ContractError> {
            let current = balance.unwrap_or_default();
            if current < amount {
                return Err(ContractError::InsufficientFunds {});
            }
            Ok(current - amount)
        },
    )?;

    // Send funds
    let msg = BankMsg::Send {
        to_address: info.sender.to_string(),
        amount: vec![Coin {
            denom: "uakt".to_string(),
            amount,
        }],
    };

    Ok(Response::new()
        .add_message(msg)
        .add_attribute("method", "withdraw")
        .add_attribute("withdrawer", info.sender)
        .add_attribute("amount", amount)
        .add_attribute("new_balance", new_balance))
}

#[entry_point]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetBalance { address } => {
            let addr = deps.api.addr_validate(&address)?;
            let balance = BALANCES.may_load(deps.storage, &addr)?.unwrap_or_default();
            to_json_binary(&balance)
        }
    }
}
```

#### Configuration Templates (`examples/`)

**Genesis Template (`genesis-template.json`):**
Complete genesis file with CosmWasm enabled and AKT configured

**Docker Compose File (`docker-compose.yml`):**
```yaml
version: '3.8'

services:
  wasmd:
    image: cosmwasm/wasmd:latest
    container_name: cosmwasm-testnet
    command: >
      bash -c "
      if [ ! -d /root/.wasmd/config ]; then
        wasmd init testnode --chain-id local-testnet &&
        echo 'password' | wasmd keys add validator --keyring-backend test &&
        echo 'password' | wasmd keys add test-account --keyring-backend test &&
        wasmd add-genesis-account validator 100000000000uakt --keyring-backend test &&
        wasmd add-genesis-account test-account 100000000000uakt --keyring-backend test &&
        wasmd gentx validator 50000000000uakt --chain-id local-testnet --keyring-backend test &&
        wasmd collect-gentxs &&
        sed -i 's/minimum-gas-prices = \"\"/minimum-gas-prices = \"0.025uakt\"/' /root/.wasmd/config/app.toml
      fi &&
      wasmd start
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

volumes:
  wasmd-data:

networks:
  testnet:
```

**Initialization Script (`init-scripts/init-testnet.sh`):**
Complete initialization script as documented in Phase 3

### Phase 7: Final Deliverables

#### Executive Summary (`executive-summary.md`)

Must include:

1. **Recommended Approach**
   - Clear choice (Docker Compose / Native / Docker Single)
   - Justification based on research
   - Key trade-offs

2. **Quick Start Summary**
   - 5-step quickstart for recommended approach
   - Estimated time to first deployed contract
   - Prerequisites checklist

3. **Key Findings**
   - Critical insights from research
   - Important configuration points
   - Common pitfalls to avoid

4. **Risk Assessment**
   - Compatibility risks with Akash mainnet
   - Performance considerations
   - Maintenance and upgrade risks
   - Mitigation strategies for each

5. **Effort Estimate**
   - Initial setup time
   - Learning curve assessment
   - Ongoing maintenance burden

6. **Next Steps**
   - Immediate actions to begin
   - Recommended learning path
   - Advanced topics to explore later

#### README (`README.md`)

Navigation document with:

```markdown
# CosmWasm Local Testnet Research

**Completed:** [Date]
**Purpose:** Establish local development environment for AKT custody smart contracts

## Documents Overview

### Setup Guides
- [Prerequisites](./setup-guides/prerequisites.md) - System requirements and tools
- [Docker Setup](./setup-guides/docker-setup.md) - Docker-based testnet
- [Native Setup](./setup-guides/native-setup.md) - Native binary setup
- [Akash Token Config](./setup-guides/akash-token-config.md) - AKT denomination setup

### Workflows
- [Contract Deployment](./workflows/contract-deployment.md) - Complete deployment process
- [Testing Patterns](./workflows/testing-patterns.md) - Unit and integration testing
- [Reset Procedures](./workflows/reset-procedures.md) - Fast iteration techniques
- [Automation Scripts](./workflows/automation-scripts.md) - Setup and deployment scripts

### Troubleshooting
- [Common Issues](./troubleshooting/common-issues.md) - Issue diagnosis table
- [Debugging Guide](./troubleshooting/debugging-guide.md) - Log analysis and debugging
- [Version Compatibility](./troubleshooting/version-compatibility.md) - Version matrix

### Comparisons
- [Approach Comparison](./comparisons/approach-comparison.md) - Docker vs native analysis
- [Decision Matrix](./comparisons/decision-matrix.md) - Weighted decision framework

### Examples
- [Sample Contract](./examples/sample-contract/) - Working AKT custody contract
- [Genesis Template](./examples/genesis-template.json) - Genesis configuration
- [Docker Compose](./examples/docker-compose.yml) - Compose configuration
- [Init Scripts](./examples/init-scripts/) - Automation scripts

### Appendices
- [Glossary](./appendices/glossary.md) - CosmWasm and Cosmos SDK terms
- [Command Reference](./appendices/command-reference.md) - Complete wasmd commands
- [Sources](./appendices/sources.md) - Documentation sources

## How to Use This Research

1. Read [Executive Summary](./executive-summary.md) for recommendations
2. Follow appropriate setup guide for your chosen approach
3. Deploy the sample contract to verify setup
4. Reference workflow docs for development patterns
5. Use troubleshooting guides when issues arise

## Quick Start (Docker Compose)

1. Copy `examples/docker-compose.yml` to your project
2. Run `docker-compose up -d`
3. Wait 30 seconds for initialization
4. Deploy sample contract: `bash examples/init-scripts/deploy-contract.sh`
5. Query contract: `docker-compose exec wasmd wasmd query wasm list-code`

---

*Research conducted using BMAD™ Core with Claude Code*
```

## Research Questions Checklist

Ensure all primary questions are answered:

- [ ] What is the optimal local testnet architecture for CosmWasm development?
- [ ] What are step-by-step procedures to initialize a local testnet with CosmWasm?
- [ ] How should AKT token denomination be configured in the local testnet?
- [ ] What is the complete workflow for deploying and interacting with CosmWasm contracts?
- [ ] What are the most common setup issues and their solutions?
- [ ] How can the testnet be reset/restarted efficiently?
- [ ] What are differences between local testnet and Akash mainnet/testnet?
- [ ] What development tools integrate well with local testnets?
- [ ] How can multiple developers share a consistent testnet environment?
- [ ] What are best practices for testing token custody contracts?

## Success Criteria

Research is complete when:

1. ✅ All folder structure documents are created and populated
2. ✅ All primary research questions are answered with actionable information
3. ✅ Approach recommendation is clear and justified with decision matrix
4. ✅ At least one working example contract is provided
5. ✅ Configuration templates are ready to use
6. ✅ Troubleshooting guide covers top 5 common issues
7. ✅ Executive summary enables immediate decision and action
8. ✅ All sources are documented with links and dates

## Validation Checklist

- [ ] Guide tested on macOS (primary environment)
- [ ] All commands are copy-paste executable (no undefined placeholders)
- [ ] Sample contract compiles and deploys successfully
- [ ] Genesis template is valid JSON and includes CosmWasm config
- [ ] Docker compose file starts successfully
- [ ] Init scripts execute without errors
- [ ] Documentation is internally consistent (no contradictions)

## Important Notes

- Use MCP servers as primary sources for CosmWasm and Akash documentation
- Prioritize 2024-2025 documentation (CosmWasm 2.x era)
- Focus on practical, actionable information over theoretical coverage
- Include complete working examples, not just snippets
- Document assumptions and limitations clearly
- Consider macOS as primary development environment (per user's env)
- Ensure all code is secure and follows best practices

## Execution

When this command is invoked:

1. Create the complete folder structure under `docs/research/cosmwasm-testnet/`
2. Execute Phases 1-7 systematically using TodoWrite to track progress
3. Use MCP documentation servers for primary research
4. Generate all required documents with complete information
5. Create working sample contract and configuration files
6. Test all provided scripts and configurations if possible
7. Present executive summary to user upon completion

ARGUMENTS: Any additional focus areas, constraints, or specific requirements can be passed to narrow or expand the research scope (e.g., "focus on Docker only", "include Keplr integration", "optimize for CI/CD").
