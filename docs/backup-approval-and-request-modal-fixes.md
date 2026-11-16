# Backup approval and request modal repairs

## Findings and changes

- Scheduled monitoring previously checked only `contractReady`. A database with a verified active-contract index but another missing required index could still receive account snapshot/ledger/notification writes between backup verification and approval. Monitoring now waits for complete live readiness; it resumes normally after schema verification.
- Backup/recovery/approval calls now reserve their asynchronous preflight, preventing concurrent submissions from creating duplicate jobs before the existing running-job lock takes effect. Scheduled backups retain the same independent scheduler.
- Backup generation rechecks protected source metrics after dump/file verification. An external change during the copy prevents the job from becoming file-verified.
- Protected metrics compare collection names, counts and checksums directly rather than JSON key insertion order. No financial/business collection was added to the existing workflow-metadata exclusions. Errors name changed collections.
- Approval still re-inspects its plan inside the maintenance lock and validates manifest hashes, server/environment binding, protected data and indexes before schema changes. The redundant second full data scan was removed. Stale-plan preflight failures preserve a still-valid verified backup; actual backup failures or errors after application starts require review.
- The approval page rejects double clicks synchronously and requires the selected backup to remain recovery-verified in the latest status response.
- MongoDB lifecycle backfill transactions and audit history remain intact. MongoDB index DDL is not a single rollbackable transaction; interrupted index changes still require a fresh inspection and verification, never a bypass or automatic financial retry.

## Request modal

`SiteRequestForm` now uses a portal into the document body, avoiding ancestor clipping and containing blocks. Its viewport-bounded flex layout keeps the header and footer separate from the scrolling fields. Cancel, Close, Back/Continue and final Save remain in their corresponding fixed action areas. Short viewport rules reduce padding without hiding fields. Existing validation, fields and saving behavior are preserved.

## Verification

- Backend regression suite: 414 passed, 29 opt-in integration tests skipped, including the dedicated approval regression below.
- Dedicated mocked-driver approval regression: a verified backup and one missing non-contract index repair successfully on the first attempt; subsequent financial drift is rejected.
- Focused tests cover monitoring pause/resume, reordered fingerprints, changed/new/missing financial collections, and concurrent preflight reservation/release.
- Production frontend build and whitespace checks pass.
- A browser harness using the actual component and styles was prepared for desktop/mobile/short viewport checks, but Chromium cannot start in this environment due to socket restrictions. Visual, zoom and keyboard acceptance remain unverified.
- No live office database, MongoDB tools or Windows service was modified. Native dump/restore against a disposable replica set and live browser acceptance remain necessary.
