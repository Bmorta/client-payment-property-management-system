# Property Inventory and printing

A dedicated Property Inventory menu opens `/property-inventory`. Select a project to view its saved inventory. Phase, block, lot, availability and search filters reuse the existing Manage Lots inventory component. The dedicated page is read-only and links to Manage Lots for modifications.

Print Inventory is available in both the inventory page and Manage Lots. It prints all loaded matching records with project identity, location, Philippine generation time, active filters, record/status counts, lot identifiers, areas, prices per sqm, calculated prices per lot and statuses. A4 landscape output repeats table headings and excludes navigation and editing controls. Browser printing can also save as PDF. Unsaved lot changes or new-lot forms must be saved/cancelled before printing.

No backend, database, dependency or financial policy changes are required. The existing lot pricing calculation is reused.

Validation: client production build, inventory project/filter/print DOM check (saved prices, escaped text, empty results, no mutation calls), existing office workflow DOM regression and Vite development initialization-order check. Physical printer and office-browser acceptance remain pending.

Modified: client/src/App.jsx; client/src/layouts/AppLayout.jsx; client/src/pages/PropertyInventory.jsx. Added: client/src/pages/InventoryPage.jsx; client/src/utils/printPropertyInventory.js; this document. The existing App.jsx blank-screen fix is retained. Nothing is committed or pushed by this implementation.


## Excel export

Export to Excel is available beside Print Inventory in both the dedicated inventory page and Manage Lots. It requests `/api/projects/:projectId/properties/export.xlsx` through the existing authenticated API. The server reads saved project/lot records and applies the same shared phase/block/lot/status/search filter used by the inventory list. The workbook includes project information, generation time in Asia/Manila, active filters, matching count and all matching saved lot details. Numeric area and PHP price cells support Excel calculations; unknown values remain blank and zero remains zero. Table headings are frozen/filterable and print settings use A4 landscape. Unsaved changes must be saved or cancelled before exporting. No database writes, migrations or dependencies were added.

Additional modified files: client/src/pages/PropertyInventory.jsx and server/src/routes/projectRoutes.js. Added: shared/inventoryFilters.js, server/src/controllers/inventoryExportController.js and server/test/inventory-export.test.js.

Verification: 127 backend tests passed, one optional MongoDB integration skipped; three new export cases cover workbook numeric round trips, combined filters, missing/zero prices, empty results and malformed requests. Client build passed. DOM checks verified that the download uses active filters and that existing print/read-only behavior remains intact. Nothing committed or pushed.


## Preview-first inventory actions

Both Property Inventory and Manage Lots now use Refresh Results, Print, Export CSV and Export Excel. Print/export buttons first load the shared report preview; download buttons appear inside it. The preview includes all matching saved records, active filters, project identity and numeric prices. Downloads require the same unchanged result fingerprint; changed saved prices require a fresh preview. This supersedes the earlier direct-download button workflow. Pending lot edits must still be saved or cancelled before output.
