// The server supplies the authoritative dated ledger. Both quote consumers use
// its unpaid balances, never a monthly amount multiplied by a period count.
export function quoteUnpaidInstallments(schedule, months) {
  const count = Number(months);
  if (!Number.isSafeInteger(count) || count < 1 || count > 1200)
    throw Object.assign(new Error('Enter a whole number of installment periods (1–1,200).'), {statusCode:400});
  const rows = schedule.filter(r => r.installment > 0 && !r.retired && r.balanceCents > 0).slice(0, count);
  if (rows.length !== count)
    throw Object.assign(new Error('The requested periods exceed the remaining unpaid installment schedule.'), {statusCode:400});
  const amountCents = rows.reduce((sum, r) => sum + r.balanceCents, 0);
  if (!Number.isSafeInteger(amountCents) || rows.some(r => !Number.isSafeInteger(r.balanceCents)))
    throw Object.assign(new Error('Installment balances require administrator reconciliation.'), {statusCode:409});
  return {periods:rows.map(({installment,dueDate,balanceCents}) => ({installment,dueDate,balanceCents})), amountCents};
}
