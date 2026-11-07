# Schedule export, print identity, commission vouchers and migration templates

This batch extends the existing application. It does not seed, replace or migrate existing financial records. There are no new production dependencies. This batch is approved for publication to `feature/property-inventory`; it does not merge into `main`.

## Available workflows

- Client property account: **Export Payment Schedule to Excel** opens the schedule preview; **Download Excel** exports the selected accounts. Bulk selection uses the existing schedule selector (up to 100 accounts / 10,000 schedule rows). Excel includes a summary and a unique sheet per account, numeric currency/totals, dates, contributing payment dates/methods and remaining principal/penalties. Export refuses a stale preview.
- Generated print layouts omit the exact default system name and retain real company identity and document titles. Normal application branding is unchanged. Browser headers/footers are controlled in the print dialog; turn them off if unwanted.
- Commissions: select eligible earned/unreleased rows, then **Print Commission Voucher**. Review or reduce the selected amounts, choose a voucher date/method and give a preparation reason. **Save Draft & Preview** saves separately numbered vouchers for each agent/company. Drafts do not reserve funds or release commissions. **Voucher History / Reprint** reopens saved vouchers.
- Staff can prepare, submit and print; administrators approve/cancel and record actual payouts. Give an action reason before approval/cancellation/printing. On an approved voucher use **Record Actual Payout**, which opens the existing release form, including funding classification and financial confirmation. The selected voucher amount caps each entry; current commission eligibility and release-date funding are checked again. Partial payouts are retained separately. Linked payout corrections may reduce or void; an increase must be a new authorized payout.
- Print preview shows OFFICE COPY and AGENT COPY on one 8.5 × 13-inch portrait sheet. Select this paper size and 100% scale. Larger selections automatically use complete itemized attachments; a checkbox can also request attachments. Both copies retain the same voucher number/details. The printer checks for half-page overflow before opening the print dialog. Cancelled vouchers remain visibly cancelled. A print request is logged, not a claim that paper physically printed.
- Historical Migration: each of six template downloads includes blank **Data Entry**, fictional **Sample Data**, and **Instructions**. Required headers are red, receipt/reference columns are text, and existing record/payment/funding fields have dropdown validation. The importer reads Data Entry only; legacy Records sheets remain supported when Data Entry is absent. Samples and instructions are ignored. Existing account statuses remain in Reconciliation; no unsupported status column is added. Preparation/activation safeguards remain intact.

## Financial integrity

New `CommissionVoucher` documents hold immutable preparation snapshots, approval history and references to actual account payouts. A unique request key prevents duplicate draft creation. Agent/company grouping is independent of the project's commission percentage.

Actual payouts still use the account's existing optimistic version check, idempotency key, release-date eligibility, monitoring and audit update. Voucher-linked payouts first acquire a durable per-voucher intent; cancellation cannot race that payout. After a crash or uncertain write, **Resolve Pending Payout** is administrator-only: it either finds the saved payout or fences the old account version before unlocking. It never fabricates or deletes a payment. Voucher paid totals are derived from actual payout records and their corrections, rather than a separate editable balance. Existing unlinked payout workflows are preserved.

Company address/contact fields are printed if present in the identity snapshot; the existing Company model currently provides name/logo/about/project links, so no fictional address/contact is supplied.

## Validation

- Backend suite: 162 passed, 3 optional database tests skipped by the default runner.
- Those three database workflows were run separately against disposable MongoDB: payment regression, company/reporting/voucher workflow, and replica-set historical migration activation all passed.
- Excel round trips verify all six templates, blank entry sheets, ignored samples, legacy compatibility, leading-zero receipts, bulk sheet names, numeric totals/formulas and multiple payment dates/methods.
- Voucher integration verifies roles, draft retry, approval, repeated printing without financial writes, partial payouts, idempotent payout retry, over-limit rejection, payout void, cancellation, interrupted-intent recovery, separate agents and concurrent payout requests.
- UI DOM check verifies eligible/disabled selection, totals, saved two-copy preview, approval controls and no payout from preparation.
- Vite production build passed. The existing bundle-size advisory remains.
- Physical long-bond printer alignment has not been tested; confirm the two-copy fit using the office printer before operational use. Browser overflow detection and itemized attachments prevent silent clipping in supported browsers.

## Run

Use the existing `.env` and MongoDB setup. From the repository root open two terminals:

```powershell
cd server
npm ci
npm run dev
```

```powershell
cd client
npm ci
npm run dev
```

Open the Local URL Vite prints (usually http://localhost:5173). No seed/reset command is required. Restart the server and client after updating the source. These edits must be approved and pushed before another device can pull them from GitHub.

## Changed source files

Frontend:
- `client/src/components/CommissionLedger.jsx`, `CommissionRecord.jsx`, `CommissionVouchers.jsx`
- `client/src/components/PaymentSchedulePrint.jsx`, `ListReportActions.jsx`
- `client/src/pages/HistoricalMigrationPage.jsx`, `PaymentTransactionsPage.jsx`
- `client/src/utils/printCommissionVoucher.js`, `printPaymentSchedules.js`, `printPaymentRegister.js`, `printFinancialReport.js`, `printExpenses.js`, `reportBrand.js`

Backend/shared:
- `server/src/controllers/commissionVoucherController.js`, `commissionController.js`, `schedulePrintController.js`, `migrationImportController.js`
- `server/src/models/CommissionVoucher.js`
- `server/src/services/commissionVoucherService.js`, `companyBranding.js`
- `server/src/routes/commissionRoutes.js`, `server/src/middleware/auditMutation.js`
- `server/src/utils/generateRecordId.js`, `scheduleWorkbook.js`, `migrationTemplates.js`, `listReport.js`
- `shared/printIdentity.js`

Tests:
- `server/test/export-voucher-update.test.js`
- `server/integration/company-reporting.test.js`, `historical-migration.test.js`
