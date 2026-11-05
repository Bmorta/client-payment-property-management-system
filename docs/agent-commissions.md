# Agent and commission management — November 5, 2026 (Philippine time)

## Inspection and scope

No existing Agent/Commission model, route or page was present in the inspected checkout. This update adds those modules and integrates them with the existing property-sale account, effective payment allocations, standalone-MongoDB atomic updates, audit journal, notification bell and report styling. Existing client/property/payment metadata is preserved. No office database was connected, migrated or seeded during development.

## Using the feature

1. Administrators open **Agents → Add Agent**. IDs are assigned on the server (`AGT-…`) and cannot be edited. Record profile details, type and assigned projects. Edit/status changes require a reason. Archive by saving Inactive; this does not delete agreements or financial history.
2. Open **Commissions → Configure Property Commission**. Search the buyer, select the actual property sale, enter its total allocated percentage and commission term, then choose agents and their individual percentages. The backend rejects duplicate agents and allocations exceeding the sale's percentage. Each sale keeps its own agreement; there is no global agent rate.
3. Record buyer payments through the existing Payment page. Only effective principal allocations produce commission earnings. Down-payment rows fund DP commissions; installment/advance rows fund monthly commissions. Penalties, unrelated charges, cancelled and voided payments do not fund commissions. Arrival of a due date does not create earnings.
4. Select an agent's **Commission Records** to filter by project, status, type, dates, property and client. Project options include explicit assignments and projects found through current/historical sale records. Filtering, sorting, summaries and pagination run on the backend.
5. Administrators open **View / Release → Release Commission**, enter the actual payout amount/date/method/reference, review and confirm. Payouts are separate transactions with `CPY-…` IDs. Partial releases retain each payout date. Dates cannot precede the buyer collections required to fund that payout, including when an earlier partial earning already existed.
6. Corrections/voids of buyer payments recalculate eligibility in the same atomic account update. Actual payouts remain preserved. Over-releases become recovery balances; additional releases on that property sale are blocked until the balance is resolved through a valid payout correction or an actual recorded return of funds.
7. **Record Actual Recovery** records returned money, not an automatic deduction or a forgiveness of the agent's balance. **Correct Payout** appends a reasoned revision; it does not overwrite the original payout. Corrections cannot create over-releases or make recorded recovered funds exceed net payouts.

Inactive agents retain their ledgers and existing contractual earnings/payout rights. They cannot be newly assigned to another sale; an inactive agent already in an agreement can remain in that preserved agreement.

## Calculation and rounding

- Currency uses integer centavos; percentages use integer basis points (two decimal places of percentage). BigInt products avoid floating-point multiplication errors.
- Total agent budgets are apportioned deterministically within the property's allocated monetary cap, including tiny centavo rounding cases across multiple agents.
- DP budget derives from agreed DP; earned DP commission derives only from actual DP principal collected. Monthly budget is the remaining agent allocation, so DP plus monthly budgets cannot exceed the agent's assigned total.
- The remaining principal and remaining commission are divided into the configured number of commission periods. Regular periods use rounded centavos; the final period corrects rounding differences. For ₱1,000,000 less ₱20,000 DP at 10% over 30 commission periods, DP budget is ₱2,000, monthly budget ₱98,000, regular monthly commission ₱3,266.67, and the final period is adjusted to preserve ₱98,000.
- **When buyer and commission terms differ**, a commission period is a principal-funding portion rather than an independently payable calendar obligation. Actual paid buyer installment allocations fill these portions in order, retaining transaction/actual-installment references. Partial funding earns proportional commission; full period budget requires full funding. A final centavo is held until complete funding if rounding would otherwise mark a partially funded portion fully earned. This prevents scheduled commission terms from creating unfunded entitlements.
- Multiple future installments paid in advance fund their eligible portions immediately, without duplicate earnings. Original buyer allocations stay untouched.
- The original commission agreement, its changes, original payout records, appended payout revisions, source references and earning adjustments remain auditable. A retroactive agreement change explicitly recalculates paid-buyer eligibility; it does not erase previous payouts. Removed agents/periods with history remain as retired ledger entries, with recovery balances where applicable.

Earning status is stored separately from payout status. The main ledger distinguishes Awaiting Buyer Payment, Unreleased–Ready for Release, Partially Released, Released and Adjusted/Reversed. A partially funded record may have all of its **currently earned** portion released while still awaiting additional buyer collections; the earning and payout statuses show that distinction.

Released totals are gross actual effective payouts. Recovered funds are displayed separately. Unreleased/recovery balances use net released amounts after recorded recoveries, without offsetting unrelated projects or sales.

## Integrity, permissions and notifications

All allocations, earnings snapshots, source references, changes and payout/return appends live with their property-sale account. Optimistic document versions make the financial write atomic on the existing standalone MongoDB setup. Simultaneous payouts cannot spend the same unreleased balance. Submission IDs prevent duplicate payouts/recoveries; altered replays are rejected. Sequence IDs use atomic counters reconciled against existing IDs rather than document counts. Failed requests can leave harmless numbering gaps.

