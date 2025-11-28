# Akash Token (AKT) Configuration

This guide provides detailed instructions for configuring the Akash Network token (AKT) in your local CosmWasm testnet, including denomination setup, genesis modifications, and account initialization.

## Overview

The Akash Network uses the **AKT** token with the base denomination **uakt** (micro-AKT):
- **1 AKT = 1,000,000 uakt**
- **Base denomination:** uakt (used in all blockchain operations)
- **Display denomination:** akt (human-readable)

This configuration is essential for:
- Testing AKT custody smart contracts
- Simulating Akash Network transaction fees
- Developing AKT-based payment features
- Ensuring compatibility with Akash mainnet

## Token Denomination Explained

### Denomination Hierarchy

```
1 AKT = 1,000,000 uakt
1 milli-AKT = 1,000 uakt
1 micro-AKT = 1 uakt
```

### Examples

| Human Amount | Base Units (uakt) | Notes |
|--------------|-------------------|-------|
| 1 AKT | 1,000,000 uakt | Standard unit |
| 0.5 AKT | 500,000 uakt | Half token |
| 100 AKT | 100,000,000 uakt | Common balance |
| 0.001 AKT | 1,000 uakt | 1 milli-AKT |
| 0.000001 AKT | 1 uakt | Smallest unit |

### Why uakt?

- **Precision:** Avoids floating-point arithmetic errors
- **Cosmos Standard:** All Cosmos SDK chains use micro-denominations
- **Compatibility:** Matches Akash mainnet configuration
- **Smart Contracts:** CosmWasm contracts work with base denominations

## Genesis Configuration

### Complete genesis.json Structure

The genesis file must be configured with AKT denomination across multiple modules. Below is a comprehensive guide for each module.

### 1. Bank Module Configuration

The bank module handles token transfers and balances.

```json
{
  "app_state": {
    "bank": {
      "params": {
        "send_enabled": [
          {
            "denom": "uakt",
            "enabled": true
          }
        ],
        "default_send_enabled": true
      },
      "balances": [
        {
          "address": "wasm1abc123validator...",
          "coins": [
            {
              "denom": "uakt",
              "amount": "100000000000"
            }
          ]
        },
        {
          "address": "wasm1def456alice...",
          "coins": [
            {
              "denom": "uakt",
              "amount": "50000000000"
            }
          ]
        }
      ],
      "supply": [
        {
          "denom": "uakt",
          "amount": "200000000000"
        }
      ],
      "denom_metadata": [
        {
          "description": "The native token of Akash Network",
          "denom_units": [
            {
              "denom": "uakt",
              "exponent": 0,
              "aliases": ["microakt"]
            },
            {
              "denom": "makt",
              "exponent": 3,
              "aliases": ["milliakt"]
            },
            {
              "denom": "akt",
              "exponent": 6,
              "aliases": []
            }
          ],
          "base": "uakt",
          "display": "akt",
          "name": "Akash Network Token",
          "symbol": "AKT"
        }
      ]
    }
  }
}
```

### 2. Staking Module Configuration

The staking module requires AKT for validator operations.

```json
{
  "app_state": {
    "staking": {
      "params": {
        "unbonding_time": "1814400s",
        "max_validators": 100,
        "max_entries": 7,
        "historical_entries": 10000,
        "bond_denom": "uakt",
        "min_commission_rate": "0.050000000000000000"
      },
      "last_total_power": "0",
      "last_validator_powers": [],
      "validators": [],
      "delegations": [],
      "unbonding_delegations": [],
      "redelegations": [],
      "exported": false
    }
  }
}
```

**Key setting:** `"bond_denom": "uakt"` - validators must stake AKT

### 3. Crisis Module Configuration

The crisis module uses AKT for invariant checks.

```json
{
  "app_state": {
    "crisis": {
      "constant_fee": {
        "denom": "uakt",
        "amount": "1000000000"
      }
    }
  }
}
```

**Constant fee:** 1,000 AKT to halt the chain if invariants are violated

### 4. Governance Module Configuration

The governance module requires AKT deposits for proposals.

```json
{
  "app_state": {
    "gov": {
      "starting_proposal_id": "1",
      "deposits": [],
      "votes": [],
      "proposals": [],
      "deposit_params": {
        "min_deposit": [
          {
            "denom": "uakt",
            "amount": "10000000"
          }
        ],
        "max_deposit_period": "172800s"
      },
      "voting_params": {
        "voting_period": "300s"
      },
      "tally_params": {
        "quorum": "0.334000000000000000",
        "threshold": "0.500000000000000000",
        "veto_threshold": "0.334000000000000000"
      }
    }
  }
}
```

