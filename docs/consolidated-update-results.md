# Client, commission, printing and cash workflow update

## Implemented

- Add Property now synchronously locks duplicate submissions, retains failed inputs, resets/closes only after a persisted success response, selects and highlights the new account, refreshes the property list and sibling overview, and provides View Property Details.
- Contract information shows contract/start/final scheduled dates, due day, calendar months/days remaining, total/paid/unpaid installments, lifecycle/payment status and actual completion/settlement dates. It reads the effective schedule and does not extend overdue contracts or shorten contractual dates after early payment.
- Commission detail/history requests and voucher context use Agent ID. Agent headings include the selected name; account-wide recovery restrictions remain enforced. Selected-agent filters apply to register totals, pagination and exports.
- Searchable multi-select commission statuses and clients combine with project, property, agent and date filters. Earned, unreleased, released, partial, held and existing statuses use the shared backend report pipeline. Unallocated budgets have a separate linked view because unallocated budgets are not earning rows.
- Unallocated Commissions is accessible in navigation and Commissions. It shows contract/client/property, configured budget, allocated/unallocated budget, earned commission, agents, holds/reconciliation warnings and expandable valid payment references/dates/amounts. Unconfigured budgets say Not configured. Existing apportionment logic is reused, including centavo rounding.
- Client search includes project/property/contract. Multi-select account statuses match any qualifying contract and show matching properties. Master client Active/Inactive remains separate. Settlement and lifecycle classifications reuse the current ledger and may overlap.
- Client exports now include all matching pages. Client and agent reports include summary totals, filtered/all-list scope, portrait summary/complete document previews, and dedicated printable documents. Detailed commissions print as wrapped record blocks. No raw filter IDs or query paths appear in these print documents. Existing export preview/snapshot checks remain.
- Cash Management now opens Cash Overview, Cash Transactions, Turnovers and Cash Adjustments. Existing detailed reports remain in Reports. Cards distinguish current physical cash from period opening/closing, inflows, additions, expenses, other releases, turnovers and bank deposits. Cash-added figures are explicitly included within receipts.
- Cash Transactions uses the original cashPosition events with source links, cash in/out, stable chronological order, running balance, filters, pagination and all-matching preview/Excel. Running balances are computed before row filtering; noncash collections remain in Financial Reports.
- New turnover requests progress Draft → Pending Approval → Approved → Released. Only explicit actual release writes once to the existing CashLedgerEntry ledger inside its cash transaction guard. Available cash is validated again across the full timeline. Repeated release is idempotent. Actual released turnovers have an acknowledgement preview and print/PDF action. Existing direct POSTED turnovers and their correction/void/history tools remain available.
- Cash counts retain system amount, counted amount, difference, date, remarks and review history. Administrator approval never creates an adjustment. Approval refuses a stale system snapshot. Approved adjustments remain explicit in the existing cash tools.
- Opening remains one initial baseline, including zero, with automatic carry-forward. The initial-opening option is hidden in the focused dashboard after a baseline exists; existing audited correction tools remain.

## Audit and cash calculation

See [consolidated-workflow-audit.md](consolidated-workflow-audit.md) for the initial findings and existing cash behavior. The authoritative cash calculation is unchanged:

Opening + posted physical cash inflows − posted physical cash outflows = closing.

Bank/electronic collections are excluded. Linked expenses/commission payouts are deducted once. Historical collections/payouts remain outside live office cash and require the existing post-cutoff baseline. Missing classifications, missing baseline, invalid links and negative daily balances produce Unavailable rather than zero. Pending commissions, unpaid expenses and draft/approved turnovers do not spend cash.

## Validation

- `npm --prefix server test`: 314 discovered, **287 passed, 0 failed, 27 environment-gated skipped**.
- Disposable MongoDB replica-set API integration: passed. Verified two-agent isolation, combined filters, all-page client exports, report summary parity, allocation budgets, permissions, draft/approved cash remaining unchanged, actual release deducted once, duplicate release protection, available-cash refusal, carry-forward, stale-count refusal, count discrepancies causing no balancing entries, Excel generation/stale-preview refusal, successful/duplicate property assignment, corrected/voided turnover linkage and original payment preservation.
- React/jsdom interaction harness: passed. Verified successful property close/reset/select/highlight, failed-input preservation, synchronous double-submit lock, scoped detail/voucher requests, named agent heading, combined status parameters, summary/detail print HTML without technical filter IDs, cash dashboard/source links and read-only preview.
- Frontend production build: passed; existing large-chunk advisory remains.
- Hash comparison against the pre-task checkpoint confirms `paymentLedger.js`, `financialReporting.js`, `commissionLedger.js`, `paymentSchedule.js`, `cashMovementService.js` and `accountSettlement.js` were not changed.

