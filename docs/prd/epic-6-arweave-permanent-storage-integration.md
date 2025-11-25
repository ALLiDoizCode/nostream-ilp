# Epic 6: Arweave Permanent Storage Integration

**Goal:** Integrate Arweave permanent storage for large content and event backups, implementing hot/cold storage tiers with bundled ILP+Arweave pricing. This epic reduces long-term storage costs and provides permanent data preservation.

## Story 6.1: Set Up Arweave Wallet Management

**As a** developer,
**I want** Arweave wallet integration in Nostream,
**so that** the relay can upload data to Arweave network.

**Acceptance Criteria:**
1. Install arweave-js package: `npm install arweave`
2. Create wallet manager: `src/integrations/arweave-wallet.ts`
3. Load wallet from JWK file (environment variable: `ARWEAVE_WALLET_PATH`)
4. Initialize Arweave client:
   ```typescript
   import Arweave from 'arweave';

   const arweave = Arweave.init({
     host: 'arweave.net',
     port: 443,
     protocol: 'https'
   });
   ```
5. Implement methods:
   - `getBalance() -> Promise<string>` - Query wallet AR balance
   - `uploadData(data, contentType, tags) -> Promise<string>` - Upload and return tx_id
6. Add Arweave tags: App-Name, App-Version, Nostr-specific tags
7. Unit tests with mocked Arweave API
8. Integration test with Arweave testnet (upload small test file)

## Story 6.2: Implement Bundled Pricing Calculator

**As a** developer,
**I want** pricing that bundles relay fees + Arweave storage costs,
**so that** users pay once for both services.

**Acceptance Criteria:**
1. Pricing module: `src/services/bundled-pricing.ts`
2. Configuration:
   ```yaml
   arweave:
     storage_cost_per_mb_msats: 5000  # Fixed cost operator sets (includes AR purchase + margin)
   payments:
     fee_schedules:
       per_kind:
         default: 100  # msats relay fee
         30023: 500    # Long-form content
         1063: 1000    # File metadata
         71: 2000      # Video
   ```
3. Cost calculation function (all costs in msats):
   ```typescript
   interface EventCost {
     relayFee: number;        // msats - relay processing fee
     arweaveCost: number;     // msats - Arweave storage cost
     sizeFee: number;         // msats - additional fee for large content
     total: number;           // msats - total payment required
   }

   calculateBundledCost(kind: number, contentSize: number): EventCost
   ```
4. Per-kind multipliers applied to relay fee
5. Size-based fees (free first 1MB, then `storage_cost_per_mb_msats` per MB)
6. Returns cost breakdown for transparency (all in msats)
7. **Note**: Client responsibility to show USD/AR equivalents using their own price feeds
8. Operator manually updates `storage_cost_per_mb_msats` based on current AR market prices
9. Unit tests validate calculations
10. Documentation explains pricing model and operator cost-setting process

## Story 6.3: Add Arweave Reference Tags to Nostr Events

**As a** developer,
**I want** Nostr events to reference Arweave transaction IDs,
**so that** large content can be retrieved from permanent storage.

**Acceptance Criteria:**
1. Define tag format for Arweave references:
   ```json
   {
     "tags": [
       ["arweave", "tx_id_43_characters"],
       ["arweave-size", "1024576"],
       ["arweave-url", "https://arweave.net/tx_id"],
       ["content-type", "text/markdown"]
     ],
     "content": ""
   }
   ```
2. For kind 1063 (file metadata), use `url` tag: `["url", "ar://tx_id"]`
3. Event validator accepts empty content if arweave tag present
4. Document supported event kinds for Arweave storage:
   - Kind 30023: Long-form content
   - Kind 1063: File metadata
   - Kind 71, 22: Video events
   - Kind 20: Pictures
5. Client helper documentation for creating Arweave-backed events
6. Unit tests validate tag format

## Story 6.4: Implement Upload Endpoint with Payment Verification

**As a** developer,
**I want** HTTP endpoint for uploading content to Arweave with ILP payment,
**so that** clients can store large content permanently.

**Acceptance Criteria:**
1. REST endpoint: `POST /api/arweave/upload`
2. Request body:
   ```json
   {
     "content": "base64_encoded_content",
     "kind": 30023,
     "tags": [["title", "My Article"]],
     "pubkey": "user_pubkey"
   }
   ```
3. Flow:
   - Calculate bundled cost (relay + Arweave)
   - Create ILP payment quote via Dassie RPC
   - Return quote to client with breakdown
   - Wait for payment confirmation (WebSocket or polling)
   - Upload to Arweave
   - Return tx_id to client
4. Quote endpoint: `POST /api/arweave/upload/quote`
5. Payment timeout: 5 minutes
6. Error handling: Payment timeout, Arweave upload failure, insufficient payment
7. Integration test: Full upload flow with payment

## Story 6.5: Implement Automatic Daily Backup to Arweave

