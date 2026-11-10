# Vendor components and licenses

Read the applicable vendor terms before installing. Selecting the license checkbox in the local wizard is a user action; packaging does not accept an agreement on the user's behalf.

- Node.js portable Windows runtime: https://nodejs.org/en/about/previous-releases and https://github.com/nodejs/node/blob/main/LICENSE
- MongoDB Community Server (fresh server installation only), SSPL: https://www.mongodb.com/legal/licensing/server-side-public-license
- MongoDB Windows supported-platform requirements: https://www.mongodb.com/docs/manual/administration/production-notes/
- Windows Service Wrapper 2.12.0, MIT: https://github.com/winsw/winsw/blob/v2.12.0/LICENSE.txt
- Microsoft Visual C++ Redistributable: https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist
- YAML parser: https://github.com/eemeli/yaml/blob/main/LICENSE
- Inno Setup (native installer build only): https://jrsoftware.org/isinfo.php

Vendor URLs and SHA-256 pins are in `downloads.json`. Node and MongoDB pins were checked against publisher checksum files. The WinSW pin was calculated from the official tagged GitHub release. The Microsoft redistributable additionally requires a valid Microsoft Authenticode signature at installation time.

The bootstrap needs Internet access for pinned vendor downloads and locked npm dependencies. The package is unsigned until a publisher signs its compiled Windows release. Checksums detect inconsistent files; an unsigned checksum manifest does not establish publisher identity by itself. Verify package provenance. No Windows security warning is bypassed by this assistant.
- MongoDB Database Tools (separate pinned official Windows archive): https://www.mongodb.com/docs/database-tools/
