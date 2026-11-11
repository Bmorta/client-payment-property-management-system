# Full-screen property map editor

Implemented on November 11, 2026. Publication authorized by the user; deployment is separate.

## Changes

- Full-screen editor with a left tool rail, collapsible contextual settings, and compact Save, Print Preview, and Exit actions.
- Centered map with its original aspect ratio, pointer-anchored wheel zoom, zoom buttons, pan, Fit to Screen, and Reset View.
- Existing stickers, linked inventory statuses, text, drawing, shapes, arrows, history, and print options retained. Annotation positions remain in original map coordinates.
- Context controls include multiline text, size, rotation, opacity, colors, position, and inventory links. Rotated resizing preserves the opposite corner.
- Print Preview preserves the mounted editor's selection, view, and undo history. Saving leaves annotations editable.
- Unsaved-change warnings protect Exit, Escape, browser refresh, and restoring a saved version. Discarding a draft does not change the saved overlay.
- Responsive tool rail and settings layout, with Light/Dark theme styles. Original image files are not overwritten.

## Modified files

- `client/src/components/MapAnnotationEditor.jsx`
- `client/src/components/MapPrintPreview.jsx`
- `client/src/components/ProjectMap.jsx`
- `client/src/styles.css`
- `client/src/utils/mapAnnotations.js`
- `client/src/utils/mapViewport.js` (new)
- `shared/mapOverlay.js`
- `server/test/map-viewport.test.js` (new)
- This report.

Shared overlay validation accepts optional opacity and normalizes legacy defaults. No database migration or financial calculation changes are introduced.

## Verification

- Existing and new Node regression tests: 368 passed, 0 failed.
- Production frontend build: passed; existing large-bundle warning remains.
- Whitespace validation: passed.
- Simulated DOM checks: placement, selection, dragging, zoom, pan, Fit, undo/redo, opacity persistence, save, reopen, print-preview handoff, unsaved warnings, and discard passed using mocked API/image geometry.
- Geometry tests cover desktop, tablet, and narrow mobile canvas sizes, zoom limits, pointer coordinates, rotated hit testing/resizing, and legacy overlay compatibility.

## Unverified

Connected browser access was unavailable, and the cloud browser could not reach the local preview. Actual rendered desktop/mobile layouts, Light/Dark appearance, real database persistence, native print output, and before/after screenshots are unverified. Simulated DOM and geometry checks are not visual browser testing.

No production records were changed. Unrelated existing workspace changes were not included in this task.
