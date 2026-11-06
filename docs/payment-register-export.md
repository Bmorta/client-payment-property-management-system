# Payment and commission Excel register

In Reports, choose the period and project, then select **Export Payment & Commission Excel**. Generating the on-screen report first is optional. The authenticated download endpoint is `GET /api/finance/reports/payment-register.xlsx?from=YYYY-MM-DD&to=YYYY-MM-DD&project=<optional ID>`.

The workbook has grouped blue/yellow headers, frozen identifying columns and headers, filterable columns, numeric PHP values, landscape print settings, and a Read Me sheet. It exports one effective payment per property contract. Multiple lots remain separate to preserve their individual prices, terms and commission agreements. No records are changed by exporting.

Columns: number, date, buyer, project, lot count, phase, block, lot, price/sqm, sqm, TCP, buyer term, monthly installment, amount paid, penalty paid, fully covered installments, actual allocation details, previous payment date, due day, down payment collected, original TCP, assigned agent percentage, funded agent commission periods, commission term, earned commission, net after earned commission, account ID, payment ID.

Allocation amounts and commissions use the existing backend ledger and commission engine. Down payments do not count toward covered monthly installments. Partial installments are not counted as fully covered. Earned commissions are attributable to the exported payment sources, not a calendar schedule, and are distinct from agent payouts. Net after earned commission is an accrual-style figure; it does not deduct expenses or represent cash after agent payouts. Actual release history remains in Commission Reports.

The sample's ambiguous COUNT heading is labeled Due Day here. A commission period is shown explicitly per agent instead of treating it as a buyer month. Contract and commission terms are current stored agreement values; this is a restatement using current corrections, not a historical agreement-version snapshot. Original TCP uses the earliest stored contract history where present. Repeated TCP values must not be totaled.

Validation: 3 focused tests cover full and partial advance allocations, completion after earlier partial payments, void exclusion, date range, independent contracts, commission attribution, unchanged source data, empty export, and XLSX serialization/reloading. Full server suite: 101 passed, 1 optional MongoDB integration skipped. Client production build passed. Excel desktop visual review and production-data acceptance remain pending.
