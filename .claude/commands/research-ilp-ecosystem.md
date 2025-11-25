# /research-ilp-ecosystem Task

When this command is used, execute the following task:

<!-- Powered by BMAD™ Core -->

# ILP Ecosystem Deep Research Task

This task executes comprehensive research into the Interledger Protocol ecosystem to support building a privacy-enhanced payment network using Nillion's nilCC infrastructure.

## Purpose

Conduct expert-level research into Dassie, Open Payments, Rafiki, and interledger.org-v4 to:

- Determine production readiness of each implementation
- Map ecosystem relationships and roles
- Evaluate fork suitability for nilCC/nilDB integration
- Provide actionable recommendations for implementation

## Research Output Structure

CRITICAL: All research outputs MUST be organized in the following folder structure:

```
docs/
└── research/
    └── ilp-ecosystem/
        ├── README.md                          # Research overview and navigation
        ├── executive-summary.md               # Key findings and recommendation
        ├── ecosystem-map.md                   # Visual diagram and relationships
        ├── projects/
        │   ├── rafiki-analysis.md             # Detailed Rafiki analysis
        │   ├── dassie-analysis.md             # Detailed Dassie analysis
        │   ├── open-payments-analysis.md      # Open Payments standard analysis
        │   └── interledger-org-analysis.md    # Website/ecosystem context
        ├── comparisons/
        │   ├── production-readiness.md        # Side-by-side readiness comparison
        │   ├── architecture-comparison.md     # Technical architecture comparison
        │   └── fork-decision-matrix.md        # Weighted decision analysis
        ├── nilcc-integration/
        │   ├── compatibility-analysis.md      # Docker Compose compatibility
        │   ├── privacy-enhancement-points.md  # TEE integration opportunities
        │   └── implementation-roadmap.md      # Phased implementation plan
        └── appendices/
            ├── glossary.md                    # ILP, Open Payments, Nillion terms
            ├── environment-variables.md       # Complete env var reference
            └── sources.md                     # All documentation sources used
```

## Research Execution Process

### Phase 1: Data Collection

CRITICAL: Use the MCP documentation servers for all primary research:

1. **Fetch base documentation from all projects**:
   - `mcp__dassie_Docs__fetch_dassie_documentation`
   - `mcp__rafiki_Docs__fetch_rafiki_documentation`
   - `mcp__open-payments_Docs__fetch_open_payments_documentation`
   - `mcp__interledger_org-v4_Docs__fetch_interledger_org_docs`

2. **Search for specific information**:
   - Use `mcp__*__search_*_documentation` for targeted queries
   - Use `mcp__*__search_*_code` for implementation details
   - Use `mcp__*__fetch_generic_url_content` for linked resources

3. **Document all sources** in `appendices/sources.md`

### Phase 2: Individual Project Analysis

For each project, create detailed analysis documents covering:

#### Rafiki Analysis (`projects/rafiki-analysis.md`)
- Version status and release history
- Architecture (Backend, Auth, Frontend services)
- Database requirements (PostgreSQL, Redis, TigerBeetle)
- Deployment options (Docker Compose, Helm/K8s)
- Production requirements checklist
- Regulatory compliance requirements
- Multi-tenancy capabilities
- Open Payments implementation
- Key strengths and limitations

#### Dassie Analysis (`projects/dassie-analysis.md`)
- Development status and maturity
- Architecture (monorepo, reactive actors)
- Peer-to-peer networking model
- Node discovery and membership
- Anti-Sybil mechanisms
- Internal ledger implementation
- Settlement methods
- Key strengths and limitations

#### Open Payments Analysis (`projects/open-payments-analysis.md`)
- API standard components (wallet address, resource, auth servers)
- GNAP authorization protocol
- Use cases supported
- Available SDKs
- Relationship to implementations
- Specification locations

#### Interledger.org Analysis (`projects/interledger-org-analysis.md`)
- Role in ecosystem (informational only)
- Protocol specifications hosted
- Educational resources available

### Phase 3: Comparative Analysis

#### Production Readiness (`comparisons/production-readiness.md`)

Create comparison table:

| Criterion | Rafiki | Dassie |
|-----------|--------|--------|
| Version Status | | |
| Documentation Quality | | |
| Community Support | | |
| Test Coverage | | |
| Deployment Options | | |
| Regulatory Compliance | | |
| Active Development | | |
| Production Deployments | | |

Rate each on 1-5 scale with justification.

#### Architecture Comparison (`comparisons/architecture-comparison.md`)

- Service architecture differences
- Database requirements
- Network communication patterns
- Security models
- Scalability approaches

#### Fork Decision Matrix (`comparisons/fork-decision-matrix.md`)