Tests use disposable databases only. No office database was accessed, migrated, reset, restored or deleted. No commit, push, merge or deployment was performed. The unfinished Windows/database setup work remains preserved and paused.

## Limits and follow-up verification

- Connected browser access was unavailable. Actual visual layout at 1920/1366/1024/768/390/320 widths, both themes, screenshot comparisons and physical print alignment are **unverified**. Component tests and generated print HTML do not establish visual correctness.
- Browser-generated URL/title/page headers require disabling Headers and footers in the browser print dialog.
- No separately tracked bank/e-wallet cash funds were introduced. Existing office physical-cash fund and financial reports are reused.
- Date-only cash records use date/reference ordering. Running balances do not claim exact intraday sequence.
- Existing direct turnover records remain accessible in Cash Adjustments/history. New turnover requests are separate approval evidence and do not replace or rewrite old records. To correct an actual released turnover, use the existing audited Correct Turnover action in cash history; draft mistakes can be cancelled and re-entered.
- Unallocated is intentionally a separate budget view, linked beside earning-status filters; it is not combined with payable earning rows or counted as releasable commission.
- Cash-sensitive actual release still requires the existing MongoDB transaction support. The postponed database setup task was not bypassed.

## Run locally

Keep the existing environment/database settings. In separate terminals:

```text
cd server
npm.cmd install
npm.cmd run dev
```

```text
cd client
npm.cmd install
npm.cmd run dev
```

Open the URL printed by Vite. `npm.cmd` avoids PowerShell's npm.ps1 execution-policy issue. There is no migration command for this update. New cash review evidence is stored separately from the existing ledger when an authorized administrator first uses the feature.

## Modified files

- `client/src/components/CashLedgerTools.jsx`
- `client/src/components/CashOfficeDashboard.jsx`
- `client/src/components/ClientAccounts.jsx`
- `client/src/components/CommissionAgreement.jsx`
- `client/src/components/CommissionLedger.jsx`
- `client/src/components/CommissionRecord.jsx`
- `client/src/components/CommissionVouchers.jsx`
- `client/src/components/ExpenseManagement.jsx`
- `client/src/components/ListReportActions.jsx`
- `client/src/components/PaymentMethodFilter.jsx`
- `client/src/components/PropertyPaymentDetails.jsx`
- `client/src/components/UnallocatedCommissions.jsx`
- `client/src/pages/AgentsPage.jsx`
- `client/src/pages/ClientAccountsPage.jsx`
- `client/src/pages/ClientsPage.jsx`
- `client/src/pages/CommissionsPage.jsx`
- `client/src/pages/ExpensesPage.jsx`
- `client/src/pages/PaymentTransactionsPage.jsx`
- `client/src/pages/PayoutsPage.jsx`
- `client/src/pages/ReportsPage.jsx`
- `client/src/utils/workspaceNavigation.js`
- `docs/consolidated-update-results.md`
- `docs/consolidated-workflow-audit.md`
- `server/integration/consolidated-workflows.test.js`
- `server/src/controllers/cashOfficeController.js`
- `server/src/controllers/clientController.js`
- `server/src/controllers/commissionController.js`
- `server/src/controllers/commissionReportController.js`
- `server/src/controllers/listReportController.js`
- `server/src/controllers/unallocatedCommissionController.js`
- `server/src/models/OfficeCashReview.js`
- `server/src/routes/commissionRoutes.js`
- `server/src/routes/financeRoutes.js`
- `server/src/services/cashOfficeView.js`
- `server/src/utils/listReport.js`
- `server/test/cash-office-review.test.js`
- `server/test/consolidated-workflows.test.js`
- `shared/clientAccountStatuses.js`
- `shared/contractDates.js`
