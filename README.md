# Client Payment & Property Management System

A secure MERN-based Client Payment and Property Management System for projects, properties/lots, clients, contracts, payment schedules, payment transactions, collections, penalties, delinquency monitoring, reports, notifications, and Excel import/export.

## Core relationship
Project -> Property Assignment -> Client -> Contract -> Payment Schedule -> Payment Transaction

One client can own multiple property assignments, including properties across different projects. An active property identity is unique by Project + Phase + Block + Lot.

## Stack
Frontend: React, Vite, React Router, Axios, Bootstrap 5, custom CSS, Recharts
Backend: Node.js, Express.js, Mongoose, MongoDB, JWT, bcrypt, ExcelJS

## Development phases
1. Authentication and users
2. Projects
3. Clients
4. Excel bulk import
5. Property assignments
6. Duplicate prevention
7. Contracts
8. Payment schedules
9. Payment transactions
10. Balances and partial payments
11. Penalty rules
12. Delinquency, warning and forfeiture
13. Dashboard
14. Collection summary
15. Notifications
16. Reports and Excel export
17. Admin panel and activity logs
18. Testing, security and responsive optimization

Each major phase must be functional before moving to the next.

## Excel bulk import
The system will support XLSX import for multiple clients and property assignments using ExcelJS. Imports validate existing database data and duplicate rows inside the workbook before committing changes.