| Factor | Weight | Rafiki Score | Dassie Score | Notes |
|--------|--------|--------------|--------------|-------|
| Production readiness | 25% | | | |
| Docker Compose compatibility | 20% | | | |
| Privacy enhancement potential | 20% | | | |
| Fork/maintenance complexity | 15% | | | |
| Decentralization alignment | 10% | | | |
| Community/support | 10% | | | |

Calculate weighted totals and provide recommendation.

### Phase 4: nilCC Integration Analysis

#### Compatibility Analysis (`nilcc-integration/compatibility-analysis.md`)

For each project, analyze:

1. **Docker Compose Structure**
   - Current compose configuration
   - nilCC constraints (read-only root FS, LUKS encryption)
   - Required modifications

2. **Database Compatibility**
   - PostgreSQL within TEE
   - Redis within TEE
   - TigerBeetle performance in encrypted memory
   - nilDB replacement potential

3. **Network Requirements**
   - Port exposures needed
   - TLS/certificate handling
   - Caddy proxy compatibility

4. **Resource Requirements**
   - Memory needs
   - CPU requirements
   - Storage requirements

#### Privacy Enhancement Points (`nilcc-integration/privacy-enhancement-points.md`)

Identify and document:

1. **Key Management Operations**
   - Private key storage
   - Signing operations
   - Key derivation

2. **Transaction Processing**
   - Payment flow data
   - Balance calculations
   - Settlement operations

3. **Sensitive Data Storage**
   - User credentials
   - Wallet addresses
   - Transaction history

4. **Inter-node Communication**
   - Peer authentication
   - Packet encryption
   - Session management

For each, describe how TEE protection and attestation adds value.

#### Implementation Roadmap (`nilcc-integration/implementation-roadmap.md`)

**Phase 1: Proof of Concept (2-4 weeks)**
- Containerize chosen project for nilCC
- Validate basic functionality in TEE
- Test database operations
- Document issues and workarounds

**Phase 2: Privacy Enhancements (4-6 weeks)**
- Implement TEE-protected key management
- Add attestation verification
- Integrate sensitive operation protection
- Test cryptographic performance

**Phase 3: nilDB Integration (4-6 weeks)**
- Evaluate nilDB for primary storage
- Migrate database layer
- Validate data privacy guarantees
- Performance benchmarking

**Phase 4: Network Deployment (2-4 weeks)**
- Configure peering
- Select settlement mechanisms
- Operational monitoring setup
- Documentation and runbooks

### Phase 5: Final Deliverables

#### Executive Summary (`executive-summary.md`)

Must include:

1. **Recommendation**: Clear choice of Rafiki or Dassie with rationale
2. **Key Findings**: 5-7 critical insights from research
3. **Risk Assessment**: Top 3 risks with mitigations
4. **Effort Estimate**: Timeline and resource requirements
5. **Next Steps**: Immediate actions to begin implementation

#### Ecosystem Map (`ecosystem-map.md`)

Create visual representation showing:
- All four projects and their roles
- Data/protocol flows between components
- Where your implementation fits
- Integration points with existing ecosystem

Use Mermaid or ASCII diagrams.

#### README (`README.md`)

Navigation document with:
- Research objectives
- Document inventory with descriptions
- How to use the research
- Date completed
- Author/tool attribution

## Research Questions Checklist

Ensure all primary questions are answered:

- [ ] Is Rafiki production-ready? What specific gaps exist?
- [ ] Is Dassie production-ready? What prevents production use?
- [ ] How does each architecture map to nilCC's Docker Compose model?
- [ ] Which database requirements are compatible with nilCC?
- [ ] How do regulatory requirements affect a privacy-focused fork?
- [ ] Where do TEE guarantees add the most value?
- [ ] Which project is easier to fork and maintain?
- [ ] Can implementations interoperate on the ILP network?

## Success Criteria

Research is complete when:

1. All folder structure documents are created
2. All primary research questions are answered
3. Fork recommendation is clear and justified
4. Implementation roadmap is actionable
5. Executive summary provides decision-ready information
6. All sources are documented

## Important Notes

- Use MCP servers as primary information sources
- Fetch generic URLs for linked documentation
- Be objective about limitations of each project
- Consider both technical and regulatory factors
- Document assumptions and uncertainties
- Prioritize actionable insights over exhaustive coverage

## Execution

When this command is invoked:

1. Create the folder structure under `docs/research/ilp-ecosystem/`
2. Execute Phase 1-5 systematically
3. Use TodoWrite to track progress through phases
4. Generate all required documents
5. Present executive summary to user upon completion

ARGUMENTS: Any additional focus areas or constraints can be passed as arguments to narrow or expand the research scope.
