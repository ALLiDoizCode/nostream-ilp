# CosmWasm Local Testnet Setup Research

Comprehensive research and documentation for setting up a local CosmWasm testnet for AKT custody contract development.

**Research Date:** 2025-11-28
**Project:** Nostr-ILP Integration
**Status:** Complete

---

## Quick Links

- 📋 **[Executive Summary](./executive-summary.md)** - Start here for recommendations
- 🚀 **[Docker Setup Guide](./setup-guides/docker-setup.md)** - Recommended approach
- 📖 **[Native Setup Guide](./setup-guides/native-setup.md)** - Alternative approach
- 🔧 **[Prerequisites](./setup-guides/prerequisites.md)** - System requirements

---

## Table of Contents

### 1. Getting Started

#### Quick Start (15 Minutes)
```bash
# 1. Install Docker
brew install docker docker-compose  # macOS

# 2. Create directory
mkdir -p ~/cosmwasm-dev/testnet/docker && cd ~/cosmwasm-dev/testnet/docker

# 3. Download config
curl -O [docker-compose.yml URL]

# 4. Start testnet
docker-compose up -d

# 5. Verify
curl http://localhost:26657/status
```

**Next:** Deploy your first contract with [Contract Deployment Workflow](./workflows/contract-deployment.md)

#### Prerequisites
- [Prerequisites Guide](./setup-guides/prerequisites.md)
  - System requirements
  - Tool installation (Rust, Go, Docker)
  - Version compatibility
  - Validation checklist

---

### 2. Setup Guides

#### Recommended: Docker Compose
- [Docker Setup Guide](./setup-guides/docker-setup.md)
  - Single container approach
  - Docker Compose orchestration (recommended)
  - Multi-node setup
  - Volume management

#### Alternative: Native Binary
- [Native Setup Guide](./setup-guides/native-setup.md)
  - Build from source
  - Installation methods
  - Configuration
  - Systemd service setup

#### Token Configuration
- [Akash Token (AKT) Configuration](./setup-guides/akash-token-config.md)
  - Denomination setup (uakt)
  - Genesis modifications
  - Account initialization
  - Fee configuration

---

### 3. Development Workflows

#### Contract Lifecycle
- [Contract Deployment Workflow](./workflows/contract-deployment.md)
  - Compile → Optimize → Validate → Upload
  - Instantiate → Execute → Query → Migrate
  - Full examples and scripts

#### Testing
- [Testing Patterns](./workflows/testing-patterns.md)
  - Unit tests with cosmwasm-std mocks
  - Integration tests on local testnet
  - cw-multi-test framework
  - Test automation
  - Coverage analysis

#### Maintenance
- [Reset Procedures](./workflows/reset-procedures.md)
  - Fast reset (keep config)
  - Full reset (clean slate)
  - State export/import
  - Docker reset procedures

#### Automation
- [Automation Scripts](./workflows/automation-scripts.md)
  - init-testnet.sh
  - deploy-contract.sh
  - test-contract.sh
  - Complete working scripts

---

### 4. Troubleshooting

#### Common Issues
- [Common Issues and Solutions](./troubleshooting/common-issues.md)
  - 20+ common problems with solutions
  - Quick reference table
  - Pre-flight checklist
  - Getting help

#### Advanced Debugging
- [Debugging Guide](./troubleshooting/debugging-guide.md)
  - Log analysis
  - Transaction debugging
  - State inspection
  - Network debugging
  - Performance profiling

#### Compatibility
- [Version Compatibility Matrix](./troubleshooting/version-compatibility.md)
  - wasmd, CosmWasm, Cosmos SDK versions
  - Tool compatibility
  - Akash Network alignment
  - Upgrade paths

---

### 5. Decision Framework

#### Approach Comparison
- [Approach Comparison: Native vs Docker](./comparisons/approach-comparison.md)
  - Detailed analysis of all approaches
  - Pros/cons for each
  - Scenario-based recommendations
  - Performance comparison

#### Decision Matrix
- [Decision Matrix](./comparisons/decision-matrix.md)
  - Weighted scoring framework
  - Criteria evaluation
  - Final recommendation: Docker Compose ⭐
  - Risk assessment

---

### 6. Reference Material

#### Glossary
- [Glossary](./appendices/glossary.md)
  - 80+ terms defined
  - CosmWasm terminology
  - Cosmos SDK concepts
  - Akash Network terms
  - Development abbreviations

#### Command Reference
- [wasmd Command Reference](./appendices/command-reference.md)
  - Complete CLI commands
  - Organized by category
  - Examples for each command
  - Common flag combinations

#### Sources
- [Documentation Sources](./appendices/sources.md)
  - All references used
  - Official documentation
  - Tool documentation
  - Community resources
  - Version-specific guides

---

## Key Recommendations

### Primary Approach: Docker Compose ⭐

**Why Docker Compose?**
- ✅ Highest scored approach (4.45/5.0)
- ✅ Best for team collaboration
- ✅ Production parity with Akash Network
- ✅ Easy service orchestration
- ✅ Low maintenance overhead

**When to use alternatives:**
- **Native Binary:** Deep debugging, solo development, learning internals
- **Docker Single:** CI/CD pipelines, quick experiments

### Workflow Summary

