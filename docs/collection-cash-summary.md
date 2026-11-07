# Collection & Cash Summary and payment-method filters

## Where to use it

- **Payment Transactions:** searchable checkbox selector for Mode of Payment; choose any combination. Combine it with date, client, project, status, text search and sorting. Select All or Clear All shows all methods, including unclassified legacy records. Results use server-side filtering and 20-row pages. The count and posted total cover every match, not just the visible page. Invalid rows can still be inspected using status filters, but do not contribute to totals. Print, CSV and Excel use all matching records.
- **Reports → Collection & Cash Summary:** Today, Yesterday, This Week, This Month, Last Month, This Year or custom dates; the current week/month/year presets end today. Choose methods and optionally a project. Collections and expenses have separate search, sort and pagination controls. Summary totals, method breakdown and charts include the complete matching datasets.
- **Expenses:** new expenses must identify their actual payment method. Internal cash deposits/withdrawals belong in the cash ledger, not Expenses. If an expense represents a recorded commission payout, optionally link the CPY ID to prevent a second physical-cash deduction.

Methods are centralized in `shared/paymentMethods.js`: Cash, GCash, Maya, Bank Transfer, Bank Deposit, Check and Other. Cash is physical cash; known digital/bank/check methods are noncash. **Other requires an explicit physical Cash or Noncash funding classification** on new payments, expenses, commission payouts and recoveries. Corrections preserve historical classification and audit changes. Legacy Other records without this information remain ambiguous; the system does not guess. Contradictory method/funding data also prevents an accurate cash balance.

## What the numbers mean

Total Collections includes valid posted, effective buyer payments only. Cancelled, voided, reversed, pending and draft records are excluded. Current approved corrections determine amount, date, method, receipt and funding classification. Total Expenses is actual posted expense records. Net Collection is Collections minus recorded Expenses for the selected methods/project/detail searches.

Cash cards and the cash formula always use the **complete office physical-cash ledger**, independently of method, project and detail-search filters. A buyer's GCash, Maya, bank transfer/deposit or check does not increase physical cash. Other contributes only when explicitly classified as physical cash.

Closing cash = derived period opening + physical cash collections + other inflows/withdrawals/recoveries − cash expenses − cash deposited to bank − other outflows/unlinked commission payouts.

Commission payouts remain separate actual disbursements unless represented by an expense. Linking an expense to a payout requires matching amount, date, method and physical-funding classification, plus project for a project expense. A unique index prevents linking the same payout to two expenses. A linked payout is excluded from the additional cash outflow because the expense already represents it. Net Collection still subtracts the actual expense once. A payout with no expense affects physical cash separately; it is not silently added to Total Expenses. Actual commission recoveries are cash inflows only when cash-funded. Transfers are neither revenue nor expense.

If an unlinked cash expense matches a payout's amount/date, the report flags possible duplication rather than guessing. An administrator can link it or explicitly confirm it is independent. If a payout later changes and no longer matches its linked expense, cash is marked unavailable until reconciled.

## Opening balance and legacy records

An administrator can open **Opening Balance & Cash Movements** in the report and record an authorized, reasoned opening count at the start of a selected date. Zero is allowed only when explicitly entered as an opening count. The administrator confirms cash records from that date are complete. Only one posted office baseline is allowed. The period opening is derived from the baseline plus all earlier posted cash movements after it; it is never inferred as zero.

Other inflows/outflows, bank deposits and bank withdrawals require a reason, explicit confirmation and an assertion that they are independent of existing collections, expenses, commissions and recoveries. Submissions are idempotent and receive CSH IDs. Administrator voids retain original amounts and append history. Read-only reports never generate ledger entries.

Legacy expenses retain their existing records and have no guessed method. Under All methods they appear as Unclassified and remain in Total Expenses. Selected-method totals omit those rows, with a visible warning. Administrators can use **Classify / Link Payout** on expense rows, with a reason and version check. The original amount, ID and relationships do not change; classification history and the existing activity journal record before/after values. Legacy payment classification corrections use the existing staff-request/admin-approval workflow; payout corrections retain the existing administrator workflow.

Without an appropriate opening baseline, with unclassified/ambiguous records since that baseline, mismatched payout links or a negative cash ledger, **Cash on Hand is Unavailable**, with specific reasons. Known cash collections/expenses remain displayed as known records, not falsely complete totals. Future periods do not create cash forecasts; cash uses actual records through today. These reports restate the current corrected records for their effective dates, rather than reconstructing a past database snapshot.

## Print, Excel, PDF and charts

