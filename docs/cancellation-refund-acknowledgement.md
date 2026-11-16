# Cancellation refund computation and single acknowledgement

Implemented in the existing Cancellation Workspace, cancellation service, refund release ledger and finance routes. No separate cancellation case or acknowledgement ledger is introduced.

## Staff workflow

1. Open the client's accounts and **Cancellations, Payment Credits & Refunds → Prepare Partial / Full Cancellation**.
2. Select the source contracts. Select a percentage or approved custom value and the penalty decision. The live internal computation shows eligible principal/DP, outstanding monthly penalties, gross, deduction and net. No money or credit is posted by this draft computation.
3. Complete the existing legal/contract review, prior-disposition reconciliation and commission-retention controls. Provide reasons for custom/no-deduction penalty decisions.
4. Select a monetary refund, installments, property credit or mixed settlement. The planner generates monthly dates and exact cent totals; an optional monthly override leaves the exact remainder in the last installment. Individual planned dates/amounts/methods remain editable.
5. Review the full internal computation and confirm administrator approval. Existing source reservations, transaction support, version checks, legal minimums and commission holds remain effective.
6. Record actual releases through **Record Actual Refund Release**. Planned installments are not cash outflows. Each actual release is allocated oldest-first to the approved schedule in the same transaction as its source allocation and payable update.
7. Complete the existing final cancellation/credit-posting review. Credits apply only to the same client's verified receiving contract, without recording a collection or cash disbursement. The cancelled lot stays unavailable pending Reopen Properties.
8. Use **Preview Refund Acknowledgement**, then **Print Office & Client Copies**. Reprint the same RFACK case reference after actual releases; no per-installment acknowledgement is generated.

## Acknowledgement rules

The client document receives a restricted settlement projection, not the internal payment ledger. It includes approved percentage and final net entitlement, actual releases, remaining obligations, installment dates/methods and receiving credit property. Original payment totals, receipts and gross-before-deductions are excluded. Internal reports retain the full computation and history.

Client-confirmed personal/no-fault wording requires both voluntary confirmation evidence and reviewed wording. Completion wording additionally requires finalized cancellation, fully paid monetary obligations, posted credits and any documented disposition. Otherwise the document explicitly retains outstanding obligations. These controls do not substitute for legal review.

The layout specifies 8.5 × 13-inch paper, with two copies separated by a dashed line. The print action checks that both copies fit. Oversized schedules/descriptions are blocked instead of silently clipping contractual obligations; arbitrary 1,200-month schedules cannot physically fit twice on one page. No financial term is shortened to force a printout.

## Validation

- Server suite: 453 passing, 29 skipped, 0 failing.
- New tests cover percentage and deduction bounds, exact cent rounding, month-end dates, custom final installments, partial/advance release allocation, backdated release allocations, payment-history exclusion, stable acknowledgement identity, credit posting and conditional declarations.
- Client production build passes (existing bundle-size warning remains).
- Live MongoDB transaction tests and interactive browser/physical print verification remain required on a disposable local installation. Chromium cannot start in this environment because socket creation is restricted.

No production records were changed, and nothing was committed, pushed or deployed.
