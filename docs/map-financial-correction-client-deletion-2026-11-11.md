# Client deletion, saved map overlays and administrator financial correction

Implemented locally on November 11, 2026. No commit, push, deployment or live financial correction was performed for this update.

## Audit findings

| Area | Finding | Severity | Correction | Verification |
|---|---|---|---|---|
| Client List | No client deletion or recovery interface. | Medium | Administrator-only recoverable deletion, Deleted Clients list and restoration. Linked properties/contracts/payment batches/refunds/cancellation history block deletion. | Mocked controller tests passed. Live database/UI unverified. |
| Property Map | Refresh was isolated above the image and actions remained split across rows. | Medium | One centered, responsive toolbar below the centered image, with consistent button sizing. | Production build passed; rendered desktop/mobile/themes unverified. |
| Map annotations | Earlier tools were limited to the open print session. | Medium | Separate saved overlay and immutable version records, with stale-version protection and restoration. | Validation and mocked persistence/controller tests passed. Actual MongoDB writes unverified. |
| Inventory stickers | No manual or linked status stickers. | Medium | SOLD, RESERVED, AVAILABLE, ON HOLD and custom stickers; live linked-lot labels/colors; view-property links. | Resolver, escaping and rotation tests passed; interactions unverified. |
| Historical financial errors | No administrator correction workflow for existing active contracts. | High | Evidence-based automatic/manual/restore preview, preserved allocations, approval, automatic verified recovery point and transactional update. | Calculation/ledger tests passed; real transaction/recovery-point execution unverified. |
| Correction interactions | New corrections could conflict with future payments, advance coverage, commissions and later lifecycle/credit changes. | High | Preserved receipts and paid periods; fresh preview/version checks; commission review hold; updated date and credit-lineage safeguards. | Regression tests passed. Real concurrent transactions unverified. |

## Client deletion

Go to Clients & Contracts → Client List → Delete. Enter a reason, review the named client and confirm. Only administrators can delete or restore. A deleted profile remains stored with the same Client ID, deletion reason, actor and history. It is excluded from ordinary lists and client search. Show Deleted Clients / Restore provides recovery.

Deletion does not cascade. A client linked to a property, contract, payment batch, refund or cancellation case must use Deactivate instead. There is no permanent purge endpoint. Existing client records were not changed during implementation.

## Property map

All existing actions now share the toolbar beneath the map. Edit Stickers / Annotations opens the existing drawing interface directly. The original upload is unchanged.

The editor supports manual and linked stickers, text/multiline text, shapes, freehand, arrows, custom colors, alignment, font size, duplicate, move, resize, rotation, remove, undo and redo. Selection and numeric position/size/rotation controls are available alongside pointer editing. Linked sticker labels and colors resolve from current inventory; they cannot change inventory status. The viewer links linked stickers to property history.

Save Editable Annotations stores image-relative coordinates separately from the image. Earlier committed versions can be restored as a new version. Version evidence is written before the current overlay reference, preventing a failed optimistic update from replacing the current overlay or losing its historical version. Full version drawings are stored separately to avoid rapidly filling MongoDB's per-document limit.

Linked lot status refreshes every 30 seconds while the map is mounted. The print interface refreshes inventory status without replacing an unsaved draft. A changed image version prevents overlays being silently applied or saved against the wrong image. Prior overlays for a different image remain historical and are not automatically restored onto it.

Print layers can include stickers, text/drawings, both, or the original image only. Existing paper sizes, portrait/landscape, fit and tiled layouts remain. SVG text and links are escaped/validated. Printing does not save overlays or alter the original image.

## Financial correction

Correct Financial Values is visible to administrators in client property actions, the transfer interface and agreement editing. Inspect first, choose an option, review the comparison and approve explicitly.

- Automatic uses an available approved transfer, preserved agreement or prior correction as its source. It refuses to invent a source when none exists.
- Manual accepts verified TCP, agreed DP, included interest/fees and verified noncash credits. Remaining principal is derived from these amounts and actual principal payments; it is not an independently contradictory editable balance.
- Restore takes approved values from the selected preserved source and creates a new correction. It does not delete later receipts or replace history with an old database image.

TCP is inclusive of the explicitly entered interest and fees. Credits cannot exceed the approved source evidence. Already paid principal, including partial and advance payments, remains credited exactly once. Remaining installments reconcile exactly to the corrected outstanding principal. The preview exposes changes to the future schedule and remaining term. Already covered advance months cannot be charged again by moving new unpaid installments into those months.

