export const validPrice = value => value == null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001);
export function lotPrice(areaSqm, pricePerSqm) {
  if (areaSqm == null || pricePerSqm == null) return null;
  const cents = Number(areaSqm) * Math.round(Number(pricePerSqm) * 100);
  return Number.isFinite(cents) && Number.isSafeInteger(Math.round(cents)) ? Math.round(cents) / 100 : null;
}
