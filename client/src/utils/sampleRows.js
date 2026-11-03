import { coerce, prettify } from "@req-2-report/shared";

// Made-up rows for the preview. The app never runs the query, so these only show how the report will look;
// each value fits its column's type so every format and alignment shows up.

const DAY = 86_400_000;
const START = Date.UTC(2026, 0, 5, 9, 30);
const iso = (ms, withTime) => new Date(ms).toISOString().slice(0, withTime ? 16 : 10);

function sampleValue(c, i) {
  switch (c.type) {
    case "Integer": return 100231 + i;
    case "Decimal": return Math.round((12.5 + i * 3.7) * 100) / 100;
    case "Currency": return 1500 + ((i * 737) % 6000);
    case "Percentage": return Math.round((0.1525 + ((i * 0.0125) % 0.09)) * 10000) / 10000;
    case "Date": return iso(START + i * 3 * DAY, false);
    case "DateTime": return iso(START + i * 3 * DAY + i * 47 * 60_000, true);
    case "Boolean": return i % 4 !== 3;
    default: return `${prettify(c.name)} ${i + 1}`;
  }
}

/** `n` typed rows keyed by column key, the shape the report preview uses. */
export function sampleRows(columns, n = 12) {
  return Array.from({ length: n }, (_, i) => Object.fromEntries(columns.map((c) => [c.key, coerce(sampleValue(c, i), c.type)])));
}
