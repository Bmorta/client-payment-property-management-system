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
