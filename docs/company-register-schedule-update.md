# Company management, payment schedules, register and TCP update

This batch follows published commit `bb5fa31` on `feature/property-inventory`. Publication is recorded in Git history on the feature branch; this update does not merge into main. No office database was accessed or migrated.

## Completed behavior

- Individual and bulk client schedule previews/prints show actual contributing payment methods per installment. Mixed partial receipts list distinct methods once; voided contributions do not appear. Unpaid installments show a dash. The last effective payment date remains identified in the legend. Eight columns use full-width tables; long schedules require readable continuation mode, with every row retained on 8.5 × 13-inch portrait paper. Browser Print → Save as PDF includes the same data. There was no separate schedule Excel export to update.
- Reports has a Payment–Commission Register preview, pagination, full-result totals, print and Excel download. Payment Count is immediately after Previous Payment Date and is based on actual principal allocations: Down Payment, repeated ordinals for partial receipts, ranges for advances and explicit penalty/other-only labels. Counts are never derived from transaction quantity.
- Earnings use the existing backend commission engine, full assigned percentages and completed monthly periods; payouts do not change the earning rate. Multiple agents do not duplicate buyer payment amounts. Released/unreleased statuses, actual payouts and recovery balances remain separate. Excel adds Totals and Agent Commission Ledger sheets, numeric currency/percentage/date cells, filters and explanatory notes. Stale previews reject exports.
- Original TCP means the authorized contract selling price before agreed DP. TCP After Down Payment is Original TCP minus agreed DP. Neither is the current outstanding balance. The backend validates integer-centavo amounts. Existing contract schedules already deducted DP correctly; labels and exports now consistently describe that calculation. Existing agreements, corrections and payment/payout history are not rewritten.
- Company Management provides name/about/logo, search/sorting, administrator add/edit/delete/archive/restore, PNG/JPEG/WebP preview, replacement/removal and explicit project associations. Staff/viewers have read-only access. Backend image decoding limits input size/pixels and normalizes logos to PNG while preserving proportions and stripping metadata. Version checks protect edits.
- Projects cannot belong to two companies. Associations are explicit; creating a company does not backfill financial ownership. Removing associations from projects with contracts or expenses is blocked. Companies with project/report references cannot be deleted; archive is offered. Eligible deletion retains an audit tombstone and never cascades to clients, lots or financial records.
- Applicable schedule, inventory/list, collection, expense, commission, monitoring and migration-progress reports use company branding. A single active company can be the default identity. Specific project associations take precedence, including archived companies. Mixed or ambiguous scopes display Multiple / Unassigned Companies rather than the wrong logo. Branding versions referenced by report previews/downloads are retained separately; this records branding use, not proof a paper document was issued. Existing downloaded files are not rewritten by later company edits.

## Commission interpretation

Payouts attach to agent commission periods, not individual buyer receipts. The register attributes net releases to positive earning sources in chronological order **for display only**; it does not create payment/payout allocation records. The separate agent-period sheet records actual gross releases, recoveries, net releases and remaining/recovery balances once per record. A buyer void can leave recovery due even when the original buyer-payment row is excluded. The preview and Excel expose that ledger recovery separately.

The register is a current-agreement restatement as of its end date, not a reconstruction of every former contract version. Original TCP does not mean the first-ever historical agreement snapshot. Contract prices repeated across transaction rows must not be summed.

## Database/dependency changes

- New `Company` collection: generated company ID, name/about, normalized logo, status, explicit unique project references, version and history. No existing project/client/payment records are automatically assigned or altered.
- New `ReportBrandSnapshot` collection: immutable company name/logo/version references used by reports, retained after company changes.
- Existing account responses gain computed TCP fields; existing financial document structures and records remain valid. No seed/reset/data migration is required.
- Added server dependency `sharp` and updated the tracked server lockfile for safe PNG/JPEG/WebP processing. Run `npm --prefix server install` before starting this version on another device.

## How to check

1. Install the new server dependency from the repository root:

   ```powershell
   npm --prefix server install
   ```

2. Start the usual two terminals:

   ```powershell
   npm --prefix server run dev
   ```

   ```powershell
   npm --prefix client run dev
   ```

