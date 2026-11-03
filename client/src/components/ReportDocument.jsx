import { filterActive, describeFilter, fmtDate, LOANMART_LOGO_PNG, BAND_LINES_SIZE, BAND_LINES_RIGHT, BAND_LINES_PATHS, BAND_LINES_STROKE } from "@req-2-report/shared";
import ReportTable from "./ReportTable.jsx";
import PreviewNote from "./PreviewNote.jsx";
import { textStyle, part } from "../utils/look.js";

const LOGO_SRC = `data:image/png;base64,${LOANMART_LOGO_PNG}`;

/** The "LM" line art behind the band's text (shared/bandLines.js): as tall as the band, right edge at 72% of its width. */
function BandLines() {
  const { w, h } = BAND_LINES_SIZE, s = BAND_LINES_STROKE;
  return (
    <svg className="doc-band-lines" viewBox={`0 0 ${w} ${h}`} style={{ right: `${(1 - BAND_LINES_RIGHT) * 100}%` }} aria-hidden="true">
      <g fill="none" stroke={s.color} strokeOpacity={s.opacity} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round">
        {BAND_LINES_PATHS.map((d) => <path key={d} d={d} />)}
      </g>
    </svg>
  );
}

/**
 * LoanMart header band, matching the exported .rdl: logo, organisation, title, description and date on a green
 * panel across the full width of the report, then a gold stripe.
 */
/** "1,234 rows", or "200+ rows" when the preview only loaded the first rows of a bigger result */
const rowCount = (n, more) => `${n.toLocaleString("en-US")}${more ? "+" : ""} ${n === 1 && !more ? "row" : "rows"}`;

function Band({ cols, count, tpl, title, desc, loading }) {
  const band = part(tpl, "band");
  return (
    <header className={`doc-band${tpl.logo ? " has-logo" : ""}`} data-part="band"
      style={{ ...(band.bg && { background: band.bg }), ...(band.stripe && { borderBottomColor: band.stripe }) }}>
      <BandLines />
      {tpl.logo && <img className="doc-logo" src={LOGO_SRC} alt="LoanMart" />}
      <div className="doc-band-main">
        {tpl.org && <p className="doc-org" data-part="org" style={textStyle(part(tpl, "org"))}>{tpl.org}</p>}
        <h2 className={`doc-title ${title ? "" : "placeholder"}`} data-part="title" style={textStyle(part(tpl, "title"))}>{title || "Report title"}</h2>
        {desc && <p className="doc-desc" data-part="desc" style={textStyle(part(tpl, "desc"))}>{desc}</p>}
        <p className="doc-meta" data-part="meta" style={textStyle(part(tpl, "meta"))}>
          <span>Generated {fmtDate(new Date(), tpl.dateFormat)}</span>
          <span>{cols.length} {cols.length === 1 ? "column" : "columns"}</span>
          <span>{count}</span>
          {loading && <span>Updating preview…</span>}
        </p>
      </div>
    </header>
  );
}

/** The report as readers see it: header, table, footer. Used for previews and the final report. */
/**
 * showing: the readers' slicer choices, as the exported report prints them under the header.
 * filterBar: the readers' filters, drawn as part of the page (a strip across the top, like SSRS's parameter bar).
 * limit: show only this many rows, with a "*Preview 10 of N rows" footnote below the report.
 */
export default function ReportDocument({ cols, rows, totalRows, tpl, title, desc, filters = [], colsByKey, sort, onSort, onMove, limit, loading, showing, filterBar, moreRows, rowTotal, counting }) {
  const active = filters.filter((f) => filterActive(f, colsByKey[f.col]));
  // Every row the query returns: counted on the server once known, else the loaded rows ("200+ rows")
  const all = rowTotal != null ? rowCount(rowTotal, false) : rowCount(totalRows, moreRows);
  const count = rows.length === totalRows ? all : `${rows.length.toLocaleString("en-US")} of ${all}`;
  const chips = active.length > 0 && (
    <ul className="chips" aria-label="Filters applied">
      {active.map((f) => <li key={f.id}>{describeFilter(f, colsByKey[f.col], tpl)}</li>)}
    </ul>
  );
  return (
    <>
    <article className={`doc doc-${tpl.theme}${filterBar ? " has-filterbar" : ""}`}>
      {filterBar}
      {tpl.theme === "loanmart" ? (
        <>
          <Band cols={cols} count={count} tpl={tpl} title={title} desc={desc} loading={loading} />
          {chips && <div className="doc-filters">{chips}</div>}
          {showing && <p className="doc-showing">Showing:&nbsp; {showing}</p>}
        </>
      ) : (
        <header className="doc-head">
          {tpl.org && <p className="doc-org" data-part="org" style={textStyle(part(tpl, "org"))}>{tpl.org}</p>}
          <h2 className={`doc-title ${title ? "" : "placeholder"}`} data-part="title" style={textStyle(part(tpl, "title"))}>{title || "Report title"}</h2>
          {desc && <p className="doc-desc" data-part="desc" style={textStyle(part(tpl, "desc"))}>{desc}</p>}
          <p className="doc-meta" data-part="meta" style={textStyle(part(tpl, "meta"))}>
            <span>Generated {fmtDate(new Date(), tpl.dateFormat)}</span>
            <span>{cols.length} {cols.length === 1 ? "column" : "columns"}</span>
            <span>{count}</span>
            {loading && <span className="loading">Updating preview…</span>}
          </p>
          {chips}
          {showing && <p className="doc-showing">Showing:&nbsp; {showing}</p>}
        </header>
      )}
      <ReportTable cols={cols} rows={rows} tpl={tpl} sort={sort} onSort={onSort} onMove={onMove} limit={limit} />
      {tpl.footer && <footer className="doc-foot" data-part="footer" style={textStyle(part(tpl, "footer"))}>{tpl.footer}</footer>}
    </article>
    {limit && <PreviewNote rows={rows} limit={limit} totalRows={totalRows} moreRows={moreRows} rowTotal={rowTotal} counting={counting} />}
    </>
  );
}
