# Architecture

- client/ = React + Vite frontend
- server/ = Express REST API
- imports/ = Excel import templates
- docs/ = project documentation

Backend flow:
Routes -> Controllers -> Services -> Models

Authentication, authorization, validation and error handling are cross-cutting backend concerns.

Business invariants:
- Client is a master person/entity record.
- PropertyAssignment links a client to Project + Phase + Block + Lot.
- One client can own many property assignments.
- An active Project + Phase + Block + Lot combination can belong to only one active account.
- Contract belongs to a property assignment.
- PaymentSchedule belongs to a contract.
- PaymentTransaction identifies project, client, property assignment, contract and schedule.
- Financial balances are derived from actual payment transactions.
- Backend relationship validation is mandatory.

## Client accounts and finance implementation

`PropertyAssignment` is the account record, unique per physical Property. Its
contract and schedule are embedded subdocuments; its payment transactions form
an append-only embedded ledger. This makes the balance check, submission-ID
check, and ledger append one atomic MongoDB update on the office's standalone
server, without requiring replica-set transactions. Contract prices are
snapshots of the lot area/rate at assignment; later inventory edits do not
rewrite an agreement. Amounts in financial accounts and expenses are integer
centavos. Installment schedules distribute rounding remainders exactly.

Assignment first claims `Property.client` and marks the lot RESERVED, then
creates the account. Unique account indexes are initialized before claims.
An uncertain database error leaves the claim protected: check the client’s
accounts, then retry the same client if absent. The picker includes a same-client
reserved claim without an account for this recovery. Existing assignment and
client links both block lot deletion. No existing data is migrated or seeded.

Payment POST retries carry the same `requestId`; duplicate submissions return
the original payment. Expenses have a unique submission ID. Posting records
money already received; it does not transfer funds. There are no payment or
expense delete/edit endpoints. Reversals, ownership transfers, and assumption
agreements need separate audited workflows before being enabled. An account
retains its property identity, so moving/renumbering a lot does not break links.

Reports use inclusive Philippine calendar dates, Monday–Sunday weeks, actual
payment/expense dates, and account balances as of the earlier of report end
and today. Project-filtered reports exclude office/other expenses without a
project. Net cash movement means collections minus expenses, not profit.
CSV exports include payment/expense detail and escape spreadsheet formulas.

Delinquency uses unpaid scheduled installments: 2 overdue installments show a
warning; 3 show FORFEITURE REVIEW. This does not automatically cancel a contract
or release a lot. Penalty review appears after 10 days overdue; automatic
percentage charges and admin overrides are pending the exact rate and basis.

## Audit and agreement update

Admin Users has a read-only User Activity Logs tab. Requests are journaled to
ActivityLog with authenticated username/role snapshots, previous values, and
server UTC timestamps before business writes start. Failure to persist the
intent blocks the write. Completion stores sanitized updated values/outcome.
A crash can leave PENDING; it must be reviewed, and is never shown as a confirmed
success. FAILED is a failed request, not a guarantee that a multi-document
operation rolled back. Bulk generation also snapshots requested blocks after
failure so partial inserts remain inspectable. There is no audit edit/delete API.
Passwords, hashes, tokens and other secret keys are recursively removed.

Payment appends and agreement replacements also embed audit details in the
same atomic PropertyAssignment write. Each agreement replacement appends its
previous contract/schedule and requires ADMIN authorization, explicit schedule
replacement confirmation and an optimistic version check. Payment appends
increment the same version so concurrent agreement changes must be reviewed.
The immutable payment ledger is not rewritten by rescheduling. Historical
reports select the agreement version active at the report cutoff.

Client and server share shared/paymentSchedule.js. Existing predefined terms
remain; custom whole-month terms are allowed from 1 to 1,200 months. The upper
bound is a technical schedule-size limit, not a new financing policy. Existing
centavo rounding/date conventions are preserved. Preview creates no payments
and applies no interest/penalties. Inventory prices remain read-only in the
agreement editor; changing the selected lot or agreed selling price requires
a separate authorized workflow. The shared module is explicitly allowed by
the Vite development server so it also works when running from client/.

