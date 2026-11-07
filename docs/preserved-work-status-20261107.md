# Preserved work status — November 7, 2026

Feature development is stopped. This checkpoint adds no application features and does not commit, push, merge, reset, seed or migrate the office database.

## Git state verified

- Branch: `feature/property-inventory`.
- Local HEAD and the GitHub branch both point to `21c18726453ef29f707ca7add399760e567f554b` (Integrate system-wide field guidance and dashboard charts).
- Earlier published commits include `07be1c6` (payment/commission Excel register) and `adf2cf7` (contract help and required indicators).
- The newer office-workflow and collection/cash updates are uncommitted/unpublished. Before this status document, there were 49 modified tracked files and 28 untracked source/document/test files. This document adds one untracked documentation file.
- No current pending code was committed or pushed. `main` was not merged or changed by this preservation check.

## Implemented in the unpublished working copy

1. Manual receipt entry, leading-zero preservation, scoped duplicate claims, concurrency/retry protection, and approved receipt corrections with history; Payment IDs remain generated.
2. Generated immutable Project IDs and reconciled counters for existing internal-ID types; a dry-run/apply script for missing top-level IDs.
3. Visible client search, suggestions and a two-column payment workspace with live allocation previews.
4. Payment-module transaction priority override with a reason; explicit ADMIN agreement policy editing and existing administrator penalty waivers.
5. Dedicated client Properties / Accounts route and return link, preserved account context, search suggestions, selective help icons, required markers, commission sequence ordering, and safe dialog/navigation behavior.
6. Expenses with actual payment methods/funding, print, summaries, Excel and PDF reports.
7. Searchable multi-select payment-method filter with date/client/project/status/search/sort combinations, server-side filtering and pagination, full-result posted totals and filtered exports/print.
8. Collection & Cash Summary with date presets/custom dates, selected-method summaries, method breakdown, independently paginated details and four charts.
9. Complete-office physical cash calculation from an authorized opening count, cash movements, collections, expenses, payouts and recoveries. Transfers are separate from revenue/expenses; linked payouts avoid duplicate cash deductions.
10. ADMIN cash entry/void and expense-classification tools with audit history and version checks; explicit Cash/Noncash classification for Other.
11. Snapshot-protected print/Excel/PDF exports that require refresh if underlying records changed.

## Unfinished / limits

- Office-computer browser/mobile review, real-record acceptance, A4 print-preview and Excel/PDF appearance checks remain pending. Automated build/calculation checks do not replace these.
- One-off transaction penalty-basis and penalty-status overrides are not implemented. Only priority is transaction-specific. Basis/status use explicitly confirmed ADMIN agreement changes; existing charges use the administrator waiver workflow.
- The office must supply its actual authorized opening cash count and classify relevant legacy expenses/Other funding records. Until then Cash on Hand deliberately displays Unavailable. No financial values were invented.
- No production missing-ID backfill was run. The script covers missing top-level IDs and checks conflicts; it does not rewrite embedded financial references.
- Receipt scope is one configured issuing office/series (`RECEIPT_SCOPE`, default OFFICE); there is no new multi-office series-management screen. The physical cash ledger has one active office opening baseline.
- Publication of all pending work is still awaiting explicit approval. A Git pull alone cannot retrieve these unpublished changes.

## Verification on this checkpoint

- Fresh `npm test --prefix server`: 125 tests; 124 passed, 1 optional MongoDB integration skipped, 0 failed.
- Fresh `npm run build --prefix client`: passed.
- `git diff --check`: passed.
- The isolated MongoDB/HTTP integration scenario and UI DOM checks passed in the earlier development turn. They were not rerun during this preservation check; their temporary runner dependencies were pruned. The integration test source remains in the repository.
- No real office database was accessed by this preservation check.

## Run instructions

These commands require the working copy containing the pending files. Your existing Windows clone will receive them only after an approved GitHub push and pull. Do not extract the checkpoint over an existing office installation; it is a recovery backup without credentials or database records.

With MongoDB running and your existing `server/.env` retained, run from the repository root:

```text
npm install --prefix server
npm install --prefix client
```

Terminal 1:

```text
npm run dev --prefix server
```

Terminal 2:

```text
npm run dev --prefix client
```

Open the Local URL printed by Vite (normally http://localhost:5173). Server normally uses port 5000. Do not run seed/reset/backfill commands to start the application.

After a future approved push, synchronize using:

```text
git switch feature/property-inventory
git pull --ff-only origin feature/property-inventory
```

Existing feature details and modified-file summaries are in `docs/office-workflow-update.md` and `docs/collection-cash-summary.md`.


## Resumed verification and export finishing — November 7, 2026

Development resumed at the user's request without restarting or expanding the application.

- Completed fresh isolated MongoDB HTTP integration verification (1 passed, 0 failed). The runner used a disposable database, not office records.
- Completed fresh DOM checks for collection/cash filters, four charts, pagination, cash availability, print-all scope and staff permissions; office workflow checks for receipts, payment confirmation, keyboard dialogs and account routing; commission checks for project/status filters, payout dates and staff restrictions.
- Backend regression suite: 124 passed, 1 optional integration skipped in the default command; the optional integration was run separately and passed. Client production build passed.
- Finished Collection & Cash Summary PDF table layout with wrapped cells and repeated column headings across pages. Rendered sample pages were visually checked; extraction confirmed all 32 sample payment IDs exactly once. These were synthetic test records only.
- Finished Excel summary landscape print settings, frozen metadata and wrapped detail rows. Round-trip tests verify print settings, wrapping and unchanged financial totals.
- Modified during this resumed work: `server/src/controllers/collectionReportController.js`, `server/test/collection-cash.test.js`, this status document and `docs/collection-cash-summary.md`.
- A real Chromium desktop/mobile review could not run because the browser download returned an incomplete archive. DOM verification passed; actual office-browser and print acceptance remain pending.
- The opening cash count, classification of legacy records and any office ID backfill remain office-data operations and were not performed.
- Contract penalty basis/status changes remain explicit ADMIN agreement amendments in Payments; existing assessed charges use explicit waivers. Only allocation priority supports a transaction-specific override. No temporary penalty basis/status behavior was invented.
- No commit, push or merge was performed. The published base remains `21c1872`. Existing run commands above are unchanged.


## Publication authorization — November 7, 2026

The user subsequently authorized committing and pushing the existing pending changes to `feature/property-inventory`. Earlier unpublished-state statements above describe the historical checkpoints. The publication summary and verified commit are supplied after the push. `main` is not part of this publication.
