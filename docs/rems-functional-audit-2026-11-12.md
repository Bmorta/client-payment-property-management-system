# REMS functional audit and test plan — 2026-11-12

## Scope and safety

This inventory was assembled from the current React routes/components, Express route guards/controllers/services, Mongoose schemas, shared financial utilities, and existing `server/test` and `server/integration` suites. A page or route alone is not treated as proof that the workflow works.

No office MongoDB connection or production record was used. `npm --prefix server test` ran against the repository's in-memory/unit/mocked cases. It reported **402 tests: 374 passed, 0 failed, 28 skipped**. The skipped cases require explicit disposable MongoDB URIs. The frontend production build passed. A real-browser end-to-end session, Windows installation, printing hardware, and the 28 MongoDB integration cases were not executed in this environment.

## Feature testing inventory

| Module | Implementation status from source review | Test evidence / procedure | Expected result / current result | Severity / follow-up |
|---|---|---|---|---|
| Login, session, roles | Implemented; route-level authorization is present | `session-recovery`, `administrator-safety`, route middleware tests; invalid/expired/unavailable DB cases | Unit suite passed; database-backed auth cases among skipped integration tests | Low; run skipped API tests on disposable MongoDB |
| Dashboard and monitoring | Implemented; actual account allocation and date projection used | `dashboard-charts`, `contract-monitoring`, `current-monthly-penalty`; inspect date filters, advance coverage, risk status | Unit tests passed; browser layout/visual behavior not exercised | Medium; manual screen-reader/responsive review pending |
| Projects, phases, blocks, lots | Implemented; project/phase/block/lot models and CRUD routes | `lot-inventory`, `property-summary-payment-voucher`, `inventory-export`; add/edit/filter/archive/delete and uniqueness checks | Unit tests passed; Mongo-backed inventory integration not run here | Medium; run on disposable DB |
| Property maps and annotations | Implemented; source map and overlays/version history are separate | `map-overlay`, `map-viewport`, `project-map-print`, `contract-print-map-update`; save/reopen, normalized coordinates, print options | Unit tests passed; actual browser drag/zoom and physical print not verified | Medium; browser/print preview check remains |
| Clients and accounts | Implemented; deletion is recoverable/restricted and accounts are separate | `client-deletion`, `identifiers`, `accountSettlement`; create/search/archive/delete/restore and financial-history protections | Unit tests passed; DB-backed client deletion test skipped if URI absent | Medium; run DB integration |
| Contracts, schedules, amendments | Implemented; schedule helpers and amendment ledger present | `schedule-methods-tcp`, `agreementSchedule` coverage, `transfer-schedule-integrity`, `financial-correction`; compare preview/saved/reopened values | Unit tests passed; production-record reconciliation intentionally not attempted | High; test migrated/legacy examples in isolated DB before office rollout |
| Payments and cashiering | Implemented; quotes use actual unpaid schedule balances and payment intents are idempotent | `cashiering-forfeiture-workflow`, `payment-controls`, `multi-property-payments`, `payment-flow`; months, partials, advance coverage, stale quotes, receipts, retry | Unit tests passed; 28 DB integrations not run as a group; UI has no automated browser-runner in package scripts | High; execute isolated API suite and manual cashier checklist |
| Penalties and waivers | Implemented; existing policy and allocation services remain authoritative | `current-monthly-penalty`, `penalty-recalculation`, `client-penalty-visibility`, payment integration | Unit tests passed; database recalculation integration skipped | High; verify a copied historical account and waiver trail |
| Lot transfers and cancellations | Implemented; services preview and atomically apply contract/inventory history | `lot-transfer`, `transfer-schedule-integrity`, `cancellation`, `consolidated-workflows`, `credit-lineage` | Unit tests passed; DB-backed transfer/cancellation cases skipped without URI | High; repeat source/destination scenario in isolated MongoDB |
| Forfeiture, reopening, reactivation | Implemented; review, explicit approval, holds, frozen ledger and separate property release | `forfeiture`, `cashiering-forfeiture-workflow`, `forfeiture.test.js`; threshold, advance, rejection, approval, reopen, replacement, concurrency | Unit tests passed; full HTTP/Mongo lifecycle test is opt-in and was not run here | High; perform the isolated lifecycle test before operational use |
| Agents, commissions, vouchers | Implemented; calculation, holds, lineage and release records are separate | `commissions`, `commission-lineage`, `commission-reconfiguration`, `commission-continuation-*`, `buyer-installment-commission`, voucher tests | Unit tests passed; database payout/release tests skipped | High; reconcile expected outputs per agent on disposable data |
| Expenses, cash, turnovers | Implemented; cash movements and revenue/expense reports are distinct | `collection-cash`, `cash-turnovers`, `office-payout-cash`, `cash-office-review`, `expense-corrections` | Unit tests passed; DB-backed release/correction cases skipped | High; test posted vs pending/voided and cash/noncash cases |
| Reports and exports | Implemented; report services and export endpoints exist | `list-report`, `payment-register`, `property-summary-payment-voucher`, `inventory-export`, `project-map-print` | Unit tests passed; office-specific print sizing and exported-workbook visual inspection pending | Medium; inspect sample PDF/XLSX in Office/LibreOffice |
| Historical migration | Implemented as staged workflow with preview/reconciliation | `historical-migration`, migration tests and templates route; malformed/duplicate row handling | Unit cases passed; transactional DB import suite skipped | High; run isolated import and compare source/target counts |
| Database readiness / backup / maintenance | Implemented with actual readiness checks and approved maintenance endpoints | `database-readiness`, `database-maintenance`, `backup-navigation`; standalone vs replica-set, backup and schema paths | Unit cases passed; real MongoDB server startup/recovery tests skipped | High; run only against disposable replica-set DB before upgrades |
| Notifications, activity, approval requests | Implemented; recipient scoping and audit controls present | `notification-isolation`, `audit-agreement`, `administrator-safety`, session/audit unit cases | Unit cases passed; delivery in a multi-device office session not tested | Medium; verify staff/admin accounts with isolated DB |
| Appearance and responsive layout | Implemented light/dark/system preferences and responsive CSS | `appearance` unit coverage plus frontend production build | Build passed; no screenshot/browser viewport run available | Medium; manual 320px/tablet/desktop, light/dark check pending |

