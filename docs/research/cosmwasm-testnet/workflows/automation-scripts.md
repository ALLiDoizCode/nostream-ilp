# Automation Scripts

This guide provides complete, production-ready automation scripts for managing your local CosmWasm testnet, including initialization, deployment, testing, and maintenance.

## Overview

Automation scripts streamline:
- **Testnet initialization:** One-command setup
- **Contract deployment:** Automated build, optimize, upload, instantiate
- **Testing:** Automated integration test execution
- **Maintenance:** Backup, reset, monitoring

## Script Organization

Recommended directory structure:

```
~/cosmwasm-dev/scripts/
├── init-testnet.sh          # Initialize testnet (native or Docker)
├── deploy-contract.sh       # Deploy contract workflow
├── test-contract.sh         # Run integration tests
├── reset-testnet.sh         # Reset chain
├── backup-testnet.sh        # Backup chain data
├── monitor-testnet.sh       # Health monitoring
└── lib/
    ├── common.sh            # Shared functions
    └── colors.sh            # Terminal colors
```

## Core Scripts

### 1. init-testnet.sh

Complete testnet initialization script.

```bash
#!/bin/bash
# scripts/init-testnet.sh
# Initializes a local CosmWasm testnet (native or Docker)

set -e

# Configuration
SETUP_TYPE="${1:-docker}"  # docker or native
CHAIN_ID="local-testnet"
WASMD_HOME="${WASMD_HOME:-$HOME/cosmwasm-dev/testnet/native/.wasmd}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if [ "$SETUP_TYPE" == "docker" ]; then
        if ! command -v docker &> /dev/null; then
            log_error "Docker not found. Please install Docker first."
            exit 1
        fi
        if ! command -v docker-compose &> /dev/null; then
            log_error "Docker Compose not found. Please install Docker Compose first."
            exit 1
        fi
    else
        if ! command -v wasmd &> /dev/null; then
            log_error "wasmd not found. Please install wasmd first."
            exit 1
        fi
        if ! command -v go &> /dev/null; then
            log_error "Go not found. Please install Go first."
            exit 1
        fi
    fi

    log_success "Prerequisites check passed"
}

# Initialize Docker testnet
init_docker() {
    log_info "Initializing Docker-based testnet..."

    cd ~/cosmwasm-dev/testnet/docker || exit 1

    # Create docker-compose.yml if not exists
    if [ ! -f docker-compose.yml ]; then
        log_info "Creating docker-compose.yml..."
        cat > docker-compose.yml << 'EOF'
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
        echo 'password' | wasmd keys add alice --keyring-backend test &&
        echo 'password' | wasmd keys add bob --keyring-backend test &&
        wasmd add-genesis-account validator 100000000000uakt --keyring-backend test &&
        wasmd add-genesis-account alice 50000000000uakt --keyring-backend test &&
        wasmd add-genesis-account bob 25000000000uakt --keyring-backend test &&
        wasmd gentx validator 50000000000uakt --chain-id local-testnet --keyring-backend test &&
        wasmd collect-gentxs &&
        sed -i 's/minimum-gas-prices = \"\"/minimum-gas-prices = \"0.025uakt\"/' /root/.wasmd/config/app.toml &&
        sed -i 's/\"permission\": \"Nobody\"/\"permission\": \"Everybody\"/' /root/.wasmd/config/genesis.json &&
        sed -i 's/enable = false/enable = true/' /root/.wasmd/config/app.toml &&
        sed -i 's/swagger = false/swagger = true/' /root/.wasmd/config/app.toml &&
        sed -i 's/timeout_commit = \"5s\"/timeout_commit = \"1s\"/' /root/.wasmd/config/config.toml &&
        echo 'Initialization complete.';
      else
        echo 'Using existing chain data...';
      fi &&
      wasmd start --rpc.laddr tcp://0.0.0.0:26657
      "
    ports:
      - "26657:26657"
      - "26656:26656"
      - "1317:1317"
      - "9090:9090"
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
EOF
    fi

    # Start containers
    log_info "Starting Docker containers..."
    docker-compose up -d

    # Wait for chain to start
    log_info "Waiting for chain to start (30s)..."
    sleep 30

    # Verify
    if curl -s http://localhost:26657/status > /dev/null; then
        log_success "Docker testnet initialized successfully!"
        log_info "RPC: http://localhost:26657"
        log_info "REST API: http://localhost:1317"
        log_info "gRPC: localhost:9090"
    else
        log_error "Chain failed to start. Check logs with: docker-compose logs"
        exit 1
    fi
}

# Initialize native testnet
init_native() {
    log_info "Initializing native testnet..."

    # Create directory
    mkdir -p ~/cosmwasm-dev/testnet/native
    cd ~/cosmwasm-dev/testnet/native || exit 1

    # Remove old data
    if [ -d "$WASMD_HOME" ]; then
        log_info "Removing existing testnet data..."
        rm -rf "$WASMD_HOME"
    fi

    # Initialize chain
    log_info "Initializing chain..."
    wasmd init testnode --chain-id $CHAIN_ID --home "$WASMD_HOME"

    # Configure app.toml
    log_info "Configuring app.toml..."
    sed -i.bak 's/minimum-gas-prices = ""/minimum-gas-prices = "0.025uakt"/' "$WASMD_HOME/config/app.toml"
    sed -i.bak 's/enable = false/enable = true/g' "$WASMD_HOME/config/app.toml"
    sed -i.bak 's/swagger = false/swagger = true/' "$WASMD_HOME/config/app.toml"

    # Configure config.toml
    log_info "Configuring config.toml..."
    sed -i.bak 's/timeout_commit = "5s"/timeout_commit = "1s"/' "$WASMD_HOME/config/config.toml"
    sed -i.bak 's/cors_allowed_origins = \[\]/cors_allowed_origins = ["*"]/' "$WASMD_HOME/config/config.toml"
    sed -i.bak 's/laddr = "tcp:\/\/127.0.0.1:26657"/laddr = "tcp:\/\/0.0.0.0:26657"/' "$WASMD_HOME/config/config.toml"

    # Configure genesis.json
    log_info "Configuring genesis.json..."
    sed -i.bak 's/"permission": "Nobody"/"permission": "Everybody"/' "$WASMD_HOME/config/genesis.json"
    sed -i.bak 's/"voting_period": "172800s"/"voting_period": "300s"/' "$WASMD_HOME/config/genesis.json"

    # Create keys
    log_info "Creating keys..."
    wasmd keys add validator --keyring-backend test --home "$WASMD_HOME" 2>&1 | tee validator.key
    wasmd keys add alice --keyring-backend test --home "$WASMD_HOME" 2>&1 | tee alice.key
    wasmd keys add bob --keyring-backend test --home "$WASMD_HOME" 2>&1 | tee bob.key

    # Add genesis accounts
    log_info "Adding genesis accounts..."
    wasmd add-genesis-account validator 100000000000uakt --keyring-backend test --home "$WASMD_HOME"
    wasmd add-genesis-account alice 50000000000uakt --keyring-backend test --home "$WASMD_HOME"
    wasmd add-genesis-account bob 25000000000uakt --keyring-backend test --home "$WASMD_HOME"

    # Create genesis transaction
    log_info "Creating genesis transaction..."
    wasmd gentx validator 50000000000uakt \
        --chain-id $CHAIN_ID \
        --keyring-backend test \
        --home "$WASMD_HOME"

    wasmd collect-gentxs --home "$WASMD_HOME"
    wasmd validate-genesis --home "$WASMD_HOME"

    # Start chain
    log_info "Starting chain..."
    nohup wasmd start --home "$WASMD_HOME" > "$WASMD_HOME/wasmd.log" 2>&1 &
    echo $! > "$WASMD_HOME/wasmd.pid"

    # Wait for chain
    log_info "Waiting for chain to start (10s)..."
    sleep 10

    # Verify
    if curl -s http://localhost:26657/status > /dev/null; then
        log_success "Native testnet initialized successfully!"
        log_info "RPC: http://localhost:26657"
        log_info "Logs: tail -f $WASMD_HOME/wasmd.log"
        log_info "PID: $(cat $WASMD_HOME/wasmd.pid)"
    else
        log_error "Chain failed to start. Check logs: tail -f $WASMD_HOME/wasmd.log"
        exit 1
    fi
}

# Main
main() {
    echo "=========================================="
    echo "  CosmWasm Local Testnet Initialization  "
    echo "=========================================="
    echo ""

    check_prerequisites

    if [ "$SETUP_TYPE" == "docker" ]; then
        init_docker
    elif [ "$SETUP_TYPE" == "native" ]; then
        init_native
    else
        log_error "Invalid setup type: $SETUP_TYPE (use 'docker' or 'native')"
        exit 1
    fi

    log_success "Testnet is ready for contract development!"
}

main
```

