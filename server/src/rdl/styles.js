import { NUMERIC, numberSpec, dateSpec, THEME_COLORS } from "@req-2-report/shared";

export const NET_TYPE = {
  Text: "System.String", Integer: "System.Int32", Decimal: "System.Decimal", Currency: "System.Decimal",
  Percentage: "System.Decimal", Date: "System.DateTime", DateTime: "System.DateTime", Boolean: "System.Boolean",
};
export const NET_DATE = { "D MMM YYYY": "d MMM yyyy", "YYYY-MM-DD": "yyyy-MM-dd", "MM/DD/YYYY": "MM'/'dd'/'yyyy", "DD/MM/YYYY": "dd'/'MM'/'yyyy", "MMM YYYY": "MMM yyyy" };

/** Table colours per style (shared/look.js, so the template designer starts from the same values). */
export const THEME_RDL = THEME_COLORS;
export const DENSITY_RDL = {
  compact: { pad: 2, size: 9, h: 0.22 },
  normal: { pad: 4, size: 10, h: 0.28 },
  comfortable: { pad: 7, size: 10, h: 0.36 },
};

/**
 * .NET format string matching the app's display of a column (shared/display.js). Numbers: "#,0.00", "'$'#,0.00;('$'#,0.00)";
 * thousands and millions use .NET's scaling commas just left of the decimal point: "#,0,.0K" = 1234 -> 1.2K.
 */
export function netFormat(c, tpl) {
  if (NUMERIC.has(c.type)) {
    const s = numberSpec(c, tpl);
    const sym = s.currency ? (tpl.currency || "").replace(/['"\\]/g, "") : "";
    const q = sym ? `'${sym}'` : "";
    const body = (s.group ? "#,0" : "0") + { 1: "", 1e3: ",", 1e6: ",," }[s.scale] + (s.dec ? "." + "0".repeat(s.dec) : "") +
      (s.suffix ? `"${s.suffix}"` : "") + (s.pct ? "%" : "");
    if (s.parens) return `${q}${body};(${q}${body})`;
    return s.currency ? `${q}${body};-${q}${body}` : body;
  }
  if (c.type === "Date" || c.type === "DateTime") {
    const s = dateSpec(c, tpl);
    return [s.date && NET_DATE[s.date], s.time && (s.seconds ? "HH:mm:ss" : "HH:mm")].filter(Boolean).join(" ");
  }
  return null;
}

/** Column width in inches from the template setting, or a guess from type and heading length. */
export function colWidth(c) {
  const fixed = { narrow: 0.9, medium: 1.6, wide: 2.6 }[c.width];
  if (fixed) return fixed;
  const base = { Text: 1.6, Integer: 0.9, Decimal: 1.1, Currency: 1.2, Percentage: 0.9, Date: 1.1, DateTime: 1.5, Boolean: 0.8 }[c.type] || 1.2;
  return Math.max(base, Math.min(3, c.label.length * 0.085 + 0.35));
}
