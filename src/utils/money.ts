export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(roundMoney(value));
}

export function parseMoney(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return roundMoney(value);
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/[฿,\s]/g, "").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? roundMoney(parsed) : fallback;
}
