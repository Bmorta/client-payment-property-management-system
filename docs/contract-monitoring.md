# Contract monitoring update — November 5, 2026 (Philippine time)

## What changed

Per-property agreements now support monthly installment amount, due day, grace days, percentage, explicit full-installment/unpaid-balance penalty basis, monthly frequency, effective date, Active/Waived/Disabled status, allocation priority, reminder days and forfeiture/critical thresholds. Critical threshold 0 disables an early critical warning. Monthly amounts must reconcile to the property contract total; the final installment can be smaller. Days 29–31 clamp to month end.

Existing agreements are not automatically assigned a rate or new thresholds. Configure them in Clients → Properties & accounts → Edit Payment Agreement (administrator). New assignments expose the same terms in Add Client/Assign Property. Existing legacy review indicators remain until explicit configuration; no automatic penalties are charged for unconfigured contracts.

## Authoritative financial records

The effective payment ledger and actual contractual schedule feed one chronological allocation calculation. The account document persists current installment state, original transaction allocations, appended allocation versions, penalty assessment events, waiver records, review history and notification history. Financial writes and their recalculated state use the same optimistic-version atomic update. No separate inconsistent balance calculation is used by reminders, penalties or risk monitoring.

- AUTO follows the contract's explicit priority. INSTALLMENT, DOWN_PAYMENT and PENALTY restrict the intended obligation. AUTO's proposed split is always displayed before posting.
- A server preview is required for configured-contract payments and corrections. A changed account/date invalidates confirmation. Preview requests do not change the ledger.
- Corrections can specify a full allocation plan. Its sum and every target's actual available balance are validated. Staff still request administrator approval. A changed allocation at approval makes the request stale.
- Original transaction fields/allocations remain preserved. Corrections append only revisions; agreement edits write only relevant contract fields. Unknown existing contract/payment metadata is retained.
- Penalties begin on the day after grace ends. Cycles run on a stable monthly anniversary of the first eligible assessment date (later of grace-expiry day and initial effective date). A rate/status edit does not create an extra mid-cycle assessment. Assessments run at the start of that Philippine calendar day, before payments dated that day. Paying on the first penalty day can therefore leave that day's charge payable.
- Penalties use integer centavos and a percentage represented in basis points (two decimal places of percentage), rounded half-up per installment/cycle with BigInt arithmetic. No compounding, daily assessment or property-price basis occurs.
- Paying principal stops subsequent charges for that installment, but does not erase charges already assessed. Waived/Disabled contractual status stops future assessments from its effective date. Waiving an existing unpaid assessment is an explicit administrator action with a reason. Later waivers do not alter earlier-date report balances.
- A valid backdated correction/void can change historical eligibility. Reconciliation appends adjustments/reversals and allocation versions, preserving the old history. It rejects an invalid reallocation rather than dropping money.
- A partial installment does not count as a fully paid month. Down payments and penalty receipts do not count as installment months. Risk counts trailing consecutive overdue principal periods after grace; fully covered periods break the sequence.

For ₱18,000 paid November 5 against ₱6,000 scheduled installments, November, December and January are fully allocated, February 5 is next unpaid, and covered months produce no due/overdue reminders, penalties or forfeiture risk. For ₱15,000, January retains ₱3,000 principal and is not marked fully paid.

## Operations and safeguards

A startup reconciliation and a 60-second worker recover missed cycles after downtime. Document versions, deterministic cycle keys and state comparisons prevent duplicate assessment/reminder/allocation writes across retries or simultaneous workers. Notification delivery uses the existing authenticated SSE bell (3-second checks); account-version changes refresh financial screens even when no additional unread event is needed. Outdated actionable alerts are resolved while their history remains saved.

Dashboard/Payment Reminders supports project, date and status filters; critical accounts appear first. Future dates are explicitly labelled projections and do not persist future charges. Payment details expose allocation schedule, penalty breakdown/waiver and forfeiture review history. Admin review requires a reason and refreshed contractual risk. Notices/approval/final review require recorded notice/legal-review acknowledgement, and final forfeiture requires prior approval. These record administrator decisions only: the system does not terminate contracts, clear clients, or release/reassign lots. The acknowledgement is an administrative record, not automated legal validation.

Reports reuse daily/weekly/monthly/yearly/custom ranges, with seven monitoring datasets, CSV downloads and an Excel workbook through the installed ExcelJS dependency. No existing PDF export route was present to reuse. Due/fully-paid rows use due dates; advance rows use effective payment dates; penalty rows use cycle dates; overdue and risk are snapshots at the report cutoff. Future report cutoffs do not book future charges.

## Source files added or extended for this update

- `shared/contractTerms.js`: shared validation, contractual schedule configuration, Philippine calendar helpers.
- `server/src/utils/contractMonitoring.js`, `paymentLedger.js`, `accounting.js`, `allocationPreview.js`, `monitoringReports.js`: authoritative calculations, preview tokens and report datasets.
- `server/src/services/monitoringService.js`: persisted reconciliation, versioned allocations, assessment/reversal events, resolved reminders and startup recovery.
- `server/src/models/PropertyAssignment.js`: additive contract, allocation, penalty, waiver and review fields.
- `server/src/controllers/financeController.js`, `paymentCorrectionController.js`, `monitoringController.js`, `notificationController.js`: contract/payment integration, permissions, corrections, waivers, reviews, reports and live version updates.
- `server/src/routes/financeRoutes.js`, `server/src/server.js`: endpoints and recovery worker.
- `client/src/components/ContractTerms.jsx`, `AllocationPreview.jsx`, `AccountMonitoringDetails.jsx`, `AssignmentFields.jsx`, `AgreementEditor.jsx`, `PaymentEstimate.jsx`, `PaymentCorrectionModal.jsx`, `PropertyPaymentDetails.jsx`, `ClientAccounts.jsx`, `NotificationBell.jsx`: contract fields, previews, account monitoring and existing workflow integration.
- `client/src/pages/PaymentPage.jsx`, `PaymentMonitoringPage.jsx`, `ReportsPage.jsx`, `client/src/App.jsx`, `client/src/layouts/AppLayout.jsx`: payment review, dashboard/reminders, reports and navigation.
- `server/test/contract-monitoring.test.js`, `audit-agreement.test.js`, `payment-controls.test.js`, `server/integration/payment-flow.test.js`: new scenarios and regression checks.

## Validation and running

Run `npm test --prefix server` and `npm run build --prefix client` from the repository root. The ordinary test run skips the optional database integration unless `CPM_TEST_MONGO_URI` is supplied. That integration creates/drops only a uniquely named `cpm_test_*` database; it never uses the office database name. It covers actual HTTP posting/preview/approval/waiver/review, stored allocations, repeat reconciliation, metadata preservation, Excel output and live notifications. DOM interaction checks cover contract choices, allocation display, dashboard refresh and existing search/correction/discard flows. Windows office/browser acceptance remains to be done.

Start MongoDB and retain your existing `server/.env`. In separate terminals run `npm run dev --prefix server` and `npm run dev --prefix client`; install dependencies in those folders first if missing. Open the Vite URL (normally http://localhost:5173). Do not reseed or reset your database. No commit, push or merge is part of this update, so uncommitted files are not yet available through `git pull`.

Final validation for this working checkpoint: 78 unit/controller tests passed (the optional MongoDB integration is skipped in the ordinary run); the isolated MongoDB HTTP integration passed separately; DOM interaction checks passed; Vite production build and `git diff --check` passed. No office database was connected or modified. No commit, push or merge was performed.
