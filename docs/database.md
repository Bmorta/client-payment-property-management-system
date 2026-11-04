# Database Plan

Collections:
- User
- Project
- Client
- PropertyAssignment
- Contract
- PaymentSchedule
- PaymentTransaction
- Notification
- ActivityLog
- System/payment settings as implementation evolves

Critical PropertyAssignment uniqueness:
projectId + phase + block + lot must be unique for active assignments.

Client duplicate detection is a business workflow using identifying information; do not impose a universal unique full-name constraint.

Implemented office finance storage:
- PropertyAssignment: one account per lot, with client/project/property refs,
  a fixed-price contract, embedded installment schedule and payment ledger.
- Expense: office/project/other expense entries and unique submission IDs.
- Property.client is claimed before account creation; PropertyAssignment
  references also block deletion. Failed setup keeps the lot protected for
  same-client recovery rather than releasing a possibly committed account.

Existing clients and properties are not rewritten. Existing client records can
receive accounts through Properties / Accounts; active new registrations
include their initial lot. Inactive master client records remain supported.
Automatic penalties require the final percentage and basis; warnings and
forfeiture-review indicators are read-only calculations at this stage.
