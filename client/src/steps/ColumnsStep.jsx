import { TYPES, formatValue, distinctDisplays, displayOf } from "@req-2-report/shared";
import TypeBadge from "../components/TypeBadge.jsx";

// Used to show the display options when a column has no values in the preview rows
const EXAMPLE = { Text: "Sample text", Integer: 12345, Decimal: 1234.5678, Currency: -1234.5, Percentage: 0.1234, Boolean: true };

/**
 * The display options for a column, each shown as an example value from the column's own data. Options that would
 * look exactly like one above them are left out (distinctDisplays), except the one already chosen.
 */
function displayChoices(c, rows, tpl) {
  const found = rows.find((r) => r[c.key] !== null && r[c.key] !== undefined && r[c.key] !== "");
  const sample = found ? found[c.key] : EXAMPLE[c.type] ?? new Date(2026, 2, 14, 15, 30);
  const options = distinctDisplays(c, tpl);
  const chosen = displayOf(c);
  if (!options.some(([id]) => id === chosen)) options.push([chosen]);
  return options.map(([id]) => {
    const col = { ...c, display: id };
    const ex = c.type === "Boolean" ? `${formatValue(true, col, tpl) || "blank"} / ${formatValue(false, col, tpl) || "blank"}` : formatValue(sample, col, tpl);
    return [id, ex];
  });
}

/**
 * Columns, their data types and how their values are shown, in one list: tick the columns to include, check or
 * change each one's type, and pick how it's displayed in the report. Unticked columns stay in the list, dimmed, so
 * they can be added back. Display choices are saved in the template, by column name.
 */
export default function ColumnsStep({ columns, setColumns, rows, tpl, setTpl }) {
  const selectedCount = columns.filter((c) => c.selected).length;
  const setAll = (val) => setColumns((cs) => cs.map((c) => ({ ...c, selected: val })));
  const toggle = (key) => setColumns((cs) => cs.map((c) => (c.key === key ? { ...c, selected: !c.selected } : c)));
  const setType = (key, type) => setColumns((cs) => cs.map((c) => (c.key === key ? { ...c, type } : c)));
  const setDisplay = (name, display) => setTpl((t) => ({ ...t, cols: { ...t.cols, [name]: { ...(t.cols[name] || {}), display } } }));

  return (
    <div className="panel" style={{ padding: 0 }}>
      <div className="row between cols-bar">
        <p className="muted"><strong style={{ color: "var(--ink)" }}>{selectedCount}</strong> of {columns.length} columns selected</p>
        <div className="row">
          <button className="btn btn-sm" onClick={() => setAll(true)} disabled={selectedCount === columns.length}>Select all</button>
          <button className="btn btn-sm" onClick={() => setAll(false)} disabled={selectedCount === 0}>Clear all</button>
        </div>
      </div>
      <div className="types-head"><span /><span>Column</span><span>Type</span><span>Display as</span><span>Preview</span></div>
      {columns.map((raw) => {
        // With its display choice, for the examples: the column's own, else its data type's from the template
        const own = tpl.cols[raw.name]?.display;
        const c = { ...raw, display: own && own !== "auto" ? own : tpl.types?.[raw.type]?.display };
        return (
        <div className={`types-row${c.selected ? "" : " off"}`} key={c.key}>
          <input type="checkbox" className="types-check" checked={c.selected} onChange={() => toggle(c.key)} aria-label={`Include ${c.name}`} />
          <div style={{ minWidth: 0 }}>
            <div className="col-name">{c.name}</div>
            <span className="col-expr" style={{ display: "block" }}>{c.sqlType}{c.nullable ? ", can be empty" : ""}</span>
            {c.unnamed && <span className="changed" style={{ display: "block" }}>No name. Add an alias with AS in the query.</span>}
            {c.dup && <span className="changed" style={{ display: "block" }}>Duplicate name. Give it a different alias.</span>}
          </div>
          <div className="types-pick">
            <TypeBadge type={c.type} />
            <select className="sel" value={c.type} onChange={(e) => setType(c.key, e.target.value)} aria-label={`Type for ${c.name}`}>
              {TYPES.map((t) => <option key={t} value={t}>{t}{t === c.suggested ? " (suggested)" : ""}</option>)}
            </select>
          </div>
          <select className="sel" value={displayOf(c)} onChange={(e) => setDisplay(c.name, e.target.value)} aria-label={`Display ${c.name} as`}>
            {displayChoices(c, rows, tpl).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <div className="samples">
            {(() => {
              // The first value that isn't empty, as an example of what the column holds
              const found = rows.find((r) => r[c.key] !== null && r[c.key] !== undefined && r[c.key] !== "");
              return found
                ? <span>{formatValue(found[c.key], c, tpl)}</span>
                : rows.length > 0 && <span className="rt-null">All blank in the preview rows</span>;
            })()}
          </div>
        </div>
        );
      })}
    </div>
  );
}
