import { OPS, NO_VALUE_OPS, family, filterActive, describeFilter, parseLocalDate } from "@req-2-report/shared";
import { vbStr, rdlIdent } from "./xml.js";

const RDL_OPS = {
  eq: "Equal", neq: "NotEqual", gt: "GreaterThan", gte: "GreaterThanOrEqual", lt: "LessThan", lte: "LessThanOrEqual",
  between: "Between", on: "Equal", before: "LessThan", after: "GreaterThan",
};

/**
 * Turns the app's filters into RDL dataset filters.
 * mode "params": filters that take a value become report parameters (with the user's value as default).
 * used: parameter names already taken (shared with the readers' slicers).
 * Returns { filters: [{expr, op, values}], params: [{name, dataType, def, prompt}], summary: [text] }.
 */
export function buildFilters(filters, colsByKey, fieldOf, mode, tpl, used = new Set()) {
  const out = [], params = [], summary = [];

  filters.forEach((f) => {
    const c = colsByKey[f.col];
    if (!filterActive(f, c)) return;
    const fe = `Fields!${fieldOf[c.key]}.Value`;
    const fam = family(c.type);
    const asParam = mode === "params" && !NO_VALUE_OPS.has(f.op);
    const opLabel = (OPS[fam].find((o) => o[0] === f.op) || [])[1];
    const mkParam = (suffix, dataType, def, prompt) => {
      const name = rdlIdent(`P_${c.name}${suffix}`, used);
      params.push({ name, dataType, def, prompt });
      return `Parameters!${name}.Value`;
    };
    const push = (expr, op, values) => out.push({ expr, op, values });
    if (!asParam) summary.push(describeFilter(f, c, tpl));

    if (f.op === "empty" || f.op === "notempty") return push(`=IsNothing(${fe}) OrElse CStr(${fe}) = ""`, "Equal", [f.op === "empty" ? "=True" : "=False"]);
    if (f.op === "true") return push(`=IIF(IsNothing(${fe}), False, CBool(${fe}))`, "Equal", ["=True"]);
    if (f.op === "false") return push(`=IIF(IsNothing(${fe}), True, CBool(${fe}))`, "Equal", ["=False"]);

    if (fam === "Text") {
      const src = asParam ? `LCase(${mkParam("", "String", f.value, `${c.label} ${opLabel}`)})` : vbStr(f.value.toLowerCase());
      const lower = `LCase(CStr(${fe}))`;
      if (f.op === "contains") push(`=${lower}`, "Like", [`="*" & ${src} & "*"`]);
      else if (f.op === "starts") push(`=${lower}`, "Like", [`=${src} & "*"`]);
      else if (f.op === "equals") push(`=${lower}`, "Equal", [`=${src}`]);
      else if (f.op === "notcontains") push(`=InStr(${lower}, ${src}) > 0`, "Equal", ["=False"]);
      return;
    }

    const between = f.op === "between";
    if (fam === "Number") {
      const pct = c.type === "Percentage"; // entered as 15, stored as 0.15
      const val = (raw, suffix, prompt) =>
        asParam ? `=CDbl(${mkParam(suffix, "Float", raw, prompt)})${pct ? " / 100" : ""}` : `=CDbl(${parseFloat(raw) / (pct ? 100 : 1)})`;
      const vals = between
        ? [val(f.value, "_From", `${c.label} from`), val(f.value2, "_To", `${c.label} to`)]
        : [val(f.value, "", `${c.label} ${opLabel}`)];
      return push(`=CDbl(${fe})`, RDL_OPS[f.op], vals);
    }

    if (fam === "Date") {
      const val = (raw, suffix, prompt) => {
        if (asParam) return `=CDate(${mkParam(suffix, "DateTime", raw, prompt)}).Date`;
        const d = parseLocalDate(raw);
        return `=DateSerial(${d.getFullYear()}, ${d.getMonth() + 1}, ${d.getDate()})`;
      };
      const vals = between
        ? [val(f.value, "_From", `${c.label} from`), val(f.value2, "_To", `${c.label} to`)]
        : [val(f.value, "", `${c.label} ${opLabel}`)];
      return push(`=CDate(${fe}).Date`, RDL_OPS[f.op], vals);
    }
  });

  return { filters: out, params, summary };
}
