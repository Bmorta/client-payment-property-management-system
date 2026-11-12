# Forfeiture and cashiering audit — November 11, 2026

Initial inspection, before implementation:

| Area | Finding | Severity | Correction | Verification |
| --- | --- | --- | --- | --- |
| Payment Monitoring → Open Account | Account risk form records review labels but does not expose the existing atomic forfeiture action. Actual closure controls are on Client Accounts / already-forfeited history. | High | Expose the existing workflow from the monitored account, distinguish eligibility, review and actual closure. | Source confirmed; baseline disposable replica-set lifecycle test passes. |
| Forfeiture review | Existing preview is financially complete internally but displays only principal and penalty totals. Eligibility, commissions, receipts and obligations are difficult to review together. | High | Display the authoritative preview ledger, commission holds, payment history, and separate obligation review notice. | Source confirmed. |
| Forfeiture decisions | Rejection/withdrawal can be submitted without a pending review; default action always starts another review. | Medium | Validate transitions; select the next applicable action; retain legacy review compatibility. | Source confirmed. |
| Accept Payment | Months-to-pay requires an Apply button and remarks wait for a receipt number before updating. | High | Share the schedule quote calculation between frontend context and backend; immediately populate amounts and periods. | Source confirmed. |
| Accept Payment | Long vertically stacked selection/form/history; no tendered/change summary. | Medium | Two-column cashier layout with compact client/property panel and prominent principal/penalty/total/tender summary. | Source confirmed. |
| Payment reset / retry | Receipt close clears the saved acknowledgment, preventing a separate reprint; rapid submission relies on render-state locking. | Medium | Preserve last saved receipt for reprint; synchronously lock confirmation and retain the request identity on uncertain results. | Source confirmed. |
| Database | Actual transaction and active-contract index checks exist; routine forfeiture has no full-backup prerequisite. | — | Retain these safeguards; no new indexes or migrations are required for this change. | Source confirmed; standalone/replica-set tests run separately. |

No office database is connected for this work. Tests use isolated disposable databases. Browser connection is unavailable; rendered visual verification will be reported separately from DOM tests.

## Completed changes — November 12, 2026

The baseline atomic forfeiture lifecycle passed before changes. The demonstrated access problem was that Payment Monitoring directed administrators to a payment account view containing review-label controls without the existing actual closure controls. No financial engine replacement was needed.

- Payment Monitoring now offers **Review Forfeiture** for risk/review accounts and opens the existing contract workflow in the payment account view. Client Accounts keeps the same workflow.
- Workflow actions follow the current review state: start review, approve, reject, or withdraw. Existing legacy pending-review labels remain compatible. Approval still revalidates eligibility and requires an explicit administrator confirmation.
- The review preview displays client/property details, TCP, actual payments, principal/credit amounts, unpaid periods, grace dates, threshold, penalties, receipts, commission earnings/releases/recoveries/holds, and a separate refund/credit review notice.
- Repeated review starts and decisions without a pending review are rejected. Financial lifecycle decisions cannot predate approved credit amendments. Existing transactions, version checks, active-contract uniqueness, commission restrictions, audit events, frozen obligations, property release review and reactivation remain in use.
- Genuine transaction/index errors link to existing System Health & Database Readiness. No new index, migration, or ordinary-operation backup prerequisite was added.
- Accept Payment now uses a client/property panel beside the cashier transaction form on desktop and stacked panels on smaller screens. Existing search suggestions, multi-property receipts, allocations, initial penalty agreement, account details and histories remain accessible.
- Entering months updates installment amount, covered periods and suggested remarks immediately from the server-provided dated ledger. Shared quote logic skips fully paid/retired periods, uses partial balances, and respects variable/final installments. Manual amount entry remains available and clears the months hint.
- Backend posting reuses the same quote helper and rejects months hints whose type/amount no longer match the authoritative schedule. This adds validation, not a new payment formula.
- Principal and penalties remain separate. Cash tender/change are cashier calculations; only the allocated amount due is posted. Other charges display zero because this payment workflow has no existing separate authorized-charge posting mechanism; none was invented.
- One Review Payment action precedes Confirm & Save. A synchronous submission lock prevents rapid double clicks. An uncertain result retains the request identity and can be checked/retried safely.
- Receipt close resets transaction inputs and parent feedback. The last saved acknowledgment remains available through **Reprint Last Receipt**. Printing/cancelling a print never sends a payment request or reverses a saved payment. Existing two-copy print documents are reused.

## Verification results

| Check | Result |
| --- | --- |
| Existing and new Node regression tests | 374 passed; 0 failed |
| Production frontend build | Passed; existing large-chunk warning remains |
| Forfeiture integration on disposable replica set | Passed: permissions, eligibility, approval, frozen obligations, reopening, reactivation, replacement credits, conflicts, idempotent retry, concurrency, rejection/withdrawal, partial commission release preservation |
| Forfeiture integration on disposable standalone MongoDB | Passed: coordinated lifecycle changes rejected before financial/inventory mutation |
| Payment integration on disposable standalone MongoDB | Passed: single posting, penalty decisions, quote parity, stale month hint rejection, duplicate retry, receipt lookup and reports; multi-property posting correctly refused |
| Payment integration on disposable replica set | Passed: atomic batches, injected-write rollback, quote parity, duplicate prevention, penalties, receipt retrieval and preserved histories |
| Simulated DOM interaction | Passed: immediate 3-to-2 month change, amount/remarks, net posting, double-click guard, receipt preview/reset/reprint, lost-response recovery, forfeiture preview and explicit approval |
| Whitespace check | Passed |

The existing payment integration assertion used a hardcoded Excel header row that no longer matched the report layout. The assertion now locates the receipt header and verifies the first receipt and text formatting; report implementation was not changed.

## Verification limits and remaining checks

- Connected browser access was unavailable; the cloud browser could not reach the local preview. DOM tests do not count as rendered visual inspection.
- Actual desktop/tablet/mobile layout, Light/Dark appearance, keyboard behavior across native iframe printing, native print cancellation/errors and paper output remain unverified. No before/after screenshots were captured.
- Integration tests used isolated MongoDB 7.0.24 instances on Linux, not the user's Windows office service or populated production database.
- Refund entitlement and disposition remain a separate administrator process. Forfeiture does not invent a refund amount or automatically release funds, reverse commissions, or return lots to Available.
- No production records, historical payments, receipts, commission earnings/releases, contract formulas, or penalty calculations were modified by this work.
- Publication authorized by the user. Deployment and office-service updates are separate.

## Files in this task

- `client/src/components/PropertyPaymentCheckout.jsx`
- `client/src/components/ForfeitureActions.jsx`
- `client/src/components/ForfeitureReviewSummary.jsx` (new)
- `client/src/components/ClientAccounts.jsx`
- `client/src/pages/PaymentPage.jsx`
- `client/src/pages/PaymentMonitoringPage.jsx`
- `client/src/styles.css`
- `client/src/utils/cashierDraft.js` (new)
- `shared/installmentQuote.js` (new)
- `shared/forfeitureWorkflow.js` (new)
- `server/src/utils/paymentIntent.js`
- `server/src/services/forfeitureService.js`
- `server/src/controllers/forfeitureController.js`
- `server/test/cashiering-forfeiture-workflow.test.js` (new)
- `server/integration/forfeiture.test.js`
- `server/integration/multi-property-payments.test.js`
- This report.
