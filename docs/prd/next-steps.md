# Next Steps

## For Architect:
Create architecture document specifying:
1. Nostream ↔ Dassie HTTP API contract (detailed endpoint specs)
2. Payment claim verification flow (sequence diagrams)
3. Economic monitor state machine (when to convert, when to pay Akash)
4. CosmWasm contract architecture (detailed state management)
5. Deployment architecture on Akash (networking, storage, security)

## For Implementation:
Ready to start Epic 1 after architecture approval:
1. Fork Nostream → Remove centralized payments
2. Fork/clone Dassie → Add API endpoints
3. Create CosmWasm contract → Basic payment channels
4. Target: Working integration (Nostr + ILP) in Week 3-4

## For Business/Marketing:
- Validate economic model with Nostr community
- Identify potential early adopter relay operators
- Create go-to-market strategy (post-MVP)

---

**End of PRD**

This is a greenfield project combining **Nostream** (proven Nostr relay) + **Dassie** (proven ILP implementation) + **Akash** (decentralized hosting) to create the world's first **self-sustaining, cross-ledger micropayment-enabled Nostr relay**.
