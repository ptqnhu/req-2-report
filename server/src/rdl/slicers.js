import { family, BLANK, liveSlicers, parseLocalDate, itemPrompt, slicerName } from "@req-2-report/shared";
import { xesc, vbStr, rdlIdent } from "./xml.js";
import { NET_DATE } from "./styles.js";
import { distinctValuesQuery } from "./sqlWrap.js";

// Default values of date ranges, as SSRS expressions worked out when the report runs. [from, to]; null = no limit.
const MONTH_START = "DateSerial(Year(Today), Month(Today), 1)";
const DATE_DEFAULTS = {
  today: ["Today", "Today"],
  last7: ["DateAdd(\"d\", -6, Today)", "Today"],
  last30: ["DateAdd(\"d\", -29, Today)", "Today"],
  mtd: [MONTH_START, "Today"],
  lastmonth: [`DateAdd("m", -1, ${MONTH_START})`, `DateAdd("d", -1, ${MONTH_START})`],
  qtd: ["DateSerial(Year(Today), (DatePart(\"q\", Today) - 1) * 3 + 1, 1)", "Today"],
  ytd: ["DateSerial(Year(Today), 1, 1)", "Today"],
  lastyear: ["DateSerial(Year(Today) - 1, 1, 1)", "DateSerial(Year(Today) - 1, 12, 31)"],
};

/** [from, to] default expressions for a date range slicer ("=Nothing" means no limit). Fixed dates use DateSerial, so the server's locale doesn't matter. */
function dateDefaults(def) {
  const fixed = (x) => { const d = parseLocalDate(x); return d ? `DateSerial(${d.getFullYear()}, ${d.getMonth() + 1}, ${d.getDate()})` : null; };
  const pair = def?.preset === "custom" ? [fixed(def.from), fixed(def.to)] : DATE_DEFAULTS[def?.preset] || [null, null];
  return pair.map((e) => (e ? `=${e}` : "=Nothing"));
}

/**
 * Works out which slicers can be exported. A pick list needs its own query (the distinct values), which needs
 * unique column names; when that isn't possible the slicer becomes a search box and a warning says why.
 * Returns { slicers: [{ col, kind, valuesSql? }], warnings: [text] }.
 */
export function planSlicers(sql, columns, slicers, colsByKey) {
  const warnings = [];
  const namesOk = !columns.some((c) => c.unnamed || c.dup);
  const out = liveSlicers(Array.isArray(slicers) ? slicers : [], colsByKey).map((s) => {
    if (s.kind !== "list") return s;
    const valuesSql = namesOk ? distinctValuesQuery(sql, colsByKey[s.col].name) : null;
    if (valuesSql) return { ...s, valuesSql };
    warnings.push(`“${colsByKey[s.col].label}” is a search box instead of a pick list, because ${namesOk ? "the query can't be used as a subquery" : "every column needs its own name"}.`);
    return { ...s, kind: "search" };
  });
  return { slicers: out, warnings };
}

/**
 * The RDL pieces for the readers' slicers: a values dataset per pick list, the report parameters, the main
 * dataset's filters, and an expression describing the current choices ("Region: West, East | Date: All").
 * Each parameter carries its layout item id (see slicerItems), for placing it on the parameter bar grid.
 * used: parameter names already taken.
 */