Approval is effective today in Philippine time. This is a prospective correction of the remaining obligation: existing receipts, their allocation evidence and paid portions are frozen. The administrator reviews the remaining dates/term explicitly. Existing unpaid penalties are carried forward, not silently erased, recalculated or added twice. Their existing administrator waiver/reconciliation workflow remains separate. Later payment-policy changes still apply to future corrected installments.

A private verified recovery point is automatically created using the existing restore-point service before the correction update. The database transaction then updates the contract, immutable correction/audit record and affected commission review state together. A changed preview/account version stops approval. A retry with the same submission returns the approved correction; a different payload cannot reuse that identity.

Earned and released commissions are preserved separately. Affected agreements are frozen for earning/release review until the existing Commission Configuration workflow approves their continuation/recalculation. No new payment, expense, payout, refund or cash movement is generated by a financial correction. Original transfer and cancellation evidence remains intact; approved corrections are recognized by subsequent credit-lineage checks.

Closed contracts and closed historical migration records remain protected. Corrections cannot invent missing financial relationships, exceed verified credits, reduce principal below preserved payments/credits, or silently repair an ambiguous/invalid ledger. Such cases show the specific validation conflict and require source reconciliation. Receipts frozen by a correction cannot be edited through the ordinary payment-correction shortcut; use a reviewed follow-up reconciliation.

## Underlying computation investigation

The earlier audit identified an agreement rebuild path that used full TCP without accounting for transferred credit. The previously published shared transfer/agreement calculations address that path and reject inconsistent net schedules. This update adds recovery for existing active records and uses those same shared centavo calculations for remaining schedules.

The actual affected Acer database and its approved transaction evidence were not available here. Therefore the exact cause and extent of that particular saved-record discrepancy are not established, and no claim is made that those records have already been repaired. Use the new preview against the affected contract and verify its approved source before applying any correction.

## Validation

- `node --test server/test/*.test.js`: 358 passed, 0 failed.
- `npm --prefix client run build`: passed; existing bundle-size warning remains.
- `git diff --check`: passed.
- Tests cover correction/reopen serialization, exact allocations, partial and advance payments, centavo rounding, transfer credits, retained penalties, subsequent policy changes, multiple agents, preserved releases, fully covered principal, repeated corrections, source validation, rejected contradictions, recoverable deletion, linked-data protection, overlay version ordering, stale saves, restoration, sticker status resolution and safe markup.
- Tests use pure calculations and mocked controller/model operations. Actual MongoDB persistence, rollback, concurrent approvals and recovery-file execution remain unverified.
- Browser access was unavailable in this workspace. Responsive widths, Light/Dark Mode, pointer/keyboard interactions, screenshots, print preview rendering and physical printing remain unverified.
- Windows service/installer execution was not tested. No new backup requirement was added to ordinary office transactions, deletion or map editing.

## Files in this update

- `client/src/components/AgreementEditor.jsx`
- `client/src/components/ClientAccounts.jsx`
- `client/src/components/FinancialCorrection.jsx`
- `client/src/components/LotTransfer.jsx`
- `client/src/components/MapAnnotationEditor.jsx`
- `client/src/components/MapPrintPreview.jsx`
- `client/src/components/ProjectMap.jsx`
- `client/src/pages/ClientsPage.jsx`
- `client/src/styles.css`
- `client/src/utils/mapAnnotations.js`
- `server/src/controllers/clientController.js`
- `server/src/controllers/clientSearchController.js`
- `server/src/controllers/commissionContinuationController.js`
- `server/src/controllers/financialCorrectionController.js`
- `server/src/controllers/mapOverlayController.js`
- `server/src/middleware/accountLifecycleGuard.js`
- `server/src/models/Client.js`
- `server/src/models/MapOverlay.js`
- `server/src/models/MapOverlayVersion.js`
- `server/src/models/PropertyAssignment.js`
- `server/src/routes/clientRoutes.js`
- `server/src/routes/financeRoutes.js`
- `server/src/routes/projectRoutes.js`
- `server/src/services/creditLineageService.js`
- `server/src/services/forfeitureService.js`
- `server/src/services/lotTransferService.js`
- `server/src/utils/accounting.js`
- `server/src/utils/amendedLedger.js`
- `server/src/utils/cancellationMath.js`
- `server/src/utils/commissionHold.js`
- `server/src/utils/commissionLedger.js`
- `server/src/utils/contractMonitoring.js`
- `server/src/utils/financialCorrectionLedger.js`
- `server/src/utils/financialCorrectionPlan.js`
- `server/test/client-deletion.test.js`
- `server/test/financial-correction.test.js`
- `server/test/map-overlay.test.js`
- `shared/mapOverlay.js`
- This report.

Earlier unfinished work remains in the workspace. No historical financial records were deleted or corrected by running these tests.
