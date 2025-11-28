# Command Reference

Complete reference for wasmd CLI commands organized by category.

## Keys Management

### Create Key
```bash
wasmd keys add <name> --keyring-backend test --home $WASMD_HOME
```

### List Keys
```bash
wasmd keys list --keyring-backend test --home $WASMD_HOME
```

### Show Key Address
```bash
wasmd keys show <name> -a --keyring-backend test --home $WASMD_HOME
```

### Export Key
```bash
wasmd keys export <name> --keyring-backend test --home $WASMD_HOME
```

### Delete Key
```bash
wasmd keys delete <name> --keyring-backend test --home $WASMD_HOME
```

## Chain Initialization

### Initialize Chain
```bash
wasmd init <moniker> --chain-id <chain-id> --home $WASMD_HOME
```

### Add Genesis Account
```bash
wasmd add-genesis-account <address> <amount>uakt --keyring-backend test --home $WASMD_HOME
```

### Create Genesis Transaction
```bash
wasmd gentx <key-name> <amount>uakt --chain-id <chain-id> --keyring-backend test --home $WASMD_HOME
```

### Collect Genesis Transactions
```bash
wasmd collect-gentxs --home $WASMD_HOME
```

### Validate Genesis
```bash
wasmd validate-genesis --home $WASMD_HOME
```

## Chain Operations

### Start Chain
```bash
wasmd start --home $WASMD_HOME
```

### Check Status
```bash
wasmd status --home $WASMD_HOME
```

### Export State
```bash
wasmd export --home $WASMD_HOME --height <block_height> > export.json
```

### Reset Chain
```bash
wasmd tendermint unsafe-reset-all --home $WASMD_HOME
```

## Bank Transactions

### Send Tokens
```bash
wasmd tx bank send <from> <to> <amount>uakt \
    --chain-id <chain-id> \
    --keyring-backend test \
    --home $WASMD_HOME \
    --gas auto \
    --gas-prices 0.025uakt \
    --yes
```

### Query Balance
```bash
wasmd query bank balances <address> --home $WASMD_HOME
```

### Query Total Supply
```bash
wasmd query bank total --home $WASMD_HOME
```

### Query Denom Metadata
```bash
wasmd query bank denom-metadata --home $WASMD_HOME
```

## Contract Operations

### Upload Contract
```bash
wasmd tx wasm store <wasm-file> \
    --from <key-name> \
    --chain-id <chain-id> \
    --gas auto \
    --gas-adjustment 1.3 \
    --gas-prices 0.025uakt \
    --keyring-backend test \
    --home $WASMD_HOME \
    --yes
```

### List Uploaded Contracts
```bash
wasmd query wasm list-code --home $WASMD_HOME
```

### Query Code Info
```bash
wasmd query wasm code <code-id> --home $WASMD_HOME
```

### Download Contract Code
```bash
wasmd query wasm code <code-id> <output-file> --home $WASMD_HOME
```

### Instantiate Contract
```bash
wasmd tx wasm instantiate <code-id> '<init-msg-json>' \
    --from <key-name> \
    --label "<label>" \
    --admin <admin-address> \
    --amount <amount>uakt \
    --chain-id <chain-id> \
    --gas auto \
    --gas-prices 0.025uakt \
    --keyring-backend test \
    --home $WASMD_HOME \
    --yes
```

### List Contract Instances
```bash
wasmd query wasm list-contract-by-code <code-id> --home $WASMD_HOME
```

### Query Contract Info
```bash
wasmd query wasm contract <contract-address> --home $WASMD_HOME
```

### Execute Contract
```bash
wasmd tx wasm execute <contract-address> '<execute-msg-json>' \
    --from <key-name> \
    --amount <amount>uakt \
    --chain-id <chain-id> \
    --gas auto \
    --gas-prices 0.025uakt \
    --keyring-backend test \
    --home $WASMD_HOME \
    --yes
```

### Query Contract (Smart)
```bash
wasmd query wasm contract-state smart <contract-address> '<query-msg-json>' \
    --home $WASMD_HOME
```

### Query All Contract State
```bash
wasmd query wasm contract-state all <contract-address> --home $WASMD_HOME
```

### Query Raw Contract State
```bash
wasmd query wasm contract-state raw <contract-address> <hex-key> --home $WASMD_HOME
```

### Migrate Contract
```bash
wasmd tx wasm migrate <contract-address> <new-code-id> '<migrate-msg-json>' \
    --from <admin> \
    --chain-id <chain-id> \
    --gas auto \
    --gas-prices 0.025uakt \
    --keyring-backend test \
    --home $WASMD_HOME \
    --yes
```

### Update Admin
```bash
wasmd tx wasm set-contract-admin <contract-address> <new-admin> \
    --from <current-admin> \
    --chain-id <chain-id> \
    --keyring-backend test \
    --home $WASMD_HOME \
    --yes
```

### Clear Admin
```bash
wasmd tx wasm clear-contract-admin <contract-address> \
    --from <admin> \
    --chain-id <chain-id> \
    --keyring-backend test \
    --home $WASMD_HOME \
    --yes
```

## Transaction Queries

### Query Transaction
```bash
wasmd query tx <tx-hash> --home $WASMD_HOME
```

### Search Transactions
```bash
wasmd query txs --events 'message.action=store-code' --home $WASMD_HOME
```

## Staking Operations

### Query Validators
```bash
wasmd query staking validators --home $WASMD_HOME
```

### Query Validator
```bash
wasmd query staking validator <validator-address> --home $WASMD_HOME
```

### Query Delegations
```bash
wasmd query staking delegations <delegator-address> --home $WASMD_HOME
```

### Delegate
```bash
wasmd tx staking delegate <validator-address> <amount>uakt \
    --from <key-name> \
    --chain-id <chain-id> \
    --keyring-backend test \
    --home $WASMD_HOME \
    --yes
```

### Unbond
```bash
wasmd tx staking unbond <validator-address> <amount>uakt \
    --from <key-name> \
    --chain-id <chain-id> \
    --keyring-backend test \
    --home $WASMD_HOME \
    --yes
```

## Governance

### Query Proposals
```bash
wasmd query gov proposals --home $WASMD_HOME
```

### Submit Proposal
```bash
wasmd tx gov submit-proposal <proposal-file> \
    --from <key-name> \
    --chain-id <chain-id> \
    --keyring-backend test \
    --home $WASMD_HOME \
    --yes
```

### Vote
```bash
wasmd tx gov vote <proposal-id> <yes|no|abstain|no_with_veto> \
    --from <key-name> \
    --chain-id <chain-id> \
    --keyring-backend test \
    --home $WASMD_HOME \
    --yes
```

## Tendermint Commands

### Show Node ID
```bash
wasmd tendermint show-node-id --home $WASMD_HOME
```

### Show Validator
```bash
wasmd tendermint show-validator --home $WASMD_HOME
```

### Show Address
```bash
wasmd tendermint show-address --home $WASMD_HOME
```

## Debugging & Testing

### Dry Run Transaction
```bash
wasmd tx <command> --dry-run
```

### Simulate Transaction
```bash
wasmd tx <command> --gas auto
```

### Query with JSON Output
```bash
wasmd query <command> --output json | jq .
```

## Common Flag Combinations

### Standard Transaction Flags
```bash
--chain-id local-testnet \
--keyring-backend test \
--home $WASMD_HOME \
--gas auto \
--gas-adjustment 1.3 \
--gas-prices 0.025uakt \
--yes
```

### Standard Query Flags
```bash
--home $WASMD_HOME \
--output json
```

---

*Last Updated: 2025-11-28*
*Commands: 50+*
