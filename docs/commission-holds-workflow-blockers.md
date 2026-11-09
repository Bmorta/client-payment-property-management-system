# Contract workflow blockers and commission release holds

Status: implemented locally; not committed, pushed, merged or deployed. The office database was not accessed or migrated. Prior work was preserved in the pre-feature checkpoint.

## Root causes established from code

1. `approveForfeitureAction` ran full transaction/index readiness before every action, including review-only labels. That incorrectly made a metadata review depend on a property-history index migration.
2. Index-upgrade errors used `BACKUP_REQUIREMENT`, making an actual database-index issue appear to be an ordinary backup prerequisite.
3. Index inspection recognized only one index name rather than equivalent valid uniqueness protection. The reviewed upgrade could also try to recreate an already equivalent index under another name.
4. Cancellation/forfeiture previews rejected open commission vouchers, recovery balances and historical verification instead of retaining them as separate commission work.
5. Commission earning/payout status had no consistent review-related release gate across register snapshots, direct APIs, vouchers and bulk selection.

These findings describe the code paths. Whether the office database still needs its one-time upgrade must be determined by the existing administration preview; no live conflict scan or migration was performed here.

## Backup and maintenance audit

| Operation | Previous behavior | Updated behavior |
| --- | --- | --- |
| Mark/reject/withdraw forfeiture review | Shared transaction/index upgrade guard, misleading backup-category error | Atomic single-contract review update with version check; no backup, migration or replica-set prerequisite |
| Preliminary cancellation review | No independent review/withdrawal action | Administrator start/reject/withdraw review with atomic hold/audit update; no financial reservation or backup |
| Final forfeiture, reopening, reactivation | Transaction/index checks reported as backup requirement | Preserve actual transaction/index/conflict checks; use distinct CONTRACT_INDEX_UPGRADE guidance |
| Ordinary lot transfer | Actual index upgrade reported as backup requirement | Same integrity gate with accurate maintenance classification; recognize equivalent valid active index |
| Cancellation approval | No manual backup prerequisite, but commission blockers | No new backup prerequisite; unresolved commissions are nonblocking warnings and releases are held |
| Cancelled lot release for resale | Legacy-index guard | Verify actual active-contract uniqueness protection; actual missing protection requires one-time maintenance |
| Payments, client edits, routine inventory, ordinary commissions, normal cash transactions, reports/printing | No direct verified-backup prerequisite found | Preserved; no new backup calls or automatic per-transaction backups |
| Reviewed index upgrade | Centralized backup/recovery proof and explicit approval | Preserved; reuse an equivalent valid existing index, verify derived completion and retain real conflict detection |
| Historical production activation / bulk financial corrections | Existing centralized backup or transaction-linked restore point protections | Preserved; no financial protection or formula removed |
| Manual/scheduled backup, verification and recovery | Existing centralized utility | Preserved; no backup files removed and no duplicate backup service added |

The routine services did not have a direct `assertEligibleBackup` requirement to remove. The change removes review-only migration prerequisites and misleading backup classifications, while preserving genuine maintenance safeguards.

## Commission behavior

- Contract-specific live holds derive from preliminary cancellation review, approved pending cancellation, current forfeiture review, or final closed lifecycle.
- Unreleased money stays earned/unreleased; release eligibility becomes zero. Existing earned values, actual payouts, recovery amounts and source receipts remain unchanged.
- Register queries overlay current hold state on stored commission snapshots, so a stale background snapshot cannot permit a release.
- Direct releases, voucher preparation/approval and voucher-backed releases enforce the hold on the backend. Version checks serialize review changes against payout writes; competing stale requests cannot both commit.
- Register checkboxes and release controls are disabled, gray and labeled. Held records are removed from visible bulk selection after refresh. Agent detail uses the same ledger and controls.
- Old released records and voucher printing remain accessible. Approved historical payout evidence can still be recorded through its existing separate reconciliation rules; a hold never creates a new cash payout.
- Held payout corrections cannot increase a payout or move it to a different effective date/method/funding classification. Authorized reduction/void and recovery workflows remain available under existing rules.
- Rejecting/withdrawing a preliminary review removes only that review's restriction. Concurrent review, historical verification, recovery or final closed-contract restrictions remain enforced. No payout happens automatically.
- Original reactivation records a reactivated review outcome so the old forfeiture-review hold does not remain accidentally active. Replacement contracts do not inherit the old commission liabilities.
- Unreadable commission agreements become nonblocking contract warnings. Their stored financial records remain available with payout eligibility blocked pending separate reconciliation.

