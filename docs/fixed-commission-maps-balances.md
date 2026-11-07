# Fixed monthly commissions, agreement controls, maps and account balances

## Monthly earnings

Monthly commission records now earn their entire scheduled budget only after a complete eligible period is funded. Partial buyer payments remain in the authoritative payment allocations and carry forward. For matching terms, commission periods reference the actual corresponding buyer installment, including variable amounts and rounding. For differing terms, the existing remaining-principal portion mapping is retained; only completed buyer installments fund those portions, and a mapped commission portion must also be complete before earning.

Down-payment commission remains proportional to actual DP collected. Penalties and other charges never fund commissions. Monthly budgets retain fixed amounts and a final rounding adjustment, with the same contract/agent/period IDs and configured term cap. No payout is generated automatically.

Existing commission snapshots reconcile through the existing audit/event/notification service. A prior fractional monthly earning may decrease when recalculated under the new completion rule. Original payout transactions remain unchanged; an already released excess becomes an adjustment/recovery balance. Existing agreement and payout histories are retained. No office database reconciliation or migration was run during development.

## Assignments and preview

Already assigned sale accounts are disabled and labeled Already Assigned in the new-assignment dropdown. Separate View / Modify Existing Assignment buttons open the saved agreement. CREATE against an assigned sale is rejected; MODIFY requires an existing agreement. Version-checked atomic writes prevent simultaneous saves from creating multiple current agreements. Agreements remain embedded in their existing sale account, identified by its contract assignment ID, with complete amendment history and required reasons. The existing application does not introduce a new resale/contract-termination workflow.

A shared, centavo-safe commission math module powers backend budgets and immediate per-agent form previews. The form shows total commission, DP commission, remaining commission, fixed monthly commission, final-period adjustment and remaining unallocated percentage. Review validates the figures and current account version on the backend before the explicit Save confirmation. Duplicate agents and allocation overages are rejected.

## Property maps

No existing map-upload implementation was present in this branch. Manage Lots now includes an authenticated PNG/JPEG map upload and thumbnail, plus a centered viewer with 1–10x zoom, wheel zoom, pointer dragging, two-pointer pinch, Reset, Fit and Escape/Close. Aspect ratio is preserved; detail depends on original resolution. Viewing never rewrites bytes.

ADMIN/STAFF may upload or replace maps on non-archived projects. Existing project readers may view them. Uploads are limited to 4 MB, 40 million pixels and 16,000 pixels per side, with server-side signature/dimension checks. SVG and unsupported content are rejected. A separate ProjectMap document stores the original bytes, metadata, version and metadata history. The binary is excluded from normal queries and audit entries. Replacements require the current map version; concurrent replacement attempts reject stale versions. Map bytes remain in MongoDB backups alongside existing records. No new runtime dependencies were added.

## Client balances

Property Payment Details displays Contract Selling Price, Agreed Down Payment, Remaining Contract Amount After Down Payment, actual DP collected, Payment Term, Monthly Installment, fully paid installment count, installment principal paid and current outstanding installment principal. Original installment principal is selling price less agreed DP; actual unpaid DP is separate. These are displays of existing backend contract/ledger values; payment schedules and transactions are unchanged.

## Modified files

- client/src/components/CommissionAgreement.jsx
- client/src/components/PropertyPaymentDetails.jsx
- client/src/components/ProjectMap.jsx (new)
- client/src/pages/ManageLotsPage.jsx
- client/src/pages/CommissionsPage.jsx
- server/src/app.js (larger JSON limit only on map URLs)
- server/src/controllers/commissionController.js
- server/src/controllers/projectMapController.js (new)
- server/src/models/ProjectMap.js (new)
- server/src/routes/commissionRoutes.js
- server/src/routes/projectRoutes.js
- server/src/utils/commissionLedger.js
- shared/commissionMath.js (new)
- server/test/commissions.test.js (updated old partial-month expectation)
- server/test/fixed-commission-update.test.js (new)
- server/integration/payment-flow.test.js

## Verification

Backend unit/regression cases cover 0.5/1.2/1.5/2/3 months, cumulative completion, replay, earning dates, corrections/recovery, differing terms, variable installments, per-agent rounding, duplicate assignment intent and image validation. Isolated HTTP/MongoDB scenarios cover preview permissions, preserving payout history during modifications, concurrent assignment saves, authorized map upload, identical image-byte retrieval, metadata/audit exclusion of image bytes, stale and concurrent replacement rejection and existing financial/report regressions.

DOM checks cover disabled assigned sales, create/modify selection, percentage/term preview updates, backend review before saving, map zoom/drag/pinch/wheel/reset/fit/Escape and separate client original/current balances. Actual office browser, touch hardware and visual acceptance remain pending.

Nothing committed, pushed or merged. No office database was accessed. Use the existing server/client development commands and environment; do not seed or reset data.

Final verification: 138 backend tests passed; one optional integration skipped in the default run. The isolated MongoDB/HTTP integration ran separately and passed. New five-feature DOM checks and existing office/commission DOM regressions passed. Client production build and git diff --check passed.
