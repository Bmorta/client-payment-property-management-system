# Current overdue penalty correction

## Result and root cause

The previous engine assessed each unpaid installment again on every monthly anniversary, and summed the resulting charges. That implemented the earlier recurring rule, but does not match the revised current-overdue rule. The corrected rule computes one contribution for each installment that is currently unpaid after grace. Historical monthly totals are nonfinancial snapshots, never additional obligations.

| As-of month | Currently overdue installments | Current gross penalty |
| --- | ---: | ---: |
| June | 1 | ₱156.25 |
| July | 2 | ₱312.50 |
| August | 3 | ₱468.75 |
| September | 4 | ₱625.00 |

These figures use ₱5,208.34 and 3%, rounded per installment to integer centavos. August is ₱468.75; the monthly totals are not summed.

## Financial behavior

- Actual effective payment dates drive allocation, grace, and advance protection. Encoding dates do not create overdue charges.
- Configured FULL_INSTALLMENT or UNPAID_BALANCE basis controls partial installments. No missing basis is invented.
- Stable `CP:I<installment>` identities prevent repeat assessments. Reopening the form or reading reports does not write charges.
- Current gross less payments and waivers applied to those same installments produces a nonnegative remaining penalty.
- When an installment's principal is fully settled, it no longer contributes to the **current** penalty. Earlier penalty payments and waivers remain recorded, with historical portions shown separately. They are not refunded, erased, or deducted against another installment.
- Corrections/voids replay the effective principal and penalty allocations. Transactions that cannot be mapped safely require administrator review.
- Historical monthly snapshots and retired recurring assessments remain available in snapshot/audit/rule history. They are not added into current financial totals.
- Clients, Payments, consolidated accounts, penalty monitoring, print views and Excel use the same ledger. Excel includes a Current Penalty Calculation worksheet with formulas and separately identified applied versus recorded amounts.

## Existing accounts: preview and approval required

New API-created contracts explicitly use `CURRENT_OVERDUE`. Existing accounts without this marker remain `LEGACY_RECURRING` until reviewed. Reading an old account does **not** silently rewrite its financial history. Until approved, it displays a legacy-rule warning and its existing calculation; it has not yet been converted.

Log in as ADMIN, open Client Accounts, select the client and the property's Penalty History/breakdown, then:

1. Choose **Recalculate Penalties — Preview**.
2. Select this property, the client, or All Accounts.
3. Review before/after totals, retired recurring assessment count, formulas, and affected payment allocations.
4. Resolve flagged excess payments, excess/unknown waivers, and ambiguous older mixed AUTO receipts through the existing correction/approval workflow. No automatic credit or refund is created.
5. Click **Approve Current Overdue Rule** only after reviewing the preview.

Changes require a fresh preview and administrator confirmation. A verified server restore point is saved before approval. Rule conversions require MongoDB replica-set/sharded transaction support; standalone MongoDB can preview but cannot apply those financial conversions. A failed backup, concurrent account change, unresolved reconciliation issue, or missing confirmation blocks the change. A repeated submission does not apply twice. Raw payments, receipts, waivers, original historical assessments and payout records are preserved; retired computed assessments and before/after totals are saved in the rule history and audit trail.

No live office database was accessed or recalculated in this workspace. Use the administrator preview to identify actual office accounts requiring conversion; their IDs and financial issues are shown there.

## Run locally

Use the existing environment settings and database; do not replace or reseed them.

In a terminal at the repository root:

```powershell
cd server
npm ci
npm run dev
```

In a second terminal at the repository root:

```powershell
cd client
npm ci
npm run dev
```

Open the local URL Vite prints. Backend unit tests and production build:

```powershell
npm test --prefix server
npm run build --prefix client
```

For the focused HTTP integration test, point `CPM_CURRENT_RULE_TEST_URI` at a disposable test MongoDB instance and set `CPM_INTENT_TRANSACTIONS` to `true` for a replica set or `false` for standalone. The test creates and drops its own randomly named database; do not provide office production credentials.

