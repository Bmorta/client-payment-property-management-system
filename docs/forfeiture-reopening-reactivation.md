# Forfeiture, reopening and reactivation

Status: implemented locally; not committed, pushed or deployed. No office database migration or financial data change was performed.

## Workflow

1. Open Clients → client account → property details. Administrators can mark a contract for review, reject/cancel the review, then preview and explicitly approve forfeiture.
2. Actual forfeiture requires the contractual unpaid-installment threshold, reviewed monitoring terms, supporting reference and administrator confirmation. Only the selected contract closes. The lot remains unavailable and pending reopening.
3. Property Management → Reopen Properties provides separate approval, rejection or return for correction. Contract Adjustments → Forfeited Accounts shows durations, filters and history.
4. Reactivation requires a fresh preview and confirmation. Reactivate the original contract by rescheduling remaining obligations, or create a linked replacement using original/current/custom price and approved DP/principal credits. Review the complete schedule before approval.
5. Inventory → History displays original contracts, receipts, closure periods, replacements and actual commission payouts. Reports links to preview, browser Print/PDF and Excel export.

## Financial and inventory safeguards

- Actual receipts and payout histories are retained. Forfeiture freezes obligations as historical balances; it does not mark them paid or create a collection.
- Future ordinary collections and monitoring alerts stop on closed contracts. Existing penalty rules are not replaced. Reactivation explicitly waives frozen penalties or carries them as separate fixed charges without recurring accrual.
- Original reactivation does not credit existing payments twice. Replacement credits reference original actual principal/DP allocations, exclude penalty payments and require confirmation of prior dispositions. No new cash receipt is generated.
- Existing earned commissions and actual payouts remain traceable. No replacement commission agreement or automatic payout is created. Existing verification/recovery conflicts must be resolved first.
- Transaction support and the existing active-contract index upgrade are required. Missing readiness returns Database & Backups guidance. No migration runs automatically and no new routine backup requirement was added.
- Version checks, one-active-contract uniqueness, transactional writes, renewed previews and idempotency prevent duplicate approvals and conflicting reopening/reactivation actions.
- Pending payment corrections/transfers/cancellations and unresolved historical migration situations block approval. Legacy FORFEITED review labels alone do not establish an audited closure.
- Forfeiture duration ends at first reopening/reactivation, retaining subsequent reactivation outcome separately. As-of reports use historical duration/status; physical inventory fields explicitly describe current inventory.

## Validation

- Backend suite: 265 passed, 0 failed, 21 environment-gated skipped.
- Dedicated disposable replica-set integration: passed forfeiture, frozen balances, partial/advance payment handling, reopening decisions, original/replacement reactivation, exact credits, multiple periods, idempotency, competing approvals, actual carried-penalty settlement and history.
- Dedicated standalone integration: passed refusal of protected changes without transaction support.
- Latest penalty regression: standalone and replica modes passed (1 each).
- Latest lot-transfer/index regression: standalone and replica modes passed (2 each).
- Latest cancellation/credit/refund integration: passed (1).
- Focused frontend check: reopening default filter, empty-state rendering, preview/readable summary and no financial writes passed.
- Production frontend build passed; existing large-chunk warning remains.

## Running and acceptance checks

Use an isolated development database, not production for trial approvals. In server run `npm.cmd ci`, then `npm.cmd run dev`. In client run `npm.cmd ci`, then `npm.cmd run dev`. Keep the existing local environment files and database name. An administrator must review any required database upgrade separately in Database & Backups.

Check a disposable overdue contract with a second active property belonging to the same buyer. Review/forfeit the first contract; confirm the other property is unchanged and receipts remain visible. Approve reopening separately, or preview original/replacement reactivation. Check the proposed schedule, penalty resolution and credit disposition before approval. Compare report previews with Excel downloads.

## Limits and pending office acceptance

- Windows office/LAN, actual printer and browser Save as PDF acceptance remain to be checked on the office installation.
- Supporting documents are reference fields; binary document uploads were not added.
- Legacy review-only closures require reconciliation rather than automatic conversion. Records within an activated migration cutoff require migration reconciliation.
- Original reactivation schedules unpaid obligations from the approved new first due date; it does not silently revive charges during the closed period.
- Full forfeiture-history print/Excel previews are supported; property inventory reflects current physical state rather than reconstructing arbitrary past inventory edits.

## Modified files

Existing unrelated work was preserved. Compared with the pre-feature checkpoint:

- `client/src/App.jsx`
- `client/src/utils/workspaceNavigation.js`
- `client/src/components/ClientAccounts.jsx`
- `client/src/components/AccountMonitoringDetails.jsx`
- `client/src/components/LotTransfer.jsx`
- `client/src/components/PropertyPaymentDetails.jsx`
- `client/src/components/ForfeitureActions.jsx`
- `client/src/components/NotificationBell.jsx`
- `client/src/components/CancellationWorkspace.jsx`
- `client/src/components/PropertyPaymentHistory.jsx`
- `client/src/pages/PaymentMonitoringPage.jsx`
- `client/src/pages/ReportsPage.jsx`
- `client/src/pages/PropertyHistoryPage.jsx`
- `client/src/pages/PropertyInventory.jsx`
- `client/src/pages/ForfeitedAccountsPage.jsx`
- `server/src/controllers/financeController.js`
- `server/src/controllers/commissionController.js`
- `server/src/controllers/migrationController.js`
- `server/src/controllers/monitoringController.js`
- `server/src/controllers/forfeitureController.js`
- `server/src/controllers/penaltyOperationsController.js`
- `server/src/controllers/paymentIntentController.js`
- `server/src/controllers/propertyController.js`
- `server/src/middleware/accountLifecycleGuard.js`
- `server/src/middleware/migrationPaymentGuard.js`
- `server/src/models/PropertyAssignment.js`
- `server/src/models/Property.js`
- `server/src/utils/commissionEarningPlan.js`
- `server/src/utils/accountReporting.js`
- `server/src/utils/inventorySummary.js`
- `server/src/utils/amendedLedger.js`
- `server/src/utils/accounting.js`
- `server/src/utils/paymentIntent.js`
- `server/src/utils/monitoringReports.js`
- `server/src/utils/contractMonitoring.js`
- `server/src/utils/commissionLedger.js`
- `server/src/routes/financeRoutes.js`
- `server/src/services/forfeitureService.js`
- `server/src/services/cancellationService.js`
- `server/src/services/monitoringService.js`
- `server/src/services/lotTransferService.js`
- `server/src/services/activeContractUpgrade.js`
- `server/test/forfeiture.test.js`
- `server/integration/forfeiture.test.js`
- `shared/forfeitureReport.js`
- `shared/contractLifecycle.js`
- `docs/forfeiture-reopening-reactivation.md`