**Key settings:**
- **min_deposit:** 10 AKT required to submit a proposal
- **voting_period:** 300s (5 minutes) for testing (mainnet: 2 weeks)

### 5. Mint Module Configuration

The mint module configures token inflation.

```json
{
  "app_state": {
    "mint": {
      "minter": {
        "inflation": "0.130000000000000000",
        "annual_provisions": "0.000000000000000000"
      },
      "params": {
        "mint_denom": "uakt",
        "inflation_rate_change": "0.130000000000000000",
        "inflation_max": "0.200000000000000000",
        "inflation_min": "0.070000000000000000",
        "goal_bonded": "0.670000000000000000",
        "blocks_per_year": "6311520"
      }
    }
  }
}
```

**Key setting:** `"mint_denom": "uakt"` - new tokens are minted as uakt

### 6. Distribution Module Configuration

The distribution module handles staking rewards.

```json
{
  "app_state": {
    "distribution": {
      "params": {
        "community_tax": "0.020000000000000000",
        "base_proposer_reward": "0.010000000000000000",
        "bonus_proposer_reward": "0.040000000000000000",
        "withdraw_addr_enabled": true
      },
      "fee_pool": {
        "community_pool": []
      },
      "delegator_withdraw_infos": [],
      "previous_proposer": "",
      "outstanding_rewards": [],
      "validator_accumulated_commissions": [],
      "validator_historical_rewards": [],
      "validator_current_rewards": [],
      "delegator_starting_infos": [],
      "validator_slash_events": []
    }
  }
}
```

**Community tax:** 2% of rewards go to community pool

### 7. Slashing Module Configuration

Default slashing parameters (no denomination-specific config needed).

```json
{
  "app_state": {
    "slashing": {
      "params": {
        "signed_blocks_window": "100",
        "min_signed_per_window": "0.500000000000000000",
        "downtime_jail_duration": "600s",
        "slash_fraction_double_sign": "0.050000000000000000",
        "slash_fraction_downtime": "0.010000000000000000"
      },
      "signing_infos": [],
      "missed_blocks": []
    }
  }
}
```

## Account Initialization

### Using wasmd Commands

#### Create Accounts with AKT Balances

```bash
# Set home directory
export WASMD_HOME="$HOME/cosmwasm-dev/testnet/native/.wasmd"

# Initialize chain (if not already done)
wasmd init testnode --chain-id local-testnet --home $WASMD_HOME

# Create validator key
wasmd keys add validator \
  --keyring-backend test \
  --home $WASMD_HOME

# Create test accounts
wasmd keys add alice \
  --keyring-backend test \
  --home $WASMD_HOME

wasmd keys add bob \
  --keyring-backend test \
  --home $WASMD_HOME

# Add accounts to genesis with AKT balances
# Validator: 100,000 AKT
wasmd add-genesis-account validator 100000000000uakt \
  --keyring-backend test \
  --home $WASMD_HOME

# Alice: 50,000 AKT
wasmd add-genesis-account alice 50000000000uakt \
  --keyring-backend test \
  --home $WASMD_HOME

# Bob: 25,000 AKT
wasmd add-genesis-account bob 25000000000uakt \
  --keyring-backend test \
  --home $WASMD_HOME
```

#### Add Multiple Denominations (Multi-Token Testing)

```bash
# Add account with multiple tokens
wasmd add-genesis-account alice \
  100000000000uakt,1000000000usdc,5000000000uatom \
  --keyring-backend test \
  --home $WASMD_HOME
```

### Manual Genesis Editing

For advanced configurations, edit genesis.json directly:

```bash
# Backup original genesis
cp $WASMD_HOME/config/genesis.json $WASMD_HOME/config/genesis.json.bak

# Edit with text editor or jq
# Add custom account
jq '.app_state.bank.balances += [{
  "address": "wasm1custom...",
  "coins": [{"denom": "uakt", "amount": "1000000000000"}]
}]' $WASMD_HOME/config/genesis.json > temp.json && mv temp.json $WASMD_HOME/config/genesis.json

# Update total supply
jq '.app_state.bank.supply[0].amount = "300000000000"' \
  $WASMD_HOME/config/genesis.json > temp.json && mv temp.json $WASMD_HOME/config/genesis.json
```

