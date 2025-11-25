# Nostream-ILP Migration Log

## Fork Information

**Original Repository:** https://github.com/cameri/nostream
**Fork Repository:** https://github.com/ALLiDoizCode/nostream-ilp
**Fork Point Commit:** `6a8ccb491973b2470e3b332bef61ed7ea1143091`
**Fork Date:** 2024-10-23 01:51:59 +0000
**Migration Date:** 2025-11-25

## Purpose

This fork removes centralized Lightning payment processors (ZEBEDEE, Nodeless, OpenNode, LNbits) from Nostream to prepare for Interledger Protocol (ILP) integration.

## Baseline Metrics (Before Removal)

**Captured:** 2025-11-25

### Code Statistics
- **Total Source Files:** 116 TypeScript files
- **Total Lines of Code:** 5,646 lines
- **Total Blank Lines:** 1,105
- **Total Comment Lines:** 78
- **Payment Processor Files:** 6 files
- **Payment Processor LOC:** 378 lines (6.7% of total codebase)

### File Sizes
- **Dockerfile:** 3.8KB
- **docker-compose.yml:** Present

### Dependencies
- **Total npm packages:** 1,191 packages (980 added during install)
- **Security Vulnerabilities (pre-audit):** 43 (9 low, 15 moderate, 17 high, 2 critical)

### Database Schema
- Schema export: `schemas/nostream-original.sql` (to be created after PostgreSQL setup)

## Payment Processor Code Inventory

**Date:** 2025-11-25

### Payment Processor Core Files (src/payments-processors/)
1. `src/payments-processors/zebedee-payments-processor.ts`
2. `src/payments-processors/nodeless-payments-processor.ts`
3. `src/payments-processors/opennode-payments-processor.ts`
4. `src/payments-processors/lnbits-payment-processor.ts`
5. `src/payments-processors/lnurl-payments-processor.ts`
6. `src/payments-processors/null-payments-processor.ts` (keep for now - used for no-payment mode)

### ZEBEDEE Integration Files
- `src/factories/payments-processors/zebedee-payments-processor-factory.ts`
- `src/factories/controllers/zebedee-callback-controller-factory.ts`
- `src/controllers/callbacks/zebedee-callback-controller.ts`
- References in: `src/@types/settings.ts`, `src/constants/base.ts`, `src/factories/payments-processor-factory.ts`, `src/factories/web-app-factory.ts`, `src/routes/callbacks/index.ts`

### Nodeless Integration Files
- `src/factories/payments-processors/nodeless-payments-processor-factory.ts`
- `src/factories/controllers/nodeless-callback-controller-factory.ts`
- `src/controllers/callbacks/nodeless-callback-controller.ts`
- References in: `src/@types/settings.ts`, `src/constants/base.ts`, `src/factories/payments-processor-factory.ts`, `src/routes/callbacks/index.ts`

### OpenNode Integration Files
- `src/factories/payments-processors/opennode-payments-processor-factory.ts`
- `src/factories/controllers/opennode-callback-controller-factory.ts`
- `src/controllers/callbacks/opennode-callback-controller.ts`
- References in: `src/@types/settings.ts`, `src/constants/base.ts`, `src/factories/payments-processor-factory.ts`, `src/routes/callbacks/index.ts`

### LNbits Integration Files
- `src/factories/payments-processors/lnbits-payments-processor-factory.ts`
- `src/factories/controllers/lnbits-callback-controller-factory.ts`
- `src/controllers/callbacks/lnbits-callback-controller.ts`
- References in: `src/@types/settings.ts`, `src/constants/base.ts`, `src/factories/payments-processor-factory.ts`, `src/routes/callbacks/index.ts`

### LNURL Integration Files
- `src/factories/payments-processors/lnurl-payments-processor-factory.ts`
- References in: `src/@types/settings.ts`, `src/constants/base.ts`, `src/factories/payments-processor-factory.ts`

### Shared Payment Infrastructure
- `src/routes/callbacks/index.ts` - Webhook route definitions
- `src/factories/payments-processor-factory.ts` - Payment processor selection logic
- `src/factories/web-app-factory.ts` - References payment callbacks
- `src/@types/settings.ts` - Payment processor type definitions
- `src/constants/base.ts` - Payment processor constants

### Total Files to Remove
**Exact count:** 27 files (including core processors, factories, controllers, callbacks)

## Payment Processor Database Schema

**Date:** 2025-11-25

### Database Tables Created by Payment Processors

