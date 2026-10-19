import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_TPL, DEFAULT_EXPORT, effectiveColumns, keyBy, applyFilters, prettify, liveSlicers, suggestSlicers, applySlicers, describeSlices } from "@report-builder/shared";
import { api } from "./api.js";
import { STEPS, FLOWS, sharedSteps, KIND_NAMES } from "./steps/steps.js";
import StepRail from "./components/StepRail.jsx";
import ExportStep from "./steps/ExportStep.jsx";
import ConnectStep from "./steps/ConnectStep.jsx";
import QueryStep from "./steps/QueryStep.jsx";
import ColumnsStep from "./steps/ColumnsStep.jsx";
import TemplateStep from "./steps/TemplateStep.jsx";
import DetailsStep from "./steps/DetailsStep.jsx";
import ReportStep from "./steps/ReportStep.jsx";
import ChartsStep from "./steps/ChartsStep.jsx";
import { usePreviewRows } from "./hooks/usePreviewRows.js";
import { useRdlExport } from "./hooks/useRdlExport.js";
import { sortRows } from "./utils/table.js";

const EMPTY_ANALYSIS = { columns: [], table: null, key: null };

/** The builder. `kind` ("adhoc", "ssrs" or "charts") is picked from a link (the menu on the left) and decides the steps. */
export default function App({ kind }) {
  // Navigation. `step` is a step id; `reached` is how far along the flow the user has got (an index into it).
  const flow = FLOWS[kind];
  const [step, setStep] = useState("connect");
  const [reached, setReached] = useState(0);
  const at = (id) => flow.indexOf(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Connection and report definition
  const [connection, setConnection] = useState(null);
  const [sql, setSql] = useState("");
  const [aiChat, setAiChat] = useState([]); // the conversation with the AI query assistant
  const [chartChat, setChartChat] = useState([]); // the conversation on the Charts step
  const [analysis, setAnalysis] = useState(EMPTY_ANALYSIS);
  const [tpl, setTpl] = useState(DEFAULT_TPL);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [filters, setFilters] = useState([]);
  // Slicers: the filters readers change in SSRS. Suggested from the first rows until the user edits them.
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

  /** Switching kind keeps the steps both kinds share (connection, query, columns) but not the old kind's own steps. */
  const lastKind = useRef(kind);
  const convertTo = useRef(null); // the step to open after "Convert to SSRS report"
  useEffect(() => {
    if (lastKind.current === kind) return;
    const shared = sharedSteps(FLOWS[lastKind.current], FLOWS[kind]);
    lastKind.current = kind;
    const target = convertTo.current;
    convertTo.current = null;
    if (target && FLOWS[kind].includes(target)) {
      setError("");
      setStep(target);
      setReached(FLOWS[kind].indexOf(target));
      return;
    }
    setReached((r) => Math.min(r, shared - 1));
    if (!FLOWS[kind].includes(step)) setStep(FLOWS[kind][shared - 1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  /** On to an SSRS report with the same connection, query and columns, opening at `target`. */
  function convertToSsrs(target) {
    convertTo.current = target;
    location.hash = "#/build/ssrs";
    window.scrollTo(0, 0);
  }

  /** The server forgot the connection (idle timeout or restart): send the user back to reconnect. */
  function handleExpired(e) {
    setConnection(null);
    setAnalysis(EMPTY_ANALYSIS);
    setStep("connect");
    setReached(at("connect"));
    setError(e.message);
  }

  function onConnected(conn) {
    setConnection(conn);
    setAnalysis(EMPTY_ANALYSIS); // a new database means the query must be read again
    setAiChat([]);
    setChartChat([]);
    setReached(at("connect"));
    setExp((e) => ({ ...e, server: conn.server, database: conn.database, dsAuth: conn.authType === "sql" ? "sql" : "windows" }));
    setError("");
  }

  async function onDisconnect() {
    if (connection) api.disconnect(connection.connectionId).catch(() => {});
    setConnection(null);
    setAnalysis(EMPTY_ANALYSIS);
    setReached(at("connect"));
  }

  // Close the server-side connection when the tab is closed.
  useEffect(() => {
    if (!connection) return;
    const close = () => api.disconnect(connection.connectionId, { keepalive: true }).catch(() => {});
    window.addEventListener("pagehide", close);
    return () => window.removeEventListener("pagehide", close);
  }, [connection]);

  // Live data for the previews
  const preview = usePreviewRows({
    connectionId: connection?.connectionId, sql, analysisKey: analysis.key, columns, onExpired: handleExpired,
    all: kind === "charts", // charts sum up every row; tables preview the first few
  });
  const rows = preview.rows;
  const effCols = useMemo(() => effectiveColumns(columns, tpl), [columns, tpl]);
  const colsByKey = useMemo(() => keyBy(effCols), [effCols]);
  const sortedAll = useMemo(() => sortRows(rows, sort, colsByKey), [rows, sort, colsByKey]);
  const filteredRows = useMemo(() => sortRows(applyFilters(rows, filters, colsByKey), sort, colsByKey), [rows, filters, colsByKey, sort]);
  const activeSlicers = useMemo(() => liveSlicers(slicers, colsByKey), [slicers, colsByKey]);
  const showing = describeSlices(activeSlicers, sliceValues, colsByKey, tpl);
  const slicedRows = useMemo(() => applySlicers(filteredRows, activeSlicers, sliceValues, colsByKey), [filteredRows, activeSlicers, sliceValues, colsByKey]);

  useEffect(() => {
    if (flow.includes("details") && !slicersEdited.current && analysis.key && rows.length) setSlicersRaw(suggestSlicers(effectiveColumns(columns, tpl), rows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.key, rows]);

  const rdlResult = useRdlExport(
    {
      sql, tpl, title, desc, filters, sort, exp, slicers: activeSlicers, paramLayout,
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

  /** A fresh analysis of the query: new columns, so filters and sort start over. */
  function applyAnalysis(res, key) {
    setAnalysis({ columns: res.columns, table: res.table, key });
    setFilters([]);
    setSlicersRaw([]);
    setSliceValues({});
    setParamLayout({});
    slicersEdited.current = false;
    setSort(null);
    if (!title && res.table) setTitle(`${prettify(res.table)} Report`);
    setReached(at(step)); // the steps after this one start again
  }

  const analysisKeyOf = (query) => `${connection.connectionId}\u0000${query}`;

  /** Reads the query's columns from SQL Server (once per query); the rows then load for the preview. */
  async function analyzeQuery(query) {
    const key = analysisKeyOf(query);
    if (key === analysis.key) return preview.refresh();
    applyAnalysis(await api.analyze(connection.connectionId, query), key);
  }

  async function next() {
    setError("");
    if (step === "connect") {
      if (!connection) return setError("Connect to a database to continue.");
      return go(flow[at(step) + 1]);
    }
    if (step === "query") {
      if (analysisKeyOf(sql) !== analysis.key) {
        setBusy(true);
        try {
          await analyzeQuery(sql);
        } catch (e) {
          if (e.status === 410) return handleExpired(e);
          return setError(e.message);
        } finally {
          setBusy(false);
        }
      }
      return go("columns");
    }
    if (step === "columns" && !columns.some((c) => c.selected)) return setError("Select at least one column.");
    if (step === "details" && !title.trim()) return setError("Add a report title to continue.");
    go(flow[at(step) + 1]);
  }

  const previewProps = {
    cols: effCols, totalRows: rows.length, moreRows: preview.truncated, rowTotal: preview.count, counting: preview.counting, tpl, title, desc, colsByKey, sort, onSort: toggleSort, onMove: moveColumn, loading: preview.loading,
  };
  const S = STEPS[step];
  const nextLabel = typeof S.next === "function" ? S.next(kind) : S.next;
  const blocked = step === "connect" && !connection; // Continue waits for the step's own action
  const stepNo = at(step);
  const showPreviewBar = S.previewBar && analysis.key;

  return (
    <div className="rb">
      <div className="rb-shell">
        <StepRail flow={flow} step={step} reached={reached} onGo={go} sql={sql} />

        <main className="rb-main">
          <div className="page-head">
            <p className="stepno">{KIND_NAMES[kind]} · Step {stepNo + 1} of {flow.length}</p>
            <h1>{S.heading}</h1>
            <p className="help">{S.help}</p>
          </div>

          {showPreviewBar && (
            <div className="preview-bar no-print">
              {preview.loading ? <span className="loading">Loading rows from {connection?.database}…</span>
                : preview.error ? <span className="error">{preview.error}</span>
                : <span>{preview.truncated ? `Previewing the first ${preview.limit} rows. The ${kind === "adhoc" ? "downloaded file has" : "SSRS report returns"} every row.` : `Previewing all ${rows.length} rows.`}</span>}
              <button className="btn btn-quiet btn-sm" onClick={preview.refresh} disabled={preview.loading}>Reload rows</button>
            </div>
          )}

          {step === "connect" && <ConnectStep connection={connection} onConnected={onConnected} onDisconnect={onDisconnect} />}

          {step === "query" && <QueryStep sql={sql} setSql={setSql} connection={connection} aiChat={aiChat} setAiChat={setAiChat} onExpired={handleExpired} />}

          {step === "columns" && <ColumnsStep columns={columns} setColumns={setColumns} rows={rows} tpl={tpl} setTpl={setTpl} />}


          {step === "chart" && (
            <ChartsStep
              connection={connection} sql={sql} setSql={setSql} chat={chartChat} setChat={setChartChat} onExpired={handleExpired}
              onRun={analyzeQuery} ran={!!analysis.key} cols={effCols} rows={rows} preview={preview}
            />
          )}

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

          {step === "export" && (
            <ExportStep
              title={title} setTitle={setTitle} onExpired={handleExpired} onConvert={() => convertToSsrs("template")}
              payload={{
                connectionId: connection?.connectionId, sql, tpl, sort,
                columns: columns.map(({ key, name, type, selected, unnamed, dup }) => ({ key, name, type, selected, unnamed, dup })),
              }}
              previewProps={{ ...previewProps, rows: sortedAll }}
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
            <div>{stepNo > 0 && <button className="btn" onClick={() => go(flow[stepNo - 1])}>Back</button>}</div>
            <div className="row">
              {error && <span className="error" role="alert">{error}</span>}
              {nextLabel ? (
                <button className={`btn${blocked ? "" : " btn-primary"}`} onClick={next} disabled={busy || blocked}>
                  {busy ? "Asking SQL Server…" : nextLabel}
                </button>
              ) : kind === "charts" ? (
                analysis.key && <button className="btn" onClick={() => convertToSsrs("columns")} title="Same connection and query, as a formatted SSRS report">Turn into an SSRS report</button>
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
