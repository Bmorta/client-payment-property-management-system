# Header date and unseen sidebar indicators

## Visible behavior

- Daily Motivation shows only its decorative icon and daily quote. The existing 110 offline lines, deterministic Philippine daily rotation and per-account browser display preference are retained.
- The existing HeaderClock now includes the weekday before the complete date/time using Asia/Manila. The PHT suffix and Philippine Standard Time label remain. Other report timestamps keep their existing formatting.
- Sidebar badges indicate unseen attention items. Opening a module successfully records the current item revisions for that user/module. It does not mark notifications read, resolve tasks, approve requests or alter pending counts in the Review Center or other pages.
- Newly arriving items or relevant changed revisions restore the badge. Polling, notification read changes and unrelated record edits do not create new revisions. Source duplicates are collapsed by stable request/review/account identity.
- Contract adjustment pages have independent markers. Group badges summarize child unseen counts, while individual pages retain separate markers. Staff correction history is separate from administrator review access.

## Storage and loading

Seen markers are saved per authenticated user and module in this browser's localStorage under a versioned key. They survive navigation, refresh, logout/login and synchronize across tabs through storage events. They do not synchronize across different browsers or devices; clearing site storage resets the markers. There are no new financial records or database migrations.

Badges use source item/revision maps supplied alongside the existing permitted notification stream, combined with the existing admin review projection. Successful relevant GET responses signal that a page has loaded. Unrelated option requests and failed requests do not clear badges. Cached Review Center data can acknowledge the review page without another request. First loading waits for actual attention data rather than treating an empty initial event as viewed. Once acknowledged during a visit, later background refreshes do not silently clear newly arriving activity. Clicking the already loaded page again counts as another visit.

Only the visited module's revisions are merged into its seen map; other modules' state is retained. Resolved items no longer contribute to current attention maps but prior seen identities are retained so unchanged historical records do not reappear after a transient projection gap. Existing notifications, read/unread state, permissions, data retrieval scopes and business rules remain intact.

## Validation

- Full server suite: 502 passed, 29 skipped, zero failures.
- Six focused tests: Manila weekday/date across midnight; independent module markers; stable revisions across polling/read state; new and changed items; source deduplication; role scoping and separate adjustment pages; successful endpoint matching.
- DOM checks: quote-only banner and one existing weekday clock; correct page clears while another remains; unrelated/failed loads do not clear; new arrivals remain until another visit; refresh and user isolation; same-page revisit acknowledgement.
- Production client build passed; existing chunk size advisory remains.
- Existing compact badge styling and theme tokens retained. Actual visual layout at desktop/mobile resolutions, browser zoom and live Windows/device behavior remain to be checked. DOM checks do not establish pixel layout.

No production records were modified. No commit, push, merge or deployment performed.
