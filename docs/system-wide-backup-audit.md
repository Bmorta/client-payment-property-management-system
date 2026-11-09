# System-wide backup audit and centralized integration

## Scope and safety

This extends the existing Administration → Database & Backups screen. It does not add another backup engine, automatically restore a database, apply migrations at startup, or require backups for routine transactions. All live operations still require their existing authorization, previews, confirmations, reconciliation and transaction safeguards.

Implementation has not been committed, pushed or deployed. All exercised database changes were in disposable test databases. Office migrations and restores remain subject to explicit administrator approval.

## Audit and implementation status

| Module / operation | Existing dependency | Integration | Status |
|---|---|---|---|
| Lot Transfer active-contract index | Reviewed upgrade; backup reference; new active index | UI proof checks retained and strengthened; CLI now requires managed recovery proof and stopped-writer confirmation | Integrated |
| Lot Transfer posting | Index readiness and replica-set transactions | Structured error opens central readiness screen; no per-transfer backup added | Integrated guidance |
| Historical Simple Import | Automatic transaction-linked EJSON restore point | Existing protection retained; history/storage visible centrally; failures link to central screen | Integrated visibility; snapshot engine preserved |
| Historical Advanced Activation | Previously accepted typed backup/recovery references | Recovery-verified backup selector; actual files, environment, database, source data/indexes rechecked before activation and inside the posting transaction | Integrated |
| Historical staging, Excel preview, drafts | No backup | Unchanged | No requirement |
| Penalty recalculation, including client/all-account scope | Automatic verified restore point, previews and transaction requirements | Restore-point history centrally visible; backup and readiness failures link to central screen | Integrated visibility; snapshot engine preserved |
| Client ID reconciliation | Offline script; recommended backup | Reviewed UI preview/apply; managed proof; per-record journal; duplicate submission protection; CLI shares same service | Integrated |
| Internal ID backfill | Offline script; recommended backup | Same UI/service, existing ID conflict checks retained; embedded payment/payout IDs are inspected, not rewritten | Integrated |
| Replica-set Windows setup | Privileged cold-backup PowerShell helper | Central readiness and actionable guidance | OS-level setup remains separate; not executed |
| Ordinary payments/client edits | No explicit backup requirement | No requirement added | Unchanged |
| Agents, agreements, commissions and payouts | Existing approvals, financial/audit guards | No blanket backup requirement added | Unchanged |
| Cancellations, payment credits and refunds | Existing administrator and transaction guards | Transaction-readiness failures link to central screen | Integrated guidance only |
| Cash movements, expenses, remittances and office payouts | Existing financial/transaction guards | Cash transaction-readiness failures link to central screen; no backup prompts added | Integrated guidance only |
| Projects, inventory, phase/block/lot deletion | Linked-record eligibility and deletion controls | No blanket backup requirement added; existing eligible physical deletion not expanded | Unchanged |
| Reports, printing and Excel exports | No backup | No requirement added | Unchanged |
| Administration/users/company settings | Existing permissions; separate initial-admin seed | No routine backup requirement added | Unchanged |
| Background monitoring | Existing reconciliation timer | Prior maintenance gate retained | Unchanged |
| Scheduled backups | Existing opt-in native backup scheduler | Environment identity and successful verification audit records added | Integrated |

## Eligibility and recovery policy

- Native backup states distinguish file verification from completed isolated recovery verification. File presence alone never authorizes protected maintenance or advanced activation.
- Proof binds the actual database name, hashed connection identity and backend environment (`NODE_ENV`, plus optional `REMS_ENVIRONMENT`, default `default`). Connection/environment credentials are not returned to the UI.
- Eligibility rehashes backup files and compares protected collection data and index signatures. Source changes invalidate eligibility. Mere elapsed time does not introduce an arbitrary new expiry window.
- Workflow metadata (`activitylogs`, `migrationconfigs`, `migrationbatches`) is excluded from the shared financial-proof source fingerprint. Migration configuration, batch reconciliation and approvals have independent version/token checks. The existing index-upgrade path also retains its stricter unchanged-source check.
- Existing eligible proof can be reused; successful native backups are not duplicated automatically when a protected workflow is resumed.
- Old free-text references and managed backups lacking environment evidence cannot authorize the new guarded paths. Create and verify a managed backup once for that environment.
- The financial restore-point service remains transaction-linked. Its central history explicitly says VERIFIED_AT_CREATION, not freshly verified, and old manifests are marked for review. These snapshots are not accepted as recovery-tested native database backups.
- Backup creation, recovery verification and successful index upgrades create standard Activity Log records in addition to existing job manifests. Identifier maintenance journals request IDs, approved proof, individual records and completion/failure. Historical activation retains its selected backup ID in activation history. Existing penalty runs retain restore-point IDs.

