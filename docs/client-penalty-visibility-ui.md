# Client penalty visibility and office UI update

## Completed

- Clients table shows payment status, consecutive overdue months, overdue principal, outstanding penalties, penalty status and a direct View Penalties action. Search and pagination run on the backend; financial summaries are calculated for the displayed client page only.
- Client workspace has Overview, Properties, Payment History, Payment Schedule, Penalty History, Penalty Monitoring and Documents / Receipts navigation. Existing property assignment, agreement editing, corrections, print and export tools remain available.
- Profile overview and alert distinguish overdue principal from unpaid penalties, including unpaid historical penalties after principal settlement. Totals consolidate properties without combining contracts.
- Client Penalty History supports property, cycle month/year, status, receipt/installment search, date sorting and server pagination. Related receipt links open the authoritative allocation details. Audit history is accessible; Excel includes complete recorded adjustment/waiver entries.
- Client Penalty Monitoring groups by installment, distinguishes ongoing accrual from settled principal with unpaid penalties, and forecasts the next eligible cycle. Cycle expansion and group pagination keep the DOM bounded.
- Checkout shows a compact summary, Pay All, selected installments/cycles, partial cycle amounts and Pay Later. It renders ten installment groups and at most ten expanded cycles per page. No decision section is rendered when no outstanding penalty exists.
- Fixed the transaction validation limit that previously rejected more than 1,000 legitimate penalty selections. Up to 10,000 individual cycles are accepted per request; larger selections must be split rather than bypassing the request bound.
- Shared spacing, status colors with text, action alignment, tables, responsive client navigation and modal sizing improved across existing modules. Existing SVG icons are extended; there is no new icon dependency.
- Shared X close controls replace text close actions in account/print/export dialogs, commission tools, inventory and search. They support keyboard Escape, focus containment and focus return. Confirmation actions remain separate; Escape does not approve financial or destructive operations.
- Existing cross-client monitoring no longer mounts thousands of cycle rows inside closed details; it links directly to the complete client history.

## Penalty calculation findings

The screenshot total is reproducible without duplicate charges. A test fixture with the visible values uses:
- PHP 250,000 principal; 48 months; regular installment PHP 5,208.34 with a final balancing installment.
- First due April 7, 2022; five grace days; 3% full-installment monthly simple penalties.
- **Illustrative, assumed** principal payment dates June 13 and July 13, 2024, totaling PHP 10,418.
- As of November 8, 2026: **1,457 unique installment/cycle keys**, outstanding principal **PHP 239,582**, penalties **PHP 227,656.17**.

Those payment dates were chosen for reproduction; they are not verified dates from the user's live account. The screenshot alone cannot confirm the account's exact contractual or payment history. An early-payment scenario with the same visible amounts instead produces 1,403 cycles. The difference illustrates why original effective payment dates matter.

No penalty formula defect was confirmed. Monthly simple assessment logic, rates, grace handling and allocation ordering were not changed. Fully paid/advance-covered principal stops new cycles, while earlier unpaid penalty charges remain payable. Duplicate-key diagnostics flag possible overlapping records for administrator review; they do not delete or rewrite financial history. Existing administrator correction/waiver previews, reasons, approvals and audit histories remain the reconciliation mechanisms.

## Tests

- Backend suite: **193 total; 188 passed; five environment-dependent tests skipped; zero failed**.
- New penalty tests cover exact large-total reproduction, uniqueness, no accrual after principal settlement, advance protection, consolidated properties, partial penalty payments/waivers, next-cycle dates, and 1,457-cycle Pay All.
- Extended HTTP integration passes on disposable **standalone and replica-set MongoDB**. Includes new client report filters, receipt search, property ownership validation, client-list pagination, summary consistency, XLSX totals/adjustment sheets and reporting without financial posting. Existing atomic rollback/retry, receipt, penalty and void checks also pass.
- Existing payment-flow, company/printing/reporting/voucher, historical-migration and retroactive-commission integration scenarios pass on disposable databases.
- React DOM checks pass for a 1,600-cycle dataset: bounded groups/expanded rows, selection/deferment, no unnecessary section on penalty-free accounts, unpaid-penalty alerts after principal settlement, report preview snapshot use, X/Escape and keyboard focus containment.
- Vite production build passes. Its existing large-chunk advisory remains.
- `git diff --check` passes.

## Preview and remaining verification

[Static UI preview](previews/client-penalties.html) is generated from the actual overview and grouped-selection React components using clearly labeled illustrative test data. It is for layout review; controls are noninteractive. The running app provides the full workflow.

The connected browser was unavailable in this session. Real-browser visual acceptance at desktop, tablet and mobile sizes, and physical print output, still require checking on the office computer. CSS breakpoints and DOM interactions were checked, but this is not a claim of screenshot-based responsive verification.

No live database was accessed. No schema reset, destructive migration, commit, push, merge or deployment was performed for this update. The last published commit remains `2d30f3d97d1e3e5b50aa472bb855c95d0d5209dc`.

## Modified and new files

- `client/src/components/CenterPopup.jsx`
- `client/src/components/ClientAccounts.jsx`
- `client/src/components/ClientPenaltyOverview.jsx`
- `client/src/components/ClientPenaltyWorkspace.jsx`
- `client/src/components/ClientSearchModal.jsx`
- `client/src/components/CloseButton.jsx`
- `client/src/components/CommissionReconciliation.jsx`
- `client/src/components/CommissionRecord.jsx`
- `client/src/components/CommissionVouchers.jsx`
- `client/src/components/ConsolidatedClientAccount.jsx`
- `client/src/components/GroupedPenaltySelection.jsx`
- `client/src/components/InventoryFinancialSummary.jsx`
- `client/src/components/ListReportActions.jsx`
- `client/src/components/NavIcon.jsx`
- `client/src/components/PaymentAllocationDetails.jsx`
- `client/src/components/PaymentBatchAcknowledgment.jsx`
- `client/src/components/PaymentSchedulePrint.jsx`
- `client/src/components/PenaltyMonitoring.jsx`
- `client/src/components/ProjectMap.jsx`
- `client/src/components/PropertyPaymentCheckout.jsx`
- `client/src/components/StatusBadge.jsx`
- `client/src/layouts/AppLayout.jsx`
- `client/src/pages/ClientAccountsPage.jsx`
- `client/src/pages/ClientsPage.jsx`
- `client/src/pages/PropertyInventory.jsx`
- `client/src/styles.css`
- `client/src/utils/printAccountReports.js`
- `docs/client-penalty-visibility-ui.md`
- `docs/previews/client-penalties.html`
- `server/integration/multi-property-payments.test.js`
- `server/src/controllers/clientController.js`
- `server/src/controllers/clientPenaltyController.js`
- `server/src/routes/financeRoutes.js`
- `server/src/utils/clientPenalties.js`
- `server/src/utils/paymentIntent.js`
- `server/test/client-penalty-visibility.test.js`

