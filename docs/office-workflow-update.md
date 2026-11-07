# Office workflow corrections

## Receipts and IDs

New payments require a manually entered receipt number, including leading zeros, letters and supported separators. No receipt ID is generated. Payment IDs remain server-generated. Existing receipts are preserved. The effective receipt is displayed in transaction history, CSV and the payment/commission Excel register. Corrections append revisions; staff corrections use the existing administrator approval workflow and now receive a server-generated REQ display number.

`RECEIPT_SCOPE` in the server environment identifies the issuing office/receipt series (default `OFFICE`). This deployment uses one configured issuing scope; there is no new user-selectable series registry. Duplicate matching is case-insensitive within that scope while stored text remains unchanged. Original and corrected historical receipt values remain protected after voids. Scalar unique `ReceiptClaim` keys prevent cross-account concurrent duplicate receipts on standalone MongoDB. Idempotent retries retain the submission ID. An uncertain/failed attempt may retain a protective claim: investigate the payment and claim before any administrative cleanup; do not auto-release it after a network error. No unreceipted payment category was invented. Legacy transactions without receipts can still be corrected without fabricating one.

Project creation generates PRJ IDs and editing cannot replace them. The existing sequence service now reconciles archived/current numeric IDs for projects, clients, agents, lots, phases, blocks, contracts, payments, expenses, payouts and requests, then increments counters atomically. Commission IDs remain automatically derived from the property contract, agent and commission period; existing IDs are not renumbered to a new cosmetic format. MongoDB identifiers and relationships are unchanged. Counter gaps after failed writes are intentional; IDs are not reused.

`server/src/scripts/backfillInternalIds.js` is a dry run by default. It checks existing top-level and embedded payment/payout/request IDs for conflicts and lists missing IDs. `--apply` fills only missing top-level IDs, with conditional writes and without altering existing values. Successful apply operations add migration audit events. It does not rewrite embedded payment/commission references. No production migration or backfill has been run. Review a database backup before using the apply option.

## Payment workflow

Primary client search is visible on the page with debounced suggestions, arrow-key navigation, Enter selection, Escape and clear. Advanced search remains available. Desktop uses a two-column account/payment layout with history underneath. Receipt entry is required, Payment ID is read-only, and previews refresh as valid payment values change. Posting still requires explicit Review and Confirm actions.

Penalty basis/status/priority editors are no longer in Add Client or its property agreement editor. New monitoring configurations have a visible pending policy state with penalties disabled and no invented basis. An explicit transaction priority must be chosen at payment time until policy setup is complete.

Payment Configuration supports a transaction-only allocation-priority override with a required reason for ADMIN/STAFF. It is persisted with the payment and used by the authoritative backend ledger. It does not amend contract terms. Penalty basis and policy status can be changed by ADMIN only through **Edit Permanent Contract Payment Policy**, an explicitly confirmed agreement amendment with history. Existing charges can be waived through the existing administrator Penalty Breakdown action. Payment-specific basis/status edits do not silently recalculate historical penalties. Policy status is distinguished from settled, partially paid and waived assessment balances. Changing permanent policy or a transaction override requires a fresh preview.

## Expenses and reports

Expenses has All/Daily/Weekly/Monthly/Yearly/Custom periods, project/category/search filters and the shared expense report panel. Reports also includes that panel using its existing date/project controls. The server generates the filtered records, total, transaction count, category/project summaries and monthly trend. Print, Excel and PDF use the same filtered dataset. Print uses an isolated escaped A4 landscape document, excluding navigation. Exports include system expense ID, date, description, project and recorded-by user. Unknown legacy recording users are labeled rather than fabricated.

## Search, dialogs and navigation

Shared suggestions are used for clients, projects, inventory, payments/transactions, agents/pickers, commissions, expense reports and users. Existing structured dropdown filters remain. Searches using server datasets are debounced where appropriate. Obvious fields no longer show help icons; complex payment, penalty, commission and correction settings retain guidance and required markers.

Commission records default to numeric installment sequence within each contract/agent (DP then 1, 2, 3...). Release-date sorting is still selectable and payout reports remain chronological.

The Client List Properties / Accounts action links to `/clients/:clientId/accounts`, with a Back to Client List link, client contact information, accounts, contract/payment details and history. The selected account is retained in the URL; returning highlights the client. Route navigation reveals/focuses the heading, and edit actions reveal their form. Existing sidebar focus/keyboard behavior remains separate.

