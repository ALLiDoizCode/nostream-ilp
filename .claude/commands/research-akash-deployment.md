# Research Akash Deployment Command

## Command Name
`/BMad:research-akash-deployment`

## Description
Execute comprehensive research to solve programmatic deployment issues with Akash Network mainnet.

## Usage
```
/BMad:research-akash-deployment
```

## Research Prompt

When this command is invoked, execute the following research:

---

# Research Prompt: Solving Programmatic Deployment for Akash Network

## Research Objective

Identify and validate working methods for programmatic deployment to Akash Network mainnet, specifically solving gRPC/CLI compatibility issues and providing a reliable deployment path for the nostream-ilp peer node project.

## Background Context

**Project:** Nostream-ILP (Nostr relay with ILP payment integration)
**Goal:** Deploy to Akash Network mainnet programmatically (Story 8.3)
**Current Status:**
- Wallet funded with 10 AKT on mainnet (akash10ah0ah4mqx5trfcyux5ygtgayfgp3aksfeqwrc)
- SDL file prepared (minimal Nostr relay deployment)
- Environment variables configured
- Both deployment tools failing

**Technical Environment:**
- Node.js 22.x, TypeScript 5.9.3, pnpm
- @akashnetwork/chain-sdk@1.0.0-alpha.0
- Akash CLI v1.1.1
- macOS development environment

**Failed Approaches:**
1. Akash CLI: Certificate PEM file errors with all RPC endpoints
2. Akash SDK: gRPC protocol errors ("missing status", "wrong version number")
3. Tried endpoints: rpc.akash.network (DNS fail), rpc.akashnet.net (gRPC protocol error), akash-rpc.polkachu.com + akash-grpc.polkachu.com:12890 (SSL error, invalid URL)

## Research Questions

### Primary Questions (Must Answer)

1. **What are the currently working programmatic deployment methods for Akash Network mainnet as of December 2025?**
   - Which SDK versions are stable and production-ready?
   - Are there alternative CLIs or tools beyond the official akash CLI?
   - What are the known compatibility issues with current tooling?

2. **What are the correct gRPC/RPC endpoint configurations for Akash mainnet that work with programmatic tools?**
   - Which public endpoints support the required gRPC protocols?
   - Are there specific protocol versions or configurations needed?
   - Do endpoints require authentication or special headers?

3. **How do successful Akash projects handle programmatic deployments?**
   - What tooling do they use?
   - What are their endpoint configurations?
   - Are there working code examples or templates?

4. **What is the root cause of the @akashnetwork/chain-sdk alpha gRPC errors?**
   - Is it a known SDK bug?
   - Is it endpoint incompatibility?
   - Is there a configuration fix or workaround?

5. **What is the root cause of the Akash CLI certificate PEM errors?**
   - Is this a CLI version issue?
   - Is it a configuration problem?
   - Is there a fix or workaround?

### Secondary Questions (Nice to Have)

1. When is @akashnetwork/chain-sdk expected to reach stable (non-alpha) release?
2. Are there TypeScript/JavaScript alternatives to the official SDK?
3. What are the trade-offs between different deployment approaches?
4. Can the Akash Console web UI be automated via browser automation?
5. Are there Docker-based CLI tools that might work better?
6. What debugging tools exist for diagnosing Akash deployment issues?

## Research Methodology

### Information Sources (Priority Order)

1. **Official Akash Documentation (2024-2025)**
   - https://docs.akash.network
   - Deployment guides and tutorials
   - SDK/CLI documentation
   - Troubleshooting guides

2. **Akash GitHub Repositories**
   - https://github.com/akash-network/node
   - https://github.com/akash-network/console
   - https://github.com/akash-network/awesome-akash
   - Issue trackers for known bugs
   - Example deployment scripts

3. **Akash Community Resources**
   - Discord server discussions
   - Forum posts about deployment issues
   - Community-maintained tools and scripts

4. **Working Project Examples**
   - Open-source projects deployed on Akash
   - Their deployment automation code
   - CI/CD configurations

5. **Alternative Tooling**
   - Akashlytics Deploy (desktop app)
   - Cloudmos Deploy (successor to Akashlytics)
   - Third-party SDKs or libraries

