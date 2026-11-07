# Preview-first list actions

Projects, Clients, Agents, Commissions, Users and Activity Logs now have Refresh Results, Print, Export CSV and Export Excel actions. Existing commission report variants and PDF support remain available through the report selector and preview.

All output actions first open an accessible preview showing company, title, Philippine generation time, active filters, matching count and rows. Preview pages contain 20 rows, while print and downloads include the complete matching result. Commission totals use peso labels. Export buttons appear inside the preview. No file download is initiated simply by opening it. Closing/Escape restores focus.

The authenticated `/api/list-reports/:module` endpoint reuses existing list controllers and commission reports. Paginated agents, commissions and activity logs support a server-only complete-result flag; query parameters cannot enable it on the ordinary list endpoints. Existing permissions remain: Users and Activity Logs require ADMIN. User fields are explicitly selected and report output omits credentials; activity logs retain existing audit-value redaction. Preview/download operations do not modify business records.

Downloads require a preview fingerprint. The server rebuilds the filtered result and rejects changed data with HTTP 409. Staff must close the stale preview and load a fresh one. Printing uses the report already reviewed. Excel numeric monetary values remain numbers, and CSV protects text fields beginning with spreadsheet formulas. Print output escapes stored text and excludes edit controls. No new production dependencies or database migrations are required.

Property Inventory and Manage Lots now also use this preview-first toolbar, including Refresh Results and CSV export. The inventory preview includes project identity, phase/block/lot/status/search filters and saved numeric pricing. Payment Transactions actions remain unchanged by this update.

## Files

- Added client/src/components/ListReportActions.jsx.
- Updated pages ProjectsPage, ClientsPage, AgentsPage, UsersPage and components CommissionLedger, ActivityLogs.
- Added server/src/controllers/listReportController.js, server/src/routes/listReportRoutes.js and server/src/utils/listReport.js; registered route in server/src/app.js.
- Updated activityController and commissionController for internal complete-result reads. Extended commissionReportController for internal structured preview and consistent DETAIL sorting while preserving existing export formats.
- Added server/test/list-report.test.js and extended server/integration/payment-flow.test.js.

## Verification

130 regular backend tests passed; one optional integration test skipped by the default command. Isolated MongoDB HTTP integration ran separately and passed, including every new module, all matching pages, role restrictions, credential redaction, CSV/Excel output, preview requirements, stale-result rejection and commission payout PDF. The database was disposable; office records were not accessed.

DOM tests passed for preview-before-download, preview pagination over 45 rows, full-result printing, snapshot/filter parameters, stale-download blocking and Escape. Existing office workflow and commission interface regressions passed. Client production build and git whitespace check passed. Actual office-browser/printer appearance review remains pending.

Changes are not committed or pushed. Run instructions and environment are unchanged.


## Inventory preview follow-up

Updated PropertyInventory.jsx, listReportController.js and listReport.js to include inventory in the shared preview workflow. The existing dedicated inventory Excel endpoint remains compatible, while page buttons now require preview through the shared reporting endpoint. Downloads reject inventory changes since preview, including saved price changes.

Verification: 131 regular backend tests passed (one optional integration skipped in the default command); the isolated HTTP/MongoDB integration passed separately, including inventory CSV/Excel and stale-price rejection. Inventory preview and shared preview DOM checks passed; client production build passed. No business records or production data were changed, and no commit/push was performed.
