# Payment acknowledgements, office payouts and cash additions

Status: implemented and tested on `feature/rems-navigation`. The user subsequently authorized committing and publishing this update. No merge or deployment is included. Existing records were not reset or migrated. Database integration tests used disposable databases only.

## Buyer acknowledgements

Payment Transactions now offers Print Acknowledgement for valid recorded payments, including payments without a newer batch reference. Existing group/original acknowledgement paths remain available and use the improved two-copy layout. The read-only receipt endpoint returns the effective posted payment, original receipt reference, project/property and company information; voided, cancelled or reversed transactions cannot be acknowledged as newly received.

Two matching copies are laid out on 8.5 × 13-inch long bond paper: OFFICE COPY above and BUYER'S COPY below, separated by a cut line. Both contain buyer/company details, project/phase/block/lot, date/method, payment/receipt IDs, amount in figures and peso/centavo words, purpose/remarks, statement and signature fields. Open preview first, then Print / Save as PDF. Reprinting does not post a transaction. Large group acknowledgements continue across multiple sheets, with two matching copies on each sheet, rather than dropping properties or truncating long remarks. Group original totals and current record statuses are identified.

## Supplier / landowner payouts

Open Financial Management → Payout Management, or Expenses & Remittances → Supplier & Landowner Payouts. New payout IDs use the OP sequence. The new OfficePayout model holds approval instructions and release history, not a duplicate cash ledger.

Workflow: Draft → Pending Approval → Approved → Partially Paid / Paid. Administrators can cancel only the unpaid balance. Staff can create/edit their own drafts and submit them; only administrators approve, release, return unpaid approvals for correction or void an incorrect actual release. Prepared/approved identities are recorded from authenticated users. Actual releases record their own date, amount, recipient, reference, method and funding.

- Expense payout: an actual release creates exactly one linked existing-model Expense. Alternatively, enter a previously recorded expense ID to link a matching unlinked posted expense instead of creating another. Matching date, amount, method, funding, category and project are required.
- Liability settlement: does not create an expense. A cash settlement links one existing-ledger OUTFLOW; a noncash settlement stays in payout release history without reducing physical office cash.
- Approval/status actions create no financial entries.
- Releases and linked records post atomically through the existing shared transaction/cash guard. MongoDB replica-set/sharded transaction support is required. A verified opening cash baseline is required for live cash releases; cash release dates cannot predate it. Unsupported/unfunded changes are rejected without partial posting.
- Request IDs, unique indexes, optimistic versions and transaction retries prevent duplicate submissions and over-release. Cash availability is validated against the complete existing cash timeline.
- Corrections use administrator-confirmed void and replacement release. Original releases and linked financial revisions remain in history. Linked expenses/cash entries cannot be independently voided or reclassified from other screens. Cancelling the remaining balance does not erase valid releases or refund money.
- Lots with a payout reference are protected from physical deletion.

Open an actual, nonvoided release's Preview Acknowledgement to print OFFICE COPY and PAYEE'S COPY together on long bond paper. It states the amount actually released, not the whole approved budget. A draft/approval is not a receipt of payment. Printing performs only reads.

Payout list search/status/date filters and server pagination return totals across all matching payout cases. Date filters select the payout entry date; expense/cash reports use each actual release date. Requested totals are distinct from released totals and are not expense/collection totals.

## Add Cash

Financial Management → Cash Management & Turnovers opens the existing Collection & Cash Summary/cash tools. The administrator's Add Cash button uses the existing cash ledger. Existing administrator-only cash permissions remain unchanged.

Sources: owner addition, fund replenishment, bank withdrawal, returned unused advance, other authorized source. Bank withdrawals use BANK_WITHDRAWAL; other additions use INFLOW, with their specific source stored separately. Date, positive amount, source, receiver, authenticated authorizer, optional reference and remarks are retained. An initial verified opening baseline is required and may be zero; additions cannot predate it. Backdated entries are authorized/audited under the administrator saving them. Original cash entries remain available for audited void/replacement corrections.

No additions are entered as buyer collections or revenue. Buyer payments remain automatic; do not encode them again as Add Cash. Supplier expense payouts already appear once in Cash Expenses; liability cash settlements appear once in Other Cash Outflows. Owner turnovers keep their existing treatment.

Cash tools include searchable/filterable manual-entry history and a preview before Print/PDF or Excel export. Exports use all matching entries, not just the visible page, and reject stale snapshots. The complete Collection & Cash Summary above includes automatic collections, expenses, commissions, refunds and manual cash movements; the manual-entry history does not duplicate those automatic records.

## Modified files

Frontend:
- client/src/App.jsx
- client/src/utils/workspaceNavigation.js
- client/src/utils/printAccountReports.js
- client/src/utils/printAcknowledgements.js (new)
- client/src/components/PaymentTable.jsx
- client/src/components/PaymentBatchAcknowledgment.jsx
- client/src/components/CashLedgerTools.jsx
- client/src/components/AddOfficeCash.jsx (new)
- client/src/components/CashHistoryActions.jsx (new)
- client/src/pages/ExpensesPage.jsx
- client/src/pages/PayoutsPage.jsx (new)

Backend/shared:
- server/src/app.js
- server/src/routes/financeRoutes.js
- server/src/routes/officePayoutRoutes.js (new)
- server/src/controllers/officePayoutController.js (new)
- server/src/controllers/paymentAcknowledgementController.js (new)
- server/src/controllers/cashAdditionController.js (new)
- server/src/controllers/cashHistoryExportController.js (new)
- server/src/controllers/cashLedgerController.js
- server/src/controllers/expenseCorrectionController.js
- server/src/controllers/structureController.js
- server/src/middleware/auditMutation.js
- server/src/models/OfficePayout.js (new)
- server/src/models/Expense.js (optional payout linkage fields/index)
- server/src/models/CashLedgerEntry.js (optional source/receiver/authorization/linkage fields)
- server/src/utils/generateRecordId.js
- shared/amountWords.js (new)
- shared/cashSources.js (new)

Tests/documentation:
- server/test/office-payout-acknowledgements.test.js (new)
- server/test/lot-inventory.test.js
- server/integration/office-payout-cash.test.js (new)
- This document.

## Validation

- Full suite: 252 passed, zero failures, 17 environment-gated skipped.
- Production build passed; the existing large-chunk advisory remains.
- Focused print tests verify singular/plural pesos/centavos, zero, large safe integer amounts, two matching copies, escaping, long-bond dimensions, group continuation and voided receipt rejection.
- Disposable replica-set integration passed: cash baseline and additions; no added revenue; authorization; approval without money movement; partial/cash/bank/electronic releases; idempotency; over-release/insufficient cash rollback; existing expense linking; protected corrections; liability settlement exclusion from expenses; cancellation and retained release history; withdrawal/void behavior; baseline-date restrictions; concurrent release protection; server pagination/all-matching totals; receipt read non-mutation; matching filtered Excel export.
- The requested example was verified: 2,000 opening + 5,000 addition − 1,500 cash payout = 5,500 physical cash.
- Rendered UI checks passed: administrator-only release controls, central confirmation before posting, staff restrictions, buyer two-copy preview with no POST, Add Cash sources/approval identity.
- Existing owner-turnover integration (standalone and replica), payment correction/persistence integration and company/reporting integration passed.
- Existing installment, penalty, commission, refund and cash calculation files were compared with the pre-change checkpoint and are byte-identical.

Actual browser Save as PDF, physical printing/cut alignment and real-device responsive acceptance remain to be checked on the office installation. No Windows installer/deployment work was included. General-purpose deletion of financial records was not added.