## Fee Configuration

### Minimum Gas Prices

Set minimum gas prices in app.toml:

```bash
# Native setup
sed -i.bak 's/minimum-gas-prices = ""/minimum-gas-prices = "0.025uakt"/' \
  $WASMD_HOME/config/app.toml

# Docker setup
docker exec cosmwasm-testnet \
  sed -i 's/minimum-gas-prices = ""/minimum-gas-prices = "0.025uakt"/' \
  /root/.wasmd/config/app.toml
```

### Fee Calculation Example

```bash
# Gas used: 200,000
# Gas price: 0.025 uakt
# Total fee: 200,000 * 0.025 = 5,000 uakt = 0.005 AKT

# Example transaction with fees
wasmd tx bank send alice $BOB_ADDR 1000000uakt \
  --chain-id local-testnet \
  --keyring-backend test \
  --home $WASMD_HOME \
  --gas 200000 \
  --gas-prices 0.025uakt \
  --yes
```

### Recommended Fee Settings

| Environment | Gas Price | Notes |
|-------------|-----------|-------|
| Local Testnet | 0.025 uakt | Fast, cheap for testing |
| Akash Testnet | 0.025 uakt | Match testnet |
| Akash Mainnet | 0.025 uakt | Production standard |

## Docker-Specific Configuration

### Docker Compose Setup

Update docker-compose.yml to include AKT configuration:

```yaml
services:
  wasmd:
    image: cosmwasm/wasmd:latest
    command: >
      sh -c "
      if [ ! -d /root/.wasmd/config ]; then
        wasmd init testnode --chain-id local-testnet &&
        wasmd keys add validator --keyring-backend test &&
        wasmd keys add alice --keyring-backend test &&
        wasmd keys add bob --keyring-backend test &&
        wasmd add-genesis-account validator 100000000000uakt --keyring-backend test &&
        wasmd add-genesis-account alice 50000000000uakt --keyring-backend test &&
        wasmd add-genesis-account bob 25000000000uakt --keyring-backend test &&
        wasmd gentx validator 50000000000uakt --chain-id local-testnet --keyring-backend test &&
        wasmd collect-gentxs &&
        sed -i 's/minimum-gas-prices = \"\"/minimum-gas-prices = \"0.025uakt\"/' /root/.wasmd/config/app.toml &&
        sed -i 's/\"bond_denom\": \"stake\"/\"bond_denom\": \"uakt\"/' /root/.wasmd/config/genesis.json;
      fi &&
      wasmd start
      "
```

### Verify Docker Configuration

```bash
# Start container
docker-compose up -d

# Check genesis configuration
docker exec cosmwasm-testnet \
  cat /root/.wasmd/config/genesis.json | \
  jq '.app_state.staking.params.bond_denom'
# Expected: "uakt"

# Check balances
docker exec cosmwasm-testnet \
  wasmd query bank total

# Expected output:
# pagination:
#   next_key: null
#   total: "0"
# supply:
# - amount: "200000000000"
#   denom: uakt
```

## Verification Steps

### 1. Verify Genesis Configuration

```bash
# Check bond denomination
cat $WASMD_HOME/config/genesis.json | jq '.app_state.staking.params.bond_denom'
# Expected: "uakt"

# Check mint denomination
cat $WASMD_HOME/config/genesis.json | jq '.app_state.mint.params.mint_denom'
# Expected: "uakt"

# Check total supply
cat $WASMD_HOME/config/genesis.json | jq '.app_state.bank.supply'
# Expected: [{"denom": "uakt", "amount": "..."}]

# Validate genesis
wasmd validate-genesis --home $WASMD_HOME
# Expected: File is a valid genesis file
```

### 2. Start Chain and Verify Balances

```bash
# Start chain
wasmd start --home $WASMD_HOME

# In another terminal, query balances
VALIDATOR_ADDR=$(wasmd keys show validator -a --keyring-backend test --home $WASMD_HOME)

wasmd query bank balances $VALIDATOR_ADDR --home $WASMD_HOME

# Expected output:
# balances:
# - amount: "100000000000"
#   denom: uakt
```

### 3. Test Transaction with AKT

