# Epic 5: Akash Deployment & SDL

**Goal:** Containerize both applications (Nostream + Dassie), create Akash SDL for 2-service deployment, deploy to Akash mainnet, and validate real-world hosting costs. This epic proves the system runs on decentralized infrastructure at sustainable cost.

## Story 5.1: Create Nostream Dockerfile

**As a** developer,
**I want** a production Dockerfile for Nostream,
**so that** it can be deployed to Akash.

**Acceptance Criteria:**
1. Dockerfile created: `Dockerfile` in nostream-ilp repo
2. Multi-stage build: Build stage + production stage
3. Build stage: Compiles TypeScript, runs `npm run build`
4. Production stage: Node.js 22 slim, production dependencies only
5. PostgreSQL and Redis run as embedded services OR as sidecars (decide)
6. Non-root user for security
7. Health check: `HEALTHCHECK CMD curl -f http://localhost:7777/health || exit 1`
8. Image size < 500MB
9. Container starts: `docker run -p 7777:7777 nostream-ilp`
10. Automated build via GitHub Actions

## Story 5.2: Create Dassie Dockerfile

**As a** developer,
**I want** a production Dockerfile for Dassie,
**so that** it can be deployed to Akash.

**Acceptance Criteria:**
1. Dockerfile created: `Dockerfile` in Dassie repo (or use existing if available)
2. Multi-stage build (TypeScript compilation)
3. Production stage: Node.js 22 slim
4. SQLite support (better-sqlite3 compiles in container)
5. Non-root user
6. Health check: `HEALTHCHECK CMD curl -f http://localhost:7768/health || exit 1`
7. Image size < 300MB
8. Container starts: `docker run -p 7768:7768 -p 443:443 dassie-node`

## Story 5.3: Create Akash SDL with 2-Service Configuration

**As a** developer,
**I want** an Akash SDL deploying both Nostream and Dassie,
**so that** the complete system runs on Akash.

**Acceptance Criteria:**
1. SDL file created: `deploy/akash/deploy.yaml`
2. Defines 2 services: nostream, dassie (see Technical Assumptions for full SDL)
3. Services communicate via localhost (both in same deployment group)
4. Nostream exposed on port 80 (global)
5. Dassie ILP connector exposed on port 443 (global)
6. Dassie API port 7768 internal only (not exposed globally)
7. Resource profiles: 0.5 CPU, 1-1.5Gi RAM, 20-50Gi storage per service
8. Pricing: ~500 uakt total (~$2.50-5/month target)
9. Persistent storage attributes configured
10. SDL validates: `akash deployment validate deploy.yaml`

## Story 5.4: Create Docker Compose for Local Testing

**As a** developer,
**I want** Docker Compose configuration simulating Akash deployment,
**so that** I can test locally before deploying.

**Acceptance Criteria:**
1. `docker-compose.yml` created in project root
2. Defines same 2 services as Akash SDL
3. Uses localhost networking (simulates Akash)
4. Persistent volumes for databases
5. Environment variables from `.env.example`
6. `docker compose up` starts both services
7. Health checks pass for both containers
8. Nostream and Dassie communicate successfully
9. Can test full payment flow locally

## Story 5.5: Deploy to Akash Testnet

**As a** developer,
**I want** to deploy to Akash testnet,
**so that** I can validate SDL and deployment process.

**Acceptance Criteria:**
1. Docker images built and pushed to registry (GHCR or Docker Hub)
2. Akash wallet created with testnet AKT
3. SDL deployed via Akash CLI or Console
4. Deployment succeeds, both containers start
5. Health checks accessible from internet
6. Nostr client can connect to relay's WebSocket URL
7. Dassie ILP node peerable from external ILP nodes
8. Deployment runs stable for 48 hours
9. Documentation: `docs/deployment/akash-testnet.md`

## Story 5.6: Deploy to Akash Mainnet

**As a** developer,
**I want** to deploy to Akash mainnet,
**so that** I can validate real-world costs and sustainability.

**Acceptance Criteria:**
1. Production images built with mainnet configurations
2. SDL updated for mainnet (production URLs, mainnet RPC endpoints)
3. Akash wallet funded with AKT for deployment (~100 AKT for 3-month buffer)
4. Deployment created on Akash mainnet
5. Provider selected (cheapest with good reputation)
6. Both containers accessible via public URLs
7. DNS configured (optional): nostr.example.com, ilp.example.com
8. Deployment stable for 7 days
9. **Actual costs measured**: Document real Akash charges per day/week
10. Documentation: `docs/deployment/akash-mainnet.md`

## Story 5.7: Implement Akash Cost Monitoring

**As a** developer,
**I want** automatic tracking of Akash hosting costs,
**so that** economic monitor has accurate expense data.

**Acceptance Criteria:**
1. Economic monitor queries Akash for current costs (if API available)
2. If no API, uses configured estimate: `AKASH_DAILY_COST_AKT`
3. After mainnet deployment, update estimate based on real costs
4. Costs stored in economic_snapshots table
5. Dashboard shows: Estimated vs. actual costs (if available)
6. Integration test with Akash provider (mock or real)

## Story 5.8: Create Deployment Automation Script

**As an** operator,
**I want** a script automating deployment to Akash,
**so that** I can deploy easily.

**Acceptance Criteria:**
1. Script created: `scripts/deploy-to-akash.sh`
2. Automates:
   - Build Docker images
   - Push to registry
   - Generate SDL from template
   - Deploy to Akash via CLI
3. Arguments: `--network testnet|mainnet`, `--profile small|medium`
4. Validates prerequisites (Docker, Akash CLI, funded wallet)
5. Outputs deployment URL and lease ID
6. Error handling with clear messages
7. Documentation: `docs/deployment/automated-deployment.md`

---
