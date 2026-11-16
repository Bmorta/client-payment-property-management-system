# System Information and request usability

## Changes

- Added the authenticated System Information route and sidebar item with Overview, Installation, Developer, Version & Updates, Current Features, User Manual and System Specifications tabs.
- Planned Version 1.0.0 is explicitly separate from the running package version. Package versions, tags and deployment state were not changed.
- Administrators see a whitelisted installation DTO from actual setup/runtime metadata. Unknown original installation and last-update dates remain unavailable. Database initialization, startup and setup verification are shown separately. A browser's device installer mode is not guessed. Setup compatibility rules were not weakened.
- The generic user manual is bundled under the frontend public docs and copied into its production build. The technical PDF is bundled under server/src/assets so the existing Windows release copy includes it; an authenticated ADMIN-only route serves it. No external network request or office data is needed to generate/read these PDFs.
- The feature catalog names actual source modules/subfeatures and distinguishes completed implementation, needs-live-testing, partial and missing functionality. Licensing, code signing and offline-prerequisite packaging are not claimed to be ready.
- ClientLookup now normalizes SearchInput's raw client result to its callers' expected `.item` shape while keeping top-level client fields. This was preventing client selection and the subsequent property fetch. The request property loader clears stale results, tracks loading/errors, rejects unrelated contracts and supports multiple active owned properties.
- Property concerns no longer display or require agent fields. Area remains optional and extra notes use Request Description. Legacy notes/history remain preserved.
- Site Tripping now has Agent-initiated and Office-initiated modes. Office mode clears irrelevant agent fields on validation and securely records the authenticated creator's identity. Prospects need no account or contract. Existing site requests default to the historical agent mode without a migration. Scheduling, field personnel, evidence, cancellation, printing, exports and notification history remain on the same records/workflows.
- Removed both main sidebar review-count badges; the category header and item now fit without the count. Pending counts remain inside the Review Center and its notification entry point. Sidebar labels and the information page use responsive wrapping and existing theme variables.

## Verification

447 automated tests passed, 29 optional integration tests skipped. New tests cover the client selection envelope, office prospects without agents/accounts, spoof-resistant initiator identity, agent-free property concerns, installation date honesty, normal-user metadata redaction, planned version labeling and bundled offline PDFs. Existing property ownership/multiple-property, schedule, notification, approval and financial regression checks continue to pass.

The frontend production build and whitespace checks pass. The 5-page manual and 23-page schema-based specification were rendered and inspected; all pages also passed text-bound checks. The PDF generator reuses the existing PDFKit dependency and reads local model definitions without connecting to a database. Rebuild using `node scripts/build-system-docs.mjs` from a checkout with server dependencies; optional REMS_DOCS_FONT / REMS_DOCS_BOLD_FONT paths select documentation fonts.

Actual browser Light/Dark and responsive interaction testing remains unverified because Chromium cannot start under the environment's socket restrictions. No office service or production records were modified. No commit, push, merge, tag or deployment was performed.
