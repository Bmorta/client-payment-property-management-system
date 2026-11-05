export const TERMS = [12, 24, 36, 48, 60];
// Technical ceiling to keep schedules and request sizes bounded, not a financing policy.
export const MAX_TERM_MONTHS = 1200;
export const validTerm = months => Number.isSafeInteger(months) && months > 0 && months <= MAX_TERM_MONTHS;
export function moneyCents(value) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001 || n * 100 > 1e12) throw Object.assign(new Error("Enter a valid amount with at most two decimal places."), { statusCode: 400 });
  return Math.round(n * 100);
}
export function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function monthDate(first, offset) {
  const [y, m, d] = first.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1 + offset + 1, 0));
  return new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), Math.min(d, end.getUTCDate()))).toISOString().slice(0, 10);
}
export function buildSchedule(totalCents, months, firstDueDate, downPaymentCents = 0, contractDate = firstDueDate) {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || !validTerm(months) || !validDate(firstDueDate) || !validDate(contractDate) || firstDueDate < contractDate || !Number.isSafeInteger(downPaymentCents) || downPaymentCents > totalCents || downPaymentCents < 0) throw Object.assign(new Error("Check the contract total, dates, down payment and installment term."), { statusCode: 400 });
  const balance = totalCents - downPaymentCents;
  const base = Math.floor(balance / months), remainder = balance % months;
  return [...(downPaymentCents ? [{ installment: 0, dueDate: contractDate, amountCents: downPaymentCents }] : []), ...Array.from({ length: months }, (_, i) => ({ installment: i + 1, dueDate: monthDate(firstDueDate, i), amountCents: base + (i < remainder ? 1 : 0) }))];
}
