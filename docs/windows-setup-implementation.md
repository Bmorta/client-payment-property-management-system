# Windows setup implementation and acceptance — 10 November 2026

## Why Acer still needed configuration

Git updated application code but not the MongoDB Windows service. Lot Transfer correctly checked the connected server's `hello` response and refused multi-document work on a standalone server. The previous setup helper was pinned to one specific MongoDB 9.0 installation. The backend had no production frontend hosting, no managed Windows service or client connection assistant. The Database & Backups screen inspected readiness and protected migrations; it could not elevate a web request into a safe Windows-service installation.

The new assistant prepares the local Windows host through explicit OS-administrator approval. It does not remove transaction or active-contract uniqueness checks from the application.

## Architecture and workflow

- Entry: double-click `REMS Setup.cmd`, or the Inno Setup Assistant package when compiled on Windows.
- Office Server: elevation; package consistency check; pinned runtime/dependencies; separate production release; existing-environment/service inspection; explicit repair review; stopped/hash-checked recovery copy only if topology initialization is needed; replica initialization and real rollback verification; index inspection; managed backend startup; HTTP identity verification; desktop shortcuts and readiness report.
- Existing `.env` supplies the actual database name and signing secret. Missing environments do not trigger an empty replacement database when a MongoDB service already exists. Explicit custom backup/tool locations are retained. Original working-directory defaults are resolved before moving execution to a service.
- New database: permitted only for a fresh installation; schema indexes initialized only when the selected database has no existing non-system collections. First administrator created only if no users exist. Existing users/credentials are not reset.
- Client mode: private origin / trusted HTTPS input, compatible product/version/protocol check, shortcut. No MongoDB/client-side ledger is installed. Automatic network discovery is not included.
- Existing database: inspections report actual missing index definitions and conflicts. No legacy index is dropped and no historical document is backfilled by the assistant. The existing approved upgrade now skips creating a duplicate index when equivalent active-contract protection already exists. The existing Database & Backups preview/backup/recovery/approval flow remains authoritative for its supported migrations. Other missing index types require separately reviewed maintenance; a generic repair for those is not implemented.
- Managed application: pinned Node runtime, WinSW 2.12.0 LocalService account, automatic delayed startup, MongoDB service dependency, bounded restart policy, log rotation and application-only rollback. Backend boot waits for MongoDB in managed mode. Previous code/configuration is retained; database files are never automatically restored.
- Same-origin production frontend: backend serves compiled `client/dist` and existing API. Production frontend defaults to `/api`; development retains its existing localhost URL. Static serving is constrained to compiled assets/branding/index; unknown API paths remain JSON errors. Private environment files are not served.
- Restricted office access: opt-in Private-profile/LocalSubnet firewall rule on the application port. MongoDB remains loopback-only. Domain/firewall policies and unsupported topologies are not bypassed.
- One global setup mutex prevents simultaneous Office Server assistants. A source checkout is built for production; packaged files are hash-checked. Unsigned manifests establish file consistency, not publisher authenticity.

## Existing modules reused

| Existing function | Integration | Preserved safeguard |
|---|---|---|
| Active-contract index inspection | Reused by setup helper | Read-only conflicts/definitions; no automatic migration |
| Database & Backups | Adds application/runtime/setup status to the same screen | ADMIN authorization and existing migration approval |
| Native managed backups | Existing directories and explicit tool paths retained; missing Database Tools are installed from a pinned archive | No backup eligibility rule bypass |
| Financial restore points | Existing explicit/default storage resolved and preserved | Transaction-linked restore points still required for their existing operations |
| Offline replica preparation | Generalized review/cold-copy/rollback approach in the desktop assistant | Data directory preserved; only approved config edit; no restore after uncertain initialization |
| Payments, penalties, commissions, transfers, cancellations and refunds | No formula or business-rule change | Existing actual-payment, transaction, approval and uniqueness guards remain |
| Frontend, branding and per-user theme | Existing production build and REMS ICO reused | No redesign or removed navigation |

## Recovery classification

Cold recovery copies contain the stopped database files, original MongoDB configuration and original environment, with per-file SHA-256 checks. They are not falsely marked restore-tested. Minimal non-secret summaries appear in the existing Database & Backups screen; full data/secrets remain protected locally. They cannot satisfy `RECOVERY_VERIFIED` migration requirements. No second online backup service or restore endpoint was introduced.

Application-service rollback restores the prior XML/environment before restarting the prior application. It does not reverse database transactions or restore historical records. This Windows failure path still requires real Windows acceptance.

## Verification completed in this environment

