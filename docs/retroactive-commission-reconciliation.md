# Retroactive commission reconciliation

## Diagnosis and limits

The inspected calculation engine already replayed payment allocations; no rule excluding payments simply because they predated assignment entry was found. A late assignment with a fresh calculation already recognized earlier eligible collections. The observed office account could not be diagnosed directly because its live database is not connected here.

Confirmed gaps were: the agreement preview displayed budget math rather than actual existing-payment earnings, commission lists/reports depended on stored snapshots with no explicit account reconciliation audit, no contractual effective date existed, and an agent added after a historical migration had no period-specific check for previously paid commissions. A stale snapshot can hide otherwise valid earnings; the new integration test reproduces and repairs that condition.

The fix makes the existing replay authoritative and reviewable when saving an agreement. It does not add a second earnings ledger, increment earnings for every transaction, or invent missing payouts.

## Agreement workflow

1. Configure or modify the existing property sale commission agreement.
2. Choose Original Contract Date or Selected Effective Date. Assignment entry time remains separate.
3. Review Existing Payment Commission Preview: actual completed buyer installments, qualifying commission periods, fixed monthly amount, DP/monthly earnings, recorded releases, unpaid amount, historical hold, releasable amount and any recovery.
4. Confirm the reviewed agreement, then confirm saving. The backend re-creates the preview from current allocations and validates its token and account version before writing.

The selected-date policy is explicitly **payments on or after that effective date**. Earlier principal portions are excluded; they are not shifted into later periods. If a partially paid period straddles the start, only eligible principal counts toward completing its commission basis. Payment dates, earned dates and actual payout dates remain distinct.

When buyer and commission terms differ, the existing principal-portion mapping remains in force. Three completed buyer installments do not necessarily fund three commission periods. The preview distinguishes these counts. Existing restrictions against redistributing history-bearing commission terms remain; this change does not silently remap paid or allocation-linked periods. Percentage/date amendments explicitly restate the selected agreement scope through the reviewed preview, retaining previous calculations and payouts in the audit history.

## Existing accounts

Administrators can open **Commissions → Reconcile Existing Commissions**. Each page audits 20 assigned accounts against current eligible allocations, including accounts already current. Rows show earned amount, historical hold and whether the saved snapshot needs refresh. Enter a reason and confirm **Refresh Commission Earnings** for a stale row. No payout is created.

No real office account IDs or names can be listed here without the live database. Accounts to review are those showing Refresh Required, historical verification holds, recovery balances, or the reported missing earlier earnings. Agreements not yet entered must first be configured with the correct original contract date and terms.

## Historical protections

Only activated historical payments participate; staged migration rows remain separate. Earned amounts are visible, but historically funded commission periods with unknown prior payout evidence are excluded from **Releasable** and voucher eligibility.

In a commission record, administrators can record a documented previously released historical payout using its original date, method and source reference. The original payout date must be within the approved migration cutoff. This is historical recording, not a new payment to the agent today. Existing version/idempotency/funding checks remain enforced.

Then explicitly verify either no commission was previously released, or all prior payouts are recorded, with the source ledger reference and reason. The finding is tied to the exact commission basis, effective date, historical allocation sources and historical payout evidence. Changes to those facts require renewed verification. Changing only assignment entry time does not affect entitlement.

New migrations with period-by-period commission reconciliation carry that evidence into activation atomically. Existing activated accounts without evidence require review; they are not silently assumed unpaid. Corrections preserve original transactions; excess releases remain recovery balances. A historical payout correction remains within the approved cutoff.

## Integrity and reporting

Each account has one versioned agreement and deterministic contract/agent/component/period keys. Reconciliation atomically replaces its derived snapshot under the account version check, not an append of new financial earnings. Backend validation rejects duplicate keys and the Mongoose snapshot validator rejects duplicate period records on validated writes. A MongoDB unique multikey index would not prevent duplicate elements within one document, so no misleading index or destructive deduplication is added.

The ledger and commission exports show historical holds and releasable totals separately from earned/unreleased amounts. The payment register retains the original payment/period attribution and includes hold/releasable/effective-date fields in its Agent Commission Ledger sheet. Existing payout and recovery history is retained. Verification holds and newly releasable commissions notify administrators without duplicate alerts on unchanged reconciliation.

## Validation

- Backend suite: 170 passed; four URI-dependent integration tests skipped by the default runner.
- The four database workflows run separately against disposable MongoDB: retroactive commissions, existing payments/permissions, company/reporting/vouchers, and replica-set historical migration.
- Retroactive tests cover DP + three completed installments before assignment (PHP 1,800 monthly plus DP), partial/advance completion, multiple agents, selected dates, repeat reconciliation, reversal recovery, original completion dates, historical verification holds, preserved prior payout dates and amounts, export totals, and notification idempotency.
- HTTP tests cover preview tokens/confirmation, stale snapshot repair, roles, historical prior payout recording and retry, blocked unverified payouts/vouchers, and release eligibility after verification.
- UI DOM checks cover start-date choice, actual earnings preview before confirmation, submitted preview token and explicit historical evidence verification.
- Production client build checked; existing bundle-size advisory remains.
- No production database was accessed. Publication to `feature/property-inventory` is approved; this batch does not merge into `main` or deploy the application.

## Modified files

Frontend:
- `client/src/components/CommissionAgreement.jsx`
- `client/src/components/CommissionLedger.jsx`
- `client/src/components/CommissionRecord.jsx`
- `client/src/components/CommissionVouchers.jsx`
- `client/src/components/CommissionReconciliation.jsx` (new)
- `client/src/components/HistoricalCommissionReview.jsx` (new)

Backend:
- `server/src/controllers/commissionController.js`
- `server/src/controllers/commissionReportController.js`
- `server/src/controllers/commissionVoucherController.js`
- `server/src/controllers/migrationController.js`
- `server/src/models/PropertyAssignment.js`
- `server/src/routes/commissionRoutes.js`
- `server/src/utils/commissionLedger.js`
- `server/src/utils/commissionReconciliation.js` (new)
- `server/src/utils/paymentRegister.js`

Tests:
- `server/test/retroactive-commission.test.js` (new)
- `server/integration/retroactive-commission.test.js` (new)
- `server/integration/payment-flow.test.js`
- `server/integration/historical-migration.test.js`

No dependency changes or database reset is required. Use the existing server/client development commands and MongoDB configuration. Existing accounts refresh through the administrator reconciliation workflow or the existing scheduled monitoring process; actual payouts remain separate authorized actions.
