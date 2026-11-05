# Client Payment & Property Management System — feature checklist

Delivery branch: `feature/property-inventory`. This checklist covers the changes developed in this session, including earlier inventory updates. Main is not merged as part of this delivery. Existing office records are not seeded/reset/migrated by these instructions.

## Projects and property inventory

- [x] Separate Manage Lots page with Back to Project List.
- [x] Connected phase/block/lot management, including legacy structures represented by lots.
- [x] Custom lot numbers, with duplicate prevention within a project/phase/block.
- [x] Lot area, price per sqm and calculated price per lot.
- [x] Bulk deletion checkboxes; deletion limited to available lots without client/account links.
- [x] For Assume availability status (status only; no ownership-transfer workflow).
- [x] Inventory filters by phase, block, lot and availability.
- [x] Phase/block/lot cancel actions with Keep Editing / Discard Changes for dirty drafts.
- [x] Existing availability colors and centered confirmation/notification dialogs retained.

## Clients and agreements

- [x] One client master record with multiple property accounts across projects.
- [x] Project/phase/block/lot selection and agreed selling-price snapshot.
- [x] Server-generated, read-only client IDs; existing IDs preserved.
- [x] Standard terms plus custom installment terms and estimated payment schedules.
- [x] Administrator agreement editing, confirmation, history and version checks.
- [x] Per-property due day, grace days, monthly installment, penalty rate/basis/status/effective date, payment priority, reminder days and forfeiture thresholds.
- [x] Existing contracts receive no invented automatic penalty rate; configure terms explicitly.

## Payments and correction controls

- [x] Main-menu Payment and Payment Transactions pages.
- [x] Server-paginated client search by ID/name/project/lot.
- [x] Selected-property balances, progress and payment history.
- [x] Separate system payment and internal receipt numbers; historical references retained.
- [x] DP, installment, automatic and penalty-only payment allocation.
- [x] Backend allocation preview and confirmation for configured contracts.
- [x] Partial and advance allocation against actual schedule amounts, with saved allocation history.
- [x] Next actual unpaid due date; paid-month counts exclude DP/penalty receipts.
- [x] Retry protection, duplicate-submission protection and overpayment checks.
- [x] Staff payment correction requests; administrator approval/rejection/stale detection.
- [x] Administrator corrections/voids preserve original transactions and append revisions.

## Penalties, reminders and forfeiture monitoring

- [x] Grace-period expiry uses Philippine calendar dates, including month-end/year transitions.
- [x] Simple monthly penalties per unpaid installment; explicit full-installment or unpaid-balance basis.
- [x] No penalty compounding, daily assessment or property-price basis.
- [x] Assessed charges remain until paid, explicitly waived or validly reversed.
- [x] No false reminders, penalties or risk counts for advance-covered installments.
- [x] Partial future installments retain their actual outstanding principal.
- [x] Consecutive overdue principal counting after grace; paid periods break the sequence.
- [x] Upcoming/due/grace/overdue/advance/critical/review monitoring and project/date/status filters.
- [x] Dashboard prioritizes critical accounts and shows the next unpaid due date.
- [x] Administrator review status, reasons and notice/legal-review references.
- [x] No automatic contract termination, client removal or lot release.
- [x] Startup and periodic reconciliation recover missed cycles without duplicate assessments.

## Agents and commissions

- [x] Separate Agents and Commissions menu items/pages.
- [x] System-generated Agent IDs; profiles, search, project filters, edit and archive.
- [x] Inactive agents retain financial history and existing agreement records.
- [x] Property-specific commission agreements and multiple agents per sale.
- [x] Backend percentage caps and centavo budget apportionment.
- [x] Separate DP and monthly commission budgets, with final-period rounding adjustment.
- [x] Earnings depend on actual eligible buyer principal collections, including partial/advance payments.
- [x] No earnings from due dates alone, penalty/fee allocations, cancelled or voided receipts.
- [x] Separate earning and payout statuses.
- [x] Project-specific agent ledger, summary cards, server filters/sorting/pagination.
- [x] Actual payout dates, methods, references, notes and releasing administrator.
- [x] Partial/full payout history with duplicate and concurrent-overpayment protection.
- [x] Corrected/voided buyer payments create adjustments/recovery balances without erasing payouts.
- [x] Explicit actual recoveries and appended payout corrections.
- [x] Commission-ready/adjustment/recovery notifications and audit records.
- [x] Agent/project/property/DP/monthly/released/unreleased/payout/adjustment reports.

If buyer and commission terms differ, commission periods represent portions of remaining principal funded by actual buyer installment receipts. They are not calendar promises to pay unearned commission. See `agent-commissions.md` for formulas and rounding rules. Optional bulk commission release and a separate staff payout-approval process are not included; actual releases are administrator-only.

## Expenses, reporting and shared controls

- [x] Office, project and other expenses.
- [x] Daily, weekly, monthly, yearly and custom report ranges.
- [x] Collections, expenses, balances and CSV exports.
- [x] Due/overdue/advance/fully-paid/penalty/critical/forfeiture datasets and Excel exports.
- [x] Commission PDF and Excel exports; Reports links to the commission module.
- [x] Persisted notification bell with unread counts, per-user reads and authenticated live updates.
- [x] Philippine header clock and administrator User Activity Logs.
- [x] Backend role checks, financial validation, document versions and append-only histories.

## Verification completed

- [x] 98 unit/controller tests passed; the optional database test is skipped in the ordinary run.
- [x] Isolated MongoDB HTTP integration passed separately, including simultaneous payout attempts.
- [x] DOM interaction checks passed for existing payment/inventory flows and new agent/commission controls.
- [x] Production frontend build passed.
- [x] Git whitespace/diff check passed.
- [x] Office database, credentials and existing records were not used or modified by testing.

## Local acceptance checks still to do

- [ ] Pull the published feature branch on the Windows office computer.
- [ ] Install dependencies (the server now includes PDFKit).
- [ ] Start the API and frontend with the existing MongoDB service and `server/.env`.
- [ ] Check actual browser layouts and Admin/Staff/Viewer access.
- [ ] Configure a test agreement and verify the office's chosen contractual terms.
- [ ] Test the complete client → lot → payment → correction → commission → payout flow using designated test records.
- [ ] Check PDF/Excel downloads and review balances against known examples before operational use.

## Pull and run

First run `git status` in your existing repository. If you have local changes, preserve them before pulling; do not reset or overwrite them.

```powershell
git switch feature/property-inventory
git pull --ff-only origin feature/property-inventory
npm install --prefix server
npm install --prefix client
```

Keep MongoDB running and retain the existing `server/.env`. In separate terminals, from the repository root:

```powershell
npm run dev --prefix server
```

```powershell
npm run dev --prefix client
```

Open the Vite address, normally `http://localhost:5173`. Do not reseed/reset the database. For detailed modified-file lists and behavior, see `contract-monitoring.md` and `agent-commissions.md`.
