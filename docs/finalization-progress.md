# Finalization implementation progress

## Group 1 — shared action feedback and administrator safety

Implemented:
- CenterPopup now renders into a body-level portal, outside transformed or scroll-clipped parent modals. Feedback layers are above existing forms and help tooltips; opening feedback closes pinned help.
- Shared feedback host covers scalar error/success feedback in 35 previously inline-only views, with duplicate suppression and a local explanation that can reopen the popup.
- Dialog keyboard handling selects the highest visible dialog, avoids double Escape processing, and preserves focus and scroll locking.
- User edits protect the last active administrator. Concurrent administrator removals serialize through a shared guard inside a MongoDB transaction and recheck the acting administrator. Ordinary profile edits remain available on standalone MongoDB. Removing an active administrator when others exist requires replica-set transaction support; self-deactivation remains prohibited.
- No passwords, client records or financial history were migrated or removed.

Validation: backend suite 217 discovered, 210 passed, 7 environment-gated skips, zero failures. Administrator HTTP tests passed on standalone and replica set, including simultaneous demotions, audit outcomes and unchanged last-admin protection. UI checks passed for portal placement, nested modal priority, tooltip-layer priority, warning titles, duplicate feedback, Escape/focus and scroll restoration. Production build passed with the existing large-chunk advisory.

Remaining: complete the other checklist workflows, starting with expense correction/void. The module review is not a claim that all finalization work or production acceptance testing is complete. Existing local database configuration and data remain device-specific.

## Group 2 — expense correction and void

Implemented administrator-only correction/void with a server-generated preview token, fresh version check, explicit confirmation, required reason, retained original values and append-only revisions. Repeated requests return the recorded result; concurrent edits reject stale changes. Linked payout validation remains enforced, and voiding the expense mirror never voids the actual agent payout. Added searchable, status-filtered, paginated expense history; posted totals cover all matching records. Financial reports continue to exclude voided expenses. Viewers have history-only access.

Validation: backend suite 218 discovered, 210 passed, 8 environment-gated skips, zero failures. Expense HTTP integration passed on standalone and replica set: preview read-only behavior, role checks, invalid inputs, retries, concurrency, original/history preservation, corrected/voided expense and cash totals, and payout-link double-deduction prevention. UI checks verify review-before-save, explicit confirmation, refresh and viewer restrictions. Production build passed.

Remaining checklist work includes notification read-state isolation/history, convenience restore/deactivate controls, migration draft controls, broader role/accessibility/device checks, and large-data/report/backup improvements. No production-readiness claim is made from these groups alone.

## Group 3 — independent notification reads and accessible history

Notification read state now lives in a separate per-user/account/notification collection. Legacy readBy flags remain honored; no automatic rewrite of existing accounts is needed. Marking one alert read is account-scoped, including identical alert IDs on different accounts. Mark-all covers permitted older pages. The bell opens a centered, searchable, paginated history instead of a clipped dropdown. Live unread updates and role restrictions remain intact.

Validation: notification HTTP tests passed on standalone and replica set with 132 alerts. Reads left the complete account document unchanged and preserved a financial recalculation preview token. Tests cover legacy read flags, pagination beyond 100 entries, roles, same-ID account isolation, repeated reads and mark-all. UI check passed for centered history, paging and scoped read/navigation. Backend suite: 219 discovered, 210 passed, 9 environment-gated skips, zero failures. Frontend build passed.

## Group 4 — safe lifecycle controls and older cash history

Added confirmed project archive/status restoration, client deactivate/reactivate, agent reactivation through the existing agreement-safe editor, user activation controls, and status filters with matching export queries. Viewer mutation controls are hidden/disabled and existing backend permissions remain enforced. Client reactivation does not reinstate terminated contracts. Only editable migration drafts receive Delete Draft; activated records remain protected. Cash history now supports server-side pagination, literal search, status and date filters beyond the previous 200-row display limit; financial totals still use the complete ledger. Shared feedback prioritizes errors over success. Literal search escaping also fixes special-character expense searches.

Validation: backend suite 221 discovered, 211 passed, 10 environment-gated skips, zero failures. New lifecycle/cash/draft integration passed on standalone and replica set. Existing payment workflow and historical migration integration passed. UI checks passed for confirmation-before-write, status-only client changes, agent reactivation, viewer restrictions and draft deletion. Production build passed with the existing large-chunk advisory. No live office database was accessed or changed.

Remaining review items include large-data backup/report reliability, authentication/session recovery, unsaved-edit handling, broader mobile/LAN/accessibility acceptance, and business-approved contract closure/reinstatement workflows. This is incremental finalization, not a declaration of production readiness.

## Group 5 — office cash retention/turnovers and administrator lot transfers

Cash movements now distinguish owner turnovers from expenses/revenue, accept a zero initial baseline, automatically carry balances by date, validate concurrent/backdated movements, retain corrections and provide daily/detail Print/PDF/Excel breakdowns. See `collection-cash-summary.md`.

Lot transfers add administrator previews and approvals, configurable principal credits and residual terms, linked noncash adjustments, retained original contracts/receipts/payouts, penalty resolution, transactional inventory changes, history and matching transfer exports. Existing global lot-account uniqueness requires an explicit backed-up index upgrade; the feature blocks financial approval until it is completed. No live database upgrade was run. See `lot-transfers.md` for setup, safeguards, validation and deliberate amendment/reversal restrictions.

Validation: 232 backend tests discovered, 219 passed, 13 environment-gated skips, zero failures; separate disposable-database integrations passed for transfer/legacy index upgrade, payment workflow, historical migration and owner turnovers. Cash and transfer UI checks and frontend production build passed. Prior broader voucher-concurrency intermittency remains documented separately; this update does not claim to resolve it. No new dependencies, automatic deployment or live office-data mutations.