The dialog manager focuses controls, traps Tab, supports safe Escape cancellation and restores focus. Informational popups dismiss with Enter/Space when appropriate; global Enter/Space never confirms financial/destructive actions. Native input typing and focused-button activation remain. Help/suggestion Escape is handled before dialog dismissal. Existing discard confirmations remain.

## Validation and limitations

Backend unit tests cover receipt text, historical duplicate protection, idempotent/scoped claims, project-generated IDs, expense totals and transaction allocation priority. The isolated MongoDB HTTP scenario includes concurrent receipt rejection, staff receipt correction and approval audit, leading zeros, payment replay, concurrent project creation, identifier immutability, expense XLSX reload/PDF signatures and numeric commission sequence, plus the existing financial regression scenario. UI DOM checks cover keyboard suggestions, required/manual receipt versus read-only ID, explicit payment confirmation, policy controls hidden on client entry, dedicated accounts context, informational/destructive popup behavior and escaped A4 print data; existing client/payment, commission, inventory and navigation regressions were also checked.

Actual Windows browser/print-preview and Excel/PDF appearance acceptance remain pending. No real office data was accessed or changed. No commit, push or merge is performed without approval.

Run from repository root in two terminals: `npm run dev --prefix server` and `npm run dev --prefix client`. Existing MongoDB and `.env` remain in use; no reseed/reset is required. No new production dependencies were added.

Latest verification: 111 regular backend tests passed, 1 optional isolated test skipped in the default run; that isolated HTTP/MongoDB test was run separately and passed. Client production build passed. DOM regression checks passed.

The missing-ID migration was also tested in dry-run and apply modes against the disposable test database: an archived project received only its missing ID, its MongoDB identity/status remained unchanged, existing IDs remained intact, and a migration audit event was recorded. No office database migration was run.

## Modified files

- `client/src/App.jsx`
- `client/src/components/AgentPicker.jsx`
- `client/src/components/AgreementEditor.jsx`
- `client/src/components/CenterPopup.jsx`
- `client/src/components/ClientAccounts.jsx`
- `client/src/components/ClientLookup.jsx`
- `client/src/components/ClientSearchModal.jsx`
- `client/src/components/CommissionLedger.jsx`
- `client/src/components/CommissionRecord.jsx`
- `client/src/components/ContractTerms.jsx`
- `client/src/components/DialogNavigation.jsx`
- `client/src/components/ExpenseReports.jsx`
- `client/src/components/FieldLabel.jsx`
- `client/src/components/PaymentConfiguration.jsx`
- `client/src/components/PaymentCorrectionModal.jsx`
- `client/src/components/PaymentTable.jsx`
- `client/src/components/PropertyPaymentHistory.jsx`
- `client/src/components/SearchInput.jsx`
- `client/src/pages/AgentsPage.jsx`
- `client/src/pages/ApprovalRequestsPage.jsx`
- `client/src/pages/ClientAccountsPage.jsx`
- `client/src/pages/ClientsPage.jsx`
- `client/src/pages/ExpensesPage.jsx`
- `client/src/pages/ManageLotsPage.jsx`
- `client/src/pages/PaymentPage.jsx`
- `client/src/pages/PaymentTransactionsPage.jsx`
- `client/src/pages/ProjectsPage.jsx`
- `client/src/pages/PropertyInventory.jsx`
- `client/src/pages/ReportsPage.jsx`
- `client/src/pages/UsersPage.jsx`
- `client/src/styles.css`
- `client/src/utils/fieldExplanation.js`
- `client/src/utils/navigation.js`
- `client/src/utils/printExpenses.js`
- `docs/office-workflow-update.md`
- `server/integration/payment-flow.test.js`
- `server/src/controllers/commissionController.js`
- `server/src/controllers/commissionReportController.js`
- `server/src/controllers/expenseReportController.js`
- `server/src/controllers/financeController.js`
- `server/src/controllers/paymentCorrectionController.js`
- `server/src/controllers/projectController.js`
- `server/src/models/Project.js`
- `server/src/models/PropertyAssignment.js`
- `server/src/models/ReceiptClaim.js`
- `server/src/routes/financeRoutes.js`
- `server/src/scripts/backfillInternalIds.js`
- `server/src/services/receiptService.js`
- `server/src/utils/contractMonitoring.js`
- `server/src/utils/generateRecordId.js`
- `server/src/utils/paymentLedger.js`
- `server/src/utils/paymentRegister.js`
- `server/test/finance.test.js`
- `server/test/identifiers.test.js`
- `server/test/lot-inventory.test.js`
- `server/test/office-update.test.js`
- `server/test/payment-controls.test.js`
- `server/test/payment-register.test.js`
- `shared/contractTerms.js`
