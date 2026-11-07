import { allocatePayments } from "./paymentLedger.js";
import { validDate } from "../../../shared/paymentSchedule.js";
export { TERMS, MAX_TERM_MONTHS, validTerm, moneyCents, validDate, monthDate, buildSchedule } from "../../../shared/paymentSchedule.js";
export {PAYMENT_METHODS as METHODS} from "../../../shared/paymentMethods.js";
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export function summarizeAccount(account, asOf = today()) {
  // Historical reports use the agreement that applied at the report cutoff.
  const historical = (account.agreementHistory || []).find(version => {
    const changedDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(version.replacedAt));
    return asOf < changedDate;
  });
  const contract = historical?.contract || account.contract;
  const allocated = allocatePayments({...account, contract}, asOf);
  const paidCents=allocated.principalPaidCents;
  const schedule=allocated.schedule.map(row=>({...row,daysOverdue:Math.max(0,Math.floor((Date.parse(asOf)-Date.parse(row.dueDate))/86400000)),penaltyReview:row.overdue&&row.penaltyHistory.length>0}));
  const installments=schedule.filter(s=>s.installment>0&&s.amountCents>0),fullyPaidMonths=installments.filter(s=>s.balanceCents===0).length;
  const missedMonths=installments.filter(s=>s.overdue).length;
  // Legacy review indicators remain until the administrator configures terms.
  const alert=contract.monitoringTerms?allocated.category:missedMonths>=3?"FORFEITURE_REVIEW":missedMonths>=2?"WARNING":missedMonths?"OVERDUE":"CURRENT";
  return {...allocated,totalCollectedCents:allocated.payments.reduce((n,p)=>n+p.amountCents,0),penaltyPaidCents:allocated.assessments.reduce((n,p)=>n+p.paidCents,0),fullyPaidMonths,partialMonths:installments.filter(s=>s.paidCents>0&&s.balanceCents>0).length,remainingMonths:installments.length-fullyPaidMonths,
    progressPercent:installments.length?Math.round(100*fullyPaidMonths/installments.length):100,
    downPaymentPaidCents:schedule.find(s=>s.installment===0)?.paidCents||0,paidCents,
    overdueCents:schedule.filter(s=>s.overdue).reduce((n,s)=>n+s.balanceCents,0),missedMonths,alert,schedule};
}
export function dateRange(query) {
  const { from, to } = query;
  if (!validDate(from) || !validDate(to) || from > to) throw Object.assign(new Error("Choose a valid start and end date."), { statusCode: 400 });
  return { from, to };
}
