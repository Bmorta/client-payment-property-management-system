# Review Center UI and client-search simplification

## Navigation and counts

The duplicated sidebar labels came from the Reviews navigation group's heading and identically named child link. AppLayout now renders that existing role-filtered group as one direct link to /approval-requests. Routes, administrator access, staff access to their own payment corrections, feature-search destinations, Back navigation and the remaining expandable sidebar groups are unchanged.

All Review Center category counts use red with white text when greater than zero and neutral gray at zero. The same rule applies to All Reviews. Existing review-context refreshes continue updating counts after mutations and notifications; searching/filtering the table does not hide the global category totals.

## Requester and decision identity

The compact table uses Client / Property, Review Type, Requested By, Date Requested, Status and Action. The requester cell includes full name, username and role at request time. Completed decisions also show the reviewing administrator below the status. Review Details contains both identities and their recorded dates.

The read model uses explicit evidence from each existing workflow: original correction submission, start of a forfeiture/cancellation review cycle, cancellation creation approval, assumption-request history, first voucher/cash/payout submission, migration history, or the recorded initiating financial amendment. It never substitutes the client-account creator, latest updater or final approver for a missing requester. Repeated review events preserve the first initiating actor within that cycle; a later cycle after resolution has its own original initiator.

New actor snapshots capture authenticated account name, username, ID and role in existing request/history/audit records. They are built server-side from req.user, not from client-submitted identity fields. Payment correction request/reviewer metadata is separate. Existing source IDs, decisions, financial data and permission/separate-approver checks are unchanged.

For historical records with a known user ID, a single batched read can resolve a real user profile name/username where the snapshot lacks them. It never overwrites a stored name/username and never derives a historical role from today's User.role. Missing identity fields, historical roles or submission timestamps remain Unknown / Legacy Record. Automated review entries without an actual submitted requester also remain explicit unknowns rather than attributing them to an unrelated employee. Original records are not backfilled or rewritten.

Request dates use recorded submission/creation events; updatedAt remains only the existing list ordering signal. Dates display in Philippine time. Search now includes requester name, username and recorded role; a Requested By filter groups records by captured user identity while retaining existing category/status filters and pagination.

## Client suggestions

The shared autocomplete displays only client name, Client ID and one badge for the actual client-level status. The separate advanced client-search modal uses the same simplified display. It suppresses contract, payment, penalty, commission and property-availability badges/details in suggestions even if those metadata fields remain present in the source record.

The existing Client model supports Active and Inactive. The UI does not invent Cancelled/Forfeited client-level statuses from an individual contract. Client lifecycle synchronization and all contract/financial calculations are unchanged. Contract/property-specific states remain available in the selected account/detail pages.

Selection payloads, underlying status metadata, server query scopes, inactive-client visibility where previously permitted, property/project search matching, debounce and keyboard navigation are preserved. Agent/property searches retain their own appropriate statuses.

## Main files

- AppLayout, ApprovalRequestsPage, AdminReviewDialog and ReviewIdentityDetails: direct navigation, category counts, compact table, requester filtering and detail display.
- Existing adminReviews read model and reviewIdentity helper: explicit original-request versus decision evidence and one batched historical profile lookup.
- Existing auditValues/ActivityLog and approval mutation actor snapshots: authenticated name/role capture going forward.
- Existing SearchInput, SearchStatusBadges, ClientSearchModal and searchRecordStatus helpers: client-only suggestion display without removing business statuses.

## Validation

- Server suite: **486 passed, 29 skipped, 0 failed**.
- Client production build passed; the existing large-bundle warning remains.
- Seven focused requester tests cover separate requesting/reviewing users, original cycle identity, submission histories across workflows, missing legacy evidence, immutable authenticated snapshots, batched profile lookup without role inference and subsequent review cycles.
- Existing financial, approval permission, request scheduling, refund and search tests pass.
- DOM checks cover one direct sidebar link, both theme attributes, computed red/white and gray counter colors, requester search/filter/details, preserved close state, updated zero counts, one client badge, hidden contract/property status text, and unchanged keyboard selection payloads.
- Real database integration and visual/resolution/zoom checks remain local acceptance work. The 29 skipped integration tests are not claimed as passing; DOM checks do not certify a physical browser's pixel layout.

No production records were changed. Nothing was committed, pushed, merged or deployed.
