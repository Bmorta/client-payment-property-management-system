# Notification generation and grouping repair

## Root causes

Request events were emitted with a fresh event-based ID for every activity. Only dynamic visit reminders were grouped, so registration, booking and progress events still appeared as separate cards. Payment grouping excluded penalty-assessment notifications and separated resolved and active copies of the same issue.

## Changes

- Site requests now update one delivery slot per request/recipient inside the existing transaction and version guard. A slot receives a revision for each approved action. Repeat action identities still return the prior result without another event or delivery. Existing legacy notifications remain stored; immutable request history remains the activity source of truth.
- All authorized events/reminders for a request resolve to one stable request card with its current status, contact name, human-readable summary and full activity timeline. The request's current update time is used. Raw IDs and action reasons do not appear in its summary.
- Penalty assessments, grace expiration and overdue installments share the client overdue issue. Resolved copies stay in the breakdown of that issue instead of producing a second card. Distinct clients, requests, agents, approval cases and critical financial/contract-risk alerts remain distinct.
- Query output deduplicates identical delivery identities; stored source and audit records are not deleted or rewritten. Principal and penalties continue to be counted once per period/account using existing snapshots.
- Read markers include the delivery revision. The client sends the member revisions it displayed, so reading an older view cannot swallow a newer request update. Group unread counts are derived after role filtering and grouping.
- Repeated scheduled account monitoring was already idempotent when no financial inputs changed; that behavior is retained and covered by the monitoring regression tests. No new background job, migration, unique index or financial write path was introduced.

## Verification

427 automated tests pass; 29 optional integration tests are skipped. Tests cover request slot stability/retries, preserved history, legacy event consolidation, distinct requests, multiple accounts and agents, payment/penalty totals, scoped group reads, and concurrent delivery/read revisions. Production frontend build and whitespace checks pass. Live office database and browser acceptance remain unverified; no production records or service were changed.

No commit, push, merge or deployment was performed.
