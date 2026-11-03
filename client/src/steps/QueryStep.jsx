import AiAssistant from "../components/AiAssistant.jsx";
import SqlEditor from "../components/SqlEditor.jsx";

/** databases: [{ name, tables }] from the schema files, or null while loading. */
export default function QueryStep({ databases, database, setDatabase, sql, setSql, aiChat, setAiChat, onAnswer, onAiBusy, busy }) {
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
      {database && <AiAssistant database={database} sql={sql} setSql={setSql} chat={aiChat} setChat={setAiChat} onAnswer={onAnswer} onBusy={onAiBusy} locked={busy} />}
      <div className="panel">
        <label className="fld">
          <span className="fld-label">SQL query</span>
          <SqlEditor value={sql} onChange={(e) => setSql(e.target.value)} readOnly={busy}
            placeholder={"SELECT l.loan_no, l.contract_dtm\nFROM dbo.loan AS l\nWHERE l.contract_dtm >= '2026-01-01'"} />
        </label>
        <div className="panel-foot">
          <span className="muted">Only SELECT statements (including WITH … SELECT) are allowed. The app never runs the query.</span>
        </div>
      </div>
    </>
  );
}
