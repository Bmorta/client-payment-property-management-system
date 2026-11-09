# REMS branding and navigation

Implemented on `feature/rems-navigation`. The user subsequently authorized committing and publishing this branch for local testing. No merge or deployment is included.

## Changes

- Application title and login now use Real Estate Management System (REMS), with the subtitle Integrated Property, Client, Financial & Commission Management.
- Sidebar modules use ten expandable categories. Category state and the desktop icon rail preference are saved in local storage. Hover or keyboard focus expands the icon rail; Escape returns keyboard focus to the workspace.
- Existing URLs remain valid. Query-aware highlighting distinguishes reports, activity logs, commission releases and client workspaces.
- Contract, transfer and cancellation shortcuts reuse the existing client selector and account tools. No duplicate financial page was created.
- Report shortcuts open the existing operational or cash report. Administrator cash tools open when requested by the cash-management shortcut.
- Staff can open their own approval-request history, as already permitted by the API; decision buttons remain administrator-only.
- Historical Migration rejects VIEWER access at the frontend as well as the API. Payment entry controls are disabled for VIEWER users.

## Modified files

- `client/index.html`
- `client/src/App.jsx`
- `client/src/layouts/AppLayout.jsx`
- `client/src/styles.css`
- `client/src/utils/workspaceNavigation.js` (new)
- `client/src/pages/LoginPage.jsx`
- `client/src/pages/ClientsPage.jsx`
- `client/src/pages/ReportsPage.jsx`
- `client/src/pages/UsersPage.jsx`
- `client/src/pages/ApprovalRequestsPage.jsx`
- `client/src/components/PropertyPaymentCheckout.jsx`
- `client/src/components/CollectionCashReport.jsx`
- `client/src/components/CashLedgerTools.jsx`
- `server/test/rems-navigation.test.js` (new)
- This document.

## Validation

- Pre-change baseline: 232 passed, 14 environment-gated skipped, zero failures.
- Updated suite: 235 passed, 14 environment-gated skipped, zero failures. The three additional tests cover destinations, role visibility and query-aware navigation.
- Production build passed. The existing large JavaScript chunk advisory remains.
- Rendered DOM checks passed: active query selection, administrator/staff/viewer navigation, category persistence, desktop preference, mobile drawer Escape and body-scroll restoration.
- Existing owner-turnover UI checks passed, including correction confirmation, feedback, recipient/history display and print data.
- Separate disposable MongoDB integration checks passed for payment corrections/permissions/persistence; lot transfers and legacy index safeguards (standalone and replica modes); cancellation/credit/refund workflows (standalone and replica modes); cash turnovers; historical migration activation; and company/report branding/exports.
- An older commission UI harness also failed to find an expected button after its dependency path was repaired. That harness does not establish a regression; commission UI files are unchanged. Commission acceptance testing remains pending.
- Additional retroactive-commission integration attempts ended without a completion report. They are inconclusive and are not counted as passing; commission unit regressions passed in the main suite.
- All pre-existing backend and shared files were compared with the pre-change checkpoint and are byte-identical. Financial calculation code and print templates were not changed.

These checks do not replace acceptance testing on the office installation, physical printers, real mobile devices or its actual data. No office database was accessed or modified.

## Run locally

The existing run commands are unchanged. Start MongoDB, then run `npm start` in `server` and `npm run dev` in `client` in separate terminals. On PowerShell installations that block `npm.ps1`, use `npm.cmd` instead of `npm`.

Local Git metadata predates some already-published work. The preserved worktree must be compared against the published branch before a future commit or push; do not reset or blindly stage the entire existing diff.
