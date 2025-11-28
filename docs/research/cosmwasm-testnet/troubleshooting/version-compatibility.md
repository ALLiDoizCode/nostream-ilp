# Version Compatibility Matrix

Complete compatibility information for CosmWasm local testnet components.

## Primary Compatibility Matrix

| wasmd | CosmWasm | Cosmos SDK | Go | Rust | Tendermint |
|-------|----------|------------|-----|------|------------|
| v0.50.0 | 2.0.x | v0.50.x | 1.21+ | 1.70+ | v0.38.x |
| v0.45.0 | 1.5.x | v0.47.x | 1.20+ | 1.70+ | v0.37.x |
| v0.41.0 | 1.4.x | v0.47.x | 1.20+ | 1.65+ | v0.37.x |
| v0.40.0 | 1.3.x | v0.47.x | 1.20+ | 1.65+ | v0.37.x |

## Recommended Stable Combination

**For production-like testing:**
- **wasmd:** v0.50.0
- **CosmWasm:** 2.0.3
- **Cosmos SDK:** v0.50.1
- **Go:** 1.21.6
- **Rust:** 1.75.0
- **Docker:** 24.0.7
- **cosmwasm-optimizer:** 0.16.0

## Akash Network Compatibility

| Akash Mainnet | wasmd | CosmWasm | Notes |
|---------------|-------|----------|-------|
| mainnet-14 | v0.45.0+ | 1.5.x | Current production |
| testnet | v0.50.0 | 2.0.x | Latest features |

## Tool Versions

| Tool | Min Version | Recommended | Notes |
|------|-------------|-------------|-------|
| cosmwasm-check | 2.0.0 | Latest | Must match CosmWasm version |
| cargo | 1.70.0 | Latest | Comes with Rust |
| Docker | 20.10.0 | 24.0+ | For optimizer |
| Docker Compose | 1.29.0 | 2.x | V2 preferred |

## Dependency Versions (Cargo.toml)

```toml
[dependencies]
cosmwasm-std = "2.0.3"
cosmwasm-storage = "2.0.0"
cw-storage-plus = "2.0.0"
schemars = "0.8.16"
serde = { version = "1.0.195", default-features = false }
thiserror = "1.0.56"

[dev-dependencies]
cosmwasm-schema = "2.0.3"
cw-multi-test = "2.0.0"
```

## Upgrade Paths

### From wasmd v0.45.0 to v0.50.0

1. Update Go to 1.21+
2. Rebuild wasmd from source
3. Update contract dependencies to CosmWasm 2.0.x
4. Test contracts with new version
5. Migrate testnet data

### From CosmWasm 1.x to 2.0

1. Update Cargo.toml dependencies
2. Update contract code for API changes
3. Re-run tests
4. Re-optimize contracts
5. Redeploy

## Known Compatibility Issues

### Issue 1: Go 1.22 with wasmd v0.45.0

**Problem:** Build failures with Go 1.22+

**Solution:** Use Go 1.21.x or upgrade to wasmd v0.50.0

### Issue 2: cosmwasm-optimizer 0.15.x with cosmwasm-std 2.0

**Problem:** Optimization warnings

**Solution:** Upgrade to cosmwasm-optimizer 0.16.0

## Version Check Commands

```bash
# Check wasmd
wasmd version --long

# Check Rust
rustc --version

# Check Go
go version

# Check Docker
docker --version

# Check cosmwasm-check
cosmwasm-check --version
```

## Next Steps

- [Common Issues](./common-issues.md)
- [Debugging Guide](./debugging-guide.md)

---

*Last Updated: 2025-11-28*
