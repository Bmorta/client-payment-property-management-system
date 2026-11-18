# REMS management dashboard

The home route now presents an executive overview and links to the existing workflows. Payment Reminders retains its dedicated route and table. The existing analytics API remains available to its original callers. The dashboard adds a read-only projection under that API namespace.

## Metric definitions and sources

| Display | Source and scope |
| --- | --- |
| Current Cash on Hand | The verified closing balance from the existing physical cash ledger, office-wide as of today in Manila. A missing baseline, earlier negative day or unresolved funding classification makes the balance unavailable. |
| Opening cash and today's cash activity | Today's verified opening and posted entries from `cashPosition`. Expense-linked releases are displayed under their payout type once. Other cash adjustments and transfers remain separate. Office-wide. |
| Today's and monthly collections | Effective posted receipts from `financialRows`, inclusive through today. Corrections follow their effective receipt values. Voided entries are excluded. Optional project/phase/block scope. |
| Noncash and unclassified receipts | The existing funding classifier applied to today's posted receipts in the selected inventory scope. |
| Expected collections | Face amounts of non-retired installment rows due in the selected period under the current active schedules. Includes paid scheduled installments for the actual-vs-expected comparison. Excludes down payments and pending cancellations. |
| Due today / through Sunday | Remaining principal of installments due on the indicated day or through Sunday. Due and overdue client KPIs count unique client IDs, while drill-down rows represent contracts. |
| Overdue and aging | Unpaid overdue principal from the canonical allocated schedule. Age is calendar days since grace ended. Penalties are separate. A contract can appear in multiple age buckets. |
| Advance payments, fully paid, critical | Advance coverage and settlement categories from the canonical account summary. Critical includes Critical and Forfeiture Review Required. |
| Active clients and contracts | Active client master count across the office, or distinct active clients with active qualifying contracts in the selected inventory scope. Contracts are counted independently. |
| Inventory | Current lot statuses. Lots in archived projects are reported with unavailable inventory. Available, reserved, sold and for-assume classifications remain distinct. |
| New contracts and cancellations | Original contract dates and approved cancellation effective dates within the period. Transfer, assumption and reactivation successors are excluded from original contract sales counts. |
| Earned, released, unreleased and releasable commissions | Existing commission ledger rules, including source allocations, recoveries, historical verification and contractual holds. The chart attributes earnings to their source allocations and releases to effective release dates. |
| Approval work queue | Pending counts from the existing Admin Review Center projection. Office-wide. |
| Outstanding payouts | Approved/partially paid office payouts less actual nonvoided releases. Office-wide. |
| Outstanding refunds | Approved refund payable less recorded actual releases. Property credit is outside this payable. Due amount uses the existing planned installment schedule and payments allocated against it. Office-wide. |
| Requests and upcoming visits | Open site requests by workflow status and the existing 24-hour request flag. Project scope applies. |

Cash on Hand and inventory are current snapshots. Period filters apply to scheduled collections, posted receipts, cash activity and chart dates rather than filtering the lifetime cash baseline. The cash chart stops at today. Filtering a project never turns a share of office cash into an independent project cash balance.

## Access and drill-down

The existing roles are ADMIN, STAFF and VIEWER. The new endpoint includes the full overview for administrators, operational receivables and requests for staff, and inventory and contract counts for viewers. Office cash, commission amounts, payouts, refunds and administrator approvals are restricted on the server. Existing workflow permissions continue to govern the destination pages. The header, navigation, notification and appearance providers remain shared.

Dashboard links use existing routes. Due, aging, scheduled and risk groups go to filtered Payment Monitoring. Payment links retain receipt dates and project. Inventory retains project, phase, block and status. Office payouts, refund cases, commission release eligibility and site requests use their existing queues with filters.

## Validation and limits

Disposable tests verify unique-client counts, unpaid principal and grace boundaries, actual posted receipt handling, office-wide cash scope and server-side role exclusions. Current schedules are used for expected collections even when viewing an earlier period. The dashboard does not reconstruct historical budget snapshots or reservations that lack a uniform historical event source. Current reservations are visible as an inventory snapshot. Agent ranking is by earned commission and also displays the count of original contracts in the selected period on which each agent appears. Co-agents can share the same contract, so those agent counts are not additive. Contract sales value is separate from collections. Drill-downs retain the most relevant filters supported by their destination. Phase and block are supported for inventory and receivables drill-down; the payment register and commission register accept project scope.

Historical ledger exceptions are shown explicitly. Data reconciliation against the installed office database, production query performance and full browser layout testing require the installed environment. No production financial figures were inspected.