**1. `invoices` table** (created by: `20230107_230900_create_invoices_table.js`)
- Columns:
  - `id` (UUID, primary key)
  - `pubkey` (binary, indexed) - User's Nostr public key
  - `bolt11` (text) - Lightning invoice string
  - `amount_requested` (bigint) - Requested amount
  - `amount_paid` (bigint) - Amount actually paid
  - `unit` (enum: msats, sats, btc) - Payment unit
  - `status` (enum: pending, completed, expired) - Invoice status
  - `description` (text)
  - `confirmed_at` (datetime)
  - `expires_at` (datetime)
  - `created_at`, `updated_at` (timestamps)

**2. `users` table** (created by: `20230107_230900_create_users_table.js`)
- Columns:
  - `pubkey` (binary, primary key) - User's Nostr public key
  - `is_admitted` (boolean, default: 0) - Payment admission status
  - `balance` (bigint, default: 0) - User's balance in msats
  - `tos_accepted_at` (datetime) - Terms of service acceptance
  - `created_at`, `updated_at` (timestamps)

### Database Functions

**1. `confirm_invoice(invoice_id, amount_received, confirmation_date)`**
- Created by: `20230118_190000_confirm_invoice_func.js`
- Purpose: Updates invoice status and user balance upon payment confirmation
- Dependencies: `users` table, `invoices` table
- Modified by: `20230220_002700_fix_unit_confirm_invoice_func.js`

**2. `charge_user(user_pubkey, amount)`**
- Created by: `20230120_161800_charge_user_func.js`
- Purpose: Deducts balance from user account
- Dependencies: `users` table

**3. `now_utc()`** and **`ASSERT_SERIALIZED()`**
- Created by: `20230118_190000_confirm_invoice_func.js`
- Purpose: Utility functions for payment processing

### Payment-Related Migrations (8 files)

1. `20230107_230900_create_invoices_table.js` - Creates invoices table
2. `20230107_230900_create_users_table.js` - Creates users table for admission control
3. `20230118_190000_confirm_invoice_func.js` - Payment confirmation function
4. `20230120_161800_charge_user_func.js` - Balance deduction function
5. `20230205_004400_change_invoice_id_to_string.js` - Invoice ID schema change
6. `20230213103904_add_verify_url_to_invoices_table.js` - Adds verify_url column
7. `20230217_235600_scale_balance_addition_with_unit.js` - Balance unit conversion
8. `20230220_002700_fix_unit_confirm_invoice_func.js` - Function bug fix

### Foreign Key Dependencies
- `invoices.pubkey` references `users.pubkey` (implicit)
- No explicit foreign key constraints found

