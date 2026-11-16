# Compact client-request scheduling and personnel assignment

## Root causes

The existing workspace routed every action through an unconditional action-reason check, required both confirmed start and end timestamps, and used an oversized account-only personnel multi-select. A separate Assign action changed the request to Assigned before reports could be submitted. This made ordinary scheduling appear to require multiple unrelated confirmations.

## Current workflow

1. Register the request normally. It may remain New without a schedule or personnel.
2. Open the request's **Schedule Visit** section.
3. Enter **Scheduled Visit Date** and **Start Time**, both required. **Expected End Time** and **Scheduling Notes** are optional.
4. Select existing REMS employees through the compact search, type manual names, or combine both. Multiple assignments are supported, up to 10 people in total. Add Person/Enter prepares another manual name; the last typed name is also saved directly by Confirm Schedule.
5. Click **Confirm Schedule** once. The same existing request action saves date/time, notes and assignments atomically and sets Scheduled. No action reason, intermediate For Scheduling action, separate Assign confirmation or approval modal is required.
6. Edit the same compact section to reschedule/reassign. Existing In Progress work is not reset by an assignment edit. Historical Assigned/Rescheduled records remain readable.
7. Record actual visit times and findings using the existing report workflow. Scheduling never marks Completed. Completion still requires appropriate permissions, an actual report and resolved follow-up requirements.

Reasons are required only for cancellation, rejection and placing a request on hold. Ordinary scheduling, reassignment, edit notes and visit reports use automatic readable activity descriptions when no optional reason is supplied. Frontend and backend apply the same exceptional-action rule. Scheduling failures appear inline and preserve entered values.

## Personnel and permissions

Existing assignments keep their real User IDs and receive the existing account notifications. Manual names are stored on the request and in immutable assignment/report history snapshots. No employee/User account is created and no account access is granted by a matching name. Existing assigned account holders and administrators retain their visit-progress/reporting permissions; for manual-only personnel, an administrator records their report in REMS.

Export validation also found that the previous worksheet name History is reserved by Excel. The existing export now uses Activity History.

Current request details, lists, print previews, Excel request/history/visit-report sheets and request text search include both linked and manual personnel names. Reassignments retain previous identities/names and schedules. Former account assignees still receive the existing reassignment notification through their account recipient slot.

## Conflicts and optional end time

Expected end time remains null when omitted; REMS does not claim a duration that was never entered. For conflict checks only, an unknown end conservatively reserves the assigned people until the end of the Philippine visit day. Enter an expected end to permit a later non-overlapping booking that day. This behavior is explained beside the time inputs.

Matching existing User IDs and normalized exact names participate in conflict checks, including a manually typed name that matches a linked employee. Names are normalized for comparison, not converted into accounts or automatically merged into person identities. Ambiguous same-name personnel may need a distinguishing full name and office review. Legacy bookings without new comparison keys remain checked through their preserved snapshots or existing account identities.

The existing scheduling transaction guard, request identities and optimistic versions prevent concurrent overlapping bookings, duplicate activity events and partial assignment updates. A non-unique personnel-key index supports lookup; no financial schema maintenance or mandatory backup flow was added.

## Files

- Existing SiteRequestsWorkspace and SiteRequestForm: direct scheduling, exceptional-action reasons, history and print integration.
- SiteVisitScheduleForm: compact date/time, employee search, manual names and notes in the existing request workflow.
- Existing SiteRequest model/service/controller and shared/siteRequests.js: optional end, linked/manual assignment snapshots, conflicts, notifications, readable events and exports.
- shared/siteVisitScheduling.js: shared personnel display/normalization, scheduling-field conversion and reason rules.

## Validation

- Server suite: **479 passed, 29 skipped, 0 failed**.
- Client production build passes; the existing large-bundle warning remains.
- Tests cover direct scheduling without a reason/end, manual-only and mixed assignments, no automatic account creation, normalized/concurrent conflicts, cross-mode employee-name conflicts, reassignment history/notifications, exceptional reasons, report/completion safeguards, actual Excel cells and manual-personnel search.
- DOM checks pass for one compact form, optional end, directly typed manual personnel, employee + manual selection, one save without another confirmation dialog, Light/Dark theme attributes, and preserved input after a conflict.
- Real MongoDB transaction/integration and visual browser/zoom/physical-print acceptance remain local checks. Mocked transaction and DOM tests do not certify those environments.

No production records were changed. Nothing was committed, pushed, merged or deployed.