## Administrator experience

Backup/readiness errors contain a structured `/database-maintenance` destination. Administrators can open it in a new tab, preserving the original form. Staff receive administrator guidance rather than an unusable admin-only link. No failed financial request is replayed.

Return links accept local paths only and reject external URLs, backslashes, login and recursive maintenance destinations. The central screen offers a return link, while the existing tab retains unsaved state. Returning administrators must refresh the original preview and confirm again. Advanced migration configuration refreshes its verified-backup list on browser focus and on request.

Identifier maintenance is explicitly selected and previewed. It fills only missing top-level IDs, retains established generator behavior and conditional writes, and journals each record. It does not pretend a multi-record offline backfill is atomic: if stopped partway, the journal preserves completed changes, that request is not replayed, and a fresh review/backup is required before a new attempt.

## Remaining boundaries

- Windows service installation, replica-set configuration and operating-system folder permissions still need an authorized server administrator. No webpage silently elevates privileges.
- Snapshot size/permissions failures are not bypassed by presenting a full backup. Transaction-linked financial snapshots retain their existing limit. A streaming replacement requires separate review rather than weakening this safeguard.
- Uploaded filesystem assets and environment configuration are not included in native MongoDB backups. No production-restore button or external-backup import has been added.
- The maintenance gate coordinates this backend only. Other database writers must remain stopped during reviewed maintenance.
- Same-day timestamps alone do not establish eligibility. A source-changing transaction can require a new backup even when the previous backup is recent.
- Office Windows/LAN acceptance remains to be performed after review and publication. No live accounts were inspected or altered.

## Modified files for this integration

Frontend:
- `client/src/App.jsx`
- `client/src/services/api.js`
- `client/src/utils/backupNavigation.js` (new)
- `client/src/components/BackupWorkflowLink.jsx` (new)
- `client/src/components/BackupRequirementNotice.jsx` (new)
- `client/src/components/VerifiedBackupField.jsx` (new)
- `client/src/components/IdentifierMaintenanceTools.jsx` (new)
- `client/src/pages/DatabaseMaintenancePage.jsx`
- `client/src/pages/HistoricalMigrationPage.jsx`
- `client/src/pages/HistoricalMigrationAdvanced.jsx`

Backend:
- `server/src/services/backupRequirement.js` (new)
- `server/src/services/databaseMaintenance.js`
- `server/src/services/restorePoint.js`
- `server/src/services/identifierMaintenance.js` (new)
- `server/src/services/lotTransferService.js` (readiness guidance only)
- `server/src/services/cancellationService.js` (readiness guidance only)
- `server/src/services/cashMovementService.js` (readiness guidance only)
- `server/src/controllers/migrationController.js`
- `server/src/controllers/penaltyOperationsController.js` (readiness guidance only)
- `server/src/controllers/maintenanceController.js`
- `server/src/routes/maintenanceRoutes.js`
- `server/src/middleware/errorHandler.js`
- `server/src/scripts/reconcileClientIds.js`
- `server/src/scripts/backfillInternalIds.js`
- `server/src/scripts/upgradeLotTransferIndex.js`

Tests/documentation:
- `server/test/backup-navigation.test.js` (new)
- `server/integration/database-maintenance.test.js`
- `server/integration/historical-migration.test.js`
- `server/integration/lot-transfer.test.js`
- This audit report and `docs/database-maintenance.md`.

## Test results

- Backend suite: **257 passed, 0 failed, 19 skipped**. Integration tests requiring explicit disposable database settings are skipped in the default suite and were run separately for affected workflows.
- Native-tool integration: **2 passed**. Covers full dump, isolated restore and proof verification; database/environment mismatch; tampered files; data/index drift; free-text CLI rejection; permissions; read-only previews; identifier backfill and replay protection; financial restore-point history.
- Historical migration HTTP integration: **1 passed**, including denial of unverified backup references, preparation drafts, reconciliation, original payment dates, transactional activation, duplicate prevention and protected corrections.
- Lot Transfer integration: **2 passed on standalone and 2 passed on replica-set MongoDB**, including no mutation during previews and retained receipts/payout history.
- Current penalty-rule integration: **1 passed on standalone and 1 passed on replica-set MongoDB**, including restore safeguards, payment/report agreement and reconciliation protections.
- Component checks passed for local return navigation, central restore-point history, disabled unapproved identifier execution, verified backup selection, structured guidance and no automatic request replay.
- Frontend production build passed with the pre-existing bundle-size warning.
- No live migration, financial correction or restore was executed. Native tool runs used Linux test binaries and disposable MongoDB; office Windows acceptance remains pending.
