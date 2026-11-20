# Sales Monitoring & Performance

Access **Reports → Sales Monitoring** as an administrator. The workspace is read-only for business records; it uses the existing financial report services, account allocation rules, and company report branding. No financial records or saved property status values are rewritten.

## Reporting definitions

* Gross booked sales: original contract values at booking, dated by original contract date. Later cancellations and forfeitures do not erase original bookings.
* Net recorded sales movement: original bookings plus replacement entries, less cancellation, forfeiture, transfer and assumption exits, plus dated price corrections and same-contract reactivations. An equal-value replacement produces zero net movement. This is not accounting revenue or profit.
* Current valid contracts: nonterminal, nonvoid contract records (including pending cancellation until finalization); conflicting lot/contract links are flagged for review. Fully paid means current administrator settlement verification; other zero-principal accounts show settlement pending or principal fully paid.
* Current vs. closing receivables: current uses today's allocation ledger; selected-period closing uses recorded lifecycle movements and the ledger at the end date. Missing dated evidence or overlapping contracts make historical closing totals unavailable.
* Collections: posted original receipts by payment date, including reservation fees. Conversion credit is not a new receipt. Actual commission releases are measured from the payout ledger, independently of sales.
* Reservation conversion rate: reservations created in the selected period that have a recorded conversion through today, divided by that same cohort. Conversions during the period are counted separately. Current prospects are office-wide only.
* Agent sales attribution: recorded reservation agent or earliest available commission allocation. Unassigned and shared sales remain distinguishable; shared agent sales values must not be summed to reproduce company totals. Commission amounts follow actual earning and payout agent; they are not inferred from sales value.
* Project, agent, type and current status filters apply to the selected report scope. Current-status filters are not retrospective status filters. Period activity and current snapshots are deliberately separate.

## Reconciliation

Legacy direct assignments may keep a saved RESERVED status; the inventory and dashboard now use a common read-time business status to recognize a valid sale, without changing stored status or historical audit records. A genuine reservation remains reserved. An available lot with conflicting contract/reservation evidence is restricted for review. Missing evidence is surfaced, not fabricated.

Existing inventory reports now use posted payment receipts (including reservation receipts) and do not count converted reservation credits as new collections.

## Manual verification

Use a disposable database, preferably the fictional sample dataset from the sales review. Compare gross original value, current active contract value, and period collections separately. Before converting a ₱10,000 reservation, confirm that its receipt is included in collections but not sales. On conversion with a ₱40,000 new down payment, confirm that only ₱40,000 is new money, ₱50,000 principal is satisfied, and the full new contract value is booked. Compare project totals with the all-project report. Test the same and higher-value lot transfer, assumption, cancellation, forfeiture and reactivation. Check initial and reassigned agents and shared sales.

Select each preset, then a historical custom period. Use the report register to inspect the underlying contracts and movements. Export Excel/PDF or open print preview. Export verifies the report snapshot and requires refresh if records changed.

## Advanced Sales Planning (Phase 3)

The Sales Monitoring page now includes **Advanced Sales Planning & Performance**. Choose a planning year (including future calendar years) and create monthly or annual company, project or agent targets. Targets can contain a gross-booked peso amount, a contract-count goal, or both. Monthly and annual targets are independent. Target achievement uses all original bookings in that calendar period up to today; report type/status filters do not change the target denominator. An agent target measures approved weighted shares, not the full amount of every contract associated with that agent. Inactive targets remain in history.

For an original contract, use **Sales Register → Approve shares / Review shares**. An administrator selects exactly one primary agent, any supporting agents, and positive shares summing to 100%. A reason, explicit confirmation and the latest record revision are required. Sales contribution is separate from commission allocation. An approved correction changes the management attribution used by reports (including historical comparisons); previous revisions and approval details remain in the audit trail. Existing unverified associations are not silently converted to 100% sales shares. Replacement contracts cannot be booked a second time.

Sales planning writes use an independent MongoDB collection with atomic revision checks and embedded approval history. They do not modify contract prices, payments, commissions, financial ledgers or the active-contract index. User Activity Logs also records Sales Planning changes. No historical backfill or financial migration is required.

The approved leaderboard uses exact integer-centavo allocations and weighted contract units (70% = 0.7 sale units). Unverified bookings remain in company/project sales, but are excluded from weighted agent totals and flagged. Year-over-year compares the same calendar date range in the previous year; zero prior-period totals produce N/A, not invented growth. Month-end and year-end projections are simple daily run rates from the first day of the report-ending month/year through the selected end date, not guaranteed revenue. Current sell-through uses verified sold lots divided by verified sold + available + genuine held reservations; restricted, archived and conflicting/unknown lots are excluded. The rate is only shown for company/project scope without agent/type/status filters.

Excel, PDF and print previews include the advanced performance results and approved shares. Sales Planning records are included in the existing whole-database backup process.
