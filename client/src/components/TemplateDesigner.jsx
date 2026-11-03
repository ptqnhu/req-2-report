import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_TPL, effectiveColumns, keyBy } from "@req-2-report/shared";
import TemplateSettings from "./TemplateSettings.jsx";
import ReportDocument from "./ReportDocument.jsx";
import ElementEditor, { pickName, pickOptions } from "./ElementEditor.jsx";
import { SAMPLE_COLUMNS, SAMPLE_ROWS } from "../utils/sampleData.js";

const SAMPLE_TYPES = [...new Set(SAMPLE_COLUMNS.map((c) => c.type))];
// A few rows are enough to show alternate shading, and keep the totals row and footer in view while designing
const DESIGN_ROWS = SAMPLE_ROWS.slice(0, 5);
const pickKey = (p) => (p ? `${p.kind}:${p.name}` : "");

/** Sets or clears (value undefined) one setting in tpl.look / tpl.types, dropping groups left empty. */
function setIn(groups, name, prop, value) {
  const g = { ...(groups?.[name] || {}) };
  if (value === undefined) delete g[prop]; else g[prop] = value;
  const out = { ...groups, [name]: g };
  if (!Object.keys(g).length) delete out[name];
  return out;
}

/**
 * Designs a reusable template on a sample loan dataset rather than a real query, so it only holds
 * report-wide settings and fits any report. Click any part of the sample report (title, column headings, a
 * currency cell, …) to change its colours, size and more. `start` is the template to begin from (with `name` when
 * editing one). onSave(template) stores it.
 */
export default function TemplateDesigner({ start, names, onSave, onCancel, message }) {
  const editing = start.name;
  const [draft, setDraft] = useState({ ...DEFAULT_TPL, ...start, order: [], cols: {} });
  const [pick, setPick] = useState(null); // { kind: "part" | "type", name } being edited
  const [problem, setProblem] = useState("");
  const [sideOpen, setSideOpen] = useState(true); // the settings sidebar
  const [elOpen, setElOpen] = useState(true); // its "Edit an element" section
  const canvas = useRef(null);

  // Picking something shows its settings: the sidebar and its element section open
  useEffect(() => { if (pick) { setSideOpen(true); setElOpen(true); } }, [pick]);
  const patch = (p) => setDraft((d) => ({ ...d, ...p }));

  const cols = useMemo(() => effectiveColumns(SAMPLE_COLUMNS, draft), [draft]);
  const colsByKey = useMemo(() => keyBy(cols), [cols]);
  // The organisation and footer show placeholder text here, so they can be styled before they're filled in
  const shown = { ...draft, org: draft.org || "Organisation", footer: draft.footer || "Footer note" };

  /** A click on the sample report picks the part (or the data type of the cell) under it. */
  function onCanvasClick(e) {
    const el = e.target.closest("[data-part], [data-type]");
    if (!el || !canvas.current.contains(el)) return;
    setPick(el.dataset.type ? { kind: "type", name: el.dataset.type } : { kind: "part", name: el.dataset.part });
  }

  // Outline what's being edited
  useEffect(() => {
    const root = canvas.current;
    if (!root || !pick) return;
    const sel = pick.kind === "part" ? `[data-part="${pick.name}"]` : `[data-type="${pick.name}"]`;
    const els = [...root.querySelectorAll(sel)];
    els.forEach((el) => el.classList.add("is-picked"));
    return () => els.forEach((el) => el.classList.remove("is-picked"));
  });

  // The band only exists in the LoanMart style
  useEffect(() => { if (pick?.name === "band" && draft.theme !== "loanmart") setPick(null); }, [draft.theme, pick]);

  function change(prop, value) {
    const key = pick.kind === "part" ? "look" : "types";
    setDraft((d) => ({ ...d, [key]: setIn(d[key], pick.name, prop, value) }));
  }
  function resetPick() {
    const key = pick.kind === "part" ? "look" : "types";
    setDraft((d) => { const g = { ...d[key] }; delete g[pick.name]; return { ...d, [key]: g }; });
  }

  async function save() {
    const name = draft.name.trim();
    if (!name) return setProblem("Name the template before saving it.");
    if (name !== editing && names.includes(name) && !window.confirm(`A template called “${name}” already exists. Replace it?`)) return;
    setProblem("");
    await onSave({ ...draft, name });
  }

  const options = pickOptions(SAMPLE_TYPES, draft.theme);
  const changed = pick && Object.keys((pick.kind === "part" ? draft.look : draft.types)?.[pick.name] || {}).length > 0;

  return (
    <div className="dz">
      {/* Toolbar: name and save, across the top so the preview gets the width */}
      <div className="dz-bar panel">
        <input className="inp" value={draft.name} onChange={(e) => patch({ name: e.target.value })}
          placeholder="Template name, e.g. Collections monthly" aria-label="Template name" autoFocus />
        <button className="btn btn-primary btn-sm" onClick={save}>Save template</button>
        <button className="btn btn-quiet btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-sm dz-toggle" onClick={() => setSideOpen((o) => !o)} aria-expanded={sideOpen} aria-controls="dz-side">
          {sideOpen ? "Hide settings" : "Show settings"}
        </button>
        {(problem || message) && <p className="fld-hint dz-msg">{problem || message}</p>}
      </div>

      <div className={`dz-body${sideOpen ? "" : " closed"}`}>
        <div className="dz-canvas tpl-canvas" ref={canvas} onClick={onCanvasClick}>
          <ReportDocument cols={cols} rows={DESIGN_ROWS} totalRows={DESIGN_ROWS.length} tpl={shown} colsByKey={colsByKey}
            title="Sample report" desc="Example loans, to show how the template looks" />
          <p className="dz-tip">Click any part of the sample report to change it.</p>
        </div>

        {/* Sidebar: every group is a dropdown section; the element editor opens when something is clicked */}
        {sideOpen && (
          <aside id="dz-side" className="dz-side panel" aria-label="Template settings">
            <details className="acc" open={elOpen} onToggle={(e) => setElOpen(e.currentTarget.open)}>
              <summary>Edit an element{pick ? `: ${pickName(pick)}` : ""}</summary>
              <div className="acc-body el-editor">
                <select className="sel" style={{ width: "100%", marginBottom: 12 }} value={pickKey(pick)} aria-label="Element to edit"
                  onChange={(e) => setPick(options.find((o) => pickKey(o) === e.target.value) || null)}>
                  <option value="">Choose an element</option>
                  {options.map((o) => <option key={pickKey(o)} value={pickKey(o)}>{pickName(o)}</option>)}
                </select>
                {pick ? (
                  <>
                    <ElementEditor tpl={draft} pick={pick} onChange={change} onPick={setPick} sampleCols={cols} />
                    {changed && <button className="btn btn-quiet btn-sm" style={{ marginTop: 10 }} onClick={resetPick}>Reset {pickName(pick).toLowerCase()}</button>}
                  </>
                ) : (
                  <p className="muted">Click the title, the column headings, a cell, the totals row or anything else in the sample report to change its colours, text size and more.</p>
                )}
              </div>
            </details>
            <TemplateSettings tpl={draft} patch={patch} collapsible />
          </aside>
        )}
      </div>
    </div>
  );
}
