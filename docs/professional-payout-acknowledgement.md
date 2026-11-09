# Professional payout acknowledgement

The existing Payout Management acknowledgement now uses a formal company header, uppercase ACKNOWLEDGEMENT OF PAYMENT title, a prominent PHP amount, stable release-based acknowledgement number, original payment date, payee/category, project/property, method/reference, purpose, remarks and prepared/approved names. It retains identical OFFICE COPY and PAYEE'S COPY halves on 8.5 × 13-inch long bond paper, with a central cutting line.

Each copy has recipient and authorized-representative signature lines, recorded printed names and blank dates for the actual signing date. The payment date remains the recorded release date. Partial payouts print the selected release amount only; printing does not create or update financial transactions.

Company Settings now offers optional Address (400 characters) and Contact Information (240 characters). Enter these once. They flow through the existing branding service into versioned report identity snapshots and acknowledgement headers, alongside the configured name and normalized logo. Older records remain valid and do not need a database migration. Updates preserve omitted fields for older callers and include address/contact values in company audit history. Blank details are omitted rather than fabricated.

The existing Philippine-peso words converter is reused. Payout numeric display uses integer centavos to retain the last centavo even at the maximum safe integer amount; no financial formula or stored value changes. Method labels use the existing shared labels. Text is HTML-escaped and configured PNG logos use the existing safe renderer.

The print layout uses explicit physical page dimensions, table-based metadata and reserved signature areas. Long descriptions use a denser layout. Exceptionally tall content is fitted above signatures in both the preview iframe and print iframe; only presentation dimensions change. Other report layouts and buyer acknowledgement content remain unchanged. Borders and text remain legible without background printing.

## Usage

1. Optionally set the company address/contact once in Administration → Company Settings.
2. Open Financial Management → Payout Management and select an actual, non-voided release.
3. Open its existing Print Acknowledgement preview.
4. Print or Save as PDF using 8.5 × 13-inch paper, 100% scale, with browser headers/footers disabled.

An approval alone is not proof of payout. Existing actual-release and void safeguards are retained.

## Modified files

- `client/src/utils/printAcknowledgements.js`
- `client/src/utils/fitPayoutPrint.js` (new)
- `client/src/utils/printAccountReports.js` (payout fitting hook only)
- `client/src/pages/PayoutsPage.jsx` (preview fitting hook only)
- `client/src/pages/CompaniesPage.jsx` (optional address/contact inputs)
- `server/src/models/Company.js`
- `server/src/models/ReportBrandSnapshot.js`
- `server/src/controllers/companyController.js`
- `server/src/services/companyBranding.js`
- `server/test/office-payout-acknowledgements.test.js`
- `server/integration/company-reporting.test.js`
- This document.

## Validation and limitations

- Focused acknowledgement tests cover identical two-copy content, release IDs, signing dates, methods, escaped long descriptions, unchanged inputs, actual-release/void guards and centavo precision.
- Company integration covers optional company details, branding propagation, immutable earlier identity snapshots, permissions and existing financial/reporting behavior.
- Sample normal and long-name/500-character purpose/500-character remarks documents were rendered and inspected at 612 × 936 PDF points (8.5 × 13 inches), with both copies on one page.
- Presentation fitting is tested separately and applied by the browser preview/print hooks; the server does not alter recorded content.
- Physical Windows printer and browser Save-as-PDF acceptance remain pending. PDF layout checks use a separate rendering engine and do not prove every printer driver's behavior.
- No live financial records, balances, formulas, commissions, penalties or refunds were changed. No commit, push, merge or deployment was performed.

Final checks: backend suite **260 passed, 0 failed, 19 environment-gated skipped**; the company/reporting integration passed separately on disposable MongoDB. The frontend production build passed with its existing bundle-size warning. Both normal and long print fixtures passed the one-page/two-copy, 612 × 936-point, signature-date and exact-centavo PDF checks.
