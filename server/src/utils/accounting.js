import { validDate } from "../../../shared/paymentSchedule.js";
export { TERMS, MAX_TERM_MONTHS, validTerm, moneyCents, validDate, monthDate, buildSchedule } from "../../../shared/paymentSchedule.js";
export const METHODS = ["CASH", "BANK_TRANSFER", "GCASH", "CHECK", "OTHER"];
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export function summarizeAccount(account, asOf = today()) {
  const paidCents = (account.payments || []).filter(p => p.paymentDate <= asOf).reduce((n, p) => n + p.amountCents, 0);
  let remaining = paidCents;
  // Historical reports use the agreement that applied at the report cutoff.
  const historical = (account.agreementHistory || []).find(version => {
    const changedDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(version.replacedAt));
    return asOf < changedDate;
  });
  const contract = historical?.contract || account.contract;
  const schedule = contract.schedule.map(row => {
    const paid = Math.min(remaining, row.amountCents); remaining -= paid;
    const balanceCents = row.amountCents - paid;
    const daysOverdue = Math.max(0, Math.floor((Date.parse(asOf) - Date.parse(row.dueDate)) / 86400000));
    return { ...row, paidCents: paid, balanceCents, daysOverdue, overdue: balanceCents > 0 && row.dueDate < asOf, penaltyReview: balanceCents > 0 && daysOverdue > 10 };
  });
  const missedMonths = schedule.filter(s => s.installment > 0 && s.overdue).length;
  return { paidCents, balanceCents: contract.totalCents - paidCents, overdueCents: schedule.filter(s => s.overdue).reduce((n, s) => n + s.balanceCents, 0), missedMonths, alert: missedMonths >= 3 ? "FORFEITURE_REVIEW" : missedMonths >= 2 ? "WARNING" : missedMonths ? "OVERDUE" : "CURRENT", schedule };
}
export function dateRange(query) {
  const { from, to } = query;
  if (!validDate(from) || !validDate(to) || from > to) throw Object.assign(new Error("Choose a valid start and end date."), { statusCode: 400 });
  return { from, to };
}
