export const validPrice = value => value === "" || value == null || (Number.isFinite(Number(value)) && Number(value) >= 0 && Number.isSafeInteger(Math.round(Number(value) * 100)) && Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) < 0.000001);
export function lotPrice(area, price) {
  if (area === "" || area == null || price === "" || price == null) return null;
  const cents = Number(area) * Math.round(Number(price) * 100);
  return Number.isFinite(cents) && Number.isSafeInteger(Math.round(cents)) ? Math.round(cents) / 100 : null;
}
export const money = value => value == null ? "—" : new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
export const deletableLot = lot => lot.status === "AVAILABLE" && !lot.client && lot.canDelete !== false;
