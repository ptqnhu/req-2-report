import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_TPL, formatValue } from "@report-builder/shared";
import Segmented from "./Segmented.jsx";

/**
 * Chart colours (the --data-* tokens in styles.css). Bars and shares are grey with the largest in lime, and a single
 * line is near-black (INK), so most charts need no colour key. Lines that must be told apart take SERIES in this
 * fixed order, checked with the dataviz palette validator against the card (--surface): lightness, chroma,
 * colour-blind separation and contrast all pass.
 */
const INK = "#1C1C1C";
const SERIES = ["#5F7F00", "#2F6FB0", "#C2701F", "#008C7A", "#7A52C7", "#D0607F"];
const colorOf = (i) => SERIES[i % SERIES.length];

/** A value in full, as the report would show it: $1,234.50, 12.5%. */
const full = (v, col) => (v === null || v === undefined ? "–" : formatValue(v, col, DEFAULT_TPL));

/** A value for an axis tick or a tile: $1.2M, 3.4K, 12%. */
function compact(v, col) {
  if (col.type === "Percentage") return `${+(v * 100).toFixed(1)}%`;
  const t = Math.abs(v).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: Math.abs(v) < 10 ? 2 : 1 });
  return `${v < 0 ? "-" : ""}${col.type === "Currency" ? DEFAULT_TPL.currency : ""}${t}`;
}

/** Round tick values covering lo…hi (always including 0): 0, 250, 500, 750. */
function niceTicks(lo, hi, count = 4) {
  lo = Math.min(0, lo); hi = Math.max(0, hi);
  if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw);
  const ticks = [];
  for (let t = Math.floor(lo / step) * step; t <= hi + step * 1e-9; t += step) ticks.push(+t.toPrecision(12));
  if (ticks.at(-1) < hi) ticks.push(+(ticks.at(-1) + step).toPrecision(12));
  return ticks;
}

/** The element's width, kept up to date as the window resizes. */
function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * Headline numbers: one tile per measure, the first (the one the view leads with) dark. A tile's `change` (a
 * fraction, e.g. 0.124) shows as an arrow and a percentage, then `vs` saying what it's compared with.
 */
export function StatTiles({ tiles }) {
  return (
    <div className="ch-tiles">
      {tiles.map((t, i) => (
        <div key={t.col.key} className={`ch-card ch-tile${i === 0 ? " ch-tile-lead" : ""}`} title={full(t.value, t.col)}>
          <p className="ch-tile-label">{t.label}</p>
          <p className="ch-tile-value">{compact(t.value, t.col)}</p>
          {typeof t.change === "number" && (
            <p className="ch-tile-note">
              <span className={`ch-change ${t.change < 0 ? "down" : "up"}`}>
                <span aria-hidden="true">{t.change < 0 ? "▼" : "▲"}</span> {t.change < 0 ? "Down" : "Up"} {pct(Math.abs(t.change))}
              </span>{" "}
              {t.vs}
            </p>
          )}
          {t.note && <p className="ch-tile-note">{t.note}</p>}
        </div>
      ))}
    </div>
  );
}

/** One suggested chart: title, why it was suggested, and the chart or its numbers as a table. */
export function ChartCard({ chart }) {
  const [view, setView] = useState("chart");
  const Chart = { line: LineChart, bar: BarChart, share: ShareBar }[chart.kind];
  return (
    <figure className={`ch-card${chart.kind === "line" ? " wide" : ""}`}>
      <figcaption className="ch-head">
        <div>
          <h3>{chart.title}</h3>
          <p className="muted">{chart.why}</p>
        </div>
        <Segmented label="Show as" value={view} onChange={setView} options={[["chart", "Chart"], ["table", "Table"]]} />
      </figcaption>
      {view === "chart" ? <Chart chart={chart} /> : <ChartTable chart={chart} />}
    </figure>
  );
}

