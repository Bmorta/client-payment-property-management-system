# Database readiness implementation and verification

## Outcome

REMS now inspects actual MongoDB transaction support and required index definitions on startup. It records schema version **2** only after successful inspection and refuses to downgrade a newer verified schema. Reopening the app or restarting a correctly prepared server does not require another migration or backup. Routine transfers/account actions never use a backup completion flag as authorization.

This is implemented locally and not committed, pushed, merged or deployed. No actual office database, MongoDB service, record or index was changed. All executable database tests used disposable databases.

## Root causes

The [audit](database-readiness-audit.md) distinguishes genuine environment requirements from stale evidence and misleading guidance:

- Acer and other PCs can run separate local MongoDB services. Git pulls cannot configure or synchronize those databases. Standalone MongoDB genuinely cannot perform the transactions required for coordinated transfers and lifecycle changes.
- The old global unique property index genuinely blocks preserving the original contract and creating its replacement. Missing lifecycle fields also need an approved backfill.
- Installer and operation checks previously differed. Equivalent custom-named/equality-form indexes could be treated inconsistently.
- Startup did not verify the complete current index schema or persist a verified schema version. Development automatic indexing could attempt index creation before administrator review.
- A historical installer report could keep showing an old missing-index list after repair.
- Routine transfer, forfeiture, cancellation, commission and payment workflows did not directly require a fresh recovery-verified backup. Their one-time index-maintenance guidance led into the shared backup screen, making maintenance look like a recurring transaction requirement.
- A response completed after the client disconnected could leave the maintenance gate occupied. It now tracks controller response completion even on a closed socket; disconnect alone never clears an uncertain write.

## Corrective changes

1. One shared index comparator is used by installer, startup, guided maintenance and contract guards. Index names are not schema identity. Actual unique/sparse/partial/collation/TTL definitions and compound-key order are checked. Valid equivalent indexes are retained.
2. Startup connects with automatic business index/collection creation disabled. It inspects connectivity, writable replica/sharded topology, session transaction capability, current contract conflicts/lifecycles and every registered model's required index definitions. No migration is automatically executed.
3. Native `rems_schema_state` metadata stores successful verification time, expected-definition fingerprint and verified version. Actual inspection always overrides a stale Ready flag. Failed connectivity is displayed as unverified, not as proof of a missing replica set.
4. The existing administration screen now includes **System Health & Database Readiness** and a unified setup/repair preview. It shows connection, replica set, transactions, active-contract protection, expected/verified version, pending maintenance and last successful verification.
5. The repair preview lists missing indexes, retained equivalents, active-contract conflicts, invalid lifecycle values, index-name collisions and duplicate-key preflight findings. Conflicts are never automatically deleted, merged or reallocated.
6. Approved repair creates only missing indexes, preserves existing equivalents, transactionally backfills missing lifecycle values, and removes only identified obsolete global-property indexes after active protection exists. Final verification must pass before recording completion. Existing upgrade API result fields remain compatible.
7. Empty database initialization needs explicit setup approval but no backup. Existing populated schema maintenance uses the existing centralized recovery-verified backup, database/environment binding, file integrity, protected-data freshness and single-writer confirmation. No second backup system was created.
8. Schema-verification metadata is excluded from protected financial backup freshness checks. Financial records and financial indexes remain protected. Rechecking health alone no longer makes an otherwise valid maintenance backup stale.
9. Transfer, forfeiture, reopening/reactivation and inventory-clearance paths share current contract/transaction readiness checks. No routine backup guard was introduced. Existing approvals, previews, version checks, transaction atomicity, inventory validation, commissions and idempotency remain.
10. Windows setup uses the same comparator, verifies current structures, initializes fresh databases, and reports the expected schema version. The persisted setup assistant retains the shared comparator needed for later repair. Historical installation reports are explicitly labelled historical. Existing populated migrations still require administrator review; Windows service changes still require approval.

## Backup policy after this change

| Operation | Manual backup required? |
|---|---|
| Ordinary payments, client/property edits, commission actions | No |
| Lot transfer, forfeiture/cancellation approval, reopening/reactivation/replacement contract | No; actual transaction/index requirements and administrator approval still apply |
| Scheduled protection | Existing configured schedule retained |
| Populated database/index repair | Recovery-verified backup for the approved maintenance |
| Identifier bulk repair, advanced historical activation | Existing verified-backup safeguards retained |
| Mass penalty correction / simple historical activation | Existing automatic transaction-linked restore points retained |

No financial backup was accepted merely because a file exists. No financial formula was changed.

