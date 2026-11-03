import { useState } from "react";
import { templateStyle } from "@req-2-report/shared";
import TypeBadge from "../components/TypeBadge.jsx";
import ReportDocument from "../components/ReportDocument.jsx";
import TemplateSettings from "../components/TemplateSettings.jsx";
import { useTemplates } from "../hooks/useTemplates.js";

export default function TemplateStep({ tpl, setTpl, effCols, previewProps }) {
  const { templates, message } = useTemplates(); // message: only set when the saved templates fail to load
  // Column settings show one column at a time, picked from a dropdown
  const [editKey, setEditKey] = useState(null);
  const editIdx = Math.max(0, effCols.findIndex((c) => c.key === editKey));
  const ec = effCols[editIdx];

  const patch = (p) => setTpl((t) => ({ ...t, ...p }));
  const patchCol = (name, p) => setTpl((t) => ({ ...t, cols: { ...t.cols, [name]: { ...(t.cols[name] || {}), ...p } } }));
  function move(name, dir) {
    const names = effCols.map((c) => c.name);
    const i = names.indexOf(name), j = i + dir;
    if (j < 0 || j >= names.length) return;
    [names[i], names[j]] = [names[j], names[i]];
    setTpl((t) => ({ ...t, order: [...names, ...t.order.filter((n) => !names.includes(n))] }));
  }

  /** A saved template picked as the style: its whole look applies. The report's own column settings stay. */
  const applyTemplate = (found) => setTpl((t) => ({ ...t, ...templateStyle(found), name: found.name }));

  return (
    <div className="tpl-grid">
      {/* Left column: the look, then this report's own column settings in a panel of their own */}
      <div className="tpl-side">
        <div className="panel">
          {/* Saved templates are offered in the Style list next to the built-in styles. Column layout, header and
              footer come from the style or template; they're set in the template designer */}
          <TemplateSettings tpl={tpl} patch={patch} sections={["look"]} templates={templates} onTemplate={applyTemplate} />
          <p className="fld-hint" style={{ marginTop: 10 }}>
            {message ? `${message} ` : ""}Your own styles come from the <a href="#/templates">template designer</a>. Changes here apply to this report only.
          </p>
        </div>

        <div className="panel">
          <h3 className="panel-title">Columns ({effCols.length})</h3>
          {ec && (
            <>
              <select className="sel colset-pick" value={ec.key} onChange={(e) => setEditKey(e.target.value)} aria-label="Column to edit">
                {effCols.map((c, i) => <option key={c.key} value={c.key}>{i + 1}. {c.label}</option>)}
              </select>
              <div className="colset">
                <div className="kv">
                  <label htmlFor="col-head">Heading</label>
                  <input id="col-head" className="inp" value={ec.label} onChange={(e) => patchCol(ec.name, { label: e.target.value })} />
                  <span>Type</span>
                  <span><TypeBadge type={ec.type} showType /></span>
                  <label htmlFor="col-align">Align</label>
                  <select id="col-align" className="sel" value={ec.align} onChange={(e) => patchCol(ec.name, { align: e.target.value })}>
                    <option value="auto">Auto</option><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
                  </select>
                  <label htmlFor="col-width">Width</label>
                  <select id="col-width" className="sel" value={ec.width} onChange={(e) => patchCol(ec.name, { width: e.target.value })}>
                    <option value="auto">Auto</option><option value="narrow">Narrow</option><option value="medium">Medium</option><option value="wide">Wide</option>
                  </select>
                  <span>Position</span>
                  <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <button className="btn btn-sm" onClick={() => move(ec.name, -1)} disabled={editIdx === 0} aria-label="Move column left">← Left</button>
                    <button className="btn btn-sm" onClick={() => move(ec.name, 1)} disabled={editIdx === effCols.length - 1} aria-label="Move column right">Right →</button>
                  </span>
                </div>
                <label className="check"><input type="checkbox" checked={ec.wrap} onChange={(e) => patchCol(ec.name, { wrap: e.target.checked })} />Wrap long text</label>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="tpl-preview">
        <ReportDocument {...previewProps} limit={10} />
      </div>
    </div>
  );
}
