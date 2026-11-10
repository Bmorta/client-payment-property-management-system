# REMS Windows Setup Assistant

## Status

This is an **initial setup implementation awaiting actual Windows acceptance**. Cross-platform configuration tests, disposable MongoDB tests and PowerShell parsing are not proof of Windows installation, service startup or reboot behavior. Do not roll this out to an office production database before Windows acceptance.

The downloadable bootstrap is a ZIP. The guided assistant is launched by double-clicking **REMS Setup.cmd**. A native Inno Setup EXE build definition is included; compiling and testing that EXE requires Windows. No native EXE or code-signing certificate is claimed to have been produced here.

## Existing Acer development computer — first Windows test

1. Extract the entire bootstrap ZIP to a normal local folder. Keep the folder structure intact; do not run files inside the ZIP.
2. Keep the existing project and its `.env` file. Do not rename, delete or recreate the database.
3. Double-click **REMS Setup.cmd**. Choose **Set up Office Server**, then approve Windows administrator elevation.
4. Browse to the existing project's **server\.env**. This is how setup reads the database name; do not enter a guessed name or leave this blank on an existing installation. Existing username/password accounts stay unchanged.
5. Leave the MongoDB service name blank if there is only one MongoDB service. If there are several, enter the exact service name for this database.
6. Choose the application port (normally 5000). Enable private-subnet access only if other office devices will connect. Windows must classify that network as Private for the restricted firewall rule to apply.
7. Read vendor license information. Select **Review & prepare server**. Inspect the selected database/service/data path before approving the separate database-service repair. Setup may request approval to stop the known development backend process and grant its service access to private backup folders. Close external database writers before approving repair.
8. The assistant preserves the existing database, creates a stopped/hash-checked data recovery copy if conversion is needed, prepares a single-node replica set and tests an actual rollback. If already transaction-ready, no conversion/recovery copy repeats.
9. If the result is **NEEDS_DATABASE_REVIEW**, follow the existing **Database & Backups** preview and approval process. Index conflicts and historical migrations are not silently approved. Setup does not claim READY when required index definitions are missing.
10. Use the new **REMS** desktop shortcut for the production frontend. Do not also start the old development backend against this same database/port. Development on an independent computer requires its own initial setup; Git does not synchronize databases.
11. Restart Windows. Check **REMS Setup and Status**, sign in, and retry a Lot Transfer **preview** first. Review the result before approving a real transfer. Send the setup status or failure text if any step stops; never reset MongoDB to continue.

An existing database with secured MongoDB/authentication/TLS, remote topology, multiple ambiguous services, custom service command-line overrides, non-loopback MongoDB binding, linked data directories or unsupported permissions is deliberately sent for review. The assistant will not guess its way through those cases.

## New office server

Leave the existing-environment field blank only on a genuinely new server with no MongoDB Windows service and no listener on port 27017. Enter a new administrator username, email and password of at least 12 characters. New secrets are generated, not reused from examples. Existing data is never substituted with a new empty database.

Fresh packaged MongoDB installation is limited to supported 64-bit Windows 11 / Windows Server 2022 or later systems; actual vendor compatibility must be checked for the deployment. Existing MongoDB versions are preserved and are not automatically upgraded. Node.js, Database Tools, Microsoft runtime prerequisites and WinSW use reviewed download pins in `downloads.json`.

## Other office computers

Choose **Connect to Office Server**, enter its private-network address, and select **Test connection**. Only a compatible REMS product/version/protocol enables shortcut creation. This mode installs no MongoDB and does not create or copy a database. Server discovery by network scanning is not implemented; use the address displayed in the server's setup report. Reserve the server's IP address in the router if practical.

## Files and services

- Persistent state/configuration: `%ProgramData%\REMS` (administrator/System controlled).
- Backend: managed `REMSOffice` service, running as LocalService, with MongoDB service dependency and bounded restart policy.
- New MongoDB service: `REMSMongo`, bound to loopback. Existing MongoDB service and data directory are retained.
- Application code: separate release directories; previous releases are retained.
- Configuration/secrets: protected `config\server.env`; old config copies are retained during updates. Existing signing secret/database name are preserved.
- Logs: `logs` for the backend service; `setup-last.log` for setup progress.
- Existing backup and financial restore-point directories: preserved, including resolving their original working-directory defaults before service installation. Service storage permissions require explicit setup approval.
- Offline conversion recovery files: protected `setup-recovery`; minimal readable summaries in `setup-history` appear in the existing Database & Backups screen. They are hash-checked cold copies, **not restore-tested backups**, and cannot authorize a migration.

Routine payments do not acquire a new backup requirement. The one-time stopped-database recovery copy protects an approved OS/database-topology change. Application upgrades never restore database files automatically. Previous application XML/environment are retained for application-only rollback; actual Windows failure/recovery testing remains required.

The setup assistant's native uninstaller removes its extracted assistant package only; it does not remove an office database or managed application release. Full decommissioning is a separate administrator task. Automated retention/deletion of old releases and recovery copies is not implemented.

## Build

From the repository, using an existing developer runtime:

```text
cd client
npm ci
npm run build
cd ../installer
npm ci
npm test
npm run package
```

The generated `installer/output/REMS-Setup-0.1.0-bootstrap.zip` contains approved application source, production frontend and assistant source only. It contains no `.env`, database, backups or application node_modules. Setup installs locked production dependencies on Windows. Internet access is required; a fully offline dependency bundle is not included.

For a native EXE, install Inno Setup 6 from its official publisher on Windows and run `installer/windows/Build-Installer.ps1`. A manually dispatched GitHub Actions workflow also defines that build; it has not been dispatched by this implementation. Build artifacts are unsigned until signed by the publisher. A compiler pass is not installation acceptance.

## Recovery and limits

If setup fails before replica initialization is attempted, it may restore the prior MongoDB configuration and restart the service. After initialization is attempted, it preserves recovery files and requires review; it never copies old database files over the live directory. Follow an approved recovery procedure if restoration is needed.

Do not bypass Windows security warnings or domain policies. Unsupported service/security configurations stop for administrator review. Local private-network HTTP is provided; trusted HTTPS termination, certificate distribution, full offline packaging, code signing and licensing enforcement are not included. Separate companies must retain separate installations/databases. Setup is not database synchronization.

See `docs/windows-setup-implementation.md` in the repository for the audit, modified files, verification results and Windows acceptance checklist.
