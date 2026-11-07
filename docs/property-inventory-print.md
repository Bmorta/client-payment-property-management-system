# Property Inventory and printing

A dedicated Property Inventory menu opens `/property-inventory`. Select a project to view its saved inventory. Phase, block, lot, availability and search filters reuse the existing Manage Lots inventory component. The dedicated page is read-only and links to Manage Lots for modifications.

Print Inventory is available in both the inventory page and Manage Lots. It prints all loaded matching records with project identity, location, Philippine generation time, active filters, record/status counts, lot identifiers, areas, prices per sqm, calculated prices per lot and statuses. A4 landscape output repeats table headings and excludes navigation and editing controls. Browser printing can also save as PDF. Unsaved lot changes or new-lot forms must be saved/cancelled before printing.

No backend, database, dependency or financial policy changes are required. The existing lot pricing calculation is reused.

Validation: client production build, inventory project/filter/print DOM check (saved prices, escaped text, empty results, no mutation calls), existing office workflow DOM regression and Vite development initialization-order check. Physical printer and office-browser acceptance remain pending.

Modified: client/src/App.jsx; client/src/layouts/AppLayout.jsx; client/src/pages/PropertyInventory.jsx. Added: client/src/pages/InventoryPage.jsx; client/src/utils/printPropertyInventory.js; this document. The existing App.jsx blank-screen fix is retained. Nothing is committed or pushed by this implementation.