Print and exports include company/system name, dates, selected methods, project/detail-search scope, generated date, summaries, cash availability/formula, method breakdown and every matching transaction. Excel stores numeric pesos and receipt strings (including leading zeros) in separate summary, method, collection, expense and cash-movement sheets. PDF uses the existing PDFKit infrastructure; print uses an escaped A4 landscape document without navigation.

The UI passes a backend snapshot fingerprint when printing or exporting. If the underlying transactions or cash position changed, the server returns 409 and asks for Refresh Report/Refresh Results, preventing silently different totals from the displayed version.

Four responsive Recharts views use backend totals: Collections vs Expenses, Collections by Method, Expenses by Method and Net Collection Trend. The method table and detailed records remain text alternatives. No placeholder financial data or new production dependency was added.

Optional server setting `COMPANY_NAME` replaces the default system name in the new report. Existing `.env`/database settings stay intact. Do not reseed or reset the database. Schema additions preserve old records; no office-data backfill or financial migration has been run.

## Backend endpoints

| Endpoint | Use |
|---|---|
| GET `/api/finance/payments?paged=1` | Filtered paginated transactions; optional `all=1` or `format=xlsx/pdf`; the original no-query array endpoint remains compatible |
| GET `/api/finance/reports/collections` | Complete summaries plus paginated details; `all=1` for print; `format=xlsx/pdf` for exports |
| GET `/api/finance/cash-ledger` | Latest 200 office cash entries, including void history; report calculations use all relevant records |
| POST `/api/finance/cash-ledger` | ADMIN-only authorized opening or independent movement |
| POST `/api/finance/cash-ledger/:id/void` | ADMIN-only reasoned, version-checked void |
| PATCH `/api/finance/expenses/:id/classification` | ADMIN-only actual method/funding/payout link correction with history |

Filters: `from`, `to`, comma-separated `methods`, optional `project`; transaction filters also accept `q`, `client`, `status`, `sort`, `direction`, `page`. Collection report detail filters are `collectionQ`, `expenseQ`, their Sort/Direction/Page counterparts. `expectedSnapshot` protects print/export consistency. Calculations remain integer-centavo based on the backend; pagination never determines totals. The existing embedded-ledger architecture is reused, with financial records loaded and filtered on the server rather than sending all records to the browser.

## Modified areas and validation

New backend files: `models/CashLedgerEntry.js`, `controllers/collectionReportController.js`, `controllers/cashLedgerController.js`, `services/financialReportService.js`, `utils/financialReporting.js`, `utils/fundingAccount.js`. Existing expense/payment schemas, finance/commission/correction controllers, routes, audit targeting, ID generator, dashboard/expense report calculations and tests were extended.

New frontend files: `PaymentMethodFilter.jsx`, `CollectionCashReport.jsx`, `CashLedgerTools.jsx`, `FundingAccountField.jsx`, `printFinancialReport.js`. Existing Transactions, Reports, Expenses, Payment, correction and commission forms, expense displays/print helper and styles were extended.

Tests cover ANY-method selection, date/client/project/status filters, full totals across pages, invalid/reversed/voided payments, corrected values, cash/noncash separation, explicit Other funding, prior-derived opening, transfers, payout deduplication/mismatches, recoveries, unavailable cash, snapshot mismatch rejection, administrator permissions, retained classification/void history and export reconciliation. UI DOM checks cover multi-select/search/clear/Escape, date presets/year/leap boundaries, pagination, four chart SVGs, unavailable/known cash states, print-all scope and staff read-only cash tools. The existing office workflow, commissions, navigation and inventory checks remain part of regression verification.

Actual office browser/print-preview and Excel/PDF appearance review remain pending. No commit, push or merge without approval.

Final verification: 124 regular backend tests passed, 1 optional isolated scenario skipped by the default command; the full isolated MongoDB/HTTP scenario was run separately and passed. Client production build, cash-report UI checks and existing office/commission UI regressions passed. Print/Excel/PDF appearance on the office computer remains an acceptance check.


## Export finishing and resumed checks — November 7, 2026

Collection/cash PDFs now use wrapped, measured table cells and repeat column headings after page breaks. Sample A4 pages were rendered and reviewed. A 32-payment pagination check retained every payment ID exactly once. Excel summary sheets have landscape print settings and frozen metadata; detail rows wrap long descriptions and property labels. Financial calculation and dataset selection are unchanged.

Fresh verification: 124 backend tests passed (1 optional integration skipped by the default command), isolated HTTP/MongoDB integration passed separately, client build passed, and collection/cash, office-workflow and commission DOM checks passed. Browser binary download failed, so real-browser responsive acceptance remains pending. No office database was changed and nothing was committed or pushed.
