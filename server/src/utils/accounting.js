export const TERMS = [12, 24, 36, 48, 60];
export const METHODS = ["CASH", "BANK_TRANSFER", "GCASH", "CHECK", "OTHER"];
export function moneyCents(value) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001 || n * 100 > 1e12) throw Object.assign(new Error("Enter a valid amount with at most two decimal places."), { statusCode: 400 });
  return Math.round(n * 100);
}
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function monthDate(first, offset) {
  const [y, m, d] = first.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1 + offset + 1, 0));
  return new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), Math.min(d, end.getUTCDate()))).toISOString().slice(0, 10);
}
export function buildSchedule(totalCents, months, firstDueDate, downPaymentCents = 0, contractDate = firstDueDate) {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || !TERMS.includes(months) || !validDate(firstDueDate) || !validDate(contractDate) || firstDueDate < contractDate || downPaymentCents > totalCents || downPaymentCents < 0) throw Object.assign(new Error("Check the contract total, dates, down payment and installment term."), { statusCode: 400 });
  const balance = totalCents - downPaymentCents;
  const base = Math.floor(balance / months), remainder = balance % months;
  return [...(downPaymentCents ? [{ installment: 0, dueDate: contractDate, amountCents: downPaymentCents }] : []), ...Array.from({ length: months }, (_, i) => ({ installment: i + 1, dueDate: monthDate(firstDueDate, i), amountCents: base + (i < remainder ? 1 : 0) }))];
}
export function summarizeAccount(account, asOf = today()) {
  const paidCents = (account.payments || []).filter(p => p.paymentDate <= asOf).reduce((n, p) => n + p.amountCents, 0);
  let remaining = paidCents;
  const schedule = account.contract.schedule.map(row => {
    const paid = Math.min(remaining, row.amountCents); remaining -= paid;
    const balanceCents = row.amountCents - paid;
    const daysOverdue = Math.max(0, Math.floor((Date.parse(asOf) - Date.parse(row.dueDate)) / 86400000));
    return { ...row, paidCents: paid, balanceCents, daysOverdue, overdue: balanceCents > 0 && row.dueDate < asOf, penaltyReview: balanceCents > 0 && daysOverdue > 10 };
  });
  const missedMonths = schedule.filter(s => s.installment > 0 && s.overdue).length;
  return { paidCents, balanceCents: account.contract.totalCents - paidCents, overdueCents: schedule.filter(s => s.overdue).reduce((n, s) => n + s.balanceCents, 0), missedMonths, alert: missedMonths >= 3 ? "FORFEITURE_REVIEW" : missedMonths >= 2 ? "WARNING" : missedMonths ? "OVERDUE" : "CURRENT", schedule };
}
export function dateRange(query) {
  const { from, to } = query;
  if (!validDate(from) || !validDate(to) || from > to) throw Object.assign(new Error("Choose a valid start and end date."), { statusCode: 400 });
  return { from, to };
}
