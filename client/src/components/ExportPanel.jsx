import { useState } from "react";
import Segmented from "./Segmented.jsx";
import { downloadText } from "../utils/download.js";

export default function ExportPanel({ exp, onChange, result }) {
  const [msg, setMsg] = useState("");
  const set = (p) => { onChange(p); setMsg(""); };
  const ready = !!result.rdl && !result.loading;

  function download() {
    downloadText(result.rdl, result.fileName, "application/xml");
    setMsg(`Downloaded ${result.fileName}. In the SSRS web portal, open a folder and choose Upload.`);
  }
  function copy() {
    navigator.clipboard.writeText(result.rdl)
      .then(() => setMsg("RDL copied. Paste it into a file ending in .rdl."))
      .catch(() => setMsg("Copying is blocked here. Open “Show the RDL” and copy the text manually."));
  }

  return (
    <section className="panel export no-print" aria-labelledby="export-title">
      <h2 id="export-title">Export for SSRS</h2>
      <p className="muted">The .rdl file runs your query on the report server each time the report is opened, and returns every row.</p>

      <div className="export-grid">
        <div>
          <span className="fld-label">Data source</span>
          <Segmented label="Data source" value={exp.dsMode} onChange={(v) => set({ dsMode: v })}
            options={[["embedded", "This database"], ["shared", "Shared data source"]]} />
          {exp.dsMode === "embedded" ? (
            <>
              <div className="connect-grid" style={{ marginTop: 10 }}>
                <label className="fld">
                  <span className="fld-label">SQL Server</span>
                  <input className="inp" value={exp.server} onChange={(e) => set({ server: e.target.value })} placeholder="SQLPROD01\SALES" />
                </label>
                <label className="fld">
                  <span className="fld-label">Database</span>
                  <input className="inp" value={exp.database} onChange={(e) => set({ database: e.target.value })} placeholder="SalesDB" />
                </label>
              </div>
              <p className="fld-hint">The database is the one you picked. Enter the SQL Server the report server reaches it on.</p>
              <div className="fld" style={{ marginTop: 10 }}>
                <span className="fld-label">Report readers connect with</span>
                <Segmented label="Report credentials" value={exp.dsAuth} onChange={(v) => set({ dsAuth: v })}
                  options={[["windows", "Their Windows login"], ["sql", "A stored SQL login"]]} />
                <p className="fld-hint">
                  {exp.dsAuth === "windows"
                    ? "Each reader's own Windows account is used, so they need read access to the database."
                    : "No password is written into the file. After uploading, open the report's Manage page, choose Data sources, and enter the SQL login there."}
                </p>
              </div>
            </>
          ) : (
            <div className="fld" style={{ marginTop: 10 }}>
              <label className="fld-label" htmlFor="exp-dsref">Shared data source path (optional)</label>
              <input id="exp-dsref" className="inp" value={exp.dsRef} onChange={(e) => set({ dsRef: e.target.value })} placeholder={`/Data Sources/${exp.database || "ReportData"}`} aria-describedby="exp-dsref-hint" />
              <span id="exp-dsref-hint" className="fld-hint" style={{ display: "block" }}>The path of a data source already set up on your report server. Leave it blank to fill it in later: after uploading, open the report's Manage page, choose Data sources, and pick the real one.</span>
            </div>
          )}
        </div>

        <div className="fld">
          <label className="fld-label" htmlFor="schema">SSRS version</label>
          <select id="schema" className="sel" value={exp.schema} onChange={(e) => set({ schema: e.target.value })} aria-describedby="schema-hint">
            <option value="2016">2016 or later, Power BI Report Server</option>
            <option value="2010">2008 R2 to 2014</option>
          </select>
          <p id="schema-hint" className="fld-hint">The version of your report server. Pick 2008 R2 to 2014 only for an older server.</p>
        </div>
      </div>

      {result.warnings.length > 0 && (
        <ul className="warn-list">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
      )}

      <div className="export-actions">
        <button className="btn btn-primary" onClick={download} disabled={!ready}>Download .rdl</button>
        <button className="btn" onClick={copy} disabled={!ready}>Copy RDL</button>
        {result.loading && <span className="loading">Building the file…</span>}
        {result.problem && <span className="muted">{result.problem}</span>}
        {result.error && <span className="error">{result.error}</span>}
        {msg && <span className="muted" role="status">{msg}</span>}
      </div>
      {result.rdl && (
        <details className="opt">
          <summary>Show the RDL</summary>
          <textarea className="ta rdl-xml" rows={12} readOnly value={result.rdl} onFocus={(e) => e.target.select()} aria-label="RDL XML" />
        </details>
      )}
    </section>
  );
}