```bash
# Get addresses
ALICE_ADDR=$(wasmd keys show alice -a --keyring-backend test --home $WASMD_HOME)
BOB_ADDR=$(wasmd keys show bob -a --keyring-backend test --home $WASMD_HOME)

# Send 10 AKT from alice to bob
wasmd tx bank send alice $BOB_ADDR 10000000uakt \
  --chain-id local-testnet \
  --keyring-backend test \
  --home $WASMD_HOME \
  --gas auto \
  --gas-adjustment 1.3 \
  --gas-prices 0.025uakt \
  --yes

# Wait for confirmation
sleep 2

# Verify bob received tokens
wasmd query bank balances $BOB_ADDR --home $WASMD_HOME
# Should show: 25010000000 uakt (25,000 + 10 AKT)
```

### 4. Verify Staking with AKT

```bash
# Query validator
wasmd query staking validators --home $WASMD_HOME

# Check validator's bonded tokens
wasmd query staking validator \
  $(wasmd keys show validator --bech val -a --keyring-backend test --home $WASMD_HOME) \
  --home $WASMD_HOME | jq '.tokens'

# Expected: "50000000000" (50,000 AKT staked)
```

## Common Configurations

### Testnet Faucet Accounts

Create well-funded faucet accounts for testing:

```bash
# Create faucet key
wasmd keys add faucet --keyring-backend test --home $WASMD_HOME

# Fund with 1,000,000 AKT
wasmd add-genesis-account faucet 1000000000000uakt \
  --keyring-backend test \
  --home $WASMD_HOME
```

### Multi-Token Setup

Support multiple tokens alongside AKT:

```bash
# Add accounts with multiple tokens
wasmd add-genesis-account alice \
  100000000000uakt,50000000000usdc,25000000000uatom \
  --keyring-backend test \
  --home $WASMD_HOME

# Update genesis to allow multiple denoms
jq '.app_state.bank.params.send_enabled += [
  {"denom": "usdc", "enabled": true},
  {"denom": "uatom", "enabled": true}
]' $WASMD_HOME/config/genesis.json > temp.json && mv temp.json $WASMD_HOME/config/genesis.json
```

## Troubleshooting

### Issue: Invalid Denomination

**Symptom:**
```
Error: invalid denom: stake
```

**Solution:**
Ensure all modules use "uakt" instead of default "stake":

```bash
# Check for "stake" references
grep -r "stake" $WASMD_HOME/config/genesis.json

# Replace all occurrences
sed -i.bak 's/"stake"/"uakt"/g' $WASMD_HOME/config/genesis.json
```

### Issue: Insufficient Fees

**Symptom:**
```
Error: insufficient fees; got: 0uakt required: 5000uakt
```

**Solution:**
Add fees or gas prices to transaction:

```bash
# Use --gas-prices flag
wasmd tx bank send alice $BOB_ADDR 1000000uakt \
  --gas-prices 0.025uakt \
  --yes
```

### Issue: Total Supply Mismatch

**Symptom:**
```
Error: invariant broken: bank: nonnegative-outstanding
```

**Solution:**
Ensure total supply matches sum of all balances:

```bash
# Calculate total from balances
cat $WASMD_HOME/config/genesis.json | \
  jq '[.app_state.bank.balances[].coins[].amount | tonumber] | add'

# Update supply to match
# Edit genesis.json manually or regenerate
```

## Best Practices

1. **Always use uakt in code:** Smart contracts and CLI commands should use base denomination
2. **Display conversion:** Convert to AKT only for user-facing displays
3. **Precision:** Use integer arithmetic to avoid rounding errors
4. **Validation:** Always validate genesis file after modifications
5. **Backup:** Keep backup of genesis.json before manual edits
6. **Consistency:** Ensure all modules use the same denomination

## Next Steps

1. **Deploy Contracts:** See [Contract Deployment Workflow](../workflows/contract-deployment.md)
2. **Testing:** See [Testing Patterns](../workflows/testing-patterns.md)
3. **Reset Procedures:** See [Reset Procedures](../workflows/reset-procedures.md)

## Additional Resources

- **Akash Network Docs:** https://docs.akash.network
- **Cosmos SDK Bank Module:** https://docs.cosmos.network/main/modules/bank
- **CosmWasm Denomination Handling:** https://book.cosmwasm.com

---

*Last Updated: 2025-11-28*
*Akash Network Token: AKT (uakt base denomination)*
