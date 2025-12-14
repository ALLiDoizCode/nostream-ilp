# Research Akash Alternatives Command

## Command Name
`/BMad:research-akash-alternatives`

## Description
Execute comprehensive research to identify and evaluate token-based containerized hosting alternatives to Akash Network that support permissionless deployment with keypair-only authentication.

## Usage
```
/BMad:research-akash-alternatives
```

## Research Prompt

When this command is invoked, execute the following research:

---

# Research Prompt: Token-Based Containerized Hosting Alternatives to Akash Network

## Research Objective

Identify and evaluate decentralized/permissionless hosting platforms that enable containerized application deployment with token-based payments and keypair-only authentication (no traditional account setup, KYC, or credit cards). The goal is to find viable alternatives to Akash Network that maintain similar permissionless characteristics while potentially offering better pricing, developer experience, or features.

## Background Context

**Current Baseline:** Akash Network
- Decentralized compute marketplace
- Kubernetes-based container orchestration
- Token payments (AKT) with no KYC
- Keypair-only authentication
- SDL (Stack Definition Language) for deployment configuration

**Use Case:** Deploying containerized applications (e.g., Nostr relay, web services, APIs) with the following priorities:
- No traditional account setup (email, phone, KYC)
- Token-based payments (any cryptocurrency/token acceptable)
- Support for standard containerized workloads (Docker/K8s)
- Production-ready reliability and performance

## Research Questions

### Primary Questions (Must Answer)

1. **What platforms exist that support containerized deployments with token payments and no account setup beyond keypairs?**
   - Which platforms are production-ready vs. experimental?
   - What is their current network size and activity level?

2. **How does each platform's deployment workflow compare to Akash?**
   - CLI tools, SDKs, or web interfaces available?
   - Complexity of SDL/manifest configuration?
   - Time from keypair generation to running container?

3. **What token payment mechanisms does each platform support?**
   - Which cryptocurrencies/tokens accepted?
   - Payment timing: upfront, streaming, post-paid?
   - Gas fees and transaction costs?
   - Payment channel or L2 support for micropayments?

4. **What are the pricing models and cost comparisons?**
   - Per-hour compute costs vs. Akash vs. AWS/GCP?
   - Storage and bandwidth pricing?
   - Minimum deposits or lock-up requirements?

5. **What are the technical limitations and trade-offs?**
   - Container orchestration capabilities (K8s compatibility)?
   - Resource limits (CPU, RAM, storage)?
   - Networking features (load balancing, DNS, SSL)?
   - Persistent storage options?

### Secondary Questions (Nice to Have)

6. **What is the ecosystem maturity and community health?**
   - Developer activity and documentation quality?
   - Community size and support channels?
   - Recent funding or development milestones?

7. **What are the privacy and security characteristics?**
   - Level of anonymity provided?
   - Data encryption at rest/in transit?
   - Provider reputation systems?

8. **What are the geographic distribution and redundancy options?**
   - Provider locations and distribution?
   - Multi-region deployment capabilities?
   - Failover and high-availability features?

9. **How compatible are they with ILP/streaming payment integration?**
   - Could they integrate with custom payment flows (e.g., Interledger Protocol)?
   - API hooks for programmatic payment handling?

## Research Methodology

### Information Sources

**Primary Sources (Prioritize These):**
- Official platform documentation and whitepapers
- GitHub repositories (code activity, issues, PRs)
- Platform testnets/mainnets (hands-on testing where possible)
- Official pricing pages and deployment guides

**Secondary Sources:**
- Reddit (r/decentralized, r/cryptocurrency, r/selfhosted)
- Twitter/X (official accounts, developer communities)
- Discord/Telegram community channels
- Blog posts and case studies from actual users

**Technical Evaluation Sources:**
- Deploy a test container if possible (simple nginx or hello-world)
- Review SDK/CLI documentation
- Check blockchain explorers for transaction activity
- Analyze token economics and payment flows

**Comparison Sources:**
- Web3 infrastructure comparison sites
- "Awesome" lists (awesome-web3, awesome-decentralized)
- Crypto infrastructure podcasts/videos
- Developer experience reviews

### Analysis Frameworks

**Platform Viability Matrix:**
Evaluate each platform on:
- **Production Readiness**: Mainnet status, uptime, bug reports
- **Economic Activity**: Transaction volume, active providers, deployments
- **Developer Experience**: Documentation quality, tooling, support
- **Cost Competitiveness**: Price per resource unit vs. benchmarks

**Feature Comparison Grid:**
Create a side-by-side comparison table:

| Feature | Akash | Platform A | Platform B | Platform C |
|---------|-------|------------|------------|------------|
| Keypair-only auth | ✓ | ? | ? | ? |
| Token payment | AKT | ? | ? | ? |
| Container support | Docker/K8s | ? | ? | ? |
| Deployment time | ~5min | ? | ? | ? |
| Min. cost/month | $X | ? | ? | ? |
| Persistent storage | ✓ | ? | ? | ? |
| Load balancing | ✓ | ? | ? | ? |
| Custom domains | ✓ | ? | ? | ? |

**Risk Assessment Framework:**
- **Technical Risk**: Platform maturity, bug history, security audits
- **Economic Risk**: Token volatility, provider incentives, sustainability
- **Vendor Lock-in**: Migration difficulty, proprietary formats
- **Regulatory Risk**: Legal status, compliance requirements

### Data Quality Requirements

- **Recency**: Information from last 6 months preferred (crypto moves fast)
- **Credibility**: Verify claims with multiple sources; prefer primary sources
- **Completeness**: Flag gaps where information is unavailable or unclear
- **Objectivity**: Note any potential biases in sources (sponsored content, competitors)

