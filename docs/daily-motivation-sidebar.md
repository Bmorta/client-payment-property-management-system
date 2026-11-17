# Daily motivation and sidebar attention

## User controls

After login a slim banner sits above the existing main header. It displays the Philippine weekday and complete date, plus a short built-in original motivational line. Settings → Appearance → Show Daily Motivation banner enables/disables it for the signed-in account in this browser. No external quote API or internet access is needed. Quotes are unattributed; no unverified author claims are included.

Day selection uses the Asia/Manila calendar date and a deterministic rotation through 110 unique built-in lines. Everyone on the same date sees the same line. The next update is scheduled at Manila midnight, with focus/visibility recovery after sleep or background timer throttling. Accuracy relies on the device clock being correct. The banner remains a single line; long content is ellipsized with its full quote available on hover. It shares the header's sticky container and is excluded from printing.

## Attention badges

Small absolutely positioned red/white badges appear only for positive counts. They do not add sidebar width or row spacing; large counts show 99+. Compact icons retain the badge while label text stays hidden. Group indicators summarize their actionable child modules; an item is not counted again merely because duplicate notices exist.

- Admin reviews: unique pending rows from the existing administrator review provider.
- Payments: pending corrections, with staff limited to their own corrections visible in the existing notification scope; administrator counts also use the full review projection.
- Client requests: permitted nonterminal requests needing scheduling/hold resolution or current visit/follow-up attention, counted once per request.
- Clients: active CRITICAL or FORFEITURE_REVIEW_REQUIRED monitoring signals, counted once per account, regardless of unread status.
- Commissions: current saved releasable amounts, recovery/verification needs, combined with pending commission reviews. Matching account review/ledger signals are counted once. A held release without a separate actionable review is not presented as ready to release.
- Reopening, migration, cash and payouts: existing pending review categories, respecting administrator permission.

The existing notification stream carries the read-only attention summary. No additional notification stream or badge polling API is introduced. Existing mutation and notification events refresh the review provider. Read state does not clear an unresolved task; history-only events do not create a badge. Counts use existing source permissions, current saved monitoring/commission snapshots and review records; they do not calculate or mutate financial outcomes. Existing snapshot refresh timing remains in effect.

## Validation

Five focused tests cover Manila midnight/day/date, consistent daily rotation and catalog wrap without consecutive repeats, role filtering, historical/read-state exclusions, duplicate signals, resolved reviews and current commission snapshot eligibility.

DOM checks cover date rendering, account-scoped show/hide, no duplicate Dashboard/Review sidebar entry, live badge changes and zero hiding, compact state, and cross-user event isolation. Positioning/theme CSS uses existing tokens and red/white badge colors.

Full server suite and production build completed successfully. Actual visual checks on Windows/mobile browsers, screen resolutions and zoom remain pending; DOM checks do not establish pixel-perfect layout on those devices. No live database records were modified. No commit, push, merge or deployment was performed.
