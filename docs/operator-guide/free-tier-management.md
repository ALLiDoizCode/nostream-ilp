# Free Tier Management Guide

**Story 1.6** - Free Tier / Grace Period Implementation

This guide explains how to configure and manage the free tier feature for your Nostream-ILP relay.

---

## Table of Contents

1. [Overview](#overview)
2. [Configuration](#configuration)
3. [Use Cases](#use-cases)
4. [CLI Management Tools](#cli-management-tools)
5. [Monitoring Free Tier Usage](#monitoring-free-tier-usage)
6. [Troubleshooting](#troubleshooting)

---

## Overview

The free tier feature allows relay operators to offer new users a limited number of free events before requiring payment. This enables:

- **User onboarding** - Let users try the relay before setting up payments
- **Trial periods** - Offer a grace period for new users
- **Whitelisting** - Grant unlimited free events to trusted users (developers, moderators)

### Key Features

- **Per-pubkey tracking** - Each Nostr pubkey gets their own free event allocation
- **Database-backed** - Event counts persist across relay restarts
- **Whitelist support** - Bypass limits entirely for specific pubkeys
- **User notifications** - Clients receive NOTICE messages when approaching limit
- **Production-safe defaults** - Free tier disabled by default (0 events)

---

## Configuration

### Environment Variable

Set the free tier threshold in `.env`:

```bash
# Free Tier Configuration (Story 1.6)
# Number of free events per pubkey before payment required
# Set to 0 to disable free tier (all events require payment)
PRICING_FREE_TIER_EVENTS=0
```

### Configuration Values

| Value | Behavior | Use Case |
|-------|----------|----------|
| `0` | Free tier disabled | **Production relays** - Immediate payment required |
| `100` | 100 free events | **Trial period** - ~$1 value at 10 sats/event |
| `1000` | 1000 free events | **Generous trial** - ~$10 value at 10 sats/event |
| `10000` | 10000 free events | **Development/testing** - Large trial for beta users |

### Calculating Appropriate Threshold

Consider your relay's pricing when setting the free tier threshold:

```
Free Tier Value = PRICING_STORE_EVENT × PRICING_FREE_TIER_EVENTS

Example with default pricing (10 sats/event):
  100 events  = 1,000 sats = ~$1.00 USD
  1000 events = 10,000 sats = ~$10.00 USD
```

**Recommendation:** Start with 100 events for production relays to balance user acquisition with spam prevention.

---

## Use Cases

### Use Case 1: Production Relay (Free Tier Disabled)

**Scenario:** High-traffic public relay requiring payment for all events.

**Configuration:**
```bash
PRICING_FREE_TIER_EVENTS=0
```

**Behavior:**
- All events require payment from first event
- No free tier tracking overhead
- Maximum spam protection

---

### Use Case 2: New Relay with Trial Period

**Scenario:** New relay attracting users with a trial period.

**Configuration:**
```bash
PRICING_FREE_TIER_EVENTS=100
```

**Behavior:**
- New users get 100 free events (~$1 value)
- Clients receive NOTICE at 10 events remaining: "Free tier: 10 free events remaining. Payment will be required after."
- After 100 events, payment required for all subsequent events

---

### Use Case 3: Development Relay with Whitelisting

**Scenario:** Private relay for developers and testers.

**Configuration:**
```bash
PRICING_FREE_TIER_EVENTS=50  # Small trial for unknown users
```

**Whitelist developers:**
```bash
pnpm free-tier-admin add <developer-pubkey> "Core developer - unlimited access"
```

**Behavior:**
- Unknown users get 50 free events
- Whitelisted developers have unlimited free events
- No payment required for whitelisted pubkeys

---

## CLI Management Tools

### Installation

The `free-tier-admin` CLI is included with Nostream-ILP. No additional installation required.

### Commands

#### Add Pubkey to Whitelist

Grant unlimited free events to a pubkey:

```bash
pnpm free-tier-admin add <pubkey> [description]
```

**Example:**
```bash
pnpm free-tier-admin add 3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d "Core developer"
```

**Effect:**
- Pubkey immediately has unlimited free events
- Existing event count preserved but not enforced
- Description stored for audit purposes

---

#### Remove Pubkey from Whitelist

Revoke unlimited free events:

```bash
pnpm free-tier-admin remove <pubkey>
```

**Example:**
```bash
pnpm free-tier-admin remove 3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d
```

**Effect:**
- Pubkey immediately subject to free tier limits
- If event count > threshold, payment required for next event

---

#### List All Whitelisted Pubkeys

View current whitelist:

```bash
pnpm free-tier-admin list
```

**Example Output:**
```
Whitelisted Pubkeys (3 total):

  Pubkey:      3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d
  Description: Core developer
  Added:       2025-11-25T18:30:00.000Z

  Pubkey:      82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2
  Description: Moderator account
  Added:       2025-11-25T16:15:00.000Z

  Pubkey:      npub1abc...def (converted to hex internally)
  Description: Beta tester
  Added:       2025-11-24T12:00:00.000Z
```

---

#### Check Status for Specific Pubkey

View free tier status and event count:

```bash
pnpm free-tier-admin status <pubkey>
```

**Example Output (Eligible):**
```
Free Tier Status for: 3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d

  Eligible:         ✅ Yes
  Whitelisted:      ❌ No
  Events Used:      45
  Events Remaining: 55
```

**Example Output (Exhausted):**
```
Free Tier Status for: 82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2

  Eligible:         ❌ No
  Whitelisted:      ❌ No
  Events Used:      120
  Events Remaining: 0

ℹ️  This pubkey has exhausted their free tier.
   Payment is now required for all events.
```

**Example Output (Whitelisted):**
```
Free Tier Status for: 3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d

  Eligible:         ✅ Yes
  Whitelisted:      ✅ Yes
  Events Used:      5234
  Events Remaining: Unlimited (whitelisted)
```

---

## Monitoring Free Tier Usage

### SQL Queries for Operators

#### View Top Users by Event Count

```sql
SELECT
  pubkey,
  event_count,
  created_at,
  updated_at
FROM pubkey_event_counts
ORDER BY event_count DESC
LIMIT 20;
```

#### Find Users Approaching Free Tier Limit

```sql
SELECT
  pubkey,
  event_count,
  (100 - event_count) AS events_remaining  -- Adjust 100 to your threshold
FROM pubkey_event_counts
WHERE event_count >= 90 AND event_count < 100
ORDER BY event_count DESC;
```

#### Count Users Who Exhausted Free Tier

```sql
SELECT COUNT(*) AS exhausted_users
FROM pubkey_event_counts
WHERE event_count >= 100;  -- Adjust to your threshold
```

#### Export Free Tier Usage Data

```sql
COPY (
  SELECT
    pubkey,
    event_count,
    created_at,
    updated_at,
    CASE
      WHEN EXISTS (SELECT 1 FROM free_tier_whitelist WHERE free_tier_whitelist.pubkey = pubkey_event_counts.pubkey)
      THEN 'whitelisted'
      ELSE 'normal'
    END AS status
  FROM pubkey_event_counts
  ORDER BY event_count DESC
) TO '/tmp/free_tier_usage.csv' WITH CSV HEADER;
```

### Monitoring Dashboard Metrics

Track these metrics for free tier health:

1. **Conversion Rate**: % of users who pay after exhausting free tier
2. **Average Events Before Payment**: Mean event count for paid users
3. **Free Tier Abuse**: Pubkeys with many events from same IP (Sybil attack detection)
4. **Whitelist Size**: Number of whitelisted pubkeys
5. **Total Free Events Served**: Sum of all event counts under threshold

---

## Troubleshooting

### Problem: Users Not Receiving Free Events

**Symptoms:**
- Event rejected immediately with "payment required"
- Free tier should be enabled

**Diagnosis:**
```bash
# Check environment variable
echo $PRICING_FREE_TIER_EVENTS

# Check pubkey status
pnpm free-tier-admin status <pubkey>
```

**Solutions:**
1. Verify `PRICING_FREE_TIER_EVENTS` > 0 in `.env`
2. Restart relay after changing environment variable
3. Check database connectivity (CLI tools should work)

---

### Problem: Event Count Not Incrementing

**Symptoms:**
- Users receive unlimited free events
- Event count stays at 0 in database

**Diagnosis:**
```bash
# Check if pubkey is whitelisted
pnpm free-tier-admin status <pubkey>

# Check database manually
psql -U nostream -d nostream -c "SELECT * FROM pubkey_event_counts WHERE pubkey = '<pubkey>';"
```

**Solutions:**
1. If whitelisted: This is expected behavior (unlimited events)
2. If not whitelisted: Check database write permissions
3. Check relay logs for errors: `grep "Failed to increment event count" logs/nostream.log`

---

### Problem: NOTICE Messages Not Appearing

**Symptoms:**
- Users don't see "10 events remaining" notification
- Free tier working otherwise

**Diagnosis:**
- NOTICEs are sent via WebSocket
- Check if client supports NOTICE messages (NIP-01)

**Solutions:**
1. Test with `websocat` or similar tool to verify NOTICE sent
2. Some clients ignore NOTICE messages (client-side issue)
3. Check relay logs: `grep "Free tier: " logs/nostream.log`

---

### Problem: Whitelist Not Working

**Symptoms:**
- Whitelisted user still has event limit

**Diagnosis:**
```bash
# Verify whitelist entry exists
pnpm free-tier-admin list | grep <pubkey>

# Check status
pnpm free-tier-admin status <pubkey>
```

**Solutions:**
1. Ensure pubkey is exact match (hex format, no npub prefix)
2. Verify database table exists: `psql -U nostream -d nostream -c "\d free_tier_whitelist"`
3. Re-add to whitelist: `pnpm free-tier-admin add <pubkey> "Description"`

---

### Problem: Sybil Attack (Multiple Pubkeys from Same User)

**Symptoms:**
- Many pubkeys with exactly threshold events
- All from similar IP addresses or timing patterns

**Diagnosis:**
```sql
-- Find pubkeys with event_count near threshold
SELECT pubkey, event_count, created_at
FROM pubkey_event_counts
WHERE event_count >= 95 AND event_count <= 100
ORDER BY created_at DESC;
```

**Solutions:**
1. **Reduce threshold**: Lower `PRICING_FREE_TIER_EVENTS` to 50 or less
2. **IP-based rate limiting**: Enable in `.nostr/settings.yaml` (Story 1.7+)
3. **Disable free tier**: Set `PRICING_FREE_TIER_EVENTS=0` if abuse continues
4. **Require proof-of-work**: Enable NIP-13 PoW requirements

---

## Best Practices

### Security

1. **Restrict CLI access**: Only run `free-tier-admin` from trusted SSH sessions
2. **Audit whitelist changes**: Log all whitelist additions/removals
3. **Monitor for abuse**: Check for patterns of Sybil attacks
4. **Backup database**: `pg_dump nostream > backup.sql` before bulk whitelist changes

### Performance

1. **Set reasonable thresholds**: 100-1000 events balances trial period with spam prevention
2. **Monitor database size**: `pubkey_event_counts` table grows with unique users
3. **Archive old data**: Consider purging event counts > 1 year old

### Operations

1. **Document whitelist reasons**: Always provide description when adding pubkeys
2. **Communicate limits**: Inform users of free tier policy in relay info (NIP-11)
3. **Test configuration**: Use `status` command to verify settings
4. **Plan migration path**: If disabling free tier, notify users in advance

---

## Next Steps

- **Story 1.7**: Health checks and monitoring
- **Story 1.8**: Operator dashboard for visualizing free tier metrics
- **Epic 2**: Dassie integration for payment processing

---

**Documentation Version:** 1.0
**Last Updated:** 2025-11-25
**Story:** 1.6 (Free Tier / Grace Period)
