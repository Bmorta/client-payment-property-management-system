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

## Group 6 — session and connection recovery

Temporary startup network/server/database failures retain the saved login and present a centered Retry Session Check panel instead of silently signing out. Confirmed authenticated 401 responses clear the matching session, while login failures, 403s, 503s and stale responses from an older token do not expire a newer login. Database lookup failures now return 503 rather than incorrectly reporting an invalid token. Sign-in restores the requested local page/search/hash, with external/login-loop destinations rejected. Cross-tab sign-out and session changes are respected; logout logging has a bounded timeout. No failed financial request is automatically replayed. Login errors use the shared centered feedback host.

Validation: backend suite 235 discovered, 222 passed, 13 environment-gated skips, zero failures. UI check passed for retained login after connection failure, retry, stale-expiry isolation, confirmed expiry, original route restoration, cross-tab logout and no automatic replay. Existing payment/permissions/notifications/persistence HTTP integration passed. Frontend production build passed with the existing chunk-size advisory. No new dependencies or live database changes.

Modified: client/src/services/api.js; client/src/context/AuthContext.jsx; client/src/components/ProtectedRoute.jsx; client/src/pages/LoginPage.jsx; new client/src/utils/sessionRecovery.js; server/src/middleware/auth.js; new server/test/session-recovery.test.js; this progress document. Publication authorized by the user. Large-data backup/report work, unsaved-edit protection and device/LAN acceptance remain outstanding.

## Group 7 — partial cancellations, retained-lot credit amendments and refund payables

Implemented administrator entitlement previews/approval, one-or-many selected source cancellations, 30%/full/custom value policies, separate penalty resolution, legal review/minimum controls, shared credit/refund allocation caps and documented disposition. Pending cases reserve sources without cancelling them or posting credits. Final clearance atomically cancels only selected sources and amends existing retained schedules with noncash credits; original prices, receipts, paid-period commission identities and payouts remain preserved. Refund releases are separately authorized, idempotent, source-allocated and cash/noncash classified; reviewed statutory cash minima and installment restrictions are enforced. Inventory remains held without explicit final clearance. Shared print/Excel case reports and collection/cash refund detail are included.

Validation: 246 backend tests discovered, 232 passed, 14 environment-gated skips, zero failures. Cancellation integration passed on standalone and replica set; existing payment, lot transfer/index upgrade, cash movement and migration integration passed. UI check and production build passed. See `partial-contract-cancellations.md` for the workflow, files, test coverage and review limits. No new dependencies or office database changes. Publication authorized by the user; no merge, deployment or live database upgrade is included.
