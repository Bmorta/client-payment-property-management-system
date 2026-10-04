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