3. Log in as administrator → Company Management. Add a test company and logo; preview before confirming. Edit/replace/remove the logo, test archive/restore, and test deletion of an unused company. Assign a project explicitly and confirm deletion is then blocked. Other roles should only see view controls.
4. Client → Property Accounts → Print Payment Schedule (or bulk schedules from Clients). Check a period funded by Cash + GCash, an unpaid period and advance-covered periods. Select continuation mode for long schedules. Choose **8.5 × 13 inches** in the printer dialog; printer-driver settings can override page CSS.
5. Reports → select dates/project → Preview Payment–Commission Register. Check Previous Payment Date → Payment Count order, partial receipt ordinals, DP and advance ranges. Download Excel from the preview; compare totals, agent ledger, earnings before any payout and partial releases. Printing uses readable payment blocks with Previous Payment Date, Payment Count, Payment Date and Amount Paid together rather than shrinking all columns across one page.
6. For a PHP 1,000,000 contract and PHP 100,000 agreed DP, verify Original TCP PHP 1,000,000, TCP after DP PHP 900,000 and PHP 25,000 monthly over 36 months. Actual DP collected and current outstanding balances are distinct fields.
7. Check company name/logo in schedule, inventory, collection, expense and commission report output. With multiple companies, choose an explicitly associated project; ambiguous scopes deliberately remain unbranded. Archived project identities remain available.

## Validation and acceptance limits

- Default backend suite: 158 passed, 3 optional HTTP integrations skipped without test URI variables (161 total).
- The company/reporting integration passed separately against disposable MongoDB: role enforcement, WebP normalization, replacement/removal, stale edits, explicit ownership/conflicts, deletion/archiving, versioned branding, mixed payment methods, original/TCP amounts, Excel dates/images/numbers, preview/export matching, unchanged financial records and partial payout reporting.
- Existing payment/commission/property HTTP regression and replica-set historical migration integration passed separately.
- Interface checks passed company field requirements/logo preview/confirmation/read-only roles, register preview-before-download, mixed-method individual/bulk print data and complete 80-row schedules.
- Production build passed with the existing nonfatal bundle-size warning. Actual office printer output, paper scaling and device/browser visual acceptance remain to be checked. No production financial records, payouts or company records were created during development.

## Modified files

- `client/src/App.jsx`
- `client/src/components/CollectionCashReport.jsx`
- `client/src/components/CommissionAgreement.jsx`
- `client/src/components/ExpenseReports.jsx`
- `client/src/components/ListReportActions.jsx`
- `client/src/components/PaymentEstimate.jsx`
- `client/src/components/PaymentSchedulePrint.jsx`
- `client/src/components/PropertyPaymentDetails.jsx`
- `client/src/layouts/AppLayout.jsx`
- `client/src/pages/HistoricalMigrationPage.jsx`
- `client/src/pages/PaymentTransactionsPage.jsx`
- `client/src/pages/ReportsPage.jsx`
- `client/src/utils/printExpenses.js`
- `client/src/utils/printFinancialReport.js`
- `client/src/utils/printPaymentSchedules.js`
- `server/package-lock.json`
- `server/package.json`
- `server/src/app.js`
- `server/src/controllers/collectionReportController.js`
- `server/src/controllers/commissionReportController.js`
- `server/src/controllers/expenseReportController.js`
- `server/src/controllers/financeController.js`
- `server/src/controllers/listReportController.js`
- `server/src/controllers/migrationController.js`
- `server/src/controllers/schedulePrintController.js`
- `server/src/middleware/auditMutation.js`
- `server/src/routes/financeRoutes.js`
- `server/src/utils/accounting.js`
- `server/src/utils/listReport.js`
- `server/src/utils/paymentRegister.js`
- `server/test/payment-register.test.js`

## Added files

- `client/src/components/PaymentCommissionRegister.jsx`
- `client/src/pages/CompaniesPage.jsx`
- `client/src/utils/printPaymentRegister.js`
- `client/src/utils/reportBrand.js`
- `docs/company-register-schedule-update.md`
- `server/integration/company-reporting.test.js`
- `server/src/controllers/companyController.js`
- `server/src/models/Company.js`
- `server/src/models/ReportBrandSnapshot.js`
- `server/src/routes/companyRoutes.js`
- `server/src/services/companyBranding.js`
- `server/test/schedule-methods-tcp.test.js`
- `shared/contractPrice.js`