## Payment controls working checkpoint — 2026-11-05

- New client IDs are server-generated (`CL-000001`); old IDs are never renumbered. New payment IDs (`PAY`) and internal receipt numbers (`RCT`) are independent. Existing references remain visible/exportable. Internal receipts are application identifiers, not a regulated invoice/receipt series.
- Before allocating, numeric historical CL/CLT, PAY and RCT/RCP IDs raise (never lower) atomic counters. Numbers can have gaps after retries or failed requests; gaps are not reused.
- Client search is paginated in MongoDB (20/page). Search results include client/project/lot identity, without account ledgers. The Payment page retrieves accounts for the selected client only, or a specific account from a deep link.
- Payment allocations support AUTO (oldest outstanding balance), DOWN_PAYMENT and INSTALLMENT. Paid-month progress counts fully covered, positive installment rows; down payment is excluded. Partial/advance amounts are allocated in payment date/creation order.
- Staff submit pending corrections. Original payment fields remain unchanged. Admin direct edits require confirmation; approved edits append immutable-history revisions. Voids retain the original transaction, with zero effective collection. All account financial updates use optimistic document versions. Stale source values or invalid current allocations prevent approval. Replayed submission IDs do not create duplicate corrections.
- Correction requests, revisions, audit events and notification outboxes are saved atomically in the same account document. This supports standalone MongoDB without multi-document transactions. Main audit logging remains the existing durable write-ahead journal.
- Notifications use authenticated fetch/SSE with a 3-second database check, reconnect, persisted per-user reads, and admin-role/staff recipient checks. Expired tokens, inactive users and changed roles terminate streams. The bell shows the latest 100 events; unread count covers all retained events. Notification reads increment account version to prevent concurrent full-array updates from losing read state.
- Phase/block/lot cancel actions discard local drafts only. Dirty cancellation requires Keep Editing or Discard Changes; the selected phase/block is retained.
- No office data migration runs at startup. `cd server` then `node src/scripts/reconcileClientIds.js` is a read-only missing-ID inventory. `--apply` is an explicit, separately invoked maintenance operation with an audit journal; it fills missing/null/empty IDs only. Do not run it merely to start the app.
- Penalty amounts remain unconfigured. No automatic penalty or forfeiture mutation was added. The percentage and calculation basis still require a decision.

Validation: `npm test --prefix server` covers prior behavior and new numbering/ledger/correction/search/notification cases. The optional `server/integration/payment-flow.test.js` requires `CPM_TEST_MONGO_URI`; it creates and drops only a randomly named `cpm_test_*` database. It does not use the configured office database name. UI interaction checks use DOM rendering and mocked APIs; a final Windows office acceptance test is still needed.

To run this working source, keep the existing `server/.env` and MongoDB service. From the repository root, run `npm run dev --prefix server` in one terminal and `npm run dev --prefix client` in another. Install each folder's dependencies first if absent. Open the Vite address (normally http://localhost:5173). Do not reseed/reset the database. Uncommitted working files cannot be obtained by `git pull` until an explicitly authorized push.

## Contract-based monitoring implementation

The subsequent [contract monitoring update](contract-monitoring.md) implements explicit per-property penalty terms, persistent allocation versions, monthly penalty history, reminders and administrator forfeiture reviews. It supersedes the earlier checkpoint's "penalties pending" statement for explicitly configured contracts. Unconfigured contracts still receive no automatic penalty rate.

## Agent and commission ledger

See [Agent/Commission implementation and verification](agent-commissions.md). Commission eligibility now follows effective buyer principal allocations, with separate immutable payout history and recovery balances. The account recalculation hook persists commission changes atomically with financial updates. Agent/Commission modules and PDF/Excel reports were added without altering client/property/payment identities.
