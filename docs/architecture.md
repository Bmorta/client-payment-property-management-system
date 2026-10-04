# Architecture

- client/ = React + Vite frontend
- server/ = Express REST API
- imports/ = Excel import templates
- docs/ = project documentation

Backend flow:
Routes -> Controllers -> Services -> Models

Authentication, authorization, validation and error handling are cross-cutting backend concerns.

Business invariants:
- Client is a master person/entity record.
- PropertyAssignment links a client to Project + Phase + Block + Lot.
- One client can own many property assignments.
- An active Project + Phase + Block + Lot combination can belong to only one active account.
- Contract belongs to a property assignment.
- PaymentSchedule belongs to a contract.
- PaymentTransaction identifies project, client, property assignment, contract and schedule.
- Financial balances are derived from actual payment transactions.
- Backend relationship validation is mandatory.
