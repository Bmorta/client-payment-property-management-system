export const pesos = cents => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format((cents || 0) / 100);
export const clientName = client => client ? [client.firstName, client.middleName, client.lastName, client.suffix].filter(Boolean).join(" ") : "Unknown client";
export const lotName = property => property ? `${property.propertyId} · Phase ${property.phaseNumber} / Block ${property.blockNumber} / Lot ${property.lotNumber}` : "Unknown lot";
export const localDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
export function periodDates(period, anchor) {
  const date = new Date(`${anchor}T00:00:00Z`), year = date.getUTCFullYear(), month = date.getUTCMonth();
  let from = date, to = date;
  if (period === "weekly") { from = new Date(date); from.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); to = new Date(from); to.setUTCDate(from.getUTCDate() + 6); }
  if (period === "monthly") { from = new Date(Date.UTC(year, month, 1)); to = new Date(Date.UTC(year, month + 1, 0)); }
  if (period === "yearly") { from = new Date(Date.UTC(year, 0, 1)); to = new Date(Date.UTC(year, 11, 31)); }
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}
export function presetRange(period,today,throughToday=false){
 const range=periodDates(period,today);
 return throughToday&&range.to>today?{...range,to:today}:range;
}
export function validRange({from,to},max){
 const valid=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d;
 return valid(from)&&valid(to)&&from<=to&&(!max||to<=max);
}
export function downloadCsv(filename, rows) {
  const cell = value => { const s = String(value ?? ""); return `"${(/^\s*[=+\-@]/.test(s) ? "'" : "") + s.replaceAll('"', '""')}"`; };
  const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

export function submissionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(24)), n => n.toString(16).padStart(2, "0")).join("");
}