```powershell
node --test server/integration/current-monthly-penalty.test.js
```

## Validation completed

- Backend suite: **214 discovered, 208 passed, 6 skipped, 0 failed**. The environment-gated integration tests are run separately below.
- New current-rule HTTP integration: **passed on standalone and single-node replica set**, including payment posting, idempotency, waivers, matching Clients/Payments/report/Excel totals, preview-only reads, ADMIN-only conversion, missing-confirmation refusal, verified restore point, preserved retired assessments, replay protection, standalone transaction refusal, and excessive waiver review.
- Existing multi-property payment integration: **passed on standalone and replica set**. Existing-book fixtures explicitly retain the legacy marker; new-account behavior is independently tested with CURRENT_OVERDUE. Whole-book conversion correctly refuses an over-collected legacy receipt instead of erasing or reallocating it.
- Existing payment-flow integration: **passed**, including client/property/payment, commissions, permissions, corrections, notices, and notifications. Newly created account penalty expectations updated to one contribution per overdue installment.
- Historical migration integration: **passed**; staging and approved transactional activation protections remain intact.
- Retroactive commission integration: **passed**; existing payment-linked earnings and payout safeguards remain intact.
- Company/reporting integration: **passed**, including branded reports, references, schedules, and Excel registers.
- UI render/print assertions: **passed** for the exact formula, current paid/waived amounts, historical amount explanation, legacy warning, and Client/Monitoring printed calculations.
- Existing UI interaction checks: **passed** for cross-page selections, waiver preview/approval, individual/group acknowledgments, migration workflow, and original payment dates.
- React production build: **passed**. Vite still reports the existing large-chunk advisory.

## Modified files

Compared with the previously published branch tree at commit `2bb4455c708639aa67669dd89b8f856e18f44dd4` (earlier working changes are preserved):

- `client/src/components/AccountMonitoringDetails.jsx`
- `client/src/components/ClientPenaltyOverview.jsx`
- `client/src/components/ClientPenaltyWorkspace.jsx`
- `client/src/components/ContractTerms.jsx`
- `client/src/components/CurrentPenaltyCalculation.jsx`
- `client/src/components/GroupedPenaltySelection.jsx`
- `client/src/components/PagedAccountPenalties.jsx`
- `client/src/components/PaymentAllocationDetails.jsx`
- `client/src/components/PenaltyMonitoring.jsx`
- `client/src/components/PenaltyRecalculation.jsx`
- `client/src/components/PropertyPaymentCheckout.jsx`
- `client/src/components/StatusBadge.jsx`
- `client/src/utils/printAccountReports.js`
- `server/integration/current-monthly-penalty.test.js`
- `server/integration/multi-property-payments.test.js`
- `server/integration/payment-flow.test.js`
- `server/src/controllers/accountReportingController.js`
- `server/src/controllers/clientPenaltyController.js`
- `server/src/controllers/financeController.js`
- `server/src/controllers/paymentIntentController.js`
- `server/src/controllers/penaltyOperationsController.js`
- `server/src/models/PropertyAssignment.js`
- `server/src/services/monitoringService.js`
- `server/src/utils/accountReporting.js`
- `server/src/utils/accounting.js`
- `server/src/utils/clientPenalties.js`
- `server/src/utils/contractMonitoring.js`
- `server/src/utils/paymentIntent.js`
- `server/src/utils/penaltyReconciliation.js`
- `server/src/utils/penaltyWorkbook.js`
- `server/test/current-monthly-penalty.test.js`
- `server/test/penalty-recalculation.test.js`
- `docs/current-overdue-penalty-correction.md` — this summary.

## GitHub status

The user authorized publication of this tested update to `feature/property-inventory`. No merge into `main` or deployment was requested. Applying the existing-account financial conversion remains a separate administrator-confirmed action in the application.