**Usage:**
```bash
chmod +x scripts/init-testnet.sh

# Initialize Docker testnet
./scripts/init-testnet.sh docker

# Initialize native testnet
./scripts/init-testnet.sh native
```

### 2. deploy-contract.sh

Automated contract deployment workflow.

```bash
#!/bin/bash
# scripts/deploy-contract.sh
# Automates contract compilation, optimization, upload, and instantiation

set -e

# Configuration
CONTRACT_DIR="${1:-.}"
CHAIN_ID="local-testnet"
DEPLOYER="${2:-alice}"
WASMD_HOME="${WASMD_HOME:-$HOME/cosmwasm-dev/testnet/native/.wasmd}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "=========================================="
echo "  CosmWasm Contract Deployment Workflow  "
echo "=========================================="
echo ""

cd "$CONTRACT_DIR" || exit 1

# 1. Run unit tests
log_info "Step 1/7: Running unit tests..."
cargo test
log_success "Unit tests passed"

# 2. Compile contract
log_info "Step 2/7: Compiling contract to Wasm..."
cargo wasm
log_success "Contract compiled"

# 3. Optimize contract
log_info "Step 3/7: Optimizing contract..."
if ! command -v docker &> /dev/null; then
    log_error "Docker not found. Required for optimization."
    exit 1
fi

docker run --rm -v "$(pwd)":/code \
    --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
    --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
    cosmwasm/optimizer:0.16.0

log_success "Contract optimized: artifacts/*.wasm"

# 4. Validate contract
log_info "Step 4/7: Validating contract..."
if ! command -v cosmwasm-check &> /dev/null; then
    log_warning "cosmwasm-check not found. Skipping validation."
else
    cosmwasm-check artifacts/*.wasm
    log_success "Contract validated"
fi

# 5. Upload contract
log_info "Step 5/7: Uploading contract to testnet..."
WASM_FILE=$(ls artifacts/*.wasm | head -n 1)

CODE_ID=$(wasmd tx wasm store "$WASM_FILE" \
    --from $DEPLOYER \
    --chain-id $CHAIN_ID \
    --gas auto \
    --gas-adjustment 1.3 \
    --gas-prices 0.025uakt \
    --keyring-backend test \
    --home "$WASMD_HOME" \
    --yes \
    --output json | jq -r '.logs[0].events[] | select(.type=="store_code") | .attributes[] | select(.key=="code_id") | .value')

log_success "Contract uploaded with Code ID: $CODE_ID"

# 6. Instantiate contract
log_info "Step 6/7: Instantiating contract..."
DEPLOYER_ADDR=$(wasmd keys show $DEPLOYER -a --keyring-backend test --home "$WASMD_HOME")

# Check for instantiate message file
if [ -f "instantiate-msg.json" ]; then
    INIT_MSG=$(cat instantiate-msg.json)
else
    log_warning "No instantiate-msg.json found. Using default message."
    INIT_MSG="{\"owner\":\"$DEPLOYER_ADDR\"}"
fi

wasmd tx wasm instantiate $CODE_ID "$INIT_MSG" \
    --from $DEPLOYER \
    --label "contract-$(date +%s)" \
    --admin $DEPLOYER_ADDR \
    --chain-id $CHAIN_ID \
    --gas auto \
    --gas-adjustment 1.3 \
    --gas-prices 0.025uakt \
    --keyring-backend test \
    --home "$WASMD_HOME" \
    --yes

sleep 3

CONTRACT_ADDR=$(wasmd query wasm list-contract-by-code $CODE_ID \
    --home "$WASMD_HOME" \
    --output json | jq -r '.contracts[-1]')

log_success "Contract instantiated at: $CONTRACT_ADDR"

# 7. Save deployment info
log_info "Step 7/7: Saving deployment information..."
cat > deployment-info.json << EOF
{
  "code_id": $CODE_ID,
  "contract_address": "$CONTRACT_ADDR",
  "deployer": "$DEPLOYER_ADDR",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "wasm_file": "$WASM_FILE",
  "init_msg": $INIT_MSG
}
EOF

log_success "Deployment info saved to: deployment-info.json"

echo ""
echo "=========================================="
echo "  Deployment Complete!  "
echo "=========================================="
echo "Code ID: $CODE_ID"
echo "Contract Address: $CONTRACT_ADDR"
echo "Deployer: $DEPLOYER_ADDR"
echo "=========================================="
```

