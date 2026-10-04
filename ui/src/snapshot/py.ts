// Python semantics needed to reproduce the Core exactly in the browser: truthiness, float repr, round() and
// the length of json.dumps() (used by the Core's byte budget). Pure functions, unit-tested.

/** Python truthiness of a JSON value (None, False, 0, "", [] and {} are false). */
export function truthy(x: unknown): boolean {
  if (x === null || x === undefined || x === false || x === 0 || x === "") return false;
  if (Array.isArray(x)) return x.length > 0;
  if (typeof x === "object") return Object.keys(x as object).length > 0;
  return true;
}

/** repr() of a Python float (shortest round-trip digits, Python's fixed/exponent switch). */
export function pyFloatRepr(x: number): string {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  if (x === 0) return Object.is(x, -0) ? "-0.0" : "0.0";
  const [mant, expS] = Math.abs(x).toExponential().split("e");
  const exp = parseInt(expS, 10);
  const digits = mant.replace(".", "");
  const sign = x < 0 ? "-" : "";
  if (exp >= -4 && exp < 16) {
    if (exp >= 0) {
      const ip = digits.slice(0, exp + 1).padEnd(exp + 1, "0");
      const fp = digits.slice(exp + 1) || "0";
      return `${sign}${ip}.${fp}`;
    }
    return `${sign}0.${"0".repeat(-exp - 1)}${digits}`;
  }
  const m = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
  const e = `${exp < 0 ? "-" : "+"}${String(Math.abs(exp)).padStart(2, "0")}`;
  return `${sign}${m}e${e}`;
}

/** round(x, n) of a Python float: correctly rounded, ties to even, on the exact binary value. */
export function pyRound(x: number, n: number): number {
  if (!Number.isFinite(x)) return x;
  const neg = x < 0;
  const s = Math.abs(x).toFixed(100);
  const [ip, fp] = s.split(".");
  const keep = fp.slice(0, n);
  const rest = fp.slice(n);
  let q = BigInt(ip + keep);
  const d = rest.charCodeAt(0) - 48;
  const tailNonZero = /[1-9]/.test(rest.slice(1));
  if (d > 5 || (d === 5 && (tailNonZero || q % 2n === 1n))) q += 1n;
  const qs = q.toString().padStart(n + 1, "0");
  const r = n > 0 ? Number(`${qs.slice(0, qs.length - n)}.${qs.slice(qs.length - n)}`) : Number(qs);
  return neg ? -r : r;
}

function strLen(s: string): number {
  // json.dumps(ensure_ascii=True): every non-ASCII UTF-16 unit becomes \uXXXX
  let n = 2;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 34 || c === 92 || c === 8 || c === 9 || c === 10 || c === 12 || c === 13) n += 2;
    else if (c < 32 || c > 126) n += 6;
    else n += 1;
  }
  return n;
}

function numLen(x: number): number {
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return String(x).length;
  return pyFloatRepr(x).length;
}

/** len(json.dumps(v, default=str)) with Python's default separators (", " and ": ").
 *  Integral floats are counted as ints (JSON cannot tell them apart): the value is used only for the byte budget. */
export function pyJsonLen(v: unknown): number {
  if (v === null || v === undefined) return 4;
  if (v === true) return 4;
  if (v === false) return 5;
  if (typeof v === "number") return numLen(v);
  if (typeof v === "string") return strLen(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return 2;
    let n = 2 + 2 * (v.length - 1);
    for (const x of v) n += pyJsonLen(x);
    return n;
  }
  const keys = Object.keys(v as object);
  if (keys.length === 0) return 2;
  let n = 2 + 2 * (keys.length - 1);
  for (const k of keys) n += strLen(k) + 2 + pyJsonLen((v as any)[k]);
  return n;
}

/** Python's `a < b` for the tuples used as sort keys (numbers, strings; None sorts first as in SQLite). */
export function cmp(a: readonly unknown[], b: readonly unknown[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] as any, y = b[i] as any;
    if (x === y) continue;
    if (x === null || x === undefined) return -1;
    if (y === null || y === undefined) return 1;
    return x < y ? -1 : x > y ? 1 : 0;
  }
  return a.length - b.length;
}

/** Python int() of a query-string value (None when it is not an integer literal). */
export function pyInt(s: string): number | null {
  const t = s.trim().replace(/_/g, "");
  return /^[-+]?\d+$/.test(t) ? parseInt(t, 10) : null;
}

/** Python floor division and modulo (divmod) for integers. */
export function divmod(a: number, b: number): [number, number] {
  const q = Math.floor(a / b);
  return [q, a - q * b];
}
