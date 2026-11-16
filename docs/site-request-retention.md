# Request disregard and deletion

## Office workflow

Open Client Requests & Site Visits, then Open Request.

- **Disregard Request**: administrators and staff enter a short reason and confirm. The request moves out of Active Requests, cannot be scheduled or edited, stops visit/follow-up reminders and booking conflicts, and remains in Disregarded and Request History.
- **Reopen Request**: administrators only, with a reason and confirmation. Returns a disregarded request to For Scheduling. Old schedules and follow-ups stay in history; a new booking is required. Property requests require the exact linked contract to remain active.
- **Delete Request**: administrators only, with reason and confirmation. Disabled if the exact contract or the same client's same property has an active/pending contract, or the historical relationship cannot be verified. Use Disregard instead. Other active contracts for different properties do not block this request.
- Eligible deletion is **soft deletion / archival**. Requests inherently have audit-retention requirements. Completed visit reports, schedules, attachments (including signed evidence), approval or financial references in history, and the complete activity trail remain retained. No clients, contracts, properties, payments, commissions, or attachments are physically removed. Deleted requests are read-only and visible in Deleted / Archived and History.

Each action records authenticated user ID, username, role, timestamp, reason and original status. Existing transaction/guard/version and idempotency mechanisms prevent partial changes, concurrent conflicting updates and duplicate action histories. Eligibility is rechecked inside the transaction, not trusted from the UI. No new financial operations or approval bypasses are introduced.

Lists, calendar, exports and dashboard use the same retention filtering. Default active views exclude completed, cancelled, rejected, disregarded and deleted requests; all remain available through status/history views. Dashboard totals retain completed counts while excluding disregarded/deleted requests. Request changes refresh the initiating page and dashboard; other screens retain existing polling. Deleted requests no longer generate notification entries; disregarded requests preserve activity notification/history but generate no scheduling reminders.

## Admin Review Center

Preserves the previously implemented single sidebar entry, red nonzero/gray zero pending badges, requester identity and historical role, actual submission dates, requester filtering, compact review table and legacy fallbacks. Details distinguish review decisions as Approved By or Rejected By according to actual status; no unrecorded actor is inferred.

## Validation

- Full server suite: 491 passed, 29 skipped, no failures.
- Focused retention/workflow tests: 37 passed, including active-contract deletion blocking, cancelled/forfeited contracts, missing legacy relationships, unlinked prospect requests, multiple properties, preserved reports/documents, reason requirements, administrator reopening, duplicate retries and stopped reminders.
- Client production build passed (existing bundle-size advisory remains).
- DOM checks passed for request view filters, disregard control, administrator-only deletion, disabled active-contract deletion with explanation, and existing review/sidebar/search behavior in Light and Dark themes.
- No live database changes or production record cleanup performed. Live replica-set and visual browser/resolution tests remain to be performed; mocked transaction tests are not a substitute for those checks.
