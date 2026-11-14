# Individual penalty recalculation approval

## Root cause and change

The recalculation controller previously called `createRestorePoint` for every request, even a single property account. That copied all non-system collections to financial-backup storage before approval and could block ordinary account reconciliation on filesystem permissions or verification failure.

An explicit single-account scope now uses an administrator reason, a server preview and confirmation, MongoDB transaction support, optimistic account versions, preserved original/recalculated assessments, per-installment comparisons and embedded audit history. It does not invoke restore-point creation, enumerate backup collections or request a database backup. Existing payment, receipt, waiver and imported penalty source arrays remain intact. Request IDs and signatures prevent repeat posting or reuse for different proposals. Transaction errors roll back the recalculation, monitoring, commission effects and embedded audit changes together.

Client-wide and all-account scopes are classified as bulk even if the filter matches one account. They require an existing eligible recovery-verified database backup through the centralized backup service, checked inside the transaction for integrity, environment and protected-data freshness. They do not silently create another backup. Major migration and setup/update protections were not changed.

The scheduled backup implementation and schedule settings are unchanged. Scheduling remains independent of recalculation approval. Existing consistency pauses used by the backup job itself were not redesigned in this task.

## Interface

1. Choose This Property Account for an individual correction, or a bulk client/all scope.
2. Enter a reason of 5–500 characters.
3. Select Recalculate Penalties — Preview.
4. Inspect original/recalculated assessed, paid, waived and outstanding totals, signed differences, installment comparison, allocation changes and warnings.
5. For a bulk scope only, select an eligible recovery-verified backup. Prepare one through Database and Backups if none exists.
6. Select Approve Current Overdue Rule, review the administrator confirmation and choose Confirm and Apply.
7. Check the updated account and history. After an uncertain result, preserve the same request identity and retry or inspect the account before generating a new proposal.

Only eligible active accounts are selectable. Closed or cancellation-reserved accounts are excluded. Existing unsafe payment-allocation and excess-waiver checks still block approval. Standalone MongoDB remains insufficient; administrator approval does not bypass the transaction requirement. This flow preserves the existing conversion to CURRENT_OVERDUE and does not change penalty formulas.

## Validation

- 53 targeted controller and calculation tests passed, including individual success without backup storage, preserved history, idempotency, request collision, stale preview, staff denial, missing reason/confirmation, failed-write rollback, bulk backup requirement with one match and standalone refusal.
- Frontend production build passed with the existing bundle-size advisory.
- The database-gated HTTP regression was updated for the reason field and absence of an individual restore-point file. It requires a disposable MongoDB URI and was not executed against an office database.
- No live office data, MongoDB setup, scheduled backup configuration or installed release was changed. No commit, push or deployment was performed.
