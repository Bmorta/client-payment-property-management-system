# Transfer, payment entry and map printing update

## Findings and corrections

| Area | Finding | Severity | Correction | Verification |
|---|---|---|---|---|
| Transferred contract agreement edits | Rebuilding from full TCP could finance transferred credit again. | High | Shared credit-aware schedule builder; policy-only edits preserve exact installments and centavo rounding. | Unit and ledger regression tests passed. |
| Transfer approval | Preview and persisted document needed an explicit reconciliation check. | High | Shared transfer calculation plus validation of the typed replacement document against the approved schedule inside the transaction. | Calculation tests passed; live MongoDB transaction unverified. |
| Initial penalty setup | Users had to leave payment entry and approve a separate form. | Medium | Initial basis or missing terms appear inside the selected property payment form; the payment preview includes the proposed policy. Policy and payment use one version-checked account update. Existing multi-property transaction safeguards remain. | Policy validation and payment preview tests passed; live posting unverified. |
| Acknowledgement dismissal | Success and transaction state remained visible. | Medium | Close/Escape clears entry, preview, receipt, remarks, allocations, request snapshot and success message. Posting identity safeguards remain in place. | Frontend build passed; browser interaction unverified. |
| Transfer defaults | Empty date fields required avoidable re-entry. | Medium | Defaults use verified principal and the unpaid/partial installment schedule as of the effective date; completed advance-covered installments are skipped. | Date and schedule unit tests passed. |
| Transfer placement | Action was below account details. | Medium | Single existing transfer component is above account details alongside schedule printing. Existing role/lifecycle guards remain. | Source/build verified; visual placement unverified. |
| Property map | Thumbnail and action groups were left aligned and could wrap inconsistently. | Medium | Centered thumbnail and responsive, centered action groups. | Frontend build passed; visual layouts unverified. |
| Map printing | No annotation tools. | Medium | Text, multiline descriptions, freehand, lines, arrows, rectangles, circles, highlights, colors, text alignment, font size, move/resize, selection, undo/redo and clear. Original upload unchanged. | Serialization/escaping and print coordinate tests passed; rendered printing unverified. |

## Schedule integrity

The contract price stays the agreed total. The collectible schedule totals that price less approved noncash transfer credit. Credit is allocated to the agreed DP first and to installment principal next, once only. Interest and fees remain explicit agreed amounts; no new interest formula was introduced.

A policy-only edit preserves the saved schedule rather than redistributing rounding. If the saved schedule already fails to reconcile, the update stops for review; this change does not silently repair existing records. An ordinary agreement edit cannot redistribute previously approved DP credits. That requires a reviewed contract amendment.

The server and browser use the same transfer installment calculator. The server rechecks actual payment history, credit eligibility, transaction conditions and the approval token before posting. A typed replacement document must still match the approved schedule before it is inserted. No transfer was executed against a real database in this environment.

## Payment approval

Initial policy inputs remain draft during typing and preview. Only an administrator can approve initial settings. Existing policy changes continue through the existing separate policy workflow. The initial settings are included in the payment submission hash and preview token, then saved alongside the payment and audit event with the existing account version check. A retry of a completed submission continues to return the existing payment.

Acknowledgement dismissal resets the entry form. Printing does not post another payment. Saved payment histories remain the place to reprint after dismissal.

## Annotation behavior

Annotations exist only for the current print session and are discarded when its preview closes. No image replacement or property-data write occurs. Coordinates are independent of editor zoom and use the same overlay in one-sheet and tiled output. All existing paper sizes, portrait/landscape choices and map-only/project-details options remain.

## Modified files for this update

- `shared/agreementSchedule.js` (new)
- `shared/transferSchedule.js` (new)
- `shared/initialPaymentPolicy.js` (new)
- `server/src/controllers/financeController.js`
- `server/src/controllers/paymentIntentController.js`
- `server/src/services/lotTransferService.js`
- `server/test/transfer-schedule-integrity.test.js` (new)
- `client/src/components/AgreementEditor.jsx`
- `client/src/components/ContractTerms.jsx`
- `client/src/components/PaymentEstimate.jsx`
- `client/src/components/ClientAccounts.jsx`
- `client/src/components/LotTransfer.jsx`
- `client/src/components/PropertyPaymentCheckout.jsx`
- `client/src/components/PropertyPaymentDetails.jsx`
- `client/src/pages/PaymentPage.jsx`
- `client/src/components/ProjectMap.jsx`
- `client/src/components/MapPrintPreview.jsx`
- `client/src/components/MapAnnotationEditor.jsx` (new)
- `client/src/utils/mapAnnotations.js` (new)
- `client/src/utils/printProjectMap.js`
- This report.

## Verification

- `node --test server/test/*.test.js`: 340 passed, 0 failed.
- `npm --prefix client run build`: passed. Existing bundle-size warning remains.
- `git diff --check`: passed.
- Real database writes, duplicate/concurrent submissions and Windows service execution: unverified here.
- Browser, responsive widths, Light/Dark Mode, screenshots and physical paper printing: unverified. The connected browser was unavailable; the fallback browser could not reach the local application.

## Office verification before release

Use a separate test database. Compare the reviewed replacement schedule with the reopened account, ledger and printed schedule for a partial installment, advance payments, large amounts, DP credit below/above the agreed DP and month-end dates. Edit only the penalty policy and confirm the installment amounts remain identical. Verify that a deliberately inconsistent schedule is blocked.

For payments, test both missing monitoring terms and pending basis selection. Review charges, defer/pay penalties, confirm once, close the acknowledgement, and verify the empty entry state and single saved payment. Retry a completed submission and verify that no duplicate is created. Test simultaneous approvals and stale previews on MongoDB with transaction support.

For maps, test every drawing tool, multiline text, keyboard selection/position controls, undo/redo, zoom, move/resize, both themes and narrow screens. Compare annotations in single-sheet and four-sheet previews, then print on the selected paper. The original map must remain unchanged after closing.

No database migration, commit, push, merge or deployment was performed for this update. Earlier unfinished work remains in the workspace.
