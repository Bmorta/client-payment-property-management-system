# Administrator-controlled lot transfers

## Use

Clients → open client account → Properties → expand Property Details → **Transfer Lot** (administrator only). Staff can inspect approved history and reports; they cannot approve a transfer.

1. Select an available unassigned lot, optionally in another active project. Project and Property ID search narrow the first 100 available results.
2. Review principal actually allocated, including down payment, partial and advance principal. Penalty payments are excluded. An approved inherited transfer credit remains traceable through the linked transfer chain.
3. Approve credit up to eligible principal. A smaller credit requires justification and documented disposition of the non-transferred amount. Credit exceeding the new price is rejected; resolve that amount explicitly rather than silently refunding it.
4. Continue the count of remaining unpaid installment periods (partial periods count as remaining) or choose a new term of 1–1200 months, including the standard terms. A completely covered original schedule requires a new term for a new balance.
5. Set the transfer date, installment start, first due date, due day, agreed down payment and explicit agreed interest/fee totals with their calculation basis. No interest-rate formula is invented. Review replacement monitoring terms; days 29–31 clamp correctly while retaining the chosen due day across months.
6. Settle original penalties separately before transfer or explicitly approve their waiver with the documented transfer reason. No penalty is converted to principal credit. Original earned/released commissions stay on the original account; no commission assignment, earning or payout is copied. Resolve historical payout verification, recovery balances, pending corrections, staged migration and open commission vouchers first.
7. Review the original/replacement schedules and financial snapshot, then confirm administrator approval. Changing the input clears its preview. Changed account/inventory records invalidate the server token.
8. On approval, one MongoDB transaction closes the original account as TRANSFERRED, creates a linked replacement and TRF ID, applies the noncash principal adjustment, records penalty waiver history where approved, resolves old actionable reminders and claims the destination. The old lot becomes Available only with explicit clearance; otherwise it remains Unavailable. Keep it held until appropriate clearance; there is no automatic release or forfeiture.

## Credit and accounting

Credit is separate from the Payments array and is not a cash transaction, receipt, commission source or additional revenue. Replacement collectible schedule = new lot price + explicit agreed interest/fees − approved credit. Credit first satisfies the agreed DP; only residual DP is scheduled as collectible. Remaining monthly principal is split exactly in integer centavos. Schedule amounts are already net of credit; never deduct it a second time when collecting installments. Full contract price, credit, residual DP and installment balance are shown separately.

Original receipts, their corrections, commission agreements and actual payouts remain on the original account. Transfer summaries retain the financial snapshot at approval, old versus new schedules, adjustment disposition, original payment history and commission reconciliation. Print and Excel derive from the same saved snapshot. Payment schedule exports label the noncash adjustment. Collection/Cash reports continue to count original actual receipts once. Inventory financial totals retain real collections and earned/payout history from transferred contracts without counting the old account as another active sale/receivable.

A transferred source cannot receive payments, payment corrections or ordinary agreement edits. A replacement schedule cannot be overwritten by the ordinary agreement editor. Original earned commission payouts/recoveries remain possible through existing authorized workflows. Creating/changing commission agreements on transferred-source or replacement accounts is deliberately blocked until a separate transfer-aware amendment is reviewed; the feature does not invent a second commission entitlement. There is no automatic refund, payout reversal, transfer reversal, or silent amendment of historical receipts. These require a separate authorized accounting workflow.

## One-time upgrade for an existing database

The previous global `property_1` unique index allowed only one contract ever per lot. Transfers require retained historical contracts plus one ACTIVE contract. Existing legacy accounts must receive lifecycle ACTIVE before that global index is removed. The application refuses to post transfers while the old global uniqueness index remains or the new active index is absent.

Stop the backend and verify a database backup plus recovery procedure. From the **server** folder, keep the existing `.env` database name and preview first:

```powershell
node src/scripts/upgradeLotTransferIndex.js
```

Preview does not change records or indexes. If it reports zero conflicting active contracts, apply only after verifying your backup:

```powershell
node src/scripts/upgradeLotTransferIndex.js --apply --backup-reference="YOUR_VERIFIED_BACKUP_REFERENCE"
```

The apply path adds missing lifecycle fields, creates `active_property_contract` (partial unique index on ACTIVE contracts), then removes only the old single-field global property uniqueness index. It does not remove contracts, receipts, commissions or audit history. If interrupted, rerun the preview and inspect before retrying; creation precedes removal of the old protection. Restart the backend afterward. This is device/database-specific, not something Git pull applies to MongoDB.

MongoDB must support transactions (replica set or mongos). Unsupported installations receive a clear error without posting a transfer. No database reconfiguration or live index upgrade was performed during development.

## Validation

- Backend suite: 232 discovered, 219 passed, 13 environment-gated skips, zero failures.
- Transfer HTTP integration: standalone support rejection; replica-set atomic approval, unchanged source payments/payouts, retained earned commissions, noncash credit, separate-project inventory, idempotent retries, fresh preview enforcement, index-upgrade gating, concurrent destination claims with loser rollback, history, collection/inventory totals, original-lot resale with historical source retained and Excel contents.
- Index upgrade integration: preview makes no changes; explicit apply on disposable legacy databases preserves payments/payouts and replaces only the intended index. Passed on standalone and replica-set test databases.
- Unit cases: partial/advance credit, multi-agent actual earnings, new terms, down payment/fees/interest, rounding, month-end transitions, overcredit/adjustment/penalty safeguards, and suppression of closed-account dues/forfeiture.
- UI check: administrator-only entry, staff read-only history, preview before confirmation/post, body-level dialogs, successful refresh and matching printable figures/receipts.
- Existing payment workflow, historical migration and owner-turnover HTTP regression passed. Frontend production build passed with the existing bundle-size advisory. All database tests used disposable databases; no office data was accessed.

Implementation: `LotTransfer` model/service/controller/component, lifecycle middleware/index upgrade, authoritative ledger credit/closure support, inventory/monitoring/payment/migration/commission guards, schedule and transfer exports, and tests. No new package dependencies.