## Isolated test data commands

`server/src/scripts/remsTestData.js` seeds 3 fictional projects, 6 phases, 18 blocks, 180 lots, 20 fictional clients, 5 agents, and 19 sample contracts, including no-payment, down-payment, monthly, advance, partial, overdue, threshold-review candidate, amendment/transfer review candidates, multiple-property, cash/noncash, and correction/waiver review candidates. All fixture identifiers are `TST-REMS-` prefixed. A final client is intentionally left without a property.

The script does not read `.env` or use `MONGODB_URI`. It refuses non-local hosts, requires `REMS_TEST_MODE=1`, and requires a DB name beginning `rems_test_`. Reset removes only records with the test prefixes; it never drops a database. The fixture supplies test navigation/state candidates; it does **not** fake an approved transfer, cancellation, forfeiture, commission payout, or financial correction. Exercise those workflows through their real preview/approval APIs. Two fictional clients have no property assignment; one client has two independent assignments.

PowerShell, from the repo root, after confirming a local disposable MongoDB instance is available:

```powershell
$env:REMS_TEST_MODE = '1'
$env:REMS_TEST_MONGODB_URI = 'mongodb://127.0.0.1:27017/rems_test_office'
npm.cmd --prefix server run testdata:seed
$env:VITE_REMS_TEST_MODE = 'true'
npm.cmd --prefix client run dev
```

The client displays a persistent **TEST MODE — isolated fictional data only** banner when that Vite variable is enabled. Run the backend separately with its `MONGODB_URI` explicitly pointed at the same `rems_test_office` database and use the printed test-only admin login. Do not set test mode against an office server. To remove only fixture records:

```powershell
npm.cmd --prefix server run testdata:reset
```

The seeded account fixtures use the current Mongoose schemas and schedule builder. Since feature-specific approvals must include server-generated preview tokens and actor/audit metadata, transfer, cancellation, forfeiture, commission payout, and correction outcomes should be created by the real UI/API workflows, not inserted as fabricated final records.

## Manual end-to-end checklist and expected values

Use the seeded records only in the isolated test database. Complete each flow through the normal UI/API so server-generated preview tokens, version checks, permissions and audit events are exercised.

