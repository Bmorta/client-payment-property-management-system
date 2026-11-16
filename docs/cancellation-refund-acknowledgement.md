# Final Cancellation Settlement and Acknowledgement

## What changed

Previously the client-facing document used payment completion to decide whether it could use final wording. There was no distinct signed-agreement verification record. The agreement, legally effective contract closure and refund payment completion are now separate states on the existing CancellationCase.

- **Agreement:** Not verified / Finalized. Finalization requires administrator verification of both signatures, voluntary property-rights provisions, the actual signing date/place, a signed-copy record/reference and the reviewing Philippine legal professional/reference.
- **Contract:** Pending legal closure / Closed-Cancelled. The existing final-cancellation transaction remains responsible for closing only the specified source contracts, applying approved credits, synchronizing client status and holding the lots unavailable.
- **Refund:** Unpaid / Partially Paid / Paid, derived from the actual release ledger and approved payable. Signing never changes refundPaidCents or records a cash movement.

No new cancellation case, refund ledger, per-installment acknowledgement or approval system was created. Admin Reviews & Approvals opens the same Cancellation Workspace and shows agreement status alongside the existing pending legal-closure review. Closed cases remain in history with their remaining refund amount.

## Office workflow

1. Open the client accounts, then **Cancellations, Payment Credits & Refunds → Prepare Partial / Full Cancellation**.
2. Select the source contracts and review eligible principal/DP, refund percentage, gross, monthly outstanding penalties, approved deductions and final net value. This full computation stays in the internal preview/report.
3. Plan a full monetary refund, installment refund, property credit or existing mixed settlement. Complete the existing legal/contract review, prior-disposition reconciliation, commission controls and administrator approval.
4. Open the approved case's **Final Cancellation Settlement and Acknowledgement** panel. Enter the actual signing date/place and preview the one document. Print Office and Client copies on one 8.5 × 13-inch sheet.
5. Have both parties sign during the office visit. An administrator records the signed-copy evidence/reference and Philippine legal professional's review, checks the required confirmations, reviews and finalizes the signed agreement. The evidence reference points to the office's retained signed original; REMS does not claim to digitally authenticate signatures.
6. Use **Legal Contract Closure & Credit Posting** to review legally effective cancellation and receiving-account amendments. Where lawful, this closes the contract while approved refund installments remain unpaid. The source lot stays UNAVAILABLE / PENDING until the existing Reopen Lot workflow is separately approved.
7. Record later actual refunds in **Record Actual Refund Release**. Existing transaction, request-ID, amount ceiling, funding and version checks apply. The live case ledger and financial reports update; the signed agreement does not change and no additional cancellation signature is required.
8. Reprints use the preserved verified document under the same RFACK reference, including the company identity and figures recorded as of its signing date. Later releases and posted credits are visible in the separate live internal ledger; the original signed document is not rewritten as though it had been signed again.

## Document content and printing

Each copy contains company/client identity, the specified contracts and properties, cancellation reason, conditional property-rights release/resale provisions, and an explicit preservation of the client's refund rights. Personal-reason/no-company-fault wording appears only when the original approved terms contain the client's factual voluntary confirmation.

The **Refund Settlement Summary** is below the declaration and above the signatures. It includes approved percentages and final net amount; only relevant monetary/installment/property-credit tables appear. A monetary release shows its actual date/method/reference. Installments distinguish amounts paid from remaining obligations. Credits identify the receiving contract/property and actual application date if posted by signing; otherwise they are expressly reserved and not cash received. Mixed settlements show both applicable components.

Original client payment totals, receipt history and gross-before-deduction figures are excluded from the document projection. Free-form internal disposition notes are not copied into the client document. The internal computation/report preserves them.

The layout uses two fixed half-page copies with Office/Client labels and signature blocks. Print Preview precedes printing. The print action checks both vertical and horizontal overflow and blocks incomplete output instead of clipping terms, tables or signatures. Extremely long schedules or numerous source properties may not fit twice on one physical sheet; no financial term is changed or obligation omitted to force it to fit. Physical print acceptance still needs testing on the office printer.

## Legal-effectiveness and reopening safeguards

Agreement finality does not establish statutory cancellation or resale permission. The existing source-by-source reviewed legal basis and minimum entitlement remain authoritative inputs requiring professional review. If R.A. 6552 applies, the reviewed statutory cash minimum must actually be released, in addition to the reviewed notice/clearance requirements, before legal closure. An approved refund above that required minimum can remain a continuing company obligation. The software does not determine a lawyer's conclusion or invent a waiver of mandatory rights.

Reference: Republic Act No. 6552, Sections 3–7, Supreme Court E-Library: https://elibrary.judiciary.gov.ph/thebookshelf//showdocs/2/1688 . The draft provisions require Philippine legal professional review for the particular transaction; they are not a certification of legal enforceability.

Reopen Lot additionally requires administrator confirmation that resale is legally permitted and a recorded legal-resale clearance reference. Existing occupied-lot, contract-history, inventory-state and atomic-update checks remain in effect. Signing alone never makes the property Available.

## Integrity and compatibility

- The signed document is stored once on the existing case, with its content hash, administrator, timestamp, signing details and evidence references.
- Verification uses a fresh server document token, MongoDB transaction, optimistic version check and case-scoped request identity. Duplicate/replayed or concurrent approvals cannot create another signed agreement.
- A financial or company change after preview requires a fresh review before verification. Backdated signing excludes later-dated releases from the signed document but leaves the live ledger untouched.
- Receiving property identities and credit amounts cannot be substituted after signing. Existing finalization/credit-posting and refund-release idempotency remains intact.
- Historical cases are not silently labelled signed or rewritten. A previously closed case may have its actual signed agreement verified; existing payments, commissions, receipts and source snapshots are preserved.
- No schema index migration or new mandatory backup is introduced. Ordinary scheduled backups are unchanged.

## Changed components

- Existing CancellationWorkspace and RefundAcknowledgementPanel: agreement preview, signing evidence, confirmation, separate state/balance display and preserved reprints.
- Existing cancellationService/controller/finance routes and CancellationCase model: signed verification, document preservation and legal-closure checks.
- shared/refundAcknowledgement.js and shared/cancellationAgreement.js: client-safe document projection, document layout and state/verification validation.
- Existing cancellationReport, Admin Reviews projection, CancelledPropertyRelease and forfeiture controller: audit visibility and separate resale clearance.

## Validation

- Server suite: **469 passed, 29 skipped, 0 failed**.
- Client production build passed; the existing large-bundle warning remains.
- Eight new unit/mocked-transaction tests cover unpaid agreement finalization, administrator/signature/legal evidence requirements, replay/concurrent verification, stale previews, preserved reprints, lawful closure with a remaining refund after the reviewed statutory minimum, statutory blocking, table order/method selection, identical substantive copies, privacy and backdated signing.
- DOM checks passed for preview-before-verification, explicit administrator confirmation, signed evidence submission, absence of fabricated payout/closure calls and preserved reprint access.
- The opt-in disposable MongoDB cancellation integration scenario was updated for signed verification and restricted inventory. It was not run: no disposable replica-set test URI is available. The skipped real integration tests are not claimed as passing.
- Visual browser/zoom and physical printing remain local acceptance checks; DOM tests do not certify layout fit or legal validity.

No production records were changed. Nothing was committed, pushed, merged or deployed for this update.
