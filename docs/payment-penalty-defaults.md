# Penalty defaults and payment-section basis

## Behavior

Newly configured monitoring terms default to Active. On new property account creation, the backend sets the terms/penalty effective date to the contract date; the client displays that date read-only. Rate, due day, grace and forfeiture terms still require their actual values. Existing contract records and explicit Disabled/Waived policies are not bulk rewritten.

Penalty basis is selected in **Payment → Client → Property Account Details & History → Payment Penalty Calculation**, outside the contract editor. Options are Full Scheduled Installment and Unpaid Installment Balance. An administrator previews and confirms the selection. The choice is stored in the property's operational payment policy history, separately from the original contract. Staff may collect/defer penalties after setup; they cannot silently change calculation policy.

For unfinished policies (including the previous pending/disabled default), initial setup defaults to Active and uses the contract date. Its preview displays overdue principal, previous penalties and accumulated recalculated penalties. This may produce historical charges for genuinely unpaid installments; historical migration cutoff protections still apply. It does not add a collection or release a commission. Payments remain blocked in the new checkout until the basis is selected, avoiding misleading zero-penalty receipts.

Subsequent changes require a reason and start today. Existing assessment cycles continue using their original policy and installment anniversary. Existing payments, allocations, waivers, assessments and payouts remain auditable. There are no database resets or destructive migrations; the optional `paymentPenaltyPolicies` array requires no rewrite of existing accounts.

## Validation

- Backend: 188 tests, 183 passed, 5 environment-dependent skips, 0 failures.
- New policy HTTP scenarios passed on disposable standalone and replica-set MongoDB: admin-only preview/save, stale-preview rejection, contract-date initial assessment, preserved original contract, audit events, no payment created.
- Existing multi-property, receipt, penalty, export and void scenarios passed on both database types.
- React DOM check passed: Active default, contract-date date display, basis absent from contract form, options in Payments and preview before saving.
- Production client build and existing payment-flow integration checked separately; see implementation completion message for final result.

## Files in this update

- `shared/contractTerms.js`, `shared/penaltyPolicy.js`
- `client/src/components/ContractTerms.jsx`, `AgreementEditor.jsx`, `PaymentPenaltyBasis.jsx`, `PaymentConfiguration.jsx`, `AccountMonitoringDetails.jsx`, `PropertyPaymentCheckout.jsx`
- `client/src/pages/PaymentPage.jsx`
- `server/src/models/PropertyAssignment.js`
- `server/src/controllers/financeController.js`, `paymentIntentController.js`, `paymentPenaltyPolicyController.js`
- `server/src/routes/financeRoutes.js`
- `server/src/utils/contractMonitoring.js`, `paymentIntent.js`
- `server/test/office-update.test.js`, `multi-property-payments.test.js`
- `server/integration/multi-property-payments.test.js`

No commit, push, deployment or live database modification was performed for this update.