```
┌─────────────────────────────────────────────┐
│ 1. Setup (15 min)                           │
│    Docker Compose → docker-compose up -d    │
└─────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────┐
│ 2. Development Loop (per iteration)         │
│    Compile → Optimize → Deploy → Test       │
│    (2-5 min with automation)                │
└─────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────┐
│ 3. Testing (continuous)                     │
│    Unit tests + Integration tests           │
│    (automated via scripts)                  │
└─────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────┐
│ 4. Production (week 9+)                     │
│    Security audit → Mainnet deployment      │
└─────────────────────────────────────────────┘
```

---

## Document Structure

```
docs/research/cosmwasm-testnet/
├── README.md (this file)
├── executive-summary.md
│
├── setup-guides/
│   ├── prerequisites.md
│   ├── docker-setup.md
│   ├── native-setup.md
│   └── akash-token-config.md
│
├── workflows/
│   ├── contract-deployment.md
│   ├── testing-patterns.md
│   ├── reset-procedures.md
│   └── automation-scripts.md
│
├── troubleshooting/
│   ├── common-issues.md
│   ├── debugging-guide.md
│   └── version-compatibility.md
│
├── comparisons/
│   ├── approach-comparison.md
│   └── decision-matrix.md
│
└── appendices/
    ├── glossary.md
    ├── command-reference.md
    └── sources.md
```

---

## How to Use This Research

### For New Team Members

1. **Start with [Executive Summary](./executive-summary.md)**
   - Understand the recommendation
   - Review quick start steps

2. **Install prerequisites**
   - Follow [Prerequisites Guide](./setup-guides/prerequisites.md)
   - Verify installation

3. **Setup testnet**
   - Use [Docker Setup Guide](./setup-guides/docker-setup.md)
   - Verify with test transaction

4. **Deploy first contract**
   - Follow [Contract Deployment Workflow](./workflows/contract-deployment.md)
   - Run automated tests

5. **Bookmark troubleshooting**
   - Keep [Common Issues](./troubleshooting/common-issues.md) handy
   - Review [Debugging Guide](./troubleshooting/debugging-guide.md)

**Estimated Time:** 1-2 hours from zero to deployed contract

---

### For Project Leads

1. **Review decision framework**
   - Read [Approach Comparison](./comparisons/approach-comparison.md)
   - Understand [Decision Matrix](./comparisons/decision-matrix.md)

2. **Plan rollout**
   - Use [Executive Summary](./executive-summary.md) roadmap
   - Assign team members to setup

3. **Establish workflows**
   - Implement [Automation Scripts](./workflows/automation-scripts.md)
   - Set up [Testing Patterns](./workflows/testing-patterns.md)

4. **Monitor progress**
   - Track success metrics from Executive Summary
   - Address issues using [Troubleshooting](./troubleshooting/) guides

---

### For Solo Developers

1. **Choose approach**
   - Docker Compose for production-like testing
   - Native Binary for deep debugging

2. **Quick setup**
   - Follow relevant setup guide (15-45 min)
   - Verify with curl commands

3. **Development cycle**
   - Use [Contract Deployment](./workflows/contract-deployment.md)
   - Implement [Testing Patterns](./workflows/testing-patterns.md)

4. **Reference as needed**
   - [Command Reference](./appendices/command-reference.md) for CLI
   - [Glossary](./appendices/glossary.md) for terminology

---

## Version Information

- **wasmd:** v0.50.0
- **CosmWasm:** 2.0.x
- **Cosmos SDK:** v0.50.x
- **Go:** 1.21.6
- **Rust:** 1.75.0
- **Docker:** 24.0.7
- **Docker Compose:** v2.23.3

See [Version Compatibility](./troubleshooting/version-compatibility.md) for full matrix.

---

## Success Criteria

### Week 1
- [ ] All team members complete setup (< 30 min each)
- [ ] Deploy test contract successfully
- [ ] Run integration test suite
- [ ] Zero environment inconsistency issues

### Month 1
- [ ] Average deployment time < 5 minutes
- [ ] Test coverage > 80%
- [ ] Zero production deployment failures
- [ ] Team satisfaction > 4/5

### Project Completion
- [ ] All contracts deployed to mainnet
- [ ] Comprehensive documentation
- [ ] Security audit passed
- [ ] Zero critical bugs in production

---

## Contributing

This research is part of the Nostr-ILP integration project.

**To update:**
1. Make changes to relevant markdown files
2. Update version dates
3. Validate all links
4. Test commands on fresh environment
5. Commit with descriptive message

---

## Support

**Internal:**
- Check [Common Issues](./troubleshooting/common-issues.md) first
- Review [Debugging Guide](./troubleshooting/debugging-guide.md)
- Consult [Command Reference](./appendices/command-reference.md)

**External:**
- CosmWasm Discord: https://discord.gg/cosmwasm
- Cosmos Forum: https://forum.cosmos.network
- GitHub Issues: https://github.com/CosmWasm/wasmd/issues

---

## License

This research documentation is part of the nostr-ilp project.

---

## Changelog

### 2025-11-28 - Initial Release
- Complete research and documentation
- All 16 files created
- Decision matrix completed
- Executive summary finalized
- Docker Compose recommended as primary approach

---

**Last Updated:** 2025-11-28
**Status:** Complete
**Recommendation:** Docker Compose
**Confidence:** 95%

---

*Navigate to the [Executive Summary](./executive-summary.md) to begin your CosmWasm local testnet journey.*