## Tests

| Check | Result |
|---|---|
| Backend suite | **319 discovered; 291 passed; 0 failed; 28 environment-gated skipped** |
| Readiness integration: standalone and replica set | Passed: read-only inspection, safe refusal of standalone/non-ready operations, empty initialization, populated legacy repair, equivalent indexes, duplicate active-contract refusal, stale/future schema flags, preserved original payments/payouts |
| Actual Node server startup twice against a ready disposable database | Passed; both starts reported Ready for Operations without migration prompts |
| Lot transfer integration, standalone and replica modes | 3 tests per mode passed, including concurrent destination claims, preserved receipts/payout history, duplicate prevention and equivalent-index retention |
| Forfeiture/reopening/reactivation/replacement integration | Replica workflow passed; standalone refusal passed; alternate-mode test entries were gated |
| Cancellation/credit/refund integration | Passed in standalone-refusal and replica modes |
| Real native backup/recovery and guided migration | 2 tests passed, including binding/environment/tamper/index-drift rejection, administrator permissions, record preservation, and readiness metadata not invalidating a matching backup |
| Recent client/commission/cash office integration | Passed |
| Installer configuration unit checks | 6 passed |
| Installer helper database integration | Passed for standalone refusal and replica initialization/preservation |
| Frontend production build | Passed; existing large-bundle advisory remains |
| Readiness panel DOM interaction | Passed: actual Ready display, stale installer evidence ignored, populated repair requires confirmation/backup, empty setup has no backup selector |
| Windows PowerShell source parsing | Engine, Setup and Build-Installer parsed successfully |

Hash checks against the pre-task checkpoint confirm that payment allocation, commission, financial reporting, settlement and installment schedule calculation files were preserved.

## One-time office action still required

After this update is published and installed:

1. Open **Administration → System Health & Database Readiness** on the computer hosting the office backend.
2. If it says **Ready for Operations**, no database upgrade or new backup is needed. Retry the original operation with a fresh preview and your normal approval.
3. If transaction support is missing, use **REMS Setup and Status → Office Server** on that host. Select its existing server `.env`; review and approve the supported MongoDB service repair once. The assistant preserves the database name and existing data. Do not reset MongoDB or create a guessed database.
4. If actual indexes/lifecycle structures need maintenance, inspect the UI repair plan. Review conflicts first. For a populated database, choose an eligible centralized recovery-verified backup (or create/verify one there), then explicitly approve that one-time maintenance. Wait for verified completion before retrying the original workflow.
5. Other office devices should connect to that office server. Choosing to run another independent local database requires initial setup for that separate server; Git does not transfer its data/configuration.

Actual office conflict counts and topology cannot be reported from this Linux test environment. The administrator must review the fresh findings on the real server before approving any populated migration.

## Remaining verification limits

- Actual Windows service installation, elevation, firewall behavior and reboot acceptance were unavailable. PowerShell parsing and Linux helper tests are not a Windows acceptance test.
- A native Windows EXE has source/build definitions but was not compiled, signed or deployed here. No Windows service was restarted here.
- Browser visual inspection, full responsive screenshots and office device connectivity remain unverified.
- The server cannot safely reconfigure a stopped Windows MongoDB service solely through a browser. Supported service repair belongs to the local administrator setup assistant.
- Database records are not synchronized between separate computers. A single authoritative office backend/database is the supported way to avoid repeated per-device database preparation.

## Modified files

- `client/src/components/BackupRequirementNotice.jsx`
- `client/src/components/DatabaseReadinessPanel.jsx`
- `client/src/pages/DatabaseMaintenancePage.jsx`
- `client/src/utils/workspaceNavigation.js`
- `docs/database-readiness-audit.md`
- `docs/database-readiness-results.md`
- `docs/windows-setup-implementation.md`
- `installer/lib/index-readiness.mjs`
- `installer/lib/setup-helper.mjs`
- `installer/windows/Engine.ps1`
- `installer/windows/Setup.ps1`
- `server/integration/database-maintenance.test.js`
- `server/integration/database-readiness.test.js`
- `server/src/server.js`
- `server/src/services/activeContractUpgrade.js`
- `server/src/services/cancellationService.js`
- `server/src/services/databaseMaintenance.js`
- `server/src/services/databaseReadiness.js`
- `server/src/services/forfeitureService.js`
- `server/src/services/lotTransferService.js`
- `server/src/services/maintenanceGate.js`
- `server/src/services/schemaMaintenance.js`
- `server/test/database-readiness.test.js`
- `shared/databaseIndexes.js`
