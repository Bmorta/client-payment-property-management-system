# Cash ledger reconciliation and payout validation

## Finding

The dashboard previously validated only the displayed period. An earlier negative daily closing could be carried into the period opening and hidden by later receipts. The current-balance report also skipped negative-day checks when daily rows were disabled. Payout validation inspected the complete timeline instead, so the screens could disagree.

A disposable example reproduced this: opening zero, an earlier cash outflow of 100, followed by a receipt of 23,012. Today's arithmetic balance was 22,912, but an earlier day was negative. This demonstrates the code defect; it does not identify the user's actual offending transaction. Production records were not accessed or changed.

## Authoritative calculation

All cash views now inspect daily closing balances from the posted office opening baseline through the requested end date, even when displaying only today's period or omitting daily rows. Same-day entries are aggregated rather than validated in arbitrary reference order. A backdated payout is tested on its release date and through today.

Available cash equals opening plus physical cash inflows less physical cash outflows. Unverified arithmetic is labelled separately from verified cash. A zero dashboard/ledger difference does not prove that every historical day was valid.

| Source | Physical cash treatment |
| --- | --- |
| Collections | Eligible live cash payments on their payment date |
| Cash additions | Posted office cash entries on their effective date |
| Expenses | Posted cash-funded expenses on their expense date |
| Supplier/landowner expense payouts | Their linked expense, without an additional cash-ledger deduction |
| Liability payouts | Their posted cash-ledger release entry |
| Commissions | Actual cash releases; linked expenses are counted once |
| Commission recoveries | Actual cash recovery receipts |
| Refunds | Actual posted cash-funded releases |
| Turnovers | Actual posted cash movement, rather than pending request or approval |
| Bank deposits / withdrawals | Cash outflow / inflow respectively |
| Historical migration | Existing cutoff rules; historical records excluded from the live ledger require the verified opening baseline |
| Non-cash, pending, voided transactions | Excluded from physical cash movements |

Duplicate business release references, unknown funding, invalid opening baselines, and unsupported movement kinds are reported rather than silently balanced.

## Administrator workflow

Open Cash Management & Turnovers, then **Cash Ledger Reconciliation**. Select the release date and optional proposed payout. Review the baseline, inflows, outflows, calculated closing, dashboard balance, ledger balance, difference, and dated source entries. Negative days expand to show their references. Payout errors provide a direct reconciliation link.

For an incorrect standalone cash entry, inspect the original evidence and use its correction preview. Supply the actual amount/date and an evidence reason, review before/after values, and confirm as administrator. Opening corrections are accessible from the baseline. Linked business payouts must use their original workflow. No balancing transaction is created automatically.

Corrections preserve original values, administrator identity and reason in history. A fresh preview token, version check, submission identity and shared MongoDB transaction prevent stale, duplicate or partial changes. The proposed correction must leave the entire ledger valid; multiple independent discrepancies may require additional coordinated correction work rather than accepting a partially reconciled ledger.

Cash expense creation, cash-related expense corrections, manual cash entries and voids, classifications, and commission releases/corrections now use the shared cash write guard and transaction validation. Voucher finalization participates in the commission release transaction. Existing entitlement formulas and historical earnings are preserved.

## Validation

- 515 tests passed; 29 skipped; zero failures.
- Production client build passed (existing chunk-size warning remains).
- Component checks passed for dated negative entries, source links, blocked/unverified balances, payout preview and administrator correction controls.
- Tests cover 22,912 minus 21,000 yielding 1,912, equal/insufficient funds, backdating, recovered historical negatives, same-day ordering, physical source classification, duplicate release references, account isolation, correction idempotency, stale previews and rollback.
- Transaction rollback tests use a mocked disposable harness. No live MongoDB integration database was available; skipped integration tests and real Windows/browser/device verification remain outstanding.

No production financial records were modified. Nothing was committed, pushed, merged or deployed for this change.
