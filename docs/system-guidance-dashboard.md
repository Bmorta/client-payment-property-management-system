# System field guidance and dashboard graphs

## Field guidance

Shared `FieldLabel` uses the existing `FieldHelp` interaction: hover, keyboard focus or tap opens an explanation; Escape and outside taps close it. Help buttons are outside the associated label, never submit a form, and tooltips remain above dialogs. Controls have associated labels, including compact inventory cells. `RequiredMark` is derived from the editable control's `required` property, so optional and read-only fields stay unmarked and conditional requirements update with the form. Forms include a red `* Required` note.

Applied to clients, assignments, contract edits, projects, lot generation and modification, agents, commission agreements and payouts/recoveries/corrections, payments and corrections, expenses, monitoring, reports, approval requests, searches/filters, activity logs, login and user management. Existing detailed contractual help remains in place. Search filters are optional unless their existing control requires a date. New-user username/password are required; the edit-user password remains optional. Notice references and legal-review confirmation are required only for the review states already requiring them on the server. Assigned-agent selection is required for commission agreements, not for ledger filtering. Defaulted enum choices retain their existing validation behavior.

Core files: `client/src/components/FieldLabel.jsx`, `client/src/utils/fieldExplanation.js`, the existing forms under `client/src/components` and `client/src/pages`, and `client/src/styles.css`. This changes presentation and aligns native required attributes with existing server rules. It does not add database fields or change financial policies.

## Dashboard

`DashboardCharts.jsx` adds a six-month collections-versus-expenses bar graph and a payment-status donut on the Dashboard. Existing monitoring cards and lists remain. The trend uses Philippine calendar months ending at the selected as-of day, including zero-activity months. Both charts follow the selected project/date. The status chart follows the account-status filter and counts each filtered property contract once; the financial trend includes all transactions in the project, independent of account status. Help explains this distinction. All-project expenses include Office and Other categories.

The authenticated `GET /api/finance/reports/dashboard` route validates dates/project and applies the project filter to both account and expense queries. `server/src/utils/dashboardCharts.js` aggregates integer centavos using effective corrected payments and excludes voids. No database writes occur. The frontend formats totals as pesos. No forecast collections or fabricated data are shown. The existing refresh interval/live-notification event refreshes charts. Loading, empty and error states are included. Monthly figures and status counts are available as text/table alternatives. Graph animation is disabled.

## Validation

- Backend tests cover corrected and voided payments, inclusive dates, expenses, empty months, year transitions, project filters on both queries, invalid dates/IDs, and unchanged source records.
- DOM checks cover editable required, optional, read-only, conditional and compact fields; actual label/control association; no help buttons nested in labels; focus/Escape behavior; graph SVG rendering in measurable containers; displayed figures, project requests, year transitions and empty state.
- Existing DOM regression checks cover client/payment search and corrections, contract help, live refresh events, commissions/payouts and permissions, sidebar/mobile drawer behavior, lot pricing, guarded bulk deletion and confirmation/cancel flows.
- Full backend suite and client production build run before handoff. The optional MongoDB integration test is skipped without its isolated database configuration.
- Real-browser visual review at office desktop/mobile sizes remains pending; DOM checks do not replace this review.

Run the existing server and client development commands. Open Dashboard for graphs and any entry form for guidance. No reseeding, database reset or migration is needed. This work is not committed or pushed without approval.