### Analysis Frameworks

**Tool Evaluation Criteria:**
- Production-readiness (stable, not alpha/beta)
- Node.js/TypeScript compatibility
- Programmatic automation capability
- Maintenance status and community support
- Documentation quality

**Solution Validation:**
- Can it create deployments on mainnet?
- Does it handle wallet signing programmatically?
- Does it support SDL file deployment?
- Can it query deployment status and logs?

### Data Requirements

- Information must be current (2024-2025, not outdated 2021-2022 guides)
- Code examples must be working and tested
- Endpoint configurations must be verified as active
- Version compatibility must be explicit

## Expected Deliverables

### Executive Summary

- **Working Solution:** Specific tool/method that will work (tool name, version, configuration)
- **Implementation Steps:** High-level steps to implement the working solution
- **Time Estimate:** How long to implement (hours/days)
- **Risk Assessment:** Likelihood of success, potential blockers

### Detailed Analysis

#### Section 1: Current Tooling Landscape
- Official Akash SDK status and known issues
- Official Akash CLI status and known issues
- SDK/CLI version compatibility matrix
- Public endpoint status and compatibility

#### Section 2: Working Solutions
For each viable solution:
- **Tool/Method Name**
- **Stability/Maturity Level**
- **Installation Steps**
- **Configuration Requirements**
- **Example Code/Commands**
- **Known Limitations**
- **Maintenance/Support Status**

#### Section 3: Root Cause Analysis
- Why the current approaches are failing
- Whether fixes are planned/available
- Workarounds for current tools

#### Section 4: Recommended Approach
- Primary recommendation with justification
- Fallback options
- Implementation roadmap
- Testing strategy

### Supporting Materials

- **Endpoint Configuration Table:**
  | Endpoint | Protocol | Port | Compatible Tools | Status |
  |----------|----------|------|------------------|--------|

- **Tool Comparison Matrix:**
  | Tool | Version | Stability | TS Support | Automation | Docs |
  |------|---------|-----------|------------|------------|------|

- **Code Examples:**
  - Working deployment script snippets
  - Configuration file examples
  - Error handling patterns

- **Source Links:**
  - All referenced documentation URLs
  - GitHub repositories
  - Community discussions

## Success Criteria

Research is successful if it provides:

1. ✅ At least ONE verified working method for programmatic Akash mainnet deployment
2. ✅ Clear implementation steps that can be followed immediately
3. ✅ Working code examples or command sequences
4. ✅ Root cause explanation for current failures
5. ✅ Confidence level ≥80% that recommended solution will work

## Timeline and Priority

- **Priority:** CRITICAL (blocking Story 8.3 completion)
- **Desired Timeframe:** Solution needed within 1-2 hours for story completion
- **Acceptable Scope:** Can narrow to "quickest working solution" vs. "best long-term solution"

## Additional Context

**What we've tried:**
- SDK endpoints: rpc.akash.network (DNS fail), rpc.akashnet.net (gRPC protocol error), akash-rpc.polkachu.com + akash-grpc.polkachu.com:12890 (SSL error, invalid URL)
- CLI endpoints: rpc.akash.network, akash-rpc.polkachu.com (certificate PEM error)

**What we haven't tried:**
- Cloudmos Deploy CLI (if it exists)
- Docker-based Akash CLI
- Direct RPC/gRPC calls without SDK wrapper
- Alternative JavaScript/TypeScript Cosmos SDKs (CosmJS directly)
- Browser automation of Akash Console

**Constraints:**
- Must be scriptable/automatable (not manual GUI)
- Prefer TypeScript/Node.js ecosystem
- Must work on macOS development environment
- Must support mainnet (not just testnet/sandbox)

---

## Execution Instructions

When this command is run:

1. Use the Task tool with `subagent_type: general-purpose`
2. Provide the full research prompt above
3. Request the agent to:
   - Search web for current Akash deployment solutions
   - Check GitHub for working examples
   - Analyze root causes of failures
   - Provide actionable recommendations
4. Present findings to user in structured format matching deliverables spec

## Output Format

Present research findings with:
- Executive summary at top
- Detailed sections as specified
- Supporting tables and code examples
- Clear next steps for implementation
