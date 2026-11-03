import { family, slicerKinds, defaultSlicerKind, DATE_PRESETS, presetRange } from "@req-2-report/shared";
import ReportDocument from "../components/ReportDocument.jsx";
import SlicerBar from "../components/SlicerBar.jsx";

/**
 * Title, description, and the readers' slicers: the filters SSRS shows above the report so readers can slice the
 * data themselves.
 */
export default function DetailsStep({
  title, setTitle, desc, setDesc, effCols, colsByKey, tpl, previewProps,
  slicers, setSlicers, sliceValues, setSliceValues, filteredRows, paramLayout, setParamLayout, onRename,
}) {
  /** A date range's default: saved on the slicer (exported) and applied to the preview straight away. */
  function setDef(col, def) {
    setSlicers((ss) => ss.map((x) => (x.col === col ? { ...x, def } : x)));
    setSliceValues((v) => ({ ...v, [col]: def.preset === "none" ? undefined : presetRange(def) }));
  }

  return (
    <>
      <div className="panel">
        <label className="fld">
          <span className="fld-label">Report title</span>
          <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Orders by customer, Q3 2026" />
        </label>
        <label className="fld" style={{ marginTop: 14 }}>
          <span className="fld-label">Description (optional)</span>
          <textarea className="ta" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What the report covers and who it's for" />
        </label>
      </div>

      <div className="panel">
        <div className="row between" style={{ marginBottom: 6 }}>
          <span className="fld-label" style={{ margin: 0 }}>Filters for readers</span>
          <select className="sel" value="" onChange={(e) => e.target.value && setSlicers((ss) => [...ss, { col: e.target.value, kind: defaultSlicerKind(colsByKey[e.target.value], filteredRows) }])}
            aria-label="Add a filter for readers" disabled={slicers.length >= effCols.length}>
            <option value="">Add a column…</option>
            {effCols.filter((c) => !slicers.some((s) => s.col === c.key)).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <p className="muted" style={{ marginBottom: 12 }}>
          Readers change these in SSRS, above the report, to slice the data. Each starts on All (or the default you set
          for a date), so you control what the report opens with. Try them on the preview below.
        </p>
        {slicers.length === 0 ? (
          <p className="muted">None yet. Add a column so readers can filter the report themselves.</p>
        ) : (
          <div className="filters">
            {slicers.map((s) => {
              const c = colsByKey[s.col], kinds = slicerKinds(c);
              return (
                <div className="filter-row" key={s.col}>
                  <strong className="slicer-col">{c.label}</strong>
                  {kinds.length > 1 ? (
                    <select className="sel" value={s.kind} aria-label={`How readers filter ${c.label}`}
                      onChange={(e) => { setSlicers((ss) => ss.map((x) => (x.col === s.col ? { ...x, kind: e.target.value } : x))); setSliceValues((v) => ({ ...v, [s.col]: undefined })); }}>
                      {kinds.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  ) : <span className="unit">{kinds[0][1]}</span>}
                  {s.kind === "range" && family(c.type) === "Date" && (
                    <>
                      <span className="unit">Starts on</span>
                      <select className="sel" value={s.def?.preset || "none"} aria-label={`Default for ${c.label}`}
                        onChange={(e) => setDef(s.col, { preset: e.target.value, from: s.def?.from || "", to: s.def?.to || "" })}>
                        {DATE_PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      {s.def?.preset === "custom" && ["from", "to"].map((side) => (
                        <input key={side} className="inp" type="date" value={s.def[side]} aria-label={`Default ${c.label} ${side}`}
                          onChange={(e) => setDef(s.col, { ...s.def, [side]: e.target.value })} />
                      ))}
                      {s.def?.preset && !["none", "custom"].includes(s.def.preset) && (
                        <span className="pending">Rolls forward: worked out each time the report runs</span>
                      )}
                    </>
                  )}
                  <button className="btn btn-quiet btn-sm" style={{ marginLeft: "auto" }}
                    onClick={() => { setSlicers((ss) => ss.filter((x) => x.col !== s.col)); setSliceValues((v) => ({ ...v, [s.col]: undefined })); }}>Remove</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <ReportDocument {...previewProps} limit={5} filterBar={slicers.length > 0 && (
          <SlicerBar slicers={slicers} values={sliceValues} setValues={setSliceValues} colsByKey={colsByKey} rows={filteredRows} tpl={tpl}
            layout={paramLayout} setLayout={setParamLayout} onRename={onRename} />
        )} />
      </div>
    </>
  );
}
