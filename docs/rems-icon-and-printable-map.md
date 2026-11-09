# REMS icon and printable project map

Status: implemented locally after the commission correction commit `37b7d4da1433118c5860d760d8d3481b90d75a01`. The user has authorized committing and publishing the icon/map changes on `feature/rems-navigation`. No merge, deployment or schema change is included.

## Official icon

The supplied `Glossy REMS Real Estate App Icon(1).png` is used without redesign. Transparent RGBA PNGs at 16, 32, 48, 64, 128, 180, 192, 256 and 512 pixels preserve square proportions. Files live in `client/public/branding`. A multi-resolution `rems.ico` contains 16, 24, 32, 48, 64, 128 and 256-pixel images.

Placements: login, expanded sidebar, collapsed icon rail, browser favicon, Apple touch icon and lazy application loading fallback. Transparent edges remain suitable for the existing light workspace and navy sidebar. No new dark-theme implementation is included. The ICO is ready for future Windows shortcut/installer work; no installer or desktop shortcut is created by this update.

## Print Map

Open a project in Manage Lots or select one on Property Inventory. Print Map sits beside View Map and opens options plus an iframe preview before any print dialog.

- Map Only or Map with Project Details.
- A4 (210 × 297 mm), Letter (8.5 × 11 in), Legal (8.5 × 14 in), Long Bond (8.5 × 13 in).
- Portrait and landscape; wide images default to landscape.
- Fit the complete map to one page, or enlarge it across four numbered sheets (2 × 2).
- Original aspect ratio is always preserved. Each four-sheet quadrant is printed once, preserving the complete source image when assembled.
- Optional project header: configured company associated with that project, project name/location, map title, optional descriptive phase/block label and Philippine timestamp. Company lookup failures block detail printing until retried or Map Only is chosen.
- Print / Save as PDF opens the browser's print dialog only after the preview is ready. Choose the matching paper/orientation, 100% scale and no browser headers/footers there.
- No-map and image-loading errors use the existing centered popup. Existing map viewing, zoom, upload, replacement and deletion remain connected.

Printing reads the saved image. It does not save map labels/options or modify project, lot or financial data. An uploaded raster map has no automatic live lot status overlay or inventory legend. No such overlay is fabricated. Enlarging cannot restore detail absent from the source image.

## Modified/new files

- `client/index.html`
- `client/src/App.jsx`
- `client/src/layouts/AppLayout.jsx`
- `client/src/pages/LoginPage.jsx`
- `client/src/pages/InventoryPage.jsx`
- `client/src/styles.css`
- `client/src/components/ProjectMap.jsx`
- `client/src/components/REMSIcon.jsx` (new)
- `client/src/components/AppLoading.jsx` (new)
- `client/src/components/MapPrintPreview.jsx` (new)
- `client/src/utils/printProjectMap.js` (new)
- `client/public/branding/rems-{16,32,48,64,128,180,192,256,512}.png` (new)
- `client/public/branding/rems.ico` (new)
- `server/test/project-map-print.test.js` (new)
- `server/integration/project-map-print.test.js` (new)
- This document.

## Validation

- Full suite: 247 passed, 16 environment-gated skipped, zero failures.
- Five print-document tests cover every paper/orientation, full image/aspect geometry, escaped optional details and Manila date, all four numbered quadrants, invalid input rejection, non-mutation, and small/extreme wide/tall dimensions.
- Separate disposable MongoDB integration test passed: upload, role permissions, byte-identical read source without writes, replacement/stale-version protection, deletion/history and preserved project/lot data.
- Rendered UI checks passed: options and matched company, wide-map landscape default, long-bond/four-sheet preview, explicit print invocation, no print writes, view/zoom, edit/delete control availability, centered no-map error and icon source.
- Sidebar DOM regressions passed: collapse preferences, category selection, roles, active query matching, mobile drawer Escape and scroll restoration.
- PNG dimensions/alpha and all seven ICO resolutions verified.
- Production build passed with the existing large-chunk advisory.
- All backend/shared source hashes match the state immediately after the published commission correction. No subsequent financial calculation or schema changes were made.

Physical printer output, actual browser Save as PDF, browser-tab icon appearance and real-device responsive acceptance remain to be checked on the office installation. Automated UI checks simulate the print invocation; they do not certify a specific browser/printer driver. Browser print settings may override CSS paper dimensions. No office database was accessed or modified.
