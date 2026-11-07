# Inventory summary, official release vouchers and smart payments

This batch extends existing modules. It does not seed/reset data, alter lot statuses, change contract penalty terms, create payouts from printing, or remove correction/waiver audit requirements. No production dependencies were added. Publication to `feature/property-inventory` is approved. This batch does not merge into `main` or deploy the application.

## Property Inventory

Open **Property Inventory** for the new summary across All Projects or a selected project. Project, phase, block, effective inventory status, agent and transaction date bounds apply to the summary, six charts, nested project/phase/block table and matching property records. Search/sort/pagination in the matching property table does not change the report totals. Summary selection is bounded to 10,000 lots; narrow the filters for larger inventories.

Available/reserved/sold/inactive cards drill into property records. Current principal receivables open matching outstanding accounts; earned unreleased commissions link to the relevant project/agent commission ledger. The original per-project saved-lot inventory and Manage Lots link remain available.

Definitions:

- Inventory value uses current configured area × price per sqm with the existing centavo valuation rule. Missing area/prices are flagged; known valuations are not represented as a complete total.
- Saved Sold lot status and valid sale contract counts are separate. The existing assignment workflow marks a lot Reserved even after its sale agreement is saved. Valid sale accounts therefore contribute contractual sales, collections and receivables even when that saved lot flag remains Reserved. This update does not rewrite those flags.
- Sold contract value is the included valid account's selling price before agreed DP. Net Sales After Allocated Commission is this contractual value less assigned agent entitlement; it is not cash profit or Cash on Hand.
- Current inventory/value, principal/penalty receivables and commission position are current snapshots. Dates filter collections, period commission earnings/releases and the trend of sales by original contract date. Cards distinguish these scopes explicitly.
- DP and installment collections follow actual principal allocations. Total collections include valid posted payments, with penalty collections shown separately. Voids/reversals and cancelled/forfeited/transferred sale accounts are excluded as documented. No fee receivable structure is invented where one does not exist.
- Allocated, earned, actual gross released, recoveries, earned unpaid, historically held and currently releasable commission are separate figures. Agents never multiply a property's value or collections. An agent filter narrows the associated properties once and sums only that agent's commission records, including retained commission history.
- Archived projects are grouped under Inactive / Archived for operational inventory; their valid sale contract balances and collections remain represented. Land area uses integer millionths of sqm for summation.
- Missing contracts/prices, incomplete commission allocation, conflicting client links, duplicate location/account assignments and missing project references produce explicit alerts. Ambiguous financial records are excluded rather than chosen arbitrarily. Existing financial records are preserved.

Print / Excel / PDF buttons open a preview first. Exports include company identity, human-readable filters, summary figures, project/phase/block subtotals, warnings and generation date. Excel also includes all matching lot details and a Level field so project, phase and block subtotals are not summed together. Export rejects a stale preview. Property type is not offered because the existing property schema has no such field.

## Commission Release Voucher

The printed document now contains only selected release amounts, their commission periods and client/property identifiers. Earned totals, historical earnings, earlier release balances and future entitlement remain internal and are absent from both printed copies and attachments.

Existing preparation/approval/payout safeguards are reused. Drafts are marked unpaid. Once payouts are saved, the print panel selects the latest recorded payout by default. Select the current payout line(s) to print a combined official document, or explicitly choose the original planned draft. Only selected actual payout amounts, dates, methods, reference numbers and releasing users appear on an official paid copy; earlier partial payouts are not automatically added to a new release copy.

The same voucher number and selected transaction details appear on Office and Agent copies, separated by a dashed cut line. The layout is 8.5 × 13 inches portrait with compact signatures for Prepared, Checked/Approved, Released and Received, an agent signature/date field and acknowledgment. Long selections use complete itemized attachments; overflow is checked before printing. No details are silently clipped.

Printing/reprinting only records a print request. It never creates a payout. A source snapshot check rejects payout details changed since preview; print history records the selected payout IDs. The existing idempotency keys, approval checks, account version checks, durable payout intent and amount caps remain in place. Invalid/voided/unrelated payout selections are rejected.

Physical printer alignment still needs acceptance on the office printer. Select long bond 8.5 × 13, portrait, 100% scale and disable browser-owned headers/footers.

## Accept Payment

The server now determines whether an unresolved allocation policy actually affects the payment. A pending policy no longer blocks a normal payment when there is no penalty to allocate. A payment with both unpaid principal and penalties still requires a known contract priority, an explicit payment type, or the existing authorized transaction override. Unknown penalty terms are never invented or activated.

The form retrieves penalty context for the selected payment date. Normal payments hide penalty configuration questions; Remarks remain optional. Applicable assessments show the installment, due/cycle date, contractual grace, days overdue, actual assessed rate or documented historical charge, calculated amount and outstanding amount. Allocation preview shows principal, penalty (when paid), advance allocation and remaining balances.

Override fields are hidden until explicitly requested. Override reasons, penalty waiver authorization/reasons, posted-payment correction/reversal/cancellation controls and audit logs remain required. Paying a penalty-only remaining obligation can be allocated automatically without inventing a priority between two different obligations. Advance-covered periods do not acquire false penalties.

## Validation

- Default backend suite: **176 passed**, four URI-dependent integration workflows skipped by the default runner.
- The company/reporting integration was expanded to verify inventory totals, project/phase filtering, Excel/PDF exports and snapshot checks; current payout print selection and no-financial-write behavior; normal pending-policy payments with no notes/reason; advance coverage and genuine penalty allocation.
- All four disposable MongoDB workflows passed: company/reporting/vouchers, payment permissions/corrections/waivers, replica-set historical migration and retroactive commissions.
- UI DOM checks verify combined inventory filters, chart component mounting, matching records, export preview/snapshot, hidden normal-payment penalty controls, actual overdue details and explicit overrides. Existing office UI and voucher selection checks also run. JSDOM does not measure chart layout; its zero-size container warnings are not visual browser QA.
- Production Vite build passes, with the existing large-bundle advisory. Physical printer alignment remains unverified.
- No office database was accessed and no real payment, contract, lot or payout record was modified.

## Modified files

Frontend:
- `client/src/components/InventoryFinancialSummary.jsx` (new)
- `client/src/pages/InventoryPage.jsx`
- `client/src/pages/PropertyInventory.jsx`
- `client/src/utils/printPropertySummary.js` (new)
- `client/src/components/CommissionVouchers.jsx`
- `client/src/utils/printCommissionVoucher.js`
- `client/src/components/CommissionLedger.jsx`
- `client/src/pages/CommissionsPage.jsx`
- `client/src/components/PaymentConfiguration.jsx`
- `client/src/components/AllocationPreview.jsx`
- `client/src/pages/PaymentPage.jsx`

Backend/shared:
- `server/src/controllers/inventorySummaryController.js` (new)
- `server/src/utils/inventorySummary.js` (new)
- `server/src/utils/paymentContext.js` (new)
- `server/src/controllers/financeController.js`
- `server/src/routes/financeRoutes.js`
- `server/src/utils/contractMonitoring.js`
- `server/src/controllers/commissionVoucherController.js`
- `server/src/services/commissionVoucherService.js`
- `shared/commissionVoucherRelease.js` (new)
- `shared/propertySummaryFields.js` (new)

Tests:
- `server/test/property-summary-payment-voucher.test.js` (new)
- `server/test/export-voucher-update.test.js`
- `server/integration/company-reporting.test.js`

Use the existing server/client development commands and MongoDB configuration. No seed or database reset is required. Restart server and client after obtaining the approved source changes.
