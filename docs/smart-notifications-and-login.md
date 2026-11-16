# Smart notifications and login refinement

## Notification behavior

The existing feed, read endpoints and SSE connection are reused. Payment due/overdue alerts are grouped by client and issue; commission updates are grouped by agent and issue; related site reminders are grouped per request. Approvals, contract lifecycle changes and critical risk alerts remain independent. Original notification and audit documents are not rewritten or deleted.

Cards show a client/agent title, brief summary, timestamp, attention indicator and expandable source events with record links. Installment principal and outstanding penalty totals come from existing monitoring snapshots, deduplicated per account/period; future installments outside represented due alerts are excluded. Resolved notifications display historical wording instead of current financial totals. No financial calculations or balances are written.

Unread counts represent visible groups. Reading a group persists individual read markers through the existing read model. New source events make the same group unread again. Authorization filters run before grouping and read matching. Search includes all breakdown messages. Site Visit links now follow their actual request destination. Existing SSE cadence remains unchanged; no extra timer or library was introduced. The server projects only the snapshot fields used for summaries.

## Login

The existing login route, AuthContext, JWT, bcrypt hashes, role permissions, redirects and session handling remain in place. The redesigned card uses CSS and a small inline eye icon. Show/Hide preserves the entered password. Explicit labels, browser autofill, keyboard submission, focus indicators and synchronous duplicate-submit protection are provided. Credential inputs are temporarily disabled during submission. Credentials are not logged or added to URLs.

Authentication rejects non-string credential payloads before database queries. Unknown users, wrong passwords and inactive users receive the same generic response; missing-user checks perform a dummy bcrypt comparison. Successful sign-ins retain login audit and last-login updates. Error messages in the form do not echo server details or credentials.

## Validation

Automated tests cover group identity/read state, member authorization, new events, multiple accounts/agents, totals, resolved history, future-period exclusion, credential validation, generic failures and successful JWT/audit behavior. Frontend production compilation passes with the existing large-chunk warning. No extra packages or large imagery were added.

Live browser acceptance (password toggle, keyboard navigation, responsive Light/Dark appearance and loading timings) remains unverified because Chromium cannot launch under this environment's socket restrictions. No real accounts, financial data or office service were modified. Nothing is committed, pushed or deployed.
