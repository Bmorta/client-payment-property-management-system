# Admin Reviews & Approvals

## Implementation

The existing `/approval-requests` destination now provides a centralized administrator workspace. Staff retain their existing scoped payment-correction history. The sidebar review group is near the top, expanded by default, and shows pending counts even when collapsed. The notification dialog includes a pending-review entry point and direct review access for matching request alerts.

`GET /api/admin-reviews` is an administrator-only, read-only aggregation of existing source records. It adds no approval table, financial write endpoint, database index, migration or backup requirement. Pending rows are not truncated by source list limits. Queue keys deduplicate by workflow/source identity; property reopening identifies the controlling closed contract rather than every historical owner. Missing property/contract relationships remain visible for reconciliation.

The center offers category tabs, global pending counts, search, pending/history/all status views, pagination, and persistent view filters. Original versus proposed values and financial effects are shown in the existing workflow components or the assumption decision view, backed by the original APIs.

## Workflow coverage

| Workflow | Pending source / entry point | Review interface |
| --- | --- | --- |
| Payment corrections | Embedded correction requests | Existing correction approval form |
| Forfeiture | Current submitted forfeiture review | Existing staged forfeiture preview and confirmation |
| Preliminary cancellation | Existing cancellation hold | Existing rejection/withdrawal and cancellation preparation |
| Approved cancellation awaiting completion | Cancellation case | Existing finalization, credits/refunds and clearance preview; all affected client accounts are loaded |
| Property reopening | Inventory release status and controlling contract | Existing forfeited/cancelled property release forms |
| Assumptions | Assumption case | Existing decision API with explicit confirmation and financial comparison; source list can load an exact case by ID |
| Commission changes | Existing amendment/reconciliation review flags and voucher states | Existing reconfiguration or exact voucher form |
| Cash counts / turnovers | Office cash review records | Existing cash review actions, scoped to the exact reference |
| Supplier / landowner payouts | Office payout draft/submission records | Existing exact payout detail and approval workflow |
| Historical imports | Verification / activation / correction states | Existing exact import batch and verification workflow |
| Settlement | Recorded settled accounts awaiting first verification | Existing settlement verification and certificate safeguards |
| Penalties and lot transfers | Existing preview-and-confirm flows | Always-visible entry points; saved approved history is listed where available |

Penalty recalculation and lot transfer previews are not durable pending approval requests in the current system. They are not falsely counted as submitted requests. Request Changes/Return for Review is available only where the original workflow supports it. Separate verifier/approver rules, holds, snapshot/version checks and transaction boundaries remain in the original APIs.

## Quick review and navigation

New saved pending reviews created by the administrator can open a review dialog from the originating page. The dialog does not navigate away, keeps the page's state, locks body scrolling and restores focus when closed. Successful decisions trigger refresh of the queue and source records without caching financial payloads or replaying mutations. Existing Smart Back navigation remains available when choosing Open Original Workflow instead.

Local mutations refresh counts immediately. Existing notification events refresh other sessions where those events exist; a 30-second polling fallback handles workflows without notification events. Failed refreshes show a warning and retain the last visible data rather than claiming zero pending reviews. The review dialog code is loaded on demand.

## Validation

- Full regression suite: 440 passed, 29 optional integration tests skipped.
- New tests cover durable sources, authorization, history vs pending states, duplicate identities, orphan release visibility, controlling property ownership and preview-only categories.
- Existing assumption transactions, payment correction guards, forfeiture/cancellation restrictions, cash/payout permissions and import approval tests continue to pass.
- Production frontend build and whitespace checks pass; the existing bundle-size warning remains.
- Live browser/office acceptance remains unverified because Chromium cannot launch in this environment. No production data, service, financial calculation or authorization rule was changed.

Nothing has been committed, pushed, merged or deployed.