/** The chart's numbers as a table: the accessible view, and the way to read exact values. */
function ChartTable({ chart }) {
  const m = chart.measure;
  let head, body;
  if (chart.kind === "line") {
    head = [chart.x.label, ...chart.series.map((s) => s.name)];
    body = chart.x.values.map((x, i) => [x, ...chart.series.map((s) => full(s.values[i], m))]);
  } else if (chart.kind === "bar") {
    head = [chart.x.label, m.label];
    body = chart.bars.map((b) => [b.name, full(b.value, m)]);
  } else {
    head = ["", m.label, "Share"];
    body = chart.parts.map((p) => [p.name, full(p.value, m), pct(p.value / chart.total)]);
  }
  return (
    <div className="ch-table-wrap">
      <table className="ch-table">
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{body.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const pct = (f) => `${(f * 100).toFixed(f < 0.1 ? 1 : 0)}%`;

/**
 * Ranked horizontal bars, value at each bar's tip. Negative values grow left from the zero line. The largest bar is
 * lime, the rest grey; both are light on the card, so every bar keeps its value label and the table view has them all.
 */
function BarChart({ chart }) {
  const m = chart.measure;
  const vals = chart.bars.map((b) => b.value);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), span = hi - lo || 1;
  const top = vals.reduce((best, v, i) => (Math.abs(v) > Math.abs(vals[best]) ? i : best), 0);
  const [tip, setTip] = useState(null);
  return (
    <div className="ch-bars" onMouseLeave={() => setTip(null)}>
      {chart.bars.map((b, i) => {
        const left = (Math.min(0, b.value) - lo) / span, width = Math.abs(b.value) / span;
        return (
          <div key={i} className={`ch-bar-row${tip === i ? " on" : ""}`} onMouseEnter={() => setTip(i)}>
            <span className="ch-bar-name" title={b.name}>{b.name}</span>
            <span className="ch-bar-track">
              <span className="ch-bar-gap" style={{ width: `calc((100% - 76px) * ${left})` }} />
              <span className={`ch-bar${b.value < 0 ? " neg" : ""}${i === top ? " top" : ""}`} style={{ width: `calc((100% - 76px) * ${width})` }} />
              <span className={`ch-bar-value${i === top ? " top" : ""}`} title={full(b.value, m)}>{compact(b.value, m)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Shares of a whole: one row per part, a rounded bar as long as its share with the percentage inside it (or just
 * after it when the bar is too short), then the value. The largest part is lime, the rest grey.
 */
function ShareBar({ chart }) {
  const m = chart.measure;
  const top = chart.parts.reduce((best, p, i) => (p.value > chart.parts[best].value ? i : best), 0);
  return (
    <div className="ch-parts">
      {chart.parts.map((p, i) => {
        const share = p.value / chart.total, inside = share >= 0.15;
        return (
          <div key={p.name} className="ch-part-row" title={`${p.name}: ${full(p.value, m)} (${pct(share)})`}>
            <span className="ch-part-name">{p.name}</span>
            <span className="ch-part-track">
              <span className={`ch-part-fill${i === top ? " top" : ""}${inside ? " labelled" : ""}`} style={{ width: `${Math.max(share * 100, 1.5)}%` }}>
                {inside && <span className="ch-part-pct">{pct(share)}</span>}
              </span>
              {!inside && <span className="ch-part-pct">{pct(share)}</span>}
            </span>
            <span className="ch-part-value">{compact(p.value, m)}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A smooth line through the points that never overshoots them (monotone cubic, Fritsch-Carlson), so a curve can't
 * suggest a value the data doesn't have. `pts`: [[x, y], ...] with no gaps.
 */
function smoothPath(pts) {
  const n = pts.length, f = (v) => v.toFixed(1);
  if (n < 3) return pts.map(([px, py], i) => `${i ? "L" : "M"}${f(px)},${f(py)}`).join("");
  const d = pts.slice(1).map(([px, py], k) => (py - pts[k][1]) / (px - pts[k][0]));
  const t = pts.map((_, k) => (k === 0 ? d[0] : k === n - 1 ? d[n - 2] : d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2));
  for (let k = 0; k < n - 1; k++) {
    if (d[k] === 0) { t[k] = 0; t[k + 1] = 0; continue; }
    const a = t[k] / d[k], b = t[k + 1] / d[k], h = a * a + b * b;
    if (h > 9) { const r = 3 / Math.sqrt(h); t[k] = r * a * d[k]; t[k + 1] = r * b * d[k]; }
  }
  let out = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let k = 0; k < n - 1; k++) {
    const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], dx = (x1 - x0) / 3;
    out += `C${f(x0 + dx)},${f(y0 + t[k] * dx)} ${f(x1 - dx)},${f(y1 - t[k + 1] * dx)} ${f(x1)},${f(y1)}`;
  }
  return out;
}

/** The unbroken stretches of a series (missing values split it): [[i, ...], ...]. */
function runsOf(values) {
  const runs = [];
  values.forEach((v, i) => {
    if (v === null) return;
    if (i > 0 && values[i - 1] !== null) runs.at(-1).push(i);
    else runs.push([i]);
  });
  return runs;
}

const H = 260, PAD = { top: 16, right: 16, bottom: 30, left: 56 };

/**
 * Smooth lines over time on one axis, with a crosshair and a tooltip listing each line's value. A single line is
 * near-black with a soft grey fill under it and, when there aren't too many points, a dot on each; its latest value
 * sits in a lime pill.
 */
function LineChart({ chart }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const fade = useId().replace(/:/g, ""); // the fill's gradient, one per chart
  const m = chart.measure, n = chart.x.values.length, multi = chart.series.length > 1;
  const lineColor = (i) => (multi ? colorOf(i) : INK);

  // Everything but the hover layer depends only on the data and the width, not on where the pointer is
  const { ticks, w, iw, ih, x, y, paths, area, xTicks, ends } = useMemo(() => {
    const all = chart.series.flatMap((s) => s.values).filter((v) => v !== null);
    const ticks = niceTicks(Math.min(...all), Math.max(...all));
    const lo = ticks[0], hi = ticks.at(-1);
    const w = Math.max(width, 200), iw = w - PAD.left - PAD.right, ih = H - PAD.top - PAD.bottom;
    const x = (i) => PAD.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => PAD.top + ih - ((v - lo) / (hi - lo)) * ih;
    const pointsOf = (s, run) => run.map((i) => [x(i), y(s.values[i])]);
    const paths = chart.series.map((s) => runsOf(s.values).map((run) => smoothPath(pointsOf(s, run))).join(""));
    // Under a single line, down to the zero line (always one of the ticks)
    const area = multi ? "" : runsOf(chart.series[0].values).map((run) =>
      `${smoothPath(pointsOf(chart.series[0], run))}L${x(run.at(-1)).toFixed(1)},${y(0).toFixed(1)}L${x(run[0]).toFixed(1)},${y(0).toFixed(1)}Z`).join("");
    // As many x labels as fit (about 90px each), always the first and last
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 90))));
    // A tick less than a full step before the last is dropped, or the two labels would overlap
    const xTicks = chart.x.values.map((_, i) => i).filter((i) => i % every === 0 && (n - 1 - i >= every || i === n - 1));
    if (xTicks.at(-1) !== n - 1) xTicks.push(n - 1);
    const ends = chart.series.map((s) => s.values.findLastIndex((v) => v !== null)); // each line's last point
    return { ticks, w, iw, ih, x, y, paths, area, xTicks, ends };
  }, [chart, width, n, multi]);
  const dots = !multi && n <= 24; // a dot on every point only while they stay apart

  const onMove = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left - PAD.left) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const end = chart.series[0].values[ends[0]];
  // A single line's last value, in a lime pill above its end point (about 7px a character), kept inside the plot
  const endText = end === null || end === undefined ? "" : compact(end, m), endW = endText.length * 7 + 18;

  return (
    <div className="ch-line" ref={ref}>
      {multi && (
        <ul className="ch-legend">
          {chart.series.map((s, i) => (
            <li key={s.name}><span className="ch-key" style={{ background: lineColor(i) }} /><span className="ch-legend-name" title={s.name}>{s.name}</span></li>
          ))}
        </ul>
      )}
      {width > 0 && (
        <svg width={w} height={H} role="img" aria-label={chart.title} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? "ch-zero" : "ch-gridline"} x1={PAD.left} x2={w - PAD.right} y1={y(t)} y2={y(t)} />
              <text className="ch-tick" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">{compact(t, m)}</text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} className="ch-tick" x={x(i)} y={H - 8} textAnchor={i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"}>{chart.x.values[i]}</text>
          ))}
          {area && (
            <>
              <defs>
                <linearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={INK} stopOpacity=".12" />
                  <stop offset="1" stopColor={INK} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#${fade})`} />
            </>
          )}
          {paths.map((d, i) => (
            <path key={chart.series[i].name} d={d} fill="none" stroke={lineColor(i)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {hover !== null && <line className="ch-cross" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} />}
          {dots && chart.series[0].values.map((v, i) => v !== null && i !== (hover ?? ends[0]) && (
            <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill={INK} stroke="#F7F7F7" strokeWidth="2" />
          ))}
          {/* A dot on each line: at its end, or at the hovered point. Ringed in the card colour so it stays clear where lines cross. */}
          {chart.series.map((s, i) => {
            const j = hover ?? ends[i];
            return j >= 0 && s.values[j] !== null && (
              <circle key={s.name} cx={x(j)} cy={y(s.values[j])} r={hover === null ? 4 : 4.5} fill={lineColor(i)} stroke="#F7F7F7" strokeWidth="2" />
            );
          })}
          {!multi && hover === null && ends[0] >= 0 && (
            <g transform={`translate(${Math.max(x(ends[0]), PAD.left + endW)},${Math.max(y(end) - 18, 12)})`}>
              <rect className="ch-end-pill" x={-endW} y={-11} width={endW} height={22} rx={11} />
              <text className="ch-end" x={-endW / 2} dy="0.34em" textAnchor="middle">{endText}</text>
            </g>
          )}
        </svg>
      )}
      {hover !== null && (
        <div className="ch-tip" style={{ left: Math.min(x(hover) + 12, w - 200), top: PAD.top }}>
          <p className="ch-tip-head">{chart.x.values[hover]}</p>
          {chart.series.map((s, i) => ({ s, i })).sort((a, b) => (b.s.values[hover] ?? -Infinity) - (a.s.values[hover] ?? -Infinity)).map(({ s, i }) => (
            <p key={s.name}><span className="ch-key" style={{ background: lineColor(i) }} />{s.name}<strong>{full(s.values[hover], m)}</strong></p>
          ))}
        </div>
      )}
    </div>
  );
}
