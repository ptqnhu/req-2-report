import { NUMERIC, idLike } from "@req-2-report/shared";

export const WIDTHS = { auto: undefined, narrow: 90, medium: 160, wide: 260 };

export { sortRows } from "@req-2-report/shared"; // shared with the .rdl export, so the preview sorts the same way

/** Sum for numbers, average for percentages. Returns null when nothing is totalled. */
export function computeTotals(cols, rows) {
  const out = {};
  let any = false;
  cols.forEach((c) => {
    if (!NUMERIC.has(c.type) || idLike(c.name)) return;
    const vals = rows.map((r) => r[c.key]).filter((v) => typeof v === "number");
    if (!vals.length) return;
    const sum = vals.reduce((a, b) => a + b, 0);
    out[c.key] = c.type === "Percentage" ? { value: sum / vals.length, kind: "avg" } : { value: sum, kind: "sum" };
    any = true;
  });
  return any ? out : null;
}