### Migration Strategy
**Removal approach:**
1. Keep migration files in history (don't delete from git)
2. Create new migration to drop tables/functions (for existing deployments)
3. Document that clean installations skip payment migrations entirely

## Removed Files

**Date:** 2025-11-25

### Payment Processor Core Files (19 deleted)

**Controllers (4 files):**
- src/controllers/callbacks/zebedee-callback-controller.ts
- src/controllers/callbacks/nodeless-callback-controller.ts
- src/controllers/callbacks/opennode-callback-controller.ts
- src/controllers/callbacks/lnbits-callback-controller.ts

**Controller Factories (4 files):**
- src/factories/controllers/zebedee-callback-controller-factory.ts
- src/factories/controllers/nodeless-callback-controller-factory.ts
- src/factories/controllers/opennode-callback-controller-factory.ts
- src/factories/controllers/lnbits-callback-controller-factory.ts

**Payment Processor Factories (5 files):**
- src/factories/payments-processors/zebedee-payments-processor-factory.ts
- src/factories/payments-processors/nodeless-payments-processor-factory.ts
- src/factories/payments-processors/opennode-payments-processor-factory.ts
- src/factories/payments-processors/lnbits-payments-processor-factory.ts
- src/factories/payments-processors/lnurl-payments-processor-factory.ts

**Payment Processors (5 files):**
- src/payments-processors/zebedee-payments-processor.ts
- src/payments-processors/nodeless-payments-processor.ts
- src/payments-processors/opennode-payments-processor.ts
- src/payments-processors/lnbits-payment-processor.ts
- src/payments-processors/lnurl-payments-processor.ts

**Routes (1 file):**
- src/routes/callbacks/index.ts

**Directories Removed:**
- src/payments-processors/ (removed entirely, except null-payments-processor.ts)
- src/controllers/callbacks/
- src/factories/controllers/ (callback factories only)
- src/factories/payments-processors/
- src/routes/callbacks/

### Modified Files (6 files)

**Core Factory Changes:**
- src/factories/payments-processor-factory.ts - Removed all processor imports, returns NullPaymentsProcessor
- src/factories/web-app-factory.ts - Removed ZEBEDEE CDN from CSP directives

**Type Definition Changes:**
- src/@types/settings.ts - Removed all payment processor type definitions (LnurlPaymentsProcessor, ZebedeePaymentsProcessor, etc.)
- src/constants/base.ts - Removed PaymentsProcessors enum

**Route Changes:**
- src/routes/index.ts - Removed callbacks router import and route

**Controller Fixes:**
- src/controllers/invoices/get-invoice-controller.ts - Changed processor to 'none'
- src/controllers/invoices/post-invoice-controller.ts - Changed processor to 'none'

### Database Schema Changes

**New Migration Created:**
- migrations/20251125_022004_drop_payment_tables.js

**Tables Dropped:**
- invoices
- users

**Functions Dropped:**
- confirm_invoice()
- charge_user()
- now_utc()
- ASSERT_SERIALIZED()

**Migration Files Preserved (not deleted):**
- All 8 payment-related migration files kept in git history
- Operators can choose to skip these migrations on clean installations

## Removed Environment Variables

**Date:** 2025-11-25

### Environment Variables Removed

Based on README.md documentation (lines 100-170), the following environment variables are NO LONGER NEEDED:

**ZEBEDEE:**
- `ZEBEDEE_API_KEY` - API key for ZEBEDEE payment processor

**Nodeless:**
- (No env vars - configured via settings.json only)

**OpenNode:**
- (No env vars - configured via settings.json only)

**LNbits:**
- (No env vars - configured via settings.json only)

**LNURL:**
- (No env vars - configured via settings.json only)

### Configuration Changes in settings.json

**Removed from .nostr.local/settings.json:**
- `payments.processor` field (was: "zebedee")
- `paymentsProcessors` object entirely (contained zebedee, nodeless, opennode, lnbits, lnurl configs)

**Modified in .nostr.local/settings.json:**
- `payments.enabled` changed from `true` to `false`
- `payments.feeSchedules.admission.enabled` changed from `true` to `false`
- `payments.feeSchedules.publication.enabled` changed from `true` to `false`
- Fee amounts set to `0`

### Cleanup Checklist for Operators

When deploying this fork, operators should:

- [ ] Remove `ZEBEDEE_API_KEY` from .env files
- [ ] Remove payment processor env vars from CI/CD secrets (GitHub Actions, etc.)
- [ ] Remove payment processor configs from docker-compose.yml environment section
- [ ] Remove payment processor configs from Kubernetes/Akash deployment manifests
- [ ] Verify no hardcoded API keys exist in deployment scripts
- [ ] Update monitoring/alerting to remove payment processor health checks

## Security Findings

_(To be populated in Task 14)_

## Test Results Comparison

### Baseline (Before Removal)

**Date:** 2025-11-25

**Test Framework:** Mocha + Cucumber + NYC

**Test Commands:**
- Unit tests: `npm run test:unit`
- Integration tests: `npm run test:integration`
- Coverage: `npm run cover:unit`

**Test Results:**
- **Status:** ❌ FAILING
- **Error:** Redis dependency module resolution failure (`@redis/client/dist/lib/commands/generic-transformers`)
- **Root Cause:** Dependency version mismatch or incomplete installation
- **Note:** Tests fail before any payment processor removal, indicating pre-existing issues with the forked codebase

**Available Scripts:**
- `npm run dev` - Development server
- `npm run build` - TypeScript compilation
- `npm run lint` - ESLint checks
- `npm run db:migrate` - Database migrations

**Conclusion:** Baseline tests are non-functional. Will migrate to Vitest and fix dependency issues during Task 11-12.

### Post-Removal (After Cleanup)
_(To be populated in Task 10)_

## Functionality Changes

### Removed Features
- Lightning Network payment processing
- Payment processor webhook handlers
- Admission fee enforcement

### Preserved Features
- Full Nostr relay functionality (NIP-01, NIP-02, etc.)
- WebSocket server
- Event storage and retrieval
- Subscription management
- NIP-42 authentication

### Features to be Added (Future Stories)
- ILP payment integration (Story 1.2-1.8)
- Arweave permanent storage (Epic 6)
- Multi-blockchain payment channels (Epic 2-5)

## Upstream Sync Strategy

To merge future security fixes from upstream Nostream:

```bash
git fetch upstream
git merge upstream/master --strategy-option theirs
# Resolve conflicts manually, preserving ILP integration
```

**Conflicts Expected In:**
- Payment-related routes (removed in our fork)
- Configuration loading (modified for ILP)
- Database migrations (payment tables removed)

---

*Last Updated: 2025-11-25*
