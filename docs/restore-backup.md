# Restore Backup

From **Administration → Database & Backups → Restore Backup**, select a recovery-verified source backup. If it is only file-verified, use Verify recovery in the backup list first.

1. Stop other database writers, select the source and preview the current and restored document counts.
2. Create a separate pre-restore safety backup, then verify its recovery. Ordinary requests and background writes remain paused during maintenance preparation; cancel preparation if you need to resume operations.
3. Review the final scope, type the connected database name and `RESTORE REMS DATA`, enter the current administrator password, and confirm.
4. Confirm the success audit reference and refresh office browser tabs.

The transaction replaces operational records and linked company/migration configuration, including embedded financial records. It preserves current user accounts, audit history, sequence counters, administration guard and installation/schema metadata. Backup files are retained. It does not restore external filesystem attachments or change live indexes. A backup from another database/environment or an incompatible collection/index schema is blocked. If a recovery copy no longer matches the verified backup, repeat its isolated recovery verification. A stale safety backup must be recreated.

Test first with a disposable local replica-set database. The automated integration test in `server/integration/system-reset.test.js` includes reset followed by restore and requires a local `REMS_RESET_TEST_URI` and MongoDB Database Tools. Never point the test at the office database.
