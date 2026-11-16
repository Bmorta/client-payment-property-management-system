# Client Requests and Site Visits

## Locations

- Clients and Contracts → Client Requests and Site Visits opens central registration, list, booking calendar, assigned activities and history.
- A client account has a Requests and Site Visits tab restricted to that client’s records.
- Projects, inventory lots and agent rows link to the corresponding filtered request list.
- Dashboard shows current totals, pending requests, scheduled visits, today’s field activities, overdue and completed requests. These are current operational figures, independent of historical payment projections.

## Registration

Staff or administrators record requests. Default types cover Property Locating, Locate Kural, Light-Material Construction, Road Development, Property Improvements, Mohon / Landmark Check, Property Check, Site Tripping and Others. Administrators configure labels, active state and new codes; existing codes and relationship modes cannot be deleted or repurposed.

A client-property request must reference the client’s actual current active PropertyAssignment, matching project and Property.client. Cancelled, transferred, assumed, forfeited, superseded or cancellation-reserved accounts cannot authorize a new property activity. Current ownership is checked again before booking, reassignment or starting work. Client name and contact are snapshotted from the master client; missing contact must be completed there first.

An agent tripping request can record a prospect without a contract. It requires an active requesting agent, prospect name and contact, a current project and area. Optional viewing lots must be available, unassigned and in that project. Where an agent has explicit project assignments, that project must be included. A separate assigned agent is optional and follows the same active/project rules.

IDs are server-generated SRQ identifiers based on a native unique MongoDB identity. Client submission keys, actor binding and signatures make registration idempotent. This is not a new financial Request ID series and does not alter payment-correction numbering.

## Scheduling and field work

Typical flow: NEW → FOR_SCHEDULING → SCHEDULED → ASSIGNED → IN_PROGRESS → COMPLETED. ON_HOLD, RESCHEDULED, CANCELLED and administrator REJECTED are supported with reasons. Terminal requests are read-only. Rescheduling and reassignment append history rather than replacing prior evidence.

Confirm start/end times separately from preferred times. All UI times and calendar days use Asia/Manila. A visit interval must be positive and no longer than 24 hours. Choose active ADMIN or STAFF accounts as field personnel (1–10 distinct people). The system does not create a new field-staff login role; existing accounts are assigned to activities.

Staff may register and coordinate requests, schedule, assign, reschedule, hold and cancel. Only assigned personnel or administrators may submit field reports, start or complete the visit. Staff can edit their own unscheduled registration; administrators may edit open registrations. Rejection and request-type configuration are administrator-only. Viewers can read and export but cannot mutate requests.

A shared AdministrationGuard document serializes all request writes in MongoDB transactions. Overlapping confirmed appointments for any shared personnel are rejected; adjacent intervals are allowed. On Hold, Completed, Cancelled and Rejected appointments do not reserve personnel time. Reactivating a booking must pass conflict checks again. No backup is required for routine request actions.

Reports retain actual start/end, area, actions, findings, attendance, completion remarks, personnel snapshots, attachment references and actor/time. A report is required before completion. A required follow-up needs description and due time and must be resolved with another appended report before completion. Earlier reports remain intact.

## Attachments and history

Creator, assigned personnel or administrator may attach evidence to an open request: PDF, PNG, JPEG or WebP, up to 2 MB per file and 20 attachments per request. Content signatures and MIME are checked. File bytes are stored in a separate SiteRequestAttachment document and are not copied into audit values. Authenticated downloads are forced as attachments with no caching and no content sniffing. Original evidence cannot be deleted through this module. Attach files before marking a request Completed.

Per-request history records actor, time, reason, before/after registration, assignment names/IDs, schedule changes, field reports and file metadata. Existing ActivityLog middleware also journals mutations with sanitized request values. File bodies are excluded by the existing base64 audit filter. Updates use request versions and action identities to reject stale or duplicate actions.

## Views and reporting

Search by request ID, contact, description, project, lot or personnel. Filter type, project, area, client, requesting/assigned agent, personnel, status, priority and activity dates. Activity dates mean confirmed start, otherwise preferred date, otherwise request date. Assigned Field Activities uses the signed-in personnel ID; History uses terminal states. The calendar includes preferred and confirmed appointments and labels them distinctly. Filtered lists are paginated, while print and Excel include the full matched scope up to a 5,000-request safety limit. Excel has Requests, History and Visit reports sheets. Attachments are downloaded separately.

## Notifications

Request events use an embedded outbox in the same transaction and are merged into the existing authenticated notification bell/SSE feed. New assignments, rescheduling and other actions notify administrators, the creator and responsible personnel; previous personnel are included on reassignment. Dynamic reminders flag upcoming appointments within 24 hours, overdue or unattended confirmed visits, unscheduled requests whose preferred date passed, and due follow-ups. They are computed from current request data when the existing notification feed is read, so missed reminders become visible when users reconnect. They are not email, SMS or operating-system push notifications.

NotificationRead now supports a sourceModel discriminator for either PropertyAssignment or SiteRequest while retaining existing account notification identities and read history. Reading a notification does not alter a financial account or request version.

## Implementation and database scope

New models: SiteRequest, SiteRequestSettings, SiteRequestAttachment. Their native unique _id identities protect submissions without adding redundant custom uniqueness indexes. Existing financial models, formulas, contracts, receipts and commission records are not written by this module. Only the shared AdministrationGuard serializes site booking writes. MongoDB transaction support is required. No production migration or maintenance action was performed.

API base: /api/site-requests. Authenticated GET list, options, request detail, attachment download and Excel export; ADMIN/STAFF POST registration, actions and attachment upload; ADMIN PUT types. Controller/service permissions further restrict report authorship, editing, rejection and attachments. Request Settings GET returns defaults until an administrator saves changes; it does not mutate data on read.

## Verification and remaining acceptance checks

Unit and mocked service tests cover actual property ownership, unrelated properties, multiple properties, agent prospects, idempotent registration/actions, personnel conflicts, scheduling, reassignment, rescheduling, cancellation, rejection permissions, stale versions, visit completion, follow-ups, type configuration, evidence validation and notification scoping/read state. The full unit suite passed 406 tests with no failures; the production frontend build passed with its existing bundle-size advisory. The separate database-gated integration test was skipped.

The opt-in HTTP/MongoDB integration test uses REMS_SITE_REQUEST_TEST_URI, creates a separate randomly named rems_site_requests_test_ database and removes only that disposable database. It does not load the office connection from .env. It covers HTTP roles, booking conflict, report completion, file roundtrip, prospect requests and audit persistence. No isolated MongoDB binary/URI was available here, so this test was skipped rather than executed on office data.

Actual browser usability, native print output, real replica-set concurrency, large-volume performance and office-device behavior still need acceptance testing. No browser session or running office service was touched. This module records requests; it is not a construction permit, legal boundary certification, financial approval or automated site dispatch service.

## Simplified registration form
New Request opens a keyboard-accessible three-step dialog: request details; client/agent/property; preferences and review. Required fields are marked, each step validates before proceeding, and focus moves into each step. Location is optional. Put extra instructions in Request Description; existing remarks remain preserved and readable.

Site Tripping supports an existing client or manually entered prospect, and an existing authorized agent or manually entered unregistered agent name. Manual names do not create client or agent records or grant permissions. Other property request types still require the actual client's active property account. Confirmed scheduling, personnel assignments and notifications follow the existing workflow.

History uses readable activity/status wording and structured details instead of raw database JSON. The immutable underlying history remains intact.

Validation: targeted request/notification tests and production frontend build. Live browser, keyboard, and office workflow acceptance testing remains necessary.
