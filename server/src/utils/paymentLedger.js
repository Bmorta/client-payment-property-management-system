import { calculateLedger, calendarDay } from "./contractMonitoring.js";
export function effectivePayment(payment) {
 const revisions=payment.revisions || [], latest=revisions.at(-1);
 return {...payment,...(latest?.values||{}),paymentId:payment.paymentId,receiptNumber:latest?.values?.receiptNumber??payment.receiptNumber,
  revision:revisions.length,status:latest?.values?.voided?"VOIDED":revisions.length?"CORRECTED":"VALID",
  allocationPlan:latest?.values?.voided?[]:(latest?.values?.allocationPlan||payment.allocationPlan||[]),
  amountCents:latest?.values?.voided?0:(latest?.values?.amountCents??payment.amountCents)};
}
export function allocatePayments(account, asOf=calendarDay()) {
 return calculateLedger(account,(account.payments||[]).map(effectivePayment),asOf);
}