| Scenario | Procedure | Expected result |
|---|---|---|
| Inventory | Search a `TST-REMS-PROJECT-*`; filter phase/block/status; edit an available lot | Unique project/phase/block/lot; active contracts remain protected; lot status and summary agree |
| Cashier month quote | Choose an unpaid schedule; type 1, 2, then 3 months | Quote equals the next unpaid scheduled balances. On a separate controlled ₱6,000 contract: ₱6,000, ₱12,000, ₱18,000. Paid periods are skipped; partial/final amounts use their actual remaining amount |
| Partial / advance | Compare the seeded partial and 3-month advance accounts before/after preview and post | Partial allocation remains partial; advance covers the applicable future periods; no duplicate installment allocation on retry |
| Penalties | Compare due date/grace against the selected payment date; test a partial payment and an advance-covered period | The contract's saved policy is used; the grace-period case has no penalty; paid/advance-covered months do not incur a new penalty |
| Transfer | Preview transfer from a candidate source to an available destination; approve once | Preview credits match the saved successor schedule; source history stays; destination status updates once; repeated request is idempotent |
| Forfeiture | Use threshold-three candidate; inspect ledger, start review, validate preview, approve as admin | Before threshold: blocked; at eligibility: review required; approval freezes obligations and keeps lot unavailable pending separate property review |
| Property release / reactivation | Review the forfeited property; separately approve reopen or preview original/replacement reactivation | Release makes property available only after approval; reactivation requires availability and preview; no history or payment records are deleted |
| Commission | Assign test agents on a test contract, then inspect earned/unreleased/released amounts and any transfer/forfeiture holds | Per-agent allocations remain within authorization; transferred credits are not new commission-generating payments; holds do not erase earnings |
| Cash and reports | Post a test cash addition, cash expense, pending turnover, then released turnover; run a scoped report | Only posted cash movements change physical cash; pending turnover does not reduce cash; collections remain distinct from owner additions |
| Migration | Download the official sample template; replace example values only in the disposable database; preview, correct, reconcile and activate | Duplicate/invalid rows are identified before staging; no live ledger changes until explicit activation; source receipts and history remain attributable |
| Permission checks | Repeat admin-only correction, commission, forfeiture and release actions as STAFF/VIEWER | Server denies restricted mutation; UI hiding alone is not relied on |
| Printing / theme / responsive | Open map print preview, payment acknowledgement, voucher and reports in light/dark at 320px, tablet and desktop sizes | Content remains legible and unclipped; native printer output still requires office-device verification |

### Audit findings / unresolved blockers

- The core source and test suite show broad coverage of financial calculations and mutation safeguards. I did not find evidence that every user-facing workflow has browser-level automation; frontend dependencies/scripts currently provide a production build but no configured Playwright/Cypress runner.
- 28 MongoDB-dependent integration cases are opt-in and were skipped because no isolated MongoDB URI was supplied. This leaves atomic cross-document behavior, API permissions against real MongoDB, and replica-set transactions unverified in this run.
- The generated fixture intentionally prepares realistic candidate accounts but does not manufacture approvals, transfer lineage, payout releases, or audit trails. Those must be created through real workflows after preview.
- Windows service setup, multi-device LAN connectivity, actual printer behavior, screenshots, and visual pixel comparisons remain unverified here.
- No sample importer workbook is suitable for production import; generated workbooks are clearly labeled fictional examples.

## Automated test results

| Check | Result |
|---|---|
| `npm --prefix server test` | 374 passed, 0 failed, 28 skipped (402 total) |
| `npm --prefix server run test:integration` | 1 skipped; requires `CPM_INTENT_TEST_URI` |
| `npm --prefix client run build` | Passed; Vite reports the existing large main-chunk advisory (>500 kB) |
| `node --check server/src/scripts/remsTestData.js` | Passed |
| Real MongoDB API integration | Blocked here; no disposable MongoDB URI supplied |
| Browser E2E / live office workflows | Not run |

Historical migration sample workbooks are generated from REMS's own template code, so their columns and instructions stay aligned with the current importer. Generate them with `npm --prefix server run testdata:migration-samples`; they are saved under `server/test/fixtures/migration-samples/` and explicitly marked **EXAMPLE ONLY** inside the workbook. The sample rows are fictional and must not be imported as real office records.

## Priority before office use

1. Run opted-in integration tests against a disposable local replica-set database, never the office database.
2. Use the generated fixtures to walk normal sale, partial/advance/penalty payment, transfer, forfeiture/reopening, commission and cash/report flows through the actual UI.
3. Compare ledger balances, receipts, contract schedules, commission ledger, inventory status, and exports at each step.
4. Verify print preview, light/dark mode, narrow/tablet layouts, and another office device using the Windows-installed service.
5. Record any failing scenario with the fixture contract ID, exact steps, expected amount/status, actual result, and screenshot before any production correction.
