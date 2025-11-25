# User Interface Design Goals

## Overall UX Vision

The system provides a **standard Nostr relay experience** for end users (no UX changes) with an **operator dashboard** for monitoring economic health, payment channels, and deployment status.

## Key Interaction Paradigms

- **Nostr Client Compatibility:** Users connect with standard Nostr clients - no modifications required
- **Transparent Payments:** Payment claims embedded in Nostr event tags - clients may add this via plugins/extensions
- **Operator Dashboard:** Single web UI aggregating data from both Nostream and Dassie
- **API-First:** All functionality accessible via HTTP APIs

## Core Screens and Views

**Unified Operator Dashboard:**
- **Economic Overview:** Revenue (user payments + routing fees), expenses (Akash), profit/loss, runway
- **Nostr Relay Stats:** Events stored, subscriptions active, connected clients, bandwidth used
- **ILP Connector Stats:** Payments routed, routing fees earned, peer connections, liquidity per currency
- **Payment Channels:** Active channels (per blockchain), balances, pending settlements
- **Akash Deployment:** Resource usage, costs, escrow balance, days remaining

**Nostr Client (Standard - No Changes):**
- Users interact via standard Nostr protocol over WebSocket
- Payment-aware clients attach payment claims to EVENT messages
- Legacy clients without payment support may have limited access (configurable)

## Accessibility

**None** - Infrastructure product. Dashboard uses standard web accessibility.

## Branding

**Minimal** - Clean, functional dashboard. Focus on data clarity over aesthetics.

## Target Device and Platforms

**Server/Backend** - Two Docker containers on Akash Network
**Operator Dashboard** - Web responsive, accessible from any browser

---
