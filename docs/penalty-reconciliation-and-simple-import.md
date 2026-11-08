# Penalty reconciliation, bulk waivers and simplified historical import

Implemented locally after published commit `354e5a281d9bd7b8c07d91b851684c234b0413ce`. This update has not been committed, pushed, merged or deployed. No office database was accessed.

## Findings and root causes

1. The supplied screenshot repeats installment numbers and amounts, but the visible cycle dates differ (June 13, July 13, August 13, etc.). Those rows alone are not proof of duplicate charges: the configured rules accrue an independent simple monthly penalty for each unpaid installment.
2. A genuine duplicate-import path existed: historical assessments were materialized as `HPA-<source-row-id>`, while duplicate checks primarily handled payment receipts. Two source rows for the same installment/cycle could therefore become two assessments. New staging validation rejects these collisions; stored legacy collisions have an administrator-reviewed reconciliation path.
3. The ledger already uses actual `paymentDate`, not `createdAt`, for chronological payment and grace checks. New tests confirm a payment made within grace but encoded later receives no automatic penalty. Explicit imported penalty rows could still carry incorrect charges; the recalculation preview can identify charges inside grace or after principal was fully paid, and correct documented monthly amounts against configured contract terms.
4. A misleading classification was confirmed: even a tiny early partial allocation could label an installment Paid in Advance after its remaining balance was paid late. That label now requires the full scheduled installment to have been allocated in advance. This label correction does not erase legitimate earlier penalties.
5. Assessment audit events are changes to charges, not additional charges. The paginated audit view now says so explicitly.

The actual payment dates and source rows from the user's live account remain unverified. No claim is made that every visible row in that account is a duplicate.

## Completed changes

### Bulk penalty waivers

- Open a property account's Penalty Breakdown, or expand its installment in Client Penalty Monitoring.
- Administrators can filter/search, select rows across pages, select all filtered outstanding records, and enter partial waiver amounts.
- One optional batch note; no separate reason per row.
- A preview shows selected count and total. Approve Waiver applies the entire selection in one account compare-and-swap update.
- Batch submission IDs and signatures prevent repeat application. Paid or already-waived amounts cannot be waived again.
- Original charges and payments remain intact; individual waivers and the batch approval record actor and timestamp.

Bulk waiver scope is one property account per approval, matching the existing authoritative account document. Select another property separately.

### Pagination and totals

- Shared 10 / 25 / 50 / 100 rows-per-page controls, default 25, numbered pages, Previous/Next and record counts.
- Account penalty breakdown and audit histories load bounded pages from the backend. Client history and monitoring groups also paginate on the backend; expanding an installment retrieves its paginated account cycles.
- Payment penalty selection retains installment/cycle grouping, selection across pages and full-result totals.
- Lifetime-to-date assessed, applied paid, waived and outstanding totals remain separate from filtered totals. They are calculated before pagination by the same ledger used throughout the application.
- The allocation detail endpoint no longer sends the complete account penalty history; the dedicated paginated view supplies it.
- Existing print and Excel report filters and totals remain supported.

### Controlled recalculation

Administrators can preview one property, one client or all accounts. The preview shows:
- Current and corrected totals, plus the old monitoring snapshot where present.
- Legitimate/duplicate assessment IDs and duplicated amounts.
- Linked payments, receipts and waivers.
- Invalid-date/settled-principal charges and contractual amount adjustments.
- Before/after payment allocations.
- Exceptions requiring attention.

Approval records reversals/exclusions, aliases and amount overrides separately from immutable source rows; it does not delete original assessments, payments, waivers or receipts. Derived account allocations and monitoring are refreshed through the existing audited services.

True duplicate reconciliation, contractual financial corrections and multi-account application require MongoDB transaction support. Ordinary one-account refreshes can use the existing atomic document update. An unavailable safety mechanism produces an actionable error without partial financial posting.

A verified server-side restore point is created before application. Existing overpayments, excessive waivers or ambiguous older mixed AUTO allocations are flagged; unsafe changes remain blocked for administrator review. No automatic refund or unapproved transfer to principal is issued.

### Database safeguards

- New `PenaltyCycleIdentity` registry has a deterministic key and a unique compound index on account, installment, cycle date and penalty type.
- Financial monitoring snapshot writes reject duplicate active cycle keys before writing. The registry participates in existing MongoDB transactions where applicable; account version checks remain the financial concurrency guard.
- The registry stores identities, not a second monetary ledger. Reports continue to derive amounts from the existing account ledger.
- New account fields: `penaltyReconciliation`, `penaltyRecalculationRuns`, `penaltyWaiverBatches`. They are optional for existing records.
- Reconciliation preserves raw historical rows and audit history, with explicit approved exclusions, aliases and overrides.
- Duplicate installment numbers in a schedule are rejected rather than generating repeated automatic cycles. Correct an invalid schedule through the existing agreement editor.

There is no destructive schema migration or database reset. Restart the server to load the model/index definitions. Reconciliation of existing office records must be explicitly previewed and approved by an administrator; it does not run automatically on startup.

### Individual and group acknowledgments

- Property count is based on distinct account IDs in the batch, including lookup support for older batches.
- One-property payments show View Individual Acknowledgment.
- Multi-property batches show View Group Acknowledgment.
- Installment allocation count does not determine whether a group action appears.
- New payments record `batchAccountCount` and `postedAt`. Allocation details distinguish actual payment date, encoding timestamp and posting timestamp; unavailable legacy timestamps are labeled.

