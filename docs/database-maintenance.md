# Database & Backups

Administrator screen: **Administration → Database & Backups** (`/database-maintenance`).

This change adds an integrated alternative to terminal-based routine backup and the existing Lot Transfer index migration. It does not migrate a database on startup or synchronize separate computers. Existing offline `node src/scripts/upgradeLotTransferIndex.js` remains preview-only by default and now shares the same inspection and upgrade service.

## Office workflow

1. Use one authoritative backend/database for all office devices. Stop other backend instances and external database writers before maintenance; confirm this on screen.
2. Check the displayed database name, transaction support, tools and pending upgrade. No database name needs to be guessed or replaced.
3. Select **Backup now**. REMS locates MongoDB Database Tools in PATH or the standard Windows Tools/100/bin installation. It pauses application requests that can change or reconcile records and waits for in-flight requests/background monitoring to finish.
4. The complete database is dumped, BSON checked, metadata parsed, and file hashes recorded. Source document counts/checksums and index signatures are captured. Existing backups are not overwritten.
5. Select **Verify recovery**, then confirm. REMS restores into a new randomly named `rems_recovery_*` database and compares documents, counts and indexes. It never restores onto the live namespace. The recovery copy is retained; disk cleanup is a separate reviewed administrator task.
6. Review active-contract conflicts and index changes. Select a recovery-verified backup, type the approval phrase and confirm. A fresh preview token, unchanged backup files and unchanged business records are required. The upgrade backfills missing lifecycle values, creates the partial unique active-contract index and removes only the obsolete global property index. No payment amounts, receipts, payout records or financial formulas are changed.
7. Watch the job status until UPGRADED. Failures remain visible for review; interrupted operations are not silently resumed.

Schedule backups at 12/24/48/168 hour intervals if desired. Scheduling is disabled by default, works while this backend is running, and never runs migrations or restores automatically. Keep a protected off-device backup copy. A local disk backup alone cannot protect against loss of that disk.

## Limits and one-time setup

- This is a single-backend maintenance gate, not a distributed database lock. Other direct database writers must be stopped. Multiple independent backends need coordinated deployment maintenance instead.
- MongoDB Database Tools must be installed once on the server. Windows replica-set/service installation still needs operating-system administrator setup; a webpage cannot safely configure arbitrary Windows services.
- Git transfers application code, not MongoDB records, uploaded assets, secrets or local backup schedules. Prefer connecting development devices to a shared development server. Keep development and production databases separate.
- Native database backups cover database records and indexes, not separately stored upload files or server environment configuration.
- Existing external backups remain intact. The screen manages backups created in its own folder; external-backup import is not implemented.
- Restore verification needs permission to create/list databases. Missing permission or tools fails safely.
- Source connection changes invalidate managed backup approval; create a fresh backup for that connection.
- Readiness previews can be expensive on large databases because the approval fingerprint checks actual records. Routine status only checks indexes/conflicts.

Default backup directory is the backend user's `Documents/REMS-Backups/managed`, outside the repository. Optional server settings: `REMS_BACKUP_DIR`, `REMS_MONGODUMP_PATH`, `REMS_BSONDUMP_PATH`, `REMS_MONGORESTORE_PATH`. No credentials are returned to the browser or written into job manifests. Keep backup directories private: they contain complete office data. Job manifests record the acting administrator, confirmations, timestamps and upgrade before/after results.

## Modified files

- `client/src/pages/DatabaseMaintenancePage.jsx` (new)
- `client/src/App.jsx`
- `client/src/utils/workspaceNavigation.js`
- `server/src/services/maintenanceGate.js` (new)
- `server/src/services/activeContractUpgrade.js` (new)
- `server/src/services/databaseMaintenance.js` (new)
- `server/src/controllers/maintenanceController.js` (new)
- `server/src/routes/maintenanceRoutes.js` (new)
- `server/src/services/monitoringService.js` (maintenance coordination only)
- `server/src/scripts/upgradeLotTransferIndex.js`
- `server/src/app.js`
- `server/src/server.js`
- `server/test/database-maintenance.test.js` (new)
- `server/integration/database-maintenance.test.js` (new)
- This document.

## Validation

- Client production build passes (existing bundle-size warning).
- Backend suite: 255 passed, 0 failed, 18 integration tests skipped without explicit test database settings. Dedicated native-tool maintenance integration passed separately.
- New gate/namespace/backup-reference tests pass.
- Existing Lot Transfer integration and preview/apply tests pass against disposable standalone and replica-set databases.
- New full native-tool backup → isolated restore/checksum/index verification → explicitly approved upgrade test passes against a disposable replica set. It verifies ADMIN-only access, read-only previews and preservation of receipts and commission payout data.
- No office database migration has been executed. Windows office acceptance and interactive browser validation remain to be performed after review/publishing.

## System-wide integration

See [system-wide-backup-audit.md](system-wide-backup-audit.md) for the operation inventory, shared eligibility checks, advanced migration selector, financial restore-point history, reviewed identifier maintenance, safe return navigation, tests and remaining OS-level boundaries. The ID and index CLI commands now require actual managed recovery proof; arbitrary backup-reference text is insufficient.