## Expected Deliverables

### 1. Executive Summary (1-2 pages)

**Must Include:**
- Top 3 recommended alternatives with brief rationale
- Key differentiators vs. Akash Network
- Critical decision factors (price, ease of use, token support)
- Immediate next steps for evaluation/testing
- Red flags or disqualifying factors for any platforms examined

### 2. Detailed Platform Analysis

**For Each Platform (minimum 3-5 platforms):**

**Platform Overview**
- Name, founding year, team/organization
- Current status (testnet/mainnet, version)
- Network statistics (providers, deployments, uptime)
- Links to official resources

**Deployment Experience**
- Authentication method (keypair generation process)
- CLI/SDK tools available
- Container deployment workflow (step-by-step if available)
- Configuration format (SDL/YAML/JSON examples)
- Estimated time to first deployment

**Token Payment Details**
- Accepted tokens/cryptocurrencies
- Payment flow (upfront deposit, streaming, escrow, post-paid)
- Gas fees and transaction costs
- Minimum deposit requirements
- Refund/withdrawal process
- Payment flexibility (top-up, auto-renewal, etc.)

**Pricing Analysis**
- Cost per vCPU/hour
- Cost per GB RAM/hour
- Storage costs (persistent volumes)
- Bandwidth costs (ingress/egress)
- Real-world cost example: 2 vCPU, 4GB RAM, 100GB storage, 1TB bandwidth/month
- Comparison to Akash and AWS/GCP equivalent

**Technical Capabilities**
- Container orchestration (Docker, Kubernetes, other)
- Resource limits and quotas
- Networking (public IP, load balancing, DNS, IPv6)
- Persistent storage options (volume types, IOPS)
- Monitoring and logging capabilities
- SSL/TLS certificate management
- Environment variables and secrets management
- Multi-container deployments

**Strengths & Weaknesses**
- What this platform does better than Akash
- What it does worse or lacks compared to Akash
- Unique features or differentiators
- Notable limitations or missing features

**Risk Assessment**
- Platform maturity concerns
- Economic sustainability questions (token economics, provider incentives)
- Community/development activity level
- Known issues, outages, or controversies
- Long-term viability indicators

### 3. Comparison Matrix

**Comprehensive Side-by-Side Table:**

Compare all platforms across:
- Authentication method
- Supported tokens (list)
- Pricing (standardized 2vCPU/4GB workload)
- Deployment complexity (1-5 scale, with explanation)
- Feature completeness (1-5 scale)
- Production readiness (1-5 scale)
- Documentation quality (1-5 scale)
- Community size (GitHub stars, Discord/Telegram members)
- Last update/commit date
- Geographic provider distribution

### 4. Platform-Specific Deployment Guides

**For Top 2-3 Candidates:**
- Prerequisites (wallet setup, token acquisition)
- Step-by-step quickstart guide
- Example deployment manifest (nginx or hello-world)
- Common troubleshooting tips
- Links to official documentation
- Estimated time and cost for test deployment

### 5. ILP Integration Assessment

**For Each Platform:**
- API capabilities for custom payment flows
- Potential for ILP/streaming payment integration
- Webhooks or callbacks for payment events
- Smart contract integration possibilities
- Programmatic billing/metering options

### 6. Supporting Materials

**Required:**
- Source links for all pricing and feature claims
- Date information was last verified
- Token price references used for cost calculations
- Community health metrics with sources

**Optional (if available):**
- Screenshots of CLI/UI workflows
- Hands-on testing notes
- Video walkthroughs
- Quotes from community members or case studies
- Roadmap items that could affect evaluation

## Success Criteria

This research will be considered successful if it delivers:

1. ✅ **Comprehensive Coverage**: At least 3-5 viable alternatives identified and analyzed
2. ✅ **Actionable Comparison**: Clear feature and pricing comparison matrix
3. ✅ **Decision Support**: Enough information to choose top 2-3 platforms for hands-on testing
4. ✅ **Practical Guidance**: Deployment guides for recommended platforms
5. ✅ **Risk Awareness**: Clear documentation of limitations, risks, and trade-offs
6. ✅ **Verified Information**: All claims backed by sources with recency dates

**Research will fail if:**
- ❌ Only 1-2 alternatives found (insufficient options)
- ❌ Pricing information unavailable or unverified
- ❌ Platforms require KYC or traditional account setup
- ❌ No production-ready alternatives exist

## Timeline and Priority

**Priority:** High - needed for deployment planning decisions

**Suggested Approach:**
- **Phase 1** (Quick scan): Identify candidate platforms (1-2 hours)
- **Phase 2** (Deep dive): Analyze top 5-7 candidates (4-6 hours)
- **Phase 3** (Synthesis): Create comparison matrix and recommendations (2-3 hours)
- **Phase 4** (Optional): Hands-on testing of top 2-3 (variable time)

**Key Platforms to Investigate** (starting points, not exhaustive):
- Flux (Flux Network)
- Golem Network
- iExec
- Cudos Network
- Phala Network
- Aleph.im
- [Any others discovered during research]

---

## Execution Instructions

When this command is run:

1. Use the Task tool with `subagent_type: general-purpose`
2. Provide the full research prompt above
3. Request the agent to:
   - Search web for token-based containerized hosting platforms
   - Evaluate alternatives to Akash Network
   - Create comprehensive comparison matrix
   - Provide actionable recommendations
4. Present findings to user in structured format matching deliverables spec

## Output Format

Present research findings with:
- Executive summary at top
- Detailed platform analysis for each candidate
- Comparison matrix table
- Deployment guides for top platforms
- Clear next steps for evaluation/testing