## Simplified historical import: how to use

1. Open **Historical Data Migration**. The normal screen is now **Historical Data Import**.
2. Find the existing client/property account and choose **Open Import**. Create a missing client/contract through Clients first. The existing one-property-account-per-workbook/batch design is preserved.
3. **Import Data:** encode original payment date, receipt, amount, type and method; or download the existing Excel template with samples, upload it, inspect errors and save selected valid drafts. Edit saved payment drafts here. No technical backup references, supporting documents or routine written reasons are required to save ordinary drafts.
4. **Review:** inspect counts, historical total, duplicate/invalid records, remaining principal and applicable penalties. Correct any errors. Original dates, source rows and receipt references remain visible.
5. **Approve & Import:** an administrator reviews the final confirmation. The server validates again, creates and verifies a private restore point, and imports atomically into the existing client-property account. A successful batch becomes Completed.
6. Original dates and receipts remain in actual client payment history. Encoding and posting timestamps remain separate. Historical collections do not become cash received on today's encoding date.
7. Historical commission payout uncertainty remains held for verification. No automatic commission release occurs.
8. **Advanced Settings & Records** retains the older configuration, documented penalty/commission rows, supporting documents and exceptional reconciliation tools.

The simplified workflow replaces the older repeated Submit → Verify → Activate gates. It honors an official cutoff when one exists; otherwise the administrator reviews the staged original-record through-date for that batch. The approved effective cutoff, final reconciliation summary, approving administrator and restore-point ID are retained. Drafts remain nonfinancial until final approval.

## Restore points

Private EJSON data snapshots and SHA-256 manifests are written under `backups/` relative to the running server, or the `FINANCIAL_BACKUP_DIR` environment path. Files are read back and checked before posting; transactional bulk snapshots use the same database session. These are data restore points, not a claim that an end-to-end infrastructure disaster-recovery exercise was performed.

The folder is ignored by Git and has no HTTP download endpoint. An unwritable folder, unsupported database transactions or failed verification stops the financial operation with an actionable message. Ordinary staff do not enter backup or recovery references.

## Validation

- Backend suite: **201 total, 196 passed, five environment-dependent skips, zero failures**.
- Extended HTTP integration passes separately against disposable standalone and replica-set MongoDB. Covers bulk waiver authorization, concurrent/repeated requests, full totals across pages, duplicate reversal, client/all-account recalculation, unchanged source records, automatic restore points, backup failure rollback, native cycle-index uniqueness, simple import, original dates, commission verification holds, duplicate import prevention and standalone safety refusal.
- Existing historical migration, buyer payment, company/report/voucher and retroactive commission HTTP regressions passed on disposable databases.
- Unit cases cover timely-but-late-encoded payments, partial/advance payments, repeated cycles, duplicate source IDs, duplicate schedules, linked penalty payments/waivers, blocked overpayments, invalid historical assessment reversals, contract-based amount adjustments and correct Paid in Advance classification.
- React DOM checks pass for cross-page bulk selections, optional notes, preview/approval, individual versus group actions, the three-step wizard, final administrator confirmation, original date preservation and bounded large-cycle rendering.
- Production build passes with the existing nonfatal bundle-size advisory. `git diff --check` passes.
- No real office records, refunds, payouts, property releases or live migrations were performed.

Browser visual acceptance on the office desktop/mobile and physical printing still need checking. The new controls were exercised with DOM tests, not a claim of live-office browser verification.

## Modified and new files

- `.gitignore`
- `client/src/components/AccountMonitoringDetails.jsx`
- `client/src/components/ClientPenaltyWorkspace.jsx`
- `client/src/components/GroupedPenaltySelection.jsx`
- `client/src/components/PagedAccountPenalties.jsx`
- `client/src/components/Pagination.jsx`
- `client/src/components/PaymentAllocationDetails.jsx`
- `client/src/components/PaymentBatchAcknowledgment.jsx`
- `client/src/components/PaymentTable.jsx`
- `client/src/components/PenaltyMonitoring.jsx`
- `client/src/components/PenaltyRecalculation.jsx`
- `client/src/components/PropertyPaymentCheckout.jsx`
- `client/src/components/PropertyPaymentHistory.jsx`
- `client/src/pages/HistoricalMigrationAdvanced.jsx`
- `client/src/pages/HistoricalMigrationPage.jsx`
- `client/src/utils/printAccountReports.js`
- `docs/penalty-reconciliation-and-simple-import.md`
- `server/integration/multi-property-payments.test.js`
- `server/src/controllers/accountReportingController.js`
- `server/src/controllers/clientPenaltyController.js`
- `server/src/controllers/financeController.js`
- `server/src/controllers/migrationController.js`
- `server/src/controllers/paymentIntentController.js`
- `server/src/controllers/penaltyOperationsController.js`
- `server/src/models/PenaltyCycleIdentity.js`
- `server/src/models/PropertyAssignment.js`
- `server/src/routes/financeRoutes.js`
- `server/src/routes/migrationRoutes.js`
- `server/src/services/financialReportService.js`
- `server/src/services/migrationService.js`
- `server/src/services/paymentBatchCounts.js`
- `server/src/services/restorePoint.js`
- `server/src/services/simpleMigration.js`
- `server/src/utils/accountReporting.js`
- `server/src/utils/contractMonitoring.js`
- `server/src/utils/migrationRules.js`
- `server/src/utils/penaltyReconciliation.js`
- `server/test/penalty-recalculation.test.js`

