# Threat Model: Autonomous Agent Relay Networks

**Research Document**
**Author:** Claude Code (AI Research Assistant)
**Date:** 2025-12-05
**Status:** Phase 1 - Security & Privacy Research
**Version:** 1.0.0

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Threat Actors](#threat-actors)
3. [Attack Surface Analysis](#attack-surface-analysis)
4. [Attack Scenarios](#attack-scenarios)
5. [Threat Severity Matrix](#threat-severity-matrix)
6. [Security Requirements](#security-requirements)
7. [Threat Mitigation Strategies](#threat-mitigation-strategies)
8. [Residual Risks](#residual-risks)

---

## Executive Summary

**Key Findings:**

Autonomous agent relay networks using BTP-NIPs protocol face unique security challenges due to:
1. **Autonomous Operation**: No human oversight enables persistent attacks
2. **Economic Incentives**: Profit motives create adversarial dynamics
3. **Network Scale**: 1000+ peers increases attack surface exponentially
4. **Multi-Chain Complexity**: Payment channels across Base, Cronos, Arbitrum create diverse exploit vectors

**Threat Landscape Overview:**

| Threat Category | Severity | Likelihood | Impact | Priority |
|----------------|----------|------------|--------|----------|
| Sybil Attacks | CRITICAL | HIGH | HIGH | P0 |
| Payment Channel Exploits | CRITICAL | MEDIUM | CRITICAL | P0 |
| Censorship Attacks | HIGH | MEDIUM | HIGH | P1 |
| DoS/DDoS | HIGH | HIGH | MEDIUM | P1 |
| Privacy Leaks | MEDIUM | HIGH | MEDIUM | P2 |
| Key Compromise | CRITICAL | LOW | CRITICAL | P0 |
| Smart Contract Bugs | HIGH | MEDIUM | HIGH | P1 |

**Overall Risk Assessment:** 🔴 **HIGH RISK** (requires comprehensive mitigation)

The network's autonomous and economic nature creates a fertile environment for sophisticated attacks. Critical mitigations (proof-of-payment, reputation systems, cryptographic guarantees) MUST be implemented before mainnet launch.

---

## Threat Actors

### 1. Malicious Users

**Profile:**
- Individual or small group attempting to exploit the network
- Motivated by financial gain or disruption
- Limited resources compared to network scale

**Capabilities:**
- Create fake Nostr identities
- Send malicious events
- Attempt payment fraud
- Spam low-value requests

**Objectives:**
- Free relay service (avoid payments)
- Censor competitors' content
- Steal funds via payment exploits
- Disrupt service for lulz

**Threat Level:** 🟡 MEDIUM (manageable with standard defenses)

---

### 2. Malicious Agents

**Profile:**
- Rogue autonomous agent operators
- Sophisticated attackers with programming skills
- Potentially state-sponsored or organized crime

**Capabilities:**
- Deploy modified agent code with malicious behavior
- Coordinate attacks across multiple agents
- Exploit protocol vulnerabilities
- Manipulate pricing and routing
- Selectively censor or modify events

**Objectives:**
- Revenue theft from honest agents
- Network disruption to eliminate competition
- Data exfiltration (user metadata, payment info)
- Censorship for political/commercial reasons

**Threat Level:** 🔴 HIGH (requires protocol-level defenses)

---

### 3. Malicious Connectors/Routers

**Profile:**
- Compromised or intentionally malicious ILP connectors
- May be nation-state actors or organized crime
- Control key routing positions in network

**Capabilities:**
- Intercept and log all routed packets
- Selectively drop packets (censorship)
- Delay packet delivery (timing attacks)
- Correlation attacks across routing hops
- Steal payment secrets if encryption is weak

**Objectives:**
- Surveillance (metadata collection)
- Censorship (block specific content/users)
- Financial theft (payment interception)
- Network mapping (identify high-value targets)

**Threat Level:** 🔴 HIGH (BTP encryption mitigates but not eliminates)

---

### 4. Nation-State Adversaries

**Profile:**
- Government agencies with censorship mandates
- Unlimited resources and legal authority
- May control ISPs or hosting infrastructure

**Capabilities:**
- Block Akash deployments in jurisdiction
- DDoS attacks with massive botnets
- Compromise cloud providers (AWS, GCP)
- Legal compulsion of operators
- Traffic analysis at ISP level

**Objectives:**
- Censor dissident content
- Identify anonymous users
- Disrupt "uncontrolled" communication
- Regulatory enforcement

**Threat Level:** 🔴 CRITICAL (partially mitigable, some attacks inevitable)

---

### 5. Economic Attackers

**Profile:**
- Profit-motivated actors exploiting economic loopholes
- May be legitimate businesses or sophisticated traders
- Well-funded and patient

**Capabilities:**
- Front-running profitable routes
- Liquidity manipulation
- Price oracle manipulation
- MEV (Maximal Extractable Value) attacks on swaps
- Flash loan attacks on payment channels

**Objectives:**
- Extract profit from protocol inefficiencies
- Manipulate markets (DEX slippage)
- Arbitrage price differences
- Drain agent treasuries

**Threat Level:** 🟡 MEDIUM (requires economic security design)

---

## Attack Surface Analysis

### 1. Network Layer

**Components:**
- BTP encrypted UDP packets
- HTTPS discovery endpoints
- Peer handshaking protocol

**Attack Vectors:**

**A. UDP Packet Flooding (DDoS)**
```
Attacker → [UDP flood] → Agent Node
│
└─ 100,000+ packets/sec overwhelms socket buffers
```

**Mitigation:** Rate limiting, proof-of-work for new connections, BNL filtering

**B. HTTPS Endpoint Exploitation**
```
Attacker → [GET /peer-info] → Agent Node (leaks routing table)
```

**Mitigation:** Authentication for sensitive endpoints, rate limiting

**C. Man-in-the-Middle (MitM)**
```
User → Attacker (intercepts HTTPS) → Agent
│
└─ SSL/TLS stripping, certificate spoofing
```

**Mitigation:** Certificate pinning, HSTS headers, DNSSEC

---

### 2. Protocol Layer (BTP-NIPs)

**Components:**
- ILP Prepare/Fulfill/Reject packets
- Nostr event serialization
- Payment claims
- Execution conditions

**Attack Vectors:**

**A. Packet Replay Attack**
```
Attacker captures ILP Prepare packet → Replays to different agent
│
└─ Attempt to charge for same event multiple times
```

**Mitigation:** Nonce tracking, packet expiration, sequence numbers

**B. Condition/Fulfillment Manipulation**
```
Attacker creates ILP Prepare with weak condition (hash(0x00000000))
│
└─ Trivial fulfillment, agent pays without receiving payment
```

**Mitigation:** Condition strength validation, minimum entropy requirements

**C. Event Forgery**
```
Attacker modifies Nostr event signature in ILP data field
│
└─ Relay stores invalid event
```

**Mitigation:** Signature verification BEFORE accepting payment

---

### 3. Application Layer (Nostr Events)

**Components:**
- Event storage (SQLite)
- Subscription management
- Filter matching
- Event propagation logic

**Attack Vectors:**

**A. Event Spam**
```
Attacker sends 10,000 valid events/sec → Fills storage
│
└─ Agent disk fills, service degrades
```

**Mitigation:** Payment-based rate limiting, storage quotas, kind-based pricing

**B. Subscription DoS**
```
Attacker creates 1,000 subscriptions with complex filters
│
└─ Agent CPU exhausted evaluating filters
```

**Mitigation:** Subscription limits, payment-per-subscription, filter complexity caps

**C. SQLite Injection**
```
Attacker crafts event with SQL injection in content field
│
└─ Query: SELECT * FROM events WHERE content LIKE '%{event.content}%'
```

**Mitigation:** Parameterized queries, input sanitization, ORM usage

---

### 4. Payment Channel Layer

**Components:**
- Multi-chain payment channels (Base, Cronos, Arbitrum)
- Channel state management
- Settlement logic
- Nonce tracking

**Attack Vectors:**

**A. Double-Spending**
```
Attacker signs payment claim with nonce=5 for Agent A and Agent B
│
└─ Both accept, attacker spends balance twice
```

**Mitigation:** Nonce synchronization, channel state broadcasts

**B. Payment Channel Griefing**
```
Attacker opens channel with 1000 AKT → Never uses → Locks up agent's capital
│
└─ Agent cannot peer with legitimate users (capital tied up)
```

**Mitigation:** Channel expiration, inactivity fees, minimum usage requirements

**C. Settlement Race Condition**
```
Attacker submits old channel state to blockchain before agent can submit latest
│
└─ Agent loses funds if old state favored attacker
```

**Mitigation:** Challenge periods, watchtowers, latest state tracking

---

### 5. Agent Decision Logic

**Components:**
- Pricing algorithm
- Peering selection
- Treasury management (auto-swap to AKT)
- Reputation tracking

**Attack Vectors:**

**A. Pricing Manipulation**
```
Attacker floods with low-fee events → Agent lowers prices → Attacker profits
│
└─ Race to bottom, agent becomes unprofitable
```

**Mitigation:** Minimum fee floors, demand-based pricing, competitor monitoring

**B. Reputation Poisoning**
```
Attacker creates 100 fake agents → Gives high reputation to malicious peer
│
└─ Honest agent peers with malicious agent
```

**Mitigation:** Proof-of-payment for reputation votes, stake requirements

**C. Treasury Drain via Swap Manipulation**
```
Attacker manipulates DEX liquidity → Agent swaps at 50% slippage → Loses half funds
│
└─ Agent treasury depleted
```

**Mitigation:** Slippage limits, TWAP oracles, swap batching

---

### 6. Akash Deployment Layer

**Components:**
- SDL (Stack Definition Language) files
- Akash provider selection
- Deployment funding (AKT)
- Container images

**Attack Vectors:**

**A. Malicious Container Image**
```
Attacker poisons Docker registry → Agent pulls backdoored image → Compromised
│
└─ Attacker gains access to agent keys, database
```

**Mitigation:** Image signing (Docker Content Trust), hash verification, trusted registries

**B. Provider Collusion**
```
Akash provider monitors agent traffic → Extracts private keys from memory
│
└─ Provider steals agent funds
```

**Mitigation:** SGX/TEE containers, key encryption at rest, provider reputation

**C. Deployment Denial**
```
Attacker frontrun's agent's deployment bid → Agent cannot deploy → Service down
│
└─ Agent offline, loses revenue
```

**Mitigation:** Backup providers, pre-reserved capacity, deployment retries

---

## Attack Scenarios

### Scenario 1: Sybil Attack (1000 Fake Agents)

**Attacker Goal:** Flood network with fake agents to manipulate routing and censor content

**Attack Flow:**

```
Day 1: Attacker deploys 1000 Akash instances
│      - Each instance runs modified agent code
│      - Total cost: 1000 AKT/day (~$3,000 at $3/AKT)
│
Day 2: Fake agents peer with honest nodes
│      - Pay minimum proof-of-payment fees
│      - Advertise low routing fees (undercut honest agents)
│
Day 3: Network routing tables update
│      - 40% of routes now pass through attacker's agents
│
Day 4: Attacker activates censorship
│      - Selectively drops events from targeted pubkeys
│      - Logs user metadata for surveillance
│
Day 5: Honest agents notice degraded service
│      - Reputation system flags attacker's agents
│      - Network blacklists malicious peers
```

**Impact:**
- **Censorship:** 40% of events from targeted users dropped
- **Privacy:** User routing metadata exposed to attacker
- **Economic:** Attacker steals routing fees ($1,000/day estimated)

**Likelihood:** 🔴 **HIGH** (low barrier to entry, high reward)

**Mitigation Effectiveness:**

| Mitigation | Effectiveness | Rationale |
|------------|--------------|-----------|
| Proof-of-payment for peering | 🟡 MEDIUM | Increases cost but not prohibitive |
| Reputation system | 🟢 HIGH | Flags malicious agents within 24-48h |
| Stake requirements | 🟢 HIGH | Requires $300k stake (1000 agents × $300) |
| BNL filtering | 🟢 HIGH | Bootstrap nodes reject unknown agents |

**Residual Risk:** 🟡 MEDIUM (mitigated but not eliminated)

---

### Scenario 2: Selective Censorship by Malicious Connector

**Attacker Goal:** Censor events from specific pubkeys while appearing legitimate

**Attack Flow:**

```
Phase 1: Establish legitimate reputation
│        - Run honest agent for 90 days
│        - Build high reputation score
│        - Become popular routing node
│
Phase 2: Activate selective censorship
│        - Receive event from targeted pubkey (e.g., dissident journalist)
│        - Drop packet silently (no reject message)
│        - Continue routing other events normally
│
Phase 3: Evade detection
│        - Only censor 5% of targeted user's events
│        - Blame network issues ("packet loss")
│        - Maintain 95% uptime on other traffic
│
Phase 4: Long-term censorship
│        - Targeted user's content reaches only 60% of network
│        - User suspects censorship but cannot prove it
│        - Attacker maintains plausible deniability
```

**Impact:**
- **Censorship:** 40% reduction in reach for targeted users
- **Trust:** Undermines network reliability perception
- **Detection Difficulty:** Hard to distinguish from legitimate packet loss

**Likelihood:** 🟡 **MEDIUM** (requires patience and sophistication)

**Mitigation Effectiveness:**

| Mitigation | Effectiveness | Rationale |
|------------|--------------|-----------|
| Multi-path routing | 🟢 HIGH | Events routed through multiple agents |
| Delivery receipts | 🟢 HIGH | Detect missing events via acks |
| Reputation-based routing | 🟡 MEDIUM | Flags low delivery rates |
| Proof-of-relay | 🟢 HIGH | Agents sign delivery proofs |

**Residual Risk:** 🟢 LOW (multiple mitigations effective)

---

### Scenario 3: DoS Attack on High-Value Agent

**Attacker Goal:** Take down competitor agent to capture market share

**Attack Flow:**

```
Phase 1: Identify target
│        - Monitor network for high-revenue agents
│        - Target: Agent with 10,000 events/day revenue
│
Phase 2: Reconnaissance
│        - Probe agent's UDP socket capacity
│        - Identify rate limiting thresholds
│        - Map peering relationships
│
Phase 3: Execute attack
│        - Launch UDP flood: 500,000 packets/sec
│        - Exhaust agent's socket buffers
│        - Agent cannot process legitimate requests
│
Phase 4: Sustain attack
│        - Rotate attack IPs (botnet)
│        - Bypass rate limiting via IP spoofing
│        - Maintain attack for 72 hours
│
Result: Target agent goes offline
│       - Loses $10,000 revenue over 3 days
│       - Reputation decreases (perceived as unreliable)
│       - Attacker's agents capture displaced traffic
```

**Impact:**
- **Service Disruption:** Target agent offline for 72h
- **Economic Loss:** $10,000 revenue lost
- **Market Manipulation:** Attacker gains market share

**Likelihood:** 🔴 **HIGH** (common attack pattern, proven effective)

**Mitigation Effectiveness:**

| Mitigation | Effectiveness | Rationale |
|------------|--------------|-----------|
| CloudFlare/DDoS protection | 🟢 HIGH | Filters malicious traffic |
| Proof-of-work for new peers | 🟡 MEDIUM | Slows but doesn't stop botnet |
| BNL whitelisting | 🟢 HIGH | Only accept known peers |
| Akash provider filtering | 🟡 MEDIUM | Provider-level DDoS mitigation |

**Residual Risk:** 🟡 MEDIUM (CloudFlare helps but sophisticated attacks persist)

---

### Scenario 4: Privacy Leak via Routing Metadata Correlation

**Attacker Goal:** Deanonymize users by correlating routing metadata

**Attack Flow:**

```
Phase 1: Deploy observer agents
│        - Deploy 50 agents across network
│        - Position agents at key routing hops
│        - Log all packet metadata (timestamps, sizes, source IPs)
│
Phase 2: Collect metadata
│        - Log incoming packets:
│          { timestamp: 1701820800, size: 1024, srcIP: "192.168.1.100", eventHash: "abc123" }
│        - Store in centralized database
│        - Collect 1M events over 30 days
│
Phase 3: Correlation analysis
│        - Group events by timing patterns
│        - Identify users who consistently post at same times
│        - Cross-reference with public Nostr profiles
│
Phase 4: Deanonymization
│        - User posts event at 2023-12-05 08:00:00
│        - Metadata shows source IP: 192.168.1.100
│        - GeoIP lookup: San Francisco, CA
│        - Cross-reference with NIP-05: alice@example.com
│        - Conclusion: Alice is user XYZ
│
Result: 1000 users deanonymized
│       - Metadata sold to data brokers ($100k revenue)
│       - Users' privacy violated
```

**Impact:**
- **Privacy Violation:** 1000 users deanonymized
- **Safety Risk:** Dissidents exposed to persecution
- **Trust Damage:** Network perceived as insecure

**Likelihood:** 🟡 **MEDIUM** (requires resources but feasible)

**Mitigation Effectiveness:**

| Mitigation | Effectiveness | Rationale |
|------------|--------------|-----------|
| BTP encryption (end-to-end) | 🟢 HIGH | Hides packet contents |
| Tor/I2P routing | 🟢 HIGH | Hides source IPs |
| Packet padding | 🟡 MEDIUM | Obscures event sizes |
| Timing obfuscation (random delays) | 🟡 MEDIUM | Breaks timing correlation |
| Onion routing (3+ hops) | 🟢 HIGH | Prevents single-agent correlation |

**Residual Risk:** 🟡 MEDIUM (sophisticated attackers can still correlate)

---

### Scenario 5: Payment Channel Drain Attack

**Attacker Goal:** Exploit payment channel vulnerability to steal agent funds

**Attack Flow:**

```
Phase 1: Open payment channel
│        - Attacker opens channel with 1000 AKT collateral
│        - Agent opens channel with 1000 AKT collateral
│        - Total channel capacity: 2000 AKT
│
Phase 2: Legitimate usage (build trust)
│        - Attacker pays for 1000 events over 7 days
│        - Agent earns 10 AKT in fees
│        - Agent's reputation of attacker: HIGH
│
Phase 3: Exploit vulnerability
│        - Attacker discovers nonce reuse bug in agent code
│        - Crafts payment claim with nonce=500 (previously used)
│        - Agent accepts claim (fails to detect reuse)
│        - Attacker's balance: 1010 AKT (should be 990 AKT)
│
Phase 4: Drain channel
│        - Attacker repeats attack 100 times
│        - Agent's balance: 0 AKT
│        - Attacker's balance: 2000 AKT
│
Phase 5: Settlement
│        - Attacker submits final state to blockchain
│        - Agent cannot challenge (state is cryptographically valid)
│        - Attacker withdraws 2000 AKT
│
Result: Agent loses 1000 AKT (~$3,000)
│       - Agent cannot recover funds
│       - Vulnerability exploited across network (10+ agents)
```

**Impact:**
- **Financial Loss:** 10 agents lose 10,000 AKT total ($30k)
- **Network Trust:** Confidence in payment channels shaken
- **Protocol Flaw:** Critical bug requires emergency patch

**Likelihood:** 🟡 **MEDIUM** (bugs happen, but peer review reduces risk)

**Mitigation Effectiveness:**

| Mitigation | Effectiveness | Rationale |
|------------|--------------|-----------|
| Formal verification of nonce logic | 🟢 HIGH | Prevents nonce reuse bugs |
| Channel watchtowers | 🟢 HIGH | Detect fraudulent states |
| Multi-signature channels | 🟡 MEDIUM | Requires both parties to settle |
| Bug bounty program | 🟢 HIGH | Incentivizes responsible disclosure |
| Circuit breakers (daily withdrawal limits) | 🟢 HIGH | Limits blast radius |

**Residual Risk:** 🟢 LOW (comprehensive mitigations)

---

### Scenario 6: Agent Treasury Theft via Key Compromise

**Attacker Goal:** Steal agent's private keys to drain treasury

**Attack Flow:**

```
Phase 1: Compromise Akash provider
│        - Attacker compromises Akash provider's infrastructure
│        - Gains root access to all containers on provider
│        - 20 agent instances running on compromised provider
│
Phase 2: Extract keys
│        - Attacker dumps container memory
│        - Extracts agent's Nostr private key (nsec)
│        - Extracts agent's Akash signing key
│        - Extracts payment channel private keys
│
Phase 3: Drain treasury
│        - Use payment channel keys to withdraw all AKT
│        - Use Akash signing key to delete deployments
│        - Use Nostr key to impersonate agent (damage reputation)
│
Phase 4: Cover tracks
│        - Delete container logs
│        - Restore original memory state
│        - Agent operators unaware of compromise for 48h
│
Result: 20 agents lose total of 50,000 AKT (~$150k)
│       - Agents cannot recover funds
│       - Reputation damage (appeared to rug-pull users)
│       - Trust in Akash hosting questioned
```

**Impact:**
- **Financial Loss:** $150k stolen
- **Reputation Damage:** Agents appear to exit scam
- **Infrastructure Trust:** Akash providers under scrutiny

**Likelihood:** 🟡 **MEDIUM-LOW** (requires sophisticated attack)

**Mitigation Effectiveness:**

| Mitigation | Effectiveness | Rationale |
|------------|--------------|-----------|
| Hardware Security Modules (HSM) | 🟢 HIGH | Keys never in memory |
| Trusted Execution Environments (SGX) | 🟢 HIGH | Encrypted memory |
| Key splitting (threshold signatures) | 🟢 HIGH | No single point of failure |
| Provider diversification | 🟡 MEDIUM | Reduces blast radius |
| Real-time treasury monitoring | 🟢 HIGH | Alerts on suspicious withdrawals |

**Residual Risk:** 🟢 LOW (HSM/SGX highly effective)

---

## Threat Severity Matrix

### Severity Calculation

**Severity = Likelihood × Impact × Exploitability**

**Likelihood Scale:**
- **CRITICAL (5):** Attack actively happening or imminent
- **HIGH (4):** Attack likely within 6 months
- **MEDIUM (3):** Attack likely within 1 year
- **LOW (2):** Attack possible but requires significant resources
- **NEGLIGIBLE (1):** Attack theoretical, no known method

**Impact Scale:**
- **CRITICAL (5):** Network-wide failure, >$1M loss, loss of life
- **HIGH (4):** Multiple agents compromised, >$100k loss
- **MEDIUM (3):** Single agent compromised, $10k-$100k loss
- **LOW (2):** Service degradation, <$10k loss
- **NEGLIGIBLE (1):** Minimal impact, annoyance only

**Exploitability Scale:**
- **CRITICAL (5):** Exploit publicly available, script kiddies can execute
- **HIGH (4):** Exploit requires moderate skill, tools available
- **MEDIUM (3):** Exploit requires significant skill, custom tooling
- **LOW (2):** Exploit requires expert-level knowledge
- **NEGLIGIBLE (1):** Exploit theoretical, no known method

---

### Threat Matrix Table

| Threat | Likelihood | Impact | Exploitability | **Total Severity** | Priority |
|--------|-----------|--------|---------------|-------------------|----------|
| **Sybil Attack (1000 agents)** | 4 | 4 | 4 | **64** | P0 |
| **Payment Channel Drain** | 3 | 5 | 3 | **45** | P0 |
| **Key Compromise (Provider)** | 2 | 5 | 2 | **20** | P0 |
| **Smart Contract Exploit** | 3 | 4 | 3 | **36** | P0 |
| **Selective Censorship** | 3 | 4 | 3 | **36** | P1 |
| **DoS Attack** | 4 | 3 | 4 | **48** | P1 |
| **Privacy Leak (Correlation)** | 3 | 3 | 3 | **27** | P2 |
| **SQLite Injection** | 2 | 3 | 3 | **18** | P2 |
| **Pricing Manipulation** | 3 | 2 | 3 | **18** | P2 |
| **Event Spam** | 4 | 2 | 4 | **32** | P2 |
| **Reputation Poisoning** | 2 | 3 | 2 | **12** | P3 |
| **Container Image Poisoning** | 1 | 4 | 2 | **8** | P3 |
| **DEX Slippage Manipulation** | 2 | 2 | 2 | **8** | P3 |

---

### Priority Definitions

**P0 (Critical):** Must fix before mainnet launch
**P1 (High):** Must fix within 3 months of launch
**P2 (Medium):** Must fix within 6 months of launch
**P3 (Low):** Best effort, fix when resources allow

---

## Security Requirements

### 1. Authentication & Authorization

**REQ-1.1:** All peer connections MUST use X25519 ECDH key exchange
**REQ-1.2:** All BTP packets MUST be encrypted with AES128-GCM-SHA256
**REQ-1.3:** Nostr event signatures MUST be verified before payment acceptance
**REQ-1.4:** Payment channel signatures MUST be verified before state updates

**Rationale:** Prevent unauthorized access and MitM attacks

**Test Criteria:**
- Attempt connection without key exchange → Rejected
- Send unencrypted packet → Dropped
- Submit event with invalid signature → Rejected with error
- Submit payment claim with invalid signature → Rejected

---

### 2. Anti-Sybil Protection

**REQ-2.1:** New agents MUST pay proof-of-payment fee to join network (minimum 100 AKT)
**REQ-2.2:** Bootstrap nodes MUST filter peers not in BNL or KNL
**REQ-2.3:** Reputation score MUST decay over time (half-life: 30 days)
**REQ-2.4:** Agents with reputation < 0.5 MUST NOT be included in routing tables

**Rationale:** Make Sybil attacks economically infeasible

**Test Criteria:**
- New agent without proof-of-payment → Rejected
- Agent not in BNL sends peering request → Ignored
- Agent with reputation 0.3 → Not routed to
- 90-day-old reputation score → Reduced by 87.5%

---

### 3. Payment Security

**REQ-3.1:** Payment channel nonces MUST be monotonically increasing
**REQ-3.2:** Duplicate nonces MUST be rejected with error
**REQ-3.3:** Payment claims MUST expire after 5 minutes
**REQ-3.4:** Channel settlement MUST have 24-hour challenge period

**Rationale:** Prevent double-spending and replay attacks

**Test Criteria:**
- Submit claim with nonce=5, then nonce=4 → Rejected
- Submit claim with nonce=5 twice → Second rejected
- Submit claim 6 minutes after creation → Rejected
- Submit old channel state → Challenged and reverted

---

### 4. Censorship Resistance

**REQ-4.1:** Events MUST be routed through minimum 3 independent agents
**REQ-4.2:** Agents MUST provide delivery receipts for all events
**REQ-4.3:** Failed delivery MUST trigger automatic re-routing
**REQ-4.4:** Users MUST be able to query delivery status for events

**Rationale:** Detect and circumvent censorship

**Test Criteria:**
- Event routed through 1 agent → Re-routed through 2 more
- Agent drops event → Client receives failure notice within 5s
- Agent censors user → Event re-routed successfully
- User queries event status → Receives delivery confirmation

---

### 5. Privacy Protection

**REQ-5.1:** BTP packets MUST use onion routing (minimum 3 hops)
**REQ-5.2:** Packet sizes MUST be padded to fixed lengths (1KB, 4KB, 16KB, 32KB)
**REQ-5.3:** Packet timing MUST be randomized (jitter: 0-500ms)
**REQ-5.4:** Agents MUST NOT log user IP addresses

**Rationale:** Prevent metadata correlation attacks

**Test Criteria:**
- Event routed through 2 hops → Re-routed through 3
- 500-byte event → Padded to 1024 bytes
- Event sent at T=0 → Delivered at T=0+random(0-500ms)
- Agent logs checked → No IP addresses present

---

### 6. Availability & DoS Protection

**REQ-6.1:** Agents MUST rate-limit new peer connections (max 10/minute)
**REQ-6.2:** Agents MUST rate-limit event submissions (max 100/minute per pubkey)
**REQ-6.3:** Agents MUST implement backpressure when queue depth > 1000
**REQ-6.4:** Agents MUST auto-blacklist IPs exceeding rate limits (24h ban)

**Rationale:** Prevent resource exhaustion attacks

**Test Criteria:**
- 20 connection attempts in 1 minute → 10 accepted, 10 rejected
- 200 events from same pubkey in 1 minute → 100 accepted, 100 rejected
- Queue depth 1500 → New events rejected with backpressure error
- IP exceeds rate limit → Blacklisted for 24 hours

---

### 7. Agent Treasury Security

**REQ-7.1:** Private keys MUST be stored in Hardware Security Module (HSM) or Trusted Execution Environment (TEE)
**REQ-7.2:** Treasury withdrawals > 10% of balance MUST require manual approval
**REQ-7.3:** Treasury balances MUST be monitored in real-time with alerts
**REQ-7.4:** Payment channel keys MUST be rotated every 30 days

**Rationale:** Prevent treasury theft

**Test Criteria:**
- Attempt to access key from memory → Inaccessible (SGX)
- Withdrawal of 15% of balance → Requires operator approval
- Unusual withdrawal detected → Alert sent within 1 minute
- 31-day-old channel key → Automatically rotated

---

## Threat Mitigation Strategies

### 1. Sybil Attack Mitigation

**Attack Tree:**

```
Sybil Attack
├─ Deploy 1000 fake agents
│  ├─ Mitigation: Proof-of-payment (100 AKT × 1000 = 100k AKT = $300k)
│  └─ Mitigation: BNL filtering (only accept known bootstrap nodes)
│
├─ Build reputation quickly
│  ├─ Mitigation: Reputation decay (time-weighted scoring)
│  └─ Mitigation: Stake requirements (lock 10 AKT per agent = $30k)
│
└─ Manipulate routing
   ├─ Mitigation: Multi-path routing (events routed through 3+ agents)
   └─ Mitigation: Reputation-based routing (prefer high-reputation peers)
```

**Comprehensive Mitigation Plan:**

**Phase 1: Economic Barriers (Day 1)**
- Implement proof-of-payment: 100 AKT to join network
- Require 10 AKT stake per agent (slashed if malicious)
- **Cost to attack:** 110,000 AKT = $330k

**Phase 2: Reputation System (Day 7)**
- Implement peer reputation scoring (0.0-1.0)
- New peers start at 0.5 reputation
- Reputation increases via successful deliveries
- Reputation decays over time (half-life: 30 days)

**Phase 3: Network Filtering (Day 14)**
- Bootstrap nodes only accept peers from BNL/KNL
- Implement KNL consensus (peer must appear in 50%+ of KNLs)
- Auto-blacklist peers with reputation < 0.3

**Phase 4: Behavioral Analysis (Day 30)**
- Monitor for suspicious patterns:
  - Sudden influx of new peers (>100/day)
  - Coordinated peering requests (same time window)
  - Identical routing behavior (fingerprinting)
- Alert operators of potential Sybil attack

**Effectiveness:** 🟢 **HIGH** (economic cost + reputation + filtering = 95% protection)

---

### 2. Censorship Attack Mitigation

**Attack Tree:**

```
Censorship Attack
├─ Selective packet dropping
│  ├─ Mitigation: Delivery receipts (signed proof of delivery)
│  └─ Mitigation: Multi-path routing (3+ independent paths)
│
├─ Delay attacks
│  ├─ Mitigation: Timeout detection (max latency: 5s)
│  └─ Mitigation: Automatic re-routing (timeout triggers alternate path)
│
└─ Network-wide censorship
   ├─ Mitigation: Tor/I2P integration (route around censored regions)
   └─ Mitigation: Fallback to WebSocket relays (bridge to traditional Nostr)
```

**Comprehensive Mitigation Plan:**

**Phase 1: Delivery Tracking (Day 1)**
- Implement delivery receipts (agents sign proof of delivery)
- Client tracks expected receipts for all events
- Alert if receipt not received within 5 seconds

**Phase 2: Multi-Path Routing (Day 7)**
- Route events through minimum 3 independent agents
- Use node-disjoint paths (no shared infrastructure)
- If 1 path fails, event still delivered via other 2

**Phase 3: Censorship Detection (Day 14)**
- Monitor delivery success rates per agent
- Flag agents with <90% delivery rate
- Auto-route around flagged agents

**Phase 4: Decentralized Reporting (Day 30)**
- Implement decentralized censorship reporting (Nostr event kind 9000)
- Users report suspected censorship
- Network aggregates reports to identify malicious agents

**Effectiveness:** 🟢 **HIGH** (multi-path routing + delivery receipts = 98% delivery)

---

### 3. DoS/DDoS Mitigation

**Attack Tree:**

```
DoS/DDoS Attack
├─ UDP flood
│  ├─ Mitigation: Rate limiting (max 1000 packets/sec per IP)
│  └─ Mitigation: Proof-of-work (require hashcash for new connections)
│
├─ Application-layer flood
│  ├─ Mitigation: Event rate limiting (max 100 events/min per pubkey)
│  └─ Mitigation: Payment-based prioritization (paid events processed first)
│
└─ Distributed attack (botnet)
   ├─ Mitigation: CloudFlare/DDoS protection (scrub malicious traffic)
   └─ Mitigation: Akash provider filtering (provider-level mitigation)
```

**Comprehensive Mitigation Plan:**

**Phase 1: Rate Limiting (Day 1)**
- Implement per-IP rate limits:
  - New connections: 10/minute
  - UDP packets: 1000/second
  - Events: 100/minute per pubkey

**Phase 2: Proof-of-Work (Day 7)**
- Require hashcash proof-of-work for new peer connections
- Difficulty: 20 bits (≈1 second on modern CPU)
- Prevents botnet-based connection floods

**Phase 3: DDoS Protection Service (Day 14)**
- Deploy CloudFlare/Arbor Networks DDoS protection
- Scrub malicious traffic at edge
- Only allow legitimate traffic to Akash instances

**Phase 4: Payment Prioritization (Day 30)**
- Prioritize paid events over free events
- During high load, free events queued
- Prevents free event spam from DoS-ing paid events

**Effectiveness:** 🟢 **HIGH** (rate limiting + PoW + CloudFlare = 90% mitigation)

---

### 4. Privacy Leak Mitigation

**Attack Tree:**

```
Privacy Leak via Metadata
├─ Packet size analysis
│  ├─ Mitigation: Packet padding (fixed sizes: 1KB, 4KB, 16KB, 32KB)
│  └─ Mitigation: Random dummy packets (noise injection)
│
├─ Timing analysis
│  ├─ Mitigation: Random jitter (0-500ms delay)
│  └─ Mitigation: Batching (group events together)
│
├─ IP address correlation
│  ├─ Mitigation: Tor/I2P routing (hide source IPs)
│  └─ Mitigation: VPN requirement (mandate VPN for privacy-sensitive users)
│
└─ Multi-hop correlation
   ├─ Mitigation: Onion routing (3+ hops)
   └─ Mitigation: Route randomization (vary paths)
```

**Comprehensive Mitigation Plan:**

**Phase 1: Packet Obfuscation (Day 1)**
- Pad all packets to fixed sizes (1KB, 4KB, 16KB, 32KB)
- Add random jitter (0-500ms) to packet timing
- Inject dummy packets (10% of traffic) to obscure real events

**Phase 2: Onion Routing (Day 7)**
- Implement 3-hop onion routing (similar to Tor)
- Each hop decrypts one layer, routes to next hop
- Final hop delivers to destination (cannot trace back to source)

**Phase 3: Tor Integration (Day 14)**
- Support Tor hidden services (.onion addresses)
- Agents advertise Tor addresses in addition to clearnet
- Privacy-sensitive users route via Tor

**Phase 4: Metadata Minimization (Day 30)**
- Agents do NOT log:
  - Source IP addresses
  - Event timestamps (beyond what's in Nostr event)
  - User metadata
- Implement data retention policy (delete logs after 24h)

**Effectiveness:** 🟡 **MEDIUM-HIGH** (onion routing + Tor = 80% protection against correlation)

**Note:** Determined adversaries with global surveillance can still correlate via timing/size analysis. Perfect privacy impossible without significant latency trade-offs.

---

### 5. Payment Channel Exploit Mitigation

**Attack Tree:**

```
Payment Channel Exploit
├─ Nonce reuse (double-spend)
│  ├─ Mitigation: Formal verification (prove nonce monotonicity)
│  └─ Mitigation: Channel state broadcasts (all nodes verify nonces)
│
├─ Settlement race condition
│  ├─ Mitigation: Challenge period (24h window to dispute)
│  └─ Mitigation: Watchtowers (monitor blockchain for old states)
│
├─ Signature malleability
│  ├─ Mitigation: Use secp256k1 with low-S enforcement
│  └─ Mitigation: Canonical signature validation
│
└─ Smart contract bugs
   ├─ Mitigation: Formal verification (TLA+ specs)
   └─ Mitigation: Bug bounty program ($100k rewards)
```

**Comprehensive Mitigation Plan:**

**Phase 1: Code Audit (Before Mainnet)**
- Hire external auditors (Trail of Bits, OpenZeppelin)
- Perform formal verification of nonce logic
- Test all edge cases (nonce overflow, concurrent updates)

**Phase 2: Watchtower Deployment (Day 1)**
- Deploy watchtower service (monitors blockchain)
- Alert if old channel state submitted
- Auto-submit latest state to dispute fraudulent settlement

**Phase 3: Circuit Breakers (Day 7)**
- Implement daily withdrawal limits (max 10% of balance)
- Large withdrawals require manual approval
- Prevents rapid drainage in case of exploit

**Phase 4: Bug Bounty (Ongoing)**
- Launch bug bounty program ($100k max reward)
- Incentivize responsible disclosure
- Patch vulnerabilities before exploitation

**Effectiveness:** 🟢 **HIGH** (formal verification + watchtowers + audits = 95% protection)

---

### 6. Key Compromise Mitigation

**Attack Tree:**

```
Key Compromise
├─ Memory dump attack
│  ├─ Mitigation: SGX/TEE (encrypted memory)
│  └─ Mitigation: HSM (keys never in application memory)
│
├─ Container escape
│  ├─ Mitigation: Minimal container (reduce attack surface)
│  └─ Mitigation: SELinux/AppArmor (mandatory access control)
│
├─ Provider compromise
│  ├─ Mitigation: Provider diversification (spread risk)
│  └─ Mitigation: Provider reputation system (prefer trusted providers)
│
└─ Phishing/social engineering
   ├─ Mitigation: Hardware wallets (operator keys on Ledger)
   └─ Mitigation: Multi-signature (require 2-of-3 keys for withdrawals)
```

**Comprehensive Mitigation Plan:**

**Phase 1: HSM Integration (Before Mainnet)**
- Deploy agents with HSM support (AWS CloudHSM, Yubico YubiHSM)
- Private keys never leave HSM
- All signing operations performed inside HSM

**Phase 2: SGX Containers (Day 1)**
- Use Intel SGX or AMD SEV for trusted execution
- Application memory encrypted
- Provider cannot dump memory

**Phase 3: Key Splitting (Day 7)**
- Implement threshold signatures (2-of-3 multi-sig)
- Operator holds 2 keys, HSM holds 1 key
- Requires both operator and HSM to sign withdrawals

**Phase 4: Real-Time Monitoring (Day 14)**
- Monitor treasury balances in real-time
- Alert on suspicious withdrawals (>10% balance)
- Auto-freeze treasury if anomaly detected

**Effectiveness:** 🟢 **HIGH** (HSM + SGX + multi-sig = 99% protection)

---

## Residual Risks

Even with comprehensive mitigations, some risks remain:

### 1. Nation-State Adversaries

**Risk:** Government-level attackers with unlimited resources

**Residual Exposure:**
- Cannot prevent traffic analysis at ISP level
- Cannot prevent legal compulsion of operators
- Cannot prevent infrastructure-level censorship (Great Firewall)

**Mitigation:**
- Encourage Tor/I2P usage
- Operate in censorship-resistant jurisdictions
- Implement decentralized fallback mechanisms

**Acceptance:** ⚠️ **ACKNOWLEDGED** (some attacks cannot be prevented)

---

### 2. Zero-Day Exploits

**Risk:** Unknown vulnerabilities in dependencies (Dassie, Akash, smart contracts)

**Residual Exposure:**
- Cannot protect against unknown bugs
- Formal verification reduces but doesn't eliminate risk

**Mitigation:**
- Regular dependency updates
- Bug bounty program
- Incident response plan

**Acceptance:** ⚠️ **ACKNOWLEDGED** (all software has unknown bugs)

---

### 3. Economic Attacks During Low Liquidity

**Risk:** During network bootstrap (low liquidity), economic attacks cheaper

**Residual Exposure:**
- Sybil attack costs only $30k if network small
- Price manipulation easier with low DEX liquidity

**Mitigation:**
- Bootstrap with trusted agents (BNL)
- Gradual network growth
- Liquidity incentives (LP rewards)

**Acceptance:** ⚠️ **ACKNOWLEDGED** (higher risk during bootstrap)

---

### 4. Sophisticated Correlation Attacks

**Risk:** Advanced adversaries with global surveillance can correlate metadata

**Residual Exposure:**
- Onion routing helps but doesn't provide perfect privacy
- Timing/size analysis can still leak information

**Mitigation:**
- Best-effort privacy protections (Tor, padding, jitter)
- User education (don't rely on perfect anonymity)

**Acceptance:** ⚠️ **ACKNOWLEDGED** (perfect privacy impossible without major latency trade-offs)

---

## Conclusion

**Summary of Findings:**

Autonomous agent relay networks face a complex threat landscape with both familiar (DoS, Sybil) and novel (autonomous economic attacks) threats. The combination of:

1. **Cryptographic Protections** (BTP encryption, Nostr signatures, payment conditions)
2. **Economic Incentives** (proof-of-payment, stake requirements, reputation)
3. **Protocol Design** (multi-path routing, delivery receipts, onion routing)
4. **Operational Security** (HSM, SGX, monitoring, bug bounties)

...provides comprehensive defense against most attacks. However, residual risks remain, particularly against nation-state adversaries and during network bootstrap.

**Risk Acceptance:**

The network should **proceed to mainnet launch** with comprehensive mitigations implemented, while acknowledging residual risks. Continuous monitoring and incident response capabilities are essential.

**Next Steps:**

1. Implement P0 mitigations before mainnet launch
2. Deploy bug bounty program ($100k rewards)
3. Conduct third-party security audit (Trail of Bits)
4. Develop incident response playbook
5. Establish security working group for ongoing threat modeling

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-05
**Author:** Claude Code (AI Research Assistant)
**License:** MIT (research outputs), Apache 2.0 (code)

**Related Documents:**
- [Encryption Guarantees](/Users/jonathangreen/Documents/nostream-ilp/docs/research/autonomous-agent-relays/security-privacy/encryption-guarantees.md)
- [Reputation Systems](/Users/jonathangreen/Documents/nostream-ilp/docs/research/autonomous-agent-relays/security-privacy/reputation-systems.md)
- [BTP-NIPs Protocol Specification](/Users/jonathangreen/Documents/nostream-ilp/docs/research/autonomous-agent-relays/protocol-specification/btp-nips-protocol.md)