## Access, audit and reporting

Client Account → property details now includes Cancellation Review & Commission Hold. Start, reject or withdraw a preliminary review there. Forfeiture review/approval continues through the existing Forfeiture Actions component. Existing contract/penalty approvals and legal/contractual safeguards remain intact.

Hold history stores the contract/client/property links, agent IDs, original monetary/status values, added/removed restrictions, review outcome, administrator, reason and dates. It is available in contract history and commission detail and accompanies the normal activity audit. Commission exports include Release Hold; cancellation previews and matching reports show nonblocking commission warnings.

Forms retain input after failed validation. Requests are not automatically replayed after resolving maintenance or network errors.

## Validation

- Backend suite: 282 passed, zero failed, 23 environment-gated skipped (305 total).
- New integration suite passed on disposable standalone MongoDB and a replica set: review on an unmigrated database and inaccessible backup path, current register holds, direct/voucher/bulk rejection, other-contract isolation, review withdrawal, real maintenance classification, equivalent valid index recognition, final forfeiture/cancellation with unsettled commissions, preserved payouts, and concurrent review versus payout.
- Focused UI checks passed: disabled checkbox/release with explanations, unaffected contract selectable, stale bulk selection removed, history/view available, no financial submission.
- Existing forfeiture standalone/replica and cancellation integrations passed during this work.
- Existing lot-transfer/index tests passed in standalone/replica modes, commission reconciliation passed, and centralized backup/recovery/approved-maintenance integration passed on disposable databases.
- Production frontend build passed with its existing bundle-size warning.

## Remaining boundaries

- A genuine legacy/missing index, real active-contract conflict, or missing transaction support still blocks inventory-changing approval. Use the existing one-time administration preview and approve the required maintenance separately. Nothing was auto-migrated.
- Preliminary review withdrawal is not a reversal of an approved financial cancellation case. An already approved reservation/refund remains an independent hold and cannot be erased with a metadata-review action.
- Windows office/LAN visual acceptance remains pending. No production records were used for testing.

## Modified files

- `client/src/components/BackupRequirementNotice.jsx`
- `client/src/components/CancellationReviewHold.jsx`
- `client/src/components/CancellationWorkspace.jsx`
- `client/src/components/ClientAccounts.jsx`
- `client/src/components/CommissionLedger.jsx`
- `client/src/components/CommissionRecord.jsx`
- `client/src/components/CommissionVouchers.jsx`
- `client/src/components/ForfeitureActions.jsx`
- `client/src/services/api.js`
- `server/integration/commission-holds.test.js`
- `server/src/controllers/commissionController.js`
- `server/src/controllers/commissionReportController.js`
- `server/src/controllers/commissionReviewController.js`
- `server/src/controllers/commissionVoucherController.js`
- `server/src/controllers/forfeitureController.js`
- `server/src/controllers/monitoringController.js`
- `server/src/models/PropertyAssignment.js`
- `server/src/routes/financeRoutes.js`
- `server/src/services/activeContractUpgrade.js`
- `server/src/services/backupRequirement.js`
- `server/src/services/cancellationService.js`
- `server/src/services/commissionVoucherService.js`
- `server/src/services/databaseMaintenance.js`
- `server/src/services/forfeitureService.js`
- `server/src/services/lotTransferService.js`
- `server/src/utils/cancellationMath.js`
- `server/src/utils/commissionHold.js`
- `server/src/utils/commissionLedger.js`
- `server/src/utils/commissionWorkflowWarnings.js`
- `server/src/utils/listReport.js`
- `server/test/commissionHold.test.js`
- `shared/cancellationReport.js`
- `docs/commission-holds-workflow-blockers.md`
