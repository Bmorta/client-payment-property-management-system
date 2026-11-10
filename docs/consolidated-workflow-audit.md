# Consolidated workflow audit — 10 November 2026

Database/Windows setup remains paused; its uncommitted work is preserved. No office database is connected or modified by this work.

| Workflow | Finding | Correction |
|---|---|---|
| Add property | Parent values reset, but form stays open, URL selects prior account, sibling overview stale, no synchronous submission lock | Close/reset after acknowledged save, select/highlight new account, refresh overview, lock duplicate submissions |
| Agent earnings | Register already accepts Agent ID. Detail endpoint returns whole account; selected agent in general register is not passed to vouchers | Apply immutable ID to details/history and voucher context; retain backend release guards |
| Commission filters | Single status and client | OR across selected statuses/clients, AND with remaining filters; same pipeline for exports |
| List reports | Client export could be limited to first 20; raw filter IDs printed; wide landscape layout | Export all matching records, portrait summary/detail document preview, counts and financial summaries |
| Contract dates | Financial schedule exists, expected end not presented | Read final effective schedule due date; separate calendar duration/unpaid count/actual settlement |
| Allocation | Unused-entry cleanup exists, but no budget-allocation overview | Read-only overview; never invent payable amounts for unconfigured budgets |
| Cash overview | Existing reports, administrative forms, daily ledger and charts share one long page | Keep reports; add focused overview/transactions/turnovers/adjustments using same ledger service |
| Opening cash | One active baseline already enforced, including zero; period opening derived automatically | Preserve; hide initial-baseline form once established; corrections remain explicit |
| Turnovers | Existing POSTED rows mean already handed over; creating them immediately deducts cash | Preserve old rows; separate approval requests from actual releases; release once atomically into existing ledger |
| Reconciliation | No counted-cash evidence/review workflow | Store count/system snapshot/difference as review evidence; never auto-balance |

## Cash logic before changes

`cashPosition` is authoritative. Opening for a date equals the one approved baseline plus all earlier actual cash events. Closing equals opening + cash collections + other cash inflows/withdrawals/recoveries − cash expenses − bank deposits − owner turnovers − other payouts/refunds/outflows. Noncash methods do not affect physical cash. `OTHER` requires an explicit funding account. Missing baseline, unknown classification, mismatched linked expense, or a negative daily balance makes cash unavailable instead of assuming zero.

Posted buyer payments come from contract payment histories. Effective corrections are respected. Historical imported collections/payouts are excluded from live cash; a post-cutoff verified baseline is required. Effective commission payouts and recoveries are read from their original ledgers. Linked commission expenses are deducted once; ambiguous equal-value independent expenses require classification. Supplier payouts reuse linked expenses or cash entries, so they are not collected a second time. Refund releases are disbursements, not revenue/expense duplicates. Bank deposits/withdrawals and owner contributions/turnovers are movements, not new revenue or expenses.

## Proposed cash behavior

No change to `cashPosition`, allocation, installment, penalty, commission, cancellation or refund formulas. New dashboard is a read-only projection of existing cash events. Running balances include all events before UI filtering. Existing POSTED turnovers remain actual releases. New turnover requests remain outside the ledger until explicit administrator approval and actual release, within the existing cash transaction guard and full timeline validation. Counts are evidence only and require a fresh system position when approved; discrepancies do not create ledger entries. No new backup requirement, migration, deletion, restore, or reset.
