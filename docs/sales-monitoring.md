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

Formal verified primary/supporting agent attribution, approved sales contribution shares, and sales targets are future enhancements; historical attribution is not fabricated.
