import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_TPL, DEFAULT_EXPORT, effectiveColumns, keyBy, applyFilters, prettify, liveSlicers, suggestSlicers, applySlicers, describeSlices } from "@req-2-report/shared";
import { api } from "./api.js";
import { STEPS, FLOW } from "./steps/steps.js";
import StepRail from "./components/StepRail.jsx";
import QueryStep from "./steps/QueryStep.jsx";
import ColumnsStep from "./steps/ColumnsStep.jsx";
import TemplateStep from "./steps/TemplateStep.jsx";
import DetailsStep from "./steps/DetailsStep.jsx";
import ReportStep from "./steps/ReportStep.jsx";
import { useRdlExport } from "./hooks/useRdlExport.js";
import { sortRows } from "./utils/table.js";
import { sampleRows } from "./utils/sampleRows.js";

/** `sql` is the query the columns were read from: the report is built from it, not from whatever is in the editor now. */
const EMPTY_ANALYSIS = { columns: [], table: null, key: null, sql: "", note: "" };
const keyOf = (database, query) => `${database}\u0000${query}`;

/**
 * The SSRS report builder. The app never connects to a database: the AI writes the query from the database's schema
 * file and works out its columns, the preview shows sample rows, and the .rdl runs the query on the report server.
 */
export default function App() {
  // Navigation. `step` is a step id; `reached` is how far along the flow the user has got (an index into it).
  const [step, setStep] = useState("query");
  const [reached, setReached] = useState(0);
  const at = (id) => FLOW.indexOf(id);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");

  // Database and report definition
  const [databases, setDatabases] = useState(null);
  const [database, setDatabaseRaw] = useState("");
  const [sql, setSql] = useState("");
  const [aiChat, setAiChat] = useState([]); // the conversation with the AI query assistant
  const answers = useRef(new Map()); // the columns of each query the AI wrote, by keyOf(database, sql)
  const [analysis, setAnalysis] = useState(EMPTY_ANALYSIS);
  const [tpl, setTpl] = useState(DEFAULT_TPL);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [filters, setFilters] = useState([]);
  // Slicers: the filters readers change in SSRS. Suggested from the sample rows until the user edits them.
  const [slicers, setSlicersRaw] = useState([]);
  const [sliceValues, setSliceValues] = useState({}); // what the preview is sliced by; readers' choices aren't exported
  const slicersEdited = useRef(false);
  const [paramLayout, setParamLayout] = useState({}); // where the slicers sit on the parameter bar grid (exported)
  const setSlicers = (fn) => { slicersEdited.current = true; setSlicersRaw(fn); };
  /** Renames a filter (side: "from"/"to" for one half of a range); "" goes back to the default name. */
  const renameSlicer = (col, side, name) => setSlicers((ss) => ss.map((s) => (s.col === col ? { ...s, prompts: { ...s.prompts, [side || "main"]: name } } : s)));
  const [sort, setSort] = useState(null);
  const [exp, setExp] = useState(DEFAULT_EXPORT);

  const columns = analysis.columns;
  const setColumns = (fn) => setAnalysis((a) => ({ ...a, columns: typeof fn === "function" ? fn(a.columns) : fn }));

  const go = (id) => { setError(""); setStep(id); setReached((r) => Math.max(r, at(id))); };

  /** A new database: its own schema, so the conversation starts over; the .rdl points at it. */
  function setDatabase(name) {
    setDatabaseRaw(name);
    setAiChat([]);
    setExp((e) => ({ ...e, database: name }));
  }

  useEffect(() => {
    api.databases()
      .then((r) => {
        setDatabases(r.databases);
        if (r.databases.length) setDatabase(r.databases[0].name);
      })
      .catch((e) => { setDatabases([]); setError(e.message); });
  }, []);

  // Made-up rows that fit the columns' types: the report's look, not its data
  const rows = useMemo(() => sampleRows(columns), [columns]);
  const effCols = useMemo(() => effectiveColumns(columns, tpl), [columns, tpl]);
  const colsByKey = useMemo(() => keyBy(effCols), [effCols]);
  const sortedAll = useMemo(() => sortRows(rows, sort, colsByKey), [rows, sort, colsByKey]);
  const filteredRows = useMemo(() => sortRows(applyFilters(rows, filters, colsByKey), sort, colsByKey), [rows, filters, colsByKey, sort]);
  const activeSlicers = useMemo(() => liveSlicers(slicers, colsByKey), [slicers, colsByKey]);
  const showing = describeSlices(activeSlicers, sliceValues, colsByKey, tpl);
  const slicedRows = useMemo(() => applySlicers(filteredRows, activeSlicers, sliceValues, colsByKey), [filteredRows, activeSlicers, sliceValues, colsByKey]);

  useEffect(() => {
    if (!slicersEdited.current && analysis.key && rows.length) setSlicersRaw(suggestSlicers(effectiveColumns(columns, tpl), rows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.key]);

  const rdlResult = useRdlExport(
    {
      sql: analysis.sql, tpl, title, desc, filters, sort, exp, slicers: activeSlicers, paramLayout,
      columns: columns.map(({ key, name, type, selected, unnamed, dup }) => ({ key, name, type, selected, unnamed, dup })),
    },
    step === "report"
  );

  /** Moves a column to just before (or after) another one, by key; the order is saved in the template by name. */
  function moveColumn(fromKey, toKey, after = false) {
    const names = effCols.map((c) => c.name);
    const from = colsByKey[fromKey]?.name, to = colsByKey[toKey]?.name;
    if (!from || !to || from === to) return;
    names.splice(names.indexOf(from), 1);
    names.splice(names.indexOf(to) + (after ? 1 : 0), 0, from);
    setTpl((t) => ({ ...t, order: [...names, ...t.order.filter((n) => !names.includes(n))] }));
  }

  const toggleSort = (key) =>
    setSort((s) => (s && s.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));

  /** New columns for the query, so filters and sort start over. */
  function applyAnalysis(res, query) {
    setAnalysis({ columns: res.columns, table: res.table, key: keyOf(database, query), sql: query, note: res.note || "" });
    setFilters([]);
    setSlicersRaw([]);
    setSliceValues({});
    setParamLayout({});
    slicersEdited.current = false;
    setSort(null);
    if (!title && res.table) setTitle(`${prettify(res.table)} Report`);
    setReached(at("query")); // the steps after this one start again
  }

  /** Keeps the columns of each AI answer, so moving on with that query needs no second request. */
  const rememberAnswer = (answer) => {
    if (answer.columns?.length) answers.current.set(keyOf(database, answer.sql), { columns: answer.columns, table: answer.table });
  };

  async function next() {
    setError("");
    if (step === "query") {
      if (!database) return setError("Pick a database. Its schema file is what the query is written from.");
      if (!sql.trim()) return setError("Write a query, or ask AI to write one.");
      const query = sql;
      const key = keyOf(database, query);
      if (key !== analysis.key) {
        const known = answers.current.get(key);
        if (known) applyAnalysis(known, query);
        else {
          // Written or edited by hand: the AI works out its columns from the schema
          setBusy(true);
          try {
            applyAnalysis(await api.aiColumns(database, query), query);
          } catch (e) {
            return setError(e.message);
          } finally {
            setBusy(false);
          }
        }
      }
      return go("columns");
    }
    if (step === "columns" && !columns.some((c) => c.selected)) return setError("Select at least one column.");
    if (step === "details" && !title.trim()) return setError("Add a report title to continue.");
    go(FLOW[at(step) + 1]);
  }

  const previewProps = {
    cols: effCols, totalRows: rows.length, moreRows: false, rowTotal: null, counting: false, tpl, title, desc, colsByKey, sort, onSort: toggleSort, onMove: moveColumn, loading: false,
  };
  const S = STEPS[step];
  const stepNo = at(step);
  const showPreviewBar = S.previewBar && analysis.key;
  const edited = step !== "query" && analysis.key && sql !== analysis.sql;

  return (
    <div className="rb">
      <div className="rb-shell">
        <StepRail flow={FLOW} step={step} reached={reached} onGo={go} sql={sql} />

        <main className="rb-main">
          <div className="page-head">
            <p className="stepno">SSRS report · Step {stepNo + 1} of {FLOW.length}</p>
            <h1>{S.heading}</h1>
            <p className="help">{S.help}</p>
          </div>

          {showPreviewBar && (
            <div className="preview-bar no-print">
              <span>
                Sample rows: made-up values that show the layout. The SSRS report shows the real data from {database}.
                {edited && " The query has changed since its columns were read: go back to Query and choose Read columns."}
              </span>
              {analysis.note && <span className="error">{analysis.note}</span>}
            </div>
          )}

          {step === "query" && (
            <QueryStep databases={databases} database={database} setDatabase={setDatabase} sql={sql} setSql={setSql}
              aiChat={aiChat} setAiChat={setAiChat} onAnswer={rememberAnswer} onAiBusy={setAiBusy} busy={busy} />
          )}

          {step === "columns" && <ColumnsStep columns={columns} setColumns={setColumns} rows={rows} tpl={tpl} setTpl={setTpl} />}

          {step === "template" && (
            <TemplateStep tpl={tpl} setTpl={setTpl} effCols={effCols} previewProps={{ ...previewProps, rows: sortedAll }} />
          )}

          {step === "details" && (
            <DetailsStep
              title={title} setTitle={setTitle} desc={desc} setDesc={setDesc}
              filters={filters} setFilters={setFilters} effCols={effCols} colsByKey={colsByKey} tpl={tpl}
              matchCount={filteredRows.length} totalRows={rows.length}
              previewProps={{ ...previewProps, rows: slicedRows, filters, showing }}
              slicers={activeSlicers} setSlicers={setSlicers} sliceValues={sliceValues} setSliceValues={setSliceValues} filteredRows={filteredRows}
              paramLayout={paramLayout} setParamLayout={setParamLayout} onRename={renameSlicer}
            />
          )}

          {step === "report" && (
            <ReportStep
              exp={exp} setExp={setExp} rdlResult={rdlResult}
              previewProps={{ ...previewProps, rows: slicedRows, filters, showing }}
              slicerProps={{ slicers: activeSlicers, values: sliceValues, setValues: setSliceValues, colsByKey, rows: filteredRows, tpl, layout: paramLayout, setLayout: setParamLayout, onRename: renameSlicer }}
              onEditTemplate={() => go("template")} onEditFilters={() => go("details")}
            />
          )}

          <nav className="rb-nav" aria-label="Steps">
            <div>{stepNo > 0 && <button className="btn" onClick={() => go(FLOW[stepNo - 1])}>Back</button>}</div>
            <div className="row">
              {error && <span className="error" role="alert">{error}</span>}
              {S.next ? (
                <button className="btn btn-primary" onClick={next} disabled={busy || aiBusy}>
                  {busy ? "Reading columns…" : aiBusy ? "Waiting for AI…" : S.next}
                </button>
              ) : (
                <button className="btn" onClick={() => go("query")}>Start a new query</button>
              )}
            </div>
          </nav>
        </main>
      </div>
    </div>
  );
}
