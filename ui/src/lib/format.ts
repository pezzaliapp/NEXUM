const nf = new Intl.NumberFormat("it-IT");
const nf2 = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

export const num = (n: number | null | undefined) => (n == null ? "—" : nf.format(n));
export const conf = (n: number | null | undefined) => (n == null ? "—" : nf2.format(n));
export const km = (n: number | null | undefined) => (n == null ? "—" : `${nf1.format(n)} km`);
export const pct = (n: number) => `${nf1.format(n * 100)}%`;

export function utc(ms: number | null | undefined, precision: "day" | "minute" | "second" = "minute"): string {
  if (ms == null) return "—";
  const iso = new Date(ms).toISOString();
  if (precision === "day") return iso.slice(0, 10);
  if (precision === "second") return iso.slice(0, 19).replace("T", " ") + " UTC";
  return iso.slice(0, 16).replace("T", " ") + " UTC";
}

export function duration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const sign = ms < 0 ? "−" : "";
  let s = Math.abs(ms) / 1000;
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.round(s / 60);
  if (d) return `${sign}${d} g ${h} h`;
  if (h) return `${sign}${h} h ${m} min`;
  return `${sign}${m} min`;
}

export function bytes(n: number): string {
  return n > 1e6 ? `${nf1.format(n / 1e6)} MB` : `${nf1.format(n / 1e3)} kB`;
}
