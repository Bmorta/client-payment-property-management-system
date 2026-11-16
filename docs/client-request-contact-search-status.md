# Request contact validation and search statuses

## Root causes and changes

- The existing client search projection omitted contactNumber/email. The guided form selected the client in its second step and offered no contact editor for existing clients.
- Request validation always copied the client master contact, ignoring the request's supplied contact; a client missing master contact could therefore fail only at save.
- SearchInput had no status metadata/rendering, and active-only agent pickers silently removed inactive agents.

The existing request form now selects the client and presents editable contact fields in Step 1. It retrieves the selected client's latest details, focuses an empty Contact Number field and validates before Continue. Contact details entered here are request-specific snapshots: they do not update the Client master. Prospective site-tripping buyers still require no client registration or contract. Ordinary property requests do not require booking times or personnel at registration. Backend ownership, active-contract, project authorization, role and transaction controls remain in place.

Validation errors stay inside the open request form, with entered values preserved. Missing-contact errors return the form to the contact step. Site tripping offers only active, project-authorized agents as selectable choices; inactive agents remain labelled and disabled. Property choices retain their actual availability, contract identity and restrictions.

## Search coverage

The shared autocomplete renders compact badges from supplied database records, preserving its selection payload, keyboard controls, debounce and stale-response handling. Search suggestions in client lookups, payment client search, Client List, Agents, assignments, commissions, payment transactions, financial/expense reports, property inventory, projects and users receive status metadata where the record has a meaningful status.

Client status remains Active/Inactive, as implemented by the Client model. Contract status is shown separately and individually alongside its contract/property identity. A single batched read enriches only accounts on the returned 20-client search page using existing summarizeAccount/accountStatusTags calculations. It exposes status tags, not payment ledgers. Failed reconciliation is identified as Status Review Required instead of inventing financial completion. Fully-paid tags disappear after a payment reversal under the existing ledger rules.

Existing native contract/lot selectors show textual statuses (native options cannot contain badge markup). Site requests display restricted owned contracts and viewing lots with disabled explanations; transfer search explicitly requests restricted lots for identification while leaving the original transfer approval eligibility checks intact. AgentPicker retains server pagination and identifies inactive agents instead of hiding them. Existing list filters, deleted-record restrictions and administrative permissions remain unchanged. Approval queues and request histories already display record statuses; their approval/history mechanisms are unchanged.

## Validation

- Server suite: 461 passed, 29 skipped, 0 failed.
- Client production build passed, with the existing bundle-size warning.
- DOM checks passed for status suggestions, disabled mouse/keyboard selection, immediate contact loading/focus, required contact gating, contract/property status labels and preservation of entered data after a failed save.
- Focused tests cover missing master contact, request-only contact persistence, office site tripping, malformed email, multiple contracts with different states, inactive/project-restricted agents, property status labels, page-bounded batched enrichment, and current fully-paid status after reversal.
- Real MongoDB integration, visual Light/Dark Mode, browser zoom/responsive layout and Windows browser acceptance still need local testing. DOM checks do not certify visual layout or real database performance.

No production records were changed. No commit, push, merge or deployment was performed.