- **6 setup configuration tests passed:** existing name/credential/options/config preservation; repeat setup; remote/security/ambiguous input refusal; environment preservation; safe client origins/protocol compatibility; semantically equivalent index recognition.
- Disposable **standalone database** scenario passed: inspect reports unavailable transactions; verification refuses; existing-database initialization refuses; original receipt/data and collection counts preserved.
- Disposable **replica-set database** scenario passed: all current model indexes initialized on empty database; true abort/rollback verified; temporary test collection removed; initial administrator created once; repeat initialization/admin reset refused.
- Actual uninitialized replica-set scenario passed: initialized once, elected primary, verified rollback, repeated safely and refused a different set name.
- Existing Lot Transfer/index regression integrations passed in standalone and replica modes (3 tests in each mode).
- Production HTTP scenario passed: public REMS identity/protocol, same-origin application routes, JSON API 404s, and refusal to serve environment/unknown asset files.
- Existing backend regression suite: **308 discovered, 282 passed, 0 failed, 26 environment-gated skipped**. Environment-gated database integrations are not claimed passed merely because discovery skipped them.
- PowerShell scripts parsed and the engine definitions loaded with Linux PowerShell. **This is syntax/loading verification only, not a Windows installation test.**
- Frontend production build passed; existing large-bundle warning remains.
- ZIP manifest/content checks verify packaging excludes `.env`, database files, backups, application node_modules and unrelated scratch fixtures.

## Not yet verified / incomplete

**No Windows installation has been executed here.** Fresh install, Acer's existing MongoDB service, actual UAC/WinForms behavior, native dependencies, service account/ACLs, firewall, reboot/autostart, interruption/rollback, reinstall and 2–5 office-device workflows require Windows acceptance.

The native Inno Setup EXE has source/build instructions and a manual Windows build workflow but is not claimed compiled or signed here. The bootstrap ZIP is the available initial package. No workflow was dispatched. Trusted HTTPS/certificate rollout, full offline dependency packaging, automatic discovery, automated retention/decommissioning, source code obfuscation and licensing enforcement are not included.

This initial assistant is suitable for the next **development-machine acceptance step**, not a claim of production certification. Unsupported or uncertain states stop for administrator review rather than bypass validation.

## Next steps on Acer

1. Use the extracted bootstrap ZIP on Acer's development installation. Do not delete its existing project or MongoDB directory.
2. Launch `REMS Setup.cmd`; choose Office Server and select the existing `server\.env`. Read the exact service/data-path review before allowing repair.
3. If transaction checks pass but existing indexes need review, complete the existing Database & Backups reviewed maintenance. The assistant does not auto-approve it.
4. Use the new REMS shortcut; test login and a Lot Transfer preview. Approval of a real transfer remains a separate financial/inventory decision.
5. Reboot Acer and verify service startup. Connect another office device using the displayed server address only after enabling private-subnet access.
6. Capture the setup report/status or exact failure text. No database reset or manual guessed connection-string edit is necessary to investigate it.

## Build and source

Read `installer/README.md` for developer build steps, vendor licenses, source ZIP and native EXE compilation. Read `installer/THIRD-PARTY.md` before accepting local component installation. Downloads are pinned in `installer/downloads.json` and package integrity entries in `package-manifest.json`.

No commit, push, merge, deployment, real database migration, service restart or office-machine configuration was executed during implementation.

## Modified files

Existing: `.gitignore`; new `client/package-lock.json` pins the currently installed frontend dependency graph; `server/src/app.js`; `server/src/server.js`; `server/src/services/databaseMaintenance.js`; `server/src/services/activeContractUpgrade.js`; `client/src/services/api.js`; `client/src/pages/DatabaseMaintenancePage.jsx`.

New: `REMS Setup.cmd`; `server/src/services/systemHealth.js`; `server/integration/windows-setup.test.js`; extended `server/integration/lot-transfer.test.js`; `installer/package.json`; `installer/package-lock.json`; `installer/downloads.json`; `installer/lib/setup-core.mjs`; `installer/lib/setup-helper.mjs`; `installer/lib/index-readiness.mjs`; `installer/windows/Setup.ps1`; `installer/windows/Engine.ps1`; `installer/windows/REMS.iss`; `installer/windows/Build-Installer.ps1`; `installer/scripts/package.mjs`; `installer/test/setup-core.test.mjs`; `installer/README.md`; `installer/THIRD-PARTY.md`; `.github/workflows/rems-windows-installer.yml`; this report.


## Database readiness follow-up

The current backend now verifies actual required indexes and transaction capability at startup, records schema version 2 only after successful verification, and offers reviewed missing-index repair in the existing administration screen. Equivalent names/explicit equality partial filters are recognized by the same comparator used by setup. Existing populated database maintenance still requires approval and a recovery-verified backup once for that maintenance; routine transfers and account actions do not. Windows service/reboot acceptance is still not available in this Linux environment.
