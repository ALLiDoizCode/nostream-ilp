# Pricing Configuration Guide

This guide explains how to configure pricing for your nostream-ilp relay using environment variables.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Pricing Model](#pricing-model)
- [Configuration Examples](#configuration-examples)
- [Calculating Pricing](#calculating-pricing)
- [Troubleshooting](#troubleshooting)

---

## Overview

Nostream-ilp supports configurable pricing for relay operations through environment variables. This provides operators with:

- **Flexible pricing**: Set different rates for different event types
- **Economic sustainability**: Cover infrastructure costs (storage, bandwidth, compute)
- **Spam prevention**: Require payment for resource-intensive operations
- **Transparent fees**: Pricing published via NIP-11 relay information document

### Pricing Operations

The relay charges for three main operations:

1. **Store Event** - Cost to permanently store an event in the relay database
2. **Deliver Event** - Cost to deliver an event to a subscriber via REQ
3. **Query** - Cost to create a REQ subscription

---

## Quick Start

### Step 1: Copy Environment Template

```bash
cp .env.example .env
```

### Step 2: Configure Pricing

Edit `.env` and set your desired pricing (values in satoshis):

```bash
# Default pricing (all events)
PRICING_STORE_EVENT=10           # 10 sats to store
PRICING_DELIVER_EVENT=1          # 1 sat per delivery
PRICING_QUERY=5                  # 5 sats per subscription

# Free tier (optional, implemented in Story 1.6)
PRICING_FREE_TIER_EVENTS=0       # 0 = disabled

# Per-kind overrides (optional)
PRICING_KIND_OVERRIDES="1:10,30023:100,1063:500"
```

### Step 3: Restart Relay

```bash
pnpm run build
pnpm start
```

### Step 4: Verify Configuration

Check your relay's NIP-11 information document:

```bash
curl -H "Accept: application/nostr+json" http://localhost:8080/
```

Look for the `fees` object in the response:

```json
{
  "fees": {
    "admission": [{ "amount": 10, "unit": "sat" }],
    "publication": [
      { "amount": 10, "unit": "sat" },
      { "amount": 100, "unit": "sat", "kinds": [30023] },
      { "amount": 500, "unit": "sat", "kinds": [1063] }
    ],
    "subscription": [{ "amount": 5, "unit": "sat" }]
  }
}
```

---

## Environment Variables

### PRICING_STORE_EVENT

**Default:** `10` (satoshis)

Cost to store an event permanently in the relay database.

```bash
PRICING_STORE_EVENT=10
```

**Applies to:** All events unless overridden by `PRICING_KIND_OVERRIDES`

**Recommendations:**
- **Free relay:** `0`
- **Community relay:** `5-10` sats
- **Premium relay:** `50-100` sats

---

### PRICING_DELIVER_EVENT

**Default:** `1` (satoshi)

Cost to deliver an event to a subscriber via REQ.

```bash
PRICING_DELIVER_EVENT=1
```

**Applies to:** Event delivery via WebSocket subscriptions

**Recommendations:**
- **Low traffic:** `1` sat
- **High traffic:** `5-10` sats
- **Archive relay:** `0` (deliver free, charge for storage)

---

### PRICING_QUERY

**Default:** `5` (satoshis)

Cost to create a new REQ subscription.

```bash
PRICING_QUERY=5
```

**Applies to:** Each new REQ message from clients

**Recommendations:**
- **Public relay:** `5` sats
- **High-load relay:** `10-20` sats
- **Private relay:** `0` (authenticated users only)

---

### PRICING_FREE_TIER_EVENTS

**Default:** `0` (disabled)

Number of free events per pubkey before payment required.

```bash
PRICING_FREE_TIER_EVENTS=100
```

**Note:** Free tier tracking is implemented in Story 1.6. Setting this value now prepares the configuration for future use.

**Recommendations:**
- **Trial period:** `50-100` events
- **No free tier:** `0`

---

### PRICING_KIND_OVERRIDES

**Default:** Empty (no overrides)

Comma-separated list of `kind:amount` pairs for specialized content pricing.

**Format:** `"kind:amount,kind:amount,..."`

```bash
PRICING_KIND_OVERRIDES="1:10,30023:100,1063:500,71:1000"
```

**Common Event Kinds:**

| Kind | Description | Suggested Pricing |
|------|-------------|-------------------|
| `1` | Short text note | `10` sats (default) |
| `30023` | Long-form article | `100` sats (10x note) |
| `1063` | File metadata | `500` sats (50x note) |
| `71` | Video event | `1000` sats (100x note) |
| `20` | Picture | `200` sats (20x note) |

**Example Configuration:**

```bash
# Tiered pricing for content types
PRICING_KIND_OVERRIDES="1:5,30023:50,1063:250,71:500,20:100"
```

**Validation:**
- Invalid format pairs are skipped with a warning
- Negative amounts are rejected
- Empty string disables overrides

---

## Pricing Model

### How Pricing Works

1. **Client publishes event** → Relay extracts payment claim from event tags
2. **Relay calculates required payment** → Based on event kind and pricing config
3. **Relay verifies payment** → Checks Dassie payment channel for sufficient balance
4. **Event stored/delivered** → Only if payment is valid

### Pricing Precedence

The relay checks pricing in this order:

1. **YAML Fee Schedules** (`.nostr/settings.yaml`) - if configured
2. **Environment Variable Pricing** (Story 1.5) - fallback
3. **Kind Override** (`PRICING_KIND_OVERRIDES`) - if event kind matches
4. **Default Price** (`PRICING_STORE_EVENT`) - if no override

**Example:**

```bash
# Environment variables
PRICING_STORE_EVENT=10
PRICING_KIND_OVERRIDES="30023:100"

# Event kind 1 (note) → 10 sats (default)
# Event kind 30023 (article) → 100 sats (override)
# Event kind 1063 (file) → 10 sats (default, no override)
```

### NIP-11 Exposure

Pricing is published via NIP-11 relay information document:

```json
{
  "fees": {
    "admission": [
      { "amount": 10, "unit": "sat" }
    ],
    "publication": [
      { "amount": 10, "unit": "sat" },
      { "amount": 100, "unit": "sat", "kinds": [30023] },
      { "amount": 500, "unit": "sat", "kinds": [1063] }
    ],
    "subscription": [
      { "amount": 5, "unit": "sat" }
    ]
  },
  "payments_url": "https://relay.example.com/invoices",
  "limitation": {
    "payment_required": true
  }
}
```

Clients can fetch this information to display pricing before publishing events.

---

## Configuration Examples

### Example 1: Free Public Relay

**Goal:** Provide free relay service, no payment required

```bash
PRICING_STORE_EVENT=0
PRICING_DELIVER_EVENT=0
PRICING_QUERY=0
PRICING_FREE_TIER_EVENTS=0
PRICING_KIND_OVERRIDES=""
```

**Use Case:** Community relay, bootstrap network, testing

---

### Example 2: Basic Paid Relay

**Goal:** Uniform pricing for all events

```bash
PRICING_STORE_EVENT=10           # 10 sats per event
PRICING_DELIVER_EVENT=1          # 1 sat per delivery
PRICING_QUERY=5                  # 5 sats per query
PRICING_FREE_TIER_EVENTS=0       # No free tier
PRICING_KIND_OVERRIDES=""        # No kind overrides
```

**Use Case:** Simple pricing model, general-purpose relay

---

### Example 3: Tiered Content Pricing

**Goal:** Charge more for expensive content (articles, media)

```bash
PRICING_STORE_EVENT=5            # Base: 5 sats
PRICING_DELIVER_EVENT=1          # 1 sat per delivery
PRICING_QUERY=5                  # 5 sats per query
PRICING_FREE_TIER_EVENTS=50      # 50 free events per user
PRICING_KIND_OVERRIDES="1:5,30023:50,1063:250,71:500,20:100"
```

**Pricing by Content Type:**
- Short notes (kind 1): 5 sats
- Long-form articles (kind 30023): 50 sats (10x)
- File metadata (kind 1063): 250 sats (50x)
- Videos (kind 71): 500 sats (100x)
- Pictures (kind 20): 100 sats (20x)

**Use Case:** Discourage large content, encourage text notes

---

### Example 4: Archive Relay

**Goal:** High storage cost, free querying

```bash
PRICING_STORE_EVENT=100          # High storage cost
PRICING_DELIVER_EVENT=0          # Free delivery
PRICING_QUERY=0                  # Free querying
PRICING_FREE_TIER_EVENTS=0       # No free tier
PRICING_KIND_OVERRIDES="30023:500,1063:1000"
```

**Use Case:** Long-term storage relay, discourage ephemeral content

---

### Example 5: Private Relay with Free Tier

**Goal:** Free trial, then paid

```bash
PRICING_STORE_EVENT=20           # 20 sats per event
PRICING_DELIVER_EVENT=2          # 2 sats per delivery
PRICING_QUERY=10                 # 10 sats per query
PRICING_FREE_TIER_EVENTS=100     # 100 free events
PRICING_KIND_OVERRIDES=""        # No overrides
```

**Use Case:** Membership relay, trial period before paid subscription

---

## Calculating Pricing

### Step 1: Estimate Infrastructure Costs

**PostgreSQL Storage:**
- Average event size: 500 bytes
- Storage cost: $0.10/GB/month (cloud provider)
- Events per GB: 2,000,000
- Cost per event: $0.00000005/month

**Arweave Permanent Storage (Story 1.7):**
- Current rate: ~$5/GB one-time
- Cost per 500 byte event: $0.0000025

**Bandwidth:**
- Average delivery: 10 subscribers per event
- Bandwidth cost: $0.10/GB (cloud provider)
- Cost per event delivery: $0.0000005

**Compute:**
- EC2 t3.medium: $30/month
- Estimated capacity: 1,000,000 events/month
- Cost per event: $0.00003

**Total Infrastructure Cost per Event:**
```
PostgreSQL: $0.00000005
Arweave:    $0.0000025
Bandwidth:  $0.0000005
Compute:    $0.00003
-------------------------------
Total:      $0.00003305 (~$33/million events)
```

### Step 2: Convert to Satoshis

**BTC/USD Exchange Rate:** $50,000 (adjust to current rate)

```
1 BTC = $50,000
1 sat = $0.0005

Infrastructure cost: $0.00003305
Satoshis required: $0.00003305 / $0.0005 = 0.0661 sats
```

**Minimum viable pricing:** ~0.07 sats/event (break-even)

### Step 3: Add Profit Margin

**Recommended Margins:**
- **Break-even:** 0.07 sats
- **20% margin:** 0.10 sats
- **3x margin:** 0.20 sats
- **10x margin:** 0.70 sats
- **100x margin:** 7 sats

**Suggested Pricing:**
```bash
PRICING_STORE_EVENT=10           # 100x margin, sustainable
PRICING_DELIVER_EVENT=1          # Cover bandwidth
PRICING_QUERY=5                  # Prevent subscription spam
```

### Step 4: Adjust for Content Types

**Resource Cost by Event Kind:**

| Kind | Description | Avg Size | Storage Cost | Suggested Multiplier |
|------|-------------|----------|--------------|---------------------|
| 1 | Note | 500B | 1x | 1x (10 sats) |
| 30023 | Article | 5KB | 10x | 10x (100 sats) |
| 1063 | File | 10KB | 20x | 50x (500 sats) |
| 71 | Video | 50KB | 100x | 100x (1000 sats) |

**Per-Kind Pricing:**
```bash
PRICING_KIND_OVERRIDES="1:10,30023:100,1063:500,71:1000"
```

---

## Troubleshooting

### Pricing Not Applied

**Symptom:** Events accepted without payment

**Possible Causes:**
1. **Payments disabled:**
   ```bash
   # Check .nostr/settings.yaml
   payments:
     enabled: false  # Should be true
   ```

2. **Environment variables not loaded:**
   ```bash
   # Verify environment
   echo $PRICING_STORE_EVENT

   # Should output: 10 (or your configured value)
   ```

3. **Relay not restarted after config change:**
   ```bash
   pnpm run build
   pnpm start
   ```

**Solution:** Ensure `payments.enabled: true` in settings, verify env vars, restart relay.

---

### Invalid Configuration Warning

**Symptom:** Console warning: "Invalid pricing value: -10 (must be non-negative), using default"

**Cause:** Negative pricing values in environment variables

**Solution:** Set non-negative values:
```bash
PRICING_STORE_EVENT=10  # ✅ Valid
PRICING_STORE_EVENT=-10 # ❌ Invalid
```

---

### Kind Override Not Recognized

**Symptom:** Kind override not applied, using default pricing

**Possible Causes:**
1. **Invalid format:**
   ```bash
   PRICING_KIND_OVERRIDES="invalid"  # ❌ Wrong format
   PRICING_KIND_OVERRIDES="1:10,30023:100"  # ✅ Correct format
   ```

2. **Missing colon separator:**
   ```bash
   PRICING_KIND_OVERRIDES="1=10"     # ❌ Wrong separator
   PRICING_KIND_OVERRIDES="1:10"     # ✅ Correct separator
   ```

**Solution:** Use format `"kind:amount,kind:amount"`, check logs for parsing errors.

---

### Pricing Too High/Low

**Symptom:** Users complaining about cost, or relay not covering expenses

**Solution - Pricing Too High:**
```bash
# Reduce pricing by 50%
PRICING_STORE_EVENT=5      # Was: 10
PRICING_DELIVER_EVENT=1    # Keep same
PRICING_QUERY=2            # Was: 5
```

**Solution - Pricing Too Low:**
```bash
# Increase pricing to cover costs
PRICING_STORE_EVENT=20     # Was: 10
PRICING_DELIVER_EVENT=2    # Was: 1
PRICING_QUERY=10           # Was: 5
```

**Best Practice:** Monitor infrastructure costs monthly, adjust pricing as needed.

---

### NIP-11 Fees Not Showing

**Symptom:** `curl` shows no `fees` object

**Possible Causes:**
1. **Wrong Accept header:**
   ```bash
   curl http://localhost:8080/  # ❌ Missing header
   curl -H "Accept: application/nostr+json" http://localhost:8080/  # ✅ Correct
   ```

2. **Pricing config not loaded:**
   ```bash
   # Check logs for: "Pricing configuration loaded"
   # If missing, verify environment variables
   ```

**Solution:** Use correct Accept header, verify pricing config loaded at startup.

---

## Best Practices

### 1. Start Conservative

Begin with low pricing, increase gradually:

```bash
# Week 1: Low pricing
PRICING_STORE_EVENT=5

# Week 2: Increase after monitoring costs
PRICING_STORE_EVENT=10

# Week 3: Optimize based on usage
PRICING_STORE_EVENT=15
```

### 2. Monitor Infrastructure Costs

Track actual costs per month:
- PostgreSQL storage growth
- Bandwidth usage
- Compute costs

Adjust pricing to maintain 20-50% profit margin.

### 3. Communicate Changes

Announce pricing changes via:
- Relay NIP-11 document
- Nostr announcement event (kind 1)
- Operator website/documentation

### 4. Offer Free Tier for New Users

```bash
PRICING_FREE_TIER_EVENTS=50  # First 50 events free
```

Encourages trial, converts to paid users after proving value.

### 5. Consider Regional Pricing

For global relays, consider purchasing power parity:

```bash
# US/Europe relay
PRICING_STORE_EVENT=10

# Emerging markets relay
PRICING_STORE_EVENT=2
```

---

## Additional Resources

- **NIP-11 Specification:** https://github.com/nostr-protocol/nips/blob/master/11.md
- **Nostream Documentation:** /docs/CONFIGURATION.md
- **Pricing Calculator Spreadsheet:** (TODO: Story 1.8 dashboard feature)

---

**Last Updated:** 2025-11-25 (Story 1.5)