Buyer payment posting, approved corrections, voids, contract changes and commission agreement changes all reuse the monitoring recalculation hook. The startup/60-second reconciliation worker also includes commission-enabled accounts. Repeated reconciliation does not duplicate earnings or notifications.

Agent management, agreement changes, payout recording/correction and recoveries are administrator-only. Other authenticated roles can inspect/filter financial records. There is no configured staff payout-approval workflow; an administrator directly confirms actual releases. Optional bulk release is not included.

Administrators receive persisted, deduplicated notifications for new earned commission, adjustments and recovery needs. Notifications open the relevant commission account/agent. The existing SSE connection also detects commission-enabled account version changes. Agent/Commission module filters were added to User Activity Logs. Domain events retain actor, date, reason and before/after values alongside the existing durable request journal.

## Reports

The Commissions page provides Complete Ledger, Agent Summary, By Project, By Property, DP Earnings, Monthly Earnings, Released, Unreleased, Payout History and Adjustments. The existing Reports page links to these reports without duplicating the commission screens.

Daily/weekly/monthly/yearly/custom date filters are supported. Ledger date filters select records by their latest earning date; cards show current lifetime balances of those selected records, not period cash-flow totals. Payout-history exports apply date bounds to actual release dates; adjustment reports apply them to event dates. Clear date filters to include not-yet-earned records without earning dates.

Excel uses the existing ExcelJS dependency and numeric money columns. PDF uses the added `pdfkit` dependency; complete financial records wrap into blocks rather than being clipped into a wide table. All exports respect the selected agent/project/property/client/type/status filters.

## Modified / added files for this feature

- `server/src/models/Agent.js`: new agent profiles, immutable IDs, projects and profile history.
- `server/src/models/PropertyAssignment.js`: additive commission agreement/history, snapshots, events, payouts and recoveries.
- `server/src/utils/commissionLedger.js`: budgets, earned eligibility, source attribution, rounding, payout/recovery balances and notification events.
- `server/src/utils/generateRecordId.js`: safe AGT and CPY allocation/reconciliation.
- `server/src/services/monitoringService.js`: atomic commission integration and recovery after downtime.
- `server/src/controllers/commissionController.js`: profiles, agreements, server ledger/filtering/pagination, payouts, corrections and recoveries.
- `server/src/controllers/commissionReportController.js`: scoped Excel/PDF reports.
- `server/src/routes/agentRoutes.js`, `commissionRoutes.js`, `server/src/app.js`: authenticated modules and administrator write permissions.
- `server/src/middleware/auditMutation.js`, `server/src/controllers/notificationController.js`: agent/commission auditing and live account version detection.
- `server/package.json`, `server/package-lock.json`: PDF export dependency.
- `client/src/pages/AgentsPage.jsx`, `CommissionsPage.jsx`: agent profiles and commission dashboard.
- `client/src/components/AgentPicker.jsx`, `CommissionAgreement.jsx`, `CommissionLedger.jsx`, `CommissionRecord.jsx`: search, property allocations, server-driven ledger and confirmed financial actions.
- `client/src/App.jsx`, `client/src/layouts/AppLayout.jsx`: lazy routes and two main-menu entries.
- `client/src/components/NotificationBell.jsx`, `ActivityLogs.jsx`, `StatusBadge.jsx`: commission links, audit filters and consistent statuses.
- `client/src/pages/ReportsPage.jsx`: entry to commission reports.
- `server/test/commissions.test.js`, `server/integration/payment-flow.test.js`: new tests and regression/integration extensions.

## Validation and run instructions

The working checkpoint passed 98 unit/controller tests. The ordinary test run skips the optional MongoDB test; it passed separately against an isolated, disposable MongoDB database. It exercised actual agent creation/edit/archive, safe IDs, multiple agents, rate caps, multiple projects/rates, earned-only eligibility, partial/full payouts, exact release dates, duplicate submission, concurrent payout safety, void/recovery, payout corrections, PDF/Excel responses, audit records and live notifications. Existing client/property/payment/penalty/approval tests remain included.

DOM interaction checks passed for read-only IDs, confirmed agent creation, profile project/status filtering, server pagination, confirmation before recording an actual release date, and staff read-only actions. The prior UI interaction checks and Vite production build also pass. These are DOM/API checks; Windows office/browser acceptance still needs to be performed.

From the working repository root:

```powershell
npm install --prefix server
npm install --prefix client
npm test --prefix server
npm run build --prefix client
```

Keep MongoDB running and retain the existing `server/.env`. Start two terminals:

```powershell
npm run dev --prefix server
```

```powershell
npm run dev --prefix client
```

Open the Vite URL (normally http://localhost:5173). Do not reseed/reset the database. The server dependency install is required for the new PDF export. This update targets `feature/property-inventory`; use the published feature-branch commit when pulling. Main is not merged as part of this delivery. See `feature-checklist.md` for the complete delivery checklist.
