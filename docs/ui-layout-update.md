# UI layout update — November 6, 2026 (PHT)

This first UI pass replaces the overcrowded horizontal module menu with a grouped sidebar and compact header. Delivery branch: `feature/property-inventory`. Main is not merged as part of this update.

## Changes

- Sidebar groups: Overview, Management, Finance, Monitoring and Administration.
- All existing destination routes remain available. Approval Requests and Users & Activity remain administrator-only.
- Current-page highlighting handles nested project/Manage Lots routes.
- Header retains the Philippine clock and notification bell; user identity and logout move to the sidebar footer.
- Below 1200px, navigation becomes a drawer with a backdrop, close button, Escape handling, focus wrapping and scroll restoration. Selecting a route closes it. The compact phone header hides the secondary clock/avatar to reserve space for navigation and notifications.
- Shared styles unify typography, card spacing, form sizing, focus states, table headers/actions, badges and scrollable tables. No new UI dependency or remote asset was introduced.
- Dashboard and Payment Reminders now have separate headings. Monitoring cards have readable labels, category colors and clearer click targets; they retain their existing API counts/filter actions.
- Print styling removes the navigation/header so page content can use the available width.

## Files

- `client/src/layouts/AppLayout.jsx`: sidebar/header and responsive navigation interactions.
- `client/src/components/NavIcon.jsx`: lightweight reusable SVG navigation icons.
- `client/src/styles.css`: shared responsive presentation.
- `client/src/App.jsx`: Dashboard presentation prop.
- `client/src/pages/PaymentMonitoringPage.jsx`: page titles and monitoring card presentation.

No backend files, financial calculations, transaction routes, database models or office records were changed for this pass.

## Verification

- Vite production build passed.
- DOM interaction checks passed for role-based navigation, active route, drawer focus wrapping, Escape, backdrop/route closing, body scroll restoration and logout. The drawer checks performed no financial writes.
- Existing payment/correction/allocation/discard/dashboard-refresh DOM checks passed.
- Existing agent/commission role/filter/payout confirmation DOM checks passed.
- `git diff --check` passed.

The connected local browser was unavailable, so these checks do not constitute visual/browser acceptance. After pulling, review desktop, tablet and phone layouts on the office installation. Check long project/client names, large tables, notification popovers, confirmation dialogs and keyboard navigation with actual data.
