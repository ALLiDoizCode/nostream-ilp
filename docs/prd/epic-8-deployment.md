# Epic 8: Akash Network Deployment

**Goal:** Package the complete peer node (Dassie + BTP-NIPs + Storage + UI) as Docker containers and deploy to Akash Network decentralized cloud.

**Timeline:** 1 week
**Output:** Peer node running on Akash, publicly accessible, ready for network participation

---

## Story 8.1: Containerize Peer Node

**As a** peer operator,
**I want** Docker containers for all components,
**so that** I can deploy to Akash.

**Acceptance Criteria:**
1. Create Dockerfile for Dassie + BTP-NIPs:
   - Base: node:22-alpine
   - Install dependencies
   - Build TypeScript
   - Run Dassie with BTP-NIPs modules
2. Create Dockerfile for PostgreSQL:
   - Base: postgres:16-alpine
   - Initialize schema (events table, indexes)
3. Create docker-compose.yml for local testing
4. Environment configuration via .env
5. Health check endpoints for both containers
6. Tests: docker-compose up → verify all services running

**Dependencies:**
- Epic 5-7 complete

**Outputs:**
- Dockerfiles
- docker-compose.yml
- Local testing validated

---

## Story 8.2: Create Akash SDL

**As a** peer operator,
**I want** Akash SDL deployment manifest,
**so that** I can deploy to Akash Network.

**Acceptance Criteria:**
1. Create deploy.yaml (Akash SDL)
2. Two services: dassie, postgres
3. Expose ports: 443 (HTTPS), 8080 (UI)
4. Resource allocation: 1 CPU, 2GB RAM, 10GB storage
5. Estimated cost: <$5/month
6. Tests: Deploy to Akash testnet

**Dependencies:**
- Story 8.1 complete

**Outputs:**
- Akash SDL file
- Deployment documentation

---

## Story 8.3: Deploy to Akash Mainnet

**As a** peer operator,
**I want** production deployment on Akash,
**so that** my peer node is publicly accessible.

**Acceptance Criteria:**
1. Deploy to Akash mainnet
2. Get public URL
3. Verify HTTPS access
4. Run connectivity tests
5. Document deployment process

**Dependencies:**
- Story 8.2 complete

**Outputs:**
- Production peer node on Akash
- Public endpoint
- Deployment runbook

---
