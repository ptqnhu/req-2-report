import { useEffect, useRef, useState } from "react";
import AiAssistant from "../components/AiAssistant.jsx";
import SqlEditor from "../components/SqlEditor.jsx";

/** Shown greyed out in the empty SQL box; "Use example" or Tab puts it in the box. */
const EXAMPLE_SQL = "SELECT\n      l.loan_no\n    , l.application_recvd_dtm\nFROM APM.dbo.loan AS l\nWHERE\n    l.application_recvd_dtm >= DATEADD(DAY, -30, l.application_recvd_dtm)";

/** databases: [{ name, tables }] from the schema files, or null while loading. */
export default function QueryStep({ databases, database, setDatabase, sql, setSql, aiChat, setAiChat, aiSeed, onAnswer, onAiBusy, busy }) {
  const [copied, setCopied] = useState(""); // a note in place of the hint, for a few seconds after copying
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  function copy() {
    clearTimeout(timer.current);
    navigator.clipboard.writeText(sql)
      .then(() => setCopied("Query copied."))
      .catch(() => setCopied("Copying is blocked here. Select the query and press Ctrl+C."))
      .finally(() => { timer.current = setTimeout(() => setCopied(""), 3000); });
  }

  return (
    <>
      <div className="panel">
        <label className="fld">
          <span className="fld-label">Database</span>
          <select className="sel" value={database} onChange={(e) => setDatabase(e.target.value)} disabled={!databases?.length}>
            {!databases ? <option value="">Loading…</option>
              : !databases.length ? <option value="">No schema files yet</option>
              : databases.map((d) => <option key={d.name} value={d.name}>{d.name} ({d.tables} {d.tables === 1 ? "table" : "tables"})</option>)}
          </select>
        </label>
        <p className="fld-hint">
          {databases && !databases.length
            ? "Add a schema file for each database to server/schemas/, then reload."
            : "The AI reads this database's schema file. The report runs the query against it on the SSRS server."}
        </p>
      </div>
      {database && <AiAssistant database={database} sql={sql} setSql={setSql} chat={aiChat} setChat={setAiChat} seed={aiSeed} onAnswer={onAnswer} onBusy={onAiBusy} locked={busy} />}
      <div className="panel">
        <label className="fld">
          <span className="fld-label">SQL query</span>
          <SqlEditor value={sql} onChange={(e) => setSql(e.target.value)} readOnly={busy} placeholder={EXAMPLE_SQL}
            onKeyDown={(e) => {
              // Tab in the empty box takes the example, as in an IDE; otherwise Tab moves focus as usual
              if (e.key === "Tab" && !e.shiftKey && !sql && !busy) { e.preventDefault(); setSql(EXAMPLE_SQL); }
            }} />
        </label>
        <div className="panel-foot">
          <span className="muted" role="status">
            {copied || (sql
              ? "Only SELECT statements (including WITH … SELECT) are allowed. The app never runs the query."
              : "Press Tab or choose Use example to start from the example query. The app never runs the query.")}
          </span>
          {sql
            ? <button type="button" className="btn btn-sm" onClick={copy} disabled={!sql.trim()}>Copy query</button>
            : <button type="button" className="btn btn-sm" onClick={() => setSql(EXAMPLE_SQL)} disabled={busy}>Use example</button>}
        </div>
      </div>
    </>
  );
}
