# Database readiness root-cause audit

## Findings before changes

| Area | Actual cause | Classification |
|---|---|---|
| Different computers | Each local MongoDB service/database has its own topology and indexes. Git updates code, not MongoDB service configuration or stored records. | Real environment requirement; use one office server with client-connect mode. |
| Transactions | `hello.setName` was checked independently in workflows; standalone MongoDB on Acer cannot run atomic transfers. | Real requirement; never bypass it or substitute a backup. |
| Active-contract index | Old global unique property index prevents retaining an old contract while creating its replacement. Missing lifecycle fields also require reviewed backfill. | Real one-time schema maintenance. |
| Equivalent indexes | Workflow/name checks and installer comparison differed; an equivalent custom-name/`$eq` index could be reported missing. Automatic development indexing could also attempt a duplicate named index. | Incorrect/redundant schema detection. |
| Startup | Only part of contract readiness was inspected; development automatic indexing could mutate an existing schema before review. No verified expected-version registry existed. | Incomplete startup verification. |
| Dashboard | Stored installation report could still show missing indexes after a successful database repair. | Stale completion evidence, not a fresh database check. |
| Backups | Transfer, forfeiture, cancellation, reactivation/reopening, payments and commission operations do not call `assertEligibleBackup` directly. Index-upgrade guidance sends users to the same screen that contains backup creation, making one-time maintenance appear to be a per-operation backup requirement. | Guidance/maintenance coupling; no routine backup guard to remove in these services. |
| Higher-risk work | Identifier bulk changes, full historical activation and populated schema maintenance require verified backups. Penalty bulk recalculation/simple historical activation create their existing automatic restore points. | Legitimate maintenance safeguards retained. |
| Backup freshness | Verifying schema metadata must not invalidate an otherwise matching backup of protected records. | Exclude only the new nonfinancial readiness observation collection; all financial protections retained. |

## Correction boundaries

Fresh inspection is authoritative. Stored schema version and installer reports cannot declare a damaged database Ready. Routine contract-changing operations inspect live transaction support and actual contract constraints, with no backup dependency. Schema repair is a separate administrator-approved action. Conflicting contracts/index definitions are displayed, never automatically deleted or merged. Populated maintenance retains the existing centralized recovery-verified backup requirement. Fresh installation creates required structures only through the approved installer/setup workflow. Startup does not execute migrations or create/drop business indexes.

No actual office database or Windows service is available here. Office topology/conflicts remain unverified until the administrator opens the current health screen on that server. All execution tests must use disposable databases.
