# Glossary

Comprehensive terminology reference for CosmWasm and Cosmos SDK development.

## CosmWasm Terms

### Contract
A WebAssembly smart contract deployed to a CosmWasm-enabled blockchain.

### Code ID
Unique identifier for uploaded contract bytecode. Multiple contract instances can share the same Code ID.

### Contract Address
Unique bech32-encoded address of an instantiated contract (e.g., `wasm14hj2tavq8fpesdwxxcu44rty3hh90vhujrvcmstl4zr3txmfvw9swma0pe`).

### Instantiate
Create a new contract instance from uploaded code with initial state.

### Execute
Invoke a contract function that modifies state.

### Query
Read contract state without modification. Queries don't cost gas.

### Migrate
Upgrade a contract instance to new code while preserving state.

### Entry Point
Exported function that the CosmWasm VM calls (`instantiate`, `execute`, `query`, `migrate`).

### cosmwasm-std
Standard library providing core functionality for CosmWasm contracts.

### cosmwasm-optimizer
Docker-based tool producing deterministic, optimized Wasm binaries.

### cosmwasm-check
Validation tool ensuring Wasm binaries meet CosmWasm standards.

## Cosmos SDK Terms

### wasmd
Cosmos SDK application with WebAssembly support for smart contracts.

### Validator
Node responsible for producing blocks and securing the network through staking.

### Staking
Locking tokens to participate in consensus and earn rewards.

### Delegation
Assigning stake to a validator.

### Unbonding
Process of unstaking tokens (has waiting period).

### Slashing
Penalty for validator misbehavior (downtime or double-signing).

### Governance
On-chain voting system for protocol upgrades and parameter changes.

### Genesis
Initial state of the blockchain defined in genesis.json.

### Gentx
Genesis transaction creating initial validators.

### Chain ID
Unique identifier for the blockchain (e.g., `local-testnet`).

### Block Height
Sequential number of blocks produced since genesis.

### Consensus
Algorithm ensuring network agreement (Tendermint BFT).

### Module
Cosmos SDK component providing specific functionality (bank, staking, wasm).

## Token & Denomination Terms

### Denom
Token denomination identifier (e.g., `uakt` for micro-AKT).

### uakt
Micro-AKT, the base denomination of Akash Network token (1 AKT = 1,000,000 uakt).

### Base Denomination
Smallest indivisible unit of a token used internally.

### Display Denomination
Human-readable token unit (e.g., AKT instead of uakt).

### Gas
Computational unit measuring transaction execution cost.

### Gas Price
Cost per unit of gas (e.g., `0.025uakt`).

### Gas Limit
Maximum gas allowed for a transaction.

### Fee
Total transaction cost (gas used × gas price).

## Node & Network Terms

### RPC
Remote Procedure Call interface for querying chain state (default port: 26657).

### REST API
HTTP API for querying and transactions (default port: 1317).

### gRPC
High-performance RPC protocol (default port: 9090).

### Endpoint
Network address for accessing node services.

### Peer
Another node in the network.

### Seed Node
Node providing initial peer list for network discovery.

### Persistent Peers
Nodes to maintain constant connections with.

### Tendermint
Byzantine Fault Tolerant consensus engine powering Cosmos chains.

### ABCI
Application Blockchain Interface connecting Tendermint to application logic.

### Mempool
Pool of unconfirmed transactions awaiting inclusion in blocks.

## Configuration Terms

### app.toml
Application configuration file (gas prices, API settings).

### config.toml
Node configuration file (networking, consensus parameters).

### genesis.json
Initial chain state and parameters.

### Keyring
Secure storage for private keys.

### Keyring Backend
Storage method for keys (test, file, os, kwallet).

## Transaction Terms

### TX Hash
Unique identifier for a transaction.

### Nonce
Sequential number preventing transaction replay.

### Signature
Cryptographic proof of transaction authorization.

### Broadcast
Submit transaction to network for inclusion.

### Confirmation
Transaction included in a block.

### Finality
Irreversible transaction state after sufficient blocks.

## Development Terms

### Testnet
Testing blockchain environment.

### Mainnet
Production blockchain network.

### Faucet
Service distributing free testnet tokens.

### Block Explorer
Web UI for viewing chain data.

### Simulation
Dry-run of transaction to estimate gas.

### Deterministic Build
Reproducible compilation producing identical binaries.

## Docker Terms

### Container
Isolated execution environment.

### Image
Template for creating containers.

### Volume
Persistent data storage for containers.

### Docker Compose
Tool for orchestrating multi-container applications.

### Health Check
Automated container status monitoring.

### docker-compose.yml
Configuration file defining services, volumes, networks.

## Rust Terms

### Cargo
Rust package manager and build tool.

### Crate
Rust library or binary package.

### wasm32-unknown-unknown
Rust target for WebAssembly compilation.

### Entry Point Macro
`#[entry_point]` attribute marking contract functions.

### Serde
Serialization/deserialization framework.

### Thiserror
Error handling macro library.

## State & Storage Terms

### Storage
Persistent key-value store for contract data.

### Item
Single value storage helper from cw-storage-plus.

### Map
Key-value mapping storage helper.

### IndexedMap
Map with secondary indices for efficient queries.

### State Migration
Updating storage schema during contract upgrade.

## Testing Terms

### Mock Dependencies
Simulated blockchain environment for unit tests.

### cw-multi-test
Framework for multi-contract integration tests.

### Integration Test
Testing contracts against live testnet.

### Property-Based Testing
Automated testing with generated inputs (proptest).

### Coverage
Percentage of code executed by tests.

## Akash Network Terms

### AKT
Native token of Akash Network.

### Akash Provider
Node offering compute resources on Akash marketplace.

### Deployment
Application running on Akash compute marketplace.

### SDL
Stack Definition Language for Akash deployments.

## Common Abbreviations

- **ABI:** Application Binary Interface
- **API:** Application Programming Interface
- **BFT:** Byzantine Fault Tolerant
- **CLI:** Command Line Interface
- **IBC:** Inter-Blockchain Communication
- **JSON:** JavaScript Object Notation
- **RPC:** Remote Procedure Call
- **SDK:** Software Development Kit
- **TX:** Transaction
- **VM:** Virtual Machine
- **Wasm:** WebAssembly

---

*Last Updated: 2025-11-28*
*Terms: 80+*
