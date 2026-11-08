# Multi-property payment and penalty monitoring update

Implemented locally on `feature/property-inventory`. No commit, push, deployment, seed, database reset, or production-data migration was performed.

## Completed behavior

- Same-client multi-property checkout: individual payment, issued receipt, allocation, remarks and penalty decision per property; shared acknowledgment reference. Combined payments require MongoDB transactions and post all-or-none. Standalone MongoDB retains single-property payments.
- Backend installment quote uses actual unpaid scheduled amounts, including partial balances. Optional months helper only applies when requested; amounts remain editable.
- Remarks derive from actual installment periods, including advance, partial and cross-year allocations. Manual edits and empty remarks remain allowed.
- Pay Penalty Now/Later is required only for outstanding assessments on the effective payment date. Pay Now selects actual cycles and partial amounts; Later retains the debt without waiving it. Existing independent monthly simple penalty logic remains authoritative.
- Consolidated client account view with filters, per-property expansion, print preview and Excel. Contracts and collection records remain separate.
- Shared complete allocation details in payment and transaction histories, with receipt, principal, penalty, advance and current obligation details.
- Payment schedule print/Excel includes actual contributing receipt numbers as text; principal is not repeated for each receipt.
- Penalty monitoring includes all-result summaries, server pagination, installment/cycle histories, references, filters, print preview and Excel.
- Idempotent request claims, immutable acknowledgment snapshots, receipt uniqueness, account version checks, existing correction approvals and financial audit histories remain in use.

## Storage and compatibility

Optional fields were added to embedded payments. New PaymentBatch documents link multi-property payments; they are not collection transactions. PaymentIntentClaim documents reserve retry identities and contain no ledger posting. Existing documents need no rewrite. Unique indexes protect batch references/request identities. Failed attempts can leave nonfinancial identity reservations and sequence gaps; financial batch writes and receipt claims roll back together.

A single-property payment uses the existing account compare-and-swap pattern and stores its acknowledgment on the payment. Multi-property payments have no nontransactional fallback. A single-node replica set is sufficient for transaction support; configuring that database is a separate environment operation. Historical staging remains separate from live payments, and the configured cutoff is enforced.

Directed penalty allocations that become invalid after an administrator correction require an explicit corrected allocation plan. They are never silently diverted to principal. Original payments, revisions and payout history are preserved.

## Run locally

Use the existing `.env` files and MongoDB database. From the repository root, run the server and client in separate terminals:

```powershell
cd server
npm install
npm run dev
```

```powershell
cd client
npm install
npm run dev
```

Open the Vite address printed in the client terminal. Payments contains the new checkout and penalty monitoring; Clients → client accounts → View All Properties opens consolidation. Combined posting is disabled when MongoDB does not advertise transaction support. There are no new runtime dependencies.

These changes have not been pushed, so `git pull` on another device will not retrieve them yet.

## Validation

- Backend suite: 187 tests, 182 passed, 5 skipped, 0 failed. The environment-dependent integrations are also run explicitly below.
- New six-case payment intent unit suite passed (included in backend total).
- New HTTP integration passed separately on disposable standalone MongoDB and replica-set MongoDB. Covers ownership, roles, receipt/amount validation, rollback after second-property failure, retry/idempotency, quotes, penalty selection/deferment, no commission on penalty-only payments, exports, receipts and void/reopened obligations.
- Existing payment-flow, retroactive commission and historical-migration integration workflows passed on disposable databases.
- React DOM smoke check passed: property multiselect, separate receipt/remarks fields, month helper, conditional penalty controls and standalone protection.
- Vite production build passed. Existing large-chunk advisory remains.
- `git diff --check` passed.

Physical printer output and operator acceptance on the office computer still need checking. No live account balances or production records were accessed.

## Modified and added files

- `client/src/components/ConsolidatedClientAccount.jsx`
- `client/src/components/PaymentAllocationDetails.jsx`
- `client/src/components/PaymentBatchAcknowledgment.jsx`
- `client/src/components/PenaltyMonitoring.jsx`
- `client/src/components/PropertyPaymentCheckout.jsx`
- `client/src/utils/printAccountReports.js`
- `server/integration/multi-property-payments.test.js`
- `server/src/controllers/accountReportingController.js`
- `server/src/controllers/paymentIntentController.js`
- `server/src/models/PaymentBatch.js`
- `server/src/models/PaymentIntentClaim.js`
- `server/src/utils/accountReporting.js`
- `server/src/utils/paymentIntent.js`
- `server/test/multi-property-payments.test.js`
- `shared/paymentRemarks.js`
- `client/src/components/ClientAccounts.jsx`
- `client/src/components/PaymentTable.jsx`
- `client/src/components/PropertyPaymentHistory.jsx`
- `client/src/pages/PaymentMonitoringPage.jsx`
- `client/src/pages/PaymentPage.jsx`
- `client/src/utils/printPaymentSchedules.js`
- `server/src/controllers/schedulePrintController.js`
- `server/src/models/PropertyAssignment.js`
- `server/src/routes/financeRoutes.js`
- `server/src/services/receiptService.js`
- `server/src/utils/contractMonitoring.js`
- `server/src/utils/generateRecordId.js`
- `server/src/utils/paymentLedger.js`
- `server/src/utils/scheduleWorkbook.js`
- `server/test/export-voucher-update.test.js`