**Usage:**
```bash
chmod +x scripts/deploy-contract.sh

# Deploy from contract directory
cd ~/cosmwasm-dev/contracts/akt-custody
../../scripts/deploy-contract.sh . alice
```

### 3. test-contract.sh

Automated integration testing.

```bash
#!/bin/bash
# scripts/test-contract.sh
# Runs integration tests against deployed contract

set -e

CONTRACT_ADDR="$1"
CHAIN_ID="local-testnet"
WASMD_HOME="${WASMD_HOME:-$HOME/cosmwasm-dev/testnet/native/.wasmd}"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

if [ -z "$CONTRACT_ADDR" ]; then
    echo "Usage: $0 <contract_address>"
    exit 1
fi

ALICE_ADDR=$(wasmd keys show alice -a --keyring-backend test --home "$WASMD_HOME")
BOB_ADDR=$(wasmd keys show bob -a --keyring-backend test --home "$WASMD_HOME")

# Test counter
PASSED=0
FAILED=0

# Test function
test_case() {
    local name="$1"
    local command="$2"
    local expected="$3"

    echo -n "Testing: $name... "

    if result=$(eval "$command" 2>&1); then
        if echo "$result" | grep -q "$expected"; then
            echo -e "${GREEN}PASS${NC}"
            ((PASSED++))
        else
            echo -e "${RED}FAIL${NC}"
            echo "Expected: $expected"
            echo "Got: $result"
            ((FAILED++))
        fi
    else
        echo -e "${RED}FAIL${NC}"
        echo "Error: $result"
        ((FAILED++))
    fi
}

echo "Running integration tests for contract: $CONTRACT_ADDR"
echo ""

# Test 1: Query config
test_case "Query config" \
    "wasmd query wasm contract-state smart $CONTRACT_ADDR '{\"config\":{}}' --home $WASMD_HOME --output json" \
    "owner"

# Test 2: Deposit
test_case "Execute deposit" \
    "wasmd tx wasm execute $CONTRACT_ADDR '{\"deposit\":{\"recipient\":\"$BOB_ADDR\"}}' --from bob --amount 5000000uakt --chain-id $CHAIN_ID --gas auto --gas-prices 0.025uakt --keyring-backend test --home $WASMD_HOME --yes --output json" \
    "code\":0"

sleep 2

# Test 3: Query balance
test_case "Query balance after deposit" \
    "wasmd query wasm contract-state smart $CONTRACT_ADDR '{\"balance\":{\"address\":\"$BOB_ADDR\"}}' --home $WASMD_HOME --output json" \
    "5000000"

echo ""
echo "=========================================="
echo "Tests passed: $PASSED"
echo "Tests failed: $FAILED"
echo "=========================================="

if [ $FAILED -gt 0 ]; then
    exit 1
fi
```

**Usage:**
```bash
chmod +x scripts/test-contract.sh
./scripts/test-contract.sh wasm14hj2tavq8fpesdwxxcu44rty3hh90vhujrvcmstl4zr3txmfvw9swma0pe
```

## Next Steps

1. **Common Issues:** See [Common Issues](../troubleshooting/common-issues.md)
2. **Debugging:** See [Debugging Guide](../troubleshooting/debugging-guide.md)
3. **Testing Patterns:** See [Testing Patterns](./testing-patterns.md)

---

*Last Updated: 2025-11-28*