**As a** developer,
**I want** automatic daily backups of all events to Arweave,
**so that** relay data is preserved permanently.

**Acceptance Criteria:**
1. Backup service: `src/services/arweave-backup.ts`
2. Runs daily (configurable schedule)
3. Query events from previous day (created_at range)
4. Bundle events as NDJSON (newline-delimited JSON)
5. Compress with gzip
6. Upload to Arweave with tags:
   ```typescript
   [
     { name: 'Backup-Type', value: 'nostr-events' },
     { name: 'Relay-Name', value: process.env.RELAY_NAME },
     { name: 'Event-Count', value: count.toString() },
     { name: 'Date-Range', value: 'YYYY-MM-DD to YYYY-MM-DD' }
   ]
   ```
7. Store backup reference in database:
   ```sql
   CREATE TABLE arweave_backups (
     tx_id VARCHAR(43) PRIMARY KEY,
     event_count INTEGER,
     start_date TIMESTAMPTZ,
     end_date TIMESTAMPTZ,
     created_at TIMESTAMPTZ
   );
   ```
8. Alert if backup fails
9. Integration test with Arweave testnet

## Story 6.6: Implement Hot/Cold Storage Tier Management

**As a** developer,
**I want** automatic archival of old events from PostgreSQL,
**so that** relay storage costs are minimized.

**Acceptance Criteria:**
1. Configuration: `ARWEAVE_HOT_STORAGE_DAYS` (default: 90)
2. Daily cleanup job:
   - Query events older than 90 days
   - Verify events exist in Arweave backup (check arweave_backups table)
   - Delete from PostgreSQL (keep only event ID + arweave reference)
   - Log archival count
3. Stub record remains in database:
   ```sql
   -- Original event deleted, stub inserted
   INSERT INTO archived_events (id, created_at, arweave_backup_tx)
   VALUES ('event_id', timestamp, 'backup_tx_id');
   ```
4. REQ handler checks archived_events table
5. If archived event requested, return with `arweave` tag pointing to backup
6. Dashboard shows: Hot storage size, archived event count, storage savings
7. Integration test validates archival and retrieval

## Story 6.7: Add Arweave Configuration and Monitoring

**As an** operator,
**I want** Arweave wallet balance monitoring and alerts,
**so that** I'm warned before uploads fail due to insufficient AR.

**Acceptance Criteria:**
1. Configuration in `.nostr/settings.yaml`:
   ```yaml
   arweave:
     enabled: true
     wallet_path: /path/to/arweave-keyfile.json
     min_balance_ar: 1.0
     required_kinds: [30023, 1063, 71, 22, 20]
     backup:
       enabled: true
       frequency: daily
       retention_days: 90
   ```
2. Balance monitoring (hourly check):
   - Query wallet balance
   - Alert if < `min_balance_ar`
   - Log balance to economic_snapshots
3. Dashboard displays:
   - Current AR balance
   - Estimated days remaining (based on upload rate)
   - Total data uploaded to Arweave
   - Backup status (last backup time, event count)
4. Alerts: Low balance, backup failures, upload errors
5. Integration test validates monitoring

## Story 6.8: Implement Backup Restoration Process

**As an** operator,
**I want** to restore events from Arweave backups,
**so that** I can recover relay data after catastrophic failure or migrate to new infrastructure.

**Acceptance Criteria:**
1. Restoration script created: `scripts/restore-from-arweave.ts`
2. Command-line interface:
   ```bash
   # Restore specific backup
   npm run restore -- --tx-id <arweave_tx_id>

   # Restore date range
   npm run restore -- --start-date 2024-01-01 --end-date 2024-01-31

   # List available backups
   npm run restore -- --list
   ```
3. Restoration flow:
   - Query arweave_backups table for available backups (or fetch from Arweave by date tags)
   - Download backup from Arweave: GET `https://arweave.net/<tx_id>`
   - Decompress gzip data
   - Parse NDJSON (newline-delimited JSON events)
   - Validate each event signature
   - Check for duplicates (skip if event ID already exists)
   - Insert events into PostgreSQL
   - Report: Events restored, duplicates skipped, errors encountered
4. Progress indicator for large backups (show % complete)
5. Dry-run mode: `--dry-run` flag validates backup without importing
6. Conflict resolution:
   - Skip existing events by default
   - `--overwrite` flag to replace existing events
   - `--merge` flag to preserve newer version (by created_at)
7. Rollback capability: Transaction-based import (all or nothing per backup file)
8. Logging: All restoration operations logged with timestamp, tx_id, event count
9. Error handling:
   - Invalid backup format → abort with clear error
   - Network failure downloading from Arweave → retry 3 times
   - Database connection failure → abort, no partial restore
10. Integration test:
    - Create backup via Story 6.5
    - Clear events from database
    - Restore from Arweave backup
    - Verify all events restored correctly
    - Verify duplicate detection works

---
