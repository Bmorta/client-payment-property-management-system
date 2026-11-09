# Completed buyer installments and commission cleanup

## Corrected rule

For new agreements whose commission term is no longer than the buyer's schedule, each fully paid eligible buyer installment earns one fixed commission period. Monthly commission budgets still divide the allocated commission over the agreed commission term. Earnings stop at that term's budget; penalty payments and down payments do not fill monthly periods. Partial principal accumulates until the actual scheduled buyer installment is complete.

Sample: TCP PHP250,000, no DP, buyer term 36 months with PHP6,945 scheduled monthly, commission 12% over 24 months. One completed installment earns PHP1,250. The prior calculation instead required PHP10,416.67 principal per commission period.

Existing agreements retain their saved rule until administrator review. Go to Commissions → Reconcile Existing Commissions, find the account, review before/after earned and releasable values, enter the correction reason and confirm Refresh Commission Earnings. Refresh the Unreleased list afterward. Preview reads do not change balances. Reconciliation retains original receipts, payments, actual payouts, agreement versions and audit history. Repeat application adds no duplicate earnings or payouts. Historical payout verification and recovery balances remain enforced.

Closed, transferred, cancellation-pending and credit-amended agreements require a separate reviewed amendment; automatic rule conversion is blocked. Commission terms longer than the buyer schedule retain their existing collection-based rule rather than inventing additional buyer installments.

## Cleanup

An administrator can open Clean Up Unused Entries from the Commission Ledger, choose a client/property, select eligible rows and confirm removal with a reason. The existing backend cleanup endpoint is reused. At most 100 zero-budget rows without payment allocations, earnings, releases, recoveries or financial audit history can be removed together. Valid allocated future rows are not unnecessary records and remain protected. Removed identifiers are retained as tombstones in the agreement so rows cannot be regenerated accidentally. Financial history is not physically deleted. Miscalculated earned rows are corrected through reconciliation, not deleted.

## Modified files

- shared/commissionMath.js
- server/src/utils/commissionLedger.js
- server/src/utils/commissionEarningPlan.js (new)
- server/src/controllers/commissionController.js
- client/src/components/CommissionAgreement.jsx
- client/src/components/CommissionReconciliation.jsx
- client/src/components/CommissionLedger.jsx
- client/src/components/CommissionCleanup.jsx (new)
- client/src/components/UnusedCommissionEntries.jsx
- server/test/buyer-installment-commission.test.js (new)
- server/integration/buyer-installment-commission.test.js (new)
- This document.

## Validation

- Seven new calculation tests cover the exact 36/24 case, partial and advance payments, budget/rounding caps, effective dates, reversals, multiple agents, penalty exclusion, historical holds, read-only proposals, idempotency, payout preservation and payment-register parity.
- The full suite passed: 242 passed, 15 environment-gated skipped, zero failures.
- A separate disposable replica-set integration test passed: payment before assignment, preview and posting, Unreleased list, partial actual payout, reviewed correction of a simulated legacy account, stale preview rejection, staff restrictions, preserved raw payment/payout data, idempotency, register/Excel and all-or-nothing bulk cleanup protections.
- Rendered DOM checks passed for eligible selection, protected earned/future rows and before/after reconciliation values.
- Production build passed with the existing large-chunk advisory.
- No office database was accessed or modified.
