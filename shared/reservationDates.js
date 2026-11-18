const dayMs = 86400000;

export function reservationExpiry(startDate, days) {
  if (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !Number.isInteger(days) || days < 1 || days > 365) return '';
  const start = new Date(startDate + 'T00:00:00Z');
  if (!Number.isFinite(+start) || start.toISOString().slice(0, 10) !== startDate) return '';
  const expiry = new Date(+start + days * dayMs).toISOString();
  return expiry.length === 24 ? expiry.slice(0, 10) : '';
}
