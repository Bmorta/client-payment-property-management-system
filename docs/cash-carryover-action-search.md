# Automatic cash carryover and action search

## Audit and implementation

The existing authoritative `cashPosition` ledger already derives daily opening from all earlier movements after one opening baseline. It includes empty calendar days, recalculates backdated changes, and checks historical negative days. The owner turnover review already posts one `OWNER_TURNOVER` only on actual RELEASE; DRAFT, SUBMIT and APPROVE do not deduct cash. Its release uses the shared cash transaction guard, version checks, unique request identity and atomic review/entry update. No replacement ledger or daily opening records were introduced.

Cash Management now returns today's summary separately from the selected report period. The overview displays today's opening, collections, cash added, other receipts/recoveries, expenses, payouts/other releases, turnovers, deposits, current cash and closing balance. Daily history remains available for the selected date range. Cash added includes bank cash withdrawals; actual refunds and standalone/commission payouts are included in other releases. Linked expense payouts remain expenses exactly once. Noncash money is excluded by the existing funding classification.

The mounted dashboard refreshes quietly after successful financial mutations, review actions, notification changes and returning to the page. At Philippine midnight it updates today's balances and advances a range following today, while preserving a historical range. It retains visible data while fetching and never resets the cash balance. Reconciliation remains administrator-only.

## Search

The former search used substring matching against page titles and a small alias list. Questions and action phrases could fail even when the page existed.

`featureSearch.js` now includes all current permission-filtered workspace navigation entries automatically, plus explicit implemented action metadata. It uses normalized words, limited spelling variations, synonyms and deterministic ranking. Exact titles rank first, followed by alias/related matches. No network or AI service is used.

| Query | Destination |
| --- | --- |
| Where can I cash in? / add money | Cash Transactions, existing Add Cash form open (administrator) |
| I want to add a lot / new lot | Projects; choose the project then Manage Lots |
| Turnover collection | Existing turnover request/release workflow (administrator) |
| Pay commission | Unreleased commission register (administrator) |
| Add client | Existing client form open (administrator/staff) |
| Record payment | Existing cashier page (administrator/staff) |
| Refund client | Cancellation/refund workspace (administrator) |
| Assign agent | Existing commission configuration page (administrator) |
| Reopen property | Existing reopening review (administrator) |
| Schedule visit | Existing site request scheduling (administrator/staff) |

Suggestions include an action title, description and destination. Context-dependent actions require choosing the client, contract or project in the existing workflow. Search never submits a financial action or approval. Ctrl+K, arrows, Enter and Escape remain supported. Existing Bootstrap theme colors, wrapping and scrollable search dialog are reused.

## Validation

- Full suite: 521 passed, 29 skipped, zero failures.
- Production client build passed; existing bundle-size warning remains.
- Added six tests for partial/full/multiple turnovers, quiet weekend carryover, backdating, physical versus noncash sources, action queries, permissions and navigation-index coverage.
- Component harness verified Ctrl+K, keyboard selection, direct action navigation, existing Cash In form opening, daily figures, midnight rollover and financial-event refresh.
- Example: 22,912 opening less actual turnovers of 10,000 and 11,000 equals 1,912 closing. The following quiet days open and close at 1,912. No new opening record is created.
- Existing negative-balance and transaction safeguards remain unchanged. No live financial records were accessed or modified. Live MongoDB integration tests and real-device Light/Dark visual verification remain outstanding.

The user approved committing and pushing this update. No merge or deployment is included.

## Files in this update

- `server/src/controllers/cashOfficeController.js`
- `client/src/components/CashOfficeDashboard.jsx`
- `client/src/components/CashBalanceOverview.jsx` (new)
- `client/src/hooks/useCashRefresh.js` (new)
- `client/src/components/AddOfficeCash.jsx`
- `client/src/components/FeatureSearch.jsx`
- `client/src/utils/featureSearch.js` (new)
- `client/src/pages/ClientsPage.jsx`
- `client/src/styles.css`
- `server/test/cash-carryover-search.test.js` (new)
- `docs/cash-carryover-action-search.md` (new)