export function slicerRdl({ slicers, colsByKey, fieldOf, tpl, used, dataSource }) {
  const datasets = [], params = [], filters = [], summary = [];
  const dsNames = new Set(["maindataset"]);

  for (const s of slicers) {
    const c = colsByKey[s.col];
    const fe = `Fields!${fieldOf[c.key]}.Value`;
    const P = (name) => `Parameters!${name}.Value`;
    const label = slicerName(s, c); // in the "Showing:" line
    const prompt = (side) => xesc(itemPrompt(s, side, c, tpl));

    if (s.kind === "list") {
      const name = rdlIdent(c.name, used);
      const ds = rdlIdent(`Values_${fieldOf[c.key]}`, dsNames);
      const ref = `<DataSetReference><DataSetName>${ds}</DataSetName><ValueField>Value</ValueField>`;
      datasets.push(`<DataSet Name="${ds}"><Query><DataSourceName>${dataSource}</DataSourceName><CommandText>${xesc(s.valuesSql)}</CommandText></Query>` +
        `<Fields><Field Name="Value"><DataField>Value</DataField><rd:TypeName>System.String</rd:TypeName></Field></Fields></DataSet>`);
      params.push({ name, item: s.col, xml: `<ReportParameter Name="${name}"><DataType>String</DataType><DefaultValue>${ref}</DataSetReference></DefaultValue>` +
        `<Prompt>${prompt()}</Prompt><ValidValues>${ref}<LabelField>Value</LabelField></DataSetReference></ValidValues><MultiValue>true</MultiValue></ReportParameter>` });
      const text = `RTrim(CStr(${fe}))`;
      filters.push({ expr: `=IIF(IsNothing(${fe}), "${BLANK}", IIF(${text} = "", "${BLANK}", ${text}))`, op: "In", values: [`=${P(name)}`] });
      summary.push(`${vbStr(label + ": ")} & IIF(Parameters!${name}.Count >= CountRows("${ds}"), "All", Join(Parameters!${name}.Label, ", "))`);
    }

    if (s.kind === "search") {
      const name = rdlIdent(c.name, used);
      params.push({ name, item: s.col, xml: `<ReportParameter Name="${name}"><DataType>String</DataType><DefaultValue><Values><Value>=""</Value></Values></DefaultValue>` +
        `<AllowBlank>true</AllowBlank><Prompt>${prompt()}</Prompt></ReportParameter>` });
      filters.push({ expr: `=Trim(${P(name)}) = "" OrElse InStr(LCase(CStr(${fe})), LCase(Trim(${P(name)}))) > 0`, op: "Equal", values: ["=True"] });
      summary.push(`${vbStr(label + ": ")} & IIF(Trim(${P(name)}) = "", "All", "contains """ & Trim(${P(name)}) & """")`);
    }

    if (s.kind === "range") {
      const date = family(c.type) === "Date";
      const pct = c.type === "Percentage";
      const from = rdlIdent(`${c.name}_From`, used), to = rdlIdent(`${c.name}_To`, used);
      const defaults = date ? dateDefaults(s.def) : ["=Nothing", "=Nothing"];
      [[from, "from"], [to, "to"]].forEach(([name, word], i) => {
        params.push({ name, item: `${s.col}:${word}`, xml: `<ReportParameter Name="${name}"><DataType>${date ? "DateTime" : "Float"}</DataType><Nullable>true</Nullable>` +
          `<DefaultValue><Values><Value>${xesc(defaults[i])}</Value></Values></DefaultValue><Prompt>${prompt(word)}</Prompt></ReportParameter>` });
      });
      const field = date ? `CDate(${fe}).Date` : `CDbl(${fe})`;
      const bound = (name) => (date ? `CDate(${P(name)}).Date` : `CDbl(${P(name)})${pct ? " / 100" : ""}`);
      const side = (name, cmp) => `(IsNothing(${P(name)}) OrElse (Not IsNothing(${fe}) AndAlso ${field} ${cmp} ${bound(name)}))`;
      filters.push({ expr: `=${side(from, ">=")} AndAlso ${side(to, "<=")}`, op: "Equal", values: ["=True"] });
      const show = (name) => `Format(${P(name)}, "${date ? NET_DATE[tpl.dateFormat] : "#,0.##"}")${pct ? ` & "%"` : ""}`;
      summary.push(`${vbStr(label + ": ")} & IIF(IsNothing(${P(from)}), IIF(IsNothing(${P(to)}), "All", "up to " & ${show(to)}), ` +
        `IIF(IsNothing(${P(to)}), "from " & ${show(from)}, ${show(from)} & " to " & ${show(to)}))`);
    }

    if (s.kind === "yesno") {
      const name = rdlIdent(c.name, used);
      const opts = ["All", "Yes", "No"].map((v) => `<ParameterValue><Value>${v}</Value><Label>${v}</Label></ParameterValue>`).join("");
      params.push({ name, item: s.col, xml: `<ReportParameter Name="${name}"><DataType>String</DataType><DefaultValue><Values><Value>All</Value></Values></DefaultValue>` +
        `<Prompt>${prompt()}</Prompt><ValidValues><ParameterValues>${opts}</ParameterValues></ValidValues></ReportParameter>` });
      filters.push({ expr: `=${P(name)} = "All" OrElse (Not IsNothing(${fe}) AndAlso CBool(${fe}) = (${P(name)} = "Yes"))`, op: "Equal", values: ["=True"] });
      summary.push(`${vbStr(label + ": ")} & ${P(name)}`);
    }
  }

  return { datasets, params, filters, summary: summary.length ? `="Showing:  " & ${summary.join(` & "     |     " & `)}` : "" };
}
