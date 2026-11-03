import { useState } from "react";
import { DEFAULT_TPL, templateStyle } from "@req-2-report/shared";
import UserBadge from "./components/UserBadge.jsx";
import TemplateDesigner from "./components/TemplateDesigner.jsx";
import { useTemplates } from "./hooks/useTemplates.js";

const STYLE_NAMES = { loanmart: "LoanMart", ledger: "Ledger", clean: "Clean", contrast: "Contrast" };
const DENSITY_NAMES = { compact: "compact rows", normal: "normal rows", comfortable: "roomy rows" };

/** One line about a template: "Ledger · compact rows · fit to width". */
const summary = (t) => [
  STYLE_NAMES[t.theme] || t.theme,
  DENSITY_NAMES[t.density],
  t.layout === "fit" ? "fit to width" : "expands for every column",
].filter(Boolean).join(" · ");

/**
 * The template designer, on its own page (#/templates): make, edit and delete templates on sample data,
 * without a database. Reports pick them up in the Template step.
 */
export default function TemplatesPage() {
  const { templates, message, setMessage, save, remove } = useTemplates();
  const [designing, setDesigning] = useState(null); // the template the designer starts from, while it's open

  const open = (start) => { setMessage(""); setDesigning(start); window.scrollTo(0, 0); };
  async function onSave(t) {
    if (!(await save(t))) return;
    setDesigning(null);
    setMessage(`Saved “${t.name}”. Pick it in the Template step of any SSRS report.`);
  }
  async function onDelete(name) {
    if (window.confirm(`Delete the template “${name}”? Reports you've already exported keep their look.`)) await remove(name);
  }

  return (
    <div className="rb">
      <div className="rb-shell">
        <header className="rb-rail">
          <div className="rail-end">
            <a className="btn btn-sm" href="#/build">Create SSRS report</a>
            <UserBadge />
          </div>
        </header>

        <main className="rb-main">
          <div className="page-head">
            <p className="stepno">Template designer</p>
            <h1>{designing ? (designing.name ? `Edit “${designing.name}”` : "New template") : "Report templates"}</h1>
            <p className="help">
              Design a template once on sample data: layout, style, header, footer and formats. Then apply it to any
              SSRS report in the builder's Template step.
            </p>
          </div>

          {designing ? (
            <TemplateDesigner start={designing} names={templates.map((t) => t.name)} message={message}
              onSave={onSave} onCancel={() => open(null)} />
          ) : (
            <div className="panel">
              <div className="row between" style={{ marginBottom: 14 }}>
                <span className="fld-label" style={{ margin: 0 }}>Your templates ({templates.length})</span>
                <button className="btn btn-primary btn-sm" onClick={() => open({ ...templateStyle(DEFAULT_TPL), name: "" })}>New template</button>
              </div>
              {message && <p className="fld-hint" style={{ marginBottom: 12 }}>{message}</p>}
              {templates.length === 0 ? (
                <p className="muted">No templates yet. Click New template to design one on sample data.</p>
              ) : (
                <ul className="tpl-cards">
                  {templates.map((t) => (
                    <li key={t.name} className="tpl-card">
                      <strong>{t.name}</strong>
                      <span className="muted">{summary(t)}</span>
                      <span className="row" style={{ gap: 6, marginTop: 8 }}>
                        <button className="btn btn-sm" onClick={() => open({ ...templateStyle(t), name: t.name })}>Edit</button>
                        <button className="btn btn-quiet btn-sm" onClick={() => onDelete(t.name)}>Delete</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
