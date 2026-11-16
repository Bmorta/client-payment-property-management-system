# Origin-aware workspace navigation

## What changed

A shared navigation provider records local workspace history entries, their immediate originating entry and the browser history index. Smart Back buttons use that actual origin, including its query string, instead of a hardcoded unrelated destination. Connected detail pages retain the earlier origin chain. Same-page tab/query changes preserve the module origin. POP navigation does not rewrite the saved trail. Safe fallbacks cover direct links and missing history; login, unknown paths and external URLs are excluded.

The workspace now exposes the shared Back action. Existing client-account, manage-lot and property-history Back links use it without showing a duplicate global Back control. Agents can also leave an inline selected profile with Back to Agents. A commission anchor that previously reloaded the application now uses the existing router Link. No routes were added or duplicated.

## View state

Opt-in presentation state is stored in per-user, per-history-entry session storage. List searches, filters, selected project/agent references, date scopes, tabs/views, sorting and pagination are retained across Clients, Agents, Commissions, Projects/Inventory, Transactions, Monitoring, Reports, cash/expense workspaces, Site Requests, Settlements and administrative lists. Existing URL-based tabs remain URL-based. Repeated embedded workspaces use component/entity namespaces. Operational reports re-fetch their result on return after a report was previously generated.

The navigation layer does not cache authoritative records, report financial payloads, payment drafts, credentials, approval confirmation state or mutation requests. Existing APIs re-fetch current records and still enforce their permissions. Storage failures fall back safely. The trail is bounded to 80 entries.

Scroll offsets are stored per entry and restored as asynchronous content renders, for both the window and workspace container. User interaction stops automatic restoration. The provider temporarily uses manual browser scroll restoration to avoid competing offsets.

## Validation and limitations

- 432 automated tests passed, 29 optional integration tests skipped.
- New logic tests exercise all five requested module flows, chained details, Back/Forward preservation, tab navigation, replacement redirects, refresh/direct-link fallback, unsafe destinations and separate/blocked session storage.
- Production frontend build and whitespace checks pass. The existing large-chunk warning remains.
- Chromium cannot launch under this environment's socket restrictions. Actual browser scroll timing, keyboard behavior and full end-to-end route testing remain unverified. Storage restoration is best-effort when browser session storage is disabled or full.
- No production service or database was changed. No commit, push, merge or deployment was performed.
